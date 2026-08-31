-- +goose Up
-- Squashed baseline from 22 Hasura migrations (1658847649526 → 1763382566880).
-- This is the schema as-of the eventsourcing branch start.
-- Legacy tables are kept as rollback artifacts during the cutover window.

-- ──────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ──────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ──────────────────────────────────────────────────────────────────────────────
-- Shared timestamp triggers
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Enum / lookup tables (values are schema state, not data)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.triage_status (
    name        text NOT NULL,
    description text NOT NULL,
    CONSTRAINT triage_status_enum_pkey PRIMARY KEY (name)
);
INSERT INTO public.triage_status (name, description) VALUES
    ('pending',  'Triage is pending'),
    ('done',     'Triage is done'),
    ('reset',    'Triage is reset and needs to be redone'),
    ('moreinfo', 'Needs more information');

CREATE TABLE public.priority_status (
    name        text NOT NULL,
    description text NOT NULL,
    CONSTRAINT priority_status_pkey PRIMARY KEY (name)
);
INSERT INTO public.priority_status (name, description) VALUES
    ('normal',   'Normal'),
    ('high',     'High'),
    ('critical', 'Critical');

CREATE TABLE public.medium (
    name        text NOT NULL,
    description text NOT NULL,
    CONSTRAINT medium_pkey PRIMARY KEY (name),
    CONSTRAINT medium_name_key UNIQUE (name)
);
COMMENT ON TABLE public.medium IS 'Communication Medium Enum Table';
INSERT INTO public.medium (name, description) VALUES
    ('radio', 'Radio Communication'),
    ('phone', 'phone call'),
    ('email', 'email message'),
    ('other', 'Other');

-- ──────────────────────────────────────────────────────────────────────────────
-- Core legacy tables
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.users (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    sub        text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    email      text        NOT NULL,
    CONSTRAINT user_pkey     PRIMARY KEY (id),
    CONSTRAINT user_email_key UNIQUE (email),
    -- legacy constraint name kept to avoid breaking existing code
    CONSTRAINT users_name_key UNIQUE (sub)
);
COMMENT ON TABLE public.users IS 'Users Table';

CREATE OR REPLACE FUNCTION public.insert_user_for_messages() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    session_variables json;
BEGIN
    session_variables := current_setting('hasura.user', 't');
    INSERT INTO users (sub, email)
        VALUES (
            (session_variables->>'x-hasura-user-id'),
            (session_variables->>'x-hasura-email')
        )
        ON CONFLICT ON CONSTRAINT users_name_key DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TABLE public.locations (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    name        text,
    coordinates point,
    updated_at  timestamptz DEFAULT now(),
    created_at  timestamptz DEFAULT now(),
    CONSTRAINT locations_pkey PRIMARY KEY (id)
);
COMMENT ON TABLE public.locations IS 'Locations of incidents or messages';

