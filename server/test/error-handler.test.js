import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import app from '../src/app.js';
import {
  AppError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError
} from '../src/utils/errors.js';
import { sanitizeUrl, notFoundHandler, errorHandler } from '../src/middleware/errorHandler.js';
import logger from '../src/utils/logger.js';
import { closePool } from '../src/config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Application Error Classes (AppError Hierarchy)', () => {
  it('AppError base class should default to 500 and INTERNAL_SERVER_ERROR', () => {
    const err = new AppError('Base error');
    assert.strictEqual(err.message, 'Base error');
    assert.strictEqual(err.statusCode, 500);
    assert.strictEqual(err.code, 'INTERNAL_SERVER_ERROR');
    assert.strictEqual(err.isOperational, true);
    assert.deepStrictEqual(err.details, []);
    assert.ok(err.stack);
  });

  it('All subclasses should set appropriate status codes and error codes', () => {
    const notFound = new NotFoundError();
    assert.strictEqual(notFound.statusCode, 404);
    assert.strictEqual(notFound.code, 'NOT_FOUND');

    const badReq = new BadRequestError();
    assert.strictEqual(badReq.statusCode, 400);
    assert.strictEqual(badReq.code, 'BAD_REQUEST');

    const unauthorized = new UnauthorizedError();
    assert.strictEqual(unauthorized.statusCode, 401);
    assert.strictEqual(unauthorized.code, 'UNAUTHORIZED');

    const forbidden = new ForbiddenError();
    assert.strictEqual(forbidden.statusCode, 403);
    assert.strictEqual(forbidden.code, 'FORBIDDEN');

    const conflict = new ConflictError();
    assert.strictEqual(conflict.statusCode, 409);
    assert.strictEqual(conflict.code, 'CONFLICT');

    const validation = new ValidationError();
    assert.strictEqual(validation.statusCode, 400);
    assert.strictEqual(validation.code, 'VALIDATION_ERROR');
  });

  it('ValidationError should preserve details array and handle malformed details gracefully', () => {
    const validDetails = [{ field: 'quantity', message: 'Must be greater than 0' }];
    const validErr = new ValidationError('Invalid submission', validDetails);
    assert.deepStrictEqual(validErr.details, validDetails);

    // Malformed details (null, string, object) should safely default to empty array
    const malformed1 = new ValidationError('Invalid', null);
    assert.deepStrictEqual(malformed1.details, []);

    const malformed2 = new ValidationError('Invalid', 'not an array');
    assert.deepStrictEqual(malformed2.details, []);

    // Passing details as first parameter should be supported
    const singleArgDetails = [{ field: 'expires_at', message: 'Date must be in future' }];
    const autoErr = new ValidationError(singleArgDetails);
    assert.strictEqual(autoErr.message, 'Validation failed');
    assert.deepStrictEqual(autoErr.details, singleArgDetails);
  });
});

describe('HTTP 404 Not Found Middleware (notFoundHandler)', () => {
  it('should return 404 with exact documented error envelope and details array', async () => {
    const response = await request(app).get('/api/v1/unknown-test-endpoint');

    assert.strictEqual(response.status, 404);
    assert.strictEqual(typeof response.body, 'object');
    assert.ok(response.body.error, 'Response must have top-level error object');
    assert.strictEqual(response.body.error.code, 'NOT_FOUND');
    assert.strictEqual(response.body.error.message, "The requested resource '/api/v1/unknown-test-endpoint' does not exist on this server.");
    assert.ok(response.body.error.requestId, 'requestId must be present');
    assert.deepStrictEqual(response.body.error.details, []);
    assert.strictEqual(response.body.error.stack, undefined, 'Stack trace must not be exposed');
  });
});

