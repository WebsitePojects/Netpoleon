-- Grants and row-level security.
-- Grants remove whole tables and columns; row-level security filters rows within what is left.
-- Every grant is listed explicitly, so a table added by a later migration has no privileges for
-- anyone until that migration grants them. TRUNCATE is never granted to an app role.
--
-- Row-level security is enabled, not forced: the app roles are not table owners, so it applies
-- to them regardless, and forcing it would also blind the migrator and the SECURITY DEFINER
-- functions that must see every company's rows.

-- ---------------------------------------------------------------------------------------------
-- wms_staff: staff sessions, the worker and the pre-login lookups.
-- ---------------------------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON
  sessions, auth_tokens, categories, product_models, model_accessories, locations,
  loan_request_items, loan_extensions, inspections, repair_tickets, notifications,
  idempotency_keys, outbox, settings, worker_heartbeats
  TO wms_staff;

-- Business records are archived or deactivated, never deleted.
GRANT SELECT, INSERT, UPDATE ON
  partner_orgs, users, loan_requests, reservations, loans, loan_items
  TO wms_staff;

-- History: append only. The triggers in 0006 are the second lock.
GRANT SELECT, INSERT ON asset_movements, audit_log TO wms_staff;

GRANT SELECT ON asset_transitions TO wms_staff;
-- Read-only, so the readiness check can confirm every migration is applied.
GRANT SELECT ON schema_migrations TO wms_staff;

-- status and current_location_id are deliberately absent from both column lists: they change
-- only through an asset_movements row. A statement that names either column fails with 42501.
GRANT SELECT ON assets TO wms_staff;
GRANT INSERT (
  id, created_at, updated_at, asset_code, serial_number, product_model_id, condition,
  ownership, owner_name, retired_at
) ON assets TO wms_staff;
GRANT UPDATE (
  id, created_at, updated_at, asset_code, serial_number, product_model_id, condition,
  ownership, owner_name, retired_at
) ON assets TO wms_staff;

-- counters: no privilege at all. next_counter() is the only way in.

-- ---------------------------------------------------------------------------------------------
-- wms_partner: only what the portal shows.
-- ---------------------------------------------------------------------------------------------

GRANT SELECT ON categories, product_models, model_accessories TO wms_partner;
GRANT SELECT ON partner_orgs, loans, loan_items TO wms_partner;

-- Never password_hash, locked_until or the login counters.
GRANT SELECT (id, email, full_name, phone, role, status, partner_org_id) ON users TO wms_partner;

GRANT SELECT, INSERT ON loan_requests, loan_request_items, loan_extensions TO wms_partner;
-- The only change a partner can make to a request is to cancel it.
GRANT UPDATE (status) ON loan_requests TO wms_partner;

GRANT SELECT ON notifications TO wms_partner;
GRANT UPDATE (read_at) ON notifications TO wms_partner;

GRANT SELECT, INSERT, UPDATE ON idempotency_keys TO wms_partner;
GRANT INSERT ON outbox, audit_log TO wms_partner;

-- ---------------------------------------------------------------------------------------------
-- Scope helpers. An absent or empty setting yields NULL, and "column = NULL" matches nothing,
-- so a forgotten scope returns zero rows instead of every company's rows. A malformed value
-- raises 22P02 rather than being guessed at.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION app_partner_org_id() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.partner_org_id', true), '')::uuid
$$;

CREATE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

REVOKE ALL ON FUNCTION app_partner_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_partner_org_id(), app_user_id() TO wms_staff, wms_partner;

-- ---------------------------------------------------------------------------------------------
-- Row-level security on every table wms_partner can reach except the three catalogue tables.
-- Staff see everything; a partner sees its own company's rows. Where a partner may write, the
-- policy also pins the starting state, so a request cannot be filed already approved.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE partner_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_orgs_staff ON partner_orgs
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY partner_orgs_partner_read ON partner_orgs
  FOR SELECT TO wms_partner USING (id = app_partner_org_id());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_staff ON users
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY users_partner_read ON users
  FOR SELECT TO wms_partner USING (partner_org_id = app_partner_org_id());

ALTER TABLE loan_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY loan_requests_staff ON loan_requests
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY loan_requests_partner_read ON loan_requests
  FOR SELECT TO wms_partner USING (partner_org_id = app_partner_org_id());
CREATE POLICY loan_requests_partner_insert ON loan_requests
  FOR INSERT TO wms_partner
  WITH CHECK (
    partner_org_id = app_partner_org_id()
    AND status = 'submitted'
    AND decided_by_user_id IS NULL
    AND decided_at IS NULL
    AND decision_note IS NULL
  );
-- Only a request still waiting or approved can be withdrawn; one already released, rejected or
-- expired is history, and "cancelling" it would rewrite what happened.
CREATE POLICY loan_requests_partner_cancel ON loan_requests
  FOR UPDATE TO wms_partner
  USING (partner_org_id = app_partner_org_id() AND status IN ('submitted', 'approved'))
  WITH CHECK (partner_org_id = app_partner_org_id() AND status = 'cancelled');

ALTER TABLE loan_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY loan_request_items_staff ON loan_request_items
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY loan_request_items_partner_read ON loan_request_items
  FOR SELECT TO wms_partner USING (partner_org_id = app_partner_org_id());
CREATE POLICY loan_request_items_partner_insert ON loan_request_items
  FOR INSERT TO wms_partner
  WITH CHECK (partner_org_id = app_partner_org_id() AND quantity_assigned = 0);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY loans_staff ON loans
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY loans_partner_read ON loans
  FOR SELECT TO wms_partner USING (partner_org_id = app_partner_org_id());

ALTER TABLE loan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY loan_items_staff ON loan_items
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY loan_items_partner_read ON loan_items
  FOR SELECT TO wms_partner USING (partner_org_id = app_partner_org_id());

ALTER TABLE loan_extensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY loan_extensions_staff ON loan_extensions
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY loan_extensions_partner_read ON loan_extensions
  FOR SELECT TO wms_partner USING (partner_org_id = app_partner_org_id());
CREATE POLICY loan_extensions_partner_insert ON loan_extensions
  FOR INSERT TO wms_partner
  WITH CHECK (
    partner_org_id = app_partner_org_id()
    AND status = 'requested'
    AND decided_by_user_id IS NULL
    AND decided_at IS NULL
  );

-- Per person, not per company: these rows belong to one user.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_staff ON notifications
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY notifications_partner ON notifications
  FOR SELECT TO wms_partner USING (user_id = app_user_id());
CREATE POLICY notifications_partner_mark_read ON notifications
  FOR UPDATE TO wms_partner
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_staff ON idempotency_keys
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY idempotency_keys_partner ON idempotency_keys
  TO wms_partner USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- A partner can enqueue work and leave an audit row, but never read either back.
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbox_staff ON outbox
  TO wms_staff USING (true) WITH CHECK (true);
CREATE POLICY outbox_partner_insert ON outbox
  FOR INSERT TO wms_partner WITH CHECK (true);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_staff ON audit_log
  TO wms_staff USING (true) WITH CHECK (true);
-- A partner's audit row must name the partner as the actor; otherwise a partner session could
-- write history that blames a member of staff.
CREATE POLICY audit_log_partner_insert ON audit_log
  FOR INSERT TO wms_partner WITH CHECK (actor_user_id = app_user_id());
