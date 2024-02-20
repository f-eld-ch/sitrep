
alter table "public"."messages" drop constraint "messages_author_id_fkey";

alter table "public"."messages" drop column "author_id" cascade;

alter table "public"."messages" add column "author_sub" text
 null;

alter table "public"."messages"
  add constraint "messages_author_sub_fkey"
  foreign key ("author_sub")
  references "public"."users"
  ("sub") on update cascade on delete restrict;
