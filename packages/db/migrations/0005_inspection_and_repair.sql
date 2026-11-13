-- Inspection and repair.

CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  loan_item_id uuid REFERENCES loan_items (id),
  asset_id uuid NOT NULL REFERENCES assets (id),
  inspector_user_id uuid NOT NULL REFERENCES users (id),
  condition condition_grade NOT NULL,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_accessories jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  outcome inspection_outcome NOT NULL
);

CREATE INDEX inspections_loan_item_id_idx ON inspections (loan_item_id);
CREATE INDEX inspections_asset_id_idx ON inspections (asset_id);
CREATE INDEX inspections_inspector_user_id_idx ON inspections (inspector_user_id);

CREATE TABLE repair_tickets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  asset_id uuid NOT NULL REFERENCES assets (id),
  opened_by_user_id uuid NOT NULL REFERENCES users (id),
  problem text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  resolution text
);

-- One open ticket per unit.
CREATE UNIQUE INDEX repair_tickets_one_open_per_asset ON repair_tickets (asset_id) WHERE closed_at IS NULL;
CREATE INDEX repair_tickets_asset_id_idx ON repair_tickets (asset_id);
CREATE INDEX repair_tickets_opened_by_user_id_idx ON repair_tickets (opened_by_user_id);
