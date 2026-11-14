/**
 * The demo dataset's fixed content, ported from the browser demo (apps/web/src/data/seed.ts).
 * To add a model, append it to its category's `models`; to add a category, it must first exist
 * in the categories table (migration 0010 seeds them).
 */

/** The demo password for the four demo accounts: the owner's choice for demo data (R17). */
export const DEMO_PASSWORD = '123456';

/** The email of the seeded admin. Its presence is how the seed recognises its own data. */
export const SEED_MARKER_EMAIL = 'lara@netpoleon.example';

export interface ModelSpec {
  brand: string;
  model: string;
  accessories: readonly string[];
}

export interface CategorySpec {
  /** The categories.code seeded by migration 0010. */
  code: string;
  /** Units to generate: the per-category counts on the proposal cover (482 in all). */
  count: number;
  /** One aisle per category: its room and shelf codes start with this letter. */
  aisle: string;
  aisleName: string;
  models: readonly ModelSpec[];
}

const SWITCH_KIT = ['Power cord', 'Rack ears', 'Console cable'];
const AP_KIT = ['PoE injector', 'Mounting bracket'];
const FIREWALL_KIT = ['Power adapter', 'Console cable', 'Rack ears'];
const ROUTER_KIT = ['Power adapter', 'Ethernet cable'];
const SERVER_KIT = ['Power cords (2)', 'Rail kit', 'Bezel key'];
const LAPTOP_KIT = ['Charger', 'Carrying case'];

export const CATEGORY_SPECS: readonly CategorySpec[] = [
  {
    code: 'SW',
    count: 98,
    aisle: 'A',
    aisleName: 'Network Switch aisle',
    models: [
      { brand: 'Cisco', model: 'C9200L-24T', accessories: SWITCH_KIT },
      { brand: 'Aruba', model: 'CX 6200', accessories: SWITCH_KIT },
      { brand: 'MikroTik', model: 'CRS328', accessories: SWITCH_KIT },
      { brand: 'Ruijie', model: 'RG-S5300', accessories: SWITCH_KIT },
    ],
  },
  {
    code: 'AP',
    count: 66,
    aisle: 'B',
    aisleName: 'Access Point aisle',
    models: [
      { brand: 'Aruba', model: 'AP-515', accessories: AP_KIT },
      { brand: 'Ubiquiti', model: 'U6-Pro', accessories: AP_KIT },
      { brand: 'Cisco', model: 'Catalyst 9120', accessories: AP_KIT },
    ],
  },
  {
    code: 'FW',
    count: 78,
    aisle: 'C',
    aisleName: 'Firewall aisle',
    models: [
      { brand: 'Fortinet', model: 'FG-60F', accessories: FIREWALL_KIT },
      { brand: 'Palo Alto', model: 'PA-220', accessories: FIREWALL_KIT },
      { brand: 'Fortinet', model: 'FG-100F', accessories: FIREWALL_KIT },
      { brand: 'Sophos', model: 'XGS 136', accessories: FIREWALL_KIT },
    ],
  },
  {
    code: 'RT',
    count: 120,
    aisle: 'D',
    aisleName: 'Router aisle',
    models: [
      { brand: 'Cisco', model: 'ISR 1111', accessories: ROUTER_KIT },
      { brand: 'MikroTik', model: 'CCR2004', accessories: ROUTER_KIT },
      { brand: 'Ubiquiti', model: 'UDM-Pro', accessories: ROUTER_KIT },
    ],
  },
  {
    code: 'SRV',
    count: 38,
    aisle: 'E',
    aisleName: 'Server aisle',
    models: [
      { brand: 'HPE', model: 'DL360 Gen10', accessories: SERVER_KIT },
      { brand: 'Dell', model: 'PowerEdge R650', accessories: SERVER_KIT },
      { brand: 'Lenovo', model: 'SR630 V2', accessories: SERVER_KIT },
    ],
  },
  {
    code: 'LT',
    count: 82,
    aisle: 'F',
    aisleName: 'Laptop aisle',
    models: [
      { brand: 'Lenovo', model: 'ThinkPad T14', accessories: LAPTOP_KIT },
      { brand: 'Dell', model: 'Latitude 5440', accessories: LAPTOP_KIT },
      { brand: 'HP', model: 'EliteBook 840', accessories: LAPTOP_KIT },
    ],
  },
  { code: 'ST', count: 0, aisle: 'G', aisleName: 'Storage aisle', models: [] },
];

