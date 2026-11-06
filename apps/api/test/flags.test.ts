import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { auditLogs, featureFlags, outboxEvents } from '../src/db/schema';
import { connectTestDb, resetTables } from './test-db';

const { db, pool } = connectTestDb();
const app = createApp(db);
const ACTOR = 'alice@husqvarna.dev';

const createFlag = (body: Record<string, unknown>, actor: string | null = ACTOR) => {
  const req = request(app).post('/api/flags');
  if (actor) req.set('X-Actor', actor);
  return req.send(body);
};
const setEnabled = (id: string, enabled: boolean, actor = 'bob@husqvarna.dev') =>
  request(app).patch(`/api/flags/${id}`).set('X-Actor', actor).send({ enabled });

const flag = (key: string, environment = 'dev', enabled = false) => ({
  key,
  description: `${key} description`,
  environment,
  enabled,
});

beforeEach(() => resetTables(db));
afterAll(() => pool.end());

describe('GET /api/flags', () => {
  it('lists flags and filters by environment and status', async () => {
    await createFlag(flag('alpha', 'dev', true));
    await createFlag(flag('alpha', 'prod', false));
    await createFlag(flag('beta', 'prod', true));

    const all = await request(app).get('/api/flags').expect(200);
    expect(all.body.data).toHaveLength(3);

    const prod = await request(app).get('/api/flags?environment=prod').expect(200);
    expect(prod.body.data.map((f: { key: string }) => f.key)).toEqual(['alpha', 'beta']);

    const prodEnabled = await request(app)
      .get('/api/flags?environment=prod&status=enabled')
      .expect(200);
    expect(prodEnabled.body.data).toHaveLength(1);
    expect(prodEnabled.body.data[0]).toMatchObject({ key: 'beta', environment: 'prod' });
  });

  it('rejects an unknown filter value', async () => {
    const res = await request(app).get('/api/flags?environment=qa').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/flags', () => {
  it('creates a flag and writes a FLAG_CREATED audit entry in the same transaction', async () => {
    const res = await createFlag(flag('new-checkout-flow', 'staging', true)).expect(201);
    expect(res.body.data).toMatchObject({
      key: 'new-checkout-flow',
      environment: 'staging',
      enabled: true,
    });

    const entries = await db.select().from(auditLogs);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      flagId: res.body.data.id,
      actor: ACTOR,
      action: 'FLAG_CREATED',
      previousState: null,
      newState: { enabled: true, description: 'new-checkout-flow description' },
    });
  });

  it('allows the same key in another environment but returns 409 in the same one', async () => {
    await createFlag(flag('dark-mode', 'dev')).expect(201);
    await createFlag(flag('dark-mode', 'prod')).expect(201);

    const dup = await createFlag(flag('dark-mode', 'dev')).expect(409);
    expect(dup.body.error.code).toBe('FLAG_ALREADY_EXISTS');

    // The failed create left nothing behind: no flag and no audit entry.
    expect(await db.select().from(featureFlags)).toHaveLength(2);
    expect(await db.select().from(auditLogs)).toHaveLength(2);
  });

  it('returns 409 for exactly one of two concurrent creates of the same key', async () => {
    const results = await Promise.all([
      createFlag(flag('race-flag', 'prod')),
      createFlag(flag('race-flag', 'prod')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('validates input and requires an actor', async () => {
    const bad = await createFlag(flag('Not Kebab', 'dev')).expect(400);
    expect(bad.body.error.details[0].path).toBe('key');

    await createFlag({ key: 'ok-key', environment: 'dev' }).expect(400);
    await createFlag(flag('ok-key', 'qa')).expect(400);

    const noActor = await createFlag(flag('ok-key'), null).expect(400);
    expect(noActor.body.error.code).toBe('ACTOR_REQUIRED');

    expect(await db.select().from(featureFlags)).toHaveLength(0);
  });

  it('answers malformed and oversized bodies with 4xx, not 500', async () => {
    const malformed = await request(app)
      .post('/api/flags')
      .set('X-Actor', ACTOR)
      .set('Content-Type', 'application/json')
      .send('{"key":')
      .expect(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');

    const tooLarge = await createFlag({ ...flag('big-flag'), description: 'a'.repeat(200_000) });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('PATCH /api/flags/:id', () => {
  it('records the true previous and new state in the audit log', async () => {
    const { body } = await createFlag(flag('battery-saver', 'dev', false));

    await setEnabled(body.data.id, true).expect(200);
    await setEnabled(body.data.id, false, 'carol@husqvarna.dev').expect(200);

    const entries = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.flagId, body.data.id))
      .orderBy(auditLogs.id);
    expect(entries.map((e) => e.action)).toEqual(['FLAG_CREATED', 'FLAG_ENABLED', 'FLAG_DISABLED']);
    expect(entries[1]).toMatchObject({
      actor: 'bob@husqvarna.dev',
      previousState: { enabled: false },
      newState: { enabled: true },
    });
    expect(entries[2]).toMatchObject({
      actor: 'carol@husqvarna.dev',
      previousState: { enabled: true },
      newState: { enabled: false },
    });
  });

  it('is idempotent: setting the current state writes no audit entry', async () => {
    const { body } = await createFlag(flag('steady-flag', 'dev', true));
    const res = await setEnabled(body.data.id, true).expect(200);
    expect(res.body.meta.changed).toBe(false);
    expect(await db.select().from(auditLogs)).toHaveLength(1);
  });

  it('reads the previous state under a row lock, so a concurrent change is never lost', async () => {
    const { body } = await createFlag(flag('contended-flag', 'dev', false));
    const id: string = body.data.id;

    // Another transaction locks the row and enables the flag, committing a moment later.
    const other = await pool.connect();
    await other.query('begin');
    await other.query('select 1 from feature_flags where id = $1 for update', [id]);
    await other.query('update feature_flags set enabled = true where id = $1', [id]);
    const pending = setEnabled(id, true).then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await other.query('commit');
    other.release();

    // The API request waited for the lock, then saw enabled = true: nothing to change.
    // Without FOR UPDATE it would have read the stale "false" and logged a fake transition.
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.body.meta.changed).toBe(false);
    expect(
      await db.select().from(auditLogs).where(eq(auditLogs.action, 'FLAG_ENABLED')),
    ).toHaveLength(0);
  });

  it('enqueues a webhook event for prod changes only', async () => {
    const dev = await createFlag(flag('notify-me', 'dev'));
    const prod = await createFlag(flag('notify-me', 'prod'));
    await resetOutbox();

    await setEnabled(dev.body.data.id, true).expect(200);
    expect(await db.select().from(outboxEvents)).toHaveLength(0);

    await setEnabled(prod.body.data.id, true).expect(200);
    const events = await db.select().from(outboxEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'flag.toggled', status: 'pending', attempts: 0 });
    expect(events[0]?.payload).toMatchObject({
      actor: 'bob@husqvarna.dev',
      flag: { key: 'notify-me', environment: 'prod', enabled: true },
      previousState: { enabled: false },
    });
  });

  it('returns 404 for unknown or malformed ids and 400 for a bad body', async () => {
    await setEnabled('00000000-0000-4000-8000-00000000ffff', true).expect(404);
    await setEnabled('not-a-uuid', true).expect(404);
    const { body } = await createFlag(flag('body-check'));
    await request(app)
      .patch(`/api/flags/${body.data.id}`)
      .set('X-Actor', ACTOR)
      .send({ enabled: 'yes' })
      .expect(400);
  });
});

describe('audit log', () => {
  it('is returned newest first', async () => {
    const { body } = await createFlag(flag('feed-flag'));
    await setEnabled(body.data.id, true);
    const res = await request(app).get('/api/audit-logs?limit=10').expect(200);
    expect(res.body.data.map((e: { action: string }) => e.action)).toEqual([
      'FLAG_ENABLED',
      'FLAG_CREATED',
    ]);
  });

  it('cannot be updated or deleted, even with direct SQL', async () => {
    await createFlag(flag('immutable-flag'));
    await expect(db.execute(sql`update audit_logs set actor = 'mallory'`)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('append-only') }),
    });
    await expect(db.execute(sql`delete from audit_logs`)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('append-only') }),
    });
    const [entry] = await db.select().from(auditLogs);
    expect(entry?.actor).toBe(ACTOR);
  });
});

async function resetOutbox() {
  await db.delete(outboxEvents);
}
