package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
)

// --- Data Structures ---

type Connection struct {
	RemoteIP string `json:"remote_ip"`
}

type NetworkMap struct {
	Connections []Connection `json:"connections"`
}

type KafkaMessage struct {
	Email      string     `json:"email"`
	AgentName  string     `json:"agent_name"`
	NetworkMap NetworkMap `json:"network_map"`
}

type ScanResult struct {
	Email        string   `json:"email"`
	AgentName    string   `json:"agent_name"`
	ThreatsFound []string `json:"threats_found"`
	SafeIPs      []string `json:"safe_ips"`
	ThreatCount  int      `json:"threat_count"`
}

type APIResponse struct {
	Status               string       `json:"status"`
	TotalRecordsInMemory int          `json:"total_records_in_memory"`
	TotalThreatIPsFound  int          `json:"total_threat_ips_found"`
	Data                 []ScanResult `json:"data"`
}

// --- Global State ---

var (
	maliciousIPs    = make(map[string]struct{})
	processedAlerts []ScanResult
	mu              sync.RWMutex
)

// --- Threat Feed ---

func loadThreatFeed() {
	const url = "https://lists.blocklist.de/lists/all.txt"
	fmt.Println("Downloading latest threat feed... (this takes a few seconds)")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		fmt.Printf("Error downloading list: %v\n", err)
		return
	}
	defer resp.Body.Close()

	count := 0
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			maliciousIPs[line] = struct{}{}
			count++
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Printf("Error reading threat feed: %v\n", err)
		return
	}
	fmt.Printf("Successfully loaded %d malicious IPs into memory.\n\n", count)
}

// --- Kafka Consumer ---

func processMessage(data []byte) {
	var msg KafkaMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		fmt.Printf("Error parsing message: %v\n", err)
		return
	}

	result := ScanResult{
		Email:        msg.Email,
		AgentName:    msg.AgentName,
		ThreatsFound: []string{},
		SafeIPs:      []string{},
	}

	for _, conn := range msg.NetworkMap.Connections {
		if _, bad := maliciousIPs[conn.RemoteIP]; bad {
			result.ThreatsFound = append(result.ThreatsFound, conn.RemoteIP)
			fmt.Printf("ALERT: %s is a known malicious IP!\n", conn.RemoteIP)
		} else {
			result.SafeIPs = append(result.SafeIPs, conn.RemoteIP)
		}
	}
	result.ThreatCount = len(result.ThreatsFound)

	mu.Lock()
	defer mu.Unlock()

	existingIndex := -1
	for i, alert := range processedAlerts {
		if alert.Email == msg.Email && alert.AgentName == msg.AgentName {
			existingIndex = i
			break
		}
	}

	if existingIndex >= 0 {
		processedAlerts[existingIndex] = result
		fmt.Printf("UPDATED existing record for %s / %s\n", msg.Email, msg.AgentName)
	} else {
		processedAlerts = append(processedAlerts, result)
		fmt.Printf("ADDED new record for %s / %s\n", msg.Email, msg.AgentName)
		if len(processedAlerts) > 100 {
			processedAlerts = processedAlerts[1:]
		}
	}
}

// brokerDialer rewrites any localhost/127.0.0.1 address that Kafka advertises
// in its metadata back to the real broker address. This is needed when the
// Kafka broker advertises localhost:9092 internally but lives in a separate
// Docker container reachable only by its container name on the shared network.
func brokerDialer(kafkaBroker string) *kafka.Dialer {
	return &kafka.Dialer{
		Timeout:   10 * time.Second,
		DualStack: true,
		DialFunc: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err == nil && (host == "localhost" || host == "127.0.0.1") {
				_, brokerPort, _ := net.SplitHostPort(kafkaBroker)
				if port == brokerPort {
					addr = kafkaBroker
				}
			}
			var d net.Dialer
			return d.DialContext(ctx, network, addr)
		},
	}
}

func runKafkaConsumer() {
	kafkaBroker := os.Getenv("KAFKA_BROKER")
	if kafkaBroker == "" {
		kafkaBroker = "my_rihno_kafka:9092"
	}

	dialer := brokerDialer(kafkaBroker)

	retries := 10
	for retries > 0 {
		fmt.Println("Attempting to connect to Kafka...")
		conn, err := dialer.DialContext(context.Background(), "tcp", kafkaBroker)
		if err == nil {
			conn.Close()
			fmt.Println("Successfully connected to Kafka!")
			break
		}
		retries--
		fmt.Printf("Kafka not ready. Retrying in 5 seconds... (%d attempts left)\n", retries)
		time.Sleep(5 * time.Second)
	}

	if retries == 0 {
		fmt.Println("Failed to connect to Kafka. Exiting goroutine.")
		return
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     []string{kafkaBroker},
		Topic:       "rihno-metrics",
		GroupID:     "ip_id_consumer",
		StartOffset: kafka.FirstOffset,
		MinBytes:    10e3,
		MaxBytes:    10e6,
		Dialer:      dialer,
	})
	defer reader.Close()

	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil {
			fmt.Printf("Error reading Kafka message: %v\n", err)
			return
		}
		processMessage(msg.Value)
	}
}

// --- HTTP Server ---

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func getScans(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()

	totalThreats := 0
	for _, scan := range processedAlerts {
		totalThreats += scan.ThreatCount
	}

	resp := APIResponse{
		Status:               "success",
		TotalRecordsInMemory: len(processedAlerts),
		TotalThreatIPsFound:  totalThreats,
		Data:                 processedAlerts,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// --- Entry Point ---

func main() {
	loadThreatFeed()

	go runKafkaConsumer()

	http.HandleFunc("/api/scans", corsMiddleware(getScans))

	fmt.Println("Starting API server on http://0.0.0.0:8888")
	log.Fatal(http.ListenAndServe(":8888", nil))
}
