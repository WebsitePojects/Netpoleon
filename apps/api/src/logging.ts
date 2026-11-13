import { pino, type DestinationStream, type Logger } from 'pino';
import type { AppConfig } from '@wms/config';

// Fastify's default request serializer already omits headers; the explicit paths keep the
// secrets out of the log if a handler or a later serializer change ever includes them.
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.passwordHash',
];

export function createLogger(
  level: AppConfig['logLevel'] | 'silent',
  destination?: DestinationStream,
): Logger {
  return pino({ level, redact: REDACTED_PATHS }, destination);
}
