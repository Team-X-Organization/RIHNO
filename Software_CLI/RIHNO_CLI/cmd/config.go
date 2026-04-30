package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// Flags variables
var (
	userEmail string
	agentName string
	agentType string
	apiKey    string
)

// Config struct matching your YAML structure
type Config struct {
	UserEmail string `mapstructure:"userEmail"`
	AgentName string `mapstructure:"agentName"`
	AgentType string `mapstructure:"agentType"`
	ApiKey    string `mapstructure:"apiKey"`
}

var configCmd = &cobra.Command{
	Use:   "config",
	Short: color.YellowString("Initialize RIHNO and connect to the dashboard"),
	Long: color.CyanString(`
-------------------------------------------------------------------------------------
   Configure your RIHNO application and connect it with the RIHNO dashboard. 
-------------------------------------------------------------------------------------
`),
	Example: color.BlueString(`rihno config --email example@xyz.com --agent_name "Agent 01" --agent_type "CloudVM" --api_key exampleApiKey`),
	Run:     configUser,
}

var getstatusCmd = &cobra.Command{
	Use:   "getstatus",
	Short: color.YellowString("Check the authentication status of RIHNO agent"),
	Run: func(cmd *cobra.Command, args []string) {
		userHomePath, _ := os.UserHomeDir()
		configPath := filepath.Join(userHomePath, ".rihno.yaml")

		if _, err := os.Stat(configPath); os.IsNotExist(err) {
			fmt.Println(color.RedString("RIHNO agent is not configured."), color.YellowString("Please run: rihno config --email ..."))
			return
		}

		v := viper.New()
		v.SetConfigFile(configPath)
		if err := v.ReadInConfig(); err != nil {
			log.Fatalf("Error reading config file: %v", err)
		}

		isAuthenticated := v.GetBool("authenticated")
		email := v.GetString("userEmail")

		if isAuthenticated {
			fmt.Printf("%s: User is authenticated as %s\n", color.GreenString("Status"), color.CyanString(email))
		} else {
			fmt.Printf("%s: User is %s. Please re-run config.\n", color.YellowString("Status"), color.RedString("NOT authenticated"))
		}
	},
}

func init() {
	rootCmd.AddCommand(configCmd)
	configCmd.AddCommand(getstatusCmd)

	configCmd.Flags().StringVar(&userEmail, "email", "", "User email")
	configCmd.Flags().StringVar(&agentName, "agent_name", "", "Agent name")
	configCmd.Flags().StringVar(&agentType, "agent_type", "", "Agent type (CloudVM/Local/IOT/Container)")
	configCmd.Flags().StringVar(&apiKey, "api_key", "", "API Key")

	_ = configCmd.MarkFlagRequired("email")
	_ = configCmd.MarkFlagRequired("agent_name")
	_ = configCmd.MarkFlagRequired("agent_type")
	_ = configCmd.MarkFlagRequired("api_key")
}

func configUser(cmd *cobra.Command, args []string) {
	formattedAgentType := agentType
	switch strings.ToLower(agentType) {
	case "cloudvm":
		formattedAgentType = "CloudVM"
	case "local", "localmachine":
		formattedAgentType = "Local Machine"
	case "iot":
		formattedAgentType = "IOT Honeypot"
	case "container":
		formattedAgentType = "Container"
	}

	rihnoConfig := Config{
		UserEmail: userEmail,
		AgentName: agentName,
		AgentType: formattedAgentType,
		ApiKey:    apiKey,
	}

	userHomePath, err := os.UserHomeDir()
	if err != nil {
		log.Fatalf(color.RedString("Failed to get user home directory: %v", err))
	}
	configPath := filepath.Join(userHomePath, ".rihno.yaml")

	saveConfig, err := VerifyConfig(rihnoConfig)
	if err != nil {
		log.Fatalf("Verification failed: %v", err)
	}

	if saveConfig {
		v := viper.New()
		v.SetConfigFile(configPath)
		v.Set("userEmail", rihnoConfig.UserEmail)
		v.Set("agentName", rihnoConfig.AgentName)
		v.Set("agentType", rihnoConfig.AgentType)
		v.Set("apiKey", rihnoConfig.ApiKey)
		v.Set("authenticated", true)

		// 1. Write the file
		err = v.WriteConfigAs(configPath)
		if err != nil {
			err = v.WriteConfig()
		}
		if err != nil {
			log.Fatalf("Error writing config file: %v", err)
		}

		// 2. APPLY PERMISSIONS HERE
		// 0644 allows the owner to read/write, and any background process/other users to READ.
		err = os.Chmod(configPath, 0644)
		if err != nil {
			log.Printf(color.YellowString("Warning: Could not set file permissions: %v"), err)
		}

		log.Println(color.GreenString("Successfully configured your RIHNO application."))
		fmt.Printf("Email: %s | Agent: %s\n", rihnoConfig.UserEmail, rihnoConfig.AgentName)
	} else {
		log.Println(color.RedString("Configuration failed: Invalid credentials or unauthorized agent."))
	}
}

func VerifyConfig(rihnoConfig Config) (bool, error) {
	//v := viper.New()
	//v.SetConfigFile(".env")
	//v.SetConfigType("env")
	//
	//// If .env is missing, we use a default or log it
	//if err := v.ReadInConfig(); err != nil {
	//	return false, fmt.Errorf("could not read .env file. Ensure it is in the current directory: %w", err)
	//}

	//baseURL := v.GetString("RPI_API")
	baseURL := "http://localhost:5050/api/cli_auth"
	//if baseURL == "" {
	//	return false, fmt.Errorf("API base URL (RPI_API) is not set in .env")
	//}

	u, err := url.Parse(baseURL)
	if err != nil {
		return false, fmt.Errorf("invalid API URL format: %w", err)
	}

	params := url.Values{}
	params.Add("email", rihnoConfig.UserEmail)
	params.Add("device_name", rihnoConfig.AgentName)
	params.Add("device_type", rihnoConfig.AgentType)
	params.Add("api_key", rihnoConfig.ApiKey)
	u.RawQuery = params.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return false, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, fmt.Errorf("failed to read response: %w", err)
	}

	type AuthResponse struct {
		Result string `json:"result"`
	}

	var authResponse AuthResponse
	if err := json.Unmarshal(body, &authResponse); err != nil {
		return false, fmt.Errorf("failed to parse response JSON: %w", err)
	}

	if strings.EqualFold(strings.TrimSpace(authResponse.Result), "OK CLI authenticated") {
		return true, nil
	}

	fmt.Println("Server Response:", authResponse.Result)
	return false, nil
}
