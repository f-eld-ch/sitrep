//go:generate yarn install
//go:generate yarn build
package ui

import "embed"

//go:embed build
var Assets embed.FS

const (
	Build string = "build/"
)
