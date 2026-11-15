import { describe, expect, it } from 'vitest';
import { can, pageOf, pageQuerySchema, passwordProblem, problemSchema } from '../src/index.js';

describe('pageQuerySchema', () => {
  it('defaults the limit to 25', () => {
    expect(pageQuerySchema.parse({})).toEqual({ limit: 25 });
  });

  it('accepts a cursor and a numeric string limit, as sent in a query string', () => {
    expect(pageQuerySchema.parse({ cursor: 'abc', limit: '50' })).toEqual({
      cursor: 'abc',
      limit: 50,
    });
  });

  it.each(['101', '0', '-1', '1.5', 'abc', ''])('rejects limit=%s', (limit) => {
    expect(pageQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('accepts the boundaries 1 and 100', () => {
    expect(pageQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(pageQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });

  it('rejects an unreasonably long cursor', () => {
    expect(pageQuerySchema.safeParse({ cursor: 'x'.repeat(1025) }).success).toBe(false);
  });
});

describe('pageOf', () => {
  it('wraps items with the next cursor', () => {
    expect(pageOf([1, 2], 'next')).toEqual({ items: [1, 2], nextCursor: 'next' });
  });

  it('uses null to mark the last page', () => {
    expect(pageOf([], null)).toEqual({ items: [], nextCursor: null });
  });
});

describe('problemSchema', () => {
  const valid = {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    code: 'not_found',
    requestId: '0191e0d0-0000-7000-8000-000000000000',
  };

  it('accepts a problem with and without detail', () => {
    expect(problemSchema.safeParse(valid).success).toBe(true);
    expect(problemSchema.safeParse({ ...valid, detail: 'nothing here' }).success).toBe(true);
  });

  it('rejects an object carrying a stack key', () => {
    expect(problemSchema.safeParse({ ...valid, stack: 'Error: boom\n at x' }).success).toBe(false);
  });

  it('rejects a status outside the HTTP error range', () => {
    expect(problemSchema.safeParse({ ...valid, status: 200 }).success).toBe(false);
    expect(problemSchema.safeParse({ ...valid, status: 600 }).success).toBe(false);
  });

  it('requires a requestId', () => {
    const { requestId: _omitted, ...withoutRequestId } = valid;

    expect(problemSchema.safeParse(withoutRequestId).success).toBe(false);
  });
});

describe('passwordProblem', () => {
  it('enforces the minimum length and refuses common passwords with decorations', () => {
    expect(passwordProblem('short-one')).toMatch(/at least 12/);
    expect(passwordProblem('Password2024!')).toMatch(/too common/);
    expect(passwordProblem('!!netpoleon123')).toMatch(/too common/);
    expect(passwordProblem('zzzzzzzzzzzzzz')).toMatch(/repeat/);
    expect(passwordProblem('x'.repeat(257))).toMatch(/at most 256/);
    expect(passwordProblem('quiet-harbour-ninety')).toBeNull();
  });
});

describe('permission table', () => {
  it('denies by default and keeps the auditor read-only', () => {
    expect(can('auditor', 'unit.view')).toBe(true);
    expect(can('auditor', 'unit.register')).toBe(false);
    expect(can('manager', 'loan.decide')).toBe(true);
    expect(can('warehouse', 'loan.decide')).toBe(false);
    expect(can('partner_member', 'unit.view')).toBe(false);
    expect(can('partner_admin', 'portal.team')).toBe(true);
    expect(can('admin', 'portal.book')).toBe(false);
  });
});
