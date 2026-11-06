import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  WEBHOOK_URL: z.url().default('http://webhook-receiver:4100/webhooks/feature-flags'),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(5),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(1000),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
});

export type Config = z.infer<typeof envSchema>;

/** Fail fast on startup with a readable message instead of failing later at first use. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}
