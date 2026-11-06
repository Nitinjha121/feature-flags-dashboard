import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const server = createApp(db).listen(config.PORT, () => {
  console.log(`[api] listening on :${config.PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(() => void pool.end().then(() => process.exit(0)));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
