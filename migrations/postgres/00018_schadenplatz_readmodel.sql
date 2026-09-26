-- +goose Up
-- +goose StatementBegin
CREATE TABLE readmodel.schadenplatz (
    id               uuid        NOT NULL PRIMARY KEY,
    incident_id      uuid        NOT NULL,
    name             text        NOT NULL,
    is_default       boolean     NOT NULL DEFAULT false,
    geojson          jsonb,
    vermisste        int         NOT NULL DEFAULT 0,
    tote             int         NOT NULL DEFAULT 0,
    verletzte        int         NOT NULL DEFAULT 0,
    obdachlose       int         NOT NULL DEFAULT 0,
    eingeschlossene  int         NOT NULL DEFAULT 0,
    is_merged        boolean     NOT NULL DEFAULT false,
    merged_into      uuid,
    created_at       timestamptz NOT NULL,
    updated_at       timestamptz NOT NULL
);

CREATE INDEX readmodel_schadenplatz_incident_id_idx ON readmodel.schadenplatz (incident_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS readmodel.schadenplatz;
-- +goose StatementEnd
