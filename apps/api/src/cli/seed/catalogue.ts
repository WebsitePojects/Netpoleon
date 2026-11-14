import type { SeedClock } from './clock.js';
import { CATEGORY_SPECS, SHELVES_PER_AISLE, type CategorySpec } from './dataset.js';
import type { SeededRandom } from './random.js';
import type {
  AssetRow,
  LocationRow,
  ModelAccessoryRow,
  MovementRow,
  ProductModelRow,
} from './rows.js';
import { UnitTimeline } from './timeline.js';

/** The fixed places units move between, besides their aisle's shelves. */
export interface WorkAreas {
  receiving: string;
  qa: string;
  repairBench: string;
  /** Where a unit on demo is shown: outside the warehouse. */
  clientSite: string;
}

export interface Catalogue {
  locations: LocationRow[];
  productModels: ProductModelRow[];
  modelAccessories: ModelAccessoryRow[];
  assets: AssetRow[];
  areas: WorkAreas;
  /** Every unit, registered and stocked, in asset-code order. */
  units: UnitTimeline[];
  /** Highest sequence used per asset-code prefix, for advancing the counters (R17). */
  lastAssetSequence: Map<string, number>;
}

// No I or O: on a label they read as 1 and 0.
const SERIAL_ALPHABET = [...'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'];

/** `NTP-<category>-<5 digits>`, as CHECK assets_asset_code_format requires. */
export function assetCode(categoryCode: string, sequence: number): string {
  return `${assetCodePrefix(categoryCode)}-${String(sequence).padStart(5, '0')}`;
}

/** The counters prefix that numbers a category's asset codes. */
export function assetCodePrefix(categoryCode: string): string {
  return `NTP-${categoryCode}`;
}

/**
 * Builds the location tree (one site, an aisle room per category with its shelves, and the
 * work areas as rooms), the models and their accessories, and every unit with its
 * registered and stocked movements.
 */
export class CatalogueBuilder {
  private readonly random: SeededRandom;
  private readonly clock: SeedClock;
  private readonly movements: MovementRow[];
  private readonly registrarUserId: string;
  private readonly usedSerials = new Set<string>();
  private readonly locations: LocationRow[] = [];

  constructor(opts: {
    random: SeededRandom;
    clock: SeedClock;
    movements: MovementRow[];
    registrarUserId: string;
  }) {
    this.random = opts.random;
    this.clock = opts.clock;
    this.movements = opts.movements;
    this.registrarUserId = opts.registrarUserId;
  }

  build(): Catalogue {
    const siteId = this.location(null, 'site', 'MAIN', 'Main Warehouse');
    const areas: WorkAreas = {
      receiving: this.location(siteId, 'room', 'RECEIVING', 'Receiving'),
      qa: this.location(siteId, 'room', 'QA', 'QA Area'),
      repairBench: this.location(siteId, 'room', 'REPAIR', 'Repair Bench'),
      clientSite: this.location(null, 'site', 'CLIENT', 'Client site (on demo)'),
    };

    const productModels: ProductModelRow[] = [];
    const modelAccessories: ModelAccessoryRow[] = [];
    const assets: AssetRow[] = [];
    const units: UnitTimeline[] = [];
    const lastAssetSequence = new Map<string, number>();

    for (const category of CATEGORY_SPECS) {
      const shelfIds = this.aisle(siteId, category);
      const models = category.models.map((spec) => {
        const model: ProductModelRow = {
          id: this.random.uuidV7(this.clock.workingHour(540, this.random)),
          categoryCode: category.code,
          brand: spec.brand,
          modelName: spec.model,
        };
        productModels.push(model);
        for (const name of spec.accessories) {
          modelAccessories.push({
            id: this.random.uuidV7(this.clock.now),
            productModelId: model.id,
            name,
          });
        }
        return { model, accessories: spec.accessories };
      });

      for (let sequence = 1; sequence <= category.count; sequence += 1) {
        const { model, accessories } = this.random.pick(models);
        const unit = this.registerUnit(category.code, sequence, model, accessories, shelfIds);
        assets.push(unit.asset);
        units.push(unit);
      }
      if (category.count > 0) {
        lastAssetSequence.set(assetCodePrefix(category.code), category.count);
      }
    }

    return {
      locations: this.locations,
      productModels,
      modelAccessories,
      assets,
      areas,
      units,
      lastAssetSequence,
    };
  }

  private location(
    parentId: string | null,
    kind: LocationRow['kind'],
    code: string,
    name: string,
  ): string {
    const id = this.random.uuidV7(this.clock.workingHour(540, this.random));
    this.locations.push({ id, parentId, kind, code, name });
    return id;
  }

  /** The category's aisle room and its shelves; returns the shelf ids. */
  private aisle(siteId: string, category: CategorySpec): string[] {
    const roomId = this.location(siteId, 'room', `MAIN-${category.aisle}`, category.aisleName);
    return Array.from({ length: SHELVES_PER_AISLE }, (_, index) => {
      const shelf = `${category.aisle}-${String(index + 1).padStart(2, '0')}`;
      return this.location(roomId, 'shelf', shelf, `Shelf ${shelf}`);
    });
  }

  private registerUnit(
    categoryCode: string,
    sequence: number,
    model: ProductModelRow,
    accessories: readonly string[],
    shelfIds: readonly string[],
  ): UnitTimeline {
    const registeredAt = this.clock.workingHour(this.random.between(215, 520), this.random);
    const scuffed = !this.random.chance(0.82);
    const asset: AssetRow = {
      id: this.random.uuidV7(registeredAt),
      assetCode: assetCode(categoryCode, sequence),
      serialNumber: this.serial(model.brand),
      productModelId: model.id,
      condition: scuffed ? 'b' : 'a',
      notes: scuffed ? 'Light scuffs on the casing; fully working.' : null,
      retiredAt: null,
      createdAt: registeredAt,
    };
    const unit = new UnitTimeline({
      asset,
      accessories,
      shelfIds,
      sink: this.movements,
      random: this.random,
      now: this.clock.now,
    });
    unit.move('registered', 'registered', registeredAt, this.registrarUserId, {
      note: 'Unit registered',
    });
    unit.move('stocked', 'in_stock', registeredAt, this.registrarUserId, {
      toLocationId: unit.pickShelf(),
      note: 'Stocked on its shelf',
    });
    return unit;
  }

  /** Brand prefix plus nine characters, unique across the whole seed. */
  private serial(brand: string): string {
    for (;;) {
      let body = '';
      for (let index = 0; index < 9; index += 1) {
        body += this.random.pick(SERIAL_ALPHABET);
      }
      const value = `${brand.slice(0, 2).toUpperCase()}${body}`;
      if (!this.usedSerials.has(value)) {
        this.usedSerials.add(value);
        return value;
      }
    }
  }
}
