import type { SeededRandom } from './random.js';
import type { AssetRow, AssetStatus, MovementRow, MovementType } from './rows.js';

const ONE_MINUTE_MS = 60_000;

/**
 * One unit and its history. A unit's status changes only by recording a movement here, the same
 * rule the database enforces, so the status the plan ends with is exactly what the database's
 * apply_asset_movement trigger computes from these rows.
 */
export class UnitTimeline {
  readonly asset: AssetRow;
  readonly accessories: readonly string[];
  /** Shelves of the unit's own aisle, where it is stocked and restocked. */
  readonly shelfIds: readonly string[];
  private readonly sink: MovementRow[];
  private readonly random: SeededRandom;
  private readonly now: Date;
  private currentStatus: AssetStatus = 'registered';
  private lastMovedAt = 0;

  constructor(opts: {
    asset: AssetRow;
    accessories: readonly string[];
    shelfIds: readonly string[];
    sink: MovementRow[];
    random: SeededRandom;
    now: Date;
  }) {
    this.asset = opts.asset;
    this.accessories = opts.accessories;
    this.shelfIds = opts.shelfIds;
    this.sink = opts.sink;
    this.random = opts.random;
    this.now = opts.now;
  }

  get status(): AssetStatus {
    return this.currentStatus;
  }

  /**
   * Records a move from the current status. A move is never earlier than the previous one
   * (it is nudged a minute later), because the trigger applies them in insertion order.
   */
  move(
    type: MovementType,
    toStatus: AssetStatus,
    at: Date,
    actorUserId: string,
    options: { toLocationId?: string | null; loanItemId?: string | null; note: string },
  ): Date {
    const occurredAt = new Date(Math.max(at.getTime(), this.lastMovedAt + ONE_MINUTE_MS));
    if (occurredAt.getTime() > this.now.getTime()) {
      // Deterministic data, so this is a bug in a scenario, caught on the first run.
      throw new Error(
        `Seed bug: ${this.asset.assetCode} ${type} at ${occurredAt.toISOString()} is in the future.`,
      );
    }
    this.sink.push({
      id: this.random.uuidV7(occurredAt),
      assetId: this.asset.id,
      movementType: type,
      fromStatus: this.currentStatus,
      toStatus,
      toLocationId: options.toLocationId ?? null,
      actorUserId,
      loanItemId: options.loanItemId ?? null,
      note: options.note,
      occurredAt,
    });
    this.currentStatus = toStatus;
    this.lastMovedAt = occurredAt.getTime();
    return occurredAt;
  }

  /** A shelf in the unit's aisle, for stocking and restocking. */
  pickShelf(): string {
    return this.random.pick(this.shelfIds);
  }
}
