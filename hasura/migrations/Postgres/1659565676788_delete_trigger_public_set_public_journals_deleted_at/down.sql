
CREATE TRIGGER "set_public_journals_deleted_at"
BEFORE UPDATE ON "public"."journals"
FOR EACH ROW EXECUTE FUNCTION set_current_timestamp_deleted_at();COMMENT ON TRIGGER "set_public_journals_deleted_at" ON "public"."journals"
IS E'trigger to set value of column "deleted_at" to current timestamp on row update';

alter table "public"."journals" alter column "deleted_at" set default now();
