alter table "public"."messages"
  add constraint "messages_medium_id_fkey"
  foreign key ("medium_id")
  references "public"."medium"
  ("name") on update restrict on delete restrict;
