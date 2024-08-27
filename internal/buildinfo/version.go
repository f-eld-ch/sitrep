package buildinfo

import (
	"time"
)

var (
	// Version is baked by go build -ldflags "-X github.com/f-eld-ch/sitrep/internal/buildinfo.Version=$VERSION"
	Version string
	// GitCommit is baked by go build -ldflags "-X github.com/f-eld-ch/sitrep/internal/buildinfo.GitCommit=$GIT_COMMIT"
	GitCommit string
	// BuildTime is baked by go build -ldflags "-X 'github.com/f-eld-ch/sitrep/internal/buildinfo.BuildTime=$(date -Iseconds -u)'"
	BuildTime string
)

type VersionInfo struct {
	Version   string
	GitComit  string
	BuildTime time.Time
}

// GetVersion returns the VersionInfo containing Version, GitCommit and BuildTime
func GetVersion() VersionInfo {
	v := Version
	if v == "" {
		v = "devel"
	}

	c := GitCommit
	if c == "" {
		c = "HEAD"
	}

	t, err := time.Parse(time.RFC3339, BuildTime)
	if err != nil {
		t = time.Now()
	}

	return VersionInfo{Version: v, GitComit: c, BuildTime: t}
}
