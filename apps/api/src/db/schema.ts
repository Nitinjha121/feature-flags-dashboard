import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { AUDIT_ACTIONS, ENVIRONMENTS, type FlagState } from '@ff/shared';

export const environmentEnum = pgEnum('environment', ENVIRONMENTS);
export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS);
export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'delivered', 'failed']);

export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 64 }).notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    environment: environmentEnum('environment').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The real uniqueness guarantee: an app-level "check then insert" races under concurrency.
    unique('feature_flags_key_environment_unique').on(t.key, t.environment),
    check('feature_flags_key_format', sql`${t.key} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

/**
 * Append-only. A trigger (migration 0001) rejects UPDATE and DELETE, and the application has
 * no code path that updates or deletes rows. flag_key/environment are denormalised so an
 * entry stays readable on its own.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    flagId: uuid('flag_id')
      .notNull()
      .references(() => featureFlags.id, { onDelete: 'restrict' }),
    flagKey: varchar('flag_key', { length: 64 }).notNull(),
    environment: environmentEnum('environment').notNull(),
    actor: varchar('actor', { length: 100 }).notNull(),
    action: auditActionEnum('action').notNull(),
    previousState: jsonb('previous_state').$type<FlagState>(),
    newState: jsonb('new_state').$type<FlagState>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_created_at_idx').on(t.createdAt.desc())],
);

/**
 * Transactional outbox: events are written in the same transaction as the change that caused
 * them, and delivered later by the worker. The row id doubles as the webhook Idempotency-Key.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: outboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => [index('outbox_events_status_next_attempt_idx').on(t.status, t.nextAttemptAt)],
);

export type FeatureFlagRow = typeof featureFlags.$inferSelect;
export type OutboxEventRow = typeof outboxEvents.$inferSelect;
