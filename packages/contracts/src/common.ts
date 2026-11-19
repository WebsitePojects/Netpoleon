import { z } from 'zod';

/*
 * Building blocks every module composes. Two conventions hold across the package:
 *
 * - Request schemas (params, query, body) are `z.strictObject`: an unknown key is a rejection,
 *   never silently ignored, so a typo or a smuggled field fails closed.
 * - Response schemas are `z.object`, which strips unknown keys when the API serialises through
 *   them. The schema is therefore the allow-list of what leaves the server, and an extra column
 *   selected by a repository is dropped instead of leaked or turned into a 500.
 *
 * Dates cross the wire as strings only: a calendar date is a date key (`YYYY-MM-DD`, Asia/Manila)
 * and an instant is an ISO 8601 timestamp. A `Date` object never appears in a schema.
 */

// ---------------------------------------------------------------------------------------------
// Text bounds. Every free-text field has a maximum so one request cannot store a megabyte.
// ---------------------------------------------------------------------------------------------

/** People, companies, brands, model, category and location names. */
export const NAME_MAX = 120;
/** One-line descriptions: purpose, job title, end customer. */
export const SHORT_TEXT_MAX = 200;
/** A reason the actor must give: reject, cancel, retire, repair fault, extension. */
export const REASON_MAX = 500;
/** Multi-line notes on a unit, a return or an inspection. */
export const NOTE_MAX = 2000;
/** Search boxes. Long enough for a full serial or company name, short enough to index. */
export const SEARCH_MAX = 100;
/** Manufacturer serials seen in the catalogue are under 30 characters; 64 leaves headroom. */
export const SERIAL_MAX = 64;
/** RFC 5321 limit for a forward path. */
export const EMAIL_MAX = 254;
export const PHONE_MAX = 32;
/** Accessory names are short labels on a checklist ("Power adapter"). */
export const ACCESSORY_NAME_MAX = 80;
/** A demo unit ships with a handful of items; 30 is generous and keeps the checklist sane. */
export const ACCESSORIES_MAX = 30;
/** Matches `MAX_PAGE_SIZE`: one bulk call never touches more rows than one table page shows. */
export const BULK_MAX = 100;
/** Upper bound of `booking.max_units`; the server enforces the configured value. */
export const MAX_UNITS_PER_REQUEST = 50;

// Control characters have no business in a name or a label and are a log/CSV injection vector.
// Notes keep tab and newlines.
// eslint-disable-next-line no-control-regex
const SINGLE_LINE = /^[^\u0000-\u001f\u007f]*$/;
// eslint-disable-next-line no-control-regex
const MULTI_LINE = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/;

/** A required one-line string: trimmed, non-empty, bounded, no control characters. */
export function text(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(SINGLE_LINE, { error: 'must not contain control characters' });
}

/** A required multi-line string: trimmed, non-empty, bounded. */
export function multilineText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(MULTI_LINE, { error: 'must not contain control characters' });
}

/**
 * An optional note in a request body. An empty or blank string means "no note" and becomes
 * null, because a form's empty textarea is not a note.
 */
export function optionalNote(max: number = NOTE_MAX) {
  return z
    .string()
    .trim()
    .max(max)
    .regex(MULTI_LINE, { error: 'must not contain control characters' })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

// ---------------------------------------------------------------------------------------------
// Identifiers and formats. Patterns mirror the CHECK constraints in packages/db/migrations.
// ---------------------------------------------------------------------------------------------

export const idSchema = z.uuid();

/** `NTP-<category code>-<5 digits>`, as `assets_asset_code_format`. Scanners may send lower case. */
export const ASSET_CODE_PATTERN = /^NTP-[A-Z]{2,4}-[0-9]{5}$/;
export const assetCodeSchema = z.string().trim().toUpperCase().regex(ASSET_CODE_PATTERN, {
  error: 'must be an asset code like NTP-SW-00001',
});

/** One number per borrowing, request through return (plan D2). */
export const TRANSACTION_NUMBER_PATTERN = /^BRR-[0-9]{4}-[0-9]{5}$/;
export const transactionNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(TRANSACTION_NUMBER_PATTERN, { error: 'must be a transaction number like BRR-2026-00001' });

/** `categories_code_format`: the letters inside an asset code. */
export const CATEGORY_CODE_PATTERN = /^[A-Z]{2,4}$/;
export const categoryCodeSchema = z.string().trim().toUpperCase().regex(CATEGORY_CODE_PATTERN, {
  error: 'must be 2 to 4 letters',
});

/** Migration 0011 CHECK on `users.username`. Stored lower case, so input is folded first. */
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,23}$/;
export const usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, {
  error: 'must be 3 to 24 characters: a letter, then letters, digits, dot, dash or underscore',
});

/** Stored as citext; folded so the same address cannot be entered twice in two cases. */
export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX).pipe(z.email());

