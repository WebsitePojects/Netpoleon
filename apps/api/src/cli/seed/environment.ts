/** The only environments the development seed may run in. Anything else is refused. */
const ALLOWED_ENVIRONMENTS = new Set(['development', 'test']);

export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRefusedError';
  }
}

/**
 * Fails closed: the seed writes four accounts with a known demo password, so it runs only when
 * NODE_ENV says, explicitly, that this is a development or test database. An unset, empty,
 * misspelt or 'production' value is refused (spec section 15: no default credentials in
 * production).
 */
export function assertSeedAllowed(nodeEnv: string | undefined): void {
  if (nodeEnv === undefined || !ALLOWED_ENVIRONMENTS.has(nodeEnv)) {
    throw new SeedRefusedError(
      `The development seed runs only with NODE_ENV=development or NODE_ENV=test ` +
        `(got ${nodeEnv === undefined ? 'nothing' : JSON.stringify(nodeEnv)}). ` +
        'It creates accounts with a known password and must never reach production.',
    );
  }
}

/** Names only in the error: the value of a connection string carries a password. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new SeedRefusedError(`Missing environment variable: ${name}`);
  }
  return value;
}
