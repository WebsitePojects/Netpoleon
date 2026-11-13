-- Plumbing: idempotency keys, the outbox, running numbers, settings and worker heartbeats.

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users (id),
  key text NOT NULL,
  route text NOT NULL,
  request_hash bytea NOT NULL,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  CONSTRAINT idempotency_keys_user_key_key UNIQUE (user_id, key)
);

CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  topic text NOT NULL,
  payload jsonb NOT NULL,
  status outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text
);

-- The worker's claim query only ever looks at work that is not finished.
CREATE INDEX outbox_due_idx ON outbox (next_attempt_at) WHERE status IN ('pending', 'processing');

-- Written only through next_counter(); the app roles get no privilege on the table (0008).
CREATE TABLE counters (
  prefix text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  value bigint NOT NULL DEFAULT 0
);

-- The upsert takes a row lock held to the end of the caller's transaction: concurrent callers
-- queue up, each gets the next number, and a rollback hands the number back, so there are no
-- gaps and no duplicates.
CREATE FUNCTION next_counter(p_prefix text) RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO counters (prefix, value) VALUES (p_prefix, 1)
  ON CONFLICT (prefix) DO UPDATE SET value = counters.value + 1
  RETURNING value;
$$;

REVOKE ALL ON FUNCTION next_counter(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_counter(text) TO wms_staff, wms_partner;

CREATE TABLE settings (
  key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  value jsonb NOT NULL,
  updated_by_user_id uuid REFERENCES users (id)
);

CREATE INDEX settings_updated_by_user_id_idx ON settings (updated_by_user_id);

CREATE TABLE worker_heartbeats (
  worker_name text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  beat_at timestamptz NOT NULL
);

-- Every table that carries updated_at gets it maintained by the database. A later migration
-- that adds such a table attaches the same trigger itself.
DO $$
DECLARE
  v_table text;
BEGIN
  FOR v_table IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     ORDER BY c.relname
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      v_table || '_touch_updated_at',
      v_table
    );
  END LOOP;
END
$$;
