/**
 * Mock webhook receiver — stands in for an external system (Slack, PagerDuty, ...) that is
 * notified when a prod flag changes.
 *
 * Deduplication is IN MEMORY and for demonstration only: the worker delivers at-least-once,
 * so the same event can arrive twice. The first delivery of an Idempotency-Key is recorded;
 * repeats get 200 (so the sender stops retrying) and only bump a counter.
 * Not production-grade: keys are lost on restart and not shared between instances. A real
 * receiver would persist the key in the same transaction as its side effect (unique
 * constraint) or use Redis SET NX with a TTL. See docs/DECISIONS.md.
 */
import express from 'express';

interface ReceivedEvent {
  idempotencyKey: string;
  receivedAt: string;
  deliveryCount: number;
  body: unknown;
}

const PORT = Number(process.env.PORT ?? 4100);
const events = new Map<string, ReceivedEvent>();

const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhooks/feature-flags', (req, res) => {
  const key = req.header('idempotency-key');
  if (!key) {
    res.status(400).json({ error: 'Idempotency-Key header is required' });
    return;
  }
  // Node runs this handler to completion before the next request, so check-then-set can't
  // race within this process.
  const existing = events.get(key);
  if (existing) {
    existing.deliveryCount++;
    console.log(`[receiver] duplicate delivery of ${key} (x${existing.deliveryCount}), ignored`);
    res.json({ status: 'duplicate' });
    return;
  }
  events.set(key, {
    idempotencyKey: key,
    receivedAt: new Date().toISOString(),
    deliveryCount: 1,
    body: req.body,
  });
  console.log(`[receiver] received ${key}: ${JSON.stringify(req.body)}`);
  res.json({ status: 'received' });
});

/** Newest first — used by the E2E test and for manual inspection. */
app.get('/events', (_req, res) => {
  res.json({ data: [...events.values()].reverse() });
});

app.listen(PORT, () => {
  console.log(`[receiver] listening on :${PORT}`);
});
