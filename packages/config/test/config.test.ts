import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/index.js';

const validEnv = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:5173',
  DATABASE_URL_STAFF: 'postgres://wms_staff:pw@localhost:5432/wms',
  DATABASE_URL_PARTNER: 'postgres://wms_partner:pw@localhost:5432/wms',
};

function failure(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('loadConfig did not throw');
}

describe('loadConfig', () => {
  it('loads defaults', () => {
    const config = loadConfig(validEnv);

    expect(config.nodeEnv).toBe('test');
    expect(config.apiHost).toBe('127.0.0.1');
    expect(config.apiPort).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.trustProxy).toBe('loopback');
    expect(config.appOrigin).toBe('http://localhost:5173');
    expect(config.db.staffPoolMax).toBe(10);
    expect(config.db.partnerPoolMax).toBe(5);
    expect(config.db.statementTimeoutMs).toBe(5000);
    expect(config.db.staffUrl).toBe(validEnv.DATABASE_URL_STAFF);
    expect(config.db.partnerUrl).toBe(validEnv.DATABASE_URL_PARTNER);
  });

  it('applies explicit overrides', () => {
    const config = loadConfig({
      ...validEnv,
      API_HOST: '10.0.0.5',
      API_PORT: '8080',
      LOG_LEVEL: 'debug',
      TRUST_PROXY: 'uniquelocal',
      DB_POOL_STAFF_MAX: '20',
      DB_POOL_PARTNER_MAX: '8',
      DB_STATEMENT_TIMEOUT_MS: '2500',
    });

    expect(config.apiHost).toBe('10.0.0.5');
    expect(config.apiPort).toBe(8080);
    expect(config.logLevel).toBe('debug');
    expect(config.trustProxy).toBe('uniquelocal');
    expect(config.db.staffPoolMax).toBe(20);
    expect(config.db.partnerPoolMax).toBe(8);
    expect(config.db.statementTimeoutMs).toBe(2500);
  });

  it('treats an empty variable as unset', () => {
    const config = loadConfig({ ...validEnv, API_PORT: '' });

    expect(config.apiPort).toBe(3000);
  });

  it('names bad variables without echoing values', () => {
    const error = failure({
      ...validEnv,
      API_PORT: 'abc',
      DATABASE_URL_STAFF: 'postgres://u:s3cret@h/db',
      DATABASE_URL_PARTNER: undefined,
    });

    expect(error.invalidKeys).toEqual(['API_PORT', 'DATABASE_URL_PARTNER']);
    expect(error.message).toContain('API_PORT');
    expect(error.message).not.toContain('abc');
    expect(error.message).not.toContain('s3cret');
  });

  it('does not echo a malformed secret even when it is the invalid value', () => {
    const error = failure({ ...validEnv, DATABASE_URL_STAFF: 'not a url s3cret' });

    expect(error.invalidKeys).toEqual(['DATABASE_URL_STAFF']);
    expect(error.message).not.toContain('s3cret');
  });

  it('rejects a non-URL APP_ORIGIN', () => {
    expect(failure({ ...validEnv, APP_ORIGIN: 'not-a-url' }).invalidKeys).toEqual(['APP_ORIGIN']);
  });

  it('rejects an APP_ORIGIN that is not http or https', () => {
    expect(failure({ ...validEnv, APP_ORIGIN: 'ftp://example.com' }).invalidKeys).toEqual([
      'APP_ORIGIN',
    ]);
  });

  it('requires NODE_ENV rather than guessing a mode', () => {
    expect(failure({ ...validEnv, NODE_ENV: undefined }).invalidKeys).toEqual(['NODE_ENV']);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(failure({ ...validEnv, NODE_ENV: 'staging' }).invalidKeys).toEqual(['NODE_ENV']);
  });

  it('rejects an out-of-range port', () => {
    expect(failure({ ...validEnv, API_PORT: '70000' }).invalidKeys).toEqual(['API_PORT']);
  });

  it('rejects a non-postgres database URL', () => {
    expect(failure({ ...validEnv, DATABASE_URL_PARTNER: 'mysql://u:p@h/db' }).invalidKeys).toEqual([
      'DATABASE_URL_PARTNER',
    ]);
  });

  describe('in production', () => {
    const production = { ...validEnv, NODE_ENV: 'production' };

    it('refuses API_HOST 0.0.0.0', () => {
      expect(failure({ ...production, API_HOST: '0.0.0.0' }).invalidKeys).toContain('API_HOST');
    });

    it('refuses any non-loopback API_HOST', () => {
      expect(failure({ ...production, API_HOST: '10.0.0.5' }).invalidKeys).toContain('API_HOST');
    });

    it('accepts 0.0.0.0 inside a container', () => {
      const config = loadConfig({ ...production, API_HOST: '0.0.0.0', API_IN_CONTAINER: 'true' });

      expect(config.apiHost).toBe('0.0.0.0');
    });

    it('does not let API_IN_CONTAINER=false unlock a wildcard bind', () => {
      const error = failure({ ...production, API_HOST: '0.0.0.0', API_IN_CONTAINER: 'false' });

      expect(error.invalidKeys).toContain('API_HOST');
    });

    it('accepts the default loopback host', () => {
      expect(loadConfig(production).apiHost).toBe('127.0.0.1');
    });
  });

  it('allows a wildcard host outside production', () => {
    expect(loadConfig({ ...validEnv, API_HOST: '0.0.0.0' }).apiHost).toBe('0.0.0.0');
  });
});
