alter table "public"."layers" add constraint "layers_incident_id_name_key" unique ("incident_id", "name");
