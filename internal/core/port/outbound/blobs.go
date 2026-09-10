package outbound

import (
	"context"
	"errors"
	"io"
)

// ErrBlobNotFound is returned by BlobStore.Get when no blob exists for the key.
var ErrBlobNotFound = errors.New("blob not found")

// ErrBlobTooLarge is returned by BlobStore.Put when the incoming stream exceeds
// the declared size hint. The caller should map this to a 413 response.
var ErrBlobTooLarge = errors.New("blob exceeds declared size")

// BlobStore is the driven port for binary blob persistence.
// Implementations must be safe for concurrent use.
//
// Key convention: "incidents/<incidentID>/<attachmentID>" — validated by blobkey.Parse.
// The incidentID prefix enables DeletePrefix to remove all blobs for an incident
// without consulting the read model (which may be unavailable during archive).
type BlobStore interface {
	// Put writes r to the given key, replacing any existing blob.
	// size is advisory; implementations may enforce a cap independently.
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error

	// Get returns a ReadSeekCloser for the blob at key.
	// Returns ErrBlobNotFound when the key does not exist.
	// The caller must Close the returned value.
	Get(ctx context.Context, key string) (io.ReadSeekCloser, error)

	// Delete removes the blob at key. It is idempotent: deleting a
	// non-existent key returns nil.
	Delete(ctx context.Context, key string) error

	// DeletePrefix removes all blobs whose key begins with prefix.
	// prefix must have the form "incidents/<incidentID>/".
	// It is idempotent: an empty or non-existent prefix returns nil.
	DeletePrefix(ctx context.Context, prefix string) error
}
