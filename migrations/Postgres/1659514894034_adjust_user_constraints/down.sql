
alter table "public"."messages" drop constraint "messages_author_sub_fkey";

-- Could not auto-generate a down migration.
-- Please write an appropriate down migration for the SQL below:
-- alter table "public"."messages" add column "author_sub" text
--  null;

comment on column "public"."messages"."author_id" is E'Messages Table';
alter table "public"."messages" alter column "author_id" drop not null;
alter table "public"."messages" add column "author_id" uuid;

alter table "public"."messages"
  add constraint "messages_author_id_fkey"
  foreign key ("author_id")
  references "public"."users"
  ("id") on update cascade on delete restrict;
