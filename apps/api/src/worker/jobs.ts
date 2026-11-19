import type { Database, Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { manilaToday } from '../platform/dates.js';
import type { SettingsService } from '../platform/settings.js';
import { maybeOne, rowCount, rows } from '../platform/sql.js';

export interface Job {
  name: string;
  /** How often the job is due. */
  everyMs: number;
  run: (tx: Tx) => Promise<Record<string, number>>;
}

/**
 * Runs a job in one transaction under a transaction-level advisory lock (spec section 8): a
 * second worker finds the lock taken and skips, and the lock cannot outlive the transaction or
 * leak onto another pooled connection. Returns null when another worker held the lock.
 */
export async function runJob(db: Database, job: Job): Promise<Record<string, number> | null> {
  return db.transaction({ kind: 'system' }, async (tx) => {
    const lock = await maybeOne<{ ok: boolean }>(
      tx,
      sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`wms.job.${job.name}`}, 0)) AS ok`,
    );
    if (!lock?.ok) return null;
    return job.run(tx);
  });
}

const HOUR = 3_600_000;

export function scheduledJobs(settings: SettingsService): Job[] {
  return [
    {
      name: 'overdue-sweep',
      everyMs: HOUR,
      run: async (tx) => {
        const { overdueReminderDays } = await settings.get();
        const today = manilaToday();
        // D9: a unit still out when its next booking starts cannot serve that booking.
        const flagged = await rowCount(
          tx,
          sql`UPDATE reservations r SET status = 'needs_reassignment'
               WHERE r.status = 'active' AND lower(r.period) <= ${today}::date
                 AND EXISTS (SELECT 1 FROM loan_items li JOIN loans lo ON lo.id = li.loan_id
                              WHERE li.asset_id = r.asset_id AND li.returned_at IS NULL
                                AND lo.due_date < ${today}::date)`,
        );
        // One reminder per overdue loan every N days; the outbox row is the record of the last one.
        const due = await rows<{ id: string; due: string }>(
          tx,
          sql`SELECT t.loan_id AS id, t.due_date::text AS due
                FROM transaction_overview t
               WHERE t.is_overdue
                 AND NOT EXISTS (SELECT 1 FROM outbox o
                                  WHERE o.topic = 'mail.overdue_reminder'
                                    AND o.payload->>'loanId' = t.loan_id::text
                                    AND o.created_at > now() - make_interval(days => ${overdueReminderDays}))`,
        );
        for (const loan of due) {
          await tx.execute(sql`
            INSERT INTO outbox (topic, payload)
            VALUES ('mail.overdue_reminder', ${JSON.stringify({ loanId: loan.id, dueDate: loan.due })}::jsonb)`);
        }
        return { flagged, reminders: due.length };
      },
    },
    {
      name: 'pickup-expiry',
      everyMs: HOUR,
      run: async (tx) => {
        const { pickupGraceDays } = await settings.get();
        const today = manilaToday();
        // A booking nobody collected within the grace period frees its unit (spec section 6).
        const expired = await rowCount(
          tx,
          sql`UPDATE reservations r SET status = 'expired'
                FROM loan_request_items i JOIN loan_requests lr ON lr.id = i.loan_request_id
               WHERE i.id = r.loan_request_item_id AND r.status IN ('active', 'needs_reassignment')
                 AND lr.needed_from + ${pickupGraceDays}::int < ${today}::date`,
        );
        // Requests with nothing released and nothing left to collect are expired as a whole.
        const requests = await rowCount(
          tx,
          sql`UPDATE loan_requests lr SET status = 'expired',
                     decision_note = COALESCE(lr.decision_note, 'Not collected within the pickup period')
               WHERE lr.status = 'approved'
                 AND NOT EXISTS (SELECT 1 FROM loans lo WHERE lo.loan_request_id = lr.id)
                 AND NOT EXISTS (SELECT 1 FROM loan_request_items i JOIN reservations r ON r.loan_request_item_id = i.id
                                  WHERE i.loan_request_id = lr.id AND r.status IN ('active', 'needs_reassignment'))`,
        );
        return { reservations: expired, requests };
      },
    },
    {
      name: 'cleanup',
      everyMs: 6 * HOUR,
      run: async (tx) => ({
        sessions: await rowCount(
          tx,
          sql`DELETE FROM sessions WHERE absolute_expires_at < now() - interval '30 days'
                 OR revoked_at < now() - interval '30 days'`,
        ),
        idempotencyKeys: await rowCount(
          tx,
          sql`DELETE FROM idempotency_keys WHERE expires_at < now()`,
        ),
        tokens: await rowCount(
          tx,
          sql`DELETE FROM auth_tokens WHERE expires_at < now() - interval '30 days'`,
        ),
        outbox: await rowCount(
          tx,
          sql`DELETE FROM outbox WHERE status = 'done' AND updated_at < now() - interval '30 days'`,
        ),
      }),
    },
  ];
}
