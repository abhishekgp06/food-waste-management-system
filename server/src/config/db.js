import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root or server directory if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

/**
 * Builds PostgreSQL pool configuration from environment variables.
 * Supports both DATABASE_URL and discrete DB_* parameters.
 */
export const getPoolConfig = () => {
  const useSsl = process.env.DB_SSL === 'true';
  const sslConfig = useSsl
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
    : false;

  const baseConfig = {
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || '5000', 10),
    ssl: sslConfig
  };

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ...baseConfig
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'food_waste_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ...baseConfig
  };
};

export const poolConfig = getPoolConfig();

// Instantiate the singleton connection pool
export const pool = new Pool(poolConfig);

// Catch unexpected errors on idle pool clients so process doesn't terminate silently
pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error] Unexpected error on idle client:', err.message);
});

/**
 * Executes a parameterized query using a client from the pool.
 * @param {string} text - SQL query string
 * @param {Array} [params] - Optional query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_SQL === 'true') {
      console.log(`[SQL Query] duration: ${duration}ms | rows: ${res.rowCount}`);
    }
    return res;
  } catch (err) {
    err.query = text;
    throw err;
  }
};

/**
 * Checks out a client from the pool for transactional workflows.
 * Caller MUST release client with client.release() in a finally block.
 * @returns {Promise<import('pg').PoolClient>}
 */
export const getClient = async () => {
  return await pool.connect();
};

/**
 * Tests database connectivity and returns latency and diagnostic metadata.
 * Does not throw; returns a structured status object.
 * @returns {Promise<{ ok: boolean, latencyMs: number, timestamp?: string, version?: string, error?: string, code?: string, host: string, port: number, database: string }>}
 */
export const testConnection = async () => {
  const start = Date.now();
  const host = poolConfig.host || (poolConfig.connectionString ? 'configured via DATABASE_URL' : 'localhost');
  const port = poolConfig.port || 5432;
  const database = poolConfig.database || (poolConfig.connectionString ? 'from DATABASE_URL' : 'food_waste_db');

  try {
    const res = await pool.query('SELECT NOW() AS current_time, version() AS version;');
    const latencyMs = Date.now() - start;
    return {
      ok: true,
      latencyMs,
      timestamp: res.rows[0].current_time,
      version: res.rows[0].version,
      host,
      port,
      database
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMessage = err.message || (Array.isArray(err.errors) && err.errors.length > 0
      ? err.errors.map(e => e.message).join('; ')
      : err.code || 'Failed to connect to PostgreSQL database');

    return {
      ok: false,
      latencyMs,
      error: errorMessage,
      code: err.code || err.name,
      host,
      port,
      database
    };
  }
};

/**
 * Gracefully drains and closes all active pool connections.
 */
export const closePool = async () => {
  try {
    await pool.end();
  } catch (err) {
    console.error('[PostgreSQL Pool Error] Failed to close pool:', err.message);
  }
};

export default {
  pool,
  query,
  getClient,
  testConnection,
  closePool,
  getPoolConfig
};