export const SHELVES_PER_AISLE = 4;

export type StaffRole = 'admin' | 'manager' | 'warehouse' | 'auditor';

export interface StaffSpec {
  username: string;
  fullName: string;
  title: string;
  role: StaffRole;
}

export const STAFF: readonly StaffSpec[] = [
  { username: 'lara', fullName: 'Lara', title: 'System Administrator', role: 'admin' },
  {
    username: 'tina',
    fullName: 'Cristina Imperial',
    title: 'Operations and Logistics Assistant',
    role: 'manager',
  },
  { username: 'marco', fullName: 'Marco Bautista', title: 'Warehouse Lead', role: 'warehouse' },
  { username: 'audit', fullName: 'Grace Lim', title: 'Internal Auditor', role: 'auditor' },
];

export type OrgType = 'partner' | 'reseller' | 'internal_team' | 'branch';

export interface BorrowerSpec {
  contactName: string;
  company: string;
  companyType: OrgType;
  domain: string;
}

export const BORROWERS: readonly BorrowerSpec[] = [
  {
    contactName: 'Juan Dela Cruz',
    company: 'ABC Technologies Inc.',
    companyType: 'partner',
    domain: 'abctech.example',
  },
  {
    contactName: 'Maria Santos',
    company: 'XYZ Technologies',
    companyType: 'reseller',
    domain: 'xyztech.example',
  },
  {
    contactName: 'Paolo Reyes',
    company: 'Techone Inc.',
    companyType: 'partner',
    domain: 'techone.example',
  },
  {
    contactName: 'Angela Lim',
    company: 'GlobalTech Corp.',
    companyType: 'reseller',
    domain: 'globaltech.example',
  },
  {
    contactName: 'Ramon Villanueva',
    company: 'Northwind Systems',
    companyType: 'partner',
    domain: 'northwind.example',
  },
  {
    contactName: 'Bianca Tan',
    company: 'Luzon Data Networks',
    companyType: 'reseller',
    domain: 'luzondata.example',
  },
  {
    contactName: 'Jerome Aquino',
    company: 'Visayas Integrators',
    companyType: 'partner',
    domain: 'visint.example',
  },
  {
    contactName: 'Katrina Uy',
    company: 'Metro Cloud Partners',
    companyType: 'partner',
    domain: 'metrocloud.example',
  },
  {
    contactName: 'Dennis Garcia',
    company: 'Netpoleon Presales Team',
    companyType: 'internal_team',
    domain: 'netpoleon.example',
  },
  {
    contactName: 'Liza Mendoza',
    company: 'Netpoleon Cebu Branch',
    companyType: 'branch',
    domain: 'netpoleon.example',
  },
];

export const PURPOSES: readonly string[] = [
  'Customer proof of concept',
  'Product demo',
  'Partner training',
  'Customer evaluation',
  'Trade show booth',
  'Presales lab test',
];

// Fictional on purpose: demo rows must not name a real organisation.
export const END_CUSTOMERS: readonly string[] = [
  'Harbor View Hospital',
  'Pinewood Savings Bank',
  'Lakeside University Lab',
  'Riverside Logistics Hub',
  'Summit City Hall',
];

export const REJECTION_REASONS: readonly string[] = [
  'No units of this model free for the requested dates.',
  'Requested length exceeds the demo policy for this model.',
  'Duplicate of an earlier request from the same partner.',
];
