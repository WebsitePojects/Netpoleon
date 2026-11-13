-- Catalogue and stock: what exists, where it sits, and the individual units.

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  code text NOT NULL,
  CONSTRAINT categories_name_key UNIQUE (name),
  CONSTRAINT categories_code_key UNIQUE (code),
  CONSTRAINT categories_code_format CHECK (code ~ '^[A-Z]{2,4}$')
);

CREATE TABLE product_models (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  category_id uuid NOT NULL REFERENCES categories (id),
  brand text NOT NULL,
  model_name text NOT NULL,
  is_bookable boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX product_models_brand_model_key
  ON product_models (lower(brand), lower(model_name));
CREATE INDEX product_models_category_id_idx ON product_models (category_id);

CREATE TABLE model_accessories (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  product_model_id uuid NOT NULL REFERENCES product_models (id),
  name text NOT NULL
);

-- Leads with product_model_id, so it also serves the foreign key.
CREATE UNIQUE INDEX model_accessories_model_name_key
  ON model_accessories (product_model_id, lower(name));

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  parent_id uuid REFERENCES locations (id),
  kind location_kind NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  CONSTRAINT locations_code_key UNIQUE (code)
);

CREATE INDEX locations_parent_id_idx ON locations (parent_id);

-- status and current_location_id are changed only by the apply_asset_movement() trigger in
-- 0006; the app roles have no UPDATE privilege on them (see 0008).
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  asset_code text NOT NULL,
  serial_number text NOT NULL,
  product_model_id uuid NOT NULL REFERENCES product_models (id),
  status asset_status NOT NULL DEFAULT 'registered',
  condition condition_grade NOT NULL DEFAULT 'a',
  current_location_id uuid REFERENCES locations (id),
  ownership ownership_type NOT NULL DEFAULT 'owned',
  owner_name text,
  retired_at timestamptz,
  CONSTRAINT assets_asset_code_key UNIQUE (asset_code),
  CONSTRAINT assets_model_serial_key UNIQUE (product_model_id, serial_number),
  CONSTRAINT assets_asset_code_format CHECK (asset_code ~ '^NTP-[A-Z]{2,4}-[0-9]{5}$'),
  CONSTRAINT assets_consigned_has_owner CHECK (ownership = 'owned' OR owner_name IS NOT NULL)
);

CREATE INDEX assets_status_idx ON assets (status);
CREATE INDEX assets_model_status_idx ON assets (product_model_id, status);
CREATE INDEX assets_current_location_id_idx ON assets (current_location_id);
