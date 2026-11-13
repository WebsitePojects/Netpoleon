-- Booking and lending.
-- Child tables carry partner_org_id and a composite foreign key (parent id, partner_org_id) to
-- the parent's unique (id, partner_org_id). Row-level security then needs no subquery, and a
-- child can never belong to a different company than its parent.

CREATE TABLE loan_requests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  request_no text NOT NULL,
  partner_org_id uuid NOT NULL REFERENCES partner_orgs (id),
  filed_by_user_id uuid NOT NULL REFERENCES users (id),
  contact_name text NOT NULL,
  contact_email citext NOT NULL,
  contact_phone text NOT NULL,
  needed_from date NOT NULL,
  needed_until date NOT NULL,
  purpose text NOT NULL,
  end_customer text,
  status request_status NOT NULL DEFAULT 'submitted',
  decided_by_user_id uuid REFERENCES users (id),
  decided_at timestamptz,
  decision_note text,
  CONSTRAINT loan_requests_request_no_key UNIQUE (request_no),
  CONSTRAINT loan_requests_id_partner_org_id_key UNIQUE (id, partner_org_id),
  CONSTRAINT loan_requests_dates_ordered CHECK (needed_until >= needed_from),
  -- The person who filed a request cannot be the one who approves it.
  CONSTRAINT loan_requests_filer_cannot_decide
    CHECK (decided_by_user_id IS NULL OR decided_by_user_id <> filed_by_user_id)
);

CREATE INDEX loan_requests_org_created_idx ON loan_requests (partner_org_id, created_at DESC);
CREATE INDEX loan_requests_status_needed_from_idx ON loan_requests (status, needed_from);
CREATE INDEX loan_requests_filed_by_user_id_idx ON loan_requests (filed_by_user_id);
CREATE INDEX loan_requests_decided_by_user_id_idx ON loan_requests (decided_by_user_id);

CREATE TABLE loan_request_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  loan_request_id uuid NOT NULL,
  partner_org_id uuid NOT NULL,
  product_model_id uuid NOT NULL REFERENCES product_models (id),
  quantity_requested integer NOT NULL,
  quantity_assigned integer NOT NULL DEFAULT 0,
  -- The unique index below leads with loan_request_id, so it also serves this foreign key.
  CONSTRAINT loan_request_items_request_fkey
    FOREIGN KEY (loan_request_id, partner_org_id)
    REFERENCES loan_requests (id, partner_org_id),
  CONSTRAINT loan_request_items_request_model_key UNIQUE (loan_request_id, product_model_id),
  CONSTRAINT loan_request_items_quantity_positive CHECK (quantity_requested > 0),
  CONSTRAINT loan_request_items_assigned_in_range
    CHECK (quantity_assigned BETWEEN 0 AND quantity_requested)
);

CREATE INDEX loan_request_items_product_model_id_idx ON loan_request_items (product_model_id);

-- Half-open [from, until) ranges, so back-to-back bookings of one unit do not collide.
-- A completed, cancelled or expired reservation no longer occupies the unit.
CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  asset_id uuid NOT NULL REFERENCES assets (id),
  loan_request_item_id uuid NOT NULL REFERENCES loan_request_items (id),
  period daterange NOT NULL,
  status reservation_status NOT NULL DEFAULT 'active',
  CONSTRAINT reservations_period_half_open
    CHECK (NOT isempty(period) AND lower_inc(period) AND NOT upper_inc(period)),
  CONSTRAINT reservations_no_overlap
    EXCLUDE USING gist (asset_id WITH =, period WITH &&)
    WHERE (status IN ('active', 'needs_reassignment', 'released'))
);

-- The exclusion index only covers occupying rows; history queries need this one.
CREATE INDEX reservations_asset_id_idx ON reservations (asset_id);
CREATE INDEX reservations_loan_request_item_id_idx ON reservations (loan_request_item_id);

CREATE TABLE loans (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  loan_no text NOT NULL,
  loan_request_id uuid NOT NULL,
  partner_org_id uuid NOT NULL,
  -- Copied from the request at release, so later edits to a user do not rewrite who borrowed.
  contact_name text NOT NULL,
  contact_email citext NOT NULL,
  contact_phone text NOT NULL,
  released_by_user_id uuid NOT NULL REFERENCES users (id),
  released_at timestamptz NOT NULL,
  due_date date NOT NULL,
  closed_at timestamptz,
  is_backdated boolean NOT NULL DEFAULT false,
  CONSTRAINT loans_loan_no_key UNIQUE (loan_no),
  CONSTRAINT loans_id_partner_org_id_key UNIQUE (id, partner_org_id),
  CONSTRAINT loans_request_fkey
    FOREIGN KEY (loan_request_id, partner_org_id)
    REFERENCES loan_requests (id, partner_org_id)
);

CREATE INDEX loans_org_released_idx ON loans (partner_org_id, released_at DESC);
-- The overdue sweep only ever looks at open loans.
CREATE INDEX loans_open_due_date_idx ON loans (due_date) WHERE closed_at IS NULL;
CREATE INDEX loans_loan_request_id_idx ON loans (loan_request_id);
CREATE INDEX loans_released_by_user_id_idx ON loans (released_by_user_id);

CREATE TABLE loan_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  loan_id uuid NOT NULL,
  partner_org_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets (id),
  reservation_id uuid REFERENCES reservations (id),
  released_at timestamptz NOT NULL,
  returned_at timestamptz,
  accessories_out jsonb NOT NULL DEFAULT '[]'::jsonb,
  accessories_back jsonb,
  CONSTRAINT loan_items_loan_fkey
    FOREIGN KEY (loan_id, partner_org_id)
    REFERENCES loans (id, partner_org_id)
);

-- A unit is on at most one open loan, whatever the calendar says.
CREATE UNIQUE INDEX loan_items_one_open_per_asset ON loan_items (asset_id) WHERE returned_at IS NULL;
CREATE INDEX loan_items_loan_id_idx ON loan_items (loan_id);
CREATE INDEX loan_items_asset_id_idx ON loan_items (asset_id);
CREATE INDEX loan_items_reservation_id_idx ON loan_items (reservation_id);

CREATE TABLE loan_extensions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  loan_id uuid NOT NULL,
  partner_org_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL REFERENCES users (id),
  requested_due_date date NOT NULL,
  reason text NOT NULL,
  status extension_status NOT NULL DEFAULT 'requested',
  decided_by_user_id uuid REFERENCES users (id),
  decided_at timestamptz,
  CONSTRAINT loan_extensions_loan_fkey
    FOREIGN KEY (loan_id, partner_org_id)
    REFERENCES loans (id, partner_org_id)
);

CREATE INDEX loan_extensions_loan_id_idx ON loan_extensions (loan_id);
CREATE INDEX loan_extensions_requested_by_user_id_idx ON loan_extensions (requested_by_user_id);
CREATE INDEX loan_extensions_decided_by_user_id_idx ON loan_extensions (decided_by_user_id);
