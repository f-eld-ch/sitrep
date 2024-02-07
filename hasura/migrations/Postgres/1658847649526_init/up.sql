SET check_function_bodies = false;
CREATE FUNCTION public.set_current_timestamp_deleted_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."deleted_at" = NOW();
  RETURN _new;
END;
$$;
CREATE FUNCTION public.set_current_timestamp_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  _new record;
BEGIN
  _new := NEW;
  _new."updated_at" = NOW();
  RETURN _new;
END;
$$;
CREATE TABLE public.divisions (
    name text NOT NULL,
    description text,
    incident_id uuid,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);
COMMENT ON TABLE public.divisions IS 'Division for tagging';
CREATE TABLE public.incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    deleted_at timestamp with time zone,
    name text NOT NULL,
    location_id uuid NOT NULL
);
CREATE TABLE public.journals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone DEFAULT now(),
    incident_id uuid NOT NULL,
    name text NOT NULL
);
COMMENT ON TABLE public.journals IS 'Journals';
CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    coordinates point,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);
COMMENT ON TABLE public.locations IS 'Locations of incidents or messages';
CREATE TABLE public.message_division (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    division_id uuid NOT NULL
);
COMMENT ON TABLE public.message_division IS 'Bridge Table for division tagging messages';
CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    content text NOT NULL,
    sender text NOT NULL,
    receiver text NOT NULL,
    author_id uuid NOT NULL,
    "time" timestamp with time zone DEFAULT now() NOT NULL,
    triage_id text DEFAULT 'pending'::text NOT NULL,
    priority_id text DEFAULT 'normal'::text,
    journal_id uuid
);
COMMENT ON TABLE public.messages IS 'Messages Table';
CREATE TABLE public.priority_status (
    name text NOT NULL,
    description text NOT NULL
);
COMMENT ON TABLE public.priority_status IS 'Message Priority Status';
INSERT INTO public.priority_status VALUES ('normal', 'Normal'),('high', 'High'),('critical', 'Critical');
CREATE TABLE public.triage_status (
    name text NOT NULL,
    description text NOT NULL
);
COMMENT ON TABLE public.triage_status IS 'Triage Status Enum Table';
INSERT INTO public.triage_status VALUES ('pending', 'Triage is pending'),('done','Triage is done'),('reset','Triage is reset and needs to be redone');
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text NOT NULL
);
COMMENT ON TABLE public.users IS 'Users Table';
ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_id_key UNIQUE (id);
ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_name_incident_id_key UNIQUE (name, incident_id);
ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (name);
ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_location_key UNIQUE (location_id);
ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.journals
    ADD CONSTRAINT journals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.message_division
    ADD CONSTRAINT message_devision_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.message_division
    ADD CONSTRAINT message_division_message_id_division_id_key UNIQUE (message_id, division_id);
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.priority_status
    ADD CONSTRAINT priority_status_pkey PRIMARY KEY (name);
ALTER TABLE ONLY public.triage_status
    ADD CONSTRAINT triage_status_enum_pkey PRIMARY KEY (name);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT user_email_key UNIQUE (email);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);
CREATE TRIGGER set_public_incidents_updated_at BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_incidents_updated_at ON public.incidents IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_journals_deleted_at BEFORE UPDATE ON public.journals FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_deleted_at();
COMMENT ON TRIGGER set_public_journals_deleted_at ON public.journals IS 'trigger to set value of column "deleted_at" to current timestamp on row update';
CREATE TRIGGER set_public_journals_updated_at BEFORE UPDATE ON public.journals FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_journals_updated_at ON public.journals IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_locations_updated_at ON public.locations IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_messages_updated_at ON public.messages IS 'trigger to set value of column "updated_at" to current timestamp on row update';
CREATE TRIGGER set_public_user_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
COMMENT ON TRIGGER set_public_user_updated_at ON public.users IS 'trigger to set value of column "updated_at" to current timestamp on row update';
ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.journals
    ADD CONSTRAINT journals_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.message_division
    ADD CONSTRAINT message_devision_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY public.message_division
    ADD CONSTRAINT message_division_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON UPDATE RESTRICT ON DELETE CASCADE;
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.journals(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_priority_fkey FOREIGN KEY (priority_id) REFERENCES public.priority_status(name) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_triage_fkey FOREIGN KEY (triage_id) REFERENCES public.triage_status(name) ON UPDATE CASCADE ON DELETE RESTRICT;
