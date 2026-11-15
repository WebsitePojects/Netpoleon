import { auditEntrySchema, auditQuerySchema, type AuditEntry } from '@wms/contracts';
import { schema, type Database } from '@wms/db';
import { and, desc, eq, like, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission, requireSession } from '../../plugins/session.js';

const { auditLog, users } = schema;

interface Cursor {
  at: string;
  id: string;
}

function decode(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;
    return typeof parsed.at === 'string' && typeof parsed.id === 'string'
      ? { at: parsed.at, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

/**
 * The activity log, newest first, by keyset on (occurred_at, id) so a deep page costs the same
 * as the first. Read-only: the table cannot be changed by anyone (spec section 7).
 */
export function auditRoutes(db: Database): FastifyPluginCallbackZod {
  return (app, _options, done) => {
    app.get(
      '/api/v1/audit',
      {
        preHandler: requirePermission('audit.view'),
        schema: {
          querystring: auditQuerySchema,
          response: {
            200: z.strictObject({
              items: z.array(auditEntrySchema),
              nextCursor: z.string().nullable(),
            }),
          },
        },
      },
      (request) =>
        db.transaction(requireSession(request).scope, async (tx) => {
          const { actorId, action, limit } = request.query;
          const cursor = decode(request.query.cursor);
          const conditions: (SQL | undefined)[] = [
            actorId ? eq(auditLog.actorUserId, actorId) : undefined,
            action ? like(auditLog.action, `${action}%`) : undefined,
            cursor
              ? sql`(${auditLog.occurredAt}, ${auditLog.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
              : undefined,
          ];
          const rows = await tx
            .select({
              id: auditLog.id,
              occurredAt: auditLog.occurredAt,
              actorId: auditLog.actorUserId,
              actorName: users.fullName,
              action: auditLog.action,
              targetType: auditLog.targetType,
              targetId: auditLog.targetId,
              changedFields: auditLog.changedFields,
            })
            .from(auditLog)
            .leftJoin(users, eq(users.id, auditLog.actorUserId))
            .where(and(...conditions))
            .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
            .limit(limit + 1);
          const items: AuditEntry[] = rows.slice(0, limit).map((row) => ({
            ...row,
            occurredAt: row.occurredAt.toISOString(),
            changedFields: row.changedFields as Record<string, unknown>,
          }));
          const last = items.at(-1);
          return {
            items,
            nextCursor:
              rows.length > limit && last
                ? Buffer.from(JSON.stringify({ at: last.occurredAt, id: last.id })).toString(
                    'base64url',
                  )
                : null,
          };
        }),
    );
    done();
  };
}
