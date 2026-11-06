import type {
  ApiErrorBody,
  AuditLogEntry,
  CreateFlagInput,
  Environment,
  FeatureFlag,
  FlagStatus,
} from '@ff/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface FlagFilters {
  environment: Environment | '';
  status: FlagStatus | '';
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }
    const code = body?.error.code ?? 'UNKNOWN_ERROR';
    const message = body?.error.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(response.status, code, message, body?.error.details);
  }
  return (await response.json()) as T;
}

export async function fetchFlags(filters: Partial<FlagFilters>): Promise<FeatureFlag[]> {
  const params = new URLSearchParams();
  if (filters.environment) {
    params.set('environment', filters.environment);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  const query = params.toString();
  const response = await fetch(`/api/flags${query ? `?${query}` : ''}`);
  const body = await parseResponse<{ data: FeatureFlag[] }>(response);
  return body.data;
}

export async function createFlag(input: CreateFlagInput, actor: string): Promise<FeatureFlag> {
  const response = await fetch('/api/flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Actor': actor },
    body: JSON.stringify(input),
  });
  const body = await parseResponse<{ data: FeatureFlag }>(response);
  return body.data;
}

export interface SetFlagEnabledResult {
  flag: FeatureFlag;
  changed: boolean;
}

export async function setFlagEnabled(
  id: string,
  enabled: boolean,
  actor: string,
): Promise<SetFlagEnabledResult> {
  const response = await fetch(`/api/flags/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Actor': actor },
    body: JSON.stringify({ enabled }),
  });
  const body = await parseResponse<{ data: FeatureFlag; meta: { changed: boolean } }>(response);
  return { flag: body.data, changed: body.meta.changed };
}

export async function fetchAuditLogs(limit: number): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(`/api/audit-logs?${params.toString()}`);
  const body = await parseResponse<{ data: AuditLogEntry[] }>(response);
  return body.data;
}
