// cmd/start.go

package cmd

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/fatih/color"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	psnet "github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var verbose bool
var local bool
var email string

// ========== DATA STRUCTURES ==========

// MetricsPayload is the complete payload sent over the wire
type MetricsPayload struct {
	Timestamp  string            `json:"timestamp"`
	Email      string            `json:"email"`
	AgentName  string            `json:"agent_name"`
	AgentType  string            `json:"agent_type"`
	Metrics    FeatureMetrics    `json:"metrics"`
	NetworkMap NetworkMapPayload `json:"network_map"`
}

// FeatureMetrics contains all 87 core metrics
type FeatureMetrics struct {
	// Process Features
	ProcessCount           int     `json:"process_count"`
	ProcessCreationRate    int     `json:"process_creation_rate"`
	ProcessTermRate        int     `json:"process_termination_rate"`
	HighCPUProcessCount    int     `json:"high_cpu_process_count"`
	HighMemProcessCount    int     `json:"high_mem_process_count"`
	AvgProcessCPU          float64 `json:"avg_process_cpu"`
	AvgProcessMemory       float64 `json:"avg_process_memory"`
	AvgProcessRSS          uint64  `json:"avg_process_rss"`
	AvgProcessVMS          uint64  `json:"avg_process_vms"`
	TotalThreads           int     `json:"total_threads"`
	ZombieProcessCount     int     `json:"zombie_process_count"`
	RootProcessCount       int     `json:"root_process_count"`
	AvgProcessAge          float64 `json:"avg_process_age_seconds"`
	ProcessWithManyThreads int     `json:"process_with_many_threads"`
	SuspiciousProcessNames int     `json:"suspicious_process_names"`
	TotalFileDescriptors   int     `json:"total_file_descriptors"`

	// System Resources
	SystemCPU           float64 `json:"system_cpu"`
	AvgCoreCPU          float64 `json:"avg_core_cpu"`
	SystemMemoryPercent float64 `json:"system_memory_percent"`
	SystemMemoryUsed    uint64  `json:"system_memory_used"`
	SystemMemoryAvail   uint64  `json:"system_memory_available"`
	SystemMemoryTotal   uint64  `json:"system_memory_total"`
	SwapUsedPercent     float64 `json:"swap_used_percent"`
	SwapTotal           uint64  `json:"swap_total"`
	SwapUsed            uint64  `json:"swap_used"`

	// Disk I/O
	DiskReadBytes  uint64  `json:"disk_read_bytes"`
	DiskWriteBytes uint64  `json:"disk_write_bytes"`
	DiskReadRate   float64 `json:"disk_read_rate"`
	DiskWriteRate  float64 `json:"disk_write_rate"`
	DiskReadCount  uint64  `json:"disk_read_count"`
	DiskWriteCount uint64  `json:"disk_write_count"`
	DiskIORate     float64 `json:"disk_io_rate"`

	// User Sessions
	LoggedInUsers  int    `json:"logged_in_users"`
	SystemUptime   uint64 `json:"system_uptime"`
	SystemBootTime uint64 `json:"system_boot_time"`

	// Derived Host
	CPUUsageSpike    float64 `json:"cpu_usage_spike"`
	MemoryUsageSpike float64 `json:"memory_usage_spike"`

	// Connection Statistics
	TotalConnections       int `json:"total_connections"`
	TCPConnections         int `json:"tcp_connections"`
	UDPConnections         int `json:"udp_connections"`
	EstablishedConnections int `json:"established_connections"`
	ListenConnections      int `json:"listen_connections"`
	TimeWaitConnections    int `json:"time_wait_connections"`
	SynSentConnections     int `json:"syn_sent_connections"`
	SynRecvConnections     int `json:"syn_recv_connections"`
	CloseWaitConnections   int `json:"close_wait_connections"`
	FinWaitConnections     int `json:"fin_wait_connections"`

	// Interface Statistics
	NetBytesSent      uint64  `json:"net_bytes_sent"`
	NetBytesRecv      uint64  `json:"net_bytes_recv"`
	NetPacketsSent    uint64  `json:"net_packets_sent"`
	NetPacketsRecv    uint64  `json:"net_packets_recv"`
	NetErrorsIn       uint64  `json:"net_errors_in"`
	NetErrorsOut      uint64  `json:"net_errors_out"`
	NetDropsIn        uint64  `json:"net_drops_in"`
	NetDropsOut       uint64  `json:"net_drops_out"`
	NetSendRate       float64 `json:"net_send_rate"`
	NetRecvRate       float64 `json:"net_recv_rate"`
	NetPacketSendRate float64 `json:"net_packet_send_rate"`
	NetPacketRecvRate float64 `json:"net_packet_recv_rate"`

	// IP Address Features
	UniqueSourceIPs      int    `json:"unique_source_ips"`
	UniqueDestIPs        int    `json:"unique_dest_ips"`
	NewSourceIPs         int    `json:"new_source_ips"`
	PrivateIPConnections int    `json:"private_ip_connections"`
	PublicIPConnections  int    `json:"public_ip_connections"`
	TopSourceIPCount     int    `json:"top_source_ip_count"`
	TopSourceIP          string `json:"top_source_ip"`

	// Port Features
	UniqueLocalPorts    int `json:"unique_local_ports"`
	UniqueRemotePorts   int `json:"unique_remote_ports"`
	WellKnownPortConns  int `json:"well_known_port_connections"`
	EphemeralPortConns  int `json:"ephemeral_port_connections"`
	SuspiciousPortConns int `json:"suspicious_port_connections"`
	PortScanIndicators  int `json:"port_scan_indicators"`

	// Protocol Distribution
	TCPRatio    float64 `json:"tcp_ratio"`
	UDPRatio    float64 `json:"udp_ratio"`
	TCPUDPRatio float64 `json:"tcp_udp_ratio"`

	// Process Network Activity
	ProcessesWithNetActivity int     `json:"processes_with_net_activity"`
	AvgConnectionsPerProcess float64 `json:"avg_connections_per_process"`

	// Traffic Rates
	ConnectionCreationRate    int `json:"connection_creation_rate"`
	ConnectionTerminationRate int `json:"connection_termination_rate"`

	// Geographic/External
	ExternalIPCount      int `json:"external_ip_count"`
	LoopbackConnections  int `json:"loopback_connections"`
	BroadcastConnections int `json:"broadcast_connections"`

	// Derived Network Features
	ConnectionChurnRate   float64 `json:"connection_churn_rate"`
	ConnectionDensity     float64 `json:"connection_density"`
	PortScanningScore     float64 `json:"port_scanning_score"`
	DataExfiltrationScore float64 `json:"data_exfiltration_score"`
	BandwidthAsymmetry    float64 `json:"bandwidth_asymmetry"`
	C2CommunicationScore  float64 `json:"c2_communication_score"`
	FailedConnectionRatio float64 `json:"failed_connection_ratio"`

	// Network Map Summary
	TotalIncomingConnections int `json:"total_incoming_connections"`
	TotalOutgoingConnections int `json:"total_outgoing_connections"`
	UniqueIncomingIPs        int `json:"unique_incoming_ips"`
	UniqueOutgoingIPs        int `json:"unique_outgoing_ips"`
	LocalIPsCount            int `json:"local_ips_count"`
}

