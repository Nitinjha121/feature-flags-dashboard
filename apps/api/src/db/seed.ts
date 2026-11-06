import { sql } from 'drizzle-orm';
import { DEMO_ACTORS, type Environment, type FlagState } from '@ff/shared';
import type { Db } from './client';
import { auditLogs, featureFlags } from './schema';

interface SeedFlag {
  id: string;
  key: string;
  description: string;
  environment: Environment;
  enabled: boolean;
}

// Fixed ids and timestamps so every fresh environment starts from exactly the same state.
const FLAGS: SeedFlag[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    key: 'new-checkout-flow',
    environment: 'dev',
    enabled: true,
    description: 'Redesigned one-page checkout for the online store',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    key: 'new-checkout-flow',
    environment: 'staging',
    enabled: true,
    description: 'Redesigned one-page checkout for the online store',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    key: 'new-checkout-flow',
    environment: 'prod',
    enabled: false,
    description: 'Redesigned one-page checkout for the online store',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    key: 'robotic-mower-ai-routing',
    environment: 'staging',
    enabled: true,
    description: 'AI-based route planning for Automower robotic mowers',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    key: 'robotic-mower-ai-routing',
    environment: 'prod',
    enabled: false,
    description: 'AI-based route planning for Automower robotic mowers',
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    key: 'firmware-ota-v2',
    environment: 'prod',
    enabled: true,
    description: 'Second-generation over-the-air firmware update pipeline',
  },
  {
    id: '00000000-0000-4000-8000-000000000007',
    key: 'fleet-telemetry-v2',
    environment: 'prod',
    enabled: true,
    description: 'Stream fleet telemetry to the new ingestion service',
  },
  {
    id: '00000000-0000-4000-8000-000000000008',
    key: 'battery-saver-mode',
    environment: 'dev',
    enabled: false,
    description: 'Reduce motor power when battery drops below 20%',
  },
  {
    id: '00000000-0000-4000-8000-000000000009',
    key: 'dark-mode',
    environment: 'dev',
    enabled: true,
    description: 'Dark theme for the fleet management dashboard',
  },
];

const SEED_START = Date.parse('2026-10-20T09:00:00Z');
const HOUR = 60 * 60 * 1000;

/**
 * Inserts the sample data only into an empty database, so restarts never duplicate rows.
 * Each flag gets a FLAG_CREATED entry (created disabled); enabled flags also get a later
 * FLAG_ENABLED entry, so the activity feed starts with a realistic history.
 * Returns true when data was inserted.
 */
export async function seed(db: Db): Promise<boolean> {
  // Only the one-shot `migrate` container seeds, so there are no concurrent seeders to guard against.
  return db.transaction(async (tx) => {
    const [{ count } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(featureFlags);
    if (count > 0) return false;

    let tick = 0;
    const at = () => new Date(SEED_START + tick++ * HOUR);
    const actor = (i: number) => DEMO_ACTORS[i % DEMO_ACTORS.length]!;

    for (const [i, flag] of FLAGS.entries()) {
      const createdAt = at();
      const created: FlagState = { enabled: false, description: flag.description };
      await tx
        .insert(featureFlags)
        .values({ ...flag, enabled: false, createdAt, updatedAt: createdAt });
      await tx.insert(auditLogs).values({
        flagId: flag.id,
        flagKey: flag.key,
        environment: flag.environment,
        actor: actor(i),
        action: 'FLAG_CREATED',
        previousState: null,
        newState: created,
        createdAt,
      });
    }
    for (const [i, flag] of FLAGS.entries()) {
      if (!flag.enabled) continue;
      const changedAt = at();
      await tx
        .update(featureFlags)
        .set({ enabled: true, updatedAt: changedAt })
        .where(sql`${featureFlags.id} = ${flag.id}`);
      await tx.insert(auditLogs).values({
        flagId: flag.id,
        flagKey: flag.key,
        environment: flag.environment,
        actor: actor(i + 1),
        action: 'FLAG_ENABLED',
        previousState: { enabled: false, description: flag.description },
        newState: { enabled: true, description: flag.description },
        createdAt: changedAt,
      });
    }
    return true;
  });
}
