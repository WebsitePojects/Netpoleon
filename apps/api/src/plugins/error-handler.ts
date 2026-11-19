import type { Problem } from '@wms/contracts';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../errors.js';

interface ProblemDescriptor {
  status: number;
  code: string;
  title: string;
  detail?: string;
}

const MAX_DETAIL_LENGTH = 500;

// Keyed by Fastify's own error code. A 4xx Fastify error not listed here becomes a generic
// 400-class problem; anything that is not a Fastify client error becomes a 500.
const FASTIFY_CLIENT_ERRORS: Readonly<Record<string, ProblemDescriptor>> = {
  FST_ERR_CTP_BODY_TOO_LARGE: {
    status: 413,
    code: 'payload_too_large',
    title: 'Request body is too large',
  },
  FST_ERR_CTP_INVALID_JSON_BODY: {
    status: 400,
    code: 'malformed_json',
    title: 'Request body is not valid JSON',
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    status: 400,
    code: 'malformed_json',
    title: 'Request body is not valid JSON',
  },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    status: 415,
    code: 'unsupported_media_type',
    title: 'Unsupported media type',
  },
};

const INTERNAL_ERROR: ProblemDescriptor = {
  status: 500,
  code: 'internal_error',
  title: 'Internal server error',
};

function isFastifyClientError(error: unknown): error is { code: string; statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('FST_ERR_') &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}

// Field paths only, never the submitted values: a value can be a password or a token.
function describeValidationFailure(
  validation: readonly { instancePath: string }[],
  context: string | undefined,
): string {
  const paths = [...new Set(validation.map((issue) => issue.instancePath || '/'))];
  const where = context ? ` in ${context}` : '';
  return `Invalid fields${where}: ${paths.join(', ')}`.slice(0, MAX_DETAIL_LENGTH);
}

export function describeError(error: unknown): ProblemDescriptor {
  if (error instanceof AppError) {
    return {
      status: error.status,
      code: error.code,
      title: error.message,
      ...(error.detail === undefined ? {} : { detail: error.detail }),
    };
  }
  if (hasZodFastifySchemaValidationErrors(error)) {
    const context = 'validationContext' in error ? String(error.validationContext) : undefined;
    return {
      status: 400,
      code: 'validation_failed',
      title: 'Request validation failed',
      detail: describeValidationFailure(error.validation, context),
    };
  }
  if (isFastifyClientError(error)) {
    return (
      FASTIFY_CLIENT_ERRORS[error.code] ?? {
        status: error.statusCode,
        code: 'bad_request',
        title: 'Bad request',
      }
    );
  }
  const sqlState = sqlStateOf(error);
  if (sqlState !== null) {
    return DATABASE_CONFLICTS[sqlState] ?? INTERNAL_ERROR;
  }
  return INTERNAL_ERROR;
}

// The database guarantees (exclusion constraint, unique keys, lock timeouts) are the last line
// of defence. When one fires, the request lost a race or broke a rule the service did not
// catch first; either way it is the caller's conflict, never a 500. Titles are fixed text: the
// constraint name or value in the driver's message must not reach the client.
const DATABASE_CONFLICTS: Readonly<Record<string, ProblemDescriptor>> = {
  '23P01': {
    status: 409,
    code: 'unit_unavailable',
    title: 'The unit is already booked for those dates',
  },
  '23505': { status: 409, code: 'duplicate', title: 'A record with that value already exists' },
  '23514': { status: 422, code: 'rule_violated', title: 'The change breaks a business rule' },
  '55P03': { status: 409, code: 'busy', title: 'The record is busy; try again' },
  '40001': { status: 409, code: 'busy', title: 'The record is busy; try again' },
  '40P01': { status: 409, code: 'busy', title: 'The record is busy; try again' },
  // Raised by the movement trigger when the unit's status changed under the request.
  WM001: { status: 409, code: 'status_changed', title: "The unit's status has changed" },
};

/** The SQLSTATE of a driver error, unwrapping Drizzle's query wrapper; null when there is none. */
export function sqlStateOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      typeof current.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(current.code) &&
      'severity' in current
    ) {
      return current.code;
    }
    current = typeof current === 'object' && 'cause' in current ? current.cause : null;
  }
  return null;
}

function toProblem(descriptor: ProblemDescriptor, requestId: string): Problem {
  return {
    type: `urn:wms:problem:${descriptor.code}`,
    title: descriptor.title,
    status: descriptor.status,
    code: descriptor.code,
    ...(descriptor.detail === undefined ? {} : { detail: descriptor.detail }),
    requestId,
  };
}

/**
 * Every failure leaves the process as application/problem+json built from a descriptor, never
 * from the original error, so an unexpected exception cannot leak its message, SQL or stack.
 */
export const errorHandlerPlugin = fp(
  (app, _options, done) => {
    app.setErrorHandler((error, request, reply) => {
      const descriptor = describeError(error);
      if (descriptor === INTERNAL_ERROR) {
        request.log.error({ err: error }, 'unexpected error');
      } else if (descriptor.status >= 500) {
        request.log.warn({ code: descriptor.code }, 'request failed');
      } else {
        request.log.info({ code: descriptor.code }, 'request rejected');
      }
      return reply
        .status(descriptor.status)
        .type('application/problem+json')
        .send(toProblem(descriptor, request.id));
    });

    app.setNotFoundHandler((request, reply) =>
      reply
        .status(404)
        .type('application/problem+json')
        .send(toProblem({ status: 404, code: 'not_found', title: 'Route not found' }, request.id)),
    );

    done();
  },
  { name: 'error-handler' },
);
