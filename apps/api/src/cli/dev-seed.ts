import { passwordProblem } from '@wms/contracts';
import { ConfigError, loadConfig } from '@wms/config';
import { Database, schema, type Tx } from '@wms/db';
import { and, eq, sql } from 'drizzle-orm';
import { createLogger } from '../logging.js';
import { AssetsRepository } from '../modules/assets/assets.repository.js';
import { hashPassword } from '../platform/crypto.js';

/**
 * Development data: staff accounts, a warehouse with shelves, the demo catalogue, units on
 * the shelves and partner companies with contacts. Refuses to run in production (spec 15:
 * no default credentials exist anywhere), and takes the shared password from
 * WMS_DEV_PASSWORD so none is written in the repository. Safe to run twice: what exists is
 * left alone.
 *
 *   WMS_DEV_PASSWORD=… corepack pnpm --filter @wms/api dev-seed
 */

const STAFF = [
  {
    email: 'lara@netpoleon.example',
    fullName: 'Lara Aquino',
    role: 'admin',
    jobTitle: 'System Administrator',
  },
  {
    email: 'tina@netpoleon.example',
    fullName: 'Cristina Imperial',
    role: 'manager',
    jobTitle: 'Operations and Logistics',
  },
  {
    email: 'marco@netpoleon.example',
    fullName: 'Marco Bautista',
    role: 'warehouse',
    jobTitle: 'Warehouse Lead',
  },
  {
    email: 'jen@netpoleon.example',
    fullName: 'Jennifer Cruz',
    role: 'warehouse',
    jobTitle: 'Warehouse Staff',
  },
  {
    email: 'audit@netpoleon.example',
    fullName: 'Grace Lim',
    role: 'auditor',
    jobTitle: 'Internal Auditor',
  },
] as const;

const KITS = {
  SW: ['Power cord', 'Rack ears', 'Console cable'],
  AP: ['PoE injector', 'Mounting bracket'],
  FW: ['Power adapter', 'Console cable', 'Rack ears'],
  RT: ['Power adapter', 'Ethernet cable'],
  SRV: ['Power cords (2)', 'Rail kit', 'Bezel key'],
  LT: ['Charger', 'Carrying case'],
} as const;

const MODELS: { category: keyof typeof KITS; brand: string; model: string; units: number }[] = [
  { category: 'SW', brand: 'Cisco', model: 'C9200L-24T', units: 6 },
  { category: 'SW', brand: 'Aruba', model: 'CX 6200', units: 5 },
  { category: 'SW', brand: 'MikroTik', model: 'CRS328', units: 4 },
  { category: 'AP', brand: 'Aruba', model: 'AP-515', units: 5 },
  { category: 'AP', brand: 'Ubiquiti', model: 'U6-Pro', units: 4 },
  { category: 'FW', brand: 'Fortinet', model: 'FG-60F', units: 6 },
  { category: 'FW', brand: 'Palo Alto', model: 'PA-220', units: 4 },
  { category: 'FW', brand: 'Sophos', model: 'XGS 136', units: 3 },
  { category: 'RT', brand: 'Cisco', model: 'ISR 1111', units: 5 },
  { category: 'RT', brand: 'MikroTik', model: 'CCR2004', units: 4 },
  { category: 'SRV', brand: 'HPE', model: 'DL360 Gen10', units: 3 },
  { category: 'SRV', brand: 'Dell', model: 'PowerEdge R650', units: 2 },
  { category: 'LT', brand: 'Lenovo', model: 'ThinkPad T14', units: 5 },
  { category: 'LT', brand: 'Dell', model: 'Latitude 5440', units: 4 },
];

/** One aisle per category, four shelves each, plus the work areas and the client site. */
const AISLES: { code: string; category: keyof typeof KITS; name: string }[] = [
  { code: 'A', category: 'SW', name: 'Network Switch aisle' },
  { code: 'B', category: 'AP', name: 'Access Point aisle' },
  { code: 'C', category: 'FW', name: 'Firewall aisle' },
  { code: 'D', category: 'RT', name: 'Router aisle' },
  { code: 'E', category: 'SRV', name: 'Server aisle' },
  { code: 'F', category: 'LT', name: 'Laptop aisle' },
];

const PARTNERS = [
  {
    name: 'ABC Technologies Inc.',
    type: 'partner',
    contact: ['Juan Dela Cruz', 'juan.dela.cruz@abctech.example'],
  },
  {
    name: 'XYZ Technologies',
    type: 'partner',
    contact: ['Maria Santos', 'maria.santos@xyztech.example'],
  },
  {
    name: 'Techone Inc.',
    type: 'partner',
    contact: ['Paolo Reyes', 'paolo.reyes@techone.example'],
  },
  {
    name: 'Metro Cloud Partners',
    type: 'reseller',
    contact: ['Katrina Uy', 'katrina.uy@metrocloud.example'],
  },
  {
    name: 'Visayas Integrators',
    type: 'reseller',
    contact: ['Jerome Aquino', 'jerome.aquino@visint.example'],
  },
  {
    name: 'Netpoleon Presales Team',
    type: 'internal_team',
    contact: ['Dennis Garcia', 'dennis.garcia@netpoleon.example'],
  },
  {
    name: 'Netpoleon Cebu Branch',
    type: 'branch',
    contact: ['Liza Mendoza', 'liza.mendoza@netpoleon.example'],
  },
] as const;

