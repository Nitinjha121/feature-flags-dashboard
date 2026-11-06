import { loadConfig } from './config';
import { createDb } from './db/client';
import { runOutboxWorker } from './outbox/worker';

const config = loadConfig();
// Backstop: Postgres ends any transaction of ours left idle for 30s, whatever the cause.
const { db, pool } = createDb(config.DATABASE_URL, { max: 2, idleInTransactionTimeoutMs: 30_000 });

const controller = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[worker] ${signal} received, finishing current pass`);
    controller.abort();
  });
}

console.log(`[worker] started, delivering to ${config.WEBHOOK_URL}`);
await runOutboxWorker(db, {
  webhookUrl: config.WEBHOOK_URL,
  maxAttempts: config.OUTBOX_MAX_ATTEMPTS,
  batchSize: config.OUTBOX_BATCH_SIZE,
  timeoutMs: config.WEBHOOK_TIMEOUT_MS,
  pollIntervalMs: config.OUTBOX_POLL_INTERVAL_MS,
  signal: controller.signal,
});
await pool.end();
console.log('[worker] stopped');
