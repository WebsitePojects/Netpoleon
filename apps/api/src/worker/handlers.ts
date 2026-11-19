import type { Database } from '@wms/db';
import { sql } from 'drizzle-orm';
import type { Mailer } from '../platform/mailer.js';
import type { OutboxTopic, OutboxTopics } from '../platform/outbox.js';
import { maybeOne } from '../platform/sql.js';
import { issueToken } from '../platform/tokens.js';
import type { ClaimedJob, Handler } from './dispatcher.js';

/**
 * What each queued side effect does. Mails carry the minimum the proposal allows: a greeting,
 * the request or loan number and a link to sign in. No serial numbers, customers or lists.
 */
export function mailHandlers(
  db: Database,
  mailer: Mailer,
  appOrigin: string,
): Record<OutboxTopic, Handler> {
  const payload = <K extends OutboxTopic>(job: ClaimedJob) => job.payload as OutboxTopics[K];

  /**
   * Invitation and reset links: only the token's hash is stored, so the link is minted here, at
   * send time, which also retires any earlier link. A link an admin copied before the mail went
   * out stops working; the mail is the one that counts.
   */
  const linkMail =
    (purpose: 'invite' | 'password_reset', path: string, subject: string, intro: string): Handler =>
    async (job) => {
      const { userId } = payload<'mail.invite'>(job);
      const mail = await db.transaction({ kind: 'system' }, async (tx) => {
        const user = await maybeOne<{ email: string; name: string; status: string }>(
          tx,
          sql`SELECT email::text AS email, full_name AS name, status FROM users WHERE id = ${userId}`,
        );
        if (!user || user.status === 'deactivated') return null;
        const issued = await issueToken(tx, userId, purpose);
        return {
          to: user.email,
          subject,
          text: `Hello ${user.name},\n\n${intro}\n\n${appOrigin}${path}${issued.token}\n\nThe link works once and expires ${issued.expiresAt.toUTCString()}.\n\nNetpoleon WMS`,
          reference: job.id,
        };
      });
      if (mail) await mailer.send(mail);
    };

  return {
    'mail.invite': linkMail(
      'invite',
      '/accept-invite/',
      'Your Netpoleon WMS account',
      'You have been given an account on Netpoleon WMS. Choose your password here:',
    ),
    'mail.password_reset': linkMail(
      'password_reset',
      '/reset-password/',
      'Reset your Netpoleon WMS password',
      'Someone asked to reset your password. If it was you, choose a new one here:',
    ),

    'mail.request_decided': async (job) => {
      const { requestId, decision } = payload<'mail.request_decided'>(job);
      const request = await db.transaction({ kind: 'system' }, (tx) =>
        maybeOne<{ email: string; name: string; number: string }>(
          tx,
          sql`SELECT contact_email::text AS email, contact_name AS name, request_no AS number
                FROM loan_requests WHERE id = ${requestId}`,
        ),
      );
      if (!request) return;
      await mailer.send({
        to: request.email,
        subject: `Request ${request.number} ${decision}`,
        text: `Hello ${request.name},\n\nYour borrowing request ${request.number} was ${decision}.\nDetails: ${appOrigin}/borrow/${request.number}\n\nNetpoleon WMS`,
        reference: job.id,
      });
    },

    'mail.overdue_reminder': async (job) => {
      const { loanId, dueDate } = payload<'mail.overdue_reminder'>(job);
      const loan = await db.transaction({ kind: 'system' }, (tx) =>
        maybeOne<{ email: string; name: string; number: string; open: boolean }>(
          tx,
          sql`SELECT contact_email::text AS email, contact_name AS name, loan_no AS number,
                     closed_at IS NULL AS open
                FROM loans WHERE id = ${loanId}`,
        ),
      );
      // Returned in the meantime: the reminder is no longer true, so it is not sent.
      if (!loan?.open) return;
      await mailer.send({
        to: loan.email,
        subject: `Demo equipment overdue: ${loan.number}`,
        text: `Hello ${loan.name},\n\nThe demo equipment on loan ${loan.number} was due back on ${dueDate}. Please arrange its return.\n\nNetpoleon WMS`,
        reference: job.id,
      });
    },
  };
}
