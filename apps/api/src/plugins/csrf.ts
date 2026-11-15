import { CLIENT_HEADER } from '@wms/contracts';
import fp from 'fastify-plugin';
import { AppError } from '../errors.js';

export interface CsrfOptions {
  /** The web app's own origin; the only one allowed to send a state-changing request. */
  appOrigin: string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Three layers against cross-site request forgery (foundation spec section 9), on top of the
 * SameSite=Lax session cookie: every state-changing request must carry the custom client
 * header (a cross-site form cannot set one, and a cross-site script would need a CORS
 * preflight this API never grants), and when the browser says where the request came from,
 * that must be the app's own origin.
 */
export const csrfPlugin = fp<CsrfOptions>(
  (app, { appOrigin }, done) => {
    app.addHook('onRequest', (request, _reply, hookDone) => {
      if (SAFE_METHODS.has(request.method)) return hookDone();
      const origin = request.headers.origin;
      const site = request.headers['sec-fetch-site'];
      if (!request.headers[CLIENT_HEADER]) {
        return hookDone(
          new AppError(403, 'csrf_rejected', 'This request did not come from the WMS app'),
        );
      }
      if ((origin !== undefined && origin !== appOrigin) || site === 'cross-site') {
        return hookDone(
          new AppError(403, 'csrf_rejected', 'This request did not come from the WMS app'),
        );
      }
      hookDone();
    });
    done();
  },
  { name: 'csrf' },
);
