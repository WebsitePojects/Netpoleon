import { envSchema, type ParsedEnv } from './schema.js';

export interface DbConfig {
  staffUrl: string;
  partnerUrl: string;
  staffPoolMax: number;
  partnerPoolMax: number;
  statementTimeoutMs: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  apiHost: string;
  apiPort: number;
  appOrigin: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  trustProxy: string;
  db: DbConfig;
}

/**
 * Carries only variable names. A configuration value can be a connection string with a
 * password in it, so values must never reach the message, the log or the exit output.
 */
export class ConfigError extends Error {
  readonly invalidKeys: readonly string[];

  constructor(invalidKeys: readonly string[]) {
    super(`Invalid environment configuration. Fix these variables: ${invalidKeys.join(', ')}`);
    this.name = 'ConfigError';
    this.invalidKeys = invalidKeys;
  }
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', '::1', 'localhost']);

// Docker publishes container ports on the host's real interfaces and bypasses the host
// firewall, so a wildcard bind is only acceptable inside a container whose port mapping
// is pinned to 127.0.0.1 by the compose file.
function bindsBeyondLoopback(env: ParsedEnv): boolean {
  return (
    env.NODE_ENV === 'production' &&
    env.API_IN_CONTAINER !== 'true' &&
    !LOOPBACK_HOSTS.has(env.API_HOST)
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // An empty value (`VAR=`) is how compose and shells express "unset"; treating it as a
  // real value would turn a forgotten secret into an empty-string secret.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value));
  const parsed = envSchema.safeParse(present);

  if (!parsed.success) {
    const keys = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'unknown')));
    throw new ConfigError([...keys].sort());
  }

  const values = parsed.data;
  if (bindsBeyondLoopback(values)) {
    throw new ConfigError(['API_HOST']);
  }

  return {
    nodeEnv: values.NODE_ENV,
    apiHost: values.API_HOST,
    apiPort: values.API_PORT,
    appOrigin: values.APP_ORIGIN,
    logLevel: values.LOG_LEVEL,
    trustProxy: values.TRUST_PROXY,
    db: {
      staffUrl: values.DATABASE_URL_STAFF,
      partnerUrl: values.DATABASE_URL_PARTNER,
      staffPoolMax: values.DB_POOL_STAFF_MAX,
      partnerPoolMax: values.DB_POOL_PARTNER_MAX,
      statementTimeoutMs: values.DB_STATEMENT_TIMEOUT_MS,
    },
  };
}
