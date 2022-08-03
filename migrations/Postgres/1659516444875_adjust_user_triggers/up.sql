
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

CREATE OR REPLACE TRIGGER trigger_insert_user
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE PROCEDURE insert_user_for_messages();

CREATE OR REPLACE FUNCTION insert_user_for_messages()
  RETURNS TRIGGER
  AS $BODY$
DECLARE
  session_variables json;
BEGIN
  session_variables := current_setting('hasura.user', 't');
  INSERT INTO users (sub, email)
    VALUES ((session_variables->>'x-hasura-user-id')::STRING, (session_variables->>'x-hasura-email')::STRING) 
    ON CONFLICT ON CONSTRAINT user_name_key DO NOTHING;
  RETURN NEW;
END;
$BODY$
LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_insert_user
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE PROCEDURE insert_user_for_messages();