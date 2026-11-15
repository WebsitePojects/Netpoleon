import type { Catalog } from '@wms/contracts';
import type { ActorScope, Database } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter, RequestContext } from '../../platform/audit.js';
import { databaseError, UNIQUE_VIOLATION } from '../../platform/db-errors.js';
import { created, type IdempotencyRequest, type Mutations } from '../../platform/mutations.js';
import type { CatalogRepository } from './catalog.repository.js';

const DUPLICATES: Record<string, string> = {
  categories_name_key: 'A category with this name already exists',
  categories_code_key: 'A category already uses this code',
  locations_code_key: 'A location already uses this code',
  product_models_brand_model_key: 'This brand and model already exist',
};

/** Turns a unique-key collision into a 409 that says which value is taken. */
export function duplicateAs409(error: unknown): never {
  const failure = databaseError(error);
  const message = failure?.constraint ? DUPLICATES[failure.constraint] : undefined;
  if (failure?.code === UNIQUE_VIOLATION && message) {
    throw new AppError(409, 'already_exists', message);
  }
  throw error;
}

/** Categories, product models and locations: reference data behind every dropdown. */
export class CatalogService {
  constructor(
    private readonly db: Database,
    private readonly mutations: Mutations,
    private readonly repository: CatalogRepository,
    private readonly audit: AuditWriter,
  ) {}

  catalog(scope: ActorScope): Promise<Catalog> {
    return this.db.transaction(scope, (tx) => this.repository.catalog(tx));
  }

  createCategory(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    input: { name: string; code: string },
  ) {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        const category = await this.repository.insertCategory(tx, input);
        await this.audit.record(tx, context, {
          action: 'category.created',
          targetType: 'category',
          targetId: category.id,
          fields: input,
        });
        return created(category);
      })
      .catch(duplicateAs409);
  }

  createLocation(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    input: { name: string; code: string; kind: 'site' | 'room' | 'shelf'; parentId: string | null },
  ) {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        if (input.kind === 'site' && input.parentId !== null) {
          throw new AppError(400, 'invalid_location', 'A site sits at the top: it has no parent');
        }
        if (input.kind !== 'site') {
          const parentKind = input.parentId
            ? await this.repository.locationKind(tx, input.parentId)
            : null;
          const allowed = input.kind === 'room' ? 'site' : 'room';
          if (parentKind !== allowed) {
            throw new AppError(
              400,
              'invalid_location',
              `A ${input.kind} must sit inside a ${allowed}`,
            );
          }
        }
        const id = await this.repository.insertLocation(tx, input);
        await this.audit.record(tx, context, {
          action: 'location.created',
          targetType: 'location',
          targetId: id,
          fields: input,
        });
        return created({ id });
      })
      .catch(duplicateAs409);
  }

  createModel(
    scope: ActorScope,
    context: RequestContext,
    idempotency: IdempotencyRequest,
    input: {
      categoryId: string;
      brand: string;
      modelName: string;
      isBookable: boolean;
      accessories: string[];
    },
  ) {
    return this.mutations
      .run(scope, idempotency, async (tx) => {
        if (!(await this.repository.categoryExists(tx, input.categoryId))) {
          throw new AppError(400, 'unknown_category', 'That category does not exist');
        }
        const { accessories, ...model } = input;
        const id = await this.repository.insertModel(tx, model, accessories);
        await this.audit.record(tx, context, {
          action: 'product_model.created',
          targetType: 'product_model',
          targetId: id,
          fields: model,
        });
        return created({ id });
      })
      .catch(duplicateAs409);
  }
}
