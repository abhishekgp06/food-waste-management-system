import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import app from '../src/app.js';
import { pool, getPoolConfig, testConnection, closePool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Configuration & Connection Pool', () => {
  it('should export a valid pg Pool singleton with required pool methods', () => {
    assert.ok(pool, 'Pool instance should be defined');
    assert.strictEqual(typeof pool.query, 'function', 'pool.query should be a function');
    assert.strictEqual(typeof pool.connect, 'function', 'pool.connect should be a function');
    assert.strictEqual(typeof pool.end, 'function', 'pool.end should be a function');
  });

  it('should generate valid pool config from environment defaults', () => {
    const config = getPoolConfig();
    assert.ok(config, 'Config object should be defined');
    assert.strictEqual(typeof config.max, 'number', 'config.max should be a number');
    assert.strictEqual(typeof config.idleTimeoutMillis, 'number', 'idleTimeoutMillis should be a number');
    assert.strictEqual(typeof config.connectionTimeoutMillis, 'number', 'connectionTimeoutMillis should be a number');
    assert.ok(config.max >= 5, 'config.max should have a safe default');
  });

  it('should safely handle testConnection without throwing uncaught exceptions', async () => {
    const result = await testConnection();
    assert.ok(result, 'Result should be defined');
    assert.strictEqual(typeof result.ok, 'boolean', 'result.ok should be a boolean');
    assert.strictEqual(typeof result.latencyMs, 'number', 'result.latencyMs should be a number');
    assert.ok(result.host, 'result.host should be reported');
    assert.ok(result.port, 'result.port should be reported');

    // In local environment without running Postgres, ok should be false and code should be reported
    if (!result.ok) {
      assert.ok(result.error, 'Error message should be present on failed connection');
      assert.ok(result.code, 'Error code should be present on failed connection');
    }
  });
});

describe('Database Migrations Validation', () => {
  const migrationsDir = path.resolve(__dirname, '../../database/migrations');

  it('should locate the migrations directory and find 001_initial_schema.sql', () => {
    assert.ok(fs.existsSync(migrationsDir), `Directory not found: ${migrationsDir}`);
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    assert.ok(files.includes('001_initial_schema.sql'), '001_initial_schema.sql must exist');
  });

  it('001_initial_schema.sql should contain all mandatory entity tables and constraints', () => {
    const sqlPath = path.join(migrationsDir, '001_initial_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Verify core tables
    assert.match(sql, /CREATE TABLE IF NOT EXISTS users/i, 'Must define users table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS donations/i, 'Must define donations table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS claims/i, 'Must define claims table');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS donation_events/i, 'Must define donation_events table');

    // Verify UUID extension
    assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "uuid-ossp"/i, 'Must enable UUID extension');

    // Verify atomic claim uniqueness guardrail
    assert.match(sql, /uq_active_claim_per_donation/i, 'Must define partial unique index for active claims');
  });
});

describe('HTTP Health Check Endpoints', () => {
  it('GET /health should return 200 with service metadata', async () => {
    const response = await request(app).get('/health');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.status, 'UP');
    assert.strictEqual(response.body.service, 'food-waste-management-api');
    assert.strictEqual(response.body.databaseEndpoint, '/health/db');
    assert.ok(response.body.timestamp);
  });

  it('GET /health/db should return structured health probe without crashing', async () => {
    const response = await request(app).get('/health/db');
    // Either 200 (if DB is up) or 503 (if DB is down)
    assert.ok([200, 503].includes(response.status), `Expected 200 or 503, got ${response.status}`);
    assert.ok(response.body.database, 'Response must include database status object');
    assert.strictEqual(typeof response.body.database.connected, 'boolean');
    assert.ok(response.body.database.host);
    assert.ok(response.body.database.port);

    if (response.status === 503) {
      assert.strictEqual(response.body.status, 'DOWN');
      assert.strictEqual(response.body.database.connected, false);
      assert.ok(response.body.database.error);
    } else {
      assert.strictEqual(response.body.status, 'UP');
      assert.strictEqual(response.body.database.connected, true);
    }
  });
});

describe('Migration Runner Resilience', () => {
  it('runMigrations should return structured status object', async () => {
    const { runMigrations } = await import('../src/scripts/migrate.js');
    const res = await runMigrations();
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof res.success, 'boolean');
    assert.strictEqual(typeof res.connected, 'boolean');
    if (!res.connected) {
      assert.strictEqual(res.success, false);
      assert.ok(res.error);
    } else {
      assert.strictEqual(res.success, true);
    }
  });

  it('checkMigrationStatus should return structured status object', async () => {
    const { checkMigrationStatus } = await import('../src/scripts/migrate.js');
    const res = await checkMigrationStatus();
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(typeof res.success, 'boolean');
    if (!res.success) {
      assert.ok(res.error);
    } else {
      assert.ok(Array.isArray(res.migrations));
    }
  });

  after(async () => {
    await closePool();
  });
});
