import pg from 'pg';
import { runMigrations } from '../src/db/migrate';
import { connectTestDb, TEST_DATABASE_URL } from './test-db';

/** Creates the test database if needed and applies the real migrations to it. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('select 1 from pg_database where datname = $1', [dbName]);
    if (exists.rowCount === 0) await admin.query(`create database "${dbName}"`);
  } finally {
    await admin.end();
  }

  const { db, pool } = connectTestDb();
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
