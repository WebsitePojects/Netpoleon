import type {
  BulkRelocateBody,
  BulkResult,
  CompleteRepairBody,
  ExportUnitsQuery,
  ListUnitsQuery,
  Movement,
  ReasonBody,
  RegisterUnitBody,
  RelocateUnitBody,
  Unit,
  UnitDetail,
  UpdateUnitBody,
} from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter } from '../../platform/audit.js';
import type { RequestContext } from '../../platform/context.js';
import { manilaToday } from '../../platform/dates.js';
import { CSV_ROW_LIMIT, offsetOf } from '../../platform/http.js';
import { idempotent, type Outcome } from '../../platform/idempotency.js';
import type { SettingsService } from '../../platform/settings.js';
import { movementCursor, type UnitsRepository, type UnitState } from './units.repository.js';

const DETAIL_MOVEMENTS = 20;

const notFound = () => new AppError(404, 'unit_not_found', 'No unit has that asset code');

/** A rule the unit's current status does not allow, named so the screen can say why. */
const wrongStatus = (code: string, status: string, doing: string) =>
  new AppError(
    409,
    'invalid_status',
    `${code} is ${status.replace('_', ' ')} and cannot be ${doing}`,
  );

export class UnitsService {
  constructor(
    private readonly db: Database,
    private readonly repo: UnitsRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditWriter,
  ) {}

