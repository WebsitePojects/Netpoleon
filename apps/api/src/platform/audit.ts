import { schema, type Tx } from '@wms/db';

/** Who did it and from where, taken from the request; null fields mean "the system". */
export interface RequestContext {
  actorUserId: string | null;
  ip: string | null;
  requestId: string | null;
  userAgent: string | null;
}

export const SYSTEM_CONTEXT: RequestContext = {
  actorUserId: null,
  ip: null,
  requestId: null,
  userAgent: null,
};

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId: string | null;
  /** The fields this action changed, with their new values where they are safe to keep. */
  fields?: Record<string, unknown>;
}

/**
 * Fields whose values may be written to the audit log, per target type. The log can never be
 * scrubbed (it is append-only), so everything else is recorded by name only: a changed email
 * or phone number shows that it changed, never what it became. An unknown target type keeps
 * no values at all.
 */
const VALUE_SAFE: Readonly<Record<string, ReadonlySet<string>>> = {
  user: new Set(['role', 'status', 'kind']),
  session: new Set(['remember']),
  partner_org: new Set(['name', 'type', 'status']),
  category: new Set(['name', 'code']),
  product_model: new Set(['brand', 'modelName', 'isBookable', 'categoryId']),
  location: new Set(['name', 'code', 'kind', 'parentId']),
  asset: new Set([
    'assetCode',
    'serialNumber',
    'productModelId',
    'condition',
    'ownership',
    'ownerName',
    'locationId',
    'status',
    'note',
  ]),
  setting: new Set(['value']),
};

const CHANGED = '[changed]';

export function redactFields(
  targetType: string,
  fields: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const safe = VALUE_SAFE[targetType];
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields ?? {})) {
    out[name] = safe?.has(name) ? value : CHANGED;
  }
  return out;
}

/** Writes one audit row inside the caller's transaction, so the row and the change commit together. */
export class AuditWriter {
  async record(tx: Tx, context: RequestContext, entry: AuditEntry): Promise<void> {
    await tx.insert(schema.auditLog).values({
      actorUserId: context.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      changedFields: redactFields(entry.targetType, entry.fields),
      ip: context.ip,
      requestId: context.requestId,
    });
  }
}
