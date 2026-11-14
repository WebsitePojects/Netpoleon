import { hash, verify } from '@node-rs/argon2';

// The package declares its Algorithm enum as an ambient `const enum`, which isolatedModules
// cannot inline, and the runtime object is empty. 2 is Argon2id in that enum.
const ARGON2ID = 2;

// OWASP's first recommended argon2id profile (19 MiB, 2 passes, 1 lane). About 20-40 ms per
// hash on the VPS: slow enough to make offline guessing expensive, cheap enough that a burst
// of logins on a shared server does not exhaust memory (each hash holds 19 MiB while it runs).
// Changing these only affects new hashes: the parameters are encoded in every stored hash.
const MEMORY_COST_KIB = 19_456;
const TIME_COST_PASSES = 2;
const PARALLELISM_LANES = 1;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: MEMORY_COST_KIB,
  timeCost: TIME_COST_PASSES,
  parallelism: PARALLELISM_LANES,
} as const;

// A hash of 32 random bytes nobody kept, made with the parameters above. Verifying against it
// costs the same as verifying a real password, so a sign-in for an unknown or password-less
// account takes as long as one for a real account. It is not a secret.
const TIMING_EQUALISER_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$4gJdtWBEL/6uaNUUgzNC0w$MlzJ4pXV29T6mwtpHNtCOzKBU4xESfOzZur6WNHv59w';

/** Returns an encoded argon2id hash (PHC string) with a fresh random salt. */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/**
 * True only when `plain` matches `hash`. A malformed or foreign hash is a mismatch, never an
 * exception, so a corrupt row cannot turn a sign-in into a 500 or reveal that it is corrupt.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Burns the same time as `verifyPassword` and always resolves false. Call it when there is no
 * hash to check (unknown login, invited user) so the response time does not reveal which.
 */
export async function verifyAgainstNothing(plain: string): Promise<false> {
  await verifyPassword(TIMING_EQUALISER_HASH, plain);
  return false;
}
