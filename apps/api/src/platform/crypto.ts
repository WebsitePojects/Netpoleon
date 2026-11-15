import { argon2, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * argon2id at the OWASP baseline (19 MiB, 2 passes, 1 lane). Stored as a PHC string, so the
 * parameters travel with each hash and can be raised later without invalidating old ones.
 * Uses Node's built-in Argon2 (Node 24.7 or later), so no native module ships in the image.
 */
const ARGON2 = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;

function derive(
  password: string,
  salt: Buffer,
  params: { memory: number; passes: number; parallelism: number; tagLength: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: salt, ...params }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, ARGON2);
  return `$argon2id$v=19$m=${ARGON2.memory},t=${ARGON2.passes},p=${ARGON2.parallelism}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

/** False for a wrong password and for a stored value that is not a hash this code wrote. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC.exec(stored);
  if (!match) return false;
  const [, memory, passes, parallelism, salt, expected] = match;
  const expectedKey = Buffer.from(expected ?? '', 'base64url');
  const key = await derive(password, Buffer.from(salt ?? '', 'base64url'), {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    tagLength: expectedKey.length,
  });
  return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
}

/**
 * A hash of a random password, computed once. Login verifies against it when the email is
 * unknown, so a missing account takes as long to refuse as a wrong password.
 */
let decoy: Promise<string> | undefined;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(TOKEN_BYTES).toString('base64url'));
  return decoy;
}

/** 256 random bits, URL-safe: session cookies and single-use links. */
export function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Only this digest of a token is stored, so reading the database cannot replay a session. */
export function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
