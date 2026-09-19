-- +goose Up
CREATE TABLE readmodel_schadenplatz (
    id               TEXT    NOT NULL PRIMARY KEY,
    incident_id      TEXT    NOT NULL,
    name             TEXT    NOT NULL,
    is_default       INTEGER NOT NULL DEFAULT 0,
    geojson          TEXT,
    vermisste        INTEGER NOT NULL DEFAULT 0,
    tote             INTEGER NOT NULL DEFAULT 0,
    verletzte        INTEGER NOT NULL DEFAULT 0,
    obdachlose       INTEGER NOT NULL DEFAULT 0,
    eingeschlossene  INTEGER NOT NULL DEFAULT 0,
    is_merged        INTEGER NOT NULL DEFAULT 0,
    merged_into      TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);

CREATE INDEX readmodel_schadenplatz_incident_id_idx ON readmodel_schadenplatz (incident_id);

-- +goose Down
DROP TABLE IF EXISTS readmodel_schadenplatz;
