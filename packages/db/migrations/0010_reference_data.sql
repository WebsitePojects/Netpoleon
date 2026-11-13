-- Reference data only. There are no users here: the first admin is created on the server by a
-- one-time command, so no default credential exists anywhere.

-- The asset lifecycle. This table is the single place to learn what may follow what.
INSERT INTO asset_transitions (movement_type, from_status, to_status) VALUES
  ('registered',         'registered',       'registered'),
  ('stocked',            'registered',       'in_stock'),
  ('relocated',          'in_stock',         'in_stock'),
  ('released',           'in_stock',         'on_demo'),
  ('returned',           'on_demo',          'returned'),
  ('inspection_started', 'returned',         'under_inspection'),
  ('restocked',          'under_inspection', 'in_stock'),
  ('sent_to_repair',     'under_inspection', 'for_repair'),
  ('sent_to_repair',     'in_stock',         'for_repair'),
  ('repaired',           'for_repair',       'under_inspection'),
  ('retired',            'in_stock',         'retired'),
  ('retired',            'under_inspection', 'retired'),
  ('retired',            'for_repair',       'retired'),
  ('marked_lost',        'on_demo',          'lost'),
  ('marked_lost',        'in_stock',         'lost'),
  ('found',              'lost',             'under_inspection');

INSERT INTO categories (name, code) VALUES
  ('Firewall',       'FW'),
  ('Network Switch', 'SW'),
  ('Router',         'RT'),
  ('Access Point',   'AP'),
  ('Server',         'SRV'),
  ('Laptop',         'LT'),
  ('Storage',        'ST'),
  ('Other',          'OT');

INSERT INTO settings (key, value) VALUES
  ('booking.buffer_days',            '2'::jsonb),
  ('booking.max_days',               '30'::jsonb),
  ('booking.max_units',              '10'::jsonb),
  ('booking.pickup_grace_days',      '3'::jsonb),
  ('session.idle_hours',             '12'::jsonb),
  ('session.remember_days_staff',    '7'::jsonb),
  ('session.remember_days_partner',  '30'::jsonb);
