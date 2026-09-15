-- +goose Up
-- +goose StatementBegin
CREATE TABLE readmodel.resource (
    id                    uuid        NOT NULL PRIMARY KEY,
    incident_id           uuid        NOT NULL,
    schadenplatz_id       uuid        NOT NULL,
    formation             text        NOT NULL,
    name                  text        NOT NULL,
    size                  text        NOT NULL,
    personnel_count       int         NOT NULL DEFAULT 0,
    hauptaufgabe          text        NOT NULL DEFAULT '',
    contact_medium        text,
    contact_detail        text,
    home_location_name    text,
    home_location_lat     double precision,
    home_location_lng     double precision,
    deployment_lat        double precision,
    deployment_lng        double precision,
    deployment_label      text,
    status                text        NOT NULL,
    status_at             timestamptz NOT NULL,
    einsatz_beginn        timestamptz,
    einsatz_ende          timestamptz,
    predecessor_id        uuid,
    successor_id          uuid,
    source_message_id     uuid,
    created_at            timestamptz NOT NULL,
    updated_at            timestamptz NOT NULL
);

CREATE INDEX readmodel_resource_incident_id_idx       ON readmodel.resource (incident_id);
CREATE INDEX readmodel_resource_schadenplatz_id_idx   ON readmodel.resource (schadenplatz_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS readmodel.resource;
-- +goose StatementEnd
