/**
 * Reads the SQLSTATE and constraint name of a database error. Drizzle wraps the driver's
 * error, so the original is looked for on `cause` as well.
 */
export function databaseError(error: unknown): { code: string; constraint: string | null } | null {
  for (let current = error, depth = 0; current && depth < 3; depth += 1) {
    if (typeof current === 'object' && 'code' in current && typeof current.code === 'string') {
      const constraint =
        'constraint' in current && typeof current.constraint === 'string'
          ? current.constraint
          : null;
      if (/^[0-9A-Z]{5}$/.test(current.code)) return { code: current.code, constraint };
    }
    current = typeof current === 'object' && current && 'cause' in current ? current.cause : null;
  }
  return null;
}

export const UNIQUE_VIOLATION = '23505';
/** Raised by apply_asset_movement() when a unit is no longer in the status a movement expected. */
export const STATUS_CHANGED = 'WM001';
