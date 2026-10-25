import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, testConnection, closePool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolved path to database/migrations
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');

/**
 * Creates the schema_migrations tracking table if it does not already exist.
 * This guarantees idempotent migration tracking without modifying business data.
 * @param {import('pg').PoolClient} client
 */
const ensureMigrationTable = async (client) => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await client.query(createTableQuery);
};

/**
 * Retrieves list of already-applied migration names from schema_migrations.
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Set<string>>}
 */
const getAppliedMigrations = async (client) => {
  const res = await client.query('SELECT name, applied_at FROM schema_migrations ORDER BY id ASC;');
  return new Map(res.rows.map(row => [row.name, row.applied_at]));
};

/**
 * Reads and returns sorted list of .sql migration files from the migrations folder.
 * @returns {string[]}
 */
const getAvailableMigrationFiles = () => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found at: ${MIGRATIONS_DIR}`);
  }

  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Lexicographical sort ensures 001_..., 002_... order
};

/**
 * Displays user-friendly diagnostics and exact next actions when connection fails.
 */
const printConnectionFailure = (testResult) => {
  console.error('\n=============================================================');
  console.error('❌ DATABASE CONNECTION FAILED');
  console.error('=============================================================');
  console.error(`Target Host     : ${testResult.host}`);
  console.error(`Target Port     : ${testResult.port}`);
  console.error(`Target Database : ${testResult.database}`);
  console.error(`Error Code      : ${testResult.code || 'UNKNOWN'}`);
  console.error(`Error Message   : ${testResult.error}`);
  console.error('-------------------------------------------------------------');
  console.error('📋 EXACT NEXT ACTION REQUIRED:');

  if (testResult.code === 'ECONNREFUSED') {
    console.error('1. PostgreSQL is not running or not listening on the specified host:port.');
    console.error('   - If running locally: Start the PostgreSQL Windows service, or run:');
    console.error('       docker compose up -d postgres');
    console.error('   - Or verify PostgreSQL is installed and listening on port ' + testResult.port);
    console.error('2. If using a remote/cloud database (e.g. AWS RDS, Supabase, Neon):');
    console.error('   - Set DATABASE_URL in your .env file with the valid connection string.');
  } else if (testResult.code === '28P01') {
    console.error('1. Authentication failed for user. Check DB_USER and DB_PASSWORD in .env.');
  } else if (testResult.code === '3D000') {
    console.error(`1. Database "${testResult.database}" does not exist.`);
    console.error(`   - Create it via: CREATE DATABASE ${testResult.database};`);
  } else {
    console.error('1. Check network connectivity, credentials, and firewall rules.');
    console.error('2. Review your .env database configuration.');
  }
  console.error('=============================================================\n');
};

/**
 * Checks migration status without running pending ones.
 */
export const checkMigrationStatus = async () => {
  const connTest = await testConnection();
  if (!connTest.ok) {
    printConnectionFailure(connTest);
    return { success: false, error: connTest.error };
  }

  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const appliedMap = await getAppliedMigrations(client);
    const available = getAvailableMigrationFiles();

    console.log('\n=============================================================');
    console.log('📊 DATABASE MIGRATION STATUS');
    console.log('=============================================================');
    console.log(`Host: ${connTest.host}:${connTest.port} | Database: ${connTest.database}`);
    console.log('-------------------------------------------------------------');

    const statusList = available.map(file => {
      const isApplied = appliedMap.has(file);
      const appliedAt = isApplied ? appliedMap.get(file).toISOString() : 'PENDING';
      return { file, status: isApplied ? 'APPLIED' : 'PENDING', appliedAt };
    });

    console.table(statusList);
    console.log('=============================================================\n');

    return {
      success: true,
      total: available.length,
      applied: appliedMap.size,
      pending: available.length - appliedMap.size,
      migrations: statusList
    };
  } finally {
    client.release();
  }
};

/**
 * Runs all pending migrations inside atomic transactions.
 * Preserves existing data; tracks applied files to prevent duplicate runs.
 */
export const runMigrations = async () => {
  console.log('Testing PostgreSQL connection prior to migration...');
  const connTest = await testConnection();
  if (!connTest.ok) {
    printConnectionFailure(connTest);
    return {
      success: false,
      connected: false,
      executed: false,
      error: connTest.error,
      code: connTest.code
    };
  }

  console.log(`Connected to PostgreSQL (${connTest.version.split(' ')[0]} ${connTest.version.split(' ')[1] || ''}) at ${connTest.host}:${connTest.port}`);
  console.log(`Latency: ${connTest.latencyMs}ms | Target DB: ${connTest.database}`);

  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const appliedMap = await getAppliedMigrations(client);
    const availableFiles = getAvailableMigrationFiles();

    const pendingFiles = availableFiles.filter(f => !appliedMap.has(f));

    if (pendingFiles.length === 0) {
      console.log(`\n✅ Database is up to date. All ${availableFiles.length} migrations have already been applied.`);
      return {
        success: true,
        connected: true,
        executed: false,
        pendingCount: 0,
        appliedCount: availableFiles.length
      };
    }

    console.log(`\nFound ${pendingFiles.length} pending migration(s) out of ${availableFiles.length} total:`);
    pendingFiles.forEach(f => console.log(`  - [PENDING] ${f}`));

    for (const file of pendingFiles) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      console.log(`\nExecuting migration: ${file}...`);
      const startTime = Date.now();

      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        const duration = Date.now() - startTime;
        console.log(`✅ [APPLIED] ${file} (${duration}ms)`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n❌ [FAILED] Migration ${file} failed: ${err.message}`);
        console.error('Transaction rolled back. No changes were committed for this migration.');
        throw err;
      }
    }

    console.log('\n=============================================================');
    console.log(`🎉 Successfully applied ${pendingFiles.length} migration(s).`);
    console.log('=============================================================\n');

    return {
      success: true,
      connected: true,
      executed: true,
      executedCount: pendingFiles.length,
      executedFiles: pendingFiles
    };
  } finally {
    client.release();
  }
};

// Direct CLI execution support
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const isStatusCheck = process.argv.includes('--status');
  const action = isStatusCheck ? checkMigrationStatus() : runMigrations();

  action
    .then(async (result) => {
      await closePool();
      if (!result.success) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('\nFatal migration runner error:', err.message);
      await closePool();
      process.exit(1);
    });
}

export default {
  runMigrations,
  checkMigrationStatus
};
