import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';

/**
 * Fastify's `genReqId` option. The id is always generated here: an inbound `x-request-id`
 * is attacker-controlled and would let a caller forge log correlation.
 */
export function generateRequestId(): string {
  return randomUUID();
}

export const requestIdPlugin = fp(
  (app, _options, done) => {
    app.addHook('onRequest', (request, reply, hookDone) => {
      reply.header('x-request-id', request.id);
      hookDone();
    });
    done();
  },
  { name: 'request-id' },
);
