-- Invoker animation commands retain explicit authorization checks. Grant only
-- the private-schema access needed by the existing server role.
grant usage on schema app_private to service_role;
grant execute on function app_private.can_edit_draft(uuid) to service_role;
grant execute on function app_private.can_read_draft(uuid) to service_role;