// NetworkMapPayload is the network map data sent alongside metrics
type NetworkMapPayload struct {
	Connections []ConnectionDetail `json:"connections"`
	LocalIPs    []string           `json:"local_ips"`
}

// ConnectionDetail for individual connections in the network map
type ConnectionDetail struct {
	RemoteIP     string `json:"remote_ip"`
	RemotePort   uint32 `json:"remote_port"`
	LocalIP      string `json:"local_ip"`
	LocalPort    uint32 `json:"local_port"`
	Protocol     string `json:"protocol"`
	State        string `json:"state"`
	PID          int32  `json:"pid"`
	ProcessName  string `json:"process_name"`
	Direction    string `json:"direction"`
	IsPrivate    bool   `json:"is_private"`
	IsLoopback   bool   `json:"is_loopback"`
	IsSuspicious bool   `json:"is_suspicious"`
}

// ========== COLLECTOR STATE ==========

type CollectorState struct {
	LastPIDs           map[int32]bool
	LastDiskReadBytes  uint64
	LastDiskWriteBytes uint64
	LastCPU            float64
	LastMemory         float64

	LastNetBytesSent   uint64
	LastNetBytesRecv   uint64
	LastNetPacketsSent uint64
	LastNetPacketsRecv uint64
	LastConnections    map[string]bool
	LastSourceIPs      map[string]bool

	ConnectionTimestamps []time.Time

	LastTimestamp time.Time
}

