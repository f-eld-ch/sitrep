
-- Could not auto-generate a down migration.
-- Please write an appropriate down migration for the SQL below:
-- CREATE OR REPLACE FUNCTION insert_user_for_messages()
--   RETURNS TRIGGER
--   AS $BODY$
-- DECLARE
--   session_variables json;
-- BEGIN
--   session_variables := current_setting('hasura.user', 't');
--   INSERT INTO users (sub, email)
--     VALUES ((session_variables->>'x-hasura-user-id')::STRING, (session_variables->>'x-hasura-email')::STRING);
--   RETURN NEW;
-- END;
-- $BODY$
-- LANGUAGE plpgsql;
--
-- CREATE TRIGGER trigger_insert_user
--   AFTER INSERT ON messages
--   FOR EACH ROW
--   EXECUTE PROCEDURE insert_user_for_messages();

alter table "public"."users" rename column "sub" to "name";

alter table "public"."users" drop constraint "users_name_key";


alter table "public"."messages" drop constraint "messages_author_id_fkey",
  add constraint "messages_author_id_fkey"
  foreign key ("author_id")
  references "public"."users"
  ("id") on update cascade on delete set null;

alter table "public"."messages" drop constraint "messages_author_id_fkey",
  add constraint "messages_author_id_fkey"
  foreign key ("author_id")
  references "public"."users"
  ("id") on update restrict on delete restrict;

alter table "public"."divisions" drop constraint "divisions_pkey";
alter table "public"."divisions"
    add constraint "divisions_pkey"
    primary key ("name");
