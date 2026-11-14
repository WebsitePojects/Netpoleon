-- Console support: sign-in names, unit notes, search and list indexes, the transaction read
-- model and the settings the console edits.
-- Expand only: every change here is additive, so the previous app version keeps working while
-- a deploy is in progress (spec section 7).

-- A trusted extension: the migrator installs it with the CREATE right on the database that
-- bootstrap-roles.ts grants, the same way 0001 installs btree_gist and citext.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------------------------
-- Users: a sign-in name and a job title (plan D1, R11).
-- ---------------------------------------------------------------------------------------------

-- Nullable on purpose. Partners sign in by email and have no username. Staff need one, but a
-- NOT NULL or a kind-dependent CHECK here would break every staff insert the previous app
-- version makes, so the API requires it for staff; a later contract migration can add
-- "kind = 'partner' OR username IS NOT NULL" once every staff row carries one.
-- citext makes the unique key and the sign-in lookup case-insensitive; the CHECK on the text
-- form then admits only lower case, so the stored value is already the canonical spelling.
ALTER TABLE users
  ADD COLUMN username citext,
  ADD COLUMN title text,
  ADD CONSTRAINT users_username_key UNIQUE (username),
  ADD CONSTRAINT users_username_format CHECK (username::text ~ '^[a-z][a-z0-9._-]{2,23}$');

-- wms_staff's table-level grants on users cover the new columns. wms_partner's column list in
-- 0008 is left as it is: the portal has no use for either column.

-- ---------------------------------------------------------------------------------------------
-- Assets: free-text notes (R11).
-- ---------------------------------------------------------------------------------------------

ALTER TABLE assets ADD COLUMN notes text;

-- Column grants are additive: status and current_location_id stay ungranted, so they still
-- change only through an asset_movements row.
GRANT INSERT (notes), UPDATE (notes) ON assets TO wms_staff;

-- ---------------------------------------------------------------------------------------------
-- One loan per request (D2). The loan reuses the request's number, and the read model below
-- joins loans to requests one to one; this makes that a guarantee instead of a convention.
-- It also serves the foreign key, alongside the plain index from 0004.
-- ---------------------------------------------------------------------------------------------

CREATE UNIQUE INDEX loans_one_per_request ON loans (loan_request_id);

-- ---------------------------------------------------------------------------------------------
-- Search (D15). Trigram GIN indexes let "contains" searches (ILIKE '%term%') use an index; a
-- b-tree only helps a prefix. Each serves the console's search box on its list.
-- ---------------------------------------------------------------------------------------------

-- GET /units?q= : asset code and serial number.
CREATE INDEX assets_asset_code_trgm_idx ON assets USING gin (asset_code gin_trgm_ops);
CREATE INDEX assets_serial_number_trgm_idx ON assets USING gin (serial_number gin_trgm_ops);

-- GET /units?q= and GET /models?q= : one expression, so "Cisco C9200" matches across the
-- brand and the model name. A query uses this index only when it repeats the expression
-- exactly: (brand || ' ' || model_name) ILIKE $1.
CREATE INDEX product_models_search_trgm_idx
  ON product_models USING gin ((brand || ' ' || model_name) gin_trgm_ops);

-- GET /transactions?q= : borrower name and company; GET /partners?q= : company suggestions.
CREATE INDEX loan_requests_contact_name_trgm_idx
  ON loan_requests USING gin (contact_name gin_trgm_ops);
CREATE INDEX partner_orgs_name_trgm_idx ON partner_orgs USING gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------
-- List sorts (R2). Offset paging needs a total order, so each sort ends in id as the tie
-- breaker, and the index carries it too so the first page is read in index order.
-- ---------------------------------------------------------------------------------------------

-- GET /units, default sort "recently updated", without and with a status filter. The category
-- filter goes through assets_model_status_idx and the location filter through
-- assets_current_location_id_idx (both 0003).
CREATE INDEX assets_updated_idx ON assets (updated_at DESC, id DESC);
CREATE INDEX assets_status_updated_idx ON assets (status, updated_at DESC, id DESC);

-- GET /transactions, default sort "newest first", without and with a status filter, and the
-- "needed from" sort. A status filter with that sort uses loan_requests_status_needed_from_idx
-- (0004).
CREATE INDEX loan_requests_created_idx ON loan_requests (created_at DESC, id DESC);
CREATE INDEX loan_requests_status_created_idx ON loan_requests (status, created_at DESC, id DESC);
CREATE INDEX loan_requests_needed_from_idx ON loan_requests (needed_from DESC, id DESC);

-- GET /audit, newest first across every actor (R11). The per-actor feed uses audit_log_actor_idx.
CREATE INDEX audit_log_occurred_at_idx ON audit_log (occurred_at DESC);

-- ---------------------------------------------------------------------------------------------
-- The console's transaction: one row per loan request with its computed stage (D3, R3).
-- Every module reads the stage from here; nobody derives it again.
-- ---------------------------------------------------------------------------------------------

CREATE TYPE transaction_stage AS ENUM (
  'pending', 'approved', 'rejected', 'cancelled', 'expired', 'released', 'returned', 'closed'
);

