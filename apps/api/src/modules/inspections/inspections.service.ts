import type {
  InspectionQueuePage,
  InspectionQueueQuery,
  RecordInspectionBody,
  Unit,
} from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter } from '../../platform/audit.js';
import type { RequestContext } from '../../platform/context.js';
import { manilaToday } from '../../platform/dates.js';
import { offsetOf } from '../../platform/http.js';
import { idempotent, type Outcome } from '../../platform/idempotency.js';
import type { UnitsRepository, UnitState } from '../units/units.repository.js';
import type { InspectionsRepository } from './inspections.repository.js';

const notFound = () => new AppError(404, 'unit_not_found', 'No unit has that asset code');

/** Each outcome's movement out of inspection (migration 0010's lifecycle table). */
const OUTCOME_MOVE = {
  restock: { type: 'restocked', to: 'in_stock' },
  reassign: { type: 'restocked', to: 'in_stock' },
  repair: { type: 'sent_to_repair', to: 'for_repair' },
  retire: { type: 'retired', to: 'retired' },
} as const;

export class InspectionsService {
  constructor(
    private readonly db: Database,
    private readonly repo: InspectionsRepository,
    private readonly units: UnitsRepository,
    private readonly audit: AuditWriter,
  ) {}

  async queue(ctx: RequestContext, query: InspectionQueueQuery): Promise<InspectionQueuePage> {
    const result = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.queue(tx, query, offsetOf(query.page, query.pageSize)),
    );
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  start(ctx: RequestContext, code: string): Promise<Outcome<Unit>> {
    return this.mutate(ctx, code, {}, async (tx, unit) => {
      if (unit.status !== 'returned') {
        throw new AppError(409, 'invalid_status', `${code} is not waiting for inspection`);
      }
      await this.startIn(tx, ctx, unit);
    });
  }

  /**
   * Records the result and routes the unit in one transaction: graded, its booking completed,
   * then restocked, sent to repair or retired. A returned unit is started first, so the
   * history still shows the inspection step.
   */
  record(ctx: RequestContext, code: string, body: RecordInspectionBody): Promise<Outcome<Unit>> {
    return this.mutate(ctx, code, body, async (tx, unit) => {
      if (unit.status === 'returned') {
        await this.startIn(tx, ctx, unit);
      } else if (unit.status !== 'under_inspection') {
        throw new AppError(409, 'invalid_status', `${code} is not under inspection`);
      }
      if ('locationId' in body && (await this.repo.locationKind(tx, body.locationId)) !== 'shelf') {
        throw new AppError(422, 'not_a_shelf', 'Units are stocked on a shelf; choose a shelf');
      }
      const context = await this.repo.returnContext(tx, unit.id);
      const inspection = await this.repo.record(tx, {
        assetId: unit.id,
        loanItemId: context.loanItemId,
        inspectorId: ctx.actor.userId,
        grade: body.grade,
        checklist: body.checklist,
        missing: context.missing,
        notes: body.notes ?? null,
        outcome: body.outcome,
      });
      await this.repo.setCondition(tx, unit.id, body.grade);
      await this.repo.completeReservation(tx, context.reservationId);

      const move = OUTCOME_MOVE[body.outcome];
      await this.units.move(tx, {
        assetId: unit.id,
        type: move.type,
        from: 'under_inspection',
        to: move.to,
        toLocationId: 'locationId' in body ? body.locationId : null,
        actorUserId: ctx.actor.userId,
        note: 'reason' in body ? body.reason : (body.notes ?? null),
      });
      if (body.outcome === 'repair') {
        await this.units.openRepairTicket(tx, unit.id, ctx.actor.userId, body.reason);
      }
      if (body.outcome === 'retire') {
        await this.units.markRetired(tx, unit.id);
      }
      if (body.outcome === 'repair' || body.outcome === 'retire') {
        await this.units.flagFutureReservations(tx, unit.id, manilaToday());
      }
      await this.audit.record(tx, ctx, {
        action: 'inspection.record',
        targetType: 'inspection',
        targetId: inspection.id,
        fields: {
          label: code,
          outcome: body.outcome,
          condition: body.grade,
          missingAccessories: context.missing,
          note: body.notes ?? null,
        },
      });
    });
  }

  private async startIn(tx: Tx, ctx: RequestContext, unit: UnitState): Promise<void> {
    await this.units.move(tx, {
      assetId: unit.id,
      type: 'inspection_started',
      from: 'returned',
      to: 'under_inspection',
      actorUserId: ctx.actor.userId,
    });
  }

  private mutate(
    ctx: RequestContext,
    code: string,
    body: unknown,
    change: (tx: Tx, unit: UnitState) => Promise<void>,
  ): Promise<Outcome<Unit>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, { code, body }, async () => {
        const unit = await this.units.lockByCode(tx, code);
        if (!unit) throw notFound();
        await change(tx, unit);
        const reloaded = await this.units.byCode(tx, code);
        if (!reloaded) throw notFound();
        const { id: _id, ...shown } = reloaded;
        return { status: 200, body: shown };
      }),
    );
  }
}
