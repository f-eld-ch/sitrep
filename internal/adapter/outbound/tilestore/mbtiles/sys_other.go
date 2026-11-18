//go:build !linux

package mbtiles

import "os"

// dropCache is only implemented on Linux.
func dropCache(*os.File, int64, int64) {}
