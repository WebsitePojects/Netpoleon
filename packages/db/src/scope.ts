export type ActorScope =
  | { kind: 'staff'; userId: string }
  | { kind: 'partner'; userId: string; partnerOrgId: string }
  | { kind: 'system' };

export class InvalidScopeError extends Error {
  constructor(field: string) {
    // The offending value is deliberately left out: it came from a caller and may be a token.
    super(`Invalid actor scope: ${field} must be a UUID.`);
    this.name = 'InvalidScopeError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checked before any query so a malformed id fails as a programming error here, not as a
 * Postgres cast error inside a row-level-security policy.
 */
export function assertValidScope(scope: ActorScope): void {
  if (scope.kind === 'system') {
    return;
  }
  if (!UUID.test(scope.userId)) {
    throw new InvalidScopeError('userId');
  }
  if (scope.kind === 'partner' && !UUID.test(scope.partnerOrgId)) {
    throw new InvalidScopeError('partnerOrgId');
  }
}

/** The transaction-local settings the row-level-security policies read. */
export function scopeSettings(scope: ActorScope): [name: string, value: string][] {
  switch (scope.kind) {
    case 'system':
      return [];
    case 'staff':
      return [['app.user_id', scope.userId]];
    case 'partner':
      return [
        ['app.user_id', scope.userId],
        ['app.partner_org_id', scope.partnerOrgId],
      ];
  }
}
