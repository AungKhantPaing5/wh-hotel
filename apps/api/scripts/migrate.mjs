import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(92415731)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)');
  const result = await client.query("SELECT 1 FROM schema_migrations WHERE version='001'");
  if (!result.rowCount) {
    await client.query(await readFile(new URL('../sql/001.sql', import.meta.url), 'utf8'));
    await client.query("INSERT INTO schema_migrations VALUES('001')");
  }
  await client.query('COMMIT');
  console.log('Database is up to date.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { client.release(); await pool.end(); }
