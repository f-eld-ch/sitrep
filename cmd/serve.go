/*
Copyright © 2023 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"os"

	"log/slog"

	http_adapter "github.com/f-eld-ch/sitrep/internal/adapters/http"
	"github.com/f-eld-ch/sitrep/internal/adapters/otel"
	"github.com/f-eld-ch/sitrep/internal/application"
	"github.com/f-eld-ch/sitrep/internal/logger"
	"github.com/f-eld-ch/sitrep/pkg/http/router"
	"github.com/google/uuid"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

func init() {
	rootCmd.AddCommand(serveCmd)

	// Flags
	u, _ := uuid.NewRandom()
	serveCmd.PersistentFlags().StringP("cookie-secret", "s", u.String(), "Secret to encrypt cookie values with")
	serveCmd.PersistentFlags().Uint16P("port", "p", 9090, "http port to run on")
	serveCmd.PersistentFlags().StringP("tls-key", "k", "key.pem", "x509 certificate to use for servers")
	serveCmd.PersistentFlags().StringP("tls-cert", "t", "cert.pem", "x509 certificate to use for servers")
}

// serveCmd represents the serve command
var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start serving requests",
	Long:  `Start serving requests`,
	Run: func(cmd *cobra.Command, args []string) {
		logger.Info(cmd.Context(), "starting sitrep application")
		r, err := router.CreateRouter()
		if err != nil {
			fmt.Printf("error: %s\n", err)
			os.Exit(1)
		}

		httpPort := viper.GetUint16("port")
		tlsConfig, err := getTLSConfig(cmd)
		if err != nil {
			logger.Critical(cmd.Context(), "cannot create TLS configuration", slog.String("error", err.Error()))
			os.Exit(1)
		}

		otelAdapter := otel.NewAdapter()

		app := application.New()
		app.AddAdapters(
			http_adapter.NewAdapter(
				&http.Server{
					Addr:      fmt.Sprintf(":%d", httpPort),
					Handler:   r,
					TLSConfig: tlsConfig,
				},
			),
			otelAdapter,
		)

		app.Run(cmd.Context())
	},
}

func getTLSConfig(cmd *cobra.Command) (*tls.Config, error) {

	cert := viper.GetString("tlsCert")
	key := viper.GetString("tlsKey")

	serverTLSCert, err := tls.LoadX509KeyPair(cert, key)
	if err != nil {
		logger.Critical(cmd.Context(), "Error loading certificate and key file", slog.String("cert", cert), slog.String("key", key), slog.String("error", err.Error()))
		return nil, err
	}

	tlsConfig := &tls.Config{
		Certificates:             []tls.Certificate{serverTLSCert},
		PreferServerCipherSuites: true,
	}

	return tlsConfig, nil
}
