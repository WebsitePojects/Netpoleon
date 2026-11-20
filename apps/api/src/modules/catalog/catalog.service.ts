import type {
  CategoryWithCount,
  CreateCategoryBody,
  CreateLocationBody,
  CreateModelBody,
  LocationWithCount,
  Model,
  ModelAvailabilityQuery,
  ModelAvailabilityResponse,
} from '@wms/contracts';
import type { Database } from '@wms/db';
import { AppError } from '../../errors.js';
import type { AuditWriter } from '../../platform/audit.js';
import type { RequestContext } from '../../platform/context.js';
import { addDays } from '../../platform/dates.js';
import { idempotent, type Outcome } from '../../platform/idempotency.js';
import type { SettingsService } from '../../platform/settings.js';
import type { CatalogRepository } from './catalog.repository.js';

/** The kind each location kind must sit inside; a site sits at the top. */
const PARENT_KIND = { room: 'site', shelf: 'room' } as const;

export class CatalogService {
  constructor(
    private readonly db: Database,
    private readonly repo: CatalogRepository,
    private readonly settings: SettingsService,
    private readonly audit: AuditWriter,
  ) {}

  categories(ctx: RequestContext): Promise<CategoryWithCount[]> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.listCategories(tx));
  }

  locations(ctx: RequestContext): Promise<LocationWithCount[]> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.listLocations(tx));
  }

  models(ctx: RequestContext): Promise<Model[]> {
    return this.db.transaction(ctx.scope, (tx) => this.repo.listModels(tx));
  }

  /** The window is widened by the turnaround buffer, exactly as an approval would reserve it. */
  async availability(
    ctx: RequestContext,
    query: ModelAvailabilityQuery,
  ): Promise<ModelAvailabilityResponse> {
    const { turnaroundBufferDays } = await this.settings.get();
    const items = await this.db.transaction(ctx.scope, (tx) =>
      this.repo.availability(tx, query.from, addDays(query.until, turnaroundBufferDays)),
    );
    return { from: query.from, until: query.until, items };
  }

  createCategory(ctx: RequestContext, body: CreateCategoryBody): Promise<Outcome<{ id: string }>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        const created = await this.repo.createCategory(tx, body);
        await this.audit.record(tx, ctx, {
          action: 'category.create',
          targetType: 'category',
          targetId: created.id,
          fields: { name: body.name, code: body.code },
        });
        return { status: 201, body: created };
      }),
    );
  }

  createLocation(ctx: RequestContext, body: CreateLocationBody): Promise<Outcome<{ id: string }>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        if (body.kind !== 'site') {
          const parentKind = await this.repo.parentKind(tx, body.parentId);
          if (parentKind !== PARENT_KIND[body.kind]) {
            throw new AppError(
              422,
              'invalid_parent',
              `A ${body.kind} must be placed inside a ${PARENT_KIND[body.kind]}`,
            );
          }
        }
        const created = await this.repo.createLocation(tx, body);
        await this.audit.record(tx, ctx, {
          action: 'location.create',
          targetType: 'location',
          targetId: created.id,
          fields: { name: body.name, code: body.code, kind: body.kind },
        });
        return { status: 201, body: created };
      }),
    );
  }

  createModel(ctx: RequestContext, body: CreateModelBody): Promise<Outcome<{ id: string }>> {
    return this.db.transaction(ctx.scope, (tx) =>
      idempotent(tx, ctx, body, async () => {
        const created = await this.repo.createModel(tx, body);
        await this.audit.record(tx, ctx, {
          action: 'model.create',
          targetType: 'product_model',
          targetId: created.id,
          fields: { name: `${body.brand} ${body.name}` },
        });
        return { status: 201, body: created };
      }),
    );
  }
}
