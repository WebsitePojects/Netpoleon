-- Fields the staff console shows that the first schema left out.

-- A person's job title, shown next to their name. Not personal data in the Data Privacy Act
-- sense, but it is free text, so the audit log records only that it changed.
ALTER TABLE users ADD COLUMN job_title text;

-- Free-text notes on a unit (a dent, a missing rubber foot). Changed through the edit screen,
-- never through a movement, because they say nothing about where the unit is.
ALTER TABLE assets ADD COLUMN notes text;
GRANT INSERT (notes), UPDATE (notes) ON assets TO wms_staff;

-- The people at a partner company Netpoleon deals with. A loan copies the contact's details
-- when it is filed (spec section 7), so a contact can be edited or removed without rewriting
-- history, and removing one is how a person's data is erased on request.
CREATE TABLE partner_contacts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  partner_org_id uuid NOT NULL REFERENCES partner_orgs (id),
  full_name text NOT NULL,
  email citext NOT NULL,
  phone text NOT NULL DEFAULT '',
  CONSTRAINT partner_contacts_org_email_key UNIQUE (partner_org_id, email)
);

CREATE TRIGGER partner_contacts_touch_updated_at
  BEFORE UPDATE ON partner_contacts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Staff only. The partner role gets no grant at all: grants remove whole tables (spec 15).
GRANT SELECT, INSERT, UPDATE, DELETE ON partner_contacts TO wms_staff;
