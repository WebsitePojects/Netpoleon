import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

// Environment values are always strings, so numbers are parsed from a strict digit pattern.
// Number('') and Number(' ') are 0, which would silently pass a loose coercion.
function integerIn(min: number, max: number) {
  return z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));
}

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

const httpOrigin = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

/**
 * One flat object keyed by the real variable names, so a validation issue's path is the
 * variable the operator has to fix. Keys are what we report; values are never read back.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: integerIn(1, 65535).default(3000),
  API_IN_CONTAINER: z.enum(['true', 'false']).default('false'),
  APP_ORIGIN: httpOrigin,
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  TRUST_PROXY: z.string().min(1).default('loopback'),
  DATABASE_URL_STAFF: postgresUrl,
  DATABASE_URL_PARTNER: postgresUrl,
  DB_POOL_STAFF_MAX: integerIn(1, 100).default(10),
  DB_POOL_PARTNER_MAX: integerIn(1, 100).default(5),
  DB_STATEMENT_TIMEOUT_MS: integerIn(100, 600_000).default(5000),
});

export type ParsedEnv = z.infer<typeof envSchema>;
