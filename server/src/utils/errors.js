/**
 * Base operational application error class.
 * Extends Error to include HTTP status code, standardized error code,
 * an operational flag for error handling discrimination, and a details array.
 */
export class AppError extends Error {
  /**
   * @param {string} [message='Internal server error'] - Human-readable error message
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code='INTERNAL_SERVER_ERROR'] - Standardized error code identifier
   * @param {Array} [details=[]] - Optional array of field-level or contextual error details
   */
  constructor(message = 'Internal server error', statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = Array.isArray(details) ? details : [];
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(message = 'The requested resource could not be found', details = []) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

/**
 * 400 Bad Request Error
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = []) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/**
 * 401 Unauthorized Error
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details = []) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

/**
 * 403 Forbidden Error
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', details = []) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

/**
 * 409 Conflict Error (e.g. concurrent claim collision)
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = []) {
    super(message, 409, 'CONFLICT', details);
  }
}

/**
 * 400 Validation Error (e.g. invalid inputs, future expiry checks)
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    if (Array.isArray(message)) {
      super('Validation failed', 400, 'VALIDATION_ERROR', message);
    } else {
      super(message, 400, 'VALIDATION_ERROR', details);
    }
  }
}

export default {
  AppError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError
};