describe('Sensitive URL Sanitization & Query Parameter Redaction', () => {
  it('sanitizeUrl helper should safely strip query parameters and hash fragments', () => {
    assert.strictEqual(sanitizeUrl({ originalUrl: '/api/v1/donations?token=secret123&apiKey=xyz' }), '/api/v1/donations');
    assert.strictEqual(sanitizeUrl({ url: '/health?deep=true' }), '/health');
    assert.strictEqual(sanitizeUrl({ originalUrl: '/test#section?secret=1' }), '/test');
    assert.strictEqual(sanitizeUrl({ originalUrl: '?secret=only_query' }), '/');
    assert.strictEqual(sanitizeUrl({}), 'UNKNOWN');
    assert.strictEqual(sanitizeUrl(null), 'UNKNOWN');
    assert.strictEqual(sanitizeUrl({ originalUrl: 12345 }), 'UNKNOWN');
  });

  it('HTTP 404 with secret query parameters must NOT leak secrets into logs or response body', async () => {
    let capturedLevel = null;
    let capturedMsg = null;
    let capturedMeta = null;

    const originalWarn = logger.warn;
    logger.warn = (msg, meta) => {
      capturedLevel = 'warn';
      capturedMsg = msg;
      capturedMeta = meta;
    };

    try {
      const secretToken = 'SUPER_SECRET_QUERY_TOKEN_998877';
      const secretApiKey = 'API_KEY_XYZ_CONFIDENTIAL';
      const response = await request(app)
        .get(`/api/v1/nonexistent-route?token=${secretToken}&apiKey=${secretApiKey}`);

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.body.error.code, 'NOT_FOUND');

      // 1. Response body must not contain query secrets
      assert.strictEqual(response.body.error.message.includes(secretToken), false, 'Response message must not leak query secret');
      assert.strictEqual(response.body.error.message.includes(secretApiKey), false, 'Response message must not leak api key');
      assert.strictEqual(response.body.error.message, "The requested resource '/api/v1/nonexistent-route' does not exist on this server.");

      // 2. Captured log must not contain query secrets
      assert.strictEqual(capturedLevel, 'warn');
      assert.ok(capturedMeta);
      assert.strictEqual(capturedMeta.url, '/api/v1/nonexistent-route', 'Logged URL must strip query parameters');
      assert.strictEqual(capturedMeta.url.includes(secretToken), false, 'Logged URL must not contain secret token');
      assert.strictEqual(capturedMeta.url.includes(secretApiKey), false, 'Logged URL must not contain secret API key');
      assert.strictEqual(capturedMsg.includes(secretToken), false, 'Logged message must not contain secret token');
      assert.strictEqual(capturedMsg.includes(secretApiKey), false, 'Logged message must not contain secret API key');
    } finally {
      logger.warn = originalWarn;
    }
  });

  it('HTTP 500 server error with secret query parameters must NOT leak secrets into logs or response', async () => {
    let capturedLevel = null;
    let capturedMeta = null;

    const originalError = logger.error;
    logger.error = (msg, meta) => {
      capturedLevel = 'error';
      capturedMeta = meta;
    };

    const testApp = express();
    testApp.get('/api/v1/trigger-error', () => {
      throw new Error('Database connection failed');
    });
    testApp.use(errorHandler);

    try {
      const secretPassword = 'SUPER_SECRET_PASSWORD_123';
      const response = await request(testApp)
        .get(`/api/v1/trigger-error?password=${secretPassword}`);

      assert.strictEqual(response.status, 500);
      assert.strictEqual(capturedLevel, 'error');
      assert.ok(capturedMeta);
      assert.strictEqual(capturedMeta.url, '/api/v1/trigger-error', 'Logged URL must strip query string');
      assert.strictEqual(capturedMeta.url.includes(secretPassword), false, 'Logged URL must not contain secret password');
      assert.strictEqual(JSON.stringify(response.body).includes(secretPassword), false, 'Response body must not contain secret password');
    } finally {
      logger.error = originalError;
    }
  });
});

describe('Malformed JSON Request Body Handling', () => {
  it('should catch JSON SyntaxError, return 400, MALFORMED_JSON, and safe message', async () => {
    const response = await request(app)
      .post('/api/v1')
      .set('Content-Type', 'application/json')
      .send('{ "invalid_json": true, missing_closing_bracket');

    assert.strictEqual(response.status, 400);
    assert.ok(response.body.error);
    assert.strictEqual(response.body.error.code, 'MALFORMED_JSON');
    assert.strictEqual(response.body.error.message, 'Invalid JSON payload in request body');
    assert.deepStrictEqual(response.body.error.details, []);
    assert.ok(response.body.error.requestId);
    assert.strictEqual(response.body.error.stack, undefined, 'Stack trace must not be exposed');
  });
});

