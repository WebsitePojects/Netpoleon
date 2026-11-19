import { envSchema, type ParsedEnv } from './schema.js';

export interface DbConfig {
  staffUrl: string;
  partnerUrl: string;
  staffPoolMax: number;
  partnerPoolMax: number;
  statementTimeoutMs: number;
}

/** `log` writes "mail queued" without address, link or token; `smtp` really sends. */
export type MailConfig = { provider: 'log' } | { provider: 'smtp'; url: string; from: string };

export interface WorkerConfig {
  /** Names this worker's heartbeat row. Null means "use the host name". */
  name: string | null;
  pollIntervalMs: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  apiHost: string;
  apiPort: number;
  appOrigin: string;
  /** True whenever the app origin is https; drives the cookie's Secure flag and prefix. */
  secureCookies: boolean;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  trustProxy: string;
  db: DbConfig;
  mail: MailConfig;
  worker: WorkerConfig;
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

/** Rules that span more than one variable. Returns the variable names to fix. */
function crossFieldProblems(env: ParsedEnv): string[] {
  const problems: string[] = [];
  if (bindsBeyondLoopback(env)) {
    problems.push('API_HOST');
  }
  // The session cookie is Secure exactly when the origin is https. Production over plain
  // http would send it in clear text, so production refuses to start instead.
  if (env.NODE_ENV === 'production' && !env.APP_ORIGIN.startsWith('https:')) {
    problems.push('APP_ORIGIN');
  }
  if (env.SMTP_URL && !env.MAIL_FROM) {
    problems.push('MAIL_FROM');
  }
  return problems;
}

function mailConfig(env: ParsedEnv): MailConfig {
  return env.SMTP_URL && env.MAIL_FROM
    ? { provider: 'smtp', url: env.SMTP_URL, from: env.MAIL_FROM }
    : { provider: 'log' };
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
  const problems = crossFieldProblems(values);
  if (problems.length > 0) {
    throw new ConfigError(problems.sort());
  }

  return {
    nodeEnv: values.NODE_ENV,
    apiHost: values.API_HOST,
    apiPort: values.API_PORT,
    appOrigin: values.APP_ORIGIN,
    secureCookies: values.APP_ORIGIN.startsWith('https:'),
    logLevel: values.LOG_LEVEL,
    trustProxy: values.TRUST_PROXY,
    db: {
      staffUrl: values.DATABASE_URL_STAFF,
      partnerUrl: values.DATABASE_URL_PARTNER,
      staffPoolMax: values.DB_POOL_STAFF_MAX,
      partnerPoolMax: values.DB_POOL_PARTNER_MAX,
      statementTimeoutMs: values.DB_STATEMENT_TIMEOUT_MS,
    },
    mail: mailConfig(values),
    worker: {
      name: values.WORKER_NAME ?? null,
      pollIntervalMs: values.WORKER_POLL_INTERVAL_MS,
    },
  };
}
