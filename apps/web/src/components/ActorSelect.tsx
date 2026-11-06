import { DEMO_ACTORS } from '@ff/shared';

interface ActorSelectProps {
  actor: string;
  onChange: (actor: string) => void;
}

export function ActorSelect({ actor, onChange }: ActorSelectProps) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">Acting as</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg uppercase"
      >
        {actor.charAt(0)}
      </span>
      <select
        className="h-8 cursor-pointer appearance-none rounded-md border border-header-control-border bg-header-control pr-7 pl-8 font-mono text-xs font-medium text-header-fg transition-colors hover:border-header-muted focus:outline-none"
        data-testid="actor-select"
        value={actor}
        onChange={(event) => onChange(event.target.value)}
      >
        {DEMO_ACTORS.map((email) => (
          <option className="bg-surface text-text" key={email} value={email}>
            {email}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 fill-none stroke-header-muted"
        strokeWidth={2}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}
