import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { isValidRequestId } from './requestId.js';

/**
 * Safely extracts the pathname from req.originalUrl or req.url,
 * completely excluding query strings and hashes to prevent leaking secrets.
 *
 * @param {object} req - Express request object
 * @returns {string} Sanitized URL path (e.g. '/api/v1/donations') or 'UNKNOWN'
 */
export const sanitizeUrl = (req) => {
  const rawUrl = req?.originalUrl || req?.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return 'UNKNOWN';
  }
  const pathOnly = rawUrl.split(/[?#]/)[0].trim();
  return pathOnly || '/';
};

/**
 * 404 Catch-All Middleware
 * Intercepts requests that do not match any defined route and forwards
 * a structured NotFoundError to the centralized error handler.
 * Strips query parameters to prevent leaking sensitive tokens in 404 error messages.
 */
export const notFoundHandler = (req, res, next) => {
  const sanitizedPath = sanitizeUrl(req);
  const displayPath = sanitizedPath === 'UNKNOWN' ? 'resource' : sanitizedPath;
  next(new NotFoundError(`The requested resource '${displayPath}' does not exist on this server.`));
};

/**
 * Centralized Global Error Handler Middleware
 * Normalizes operational, syntax, and unexpected errors into the standardized API response shape,
 * logs errors with structured metadata (omitting sensitive bodies/credentials/query parameters),
 * and prevents internal message / stack trace exposure in responses.
 */
export const errorHandler = (err, req, res, next) => {
  // If headers have already been sent to client, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // 1. Normalize malformed or non-Error values safely
  let normalizedError;
  if (err instanceof Error) {
    normalizedError = err;
  } else if (typeof err === 'string' && err.trim()) {
    normalizedError = new Error(err.trim());
  } else if (err && typeof err === 'object') {
    normalizedError = new Error(err.message || 'Unknown error');
    Object.assign(normalizedError, err);
  } else {
    normalizedError = new Error('An unexpected internal error occurred');
  }

  // 2. Safely resolve and validate request correlation ID
  let correlationId;
  if (typeof req?.id === 'string' && isValidRequestId(req.id)) {
    correlationId = req.id.trim();
  } else {
    const rawHeader = req?.headers?.['x-request-id'];
    if (typeof rawHeader === 'string' && isValidRequestId(rawHeader)) {
      correlationId = rawHeader.trim();
    } else {
      correlationId = randomUUID();
    }
  }

  // Ensure X-Request-Id header is set on the response
  if (typeof res.setHeader === 'function' && !res.headersSent) {
    res.setHeader('X-Request-Id', correlationId);
  }

  // 3. Determine HTTP status code safely
  let statusCode = (typeof normalizedError.statusCode === 'number' && normalizedError.statusCode >= 400 && normalizedError.statusCode < 600)
    ? normalizedError.statusCode
    : (typeof normalizedError.status === 'number' && normalizedError.status >= 400 && normalizedError.status < 600)
      ? normalizedError.status
      : 500;

  // 4. Handle Express body-parser malformed JSON syntax errors
  const isMalformedJson = (
    normalizedError instanceof SyntaxError &&
    (normalizedError.status === 400 || normalizedError.statusCode === 400) &&
    ('body' in normalizedError || normalizedError.type === 'entity.parse.failed')
  );

  let code;
  let message;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isMalformedJson) {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Invalid JSON payload in request body';
  } else if (statusCode >= 500 && isProduction) {
    code = 'INTERNAL_SERVER_ERROR';
    message = 'An unexpected error occurred. Please contact the administrator.';
  } else {
    code = (typeof normalizedError.code === 'string' && normalizedError.code.trim())
      ? normalizedError.code.trim()
      : (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');

    message = (typeof normalizedError.message === 'string' && normalizedError.message.trim())
      ? normalizedError.message
      : (statusCode >= 500 ? 'Internal server error' : 'An error occurred processing your request.');
  }

  const isServerError = statusCode >= 500;
  // In production, unexpected 5xx errors must never expose internal details
  const safeDetails = (statusCode >= 500 && isProduction)
    ? []
    : (Array.isArray(normalizedError.details) ? normalizedError.details : []);

  // 5. Structured logging (strictly safe: sanitized URL without query params, no bodies/passwords/secrets)
  // Stack traces are included for 5xx server errors, omitted for 4xx client errors
  const sanitizedUrl = sanitizeUrl(req);
  const logMetadata = {
    requestId: correlationId,
    method: req?.method || 'UNKNOWN',
    url: sanitizedUrl,
    statusCode,
    code,
    ...(isServerError ? { stack: normalizedError.stack } : {})
  };

  if (isServerError) {
    logger.error(normalizedError.message || 'Internal server error', logMetadata);
  } else {
    logger.warn(message || 'Client error', logMetadata);
  }

  // 6. Return exact REST API error envelope (stack traces are NEVER included in API responses)
  return res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: correlationId,
      details: safeDetails
    }
  });
};

export default {
  sanitizeUrl,
  notFoundHandler,
  errorHandler
};
