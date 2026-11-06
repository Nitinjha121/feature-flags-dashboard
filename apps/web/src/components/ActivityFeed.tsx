import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditAction } from '@ff/shared';
import { ApiError, fetchAuditLogs } from '../api';
import { EnvBadge } from './EnvBadge';

const ACTION_LABELS: Record<AuditAction, string> = {
  FLAG_CREATED: 'Created',
  FLAG_ENABLED: 'Enabled',
  FLAG_DISABLED: 'Disabled',
};

const ACTION_CLASSES: Record<AuditAction, string> = {
  FLAG_CREATED: 'bg-action-created-bg text-action-created border-action-created-border',
  FLAG_ENABLED: 'bg-action-enabled-bg text-action-enabled border-action-enabled-border',
  FLAG_DISABLED: 'bg-action-disabled-bg text-action-disabled border-action-disabled-border',
};

const ACTION_DOT: Record<AuditAction, string> = {
  FLAG_CREATED: 'bg-action-created-dot ring-action-created-bg',
  FLAG_ENABLED: 'bg-action-enabled-dot ring-action-enabled-bg',
  FLAG_DISABLED: 'bg-action-disabled-dot ring-action-disabled-bg',
};

const STATE_CLASS: Record<'true' | 'false', string> = {
  true: 'font-semibold text-action-enabled',
  false: 'font-semibold text-action-disabled',
};

function formatRelativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

const CLOCK_TICK_MS = 30_000;

export function ActivityFeed() {
  // Polling returns the same data when nothing changed, which doesn't re-render, so a clock
  // tick keeps the relative times ("5 min ago") moving.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const auditLogsQuery = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => fetchAuditLogs(50),
    refetchInterval: 3000,
  });

  return (
    <div className="flex max-h-[75vh] min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card lg:max-h-full lg:flex-1">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-muted/40 px-4 py-3.5">
        <h2 className="m-0 text-sm font-semibold">Recent activity</h2>
        <span aria-hidden="true" className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-live" />
        </span>
      </div>
      {auditLogsQuery.isLoading ? (
        <p className="m-0 px-4 py-6 text-[13px] text-muted">Loading activity…</p>
      ) : null}
      {auditLogsQuery.isError ? (
        <p role="alert" className="m-0 px-4 py-6 text-[13px] text-muted">
          {auditLogsQuery.error instanceof ApiError
            ? auditLogsQuery.error.message
            : 'Failed to load activity.'}
        </p>
      ) : null}
      {auditLogsQuery.data && auditLogsQuery.data.length === 0 ? (
        <p className="m-0 px-4 py-6 text-[13px] text-muted">No activity yet.</p>
      ) : null}
      {auditLogsQuery.data && auditLogsQuery.data.length > 0 ? (
        <ol className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-4">
          {auditLogsQuery.data.map((entry) => {
            const previousEnabled = entry.previousState?.enabled;
            const nextStateKey = entry.newState.enabled ? 'true' : 'false';

            return (
              <li
                key={entry.id}
                data-testid="audit-entry"
                data-action={entry.action}
                data-flag-key={entry.flagKey}
                className="relative pl-5 pb-5 before:absolute before:top-3 before:bottom-0 before:left-[3px] before:w-px before:bg-border last:pb-0 last:before:hidden"
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 left-0 size-2 rounded-full ring-2 ${ACTION_DOT[entry.action]}`}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${ACTION_CLASSES[entry.action]}`}
                    >
                      {ACTION_LABELS[entry.action]}
                    </span>
                    <span className="rounded bg-chip px-1 py-0.5 font-mono text-xs font-semibold text-text">
                      {entry.flagKey}
                    </span>
                  </div>
                  <time
                    dateTime={entry.createdAt}
                    title={entry.createdAt}
                    className="shrink-0 text-[11px] text-subtle"
                  >
                    {formatRelativeTime(entry.createdAt, now)}
                  </time>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <EnvBadge environment={entry.environment} size="sm" />
                  <span>
                    by <span className="font-mono text-text">{entry.actor}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 rounded border border-border-subtle bg-surface-muted p-1.5 font-mono text-[11px]">
                  {previousEnabled === undefined ? (
                    <>
                      <span className="text-subtle">initial:</span>
                      <span className={STATE_CLASS[nextStateKey]}>
                        {entry.newState.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-subtle">transition:</span>
                      <span className="text-muted line-through">
                        {previousEnabled ? 'enabled' : 'disabled'}
                      </span>
                      <span className="text-subtle">→</span>
                      <span className={STATE_CLASS[nextStateKey]}>
                        {entry.newState.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
