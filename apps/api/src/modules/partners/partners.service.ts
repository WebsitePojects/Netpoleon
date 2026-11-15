import type { Partner } from '@wms/contracts';
import type { ActorScope, Database, Tx } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter, RequestContext } from '../../platform/audit.js';
import { databaseError, UNIQUE_VIOLATION } from '../../platform/db-errors.js';
import {
  created,
  ok,
  type IdempotencyRequest,
  type MutationOutcome,
  type Mutations,
} from '../../platform/mutations.js';
import type { AuthRepository } from '../auth/auth.repository.js';
import type { PartnersRepository } from './partners.repository.js';

const NOT_FOUND = new AppError(404, 'partner_not_found', 'That partner company does not exist');

function duplicate(error: unknown): never {
  const failure = databaseError(error);
  if (failure?.code === UNIQUE_VIOLATION && failure.constraint === 'partner_orgs_name_key') {
    throw new AppError(409, 'name_taken', 'A company with this name already exists');
  }
  if (
    failure?.code === UNIQUE_VIOLATION &&
    failure.constraint === 'partner_contacts_org_email_key'
  ) {
    throw new AppError(409, 'contact_exists', 'This company already has a contact with that email');
  }
  throw error;
}

/**
 * Partner companies: partners, resellers, internal teams and branches (foundation spec
 * section 5). Archiving keeps every record and turns the company's portal accounts off.
 */
export class PartnersService {
  constructor(
    private readonly db: Database,
    private readonly mutations: Mutations,
    private readonly repository: PartnersRepository,
    private readonly auth: AuthRepository,
    private readonly audit: AuditWriter,
  ) {}

  list(scope: ActorScope): Promise<Partner[]> {
    return this.db.transaction(scope, (tx) => this.repository.list(tx));
  }

  detail(scope: ActorScope, id: string): Promise<Partner> {
    return this.db.transaction(scope, async (tx) => {
      const partner = await this.repository.byId(tx, id);
      if (!partner) throw NOT_FOUND;
      return partner;
    });
  }

  create(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    input: { name: string; type: Partner['type'] },
  ): Promise<MutationOutcome> {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        const id = await this.repository.insert(tx, input);
        await this.audit.record(tx, context, {
          action: 'partner.created',
          targetType: 'partner_org',
          targetId: id,
          fields: input,
        });
        return created(await this.view(tx, id));
      })
      .catch(duplicate);
  }

  edit(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    id: string,
    patch: { name?: string | undefined; type?: Partner['type'] | undefined },
  ): Promise<MutationOutcome> {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        if (!(await this.repository.lock(tx, id))) throw NOT_FOUND;
        await this.repository.update(tx, id, patch);
        await this.audit.record(tx, context, {
          action: 'partner.updated',
          targetType: 'partner_org',
          targetId: id,
          fields: patch,
        });
        return ok(await this.view(tx, id));
      })
      .catch(duplicate);
  }

  setArchived(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    id: string,
    archived: boolean,
  ): Promise<MutationOutcome> {
    return this.mutations.run(scope, idempotency, async (tx) => {
      const partner = await this.repository.lock(tx, id);
      if (!partner) throw NOT_FOUND;
      if (archived) {
        if ((await this.repository.openWork(tx, id)) > 0) {
          throw new AppError(
            409,
            'partner_busy',
            `${partner.name} still has open requests or units out. Close them before archiving.`,
          );
        }
        // Spec 15: archiving a company revokes every session it owns, in the same transaction.
        for (const userId of await this.repository.userIds(tx, id)) {
          await this.auth.revokeUserSessions(tx, userId);
        }
      }
      await this.repository.update(tx, id, { status: archived ? 'archived' : 'active' });
      await this.audit.record(tx, context, {
        action: archived ? 'partner.archived' : 'partner.restored',
        targetType: 'partner_org',
        targetId: id,
        fields: { status: archived ? 'archived' : 'active' },
      });
      return ok(await this.view(tx, id));
    });
  }

  addContact(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    id: string,
    input: { fullName: string; email: string; phone: string },
  ): Promise<MutationOutcome> {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        if (!(await this.repository.lock(tx, id))) throw NOT_FOUND;
        await this.repository.insertContact(tx, { partnerOrgId: id, ...input });
        // Contact details are personal data: the audit row names the fields, never the values.
        await this.audit.record(tx, context, {
          action: 'partner.contact_added',
          targetType: 'partner_org',
          targetId: id,
          fields: { contactName: input.fullName, contactEmail: input.email },
        });
        return created(await this.view(tx, id));
      })
      .catch(duplicate);
  }

  removeContact(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    id: string,
    contactId: string,
  ): Promise<MutationOutcome> {
    return this.mutations.run(scope, idempotency, async (tx) => {
      if (!(await this.repository.lock(tx, id))) throw NOT_FOUND;
      if (!(await this.repository.deleteContact(tx, id, contactId))) {
        throw new AppError(404, 'contact_not_found', 'That contact does not exist');
      }
      await this.audit.record(tx, context, {
        action: 'partner.contact_removed',
        targetType: 'partner_org',
        targetId: id,
      });
      return ok(await this.view(tx, id));
    });
  }

  private async view(tx: Tx, id: string): Promise<Partner> {
    const partner = await this.repository.byId(tx, id);
    if (!partner) throw NOT_FOUND;
    return partner;
  }
}
