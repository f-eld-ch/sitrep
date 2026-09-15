-- +goose Up
-- +goose StatementBegin
CREATE TABLE readmodel_resource (
    id                    TEXT     NOT NULL PRIMARY KEY,
    incident_id           TEXT     NOT NULL,
    schadenplatz_id       TEXT     NOT NULL,
    formation             TEXT     NOT NULL,
    name                  TEXT     NOT NULL,
    size                  TEXT     NOT NULL,
    personnel_count       INTEGER  NOT NULL DEFAULT 0,
    hauptaufgabe          TEXT     NOT NULL DEFAULT '',
    contact_medium        TEXT,
    contact_detail        TEXT,
    home_location_name    TEXT,
    home_location_lat     REAL,
    home_location_lng     REAL,
    deployment_lat        REAL,
    deployment_lng        REAL,
    deployment_label      TEXT,
    status                TEXT     NOT NULL,
    status_at             TEXT     NOT NULL,
    einsatz_beginn        TEXT,
    einsatz_ende          TEXT,
    predecessor_id        TEXT,
    successor_id          TEXT,
    source_message_id     TEXT,
    created_at            TEXT     NOT NULL,
    updated_at            TEXT     NOT NULL
) STRICT;

CREATE INDEX readmodel_resource_incident_id_idx     ON readmodel_resource (incident_id);
CREATE INDEX readmodel_resource_schadenplatz_id_idx ON readmodel_resource (schadenplatz_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS readmodel_resource;
-- +goose StatementEnd
