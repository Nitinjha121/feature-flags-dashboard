import express from 'express';
import { sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { errorHandler } from './http/errors';
import { auditRouter } from './modules/audit/audit.routes';
import { flagsRouter } from './modules/flags/flags.routes';

/** Builds the app without listening, so tests can drive it with supertest. */
export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    await db.execute(sql`select 1`);
    res.json({ status: 'ok' });
  });

  app.use('/api/flags', flagsRouter(db));
  app.use('/api/audit-logs', auditRouter(db));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
