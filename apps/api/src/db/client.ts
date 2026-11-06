import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export interface DbOptions {
  /** Postgres ends a transaction left idle this long — a backstop against stuck transactions. */
  idleInTransactionTimeoutMs?: number;
  max?: number;
}

export function createDb(connectionString: string, options: DbOptions = {}) {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    ...(options.idleInTransactionTimeoutMs
      ? { options: `-c idle_in_transaction_session_timeout=${options.idleInTransactionTimeoutMs}` }
      : {}),
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
/** Either the root db or a transaction handle — both expose the same query builder. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
