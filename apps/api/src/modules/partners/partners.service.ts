import type {
  AddContactBody,
  CreatePartnerBody,
  ListDirectoryQuery,
  ListPartnersQuery,
  Partner,
  PartnerDetail,
  UpdatePartnerBody,
} from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter } from '../../platform/audit.js';
import type { RequestContext } from '../../platform/context.js';
import { offsetOf } from '../../platform/http.js';
import { idempotent, type Outcome } from '../../platform/idempotency.js';
import type { SessionService } from '../../platform/session.js';
import type { PartnerState, PartnersRepository } from './partners.repository.js';

const notFound = () => new AppError(404, 'partner_not_found', 'No partner company has that id');

/**
 * Borrowing companies (partners, resellers, internal teams, branches) and the people
 * Netpoleon deals with at each. Nothing here is ever hard-deleted except a contact, whose
 * details every past request already holds a copy of.
 */
export class PartnersService {
  constructor(
    private readonly db: Database,
    private readonly repo: PartnersRepository,
    private readonly sessions: SessionService,
    private readonly audit: AuditWriter,
  ) {}

  suggest(ctx: RequestContext, query: ListPartnersQuery): Promise<Partner[]> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.suggest(tx, query.q, query.limit));
  }

  async directory(ctx: RequestContext, query: ListDirectoryQuery) {
    const { items, total } = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.directory(tx, query, offsetOf(query.page, query.pageSize)),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  detail(ctx: RequestContext, id: string): Promise<PartnerDetail> {
    return this.db.transaction(ctx.scope, (tx) => this.reload(tx, id));
  }

  create(ctx: RequestContext, body: CreatePartnerBody): Promise<Outcome<PartnerDetail>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        await this.assertNameFree(tx, body.name, null);
        const created = await this.repo.create(tx, body);
        await this.audit.record(tx, ctx, {
          action: 'partner.create',
          targetType: 'partner_org',
          targetId: created.id,
          fields: { name: body.name, kind: body.type },
        });
        return { status: 201, body: await this.reload(tx, created.id) };
      }),
    );
  }

  update(
    ctx: RequestContext,
    id: string,
    body: UpdatePartnerBody,
  ): Promise<Outcome<PartnerDetail>> {
    return this.change(ctx, id, body, async (tx) => {
      if (body.name !== undefined) await this.assertNameFree(tx, body.name, id);
      await this.repo.update(tx, id, body);
      await this.audit.record(tx, ctx, {
        action: 'partner.update',
        targetType: 'partner_org',
        targetId: id,
        fields: { name: body.name, kind: body.type },
      });
    });
  }

  /**
   * Archiving hides the company from the request form and signs out its portal accounts, in
   * the same transaction. Refused while it has open work: a company with units out must stay
   * reachable until they come back.
   */
  setArchived(ctx: RequestContext, id: string, archived: boolean): Promise<Outcome<PartnerDetail>> {
    return this.change(ctx, id, { archived }, async (tx, partner) => {
      const target = archived ? 'archived' : 'active';
      if (partner.status === target) return;
      if (archived) {
        const work = await this.repo.openWork(tx, id);
        if (work.openRequests > 0 || work.unitsOut > 0) {
          throw new AppError(
            409,
            'partner_busy',
            `${partner.name} has ${work.openRequests} open request(s) and ${work.unitsOut} unit(s) out. Close them before archiving.`,
          );
        }
        for (const userId of await this.repo.userIds(tx, id)) {
          await this.sessions.revokeAll(tx, userId);
        }
      }
      await this.repo.setStatus(tx, id, target);
      await this.audit.record(tx, ctx, {
        action: archived ? 'partner.archive' : 'partner.restore',
        targetType: 'partner_org',
        targetId: id,
        fields: { status: target },
      });
    });
  }

  addContact(
    ctx: RequestContext,
    id: string,
    body: AddContactBody,
  ): Promise<Outcome<PartnerDetail>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, { id, ...body }, async () => {
        const partner = await this.repo.lock(tx, id);
        if (!partner) throw notFound();
        if (partner.status === 'archived') {
          throw new AppError(
            409,
            'partner_archived',
            `${partner.name} is archived; restore it first`,
          );
        }
        if (await this.repo.hasContact(tx, id, body.email)) {
          throw new AppError(
            409,
            'contact_exists',
            `${partner.name} already has a contact with that email`,
          );
        }
        await this.repo.addContact(tx, id, body);
        // Contact details are personal data: the log says a contact was added, never who.
        await this.audit.record(tx, ctx, {
          action: 'partner.contact_add',
          targetType: 'partner_org',
          targetId: id,
          fields: { contact: true },
        });
        return { status: 201, body: await this.reload(tx, id) };
      }),
    );
  }

  removeContact(
    ctx: RequestContext,
    id: string,
    contactId: string,
  ): Promise<Outcome<PartnerDetail>> {
    return this.change(ctx, id, { contactId }, async (tx) => {
      if ((await this.repo.removeContact(tx, id, contactId)) === 0) {
        throw new AppError(404, 'contact_not_found', 'That company has no contact with that id');
      }
      await this.audit.record(tx, ctx, {
        action: 'partner.contact_remove',
        targetType: 'partner_org',
        targetId: id,
        fields: { contact: true },
      });
    });
  }

  /** One locked, idempotent change to a company, answered with its fresh detail. */
  private change(
    ctx: RequestContext,
    id: string,
    body: object,
    apply: (tx: Tx, partner: PartnerState) => Promise<void>,
  ): Promise<Outcome<PartnerDetail>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, { id, ...body }, async () => {
        const partner = await this.repo.lock(tx, id);
        if (!partner) throw notFound();
        await apply(tx, partner);
        return { status: 200, body: await this.reload(tx, id) };
      }),
    );
  }

  /** The unique index is the real guard; this only turns the common case into a clear message. */
  private async assertNameFree(tx: Tx, name: string, exceptId: string | null): Promise<void> {
    if (await this.repo.nameTaken(tx, name, exceptId))
      throw new AppError(409, 'name_taken', 'A company with that name already exists');
  }

  private async reload(tx: Tx, id: string): Promise<PartnerDetail> {
    const summary = await this.repo.summary(tx, id);
    if (!summary) throw notFound();
    return { ...summary, contacts: await this.repo.contacts(tx, id) };
  }
}
