-- +goose Up

-- sub is the stable OIDC identifier. ON CONFLICT (sub) is used for upserts;
-- email uniqueness is not enforced because emails change when users update
-- their IdP profile.
CREATE TABLE users (
    id         TEXT NOT NULL PRIMARY KEY,
    sub        TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

-- +goose Down
DROP TABLE IF EXISTS users;
