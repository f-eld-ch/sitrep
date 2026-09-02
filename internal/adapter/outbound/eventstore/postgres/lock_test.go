// Package postgres internal tests for lock helpers — these are in the same
// package to reach unexported functions.
package postgres

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestLockKey pins the FNV-32a output for the default lock name.
//
// STABILITY CONTRACT: two builds that derive different keys for the same
// projection name will both win the election and project concurrently,
// corrupting read models. If you intentionally change the algorithm, update
// this golden value AND increment all handler Version() values so every
// projection is rebuilt on the first leader election after the deploy.
func TestLockKey(t *testing.T) {
	// The string literal is intentional — do NOT replace it with the
	// projection.DefaultLockName constant to avoid an import cycle, and to
	// make any rename immediately visible as a test failure.
	const projectorLockName = "postgres-projector"

	got := lockKey(projectorLockName)

	// Golden value: FNV-32a of "postgres-projector" → 0x56b9782f (1454995503)
	// Recompute with:
	//   python3 -c "
	//     d=b'postgres-projector'; h=2166136261
	//     for b in d: h=(h^b)*16777619&0xFFFFFFFF
	//     import struct; print(hex(struct.unpack('i',struct.pack('I',h))[0]))"
	const want int32 = 0x56b9782f
	assert.Equal(t, want, got,
		"FNV-32a key for %q changed — see stability contract above", projectorLockName)
}

// TestLockClassID pins the class-id constant so a rename or refactor does not
// silently change the lock space used in production.
func TestLockClassID(t *testing.T) {
	assert.Equal(t, int32(0x5352), lockClassID,
		"lockClassID changed — all running instances must be drained before deploying")
}
