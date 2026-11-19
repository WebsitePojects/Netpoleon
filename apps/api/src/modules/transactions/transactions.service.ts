import type {
  ApproveTransactionBody,
  BulkRejectBody,
  BulkResult,
  Candidates,
  CreateTransactionBody,
  ExportTransactionsQuery,
  ExtendTransactionBody,
  ListTransactionsQuery,
  ReleaseTransactionBody,
  ReturnTransactionBody,
  StageCounts,
  Transaction,
  TransactionDetail,
  TransactionReasonBody,
} from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter } from '../../platform/audit.js';
import type { RequestContext } from '../../platform/context.js';
import { daysBetween, manilaToday } from '../../platform/dates.js';
import { CSV_ROW_LIMIT, offsetOf } from '../../platform/http.js';
import { idempotent, type Outcome } from '../../platform/idempotency.js';
import { enqueue } from '../../platform/outbox.js';
import type { SettingsService } from '../../platform/settings.js';
import type { CatalogRepository } from '../catalog/catalog.repository.js';
import type { UnitsRepository } from '../units/units.repository.js';
import type {
  RequestState,
  TransactionRecord,
  TransactionsRepository,
} from './transactions.repository.js';

const notFound = () => new AppError(404, 'transaction_not_found', 'No transaction has that number');

/** Shown when the request moved on under the caller: two managers deciding at once, say. */
const notInStage = (number: string, doing: string) =>
  new AppError(409, 'invalid_stage', `${number} can no longer be ${doing}`);

/** Assignable physical states (spec section 6): never for repair, lost, retired or overdue. */
const ASSIGNABLE = new Set(['in_stock', 'returned', 'under_inspection', 'on_demo']);

function strip(record: TransactionRecord): Transaction {
  const { requestId: _r, loanId: _l, ...shown } = record;
  return shown;
}

export class TransactionsService {
  constructor(
    private readonly db: Database,
    private readonly repo: TransactionsRepository,
    private readonly units: UnitsRepository,
    private readonly catalog: CatalogRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditWriter,
  ) {}

