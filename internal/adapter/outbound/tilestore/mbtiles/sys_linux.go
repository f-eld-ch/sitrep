//go:build linux

package mbtiles

import (
	"os"

	"golang.org/x/sys/unix"
)

// dropCache tells the kernel the written range will not be read again, so a large download
// does not fill the container's page cache (which is charged to its memory limit).
func dropCache(f *os.File, offset, length int64) {
	_ = unix.Fadvise(int(f.Fd()), offset, length, unix.FADV_DONTNEED)
}