describe('HTTP Integration with Operational Error Subclasses', () => {
  it('ValidationError should return HTTP 400, VALIDATION_ERROR, and preserve field details array', async () => {
    const testApp = express();
    testApp.post('/api/v1/test-validation', (req, res, next) => {
      const details = [
        { field: 'food_type', message: 'Food type is required' },
        { field: 'quantity_kg', message: 'Quantity must be greater than zero' }
      ];
      next(new ValidationError('Donation submission validation failed', details));
    });
    testApp.use(errorHandler);

    const response = await request(testApp).post('/api/v1/test-validation');

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(response.body.error.message, 'Donation submission validation failed');
    assert.strictEqual(response.body.error.details.length, 2);
    assert.deepStrictEqual(response.body.error.details[0], { field: 'food_type', message: 'Food type is required' });
    assert.deepStrictEqual(response.body.error.details[1], { field: 'quantity_kg', message: 'Quantity must be greater than zero' });
    assert.ok(response.body.error.requestId);
    assert.strictEqual(response.body.error.stack, undefined);
  });

  it('UnauthorizedError, ForbiddenError, and ConflictError should return documented HTTP status and codes', async () => {
    const testApp = express();
    testApp.get('/test-unauth', (req, res, next) => next(new UnauthorizedError('Token expired')));
    testApp.get('/test-forbidden', (req, res, next) => next(new ForbiddenError('Only donors can perform this action')));
    testApp.get('/test-conflict', (req, res, next) => next(new ConflictError('Donation has already been claimed')));
    testApp.use(errorHandler);

    const resUnauth = await request(testApp).get('/test-unauth');
    assert.strictEqual(resUnauth.status, 401);
    assert.strictEqual(resUnauth.body.error.code, 'UNAUTHORIZED');
    assert.strictEqual(resUnauth.body.error.message, 'Token expired');
    assert.deepStrictEqual(resUnauth.body.error.details, []);

    const resForbidden = await request(testApp).get('/test-forbidden');
    assert.strictEqual(resForbidden.status, 403);
    assert.strictEqual(resForbidden.body.error.code, 'FORBIDDEN');
    assert.strictEqual(resForbidden.body.error.message, 'Only donors can perform this action');

    const resConflict = await request(testApp).get('/test-conflict');
    assert.strictEqual(resConflict.status, 409);
    assert.strictEqual(resConflict.body.error.code, 'CONFLICT');
    assert.strictEqual(resConflict.body.error.message, 'Donation has already been claimed');
  });
});

