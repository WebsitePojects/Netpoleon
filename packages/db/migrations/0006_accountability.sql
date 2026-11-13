-- Accountability: the lifecycle whitelist, the append-only ledger and audit trail.

-- Every allowed (movement type, from status, to status). asset_movements references it, so a
-- transition that is not listed cannot be inserted by the app, a script or by hand. Rows are
-- seeded in 0010; changing the lifecycle is a reviewed migration.
CREATE TABLE asset_transitions (
  movement_type movement_type NOT NULL,
  from_status asset_status NOT NULL,
  to_status asset_status NOT NULL,
  PRIMARY KEY (movement_type, from_status, to_status)
);

CREATE TABLE asset_movements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  asset_id uuid NOT NULL REFERENCES assets (id),
  movement_type movement_type NOT NULL,
  from_status asset_status NOT NULL,
  to_status asset_status NOT NULL,
  from_location_id uuid REFERENCES locations (id),
  to_location_id uuid REFERENCES locations (id),
  actor_user_id uuid NOT NULL REFERENCES users (id),
  loan_item_id uuid REFERENCES loan_items (id),
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Deliberately not indexed: the referenced table has sixteen rows and is never deleted from,
  -- so an index here would only slow the hottest append path.
  CONSTRAINT asset_movements_transition_fkey
    FOREIGN KEY (movement_type, from_status, to_status)
    REFERENCES asset_transitions (movement_type, from_status, to_status)
);

CREATE INDEX asset_movements_asset_occurred_idx ON asset_movements (asset_id, occurred_at DESC);
CREATE INDEX asset_movements_occurred_at_idx ON asset_movements (occurred_at);
CREATE INDEX asset_movements_from_location_id_idx ON asset_movements (from_location_id);
CREATE INDEX asset_movements_to_location_id_idx ON asset_movements (to_location_id);
CREATE INDEX asset_movements_actor_user_id_idx ON asset_movements (actor_user_id);
CREATE INDEX asset_movements_loan_item_id_idx ON asset_movements (loan_item_id);

-- The only way an asset's status or location changes. Runs with the owner's rights because the
-- app roles have no UPDATE privilege on those two columns (0008).
CREATE FUNCTION apply_asset_movement() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status asset_status;
  v_location uuid;
BEGIN
  -- The row lock serialises two movements of one unit; the loser re-reads the new status
  -- below and fails the check instead of overwriting it.
  SELECT a.status, a.current_location_id
    INTO v_status, v_location
    FROM assets a
    WHERE a.id = NEW.asset_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- The foreign key on asset_id reports the missing unit with the right SQLSTATE.
    RETURN NEW;
  END IF;

  IF v_status <> NEW.from_status THEN
    RAISE EXCEPTION 'asset % is %, but the movement expected %', NEW.asset_id, v_status, NEW.from_status
      USING ERRCODE = 'WM001';
  END IF;

  NEW.from_location_id := v_location;

  UPDATE assets
     SET status = NEW.to_status,
         current_location_id = COALESCE(NEW.to_location_id, v_location),
         updated_at = now()
   WHERE id = NEW.asset_id;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION apply_asset_movement() FROM PUBLIC;

CREATE TRIGGER apply_asset_movement
  BEFORE INSERT ON asset_movements
  FOR EACH ROW EXECUTE FUNCTION apply_asset_movement();

-- A unit must have a movement by the time its transaction commits, so a status never exists
-- without history. Deferred because the asset row has to exist before its movement can.
CREATE FUNCTION require_asset_movement() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM asset_movements m WHERE m.asset_id = NEW.id) THEN
    RAISE EXCEPTION 'asset % was created without a movement', NEW.id USING ERRCODE = 'WM002';
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION require_asset_movement() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER assets_must_have_movement
  AFTER INSERT ON assets
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_asset_movement();

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Null means the system acted, not a person.
  actor_user_id uuid REFERENCES users (id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  request_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_target_idx ON audit_log (target_type, target_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, occurred_at DESC);

-- Second lock behind the missing privileges: even the table owner cannot rewrite history.
CREATE FUNCTION reject_history_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: the table is append-only', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'WM003';
END
$$;

REVOKE ALL ON FUNCTION reject_history_change() FROM PUBLIC;

CREATE TRIGGER asset_movements_reject_change
  BEFORE UPDATE OR DELETE ON asset_movements
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER asset_movements_reject_truncate
  BEFORE TRUNCATE ON asset_movements
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER audit_log_reject_change
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER audit_log_reject_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_change();

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  CONSTRAINT notifications_user_dedupe_key UNIQUE (user_id, dedupe_key)
);

CREATE INDEX notifications_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
