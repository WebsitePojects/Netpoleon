-- Partner directory: the people Netpoleon deals with at each borrowing company.
-- Expand only, like 0011: the previous app version never reads these, so it keeps working
-- while a deploy is in progress.

-- A request copies its contact's name, email and phone when it is filed (spec section 7), so
-- history never depends on this table. That is what lets a contact be edited, or deleted when
-- the person asks for their data to be erased, without rewriting any past request.
CREATE TABLE partner_contacts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  partner_org_id uuid NOT NULL REFERENCES partner_orgs (id),
  full_name text NOT NULL,
  email citext NOT NULL,
  phone text NOT NULL,
  -- Set each time a request is filed with this contact, so the request form offers the person
  -- used most recently first.
  last_used_at timestamptz,
  CONSTRAINT partner_contacts_name_length CHECK (char_length(full_name) BETWEEN 1 AND 200),
  CONSTRAINT partner_contacts_phone_length CHECK (char_length(phone) BETWEEN 7 AND 40)
);

-- One row per person per company. Its leading column also serves the foreign key.
CREATE UNIQUE INDEX partner_contacts_org_email_key ON partner_contacts (partner_org_id, email);

CREATE TRIGGER partner_contacts_touch_updated_at
  BEFORE UPDATE ON partner_contacts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Staff only. The partner role gets no grant at all, so no row-level security policy is
-- needed: a partner session cannot name the table.
GRANT SELECT, INSERT, UPDATE, DELETE ON partner_contacts TO wms_staff;

-- The directory shows "units out" per company; without this the count scans every loan item.
CREATE INDEX loan_items_open_org_idx ON loan_items (partner_org_id) WHERE returned_at IS NULL;