-- security_invoker: the caller's grants and row-level-security policies apply to every table
-- the view reads, exactly as if the caller had written the query. Without it the view would run
-- as its owner, who is not subject to row-level security, and would show every company's rows.
--
-- Changing a column this view reads (type, name) requires dropping and recreating it in the
-- same migration; Postgres refuses the ALTER otherwise.
CREATE VIEW transaction_overview WITH (security_invoker = true) AS
SELECT
  lr.id AS request_id,
  lr.request_no,
  lr.created_at,
  lr.updated_at,
  lr.partner_org_id,
  org.name AS partner_org_name,
  org.type AS partner_org_type,
  lr.contact_name,
  lr.contact_email,
  lr.contact_phone,
  lr.end_customer,
  lr.purpose,
  lr.needed_from,
  lr.needed_until,
  -- The console files one model per request (D4). A portal request may carry several lines;
  -- the model columns then describe the first line filed and model_count says there are more.
  item.product_model_id,
  model.brand,
  model.model_name,
  model.category_id,
  category.code AS category_code,
  category.name AS category_name,
  item.model_count,
  item.quantity_requested,
  item.quantity_assigned,
  lr.filed_by_user_id,
  filer.full_name AS filed_by_name,
  lr.status AS request_status,
  lr.decided_by_user_id,
  decider.full_name AS decided_by_name,
  lr.decided_at,
  lr.decision_note,
  loan.id AS loan_id,
  loan.loan_no,
  loan.released_at,
  loan.released_by_user_id,
  releaser.full_name AS released_by_name,
  loan.due_date AS original_due_date,
  -- GREATEST ignores NULL, so a loan without approved extensions keeps its own due date.
  GREATEST(loan.due_date, extension.due_date) AS due_date,
  loan.closed_at,
  loaned.items_released,
  loaned.items_returned,
  -- Ordered: a decision that ended the request wins over anything recorded after it, and a
  -- request with a loan is described by where its units are.
  (CASE
    WHEN lr.status = 'submitted' THEN 'pending'
    WHEN lr.status IN ('rejected', 'cancelled', 'expired') THEN lr.status::text
    WHEN loan.id IS NULL THEN 'approved'
    -- A unit is still out, or an assigned unit has yet to be collected.
    WHEN loaned.items_returned < loaned.items_released OR reserved.waiting > 0 THEN 'released'
    -- Every unit is back and at least one still awaits its inspection.
    WHEN reserved.released > 0 THEN 'returned'
    -- Every reservation is finished: completed by inspection, or cancelled or expired.
    ELSE 'closed'
  END)::transaction_stage AS stage,
  -- "Today" is the Manila calendar date, whatever the server's time zone.
  (loaned.items_returned < loaned.items_released
    AND GREATEST(loan.due_date, extension.due_date)
        < (now() AT TIME ZONE 'Asia/Manila')::date) AS is_overdue
FROM loan_requests lr
JOIN partner_orgs org ON org.id = lr.partner_org_id
-- Outer joins on users: a caller whose policies hide a person still gets the row, without
-- the name.
LEFT JOIN users filer ON filer.id = lr.filed_by_user_id
LEFT JOIN users decider ON decider.id = lr.decided_by_user_id
LEFT JOIN loans loan ON loan.loan_request_id = lr.id
LEFT JOIN users releaser ON releaser.id = loan.released_by_user_id
-- Each LATERAL aggregate returns exactly one row (an aggregate without GROUP BY always does),
-- so none of them can multiply or drop the request's row.
CROSS JOIN LATERAL (
  SELECT
    (array_agg(i.product_model_id ORDER BY i.created_at, i.id))[1] AS product_model_id,
    count(*)::integer AS model_count,
    COALESCE(sum(i.quantity_requested), 0)::integer AS quantity_requested,
    COALESCE(sum(i.quantity_assigned), 0)::integer AS quantity_assigned
  FROM loan_request_items i
  WHERE i.loan_request_id = lr.id
) item
LEFT JOIN product_models model ON model.id = item.product_model_id
LEFT JOIN categories category ON category.id = model.category_id
CROSS JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE r.status IN ('active', 'needs_reassignment'))::integer AS waiting,
    count(*) FILTER (WHERE r.status = 'released')::integer AS released
  FROM loan_request_items i
  JOIN reservations r ON r.loan_request_item_id = i.id
  WHERE i.loan_request_id = lr.id
) reserved
CROSS JOIN LATERAL (
  SELECT
    count(*)::integer AS items_released,
    count(li.returned_at)::integer AS items_returned
  FROM loan_items li
  WHERE li.loan_id = loan.id
) loaned
CROSS JOIN LATERAL (
  SELECT max(e.requested_due_date) AS due_date
  FROM loan_extensions e
  WHERE e.loan_id = loan.id AND e.status = 'approved'
) extension;

-- Staff only. wms_partner has no privilege on reservations, so under security_invoker every
-- partner query on this view would fail with 42501 anyway; granting it would only invite a
-- later "fix" that opens reservations to partners. The portal slice gets its own read model.
-- (The guarantee tests prove the view still honours the partner wall if it is ever granted.)
GRANT SELECT ON transaction_overview TO wms_staff;

-- ---------------------------------------------------------------------------------------------
-- Settings the console edits (R10). Bounds are enforced by the API; these are the defaults.
-- Keys seeded by 0010 are left untouched.
-- ---------------------------------------------------------------------------------------------

INSERT INTO settings (key, value) VALUES
  ('org.company_name',              '"Netpoleon Solutions Philippines, Inc."'::jsonb),
  ('org.warehouse_name',            '"Main Warehouse"'::jsonb),
  ('booking.default_days',          '14'::jsonb),
  ('notify.overdue',                'true'::jsonb),
  ('notify.missing_accessory',      'true'::jsonb),
  ('notify.for_inspection',         'true'::jsonb),
  ('notify.ready',                  'true'::jsonb),
  ('notify.overdue_reminder_days',  '2'::jsonb),
  ('auth.lock_after_failed',        '5'::jsonb),
  ('labels.size',                   '"50x25"'::jsonb),
  ('labels.show_serial',            'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
