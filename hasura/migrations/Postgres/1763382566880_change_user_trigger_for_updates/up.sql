CREATE OR REPLACE TRIGGER trigger_insert_user
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW
  EXECUTE PROCEDURE insert_user_for_messages();
