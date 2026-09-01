package main

import "github.com/f-eld-ch/sitrep/internal/cli"

// Build identity — set at link time via -ldflags (see .ko.yaml).
// Defaults apply to local `go build` / `go run`.
var (
	version = "dev"
	sha     = "dev"
)

func main() {
	cli.SetBuildInfo(version, sha)
	cli.Execute()
}
