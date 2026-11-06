import { sql } from 'drizzle-orm';
import { createDb } from '../src/db/client';

/** A dedicated database, never the dev one: tests truncate tables. Set by docker-compose.test.yml. */
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required; run the tests with `make test`');
export const TEST_DATABASE_URL = url;

export function connectTestDb() {
  return createDb(TEST_DATABASE_URL, { max: 5 });
}

export async function resetTables(db: ReturnType<typeof connectTestDb>['db']) {
  // TRUNCATE is not covered by the row-level immutability trigger (see migration 0001).
  await db.execute(
    sql`truncate table audit_logs, outbox_events, feature_flags restart identity cascade`,
  );
}
