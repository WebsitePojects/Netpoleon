import type { Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import type { RequestContext } from './context.js';

/**
 * Field names whose VALUES may be written to the append-only audit log. The log can never be
 * scrubbed, so anything else is recorded by name only: passwords, hashes, tokens, emails,
 * phone numbers and contact names never enter it (spec section 7).
 */
const VALUE_ALLOWED = new Set([
  'label',
  'status',
  'stage',
  'role',
  'title',
  'condition',
  'location',
  'assetCode',
  'assetCodes',
  'serial',
  'model',
  'category',
  'company',
  'transactionNumber',
  'quantity',
  'neededFrom',
  'neededUntil',
  'dueDate',
  'outcome',
  'reason',
  'note',
  'accessoriesOut',
  'accessoriesBack',
  'missingAccessories',
  'name',
  'code',
  'kind',
  'settings',
]);

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId: string | null;
  /** What changed. Values outside the allow-list are dropped; the name is kept. */
  fields?: Record<string, unknown>;
}

/** Who acted, for actions taken before there is a session (sign-in, reset link, worker jobs). */
export interface AuditOrigin {
  userId: string | null;
  requestId: string | null;
  ip: string | null;
}

export function originOf(ctx: RequestContext): AuditOrigin {
  return { userId: ctx.actor.userId, requestId: ctx.requestId, ip: ctx.ip };
}

export class AuditWriter {
  async record(tx: Tx, from: RequestContext | AuditOrigin, entry: AuditEntry): Promise<void> {
    const origin = 'actor' in from ? originOf(from) : from;
    const changed: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(entry.fields ?? {})) {
      if (value === undefined) continue;
      changed[field] = VALUE_ALLOWED.has(field) ? value : null;
    }
    await tx.execute(sql`
      INSERT INTO audit_log (actor_user_id, action, target_type, target_id, changed_fields, ip, request_id)
      VALUES (${origin.userId}, ${entry.action}, ${entry.targetType}, ${entry.targetId},
              ${JSON.stringify(changed)}::jsonb, ${origin.ip}::inet, ${origin.requestId})`);
  }
}
