/**
 * The API contract shared by the backend and the frontend.
 * The API validates requests with these schemas; the UI uses the same schemas for form
 * validation and the same types for responses, so the two cannot drift apart.
 */
import { z } from 'zod';

export const ENVIRONMENTS = ['dev', 'staging', 'prod'] as const;
export const environmentSchema = z.enum(ENVIRONMENTS);
export type Environment = z.infer<typeof environmentSchema>;

export const FLAG_STATUSES = ['enabled', 'disabled'] as const;
export const flagStatusSchema = z.enum(FLAG_STATUSES);
export type FlagStatus = z.infer<typeof flagStatusSchema>;

export const AUDIT_ACTIONS = ['FLAG_CREATED', 'FLAG_ENABLED', 'FLAG_DISABLED'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** kebab-case: lowercase letters/digits separated by single hyphens. Mirrored by a DB CHECK. */
const FLAG_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const flagKeySchema = z
  .string()
  .trim()
  .min(3, 'Key must be at least 3 characters')
  .max(64, 'Key must be at most 64 characters')
  .regex(FLAG_KEY_PATTERN, 'Key must be kebab-case, e.g. new-checkout-flow');

export const createFlagSchema = z.object({
  key: flagKeySchema,
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(500, 'Description must be at most 500 characters'),
  environment: environmentSchema,
  enabled: z.boolean().default(false),
});
export type CreateFlagInput = z.input<typeof createFlagSchema>;

/** Desired state, not a blind flip: retrying the same request is a no-op. */
export const updateFlagSchema = z.strictObject({ enabled: z.boolean() });

export const listFlagsQuerySchema = z.object({
  environment: environmentSchema.optional(),
  status: flagStatusSchema.optional(),
});
export type ListFlagsQuery = z.infer<typeof listFlagsQuerySchema>;

export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const actorSchema = z.string().trim().min(1).max(100);

/** Demo identities for the "Acting as" selector (no real auth — see docs/DECISIONS.md). */
export const DEMO_ACTORS = [
  'alice@husqvarna.dev',
  'bob@husqvarna.dev',
  'carol@husqvarna.dev',
] as const;

export interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  environment: Environment;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The part of a flag captured in audit snapshots. */
export interface FlagState {
  enabled: boolean;
  description: string;
}

export interface AuditLogEntry {
  id: number;
  flagId: string;
  flagKey: string;
  environment: Environment;
  actor: string;
  action: AuditAction;
  previousState: FlagState | null;
  newState: FlagState;
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}
