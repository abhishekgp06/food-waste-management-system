import { pool, poolConfig, testConnection, closePool } from '../config/db.js';

/**
 * Diagnostic database connectivity test script.
 * Verifies credentials, network reachability, latency, and schema state.
 */
const runDbTest = async () => {
  console.log('=============================================================');
  console.log('🔍 POSTGRESQL CONNECTION & HEALTH CHECK');
  console.log('=============================================================');
  console.log('Configuration Target:');
  console.log(`  Host     : ${poolConfig.host || (poolConfig.connectionString ? 'Via DATABASE_URL' : 'localhost')}`);
  console.log(`  Port     : ${poolConfig.port || 5432}`);
  console.log(`  Database : ${poolConfig.database || 'food_waste_db'}`);
  console.log(`  User     : ${poolConfig.user || 'postgres'}`);
  console.log(`  Password : ${poolConfig.password ? '******** (configured)' : '(empty)'}`);
  console.log(`  SSL      : ${poolConfig.ssl ? 'Enabled' : 'Disabled'}`);
  console.log(`  Pool Max : ${poolConfig.max}`);
  console.log('-------------------------------------------------------------');
  console.log('Attempting connection to PostgreSQL...');

  const result = await testConnection();

  if (!result.ok) {
    console.error('\n❌ CONNECTION TEST FAILED');
    console.error(`  Error Code   : ${result.code || 'UNKNOWN'}`);
    console.error(`  Error Message: ${result.error}`);
    console.error('-------------------------------------------------------------');
    console.error('📋 DIAGNOSTIC ADVICE:');

    if (result.code === 'ECONNREFUSED') {
      console.error('  • No PostgreSQL server is accepting connections on ' + result.host + ':' + result.port);
      console.error('  • Potential causes:');
      console.error('      1. PostgreSQL service is stopped or not installed locally.');
      console.error('      2. Docker container is not running (run: docker compose up -d postgres).');
      console.error('      3. PostgreSQL is listening on a different port (e.g. 5433 instead of 5432).');
      console.error('  • Immediate next step:');
      console.error('      Start PostgreSQL or configure DATABASE_URL in .env pointing to an active database.');
    } else if (result.code === '28P01') {
      console.error('  • Password authentication failed for user: ' + poolConfig.user);
      console.error('  • Immediate next step: Update DB_PASSWORD or DB_USER in your .env file.');
    } else if (result.code === '3D000') {
      console.error('  • Database "' + result.database + '" does not exist.');
      console.error('  • Immediate next step: Connect to PostgreSQL and run: CREATE DATABASE ' + result.database + ';');
    } else {
      console.error('  • Verify network route, firewall, and .env configuration.');
    }
    console.error('=============================================================\n');
    await closePool();
    process.exit(1);
  }

  console.log('\n✅ CONNECTION SUCCESSFUL');
  console.log(`  Server Version : ${result.version}`);
  console.log(`  Server Time    : ${result.timestamp}`);
  console.log(`  Latency        : ${result.latencyMs} ms`);

  // Query existing public tables
  try {
    const tableRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `);

    const tables = tableRes.rows.map(r => r.table_name);
    console.log(`  Public Tables  : ${tables.length > 0 ? tables.join(', ') : 'None (No tables created yet)'}`);

    // Check migrations table
    if (tables.includes('schema_migrations')) {
      const migRes = await pool.query('SELECT name, applied_at FROM schema_migrations ORDER BY id ASC;');
      console.log(`  Applied Migrations (${migRes.rows.length}):`);
      migRes.rows.forEach(r => console.log(`    - ${r.name} (applied ${r.applied_at.toISOString()})`));
    } else {
      console.log('  Migrations     : schema_migrations table not found (run `npm run migrate` to apply)');
    }
  } catch (err) {
    console.warn('  Could not inspect existing tables:', err.message);
  }

  console.log('=============================================================\n');
  await closePool();
  process.exit(0);
};

runDbTest().catch(async (err) => {
  console.error('Fatal error during connection test:', err);
  await closePool();
  process.exit(1);
});