CREATE TABLE public.incidents (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    closed_at   timestamptz,
    deleted_at  timestamptz,
    name        text        NOT NULL,
    location_id uuid        NOT NULL,
    CONSTRAINT incidents_pkey        PRIMARY KEY (id),
    CONSTRAINT incidents_location_key UNIQUE (location_id),
    CONSTRAINT incidents_location_id_fkey FOREIGN KEY (location_id)
        REFERENCES public.locations (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TRIGGER set_public_incidents_updated_at
    BEFORE UPDATE ON public.incidents
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_incidents_updated_at ON public.incidents
    IS 'trigger to set value of column "updated_at" to current timestamp on row update';

CREATE TABLE public.divisions (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    description text,
    incident_id uuid,
    CONSTRAINT divisions_id_key              UNIQUE (id),
    CONSTRAINT divisions_pkey                PRIMARY KEY (id),
    CONSTRAINT divisions_name_incident_id_key UNIQUE (name, incident_id),
    CONSTRAINT divisions_incident_id_fkey    FOREIGN KEY (incident_id)
        REFERENCES public.incidents (id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
COMMENT ON TABLE public.divisions IS 'Division for tagging';

CREATE TABLE public.journals (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    closed_at   timestamptz,
    incident_id uuid        NOT NULL,
    name        text        NOT NULL,
    CONSTRAINT journals_pkey          PRIMARY KEY (id),
    CONSTRAINT journals_incident_id_fkey FOREIGN KEY (incident_id)
        REFERENCES public.incidents (id) ON UPDATE RESTRICT ON DELETE CASCADE
);
COMMENT ON TABLE public.journals IS 'Journals';

CREATE TRIGGER set_public_journals_updated_at
    BEFORE UPDATE ON public.journals
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TABLE public.messages (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    content         text        NOT NULL,
    sender          text        NOT NULL,
    receiver        text        NOT NULL,
    author_sub      text,
    "time"          timestamptz NOT NULL DEFAULT now(),
    triage_id       text        NOT NULL DEFAULT 'pending',
    priority_id     text        DEFAULT 'normal',
    journal_id      uuid,
    medium_id       text        DEFAULT 'radio',
    sender_detail   text,
    receiver_detail text,
    CONSTRAINT messages_pkey         PRIMARY KEY (id),
    CONSTRAINT messages_journal_id_fkey  FOREIGN KEY (journal_id)
        REFERENCES public.journals (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT messages_author_sub_fkey  FOREIGN KEY (author_sub)
        REFERENCES public.users (sub) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT messages_triage_fkey      FOREIGN KEY (triage_id)
        REFERENCES public.triage_status (name) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT messages_priority_fkey    FOREIGN KEY (priority_id)
        REFERENCES public.priority_status (name) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT messages_medium_id_fkey   FOREIGN KEY (medium_id)
        REFERENCES public.medium (name) ON UPDATE RESTRICT ON DELETE RESTRICT
);
COMMENT ON TABLE public.messages IS 'Messages Table';

CREATE TRIGGER set_public_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE OR REPLACE TRIGGER trigger_insert_user
    BEFORE INSERT OR UPDATE ON messages
    FOR EACH ROW EXECUTE PROCEDURE public.insert_user_for_messages();

CREATE TABLE public.message_division (
    id          uuid NOT NULL DEFAULT gen_random_uuid(),
    message_id  uuid NOT NULL,
    division_id uuid NOT NULL,
    CONSTRAINT message_devision_pkey                      PRIMARY KEY (id),
    CONSTRAINT message_division_message_id_division_id_key UNIQUE (message_id, division_id),
    CONSTRAINT message_devision_message_id_fkey  FOREIGN KEY (message_id)
        REFERENCES public.messages (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT message_division_division_id_fkey FOREIGN KEY (division_id)
        REFERENCES public.divisions (id) ON UPDATE RESTRICT ON DELETE CASCADE
);
COMMENT ON TABLE public.message_division IS 'Bridge Table for division tagging messages';

CREATE TABLE public.layers (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    incident_id uuid        NOT NULL,
    name        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz,
    deleted_at  timestamptz,
    CONSTRAINT layers_pkey               PRIMARY KEY (id),
    CONSTRAINT layers_id_key             UNIQUE (id),
    CONSTRAINT layers_incident_id_name_key UNIQUE (incident_id, name),
    CONSTRAINT layers_incident_id_fkey   FOREIGN KEY (incident_id)
        REFERENCES public.incidents (id) ON UPDATE RESTRICT ON DELETE CASCADE
);
COMMENT ON TABLE public.layers IS 'Layers for Maps';

CREATE TRIGGER set_public_layers_updated_at
    BEFORE UPDATE ON public.layers
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TABLE public.features (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    geometry   jsonb       NOT NULL,
    properties jsonb       NOT NULL,
    layer_id   uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz,
    deleted_at timestamptz,
    CONSTRAINT features_pkey    PRIMARY KEY (id),
    CONSTRAINT features_id_key  UNIQUE (id),
    CONSTRAINT features_layer_id_fkey FOREIGN KEY (layer_id)
        REFERENCES public.layers (id) ON UPDATE RESTRICT ON DELETE NO ACTION
);
COMMENT ON TABLE public.features IS 'Features for Layers';

CREATE TRIGGER set_public_features_updated_at
    BEFORE UPDATE ON public.features
    FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- Event store (Phase 1 — created here so the schema is complete from migration 1)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS eventsourcing;

CREATE TABLE eventsourcing.events (
    stream_type text        NOT NULL,
    stream_id   uuid        NOT NULL,
    version     int         NOT NULL,
    event_type  text        NOT NULL,
    data        jsonb       NOT NULL,
    metadata    jsonb       NOT NULL,
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    xid         xid8        NOT NULL DEFAULT pg_current_xact_id(),
    seq         bigserial,
    PRIMARY KEY (stream_type, stream_id, version)
);
CREATE INDEX ON eventsourcing.events (xid, seq);

-- ──────────────────────────────────────────────────────────────────────────────
-- Projection support tables
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE eventsourcing.projection_checkpoint (
    name    text  NOT NULL,
    version int   NOT NULL DEFAULT 1,
    cursor  bytea,
    PRIMARY KEY (name)
);

CREATE TABLE eventsourcing.projection_dead_letter (
    projection  text        NOT NULL,
    cursor      bytea       NOT NULL,
    stream_type text        NOT NULL,
    stream_id   uuid        NOT NULL,
    version     int         NOT NULL,
    error       text        NOT NULL,
    attempts    int         NOT NULL,
    parked_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (projection, stream_type, stream_id, version)
);

-- Aggregate index: maps every stream to its owning incident, so retention can
-- find and purge all streams belonging to an incident without scanning the log.
CREATE TABLE eventsourcing.aggregate_index (
    stream_type text NOT NULL,
    stream_id   uuid NOT NULL,
    incident_id uuid NOT NULL,
    PRIMARY KEY (stream_type, stream_id)
);
CREATE INDEX ON eventsourcing.aggregate_index (incident_id);

-- Per-incident message counter for gapless, immutable message numbers.
CREATE TABLE eventsourcing.incident_counters (
    incident_id uuid NOT NULL,
    next_number int  NOT NULL DEFAULT 1,
    PRIMARY KEY (incident_id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- +goose Down
-- ──────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS eventsourcing.incident_counters;
DROP TABLE IF EXISTS eventsourcing.aggregate_index;
DROP TABLE IF EXISTS eventsourcing.projection_dead_letter;
DROP TABLE IF EXISTS eventsourcing.projection_checkpoint;
DROP TABLE IF EXISTS eventsourcing.events;
DROP SCHEMA IF EXISTS eventsourcing;

DROP TABLE IF EXISTS public.features;
DROP TABLE IF EXISTS public.layers;
DROP TABLE IF EXISTS public.message_division;
DROP TABLE IF EXISTS public.messages;
DROP TABLE IF EXISTS public.journals;
DROP TABLE IF EXISTS public.divisions;
DROP TABLE IF EXISTS public.incidents;
DROP TABLE IF EXISTS public.locations;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.medium;
DROP TABLE IF EXISTS public.priority_status;
DROP TABLE IF EXISTS public.triage_status;

DROP FUNCTION IF EXISTS public.insert_user_for_messages();
DROP FUNCTION IF EXISTS public.set_current_timestamp_updated_at();

DROP EXTENSION IF EXISTS pgcrypto;
