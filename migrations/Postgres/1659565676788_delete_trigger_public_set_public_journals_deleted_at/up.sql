
ALTER TABLE "public"."journals" ALTER COLUMN "deleted_at" drop default;

DROP TRIGGER "set_public_journals_deleted_at" ON "public"."journals";
