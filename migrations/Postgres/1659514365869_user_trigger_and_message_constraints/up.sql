

BEGIN TRANSACTION;
ALTER TABLE "public"."divisions" DROP CONSTRAINT "divisions_pkey";

ALTER TABLE "public"."divisions"
    ADD CONSTRAINT "divisions_pkey" PRIMARY KEY ("id");
COMMIT TRANSACTION;

alter table "public"."messages" drop constraint "messages_author_id_fkey",
  add constraint "messages_author_id_fkey"
  foreign key ("author_id")
  references "public"."users"
  ("id") on update cascade on delete set null;

alter table "public"."messages" drop constraint "messages_author_id_fkey",
  add constraint "messages_author_id_fkey"
  foreign key ("author_id")
  references "public"."users"
  ("id") on update cascade on delete restrict;

alter table "public"."users" add constraint "users_name_key" unique ("name");

alter table "public"."users" rename column "name" to "sub";

CREATE OR REPLACE FUNCTION insert_user_for_messages()
  RETURNS TRIGGER
  AS $BODY$
DECLARE
  session_variables json;
BEGIN
  session_variables := current_setting('hasura.user', 't');
  INSERT INTO users (sub, email)
    VALUES ((session_variables->>'x-hasura-user-id')::STRING, (session_variables->>'x-hasura-email')::STRING);
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

CREATE TRIGGER trigger_insert_user
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE PROCEDURE insert_user_for_messages();
