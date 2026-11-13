-- Extensions, enumerations and the one shared trigger function.
-- Enumerations are Postgres enum types so an unknown value cannot be stored.

CREATE EXTENSION IF NOT EXISTS btree_gist; -- lets the reservations exclusion constraint mix = and &&
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

CREATE TYPE user_kind AS ENUM ('staff', 'partner');
CREATE TYPE user_role AS ENUM (
  'admin', 'manager', 'warehouse', 'auditor', 'partner_admin', 'partner_member'
);
CREATE TYPE user_status AS ENUM ('invited', 'active', 'deactivated');
CREATE TYPE org_type AS ENUM ('partner', 'reseller', 'internal_team', 'branch');
CREATE TYPE org_status AS ENUM ('active', 'archived');

-- 'registered' is a unit that is encoded but not yet shelved; it must not count as available.
CREATE TYPE asset_status AS ENUM (
  'registered', 'in_stock', 'on_demo', 'returned', 'under_inspection', 'for_repair', 'retired', 'lost'
);
CREATE TYPE ownership_type AS ENUM ('owned', 'vendor_consigned');
CREATE TYPE request_status AS ENUM (
  'submitted', 'approved', 'rejected', 'cancelled', 'expired', 'fulfilled'
);
CREATE TYPE reservation_status AS ENUM (
  'active', 'needs_reassignment', 'released', 'completed', 'cancelled', 'expired'
);
CREATE TYPE movement_type AS ENUM (
  'registered', 'stocked', 'relocated', 'released', 'returned', 'inspection_started',
  'restocked', 'sent_to_repair', 'repaired', 'retired', 'marked_lost', 'found'
);
CREATE TYPE inspection_outcome AS ENUM ('restock', 'repair', 'reassign', 'retire');
CREATE TYPE condition_grade AS ENUM ('a', 'b', 'c', 'd');
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'done', 'failed');
CREATE TYPE auth_token_purpose AS ENUM ('invite', 'password_reset');
CREATE TYPE location_kind AS ENUM ('site', 'room', 'shelf');
CREATE TYPE extension_status AS ENUM ('requested', 'approved', 'rejected');

-- Keeps updated_at honest without every repository remembering to set it. Attached to every
-- table that has the column at the end of 0007.
CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION touch_updated_at() FROM PUBLIC;
