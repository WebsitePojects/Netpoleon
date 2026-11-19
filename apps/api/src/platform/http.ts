import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Outcome } from './idempotency.js';

/**
 * Every API response is `no-store` unless a route opts in to revalidation (plan R14): API
 * bodies carry contact details and must not sit in a shared or on-disk cache. The client's
 * in-memory query cache is what makes pages instant, and it is cleared on sign-out.
 */
export const cacheDefaultsPlugin = fp(
  (app: FastifyInstance, _options: unknown, done: () => void) => {
    app.addHook('onSend', (request, reply, payload, hookDone) => {
      if (request.url.startsWith('/api/') && !reply.hasHeader('cache-control')) {
        reply.header('cache-control', 'no-store');
      }
      hookDone(null, payload);
    });
    done();
  },
  { name: 'cache-defaults' },
);

/**
 * Reference data without personal details (categories, models, locations, settings, the
 * bootstrap lists): `private, no-cache` plus a weak ETag, so a refetch of unchanged data is a
 * bodiless 304. Returns undefined when it has answered 304 itself.
 */
export function revalidated<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  body: T,
): T | undefined {
  const etag = `W/"${createHash('sha1').update(JSON.stringify(body)).digest('base64url')}"`;
  reply.header('cache-control', 'private, no-cache');
  reply.header('etag', etag);
  if (request.headers['if-none-match'] === etag) {
    void reply.code(304).send();
    return undefined;
  }
  return body;
}

/** Sends an idempotent outcome with its original status; marks replays for the client. */
export function sendOutcome<T>(reply: FastifyReply, outcome: Outcome<T>): T {
  void reply.code(outcome.status);
  if (outcome.replayed) {
    reply.header('idempotent-replayed', 'true');
  }
  return outcome.body;
}

export function offsetOf(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/** A cell a spreadsheet would run as a formula (`=`, `+`, `-`, `@`, tab, CR) is neutralised. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
        ? String(value)
        : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const BOM = String.fromCharCode(0xfeff);

/** RFC 4180 CSV with CRLF line ends and a UTF-8 BOM so Excel reads accents correctly. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export function sendCsv(reply: FastifyReply, filename: string, csv: string): string {
  reply.header('content-type', 'text/csv; charset=utf-8');
  reply.header(
    'content-disposition',
    `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
  );
  return csv;
}

/** Most exports a request may produce in one go (plan R16). */
export const CSV_ROW_LIMIT = 10_000;
