import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeatureFlag } from '@ff/shared';
import { ApiError, fetchFlags, setFlagEnabled } from '../api';
import type { FlagFilters } from '../api';
import { EnvBadge } from './EnvBadge';

const TH_KEY =
  'sticky top-0 z-10 w-[28%] border-b border-border bg-surface-muted px-4 py-2.5 text-[11px] font-semibold tracking-wider text-muted uppercase';
const TH_DESCRIPTION =
  'sticky top-0 z-10 w-[42%] border-b border-border bg-surface-muted px-4 py-2.5 text-[11px] font-semibold tracking-wider text-muted uppercase';
const TH_ENVIRONMENT =
  'sticky top-0 z-10 w-[16%] border-b border-border bg-surface-muted px-4 py-2.5 text-[11px] font-semibold tracking-wider text-muted uppercase';
const TH_STATUS =
  'sticky top-0 z-10 w-[14%] border-b border-border bg-surface-muted px-4 py-2.5 pr-6 text-right text-[11px] font-semibold tracking-wider text-muted uppercase';

interface FlagTableProps {
  filters: FlagFilters;
  actor: string;
}

interface RowState {
  error?: string;
  webhookQueued?: boolean;
}

interface ToggleVariables {
  id: string;
  enabled: boolean;
}

export function FlagTable({ filters, actor }: FlagTableProps) {
  const queryClient = useQueryClient();
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  const flagsQuery = useQuery({
    queryKey: ['flags', filters],
    queryFn: () => fetchFlags(filters),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: ToggleVariables) => setFlagEnabled(id, enabled, actor),
    onMutate: (variables) => {
      setPendingIds((prev) => new Set(prev).add(variables.id));
      setRowState((prev) => {
        if (!(variables.id in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
    },
    onSuccess: (result, variables) => {
      setRowState((prev) => ({
        ...prev,
        [variables.id]: { webhookQueued: result.changed && result.flag.environment === 'prod' },
      }));
      void queryClient.invalidateQueries({ queryKey: ['flags'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (error, variables) => {
      const message = error instanceof ApiError ? error.message : 'Something went wrong.';
      setRowState((prev) => ({ ...prev, [variables.id]: { error: message } }));
    },
    onSettled: (_data, _error, variables) => {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
    },
  });

  if (flagsQuery.isLoading) {
    return (
      <div className="flex max-h-[75vh] min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card lg:max-h-none">
        <p className="m-0 px-4 py-6 text-[13px] text-muted">Loading flags…</p>
      </div>
    );
  }

  if (flagsQuery.isError) {
    const message =
      flagsQuery.error instanceof ApiError ? flagsQuery.error.message : 'Failed to load flags.';
    return (
      <div className="flex max-h-[75vh] min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card lg:max-h-none">
        <p role="alert" className="m-0 px-4 py-6 text-[13px] text-danger">
          {message}
        </p>
      </div>
    );
  }

  const flags = flagsQuery.data ?? [];

  return (
    <div className="flex max-h-[75vh] min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card lg:max-h-none">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-muted/70 px-4 py-2.5">
        <h2 className="m-0 text-sm font-semibold">All flags</h2>
        <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-muted">
          {flags.length} flags
        </span>
      </div>
      {flags.length === 0 ? (
        <p className="m-0 px-4 py-6 text-[13px] text-muted">No flags match these filters.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr>
                <th className={TH_KEY}>Key</th>
                <th className={TH_DESCRIPTION}>Description</th>
                <th className={TH_ENVIRONMENT}>Environment</th>
                <th className={TH_STATUS}>Status</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-b-0">
              {flags.map((flag) => (
                <FlagRow
                  key={flag.id}
                  flag={flag}
                  pending={pendingIds.has(flag.id)}
                  rowState={rowState[flag.id]}
                  onToggle={() => toggleMutation.mutate({ id: flag.id, enabled: !flag.enabled })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface FlagRowProps {
  flag: FeatureFlag;
  pending: boolean;
  rowState: RowState | undefined;
  onToggle: () => void;
}

function FlagRow({ flag, pending, rowState, onToggle }: FlagRowProps) {
  return (
    <tr
      data-testid="flag-row"
      data-flag-key={flag.key}
      data-environment={flag.environment}
      className="group transition-colors hover:bg-surface-muted"
    >
      <td className="border-b border-border-subtle px-4 py-3 align-top">
        <span className="rounded border border-chip-border bg-chip px-1.5 py-0.5 font-mono text-xs font-semibold text-text">
          {flag.key}
        </span>
      </td>
      <td className="border-b border-border-subtle px-4 py-3 align-top leading-relaxed text-muted">
        {flag.description}
      </td>
      <td className="border-b border-border-subtle px-4 py-3 align-top">
        <EnvBadge environment={flag.environment} />
      </td>
      <td className="border-b border-border-subtle px-4 py-3 pr-6 text-right align-top">
        <div className="flex flex-col items-end">
          <button
            type="button"
            role="switch"
            aria-checked={flag.enabled}
            aria-label={`Toggle ${flag.key} in ${flag.environment}`}
            data-testid="flag-toggle"
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              flag.enabled ? 'bg-accent' : 'bg-switch-off'
            }`}
            disabled={pending}
            onClick={onToggle}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block size-4 rounded-full bg-switch-knob shadow-knob transition-transform ${
                flag.enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          {rowState?.error ? (
            <p role="alert" className="mt-1.5 mb-0 text-[11px] text-danger">
              {rowState.error}
            </p>
          ) : null}
          {rowState?.webhookQueued ? (
            <p className="mt-1.5 mb-0 text-[11px] text-muted italic">Notifying subscribers</p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
