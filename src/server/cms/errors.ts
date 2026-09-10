import { CmsValidationError } from '../../lib/cms/validation.ts';

export type CmsErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'DRAFT_VERSION_CONFLICT'
  | 'CONFLICT'
  | 'RELEASE_BUSY'
  | 'INVALID_STATE_TRANSITION'
  | 'INVARIANT_VIOLATION'
  | 'DATABASE_ERROR';

export interface CmsErrorOptions {
  cause?: unknown;
  details?: Readonly<Record<string, unknown>>;
  expose?: boolean;
}

export class CmsError extends Error {
  readonly code: CmsErrorCode;
  readonly httpStatus: number;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly expose: boolean;

  constructor(
    message: string,
    code: CmsErrorCode,
    httpStatus: number,
    options: CmsErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = options.details;
    this.expose = options.expose ?? httpStatus < 500;
  }
}

export class CmsBadRequestError extends CmsError {
  constructor(message: string, options?: CmsErrorOptions) {
    super(message, 'BAD_REQUEST', 400, options);
  }
}

export class CmsNotFoundError extends CmsError {
  constructor(resource: string, id: string, options?: CmsErrorOptions) {
    super(`${resource} not found`, 'NOT_FOUND', 404, {
      ...options,
      details: { resource, id, ...options?.details },
    });
  }
}

export class CmsConflictError extends CmsError {
  constructor(
    message: string,
    code: Extract<CmsErrorCode, 'DRAFT_VERSION_CONFLICT' | 'CONFLICT'> = 'CONFLICT',
    options?: CmsErrorOptions,
  ) {
    super(message, code, 409, options);
  }
}

export class CmsReleaseBusyError extends CmsError {
  constructor(options?: CmsErrorOptions) {
    super('Another release is already active', 'RELEASE_BUSY', 409, options);
  }
}

export class CmsStateTransitionError extends CmsError {
  constructor(message: string, options?: CmsErrorOptions) {
    super(message, 'INVALID_STATE_TRANSITION', 409, options);
  }
}

export class CmsInvariantError extends CmsError {
  constructor(message: string, options?: CmsErrorOptions) {
    super(message, 'INVARIANT_VIOLATION', 422, options);
  }
}

export class CmsDatabaseError extends CmsError {
  constructor(message = 'CMS database operation failed', options?: CmsErrorOptions) {
    super(message, 'DATABASE_ERROR', 500, { ...options, expose: false });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function mapCmsError(error: unknown, operation: string): CmsError {
  if (error instanceof CmsError) return error;
  if (error instanceof CmsValidationError) {
    return new CmsBadRequestError(error.message, {
      cause: error,
      details: { field: error.field },
    });
  }

  const message = errorMessage(error);
  if (message.includes('idx_one_active_release')) {
    return new CmsReleaseBusyError({ cause: error });
  }
  if (message.includes('invalid release status transition')) {
    return new CmsStateTransitionError('Invalid release status transition', { cause: error });
  }
  if (message.includes('live release compare-and-set failed')) {
    return new CmsConflictError('The live release changed before deployment confirmation', 'CONFLICT', {
      cause: error,
    });
  }
  if (
    message.includes('must be public')
  ) {
    return new CmsInvariantError('All referenced assets must be promoted before publishing', {
      cause: error,
    });
  }
  if (message.includes('immutable')) {
    return new CmsConflictError('Immutable CMS snapshots cannot be changed', 'CONFLICT', {
      cause: error,
    });
  }
  if (message.includes('requires a confirmed deployment')) {
    return new CmsStateTransitionError('Release requires a confirmed deployment', { cause: error });
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return new CmsInvariantError('CMS references are invalid or incomplete', { cause: error });
  }
  if (message.includes('UNIQUE constraint failed')) {
    return new CmsConflictError('A CMS record with the same unique value already exists', 'CONFLICT', {
      cause: error,
    });
  }
  if (message.includes('database is locked') || message.includes('SQLITE_BUSY')) {
    return new CmsReleaseBusyError({ cause: error });
  }
  return new CmsDatabaseError(`CMS database operation failed during ${operation}`, { cause: error });
}

export function cmsErrorResponse(error: unknown): Response {
  const cmsError = mapCmsError(error, 'request');
  return Response.json(
    {
      error: {
        code: cmsError.code,
        message: cmsError.expose ? cmsError.message : 'Internal server error',
        ...(cmsError.expose && cmsError.details ? { details: cmsError.details } : {}),
      },
    },
    {
      status: cmsError.httpStatus,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