/** Digits with the usual separators; a leading + for international numbers. */
export const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(PHONE_MAX)
  .regex(/^\+?[0-9][0-9 ()-]*$/, { error: 'must be a phone number' });

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
/**
 * A password being set through the API. Never trimmed: a space is a legal password character.
 * The 128 cap keeps the hash function's input bounded.
 */
export const newPasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** Single-use invite and reset tokens: base64url, long enough to be unguessable. */
export const tokenSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'is not a valid link token' });

export const serialSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(SERIAL_MAX)
  .regex(/^[A-Z0-9][A-Z0-9 ._/:-]*$/, { error: 'must be letters, digits and . _ / : -' });

/** A calendar date, validated as a real date: 2026-02-30 is rejected. */
export const dateKeySchema = z.iso.date();

/** An instant. The API emits UTC (`Z`); an offset is accepted so a client clock never breaks it. */
export const timestampSchema = z.iso.datetime({ offset: true });

/** `YYYY-MM`, the bucket the monthly charts use. */
export const monthKeySchema = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);

export const countSchema = z.int().min(0);

// ---------------------------------------------------------------------------------------------
// Query-string coercion. A query string only carries strings, but `z.coerce.number()` turns ''
// into 0 and `z.coerce.boolean()` turns 'false' into true. These accept exactly the spellings
// they mean and reject everything else, including the empty string.
// ---------------------------------------------------------------------------------------------

/** A whole number in a query string, or an already-parsed number from a typed client. */
export function queryInt(min: number, max: number) {
  return z
    .union([z.int(), z.string().regex(/^[0-9]+$/, { error: 'must be a whole number' })])
    .transform(Number)
    .pipe(z.int().min(min).max(max));
}

/**
 * A list of enum values in a query string: `stage=pending,approved`, or repeated keys, which
 * the server's query parser delivers as an array. Duplicates collapse; an unknown or empty
 * member rejects the whole list.
 */
export function queryList<const T extends readonly [string, ...string[]]>(values: T) {
  const member = z.enum(values);
  return z
    .union([
      z.string(),
      z
        .array(z.string())
        .min(1)
        .max(values.length * 2),
    ])
    .transform((raw) => (Array.isArray(raw) ? raw : raw.split(',')).map((item) => item.trim()))
    .pipe(z.array(member).min(1))
    .transform((items) => [...new Set(items)]);
}

/** Free-text search. Blank means "no search" and is rejected, not treated as a wildcard. */
export const searchSchema = text(SEARCH_MAX);

// ---------------------------------------------------------------------------------------------
// Date ranges.
// ---------------------------------------------------------------------------------------------

/** Matches the 366-day guard in `model_availability()` (0009), so a valid query never hits it. */
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 86_400_000;

/** Whole days from `from` to `until`; both are date keys already validated. */
export function daysBetweenKeys(from: string, until: string): number {
  return Math.round((Date.parse(until) - Date.parse(from)) / DAY_MS);
}

/**
 * Adds the `until >= from` and span checks to any object carrying `from` and `until`. Kept as
 * a refinement on the finished object so each query can still be extended before it is applied.
 */
export function withRange<T extends z.ZodType<{ from: string; until: string }>>(
  schema: T,
  maxDays: number = MAX_RANGE_DAYS,
) {
  return schema.superRefine((value, ctx) => {
    const span = daysBetweenKeys(value.from, value.until);
    if (span < 0) {
      ctx.addIssue({ code: 'custom', path: ['until'], message: 'must not be before from' });
    } else if (span > maxDays) {
      ctx.addIssue({
        code: 'custom',
        path: ['until'],
        message: `must be at most ${maxDays} days after from`,
      });
    }
  });
}

export const rangeShape = { from: dateKeySchema, until: dateKeySchema };

// ---------------------------------------------------------------------------------------------
// Arrays in request bodies.
// ---------------------------------------------------------------------------------------------

/**
 * An array of 1..max distinct items, compared after each item's own normalisation, so
 * `ntp-sw-00001` and `NTP-SW-00001` count as the same unit.
 */
export function uniqueArray<T extends z.ZodType<string>>(item: T, max: number, min = 1) {
  return z
    .array(item)
    .min(min)
    .max(max)
    .refine((items) => new Set(items).size === items.length, { error: 'must not repeat items' });
}

/** Accessory names, case-insensitively distinct, as `model_accessories_model_name_key`. */
export const accessoryListSchema = z
  .array(text(ACCESSORY_NAME_MAX))
  .max(ACCESSORIES_MAX)
  .refine((items) => new Set(items.map((item) => item.toLowerCase())).size === items.length, {
    error: 'must not repeat an accessory',
  });

// ---------------------------------------------------------------------------------------------
// Domain enumerations. Values are the Postgres enum labels from 0001, in the same order.
// ---------------------------------------------------------------------------------------------

