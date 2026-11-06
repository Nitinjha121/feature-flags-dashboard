import type { DbOrTx } from '../db/client';
import { outboxEvents } from '../db/schema';

export type OutboxEventType = 'flag.created' | 'flag.toggled';

/**
 * Must be called with the transaction that makes the change: the event is committed if and
 * only if the change is. Delivery happens later in the worker, never on the request path.
 */
export async function enqueueOutboxEvent(
  tx: DbOrTx,
  eventType: OutboxEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.insert(outboxEvents).values({ eventType, payload });
}
