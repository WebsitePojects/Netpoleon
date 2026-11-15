/**
 * The password rule from the foundation spec (section 9). One copy, used by the API to decide
 * and by the web app to explain the rule before the form is sent.
 */

export const MIN_PASSWORD_LENGTH = 12;
/** argon2 hashes any length, but an unbounded field is a cheap way to burn server CPU. */
export const MAX_PASSWORD_LENGTH = 256;

// The most common choices in public breach lists, lowercase. A password that is one of these,
// or one of these wrapped in digits and symbols ("Password2024!"), is refused.
const COMMON = new Set([
  'password',
  'passw0rd',
  'qwerty',
  'qwertyuiop',
  'letmein',
  'welcome',
  'admin',
  'administrator',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'master',
  'superman',
  'trustno1',
  'abc123',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '123123',
  '111111',
  '000000',
  'changeme',
  'netpoleon',
  'warehouse',
  'demo',
]);

/** Returns why the password is refused, or null when it is acceptable. */
export function passwordProblem(password: string, minLength = MIN_PASSWORD_LENGTH): string | null {
  if (password.length < minLength) return `Use at least ${minLength} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  const lower = password.toLowerCase();
  const core = lower.replace(/[\d\W_]+$/, '').replace(/^[\d\W_]+/, '');
  if (COMMON.has(lower) || COMMON.has(core)) {
    return 'That password is too common. Choose something less guessable.';
  }
  if (/^(.)\1+$/.test(password)) return 'Do not repeat one character.';
  return null;
}
