CREATE OR REPLACE TRIGGER trigger_insert_user
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE PROCEDURE insert_user_for_messages();