func NewCollectorState() *CollectorState {
	return &CollectorState{
		LastPIDs:             make(map[int32]bool),
		LastConnections:      make(map[string]bool),
		LastSourceIPs:        make(map[string]bool),
		ConnectionTimestamps: make([]time.Time, 0),
		LastTimestamp:        time.Now(),
	}
}

// ========== SUSPICIOUS PORTS & PROCESSES ==========

var suspiciousPorts = map[uint32]bool{
	1337: true, 31337: true,
	4444: true, 5555: true,
	6667: true, 6668: true, 6669: true,
	12345: true, 54321: true,
	1234: true, 9999: true,
	8866: true, 8888: true,
}

var suspiciousProcessPatterns = []string{
	"mimikatz", "psexec", "procdump", "lazagne",
	"nc.exe", "netcat", "powershell", "cmd.exe",
	"wscript", "cscript", "mshta", "rundll32",
	"regsvr32", "certutil", "bitsadmin",
}

// ========== COMMAND ==========

var startCmd = &cobra.Command{
	Use:   "start",
	Short: color.YellowString("Start sending monitoring data to the dealer."),
	Run:   startLogs,
}

func startLogs(cmd *cobra.Command, args []string) {
	// 1. Config loading
	userHomePath, _ := os.UserHomeDir()
	configPath := filepath.Join(userHomePath, ".rihno.yaml")

	v := viper.New()
	v.SetConfigFile(configPath)

	if err := v.ReadInConfig(); err != nil {
		log.Fatalf(color.RedString("Error reading config: %v. Ensure ~/.rihno.yaml exists."), err)
	}

	var rihnoConfig Config
	if err := v.Unmarshal(&rihnoConfig); err != nil {
		log.Fatalf(color.RedString("Failed to parse config: %v"), err)
	}

	// 2. Authentication
	agentVerify, err := VerifyConfig(rihnoConfig)
	if err != nil || !agentVerify {
		log.Fatalf(color.RedString("Agent verification failed. Check your API key and network connection."))
		return
	}

	cfgEmail := v.GetString("userEmail")
	cfgAgentName := v.GetString("agentName")
	cfgAgentType := v.GetString("agentType")

	// 3. Background logic
	if !verbose && os.Getenv("RIHNO_BG") != "true" {
		executable, _ := os.Executable()
		bgCmd := exec.Command(executable, "start")
		if local {
			bgCmd.Args = append(bgCmd.Args, "--local")
		}
		bgCmd.Env = append(os.Environ(), "RIHNO_BG=true")

		if err := bgCmd.Start(); err != nil {
			fmt.Printf(color.RedString("Failed to start background process: %v\n", err))
			return
		}

		fmt.Printf(color.GreenString("RIHNO agent verified.\n"))
		fmt.Printf(color.YellowString("# RIHNO agent running in background (PID: %d)\n", bgCmd.Process.Pid))
		os.Exit(0)
	}

	// 4. Runtime setup
	pid := os.Getpid()
	pidPath := filepath.Join(os.TempDir(), "rihno.pid")
	_ = os.WriteFile(pidPath, []byte(strconv.Itoa(pid)), 0644)

	// Initialize collector state
	state := NewCollectorState()

	// 5. Main loop with reconnection
	serverAddr := "127.0.0.1:8080"
	collectionInterval := 10 * time.Second

	for {
		conn, err := net.DialTimeout("tcp", serverAddr, 5*time.Second)
		if err != nil {
			if verbose {
				log.Printf(color.RedString("Dealer offline. Retrying in 5s..."))
			}
			time.Sleep(5 * time.Second)
			continue
		}

		if verbose {
			log.Printf(color.GreenString("Connected to dealer at %s"), serverAddr)
		}

		for {
			// Collect all metrics
			metrics, networkMap, err := collectAllMetrics(state)
			if err != nil {
				log.Printf(color.RedString("Error collecting metrics: %v"), err)
				time.Sleep(collectionInterval)
				continue
			}

			// Build payload
			payload := MetricsPayload{
				Timestamp:  time.Now().Format(time.RFC3339),
				Email:      cfgEmail,
				AgentName:  cfgAgentName,
				AgentType:  cfgAgentType,
				Metrics:    *metrics,
				NetworkMap: *networkMap,
			}

			// Serialize to JSON
			jsonData, err := json.Marshal(payload)
			if err != nil {
				log.Printf(color.RedString("Error marshaling payload: %v"), err)
				time.Sleep(collectionInterval)
				continue
			}

			// URL-encode the JSON to ensure no raw newlines break the protocol,
			// then send as a single line terminated by \n
			encoded := url.QueryEscape(string(jsonData))

			_, err = fmt.Fprintf(conn, "%s\n", encoded)
			if err != nil {
				log.Println(color.RedString("Connection to dealer lost. Reconnecting..."))
				conn.Close()
				break
			}

			if verbose {
				printMetricsSummary(metrics)
			}

			// Optional local CSV save
			if local {
				saveMetricsLocal(userHomePath, metrics, cfgEmail, cfgAgentName, cfgAgentType)
			}

			time.Sleep(collectionInterval)
		}
	}
}

