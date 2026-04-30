package cmd

import (
	"fmt"
	"os"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	// High-contrast Cyan for the brand name
	c = color.New(color.FgCyan).Add(color.Bold).SprintFunc()
	// Bold White for the icon
	w = color.New(color.FgWhite).Add(color.Bold).SprintFunc()
	// Dim for the description
	d = color.New(color.Faint).SprintFunc()
)

var rhinoIcon = w(`
           ███████    █████████
          ████████████████████████
         ██████████████████████████
        ███████████████████████████
       █████████████████████████████
       █████████████████████████████
     ████████████████████████████████
     ████████████████████████████████
     ████████████████████████████████
     ████████████████████████████████
     ████████████████████████████████
██ ███████████████████████████████████
██████████████████████████████████████
████████████████████████████  ███████
 ███████████  ████████        ███████
  ██████████  ████████        ███████
    ███████  █████████        ██████
     █████   █████████       ███████`)

// Updated ASCII Text to spell RIHNO
var rihnoText = c(`
 ██████╗ ██╗██╗  ██╗███╗   ██╗ ██████╗ 
 ██╔══██╗██║██║  ██║████╗  ██║██╔═══██╗
 ██████╔╝██║███████║██╔██╗ ██║██║   ██║
 ██╔══██╗██║██╔══██║██║╚██╗██║██║   ██║
 ██║  ██║██║██║  ██║██║ ╚████║╚██████╔╝
 ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ `)

// Version RIHNO CLI
const Version = "0.1.0"

var rootCmd = &cobra.Command{
	Use:     "rihno",
	Short:   color.YellowString("AI-Powered Intrusion Detection System"),
	Version: Version,
	Long: fmt.Sprintf(`
%s
%s

%s
`, rhinoIcon, rihnoText, d("RIHNO is an advanced IDS using AI decision engines to secure your infrastructure.")),
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func init() {
	// version flag
	rootCmd.Flags().BoolP("version", "v", false, "Print RIHNO version")
}
