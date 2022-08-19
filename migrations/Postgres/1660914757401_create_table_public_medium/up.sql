CREATE TABLE "public"."medium" ("name" Text NOT NULL, "description" text NOT NULL, PRIMARY KEY ("name") , UNIQUE ("name"));COMMENT ON TABLE "public"."medium" IS E'Communication Medium Enum Table';
