import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(92415731)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)');
  const directory = new URL('../sql/', import.meta.url);
  for (const file of (await readdir(directory)).filter(f => /^\d{3}\.sql$/.test(f)).sort()) {
    const version = file.slice(0, 3);
    if (!(await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version])).rowCount) {
      await client.query(await readFile(new URL(file, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations VALUES($1)', [version]);
    }
  }
  await client.query('COMMIT');
  console.log('Database is up to date.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