/** All eight. `registered` is encoded but not shelved; `lost` exists for the later lost/found slice. */
export const ASSET_STATUSES = [
  'registered',
  'in_stock',
  'on_demo',
  'returned',
  'under_inspection',
  'for_repair',
  'retired',
  'lost',
] as const;
export const assetStatusSchema = z.enum(ASSET_STATUSES);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

/** Lower case, as the database stores them (plan D13). The screens print them upper case. */
export const CONDITION_GRADES = ['a', 'b', 'c', 'd'] as const;
export const conditionGradeSchema = z.enum(CONDITION_GRADES);
export type ConditionGrade = z.infer<typeof conditionGradeSchema>;

export const MOVEMENT_TYPES = [
  'registered',
  'stocked',
  'relocated',
  'released',
  'returned',
  'inspection_started',
  'restocked',
  'sent_to_repair',
  'repaired',
  'retired',
  'marked_lost',
  'found',
] as const;
export const movementTypeSchema = z.enum(MOVEMENT_TYPES);
export type MovementType = z.infer<typeof movementTypeSchema>;

export const RESERVATION_STATUSES = [
  'active',
  'needs_reassignment',
  'released',
  'completed',
  'cancelled',
  'expired',
] as const;
export const reservationStatusSchema = z.enum(RESERVATION_STATUSES);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const ORG_TYPES = ['partner', 'reseller', 'internal_team', 'branch'] as const;
export const orgTypeSchema = z.enum(ORG_TYPES);
export type OrgType = z.infer<typeof orgTypeSchema>;

export const ORG_STATUSES = ['active', 'archived'] as const;
export const orgStatusSchema = z.enum(ORG_STATUSES);

export const LOCATION_KINDS = ['site', 'room', 'shelf'] as const;
export const locationKindSchema = z.enum(LOCATION_KINDS);
export type LocationKind = z.infer<typeof locationKindSchema>;

export const USER_STATUSES = ['invited', 'active', 'deactivated'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

/**
 * The console's view of a borrowing, computed by the `transaction_overview` view (plan R3).
 * Never stored, never re-derived outside that view.
 */
export const TRANSACTION_STAGES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'released',
  'returned',
  'closed',
] as const;
export const transactionStageSchema = z.enum(TRANSACTION_STAGES);
export type TransactionStage = z.infer<typeof transactionStageSchema>;

// ---------------------------------------------------------------------------------------------
// References: the small shape of a related record embedded in another response.
// ---------------------------------------------------------------------------------------------

/**
 * A person shown next to a record (filed by, approved by, moved by). `title` is included
 * because the transaction screen prints the approver's job title under the name.
 */
export const userRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  username: z.string(),
  title: z.string().nullable(),
});
export type UserRef = z.infer<typeof userRefSchema>;

export const companyRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: orgTypeSchema,
});
export type CompanyRef = z.infer<typeof companyRefSchema>;

export const categoryRefSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
});
export type CategoryRef = z.infer<typeof categoryRefSchema>;

/** `categoryCode` rides along so a list row can show the category without a lookup. */
export const modelRefSchema = z.object({
  id: idSchema,
  brand: z.string(),
  name: z.string(),
  categoryCode: z.string(),
});
export type ModelRef = z.infer<typeof modelRefSchema>;

/**
 * Where a unit sits. `roomName` is the parent room's name, which the screens show as the
 * zone (plan D13); null for a site or a room, which have no room above them.
 */
export const locationRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  roomName: z.string().nullable(),
  kind: locationKindSchema,
});
export type LocationRef = z.infer<typeof locationRefSchema>;

/** The borrower's contact person, copied onto the request (and the loan at release). */
export const contactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
});
export type Contact = z.infer<typeof contactSchema>;

// ---------------------------------------------------------------------------------------------
// Params shared by several modules.
// ---------------------------------------------------------------------------------------------

export const unitCodeParams = z.strictObject({ code: assetCodeSchema });
export type UnitCodeParams = z.infer<typeof unitCodeParams>;

export const transactionNumberParams = z.strictObject({ no: transactionNumberSchema });
export type TransactionNumberParams = z.infer<typeof transactionNumberParams>;

export const idParams = z.strictObject({ id: idSchema });
export type IdParams = z.infer<typeof idParams>;

// ---------------------------------------------------------------------------------------------
// Bulk results (plan R12).
// ---------------------------------------------------------------------------------------------

/**
 * One row per requested key, in request order. A refused row carries the same `code` a single
 * call would have answered with (for example `unit_unavailable`), so the screen can explain it.
 */
export const bulkRowSchema = z.discriminatedUnion('ok', [
  z.object({ key: z.string(), ok: z.literal(true) }),
  z.object({ key: z.string(), ok: z.literal(false), code: z.string(), message: z.string() }),
]);
export type BulkRow = z.infer<typeof bulkRowSchema>;

export const bulkResultSchema = z.object({ results: z.array(bulkRowSchema) });
export type BulkResult = z.infer<typeof bulkResultSchema>;
