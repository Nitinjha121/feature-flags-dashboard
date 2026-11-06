import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { outboxEvents, type OutboxEventRow } from '../db/schema';

export interface OutboxWorkerOptions {
  webhookUrl: string;
  maxAttempts: number;
  batchSize: number;
  timeoutMs: number;
}

type DeliveryResult = { ok: true } | { ok: false; error: string };

export interface BatchResult {
  delivered: number;
  retried: number;
  failed: number;
}

const MAX_BACKOFF_SECONDS = 60;

/** Exponential backoff (2, 4, 8, ... s) capped at 60s, plus up to 20% jitter. */
function backoffSeconds(attempts: number): number {
  const base = Math.min(2 ** attempts, MAX_BACKOFF_SECONDS);
  return base + Math.random() * base * 0.2;
}

/** Never throws: every outcome, including timeouts and network errors, becomes a result. */
async function deliver(event: OutboxEventRow, opts: OutboxWorkerOptions): Promise<DeliveryResult> {
  try {
    const res = await fetch(opts.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': event.id },
      body: JSON.stringify({
        id: event.id,
        type: event.eventType,
        createdAt: event.createdAt.toISOString(),
        data: event.payload,
      }),
      // Every request gets its own timeout, so a hanging receiver can't hold the transaction.
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
}

/**
 * One worker pass, in one transaction:
 *  1. lock up to `batchSize` due pending events with FOR UPDATE SKIP LOCKED (other workers
 *     skip them, so several workers can run safely);
 *  2. send them in parallel, each with its own timeout and its own result;
 *  3. record each result on its own row: delivered, retry later, or failed for good once
 *     attempts are used up;
 *  4. commit (returning from the callback). Anything thrown rolls the whole pass back, the
 *     locks are released and the events stay pending for the next pass.
 *
 * Trade-off: the row locks and one connection are held while the HTTP requests run (at most
 * ~timeoutMs, since they run in parallel). Fine at this scale; see docs/DECISIONS.md for the
 * claim + lease design we'd use at higher volume.
 */
export async function processOutboxBatch(db: Db, opts: OutboxWorkerOptions): Promise<BatchResult> {
  return db.transaction(async (tx) => {
    const events = await tx
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.status, 'pending'), lte(outboxEvents.nextAttemptAt, sql`now()`)))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(opts.batchSize)
      .for('update', { skipLocked: true });

    const result: BatchResult = { delivered: 0, retried: 0, failed: 0 };
    if (events.length === 0) return result;

    // deliver() never throws, so Promise.all can't reject part-way.
    const deliveries = await Promise.all(events.map((event) => deliver(event, opts)));

    for (const [i, event] of events.entries()) {
      const delivery = deliveries[i] ?? { ok: false, error: 'missing delivery result' };

      if (delivery.ok) {
        await tx
          .update(outboxEvents)
          .set({ status: 'delivered', deliveredAt: sql`now()`, lastError: null })
          .where(eq(outboxEvents.id, event.id));
        result.delivered++;
        continue;
      }

      const attempts = event.attempts + 1;
      if (attempts >= opts.maxAttempts) {
        // Terminal: never picked up again; stays in the table for inspection or manual replay.
        await tx
          .update(outboxEvents)
          .set({ status: 'failed', attempts, lastError: delivery.error })
          .where(eq(outboxEvents.id, event.id));
        result.failed++;
        console.warn(
          `[worker] event ${event.id} failed permanently after ${attempts} attempts: ${delivery.error}`,
        );
      } else {
        const delay = backoffSeconds(attempts);
        await tx
          .update(outboxEvents)
          .set({
            attempts,
            lastError: delivery.error,
            nextAttemptAt: sql`now() + make_interval(secs => ${delay})`,
          })
          .where(eq(outboxEvents.id, event.id));
        result.retried++;
      }
    }
    return result;
  });
}

/** Polls until `signal` aborts. A failing pass is logged and the loop carries on. */
export async function runOutboxWorker(
  db: Db,
  opts: OutboxWorkerOptions & { pollIntervalMs: number; signal: AbortSignal },
): Promise<void> {
  while (!opts.signal.aborted) {
    try {
      const r = await processOutboxBatch(db, opts);
      if (r.delivered || r.retried || r.failed) {
        console.log(`[worker] delivered=${r.delivered} retried=${r.retried} failed=${r.failed}`);
      }
    } catch (err) {
      console.error('[worker] pass failed, will retry next poll', err);
    }
    await sleep(opts.pollIntervalMs, opts.signal);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
