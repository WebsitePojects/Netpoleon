import { problemSchema } from '@wms/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.js';
import { CLOSED_PORT_URL, TestApps, registerProbeRoutes, type TestApp } from './harness.js';

const apps = new TestApps();
afterEach(() => apps.closeAll());

// None of these behaviours depend on the database, so they run against a closed port.
const urls = { staffUrl: CLOSED_PORT_URL, partnerUrl: CLOSED_PORT_URL };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function buildProbeApp(nodeEnv?: 'test' | 'production'): Promise<TestApp> {
  return apps.create({
    urls,
    registerRoutes: registerProbeRoutes,
    ...(nodeEnv ? { nodeEnv } : {}),
  });
}

describe('error responses', () => {
  it('unknown route returns a 404 problem with a requestId', async () => {
    const { app } = await buildProbeApp();

    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    const problem = problemSchema.parse(response.json());
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(problem.code).toBe('not_found');
    expect(problem.requestId).toBe(response.headers['x-request-id']);
  });

  it('an unexpected throw returns 500 with code internal_error and does not leak the message', async () => {
    const { app } = await buildProbeApp();

    const response = await app.inject({ method: 'GET', url: '/probe/throw' });

    expect(response.statusCode).toBe(500);
    expect(problemSchema.parse(response.json()).code).toBe('internal_error');
    expect(response.body).not.toContain('hunter2');
  });

  it('body over 1 MiB returns 413 problem', async () => {
    const { app } = await buildProbeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/probe/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'x'.repeat(1024 * 1024 + 1) }),
    });

    expect(response.statusCode).toBe(413);
    expect(problemSchema.parse(response.json()).code).toBe('payload_too_large');
  });

  it('malformed JSON returns a 400 problem, not a 500', async () => {
    const { app } = await buildProbeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/probe/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });

    expect(response.statusCode).toBe(400);
    expect(problemSchema.parse(response.json()).code).toBe('malformed_json');
  });

  it('validation failures list field paths and never the submitted values', async () => {
    const { app } = await buildProbeApp();

    const response = await app.inject({
      method: 'POST',
      url: '/probe/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 12345 }),
    });

    const problem = problemSchema.parse(response.json());
    expect(response.statusCode).toBe(400);
    expect(problem.code).toBe('validation_failed');
    expect(problem.detail).toContain('/name');
    expect(response.body).not.toContain('12345');
  });

  it('an AppError keeps its status, code and title', async () => {
    const { app } = await buildProbeApp();
    app.get('/probe/app-error', () => {
      throw new AppError(409, 'conflict', 'Already done', 'Try the other one');
    });

    const response = await app.inject({ method: 'GET', url: '/probe/app-error' });

    expect(response.statusCode).toBe(409);
    expect(problemSchema.parse(response.json())).toMatchObject({
      code: 'conflict',
      title: 'Already done',
      detail: 'Try the other one',
    });
  });
});

describe('request identity and hardening', () => {
  it('inbound x-request-id is not trusted', async () => {
    const { app } = await buildProbeApp();

    const response = await app.inject({
      method: 'GET',
      url: '/does-not-exist',
      headers: { 'x-request-id': 'evil' },
    });

    expect(response.headers['x-request-id']).toMatch(UUID);
    expect(problemSchema.parse(response.json()).requestId).toMatch(UUID);
  });

  it('security headers are present', async () => {
    const { app } = await buildProbeApp();

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('sends HSTS in production only', async () => {
    const { app } = await buildProbeApp('production');

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });

  it('logs redact secrets', async () => {
    const { app, logLines } = await buildProbeApp();

    await app.inject({
      method: 'GET',
      url: '/probe/log-secrets',
      headers: { authorization: 'Bearer bearer-secret-9', cookie: 'sid=cookie-secret-9' },
    });

    const log = logLines.join('\n');
    expect(log).toContain('"msg":"probe"');
    for (const secret of ['bearer-secret-9', 'cookie-secret-9', 'tok-secret-9', 'pw-secret-9']) {
      expect(log).not.toContain(secret);
    }
  });
});
