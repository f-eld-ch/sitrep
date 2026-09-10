// Package postgres implements outbound.BlobStore using Postgres bytea storage.
//
// Blobs are stored in the blobstore.blob table (separate schema from readmodel
// so a projection Reset cannot truncate attachment bytes). The column is set to
// STORAGE EXTERNAL so Postgres skips compression on already-compressed content.
//
// Put reads the entire stream into memory before inserting — necessary because
// bytea requires the full value as a query parameter. The service-level size cap
// (domain.MaxAttachmentSize) is the primary guard; the LimitReader here is a
// defence-in-depth backstop in case the declared size argument is wrong.
//
// Get returns a bytes.Reader wrapped to satisfy io.ReadSeekCloser. http.ServeContent
// gets a real ReadSeeker so Range requests work even though the fetch was not streamed.
package postgres

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/blobs/blobkey"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// Compile-time assertion.
var _ outbound.BlobStore = (*Store)(nil)

// Store is a Postgres-backed BlobStore.
type Store struct {
	pool *pgxpool.Pool
}

// New creates a Store backed by the given pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// Put writes r to the blobstore.blob table at key. Upserts on conflict so
// retried uploads are idempotent.
func (s *Store) Put(ctx context.Context, key string, r io.Reader, _ int64, contentType string) error {
	incID, attID, err := blobkey.Parse(key)
	if err != nil {
		return err
	}

	data, err := io.ReadAll(io.LimitReader(r, message.MaxAttachmentSize+1))
	if err != nil {
		return fmt.Errorf("postgres blob store: read: %w", err)
	}

	if int64(len(data)) > message.MaxAttachmentSize {
		return fmt.Errorf("postgres blob store: payload exceeds maximum size of %d bytes", message.MaxAttachmentSize)
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO blobstore.blob (key, incident_id, content_type, size, data)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (key) DO UPDATE
		  SET content_type = EXCLUDED.content_type,
		      size         = EXCLUDED.size,
		      data         = EXCLUDED.data`,
		key, incID, contentType, int64(len(data)), data)
	if err != nil {
		return fmt.Errorf("postgres blob store: insert: %w", err)
	}

	_ = attID

	return nil
}

// Get fetches the blob at key and returns a ReadSeekCloser over it.
// Returns outbound.ErrBlobNotFound when the key does not exist.
func (s *Store) Get(ctx context.Context, key string) (io.ReadSeekCloser, error) {
	if _, _, err := blobkey.Parse(key); err != nil {
		return nil, err
	}

	var data []byte

	err := s.pool.QueryRow(ctx, `SELECT data FROM blobstore.blob WHERE key = $1`, key).Scan(&data)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, outbound.ErrBlobNotFound
		}

		return nil, fmt.Errorf("postgres blob store: get %q: %w", key, err)
	}

	return nopReadSeekCloser{bytes.NewReader(data)}, nil
}

// Delete removes the blob at key. Idempotent.
func (s *Store) Delete(ctx context.Context, key string) error {
	if _, _, err := blobkey.Parse(key); err != nil {
		return err
	}

	_, err := s.pool.Exec(ctx, `DELETE FROM blobstore.blob WHERE key = $1`, key)

	return err
}

// DeletePrefix removes all blobs for the given incident prefix.
// prefix must have the form "incidents/<incidentUUID>/".
func (s *Store) DeletePrefix(ctx context.Context, prefix string) error {
	incID, err := blobkey.ParsePrefix(prefix)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `DELETE FROM blobstore.blob WHERE incident_id = $1`, incID)

	return err
}

// nopReadSeekCloser wraps a *bytes.Reader to implement io.ReadSeekCloser.
type nopReadSeekCloser struct{ *bytes.Reader }

func (nopReadSeekCloser) Close() error { return nil }
