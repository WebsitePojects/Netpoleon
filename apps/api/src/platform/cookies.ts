/**
 * The two cookie operations the API needs, without a cookie library: read one named cookie,
 * and build a Set-Cookie header for the session.
 */

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export interface SessionCookieOptions {
  secure: boolean;
  /** Seconds the browser keeps it; null makes it end with the browser session. */
  maxAgeSeconds: number | null;
}

/**
 * HttpOnly so page scripts cannot read it, SameSite=Lax so other sites cannot send it on a
 * form post, Secure in production so it never crosses plain HTTP.
 */
export function sessionCookie(name: string, value: string, options: SessionCookieOptions): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.secure) parts.push('Secure');
  if (options.maxAgeSeconds !== null) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  return parts.join('; ');
}

export function clearedCookie(name: string, secure: boolean): string {
  return sessionCookie(name, '', { secure, maxAgeSeconds: 0 });
}