// ========== METRIC COLLECTION ==========

func collectAllMetrics(state *CollectorState) (*FeatureMetrics, *NetworkMapPayload, error) {
	m := &FeatureMetrics{}
	nm := &NetworkMapPayload{
		Connections: make([]ConnectionDetail, 0),
		LocalIPs:    make([]string, 0),
	}

	now := time.Now()
	timeDelta := now.Sub(state.LastTimestamp).Seconds()
	if timeDelta <= 0 {
		timeDelta = 10
	}

	// ===== PROCESS FEATURES =====
	processes, err := process.Processes()
	if err != nil {
		return nil, nil, fmt.Errorf("error getting processes: %w", err)
	}

	m.ProcessCount = len(processes)
	currentPIDs := make(map[int32]bool)

	var totalCPU, totalMemory float64
	var totalRSS, totalVMS uint64
	var totalAge float64
	var cpuCount, memCount, rssCount, ageCount int

	for _, p := range processes {
		pid := p.Pid
		currentPIDs[pid] = true

		if cpuPercent, err := p.CPUPercent(); err == nil {
			totalCPU += cpuPercent
			cpuCount++
			if cpuPercent > 50.0 {
				m.HighCPUProcessCount++
			}
		}

		if memPercent, err := p.MemoryPercent(); err == nil {
			totalMemory += float64(memPercent)
			memCount++
			if memPercent > 10.0 {
				m.HighMemProcessCount++
			}
		}

		if memInfo, err := p.MemoryInfo(); err == nil {
			totalRSS += memInfo.RSS
			totalVMS += memInfo.VMS
			rssCount++
		}

		if numThreads, err := p.NumThreads(); err == nil {
			m.TotalThreads += int(numThreads)
			if numThreads > 100 {
				m.ProcessWithManyThreads++
			}
		}

		if status, err := p.Status(); err == nil && len(status) > 0 {
			if status[0] == "zombie" || status[0] == "Z" {
				m.ZombieProcessCount++
			}
		}

		if username, err := p.Username(); err == nil {
			if username == "root" || username == "SYSTEM" || username == "NT AUTHORITY\\SYSTEM" {
				m.RootProcessCount++
			}
		}

		if createTime, err := p.CreateTime(); err == nil {
			age := float64(now.Unix()) - float64(createTime/1000)
			totalAge += age
			ageCount++
		}

		if name, err := p.Name(); err == nil {
			nameLower := strings.ToLower(name)
			for _, pattern := range suspiciousProcessPatterns {
				if strings.Contains(nameLower, pattern) {
					m.SuspiciousProcessNames++
					break
				}
			}
		}

		if numFDs, err := p.NumFDs(); err == nil {
			m.TotalFileDescriptors += int(numFDs)
		}
	}

	if cpuCount > 0 {
		m.AvgProcessCPU = totalCPU / float64(cpuCount)
	}
	if memCount > 0 {
		m.AvgProcessMemory = totalMemory / float64(memCount)
	}
	if rssCount > 0 {
		m.AvgProcessRSS = totalRSS / uint64(rssCount)
		m.AvgProcessVMS = totalVMS / uint64(rssCount)
	}
	if ageCount > 0 {
		m.AvgProcessAge = totalAge / float64(ageCount)
	}

	// Process creation/termination rates
	for pid := range currentPIDs {
		if !state.LastPIDs[pid] {
			m.ProcessCreationRate++
		}
	}
	for pid := range state.LastPIDs {
		if !currentPIDs[pid] {
			m.ProcessTermRate++
		}
	}
	state.LastPIDs = currentPIDs

	// ===== SYSTEM CPU =====
	if cpuPercent, err := cpu.Percent(time.Second, false); err == nil && len(cpuPercent) > 0 {
		m.SystemCPU = cpuPercent[0]
	}
	if perCore, err := cpu.Percent(time.Second, true); err == nil && len(perCore) > 0 {
		var sum float64
		for _, c := range perCore {
			sum += c
		}
		m.AvgCoreCPU = sum / float64(len(perCore))
	}

	// ===== MEMORY =====
	if memInfo, err := mem.VirtualMemory(); err == nil {
		m.SystemMemoryPercent = memInfo.UsedPercent
		m.SystemMemoryUsed = memInfo.Used
		m.SystemMemoryAvail = memInfo.Available
		m.SystemMemoryTotal = memInfo.Total
	}
	if swapInfo, err := mem.SwapMemory(); err == nil {
		m.SwapUsedPercent = swapInfo.UsedPercent
		m.SwapTotal = swapInfo.Total
		m.SwapUsed = swapInfo.Used
	}

	// ===== DISK I/O =====
	if diskIO, err := disk.IOCounters(); err == nil {
		var readB, writeB, readC, writeC uint64
		for _, io := range diskIO {
			readB += io.ReadBytes
			writeB += io.WriteBytes
			readC += io.ReadCount
			writeC += io.WriteCount
		}
		m.DiskReadBytes = readB
		m.DiskWriteBytes = writeB
		m.DiskReadCount = readC
		m.DiskWriteCount = writeC

		if state.LastDiskReadBytes > 0 {
			m.DiskReadRate = float64(readB-state.LastDiskReadBytes) / timeDelta
		}
		if state.LastDiskWriteBytes > 0 {
			m.DiskWriteRate = float64(writeB-state.LastDiskWriteBytes) / timeDelta
		}
		m.DiskIORate = m.DiskReadRate + m.DiskWriteRate

		state.LastDiskReadBytes = readB
		state.LastDiskWriteBytes = writeB
	}

	// ===== USER SESSIONS =====
	if users, err := host.Users(); err == nil {
		m.LoggedInUsers = len(users)
	}
	if uptime, err := host.Uptime(); err == nil {
		m.SystemUptime = uptime
	}
	if bootTime, err := host.BootTime(); err == nil {
		m.SystemBootTime = bootTime
	}

	// ===== DERIVED HOST FEATURES =====
	m.CPUUsageSpike = m.SystemCPU - state.LastCPU
	m.MemoryUsageSpike = m.SystemMemoryPercent - state.LastMemory

	// ===== NETWORK FEATURES =====
	if netIO, err := psnet.IOCounters(false); err == nil && len(netIO) > 0 {
		m.NetBytesSent = netIO[0].BytesSent
		m.NetBytesRecv = netIO[0].BytesRecv
		m.NetPacketsSent = netIO[0].PacketsSent
		m.NetPacketsRecv = netIO[0].PacketsRecv
		m.NetErrorsIn = netIO[0].Errin
		m.NetErrorsOut = netIO[0].Errout
		m.NetDropsIn = netIO[0].Dropin
		m.NetDropsOut = netIO[0].Dropout

		if state.LastNetBytesSent > 0 {
			m.NetSendRate = float64(netIO[0].BytesSent-state.LastNetBytesSent) / timeDelta
		}
		if state.LastNetBytesRecv > 0 {
			m.NetRecvRate = float64(netIO[0].BytesRecv-state.LastNetBytesRecv) / timeDelta
		}
		if state.LastNetPacketsSent > 0 {
			m.NetPacketSendRate = float64(netIO[0].PacketsSent-state.LastNetPacketsSent) / timeDelta
		}
		if state.LastNetPacketsRecv > 0 {
			m.NetPacketRecvRate = float64(netIO[0].PacketsRecv-state.LastNetPacketsRecv) / timeDelta
		}

		state.LastNetBytesSent = netIO[0].BytesSent
		state.LastNetBytesRecv = netIO[0].BytesRecv
		state.LastNetPacketsSent = netIO[0].PacketsSent
		state.LastNetPacketsRecv = netIO[0].PacketsRecv
	}

	// ===== CONNECTION ANALYSIS =====
	connections, err := psnet.Connections("all")
	if err != nil {
		return nil, nil, fmt.Errorf("error getting connections: %w", err)
	}

	m.TotalConnections = len(connections)

	sourceIPs := make(map[string]bool)
	destIPs := make(map[string]bool)
	localPorts := make(map[uint32]bool)
	remotePorts := make(map[uint32]bool)
	currentConns := make(map[string]bool)
	currentSourceIPs := make(map[string]bool)
	portsPerIP := make(map[string]map[uint32]bool)
	connPerSourceIP := make(map[string]int)
	processConns := make(map[int32]int)
	localIPSet := make(map[string]bool)
	failedConns := 0

	for _, conn := range connections {
		// States
		switch conn.Status {
		case "ESTABLISHED":
			m.EstablishedConnections++
		case "LISTEN":
			m.ListenConnections++
		case "TIME_WAIT":
			m.TimeWaitConnections++
			failedConns++
		case "SYN_SENT":
			m.SynSentConnections++
		case "SYN_RECV":
			m.SynRecvConnections++
		case "CLOSE_WAIT":
			m.CloseWaitConnections++
		case "FIN_WAIT1", "FIN_WAIT2":
			m.FinWaitConnections++
		}

		// Protocol
		switch conn.Type {
		case 1:
			m.TCPConnections++
		case 2:
			m.UDPConnections++
		}

		// Track local IPs
		if conn.Laddr.IP != "" {
			localIPSet[conn.Laddr.IP] = true
			destIPs[conn.Laddr.IP] = true
		}

		// Remote IP analysis
		if conn.Raddr.IP != "" {
			sourceIPs[conn.Raddr.IP] = true
			currentSourceIPs[conn.Raddr.IP] = true
			connPerSourceIP[conn.Raddr.IP]++

			if portsPerIP[conn.Raddr.IP] == nil {
				portsPerIP[conn.Raddr.IP] = make(map[uint32]bool)
			}
			portsPerIP[conn.Raddr.IP][conn.Laddr.Port] = true

			if isPrivateIP(conn.Raddr.IP) {
				m.PrivateIPConnections++
			} else {
				m.PublicIPConnections++
				m.ExternalIPCount++
			}
			if isLoopback(conn.Raddr.IP) {
				m.LoopbackConnections++
			}
			if isBroadcast(conn.Raddr.IP) {
				m.BroadcastConnections++
			}
		}

		// Port tracking
		if conn.Laddr.Port > 0 {
			localPorts[conn.Laddr.Port] = true
			if conn.Laddr.Port < 1024 {
				m.WellKnownPortConns++
			} else if conn.Laddr.Port > 32768 {
				m.EphemeralPortConns++
			}
		}
		if conn.Raddr.Port > 0 {
			remotePorts[conn.Raddr.Port] = true
			if suspiciousPorts[conn.Raddr.Port] || suspiciousPorts[conn.Laddr.Port] {
				m.SuspiciousPortConns++
			}
		}

		connKey := fmt.Sprintf("%s:%d-%s:%d-%s",
			conn.Laddr.IP, conn.Laddr.Port,
			conn.Raddr.IP, conn.Raddr.Port,
			conn.Status)
		currentConns[connKey] = true

		if conn.Pid > 0 {
			processConns[conn.Pid]++
		}

		// Build network map connection details (IPv4 only with remote address)
		if conn.Raddr.IP != "" && isIPv4(conn.Raddr.IP) {
			processName := ""
			if conn.Pid > 0 {
				if p, err := process.NewProcess(conn.Pid); err == nil {
					processName, _ = p.Name()
				}
			}

			isSusp := suspiciousPorts[conn.Laddr.Port] || suspiciousPorts[conn.Raddr.Port]

			detail := ConnectionDetail{
				RemoteIP:     conn.Raddr.IP,
				RemotePort:   conn.Raddr.Port,
				LocalIP:      conn.Laddr.IP,
				LocalPort:    conn.Laddr.Port,
				Protocol:     getProtocolStr(conn.Type),
				State:        conn.Status,
				PID:          conn.Pid,
				ProcessName:  processName,
				Direction:    determineConnDirection(conn),
				IsPrivate:    isPrivateIP(conn.Raddr.IP),
				IsLoopback:   isLoopback(conn.Raddr.IP),
				IsSuspicious: isSusp,
			}
			nm.Connections = append(nm.Connections, detail)

			if detail.Direction == "incoming" {
				m.TotalIncomingConnections++
			} else {
				m.TotalOutgoingConnections++
			}
		}
	}

	m.UniqueSourceIPs = len(sourceIPs)
	m.UniqueDestIPs = len(destIPs)
	m.UniqueLocalPorts = len(localPorts)
	m.UniqueRemotePorts = len(remotePorts)

	// New source IPs
	for ip := range currentSourceIPs {
		if !state.LastSourceIPs[ip] {
			m.NewSourceIPs++
		}
	}
	state.LastSourceIPs = currentSourceIPs

	// Top source IP
	maxC := 0
	for ip, c := range connPerSourceIP {
		if c > maxC {
			maxC = c
			m.TopSourceIP = ip
		}
	}
	m.TopSourceIPCount = maxC

	// Port scan indicators
	for _, ports := range portsPerIP {
		if len(ports) > 10 {
			m.PortScanIndicators++
		}
	}

	// Ratios
	if m.TotalConnections > 0 {
		m.TCPRatio = float64(m.TCPConnections) / float64(m.TotalConnections)
		m.UDPRatio = float64(m.UDPConnections) / float64(m.TotalConnections)
		m.FailedConnectionRatio = float64(failedConns) / float64(m.TotalConnections)
	}
	if m.UDPConnections > 0 {
		m.TCPUDPRatio = float64(m.TCPConnections) / float64(m.UDPConnections)
	}

	m.ProcessesWithNetActivity = len(processConns)
	if m.ProcessesWithNetActivity > 0 {
		m.AvgConnectionsPerProcess = float64(m.TotalConnections) / float64(m.ProcessesWithNetActivity)
	}

	// Connection churn
	newConns := 0
	for c := range currentConns {
		if !state.LastConnections[c] {
			newConns++
			state.ConnectionTimestamps = append(state.ConnectionTimestamps, now)
		}
	}
	closedConns := 0
	for c := range state.LastConnections {
		if !currentConns[c] {
			closedConns++
		}
	}
	m.ConnectionCreationRate = newConns
	m.ConnectionTerminationRate = closedConns
	state.LastConnections = currentConns

	// Unique incoming/outgoing IPs for network map summary
	incomingIPs := make(map[string]bool)
	outgoingIPs := make(map[string]bool)
	for _, c := range nm.Connections {
		if c.Direction == "incoming" {
			incomingIPs[c.RemoteIP] = true
		} else {
			outgoingIPs[c.RemoteIP] = true
		}
	}
	m.UniqueIncomingIPs = len(incomingIPs)
	m.UniqueOutgoingIPs = len(outgoingIPs)

	// Local IPs
	for ip := range localIPSet {
		nm.LocalIPs = append(nm.LocalIPs, ip)
	}
	m.LocalIPsCount = len(nm.LocalIPs)

	// ===== DERIVED NETWORK FEATURES =====
	if m.TotalConnections > 0 {
		m.ConnectionChurnRate = float64(m.ConnectionCreationRate+m.ConnectionTerminationRate) /
			float64(m.TotalConnections)
	}
	if m.ProcessesWithNetActivity > 0 {
		m.ConnectionDensity = float64(m.TotalConnections) / float64(m.ProcessesWithNetActivity)
	}

	m.PortScanningScore = float64(m.PortScanIndicators) * 10.0
	if m.SynSentConnections > 50 {
		m.PortScanningScore += float64(m.SynSentConnections) / 10.0
	}

	if m.NetRecvRate > 0 {
		outRatio := m.NetSendRate / (m.NetSendRate + m.NetRecvRate)
		if outRatio > 0.8 && m.NetSendRate > 1024*1024 {
			m.DataExfiltrationScore = outRatio * 100.0
		}
	}

	totalBW := m.NetSendRate + m.NetRecvRate
	if totalBW > 0 {
		diff := m.NetSendRate - m.NetRecvRate
		if diff < 0 {
			diff = -diff
		}
		m.BandwidthAsymmetry = diff / totalBW
	}

	// C2 detection
	if len(state.ConnectionTimestamps) > 100 {
		state.ConnectionTimestamps = state.ConnectionTimestamps[len(state.ConnectionTimestamps)-100:]
	}
	if len(state.ConnectionTimestamps) >= 5 {
		intervals := make([]float64, 0, len(state.ConnectionTimestamps)-1)
		for i := 1; i < len(state.ConnectionTimestamps); i++ {
			intervals = append(intervals,
				state.ConnectionTimestamps[i].Sub(state.ConnectionTimestamps[i-1]).Seconds())
		}
		if len(intervals) > 0 {
			var sum float64
			for _, iv := range intervals {
				sum += iv
			}
			mean := sum / float64(len(intervals))
			var variance float64
			for _, iv := range intervals {
				variance += (iv - mean) * (iv - mean)
			}
			variance /= float64(len(intervals))
			if mean > 0 && variance/mean < 0.1 {
				m.C2CommunicationScore = 100.0 * (1.0 - variance/mean)
			}
		}
	}

	// Update state
	state.LastTimestamp = now
	state.LastCPU = m.SystemCPU
	state.LastMemory = m.SystemMemoryPercent

	return m, nm, nil
}

