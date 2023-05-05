//go:generate yarn build
package ui

import (
	"embed"
	"io/fs"
	"net/http"

	"github.com/gin-contrib/static"
)

//go:embed all:build
var StaticFiles embed.FS

type embedFileSystem struct {
	http.FileSystem
}

func (e embedFileSystem) Exists(prefix string, path string) bool {
	_, err := e.Open(path)
	if err != nil {
		return false
	}

	return true
}

func EmbedFolder() static.ServeFileSystem {
	fsys, err := fs.Sub(StaticFiles, "build")
	if err != nil {
		panic(err)
	}
	return embedFileSystem{
		FileSystem: http.FS(fsys),
	}
}
