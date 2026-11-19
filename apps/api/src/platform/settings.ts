import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  settingsShape,
  type Settings,
  type UpdateSettingsBody,
} from '@wms/contracts';
import type { Database, Tx } from '@wms/db';
import { sql } from 'drizzle-orm';
import { rows } from './sql.js';
import type { SessionLimits } from './session.js';

/**
 * Reads change rarely and are needed on almost every request (loan lengths, buffers, session
 * limits), so they are cached in process for 30 seconds and dropped on every write through
 * this service. 30 s of staleness is harmless for these values: none of them grants or
 * removes access. Revoking a session or deactivating a user never goes through this cache.
 */
const CACHE_MS = 30_000;

/** Remember-me limits are not editable in the console; read with these fallbacks. */
const REMEMBER_DEFAULTS = { staff: 7, partner: 30 };

type SettingKey = keyof Settings;

export class SettingsService {
  private cached: {
    value: Settings & { remember: { staff: number; partner: number } };
    at: number;
  } | null = null;

  constructor(private readonly db: Database) {}

  async get(): Promise<Settings> {
    return (await this.load()).value;
  }

  async sessionLimits(): Promise<SessionLimits> {
    const { value } = await this.load();
    return {
      idleHours: value.sessionIdleHours,
      rememberDaysStaff: value.remember.staff,
      rememberDaysPartner: value.remember.partner,
    };
  }

  /** Writes inside the caller's transaction; the cache is dropped once the caller commits. */
  async update(tx: Tx, patch: UpdateSettingsBody, userId: string): Promise<SettingKey[]> {
    const changed = Object.keys(patch) as SettingKey[];
    for (const field of changed) {
      await tx.execute(sql`
        INSERT INTO settings (key, value, updated_by_user_id)
        VALUES (${SETTING_KEYS[field]}, ${JSON.stringify(patch[field])}::jsonb, ${userId})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
                                        updated_by_user_id = EXCLUDED.updated_by_user_id`);
    }
    this.invalidate();
    return changed;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async load() {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return this.cached;
    }
    const stored = await this.db.transaction({ kind: 'system' }, (tx) =>
      rows<{ key: string; value: unknown }>(tx, sql`SELECT key, value FROM settings`),
    );
    const byKey = new Map(stored.map((row) => [row.key, row.value]));
    const value: Settings = { ...DEFAULT_SETTINGS };
    for (const field of Object.keys(SETTING_KEYS) as SettingKey[]) {
      // A stored value that no longer fits its bounds (edited by hand, bounds tightened) falls
      // back to the default instead of breaking every request that reads settings.
      const parsed = settingsShape[field].safeParse(byKey.get(SETTING_KEYS[field]));
      if (parsed.success) {
        (value as Record<SettingKey, unknown>)[field] = parsed.data;
      }
    }
    const remember = {
      staff: positiveInt(byKey.get('session.remember_days_staff'), REMEMBER_DEFAULTS.staff),
      partner: positiveInt(byKey.get('session.remember_days_partner'), REMEMBER_DEFAULTS.partner),
    };
    this.cached = { value: { ...value, remember }, at: Date.now() };
    return this.cached;
  }
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 365
    ? value
    : fallback;
}
