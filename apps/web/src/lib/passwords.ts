/**
 * The password rule from the foundation spec (section 9): at least the configured length, and
 * not a commonly used password. The API applies the same rule; this copy gives the person the
 * answer before the form is sent.
 */

// The most common choices in public breach lists, lowercase. A password that is one of these,
// or one of these followed by digits and symbols, is refused.
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

export function passwordProblem(password: string, minLength: number): string | null {
  if (password.length < minLength) return `Use at least ${minLength} characters.`;
  const core = password
    .toLowerCase()
    .replace(/[\d\W_]+$/, '')
    .replace(/^[\d\W_]+/, '');
  if (COMMON.has(password.toLowerCase()) || COMMON.has(core)) {
    return 'That password is too common. Choose something less guessable.';
  }
  if (/^(.)\1+$/.test(password)) return 'Do not repeat one character.';
  return null;
}
