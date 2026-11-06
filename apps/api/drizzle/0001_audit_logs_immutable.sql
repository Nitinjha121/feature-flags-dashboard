-- Audit log immutability, enforced by the database itself (defense in depth: the application
-- also has no code path that updates or deletes audit rows).
-- Any UPDATE or DELETE on audit_logs fails, whoever issues it.
-- Note: TRUNCATE is a separate privileged operation and is not covered by row triggers; in
-- production the application role would additionally be denied UPDATE/DELETE/TRUNCATE via GRANTs.
CREATE OR REPLACE FUNCTION audit_logs_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_mutation();
