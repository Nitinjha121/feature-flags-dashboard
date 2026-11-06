import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { outboxEvents } from '../src/db/schema';
import { processOutboxBatch, type OutboxWorkerOptions } from '../src/outbox/worker';
import { connectTestDb, resetTables } from './test-db';

const { db, pool } = connectTestDb();

/** Stub receiver whose response status each test controls; records what it received. */
let respondWith = 200;
const received: { idempotencyKey: string | undefined; body: unknown }[] = [];
let server: Server;
let options: OutboxWorkerOptions;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      received.push({
        idempotencyKey: req.headers['idempotency-key'] as string | undefined,
        body: JSON.parse(raw),
      });
      res.writeHead(respondWith).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  options = {
    webhookUrl: `http://127.0.0.1:${port}/hook`,
    maxAttempts: 5,
    batchSize: 5,
    timeoutMs: 2000,
  };
});

beforeEach(async () => {
  await resetTables(db);
  received.length = 0;
  respondWith = 200;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function insertEvent() {
  const [event] = await db
    .insert(outboxEvents)
    .values({ eventType: 'flag.toggled', payload: { flag: { key: 'firmware-ota-v2' } } })
    .returning();
  return event!;
}

const reload = async (id: string) =>
  (await db.select().from(outboxEvents).where(eq(outboxEvents.id, id)))[0]!;

describe('outbox worker', () => {
  it('delivers a pending event with its id as the Idempotency-Key', async () => {
    const event = await insertEvent();

    expect(await processOutboxBatch(db, options)).toEqual({ delivered: 1, retried: 0, failed: 0 });

    const row = await reload(event.id);
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt).not.toBeNull();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      idempotencyKey: event.id,
      body: { id: event.id, type: 'flag.toggled', data: { flag: { key: 'firmware-ota-v2' } } },
    });
  });

  it('schedules a retry with backoff when the receiver fails', async () => {
    respondWith = 500;
    const event = await insertEvent();

    expect(await processOutboxBatch(db, options)).toEqual({ delivered: 0, retried: 1, failed: 0 });

    const row = await reload(event.id);
    expect(row).toMatchObject({ status: 'pending', attempts: 1, lastError: 'HTTP 500' });
    const [{ inFuture } = { inFuture: false }] = await db
      .select({ inFuture: sql<boolean>`${outboxEvents.nextAttemptAt} > now()` })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, event.id));
    expect(inFuture).toBe(true);

    // Not due yet, so the next pass leaves it alone.
    expect(await processOutboxBatch(db, options)).toEqual({ delivered: 0, retried: 0, failed: 0 });
  });

  it('marks an event failed once attempts are used up, and never picks it up again', async () => {
    respondWith = 503;
    const event = await insertEvent();
    const once = { ...options, maxAttempts: 1 };

    expect(await processOutboxBatch(db, once)).toEqual({ delivered: 0, retried: 0, failed: 1 });
    expect(await reload(event.id)).toMatchObject({ status: 'failed', attempts: 1 });

    respondWith = 200;
    expect(await processOutboxBatch(db, once)).toEqual({ delivered: 0, retried: 0, failed: 0 });
    expect(received).toHaveLength(1);
  });
});
