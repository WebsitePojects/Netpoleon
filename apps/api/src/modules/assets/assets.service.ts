import type {
  AssetDetail,
  AssetListQuery,
  AssetStatus,
  BatchResult,
  EditAssetBody,
  RegisterAssetBody,
} from '@wms/contracts';
import type { ActorScope, Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter, RequestContext } from '../../platform/audit.js';
import { databaseError, STATUS_CHANGED, UNIQUE_VIOLATION } from '../../platform/db-errors.js';
import {
  created,
  ok,
  type IdempotencyRequest,
  type MutationOutcome,
  type Mutations,
} from '../../platform/mutations.js';
import type { AssetRow, AssetsRepository } from './assets.repository.js';

const HISTORY_LIMIT = 100;

const NOT_FOUND = new AppError(404, 'asset_not_found', 'No unit has that asset code');

function actorOf(scope: ActorScope): string {
  if (scope.kind === 'system') throw new Error('A unit change needs a person as the actor.');
  return scope.userId;
}

/** Maps the database's own refusals to answers a person can act on. */
function explain(error: unknown): never {
  const failure = databaseError(error);
  if (failure?.code === UNIQUE_VIOLATION && failure.constraint === 'assets_model_serial_key') {
    throw new AppError(409, 'serial_taken', 'A unit of this model already has that serial number');
  }
  if (failure?.code === STATUS_CHANGED) {
    throw new AppError(
      409,
      'status_changed',
      'The unit changed while you were working. Reload and try again.',
    );
  }
  throw error;
}

/** Why a unit cannot take a step, in words, or null when it can. */
type Refusal = string | null;

/**
 * Units: registration, stocking, edits, shelf moves, repair and retirement (build order step
 * 5). Every status or shelf change is a movement row; the database applies it and refuses
 * one the lifecycle does not allow, so the checks here only exist to give a clear message.
 */
export class AssetsService {
  constructor(
    private readonly db: Database,
    private readonly mutations: Mutations,
    private readonly repository: AssetsRepository,
    private readonly audit: AuditWriter,
  ) {}

  list(scope: ActorScope, query: AssetListQuery) {
    return this.db.transaction(scope, async (tx) => {
      const page = await this.repository.list(tx, query);
      return {
        items: page.items.map(({ currentLocationId: _, ...asset }) => asset),
        nextCursor: page.nextCursor,
        total: page.total,
      };
    });
  }

  detail(scope: ActorScope, code: string): Promise<AssetDetail> {
    return this.db.transaction(scope, async (tx) => {
      const asset = await this.repository.byCode(tx, code);
      if (!asset) throw NOT_FOUND;
      return this.detailOf(tx, asset);
    });
  }