describe('Production Error Masking & Stack Trace Safety', () => {
  it('should mask unexpected 500 errors, internal codes, and details in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const testApp = express();
    testApp.use((req, res, next) => {
      req.id = 'prod-test-req-123';
      next();
    });
    testApp.get('/throw-500', () => {
      const err = new Error('Database password was incorrect for host 10.0.0.1');
      err.code = 'SECRET_INTERNAL_DB_CODE_28P01';
      err.details = [{ internalHost: '10.0.0.1', secretKey: 'topsecret' }];
      throw err;
    });
    testApp.use(errorHandler);

    try {
      const response = await request(testApp).get('/throw-500');

      assert.strictEqual(response.status, 500);
      assert.strictEqual(response.body.error.code, 'INTERNAL_SERVER_ERROR', 'Internal error codes must be masked to INTERNAL_SERVER_ERROR');
      // Must not leak the real error message
      assert.strictEqual(response.body.error.message, 'An unexpected error occurred. Please contact the administrator.');
      assert.deepStrictEqual(response.body.error.details, [], 'Details must be stripped in production 500 responses');
      assert.strictEqual(response.body.error.requestId, 'prod-test-req-123');
      assert.strictEqual(response.body.error.stack, undefined, 'Stack trace must NEVER be in API response');
      assert.strictEqual(JSON.stringify(response.body).includes('10.0.0.1'), false);
      assert.strictEqual(JSON.stringify(response.body).includes('SECRET_INTERNAL_DB_CODE'), false);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should never include stack trace in API response in development or test environments', async () => {
    const testApp = express();
    testApp.get('/throw-dev', () => {
      throw new BadRequestError('Invalid food category supplied');
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/throw-dev');

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error.code, 'BAD_REQUEST');
    assert.strictEqual(response.body.error.message, 'Invalid food category supplied');
    assert.strictEqual(response.body.error.stack, undefined, 'Stack trace must not be in response');
  });
});

describe('Structured Error Logging Behavior', () => {
  it('client errors (4xx) should log at warn level and omit stack traces', () => {
    let loggedLevel = null;
    let loggedMeta = null;

    const originalWarn = logger.warn;
    logger.warn = (msg, meta) => {
      loggedLevel = 'warn';
      loggedMeta = meta;
    };

    try {
      const mockReq = { method: 'POST', originalUrl: '/api/v1/donations', id: 'client-test-id' };
      let sentStatus = null;
      let sentBody = null;
      const mockRes = {
        status(code) { sentStatus = code; return this; },
        json(body) { sentBody = body; return this; }
      };

      errorHandler(new BadRequestError('Invalid weight unit'), mockReq, mockRes, () => {});

      assert.strictEqual(sentStatus, 400);
      assert.strictEqual(loggedLevel, 'warn');
      assert.ok(loggedMeta);
      assert.strictEqual(loggedMeta.requestId, 'client-test-id');
      assert.strictEqual(loggedMeta.method, 'POST');
      assert.strictEqual(loggedMeta.url, '/api/v1/donations');
      assert.strictEqual(loggedMeta.statusCode, 400);
      assert.strictEqual(loggedMeta.code, 'BAD_REQUEST');
      assert.strictEqual(loggedMeta.stack, undefined, 'Stack trace must be omitted for client warnings');
      assert.strictEqual(sentBody.error.details.length, 0);
    } finally {
      logger.warn = originalWarn;
    }
  });

  it('server errors (5xx) should log at error level and include stack trace', () => {
    let loggedLevel = null;
    let loggedMeta = null;

    const originalError = logger.error;
    logger.error = (msg, meta) => {
      loggedLevel = 'error';
      loggedMeta = meta;
    };

    try {
      const mockReq = { method: 'GET', url: '/api/v1/claims', id: 'server-err-id' };
      let sentStatus = null;
      const mockRes = {
        status(code) { sentStatus = code; return this; },
        json() { return this; }
      };

      const runtimeError = new Error('PostgreSQL connection timeout');
      errorHandler(runtimeError, mockReq, mockRes, () => {});

      assert.strictEqual(sentStatus, 500);
      assert.strictEqual(loggedLevel, 'error');
      assert.ok(loggedMeta);
      assert.strictEqual(loggedMeta.requestId, 'server-err-id');
      assert.strictEqual(loggedMeta.method, 'GET');
      assert.strictEqual(loggedMeta.url, '/api/v1/claims');
      assert.strictEqual(loggedMeta.statusCode, 500);
      assert.strictEqual(loggedMeta.code, 'INTERNAL_SERVER_ERROR');
      assert.ok(typeof loggedMeta.stack === 'string', 'Stack trace must be present in server error logs');
    } finally {
      logger.error = originalError;
    }
  });
});

describe('Malformed Error Normalization & Untrusted Header Resilience', () => {
  it('should not crash on null, undefined, primitive, or non-Error objects', () => {
    const mockReq = { method: 'GET', url: '/test' };
    const createMockRes = () => {
      const res = {
        statusCode: null,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
      };
      return res;
    };

    // 1. null
    const res1 = createMockRes();
    assert.doesNotThrow(() => errorHandler(null, mockReq, res1, () => {}));
    assert.strictEqual(res1.statusCode, 500);
    assert.strictEqual(res1.body.error.code, 'INTERNAL_SERVER_ERROR');

    // 2. undefined
    const res2 = createMockRes();
    assert.doesNotThrow(() => errorHandler(undefined, mockReq, res2, () => {}));
    assert.strictEqual(res2.statusCode, 500);

    // 3. string primitive
    const res3 = createMockRes();
    assert.doesNotThrow(() => errorHandler('Custom string error', mockReq, res3, () => {}));
    assert.strictEqual(res3.statusCode, 500);

    // 4. plain object
    const res4 = createMockRes();
    assert.doesNotThrow(() => errorHandler({ status: 403, code: 'FORBIDDEN', message: 'No entry' }, mockReq, res4, () => {}));
    assert.strictEqual(res4.statusCode, 403);
    assert.strictEqual(res4.body.error.code, 'FORBIDDEN');
  });

  it('should reject untrusted or invalid fallback X-Request-Id headers and generate a safe UUID', () => {
    const mockReq = {
      method: 'GET',
      url: '/test',
      // No req.id; invalid header with HTML injection
      headers: { 'x-request-id': '<script>alert(1)</script>' }
    };
    let responseBody = null;
    const mockRes = {
      status() { return this; },
      json(b) { responseBody = b; return this; }
    };

    errorHandler(new BadRequestError('Test'), mockReq, mockRes, () => {});

    assert.ok(responseBody.error.requestId);
    assert.notStrictEqual(responseBody.error.requestId, '<script>alert(1)</script>');
    assert.match(responseBody.error.requestId, UUID_REGEX, 'Fallback must be replaced with valid UUID');
  });

  after(async () => {
    await closePool();
  });
});
