import { ENVIRONMENTS, FLAG_STATUSES } from '@ff/shared';
import type { Environment, FlagStatus } from '@ff/shared';
import type { FlagFilters } from '../api';

interface FiltersProps {
  filters: FlagFilters;
  onChange: (filters: FlagFilters) => void;
}

export function Filters({ filters, onChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="relative shrink-0">
        <span className="sr-only">Environment</span>
        <select
          className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-input pr-7 pl-2.5 text-xs text-text transition-colors hover:bg-surface focus:border-accent focus:outline-none"
          data-testid="filter-environment"
          value={filters.environment}
          onChange={(event) =>
            onChange({ ...filters, environment: event.target.value as Environment | '' })
          }
        >
          <option className="bg-surface text-text" value="">
            Environment: All
          </option>
          {ENVIRONMENTS.map((environment) => (
            <option className="bg-surface text-text" key={environment} value={environment}>
              {environment}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 fill-none stroke-subtle"
          strokeWidth={2}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </label>
      <label className="relative shrink-0">
        <span className="sr-only">Status</span>
        <select
          className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-input pr-7 pl-2.5 text-xs text-text transition-colors hover:bg-surface focus:border-accent focus:outline-none"
          data-testid="filter-status"
          value={filters.status}
          onChange={(event) =>
            onChange({ ...filters, status: event.target.value as FlagStatus | '' })
          }
        >
          <option className="bg-surface text-text" value="">
            Status: All
          </option>
          {FLAG_STATUSES.map((status) => (
            <option className="bg-surface text-text" key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 fill-none stroke-subtle"
          strokeWidth={2}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </label>
    </div>
  );
}