  register(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    input: RegisterAssetBody,
  ): Promise<MutationOutcome> {
    const actor = actorOf(scope);
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        const categoryCode = await this.repository.modelCategoryCode(tx, input.productModelId);
        if (!categoryCode) throw new AppError(400, 'unknown_model', 'That model does not exist');
        if (input.ownership === 'vendor_consigned' && !input.ownerName) {
          throw new AppError(400, 'owner_required', 'Name the vendor that owns a consigned unit');
        }
        await this.requireShelf(tx, input.locationId);

        const assetCode = await this.repository.nextAssetCode(tx, categoryCode);
        const id = await this.repository.insert(tx, {
          assetCode,
          serialNumber: input.serialNumber,
          productModelId: input.productModelId,
          condition: input.condition,
          ownership: input.ownership,
          ownerName: input.ownership === 'owned' ? null : input.ownerName,
          notes: input.notes,
        });
        // Encoded, then shelved: two movements, so the history shows both steps of the proposal.
        await this.repository.insertMovement(tx, {
          assetId: id,
          type: 'registered',
          fromStatus: 'registered',
          toStatus: 'registered',
          toLocationId: null,
          actorUserId: actor,
          note: null,
        });
        await this.repository.insertMovement(tx, {
          assetId: id,
          type: 'stocked',
          fromStatus: 'registered',
          toStatus: 'in_stock',
          toLocationId: input.locationId,
          actorUserId: actor,
          note: null,
        });
        await this.audit.record(tx, context, {
          action: 'asset.registered',
          targetType: 'asset',
          targetId: id,
          fields: {
            assetCode,
            serialNumber: input.serialNumber,
            productModelId: input.productModelId,
            locationId: input.locationId,
          },
        });
        const asset = await this.repository.byCode(tx, assetCode);
        if (!asset) throw new Error('The unit just registered could not be read back.');
        return created(await this.detailOf(tx, asset));
      })
      .catch(explain);
  }

  edit(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    code: string,
    patch: EditAssetBody,
  ): Promise<MutationOutcome> {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        const asset = await this.repository.byCode(tx, code, true);
        if (!asset) throw NOT_FOUND;
        const ownership = patch.ownership ?? asset.ownership;
        const ownerName = patch.ownerName !== undefined ? patch.ownerName : asset.ownerName;
        if (ownership === 'vendor_consigned' && !ownerName) {
          throw new AppError(400, 'owner_required', 'Name the vendor that owns a consigned unit');
        }
        await this.repository.update(tx, asset.id, {
          ...patch,
          ...(ownership === 'owned' ? { ownerName: null } : {}),
        });
        await this.audit.record(tx, context, {
          action: 'asset.edited',
          targetType: 'asset',
          targetId: asset.id,
          fields: patch,
        });
        const updated = await this.repository.byCode(tx, code);
        if (!updated) throw NOT_FOUND;
        return ok(await this.detailOf(tx, updated));
      })
      .catch(explain);
  }

  /** Moves one unit to another shelf. Only a unit in stock moves; anything else stays put. */
  move(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    code: string,
    locationId: string,
  ): Promise<MutationOutcome> {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        await this.requireShelf(tx, locationId);
        const asset = await this.repository.byCode(tx, code, true);
        if (!asset) throw NOT_FOUND;
        const refusal = await this.relocate(tx, scope, context, asset, locationId);
        if (refusal) throw new AppError(409, 'cannot_move', refusal);
        const moved = await this.repository.byCode(tx, code);
        if (!moved) throw NOT_FOUND;
        return ok(await this.detailOf(tx, moved));
      })
      .catch(explain);
  }

  /**
   * Moves many units in one transaction. A unit that cannot move is skipped with its reason
   * instead of failing the rest, so the person sees exactly which ones did not go.
   */
  moveMany(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    codes: string[],
    locationId: string,
  ): Promise<MutationOutcome> {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        await this.requireShelf(tx, locationId);
        const unique = [...new Set(codes)];
        const found = new Map(
          (await this.repository.byCodes(tx, unique)).map((asset) => [asset.assetCode, asset]),
        );
        const result: BatchResult = { done: [], skipped: [] };
        for (const code of unique) {
          const asset = found.get(code);
          const refusal = asset
            ? await this.relocate(tx, scope, context, asset, locationId)
            : 'No unit has that asset code';
          if (refusal) result.skipped.push({ code, reason: refusal });
          else result.done.push(code);
        }
        return ok(result);
      })
      .catch(explain);
  }

  sendToRepair(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    code: string,
    reason: string,
  ): Promise<MutationOutcome> {
    return this.step(scope, context, idempotency, code, {
      type: 'sent_to_repair',
      from: ['in_stock', 'under_inspection'],
      to: 'for_repair',
      note: reason,
      action: 'asset.sent_to_repair',
      flagsReservations: true,
    });
  }

  /** A repaired unit goes back through inspection before it can be lent (the lifecycle table). */
  repairComplete(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    code: string,
    note: string | null,
  ): Promise<MutationOutcome> {
    return this.step(scope, context, idempotency, code, {
      type: 'repaired',
      from: ['for_repair'],
      to: 'under_inspection',
      note,
      action: 'asset.repaired',
      flagsReservations: false,
    });
  }

  retire(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    code: string,
    reason: string,
  ): Promise<MutationOutcome> {
    return this.step(scope, context, idempotency, code, {
      type: 'retired',
      from: ['in_stock', 'under_inspection', 'for_repair'],
      to: 'retired',
      note: reason,
      action: 'asset.retired',
      flagsReservations: true,
    });
  }

  private step(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    code: string,
    move: {
      type: 'sent_to_repair' | 'repaired' | 'retired';
      from: AssetStatus[];
      to: AssetStatus;
      note: string | null;
      action: string;
      flagsReservations: boolean;
    },
  ): Promise<MutationOutcome> {
    const actor = actorOf(scope);
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        const asset = await this.repository.byCode(tx, code, true);
        if (!asset) throw NOT_FOUND;
        if (!move.from.includes(asset.status)) {
          throw new AppError(
            409,
            'wrong_status',
            `This step needs the unit to be ${move.from.join(' or ').replace(/_/g, ' ')}; it is ${asset.status.replace(/_/g, ' ')}`,
          );
        }
        await this.repository.insertMovement(tx, {
          assetId: asset.id,
          type: move.type,
          fromStatus: asset.status,
          toStatus: move.to,
          toLocationId: null,
          actorUserId: actor,
          note: move.note,
        });
        if (move.to === 'retired')
          await this.repository.update(tx, asset.id, { retiredAt: new Date() });
        const flagged = move.flagsReservations
          ? await this.repository.flagFutureReservations(tx, asset.id)
          : 0;
        await this.audit.record(tx, context, {
          action: move.action,
          targetType: 'asset',
          targetId: asset.id,
          fields: { status: move.to, ...(move.note ? { note: move.note } : {}) },
        });
        const updated = await this.repository.byCode(tx, code);
        if (!updated) throw NOT_FOUND;
        return ok({ ...(await this.detailOf(tx, updated)), reservationsFlagged: flagged });
      })
      .catch(explain);
  }

  private async relocate(
    tx: Tx,
    scope: ActorScope,
    context: RequestContext,
    asset: AssetRow,
    locationId: string,
  ): Promise<Refusal> {
    if (asset.status !== 'in_stock') {
      return `It is ${asset.status.replace(/_/g, ' ')}; only units in stock change shelf`;
    }
    if (asset.currentLocationId === locationId) return 'It is already on that shelf';
    await this.repository.insertMovement(tx, {
      assetId: asset.id,
      type: 'relocated',
      fromStatus: 'in_stock',
      toStatus: 'in_stock',
      toLocationId: locationId,
      actorUserId: actorOf(scope),
      note: null,
    });
    await this.audit.record(tx, context, {
      action: 'asset.relocated',
      targetType: 'asset',
      targetId: asset.id,
      fields: { locationId },
    });
    return null;
  }

  private async requireShelf(tx: Tx, locationId: string): Promise<void> {
    if ((await this.repository.locationKind(tx, locationId)) !== 'shelf') {
      throw new AppError(400, 'not_a_shelf', 'Choose a shelf: units are stocked on shelves');
    }
  }

  private async detailOf(tx: Tx, asset: AssetRow): Promise<AssetDetail> {
    const { currentLocationId: _, ...view } = asset;
    return {
      asset: view,
      accessories: await this.repository.accessories(tx, asset.model.id),
      movements: await this.repository.movements(tx, asset.id, HISTORY_LIMIT),
    };
  }
}
