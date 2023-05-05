/*
Copyright © 2023 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"fmt"
	"os"

	"github.com/RedGecko/sitrep/pkg/router"
	"github.com/google/uuid"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// serveCmd represents the serve command
var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start serving requests",
	Long:  `Start serving requests`,
	Run: func(cmd *cobra.Command, args []string) {

		r, err := router.CreateRouter()
		if err != nil {
			fmt.Printf("error: %s\n", err)
			os.Exit(1)
		}

		r.Run(fmt.Sprintf(":%d", viper.GetUint16("port")))
	},
}

func init() {
	rootCmd.AddCommand(serveCmd)

	// Flags
	u, _ := uuid.NewRandom()
	serveCmd.PersistentFlags().StringP("cookie-secret", "c", u.String(), "Secret to encrypt cookie values with")
	viper.BindPFlag("cookieSecret", serveCmd.PersistentFlags().Lookup("cookie-secret"))

	serveCmd.PersistentFlags().Uint16P("port", "p", 8080, "Port to run on")
	viper.BindPFlag("port", serveCmd.PersistentFlags().Lookup("port"))

	serveCmd.PersistentFlags().StringArrayP("trusted-proxies", "t", []string{}, "set the trusted proxies")
	viper.BindPFlag("trustedProxies", serveCmd.PersistentFlags().Lookup("trusted-proxies"))
}
