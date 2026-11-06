import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import type { CreateFlagInput, FlagState, ListFlagsQuery } from '@ff/shared';
import { createFlagSchema } from '@ff/shared';
import type { Db } from '../../db/client';
import { auditLogs, featureFlags, type FeatureFlagRow } from '../../db/schema';
import { AppError, isUniqueViolation } from '../../http/errors';
import { enqueueOutboxEvent } from '../../outbox/enqueue';

const snapshot = (flag: FeatureFlagRow): FlagState => ({
  enabled: flag.enabled,
  description: flag.description,
});

const flagSummary = (flag: FeatureFlagRow) => ({
  id: flag.id,
  key: flag.key,
  environment: flag.environment,
  enabled: flag.enabled,
});

export async function listFlags(db: Db, query: ListFlagsQuery): Promise<FeatureFlagRow[]> {
  const conditions: SQL[] = [];
  if (query.environment) conditions.push(eq(featureFlags.environment, query.environment));
  if (query.status) conditions.push(eq(featureFlags.enabled, query.status === 'enabled'));
  return db
    .select()
    .from(featureFlags)
    .where(and(...conditions))
    .orderBy(asc(featureFlags.key), asc(featureFlags.environment));
}

/**
 * Creates a flag and its FLAG_CREATED audit entry in one transaction.
 * Uniqueness of (key, environment) is enforced by the database constraint; a violation is
 * mapped to 409. A pre-check SELECT would race with a concurrent create.
 */
export async function createFlag(
  db: Db,
  input: CreateFlagInput,
  actor: string,
): Promise<FeatureFlagRow> {
  const data = createFlagSchema.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const [flag] = await tx.insert(featureFlags).values(data).returning();
      if (!flag) throw new Error('insert returned no row');

      await tx.insert(auditLogs).values({
        flagId: flag.id,
        flagKey: flag.key,
        environment: flag.environment,
        actor,
        action: 'FLAG_CREATED',
        previousState: null,
        newState: snapshot(flag),
      });

      if (flag.environment === 'prod') {
        await enqueueOutboxEvent(tx, 'flag.created', {
          actor,
          flag: flagSummary(flag),
          previousState: null,
          newState: snapshot(flag),
        });
      }
      return flag;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        409,
        'FLAG_ALREADY_EXISTS',
        `A flag with key "${data.key}" already exists in ${data.environment}`,
      );
    }
    throw err;
  }
}

/**
 * Sets a flag to the desired state. In one transaction:
 *  1. lock the row (SELECT ... FOR UPDATE) so concurrent toggles serialise and
 *     previous_state is always the true previous state;
 *  2. if it is already in that state, return without writing anything (idempotent retry);
 *  3. update the flag, write the audit entry, and for prod enqueue the webhook event.
 */
export async function setFlagEnabled(
  db: Db,
  id: string,
  enabled: boolean,
  actor: string,
): Promise<{ flag: FeatureFlagRow; changed: boolean }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.id, id))
      .for('update');
    if (!current) throw new AppError(404, 'FLAG_NOT_FOUND', `Flag ${id} not found`);

    if (current.enabled === enabled) return { flag: current, changed: false };

    const [updated] = await tx
      .update(featureFlags)
      .set({ enabled, updatedAt: sql`now()` })
      .where(eq(featureFlags.id, id))
      .returning();
    if (!updated) throw new Error('update returned no row');

    await tx.insert(auditLogs).values({
      flagId: updated.id,
      flagKey: updated.key,
      environment: updated.environment,
      actor,
      action: enabled ? 'FLAG_ENABLED' : 'FLAG_DISABLED',
      previousState: snapshot(current),
      newState: snapshot(updated),
    });

    if (updated.environment === 'prod') {
      await enqueueOutboxEvent(tx, 'flag.toggled', {
        actor,
        flag: flagSummary(updated),
        previousState: snapshot(current),
        newState: snapshot(updated),
      });
    }
    return { flag: updated, changed: true };
  });
}