  async list(ctx: RequestContext, query: ListUnitsQuery) {
    const { items, total } = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.list(tx, query, offsetOf(query.page, query.pageSize)),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** At most CSV_ROW_LIMIT rows, read and committed before the response streams (plan R16). */
  export(ctx: RequestContext, query: ExportUnitsQuery): Promise<Unit[]> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.export(tx, query, CSV_ROW_LIMIT));
  }

  async detail(ctx: RequestContext, code: string): Promise<UnitDetail> {
    const { turnaroundBufferDays } = await this.settings.get();
    return this.db.transaction(ctx.scope, async (tx) => {
      const unit = await this.repo.byCode(tx, code);
      if (!unit) throw notFound();
      const [own, reservations, movements] = await Promise.all([
        this.repo.ownership(tx, unit.id),
        this.repo.reservations(tx, unit.id, turnaroundBufferDays),
        this.repo.movements(tx, unit.id, DETAIL_MOVEMENTS + 1, undefined),
      ]);
      const page = (movements ?? []).slice(0, DETAIL_MOVEMENTS);
      const { id: _id, ...shown } = unit;
      return {
        ...shown,
        ...own,
        reservations,
        movements: page,
        movementsCursor:
          (movements?.length ?? 0) > DETAIL_MOVEMENTS
            ? movementCursor(page[page.length - 1] as Movement)
            : null,
      };
    });
  }

  async movements(ctx: RequestContext, code: string, cursor: string | undefined, limit: number) {
    return this.db.transaction(ctx.scope, async (tx) => {
      const unit = await this.repo.byCode(tx, code);
      if (!unit) throw notFound();
      const found = await this.repo.movements(tx, unit.id, limit + 1, cursor);
      if (!found) throw new AppError(400, 'invalid_cursor', 'The page cursor is not valid');
      const items = found.slice(0, limit);
      const last = items[items.length - 1];
      return { items, nextCursor: found.length > limit && last ? movementCursor(last) : null };
    });
  }

  /** Lifecycle steps 1 and 2 in one transaction: registered, then shelved. */
  register(ctx: RequestContext, body: RegisterUnitBody): Promise<Outcome<Unit>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        const category = await this.repo.modelCategory(tx, body.modelId);
        if (!category)
          throw new AppError(422, 'model_not_found', 'That product model does not exist');
        await this.requireShelf(tx, body.locationId);
        const created = await this.repo.insert(tx, {
          modelId: body.modelId,
          categoryCode: category.code,
          serial: body.serial,
          condition: body.condition,
          notes: body.notes ?? null,
        });
        const base = { assetId: created.id, actorUserId: ctx.actor.userId };
        await this.repo.move(tx, {
          ...base,
          type: 'registered',
          from: 'registered',
          to: 'registered',
        });
        await this.repo.move(tx, {
          ...base,
          type: 'stocked',
          from: 'registered',
          to: 'in_stock',
          toLocationId: body.locationId,
        });
        await this.audit.record(tx, ctx, {
          action: 'unit.register',
          targetType: 'asset',
          targetId: created.id,
          fields: { assetCode: created.code, serial: body.serial, condition: body.condition },
        });
        return { status: 201, body: await this.reload(tx, created.code) };
      }),
    );
  }

  update(ctx: RequestContext, code: string, body: UpdateUnitBody): Promise<Outcome<Unit>> {
    return this.mutate(ctx, code, body, async (tx, unit) => {
      await this.repo.update(tx, unit.id, body);
      await this.audit.record(tx, ctx, {
        action: 'unit.update',
        targetType: 'asset',
        targetId: unit.id,
        fields: { label: unit.code, ...body },
      });
    });
  }

  relocate(ctx: RequestContext, code: string, body: RelocateUnitBody): Promise<Outcome<Unit>> {
    return this.mutate(ctx, code, body, (tx, unit) =>
      this.relocateOne(tx, ctx, unit, body.locationId, body.note ?? null),
    );
  }

  /** One transaction for the whole batch; each unit succeeds or reports why it did not. */
  bulkRelocate(ctx: RequestContext, body: BulkRelocateBody): Promise<Outcome<BulkResult>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        await this.requireShelf(tx, body.locationId);
        const results: BulkResult['results'] = [];
        for (const code of body.codes) {
          const unit = await this.repo.lockByCode(tx, code);
          if (!unit) {
            results.push({
              key: code,
              ok: false,
              code: 'unit_not_found',
              message: 'No unit has that code',
            });
          } else if (unit.status !== 'in_stock') {
            results.push({
              key: code,
              ok: false,
              code: 'invalid_status',
              message: `${code} is not on a shelf`,
            });
          } else {
            await this.relocateOne(tx, ctx, unit, body.locationId, null);
            results.push({ key: code, ok: true });
          }
        }
        return { status: 200, body: { results } };
      }),
    );
  }

  sendToRepair(ctx: RequestContext, code: string, body: ReasonBody): Promise<Outcome<Unit>> {
    return this.mutate(ctx, code, body, async (tx, unit) => {
      if (unit.status !== 'in_stock' && unit.status !== 'under_inspection') {
        throw wrongStatus(unit.code, unit.status, 'sent to repair');
      }
      await this.repo.move(tx, {
        assetId: unit.id,
        type: 'sent_to_repair',
        from: unit.status,
        to: 'for_repair',
        actorUserId: ctx.actor.userId,
        note: body.reason,
      });
      await this.repo.openRepairTicket(tx, unit.id, ctx.actor.userId, body.reason);
      const flagged = await this.repo.flagFutureReservations(tx, unit.id, manilaToday());
      await this.audit.record(tx, ctx, {
        action: 'unit.send_to_repair',
        targetType: 'asset',
        targetId: unit.id,
        fields: { label: unit.code, reason: body.reason, flaggedReservations: flagged },
      });
    });
  }

  /** A repaired unit returns to inspection, never straight to the shelf (plan R13). */
  completeRepair(
    ctx: RequestContext,
    code: string,
    body: CompleteRepairBody,
  ): Promise<Outcome<Unit>> {
    return this.mutate(ctx, code, body, async (tx, unit) => {
      if (unit.status !== 'for_repair')
        throw wrongStatus(unit.code, unit.status, 'marked repaired');
      await this.repo.move(tx, {
        assetId: unit.id,
        type: 'repaired',
        from: 'for_repair',
        to: 'under_inspection',
        actorUserId: ctx.actor.userId,
        note: body.note ?? null,
      });
      await this.repo.closeRepairTicket(tx, unit.id, body.note ?? null);
      await this.audit.record(tx, ctx, {
        action: 'unit.repair_complete',
        targetType: 'asset',
        targetId: unit.id,
        fields: { label: unit.code, note: body.note ?? null },
      });
    });
  }

  retire(ctx: RequestContext, code: string, body: ReasonBody): Promise<Outcome<Unit>> {
    return this.mutate(ctx, code, body, async (tx, unit) => {
      if (!['in_stock', 'under_inspection', 'for_repair'].includes(unit.status)) {
        throw wrongStatus(unit.code, unit.status, 'retired');
      }
      await this.repo.move(tx, {
        assetId: unit.id,
        type: 'retired',
        from: unit.status,
        to: 'retired',
        actorUserId: ctx.actor.userId,
        note: body.reason,
      });
      await this.repo.markRetired(tx, unit.id);
      await this.repo.closeRepairTicket(tx, unit.id, `Retired: ${body.reason}`);
      const flagged = await this.repo.flagFutureReservations(tx, unit.id, manilaToday());
      await this.audit.record(tx, ctx, {
        action: 'unit.retire',
        targetType: 'asset',
        targetId: unit.id,
        fields: { label: unit.code, reason: body.reason, flaggedReservations: flagged },
      });
    });
  }

  private async relocateOne(
    tx: Tx,
    ctx: RequestContext,
    unit: UnitState,
    locationId: string,
    note: string | null,
  ): Promise<void> {
    if (unit.status !== 'in_stock')
      throw wrongStatus(unit.code, unit.status, 'moved between shelves');
    await this.requireShelf(tx, locationId);
    if (unit.locationId === locationId) {
      throw new AppError(409, 'same_location', `${unit.code} is already on that shelf`);
    }
    await this.repo.move(tx, {
      assetId: unit.id,
      type: 'relocated',
      from: 'in_stock',
      to: 'in_stock',
      toLocationId: locationId,
      actorUserId: ctx.actor.userId,
      note,
    });
    await this.audit.record(tx, ctx, {
      action: 'unit.relocate',
      targetType: 'asset',
      targetId: unit.id,
      fields: { label: unit.code, location: locationId },
    });
  }

  /** Locks the unit, runs the change, and answers with the unit as it now is. */
  private mutate(
    ctx: RequestContext,
    code: string,
    body: unknown,
    change: (tx: Tx, unit: UnitState) => Promise<void>,
  ): Promise<Outcome<Unit>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, { code, body }, async () => {
        const unit = await this.repo.lockByCode(tx, code);
        if (!unit) throw notFound();
        await change(tx, unit);
        return { status: 200, body: await this.reload(tx, code) };
      }),
    );
  }

  private async reload(tx: Tx, code: string): Promise<Unit> {
    const unit = await this.repo.byCode(tx, code);
    if (!unit) throw notFound();
    const { id: _id, ...shown } = unit;
    return shown;
  }

  private async requireShelf(tx: Tx, locationId: string): Promise<void> {
    if ((await this.repo.locationKind(tx, locationId)) !== 'shelf') {
      throw new AppError(422, 'not_a_shelf', 'Units are stocked on a shelf; choose a shelf');
    }
  }
}
