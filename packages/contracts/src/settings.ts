import { z } from 'zod';
import { NAME_MAX, PASSWORD_MIN, text } from './common.js';

/*
 * Settings the console edits (plan R10). Each field maps to one `settings` row whose key is
 * given in SETTING_KEYS. Bounds are enforced here, so the API rejects an out-of-range value
 * before it reaches the database; the defaults match the rows seeded by migrations 0010/0011.
 */

const days = (min: number, max: number) => z.int().min(min).max(max);

export const LABEL_SIZES = ['50x25', '70x35', '100x50'] as const;

export const settingsShape = {
  companyName: text(NAME_MAX),
  warehouseName: text(NAME_MAX),
  defaultLoanDays: days(1, 90),
  maxLoanDays: days(1, 365),
  turnaroundBufferDays: days(0, 14),
  pickupGraceDays: days(0, 14),
  maxUnitsPerRequest: z.int().min(1).max(50),
  notifyOverdue: z.boolean(),
  notifyMissingAccessory: z.boolean(),
  notifyForInspection: z.boolean(),
  notifyReadyForRedeployment: z.boolean(),
  overdueReminderDays: days(1, 30),
  sessionIdleHours: z.int().min(1).max(24),
  lockAfterFailedAttempts: z.int().min(3).max(10),
  labelSize: z.enum(LABEL_SIZES),
  labelShowsSerial: z.boolean(),
};

export const settingsSchema = z.object(settingsShape);
export type Settings = z.infer<typeof settingsSchema>;

/** Database key of every editable setting. */
export const SETTING_KEYS: Readonly<Record<keyof Settings, string>> = Object.freeze({
  companyName: 'org.company_name',
  warehouseName: 'org.warehouse_name',
  defaultLoanDays: 'booking.default_days',
  maxLoanDays: 'booking.max_days',
  turnaroundBufferDays: 'booking.buffer_days',
  pickupGraceDays: 'booking.pickup_grace_days',
  maxUnitsPerRequest: 'booking.max_units',
  notifyOverdue: 'notify.overdue',
  notifyMissingAccessory: 'notify.missing_accessory',
  notifyForInspection: 'notify.for_inspection',
  notifyReadyForRedeployment: 'notify.ready',
  overdueReminderDays: 'notify.overdue_reminder_days',
  sessionIdleHours: 'session.idle_hours',
  lockAfterFailedAttempts: 'auth.lock_after_failed',
  labelSize: 'labels.size',
  labelShowsSerial: 'labels.show_serial',
});

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  companyName: 'Netpoleon Solutions Philippines, Inc.',
  warehouseName: 'Main Warehouse',
  defaultLoanDays: 14,
  maxLoanDays: 30,
  turnaroundBufferDays: 2,
  pickupGraceDays: 3,
  maxUnitsPerRequest: 10,
  notifyOverdue: true,
  notifyMissingAccessory: true,
  notifyForInspection: true,
  notifyReadyForRedeployment: true,
  overdueReminderDays: 2,
  sessionIdleHours: 12,
  lockAfterFailedAttempts: 5,
  labelSize: '50x25',
  labelShowsSerial: true,
});

/** Fixed by the design, shown read-only so nobody hunts for a switch that does not exist. */
export const FIXED_SETTINGS = Object.freeze({
  timezone: 'Asia/Manila',
  passwordMinLength: PASSWORD_MIN,
});

export const settingsResponse = settingsSchema.extend({
  timezone: z.literal('Asia/Manila'),
  passwordMinLength: z.literal(PASSWORD_MIN),
});
export type SettingsResponse = z.infer<typeof settingsResponse>;

/** A strict partial: an unknown key is rejected, and an empty patch has nothing to save. */
export const updateSettingsBody = z
  .strictObject(settingsShape)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { error: 'must change at least one setting' })
  .refine(
    (patch) =>
      patch.defaultLoanDays === undefined ||
      patch.maxLoanDays === undefined ||
      patch.defaultLoanDays <= patch.maxLoanDays,
    { error: 'defaultLoanDays must not exceed maxLoanDays', path: ['defaultLoanDays'] },
  );
export type UpdateSettingsBody = z.infer<typeof updateSettingsBody>;
