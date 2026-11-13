import helmet from '@fastify/helmet';
import fp from 'fastify-plugin';

export interface SecurityHeadersOptions {
  hsts: boolean;
}

const TWO_YEARS_SECONDS = 63_072_000;

/**
 * This process only serves JSON, so the content policy forbids loading anything at all.
 * HSTS is switched on by the caller only in production: sent over plain HTTP in development
 * it would pin a browser to HTTPS for localhost.
 */
export const securityHeadersPlugin = fp<SecurityHeadersOptions>(
  async (app, { hsts }) => {
    await app.register(helmet, {
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      hsts: hsts ? { maxAge: TWO_YEARS_SECONDS, includeSubDomains: true } : false,
    });
  },
  { name: 'security-headers' },
);