// ========== HELPERS ==========

func getProtocolStr(t uint32) string {
	switch t {
	case 1:
		return "TCP"
	case 2:
		return "UDP"
	default:
		return fmt.Sprintf("UNKNOWN(%d)", t)
	}
}

func determineConnDirection(conn psnet.ConnectionStat) string {
	if conn.Status == "LISTEN" {
		return "incoming"
	}
	if conn.Status == "SYN_SENT" {
		return "outgoing"
	}
	if conn.Status == "SYN_RECV" {
		return "incoming"
	}
	if conn.Status == "ESTABLISHED" {
		if conn.Laddr.Port < 1024 {
			return "incoming"
		} else if conn.Raddr.Port < 1024 {
			return "outgoing"
		} else if conn.Laddr.Port > 32768 {
			return "outgoing"
		}
		return "incoming"
	}
	return "outgoing"
}

func isPrivateIP(ip string) bool {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	privateRanges := []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"}
	for _, cidr := range privateRanges {
		_, subnet, _ := net.ParseCIDR(cidr)
		if subnet.Contains(parsed) {
			return true
		}
	}
	return false
}

func isLoopback(ip string) bool {
	return strings.HasPrefix(ip, "127.") || ip == "::1"
}

func isBroadcast(ip string) bool {
	return ip == "255.255.255.255"
}