async function location(
  tx: Tx,
  values: { code: string; name: string; kind: 'site' | 'room' | 'shelf'; parentId: string | null },
): Promise<string> {
  await tx.insert(schema.locations).values(values).onConflictDoNothing();
  const [row] = await tx
    .select({ id: schema.locations.id })
    .from(schema.locations)
    .where(eq(schema.locations.code, values.code));
  if (!row) throw new Error(`location ${values.code} is missing`);
  return row.id;
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`Invalid configuration. Fix: ${error.invalidKeys.join(', ')}\n`);
      process.exit(1);
    }
    throw error;
  }
  if (config.nodeEnv === 'production') {
    process.stderr.write('dev-seed refuses to run in production.\n');
    process.exit(1);
  }
  const password = process.env['WMS_DEV_PASSWORD'] ?? '';
  const problem = passwordProblem(password);
  if (problem) {
    process.stderr.write(`Set WMS_DEV_PASSWORD to the demo accounts' password. ${problem}\n`);
    process.exit(2);
  }

  const logger = createLogger('warn');
  const db = new Database(config.db, (err) => logger.error({ err }, 'database pool error'));
  const assets = new AssetsRepository();
  const passwordHash = await hashPassword(password);

  try {
    const summary = await db.transaction({ kind: 'system' }, async (tx) => {
      for (const person of STAFF) {
        await tx
          .insert(schema.users)
          .values({ ...person, kind: 'staff', status: 'active', passwordHash })
          .onConflictDoNothing();
      }
      const [marco] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, 'marco@netpoleon.example'));
      if (!marco) throw new Error('the warehouse lead account is missing');

      const site = await location(tx, {
        code: 'WH-PASIG',
        name: 'Pasig Warehouse',
        kind: 'site',
        parentId: null,
      });
      await location(tx, { code: 'CLIENT', name: 'Client sites', kind: 'site', parentId: null });
      for (const [code, name] of [
        ['RECEIVING', 'Receiving'],
        ['QA', 'QA Area'],
        ['REPAIR', 'Repair Bench'],
      ] as const) {
        await location(tx, { code, name, kind: 'room', parentId: site });
      }
      const shelvesByCategory = new Map<string, string[]>();
      for (const aisle of AISLES) {
        const room = await location(tx, {
          code: `AISLE-${aisle.code}`,
          name: aisle.name,
          kind: 'room',
          parentId: site,
        });
        const shelves: string[] = [];
        for (let index = 1; index <= 4; index += 1) {
          shelves.push(
            await location(tx, {
              code: `${aisle.code}-${String(index).padStart(2, '0')}`,
              name: `Shelf ${aisle.code}-${String(index).padStart(2, '0')}`,
              kind: 'shelf',
              parentId: room,
            }),
          );
        }
        shelvesByCategory.set(aisle.category, shelves);
      }

      let registered = 0;
      for (const spec of MODELS) {
        const [category] = await tx
          .select({ id: schema.categories.id })
          .from(schema.categories)
          .where(eq(schema.categories.code, spec.category));
        if (!category) throw new Error(`category ${spec.category} is not seeded`);
        await tx
          .insert(schema.productModels)
          .values({ categoryId: category.id, brand: spec.brand, modelName: spec.model })
          .onConflictDoNothing();
        const [model] = await tx
          .select({ id: schema.productModels.id })
          .from(schema.productModels)
          .where(
            and(
              sql`lower(${schema.productModels.brand}) = lower(${spec.brand})`,
              sql`lower(${schema.productModels.modelName}) = lower(${spec.model})`,
            ),
          );
        if (!model) throw new Error(`model ${spec.model} is missing`);
        for (const name of KITS[spec.category]) {
          await tx
            .insert(schema.modelAccessories)
            .values({ productModelId: model.id, name })
            .onConflictDoNothing();
        }

        const [existing] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.assets)
          .where(eq(schema.assets.productModelId, model.id));
        const shelves = shelvesByCategory.get(spec.category) ?? [];
        for (let index = existing?.count ?? 0; index < spec.units; index += 1) {
          const assetCode = await assets.nextAssetCode(tx, spec.category);
          const prefix = spec.brand.slice(0, 2).toUpperCase();
          const id = await assets.insert(tx, {
            assetCode,
            serialNumber: `${prefix}${assetCode.slice(-5)}${String(index).padStart(3, '0')}`,
            productModelId: model.id,
            condition: index % 5 === 4 ? 'b' : 'a',
            ownership: 'owned',
            ownerName: null,
            notes: null,
          });
          await assets.insertMovement(tx, {
            assetId: id,
            type: 'registered',
            fromStatus: 'registered',
            toStatus: 'registered',
            toLocationId: null,
            actorUserId: marco.id,
            note: 'Development seed',
          });
          await assets.insertMovement(tx, {
            assetId: id,
            type: 'stocked',
            fromStatus: 'registered',
            toStatus: 'in_stock',
            toLocationId: shelves[index % shelves.length] ?? null,
            actorUserId: marco.id,
            note: null,
          });
          registered += 1;
        }
      }

      for (const partner of PARTNERS) {
        await tx
          .insert(schema.partnerOrgs)
          .values({ name: partner.name, type: partner.type })
          .onConflictDoNothing();
        const [org] = await tx
          .select({ id: schema.partnerOrgs.id })
          .from(schema.partnerOrgs)
          .where(sql`lower(${schema.partnerOrgs.name}) = lower(${partner.name})`);
        if (!org) throw new Error(`partner ${partner.name} is missing`);
        await tx
          .insert(schema.partnerContacts)
          .values({
            partnerOrgId: org.id,
            fullName: partner.contact[0],
            email: partner.contact[1],
            phone: '0917 000 1000',
          })
          .onConflictDoNothing();
      }
      return { registered };
    });
    process.stdout.write(
      `Development data ready: ${STAFF.length} staff accounts, ${PARTNERS.length} partners, ${summary.registered} new units.\n` +
        `Sign in as ${STAFF.map((person) => person.email).join(', ')} with WMS_DEV_PASSWORD.\n`,
    );
  } finally {
    await db.close();
  }
}

await main();