  async list(ctx: RequestContext, query: ListTransactionsQuery) {
    const today = manilaToday();
    const { items, total } = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.list(tx, query, today, query.pageSize, offsetOf(query.page, query.pageSize)),
    );
    return { items: items.map(strip), total, page: query.page, pageSize: query.pageSize };
  }

  async export(ctx: RequestContext, query: ExportTransactionsQuery): Promise<Transaction[]> {
    const { items } = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.list(tx, query, manilaToday(), CSV_ROW_LIMIT, 0),
    );
    return items.map(strip);
  }

  stageCounts(ctx: RequestContext): Promise<StageCounts> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.stageCounts(tx));
  }

  async detail(ctx: RequestContext, number: string): Promise<TransactionDetail> {
    const { turnaroundBufferDays } = await this.settings.get();
    return this.db.transaction(ctx.scope, (tx) => this.detailIn(tx, number, turnaroundBufferDays));
  }

  /** Read fresh when the approve dialog opens (plan R6): never from a cached list. */
  async candidates(ctx: RequestContext, number: string): Promise<Candidates> {
    const { turnaroundBufferDays } = await this.settings.get();
    return this.db.transaction(ctx.scope, async (tx) => {
      const request = await this.repo.lockRequest(tx, number);
      if (!request) throw notFound();
      return this.repo.candidates(tx, request, turnaroundBufferDays);
    });
  }

  async create(
    ctx: RequestContext,
    body: CreateTransactionBody,
  ): Promise<Outcome<TransactionDetail>> {
    const settings = await this.settings.get();
    const today = manilaToday();
    if (body.neededFrom < today) {
      throw new AppError(422, 'start_in_past', 'The start date cannot be in the past');
    }
    if (daysBetween(body.neededFrom, body.neededUntil) + 1 > settings.maxLoanDays) {
      throw new AppError(422, 'too_long', `A loan can last at most ${settings.maxLoanDays} days`);
    }
    if (body.quantity > settings.maxUnitsPerRequest) {
      throw new AppError(
        422,
        'too_many',
        `A request can ask for at most ${settings.maxUnitsPerRequest} units`,
      );
    }
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        const model = await this.repo.modelForRequest(tx, body.modelId);
        if (!model) throw new AppError(422, 'model_not_found', 'That product model does not exist');
        if (!model.bookable)
          throw new AppError(422, 'not_bookable', 'That model is not available to book');
        const company =
          'id' in body.company
            ? { id: body.company.id, created: false }
            : await this.catalog.findOrCreatePartner(tx, body.company.name, body.company.type);
        const created = await this.repo.createRequest(tx, {
          year: today.slice(0, 4),
          partnerOrgId: company.id,
          filedBy: ctx.actor.userId,
          contact: body.contact,
          neededFrom: body.neededFrom,
          neededUntil: body.neededUntil,
          purpose: body.purpose,
          endCustomer: body.endCustomer,
        });
        await this.repo.addItem(tx, created.id, company.id, body.modelId, body.quantity);
        await this.audit.record(tx, ctx, {
          action: 'transaction.create',
          targetType: 'loan_request',
          targetId: created.id,
          fields: {
            transactionNumber: created.number,
            quantity: body.quantity,
            neededFrom: body.neededFrom,
            neededUntil: body.neededUntil,
            contact: true,
          },
        });
        return {
          status: 201,
          body: await this.detailIn(tx, created.number, settings.turnaroundBufferDays),
        };
      }),
    );
  }

  async approve(
    ctx: RequestContext,
    number: string,
    body: ApproveTransactionBody,
  ): Promise<Outcome<TransactionDetail>> {
    const { turnaroundBufferDays } = await this.settings.get();
    return this.change(ctx, number, body, async (tx, request) => {
      this.assertNotOwn(request, ctx);
      if (request.status !== 'submitted') throw notInStage(number, 'approved');
      if (body.assetCodes.length > request.quantityRequested) {
        throw new AppError(
          422,
          'too_many_units',
          `Assign at most ${request.quantityRequested} units`,
        );
      }
      for (const code of body.assetCodes) {
        const asset = await this.repo.lockAsset(tx, code);
        if (!asset) throw new AppError(422, 'unit_not_found', `No unit has the code ${code}`);
        if (asset.modelId !== request.modelId) {
          throw new AppError(422, 'wrong_model', `${code} is not the model that was requested`);
        }
        if (!ASSIGNABLE.has(asset.status) || asset.overdue) {
          throw new AppError(
            409,
            'unit_unavailable',
            `${code} is not in a state that can be promised`,
          );
        }
        // The exclusion constraint is the hard stop: an overlap raises 23P01 -> 409.
        await this.repo.reserve(
          tx,
          asset.id,
          request.itemId,
          request.neededFrom,
          request.neededUntil,
          turnaroundBufferDays,
        );
      }
      await this.repo.setAssigned(tx, request.itemId, body.assetCodes.length);
      if (
        !(await this.repo.decide(tx, request.id, ['submitted'], 'approved', ctx.actor.userId, null))
      ) {
        throw notInStage(number, 'approved');
      }
      await enqueue(tx, 'mail.request_decided', { requestId: request.id, decision: 'approved' });
      await this.audit.record(tx, ctx, {
        action: 'transaction.approve',
        targetType: 'loan_request',
        targetId: request.id,
        fields: { transactionNumber: number, assetCodes: body.assetCodes },
      });
    });
  }

  reject(
    ctx: RequestContext,
    number: string,
    body: TransactionReasonBody,
  ): Promise<Outcome<TransactionDetail>> {
    return this.change(ctx, number, body, (tx, request) =>
      this.rejectOne(tx, ctx, request, body.reason),
    );
  }

  bulkReject(ctx: RequestContext, body: BulkRejectBody): Promise<Outcome<BulkResult>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        const results: BulkResult['results'] = [];
        for (const number of body.numbers) {
          const request = await this.repo.lockRequest(tx, number);
          if (!request) {
            results.push({
              key: number,
              ok: false,
              code: 'transaction_not_found',
              message: 'Not found',
            });
            continue;
          }
          try {
            await this.rejectOne(tx, ctx, request, body.reason);
            results.push({ key: number, ok: true });
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            results.push({ key: number, ok: false, code: error.code, message: error.message });
          }
        }
        return { status: 200, body: { results } };
      }),
    );
  }

  /** Never writes decided_by: the filer may cancel their own request (plan R4). */
  cancel(
    ctx: RequestContext,
    number: string,
    body: TransactionReasonBody,
  ): Promise<Outcome<TransactionDetail>> {
    return this.change(ctx, number, body, async (tx, request) => {
      const note = `Cancelled by ${ctx.actor.name}: ${body.reason}`;
      if (
        !(await this.repo.decide(
          tx,
          request.id,
          ['submitted', 'approved'],
          'cancelled',
          null,
          note,
        ))
      ) {
        throw notInStage(number, 'cancelled');
      }
      // A request with a unit already out cannot be cancelled; that is a return.
      if ((await this.repo.loanFor(tx, request.id)) !== null) throw notInStage(number, 'cancelled');
      const released = await this.repo.cancelReservations(tx, request.id, 'cancelled');
      await this.audit.record(tx, ctx, {
        action: 'transaction.cancel',
        targetType: 'loan_request',
        targetId: request.id,
        fields: { transactionNumber: number, reason: body.reason, releasedReservations: released },
      });
    });
  }

  /**
   * Scans units out. The request row is locked first (plan R8), so two clerks releasing the same
   * request cannot both create its loan; the open-loan unique index stops a unit going out twice.
   */
  release(
    ctx: RequestContext,
    number: string,
    body: ReleaseTransactionBody,
  ): Promise<Outcome<TransactionDetail>> {
    return this.change(ctx, number, body, async (tx, request) => {
      if (request.status !== 'approved') throw notInStage(number, 'released');
      const allowed = new Set(await this.repo.accessoriesOf(tx, request.modelId));
      const loan =
        (await this.repo.loanFor(tx, request.id)) ??
        (await this.repo.createLoan(tx, request, ctx.actor.userId));
      for (const item of body.items) {
        const reservation = await this.repo.reservationFor(tx, request.id, item.scannedCode);
        if (!reservation || reservation.status === 'released') {
          throw new AppError(
            422,
            'wrong_unit',
            `${item.scannedCode} is not waiting to be released on ${number}`,
          );
        }
        if (reservation.status === 'needs_reassignment') {
          throw new AppError(
            409,
            'needs_reassignment',
            `${item.scannedCode} must be reassigned before release`,
          );
        }
        if (reservation.assetStatus !== 'in_stock') {
          throw new AppError(409, 'unit_not_ready', `${item.scannedCode} is not on the shelf yet`);
        }
        const unknown = item.accessoriesOut.filter((name) => !allowed.has(name));
        if (unknown.length > 0) {
          throw new AppError(
            422,
            'unknown_accessory',
            `Not an accessory of this model: ${unknown.join(', ')}`,
          );
        }
        const loanItem = await this.repo.addLoanItem(tx, {
          loanId: loan.id,
          partnerOrgId: request.partnerOrgId,
          assetId: reservation.assetId,
          reservationId: reservation.id,
          accessoriesOut: item.accessoriesOut,
        });
        await this.repo.setReservationStatus(tx, reservation.id, 'released');
        await this.units.move(tx, {
          assetId: reservation.assetId,
          type: 'released',
          from: 'in_stock',
          to: 'on_demo',
          actorUserId: ctx.actor.userId,
          loanItemId: loanItem.id,
        });
      }
      if ((await this.repo.waitingReservations(tx, request.id)) === 0) {
        await this.repo.decide(tx, request.id, ['approved'], 'fulfilled', null, null);
      }
      await this.audit.record(tx, ctx, {
        action: 'transaction.release',
        targetType: 'loan_request',
        targetId: request.id,
        fields: {
          transactionNumber: number,
          assetCodes: body.items.map((item) => item.scannedCode),
          accessoriesOut: body.items.map((item) => item.accessoriesOut),
        },
      });
    });
  }

  /** One unit back: it goes to "returned" and waits for inspection, which completes the reservation. */
  receive(
    ctx: RequestContext,
    number: string,
    body: ReturnTransactionBody,
  ): Promise<Outcome<TransactionDetail>> {
    return this.change(ctx, number, body, async (tx, request) => {
      const loan = await this.repo.loanFor(tx, request.id);
      const item = loan ? await this.repo.openItem(tx, loan.id, body.scannedCode) : null;
      if (!loan || !item) {
        throw new AppError(422, 'wrong_unit', `${body.scannedCode} is not out on ${number}`);
      }
      await this.repo.markReturned(tx, item.id, body.accessoriesBack);
      await this.units.move(tx, {
        assetId: item.assetId,
        type: 'returned',
        from: 'on_demo',
        to: 'returned',
        actorUserId: ctx.actor.userId,
        loanItemId: item.id,
        note: body.note ?? null,
      });
      await this.repo.closeLoanIfDone(tx, loan.id);
      await this.audit.record(tx, ctx, {
        action: 'transaction.return',
        targetType: 'loan_request',
        targetId: request.id,
        fields: {
          transactionNumber: number,
          assetCode: body.scannedCode,
          accessoriesBack: body.accessoriesBack,
        },
      });
    });
  }

  /** Staff extend directly (plan D6); the exclusion constraint refuses a clash with the next booking. */
  async extend(
    ctx: RequestContext,
    number: string,
    body: ExtendTransactionBody,
  ): Promise<Outcome<TransactionDetail>> {
    const settings = await this.settings.get();
    return this.change(ctx, number, body, async (tx, request) => {
      const loan = await this.repo.loanFor(tx, request.id);
      if (!loan) throw notInStage(number, 'extended');
      const { due, closed } = await this.repo.currentDueDate(tx, loan.id);
      if (closed) throw notInStage(number, 'extended');
      if (body.newDueDate <= due) {
        throw new AppError(422, 'not_later', 'The new return date must be after the current one');
      }
      if (daysBetween(request.neededFrom, body.newDueDate) + 1 > settings.maxLoanDays) {
        throw new AppError(422, 'too_long', `A loan can last at most ${settings.maxLoanDays} days`);
      }
      await this.repo.addExtension(
        tx,
        loan.id,
        request.partnerOrgId,
        ctx.actor.userId,
        body.newDueDate,
        body.reason,
      );
      await this.repo.extendReservations(
        tx,
        loan.id,
        body.newDueDate,
        settings.turnaroundBufferDays,
      );
      await this.audit.record(tx, ctx, {
        action: 'transaction.extend',
        targetType: 'loan_request',
        targetId: request.id,
        fields: { transactionNumber: number, dueDate: body.newDueDate, reason: body.reason },
      });
    });
  }

  private async rejectOne(
    tx: Tx,
    ctx: RequestContext,
    request: RequestState,
    reason: string,
  ): Promise<void> {
    this.assertNotOwn(request, ctx);
    if (
      !(await this.repo.decide(tx, request.id, ['submitted'], 'rejected', ctx.actor.userId, reason))
    ) {
      throw notInStage(request.number, 'rejected');
    }
    await enqueue(tx, 'mail.request_decided', { requestId: request.id, decision: 'rejected' });
    await this.audit.record(tx, ctx, {
      action: 'transaction.reject',
      targetType: 'loan_request',
      targetId: request.id,
      fields: { transactionNumber: request.number, reason },
    });
  }

  /** The person who filed a request may not decide it (spec section 5; CHECK in 0004). */
  private assertNotOwn(request: RequestState, ctx: RequestContext): void {
    if (request.filedBy === ctx.actor.userId) {
      throw new AppError(
        409,
        'own_request',
        'You filed this request, so someone else must decide it',
      );
    }
  }

  /** Locks the request, applies the change and answers with the transaction as it now is. */
  private async change(
    ctx: RequestContext,
    number: string,
    body: unknown,
    apply: (tx: Tx, request: RequestState) => Promise<void>,
  ): Promise<Outcome<TransactionDetail>> {
    const { turnaroundBufferDays } = await this.settings.get();
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, { number, body }, async () => {
        const request = await this.repo.lockRequest(tx, number);
        if (!request) throw notFound();
        await apply(tx, request);
        return { status: 200, body: await this.detailIn(tx, number, turnaroundBufferDays) };
      }),
    );
  }

  private async detailIn(tx: Tx, number: string, bufferDays: number): Promise<TransactionDetail> {
    const record = await this.repo.byNumber(tx, number, manilaToday());
    if (!record) throw notFound();
    const [units, extensions, accessories] = await Promise.all([
      this.repo.units(tx, record.requestId),
      record.loanId ? this.repo.extensions(tx, record.loanId) : Promise.resolve([]),
      this.repo.accessoriesOf(tx, record.model.id),
    ]);
    return { ...strip(record), accessories, units, extensions, bufferDays };
  }
}
