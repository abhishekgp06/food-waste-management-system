import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { isValidRequestId } from '../src/middleware/requestId.js';
import logger from '../src/utils/logger.js';
import { closePool } from '../src/config/db.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Request Correlation ID Validator (isValidRequestId)', () => {
  it('should accept valid standard UUIDs and safe identifiers', () => {
    assert.strictEqual(isValidRequestId('c8b7470f-6218-4a9f-8898-1123456789ab'), true);
    assert.strictEqual(isValidRequestId('client_trace-12345'), true);
    assert.strictEqual(isValidRequestId('ABC-123_xyz'), true);
  });

  it('should reject invalid or unsafe request IDs', () => {
    assert.strictEqual(isValidRequestId(null), false);
    assert.strictEqual(isValidRequestId(undefined), false);
    assert.strictEqual(isValidRequestId(12345), false);
    assert.strictEqual(isValidRequestId(''), false);
    assert.strictEqual(isValidRequestId('has space in id'), false);
    assert.strictEqual(isValidRequestId('id\r\ninjection'), false);
    assert.strictEqual(isValidRequestId('<script>alert(1)</script>'), false);
    assert.strictEqual(isValidRequestId('id"with"quotes'), false);
    // Exceeds max length of 128 chars
    const overlyLong = 'a'.repeat(129);
    assert.strictEqual(isValidRequestId(overlyLong), false);
  });
});

describe('Request Correlation ID Middleware & HTTP Behavior', () => {
  it('should generate a valid UUID v4 X-Request-Id header when omitted by client', async () => {
    const response = await request(app).get('/health');
    assert.strictEqual(response.status, 200);
    const requestIdHeader = response.headers['x-request-id'];
    assert.ok(requestIdHeader, 'X-Request-Id header must be present in response');
    assert.match(requestIdHeader, UUID_REGEX, 'Generated ID must match UUID format');
  });

  it('should preserve and echo a valid client-supplied X-Request-Id', async () => {
    const customId = 'client-session-trace-98765';
    const response = await request(app)
      .get('/health')
      .set('X-Request-Id', customId);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers['x-request-id'], customId);
  });

  it('should safely replace an invalid incoming X-Request-Id with a new UUID', async () => {
    const invalidId = 'bad id with spaces and @symbols!';
    const response = await request(app)
      .get('/health')
      .set('X-Request-Id', invalidId);

    assert.strictEqual(response.status, 200);
    const resultId = response.headers['x-request-id'];
    assert.notStrictEqual(resultId, invalidId);
    assert.match(resultId, UUID_REGEX, 'Replaced ID must be a valid UUID');
  });

  it('should safely replace an overly long incoming X-Request-Id (>128 chars) with a new UUID', async () => {
    const longId = 'x'.repeat(200);
    const response = await request(app)
      .get('/health')
      .set('X-Request-Id', longId);

    assert.strictEqual(response.status, 200);
    const resultId = response.headers['x-request-id'];
    assert.notStrictEqual(resultId, longId);
    assert.match(resultId, UUID_REGEX, 'Replaced ID must be a valid UUID');
  });

  it('should attach req.id to 404 response payload and match X-Request-Id header', async () => {
    const customId = 'trace-404-check-111';
    const response = await request(app)
      .get('/api/v1/nonexistent-route-for-testing')
      .set('X-Request-Id', customId);

    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers['x-request-id'], customId);
    assert.strictEqual(response.body.error.code, 'NOT_FOUND');
    assert.strictEqual(response.body.error.requestId, customId);
  });
});

describe('Existing Health Probe Endpoints Regression', () => {
  it('GET /health should maintain intact response payload alongside X-Request-Id header', async () => {
    const response = await request(app).get('/health');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.status, 'UP');
    assert.strictEqual(response.body.service, 'food-waste-management-api');
    assert.strictEqual(response.body.academicYear, '2026-2027');
    assert.strictEqual(response.body.institution, 'The National Institute of Engineering, Mysuru');
    assert.strictEqual(response.body.databaseEndpoint, '/health/db');
    assert.ok(response.body.timestamp);
    assert.ok(response.headers['x-request-id']);
  });

  it('GET /health/db should maintain intact response payload alongside X-Request-Id header', async () => {
    const response = await request(app).get('/health/db');
    // If DB is running, 200; if offline, 503
    assert.ok([200, 503].includes(response.status));
    assert.ok(response.body.database);
    assert.strictEqual(typeof response.body.database.connected, 'boolean');
    assert.ok(response.headers['x-request-id']);
  });

  it('GET /api/v1 root placeholder should maintain intact response payload and X-Request-Id', async () => {
    const response = await request(app).get('/api/v1');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.message, 'Welcome to Cloud-Based Food Waste Management API (v1)');
    assert.ok(response.headers['x-request-id']);
  });
});

describe('Structured Winston Logger', () => {
  it('should export a configured Winston logger instance with expected methods', () => {
    assert.ok(logger, 'Logger instance must be defined');
    assert.strictEqual(typeof logger.info, 'function', 'logger.info must be a function');
    assert.strictEqual(typeof logger.warn, 'function', 'logger.warn must be a function');
    assert.strictEqual(typeof logger.error, 'function', 'logger.error must be a function');
    assert.strictEqual(typeof logger.debug, 'function', 'logger.debug must be a function');
  });

  it('should have default service metadata configured', () => {
    assert.strictEqual(logger.defaultMeta.service, 'food-waste-management-api');
  });

  after(async () => {
    await closePool();
  });
});
