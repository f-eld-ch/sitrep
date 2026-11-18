//go:build !windows

package mbtiles

import "golang.org/x/sys/unix"

// diskFree returns the bytes available to unprivileged users on the volume holding path.
func diskFree(path string) (uint64, error) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, err
	}

	//nolint:gosec // Bsize is positive
	return st.Bavail * uint64(st.Bsize), nil
}
