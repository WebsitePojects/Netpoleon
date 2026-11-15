import { schema, type Tx } from '@wms/db';
import { inArray } from 'drizzle-orm';

/** Every setting the API reads, with the value used when the row is missing. */
const DEFAULTS = {
  'session.idle_hours': 12,
  'session.remember_days_staff': 7,
  'session.remember_days_partner': 30,
  'booking.buffer_days': 2,
  'booking.max_days': 30,
  'booking.max_units': 10,
  'booking.pickup_grace_days': 3,
} as const;

export type SettingKey = keyof typeof DEFAULTS;

/**
 * Reads typed settings inside the caller's transaction. Values are whole numbers today; a
 * stored value that is not a positive integer is ignored in favour of the default, so a bad
 * edit cannot set a session length of zero.
 */
export class SettingsReader {
  async numbers<K extends SettingKey>(tx: Tx, keys: readonly K[]): Promise<Record<K, number>> {
    const rows = await tx
      .select({ key: schema.settings.key, value: schema.settings.value })
      .from(schema.settings)
      .where(inArray(schema.settings.key, [...keys]));
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const out = {} as Record<K, number>;
    for (const key of keys) {
      const value = stored.get(key);
      out[key] =
        typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : DEFAULTS[key];
    }
    return out;
  }
}