func isIPv4(ip string) bool {
	parsed := net.ParseIP(ip)
	return parsed != nil && parsed.To4() != nil
}

func printMetricsSummary(m *FeatureMetrics) {
	ts := time.Now().Format("15:04:05")
	fmt.Printf("[%s] %s CPU: %.1f%% | Mem: %.1f%% | Procs: %d | Conns: %d (TCP:%d UDP:%d) | Suspicious: ports=%d procs=%d\n",
		ts, color.BlueString("LOG"),
		m.SystemCPU, m.SystemMemoryPercent, m.ProcessCount,
		m.TotalConnections, m.TCPConnections, m.UDPConnections,
		m.SuspiciousPortConns, m.SuspiciousProcessNames)
}

func saveMetricsLocal(homeDir string, m *FeatureMetrics, email, agentName, agentType string) {
	csvPath := filepath.Join(homeDir, "rihno_metrics.csv")
	f, err := os.OpenFile(csvPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf(color.RedString("CSV Error: %v"), err)
		return
	}
	defer f.Close()

	row := fmt.Sprintf("%s,%s,%s,%s,%.2f,%.2f,%d,%d,%d,%d,%d,%d,%.2f,%.2f,%.2f\n",
		time.Now().Format(time.RFC3339),
		email, agentName, agentType,
		m.SystemCPU, m.SystemMemoryPercent,
		m.ProcessCount, m.TotalConnections,
		m.TCPConnections, m.UDPConnections,
		m.SuspiciousPortConns, m.SuspiciousProcessNames,
		m.PortScanningScore, m.DataExfiltrationScore, m.C2CommunicationScore)

	f.WriteString(row)
}

func init() {
	rootCmd.AddCommand(startCmd)
	startCmd.Flags().BoolVar(&verbose, "verbose", false, "Run in foreground and print logs")
	startCmd.Flags().BoolVarP(&local, "local", "l", false, "Save metrics to CSV locally")
}
