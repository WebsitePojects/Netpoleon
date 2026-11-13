-- Identity: companies, people, sessions and single-use tokens.

CREATE TABLE partner_orgs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  type org_type NOT NULL,
  status org_status NOT NULL DEFAULT 'active'
);

CREATE UNIQUE INDEX partner_orgs_name_key ON partner_orgs (lower(name));

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email citext NOT NULL,
  full_name text NOT NULL,
  phone text,
  password_hash text,
  kind user_kind NOT NULL,
  role user_role NOT NULL,
  -- Null for staff; users_kind_role_org_consistent ties it to kind and role.
  partner_org_id uuid REFERENCES partner_orgs (id),
  status user_status NOT NULL DEFAULT 'invited',
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  CONSTRAINT users_email_key UNIQUE (email),
  CONSTRAINT users_kind_role_org_consistent CHECK (
    (kind = 'partner'
      AND role IN ('partner_admin', 'partner_member')
      AND partner_org_id IS NOT NULL)
    OR
    (kind = 'staff'
      AND role IN ('admin', 'manager', 'warehouse', 'auditor')
      AND partner_org_id IS NULL)
  ),
  CONSTRAINT users_active_has_password CHECK (status <> 'active' OR password_hash IS NOT NULL)
);

CREATE INDEX users_partner_org_id_idx ON users (partner_org_id);

-- Only the SHA-256 of the session token is stored, so a database read cannot replay a session.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  token_hash bytea NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip inet,
  user_agent text,
  CONSTRAINT sessions_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  token_hash bytea NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id),
  purpose auth_token_purpose NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CONSTRAINT auth_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX auth_tokens_user_id_idx ON auth_tokens (user_id);
