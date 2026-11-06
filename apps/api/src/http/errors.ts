import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@ff/shared';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const PG_UNIQUE_VIOLATION = '23505';

/** Drizzle wraps driver errors, so the Postgres error code is on the error or its `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return (e?.code ?? e?.cause?.code) === PG_UNIQUE_VIOLATION;
}

/** Errors raised by express.json() (malformed JSON, body too large, ...) carry a 4xx status. */
interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  const e = err as Partial<BodyParserError> | undefined;
  return typeof e?.type === 'string' && typeof e.status === 'number' && e.status < 500;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  } else if (isBodyParserError(err)) {
    status = err.status;
    body =
      err.type === 'entity.parse.failed'
        ? { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } }
        : status === 413
          ? { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } }
          : { error: { code: 'BAD_REQUEST', message: 'Request body could not be read' } };
  } else {
    console.error('[api] unhandled error', err);
  }

  res.status(status).json(body);
};
