//go:build windows

package mbtiles

import "golang.org/x/sys/windows"

// diskFree returns the bytes available to the caller on the volume holding path.
func diskFree(path string) (uint64, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}

	var free uint64
	if err := windows.GetDiskFreeSpaceEx(p, &free, nil, nil); err != nil {
		return 0, err
	}

	return free, nil
}
