import { useEffect, useState } from 'react';
import { DEMO_ACTORS } from '@ff/shared';
import type { FlagFilters } from './api';
import { ActorSelect } from './components/ActorSelect';
import { ThemeToggle } from './components/ThemeToggle';
import { Filters } from './components/Filters';
import { FlagTable } from './components/FlagTable';
import { CreateFlagDialog } from './components/CreateFlagDialog';
import { ActivityFeed } from './components/ActivityFeed';

const ACTOR_STORAGE_KEY = 'ff.actor';
const NOTICE_DURATION_MS = 4000;

function isKnownActor(value: string): value is (typeof DEMO_ACTORS)[number] {
  return (DEMO_ACTORS as readonly string[]).includes(value);
}

function getInitialActor(): string {
  const stored = localStorage.getItem(ACTOR_STORAGE_KEY);
  if (stored && isKnownActor(stored)) {
    return stored;
  }
  return DEMO_ACTORS[0];
}

export function App() {
  const [actor, setActor] = useState<string>(getInitialActor);
  const [filters, setFilters] = useState<FlagFilters>({ environment: '', status: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(undefined), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function handleActorChange(nextActor: string) {
    setActor(nextActor);
    localStorage.setItem(ACTOR_STORAGE_KEY, nextActor);
  }

  function openCreate() {
    setNotice(undefined);
    setCreateOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-header-border bg-header px-6 py-2 text-header-fg">
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-md border border-header-control-border bg-header-control"
          >
            <svg aria-hidden="true" className="size-4 fill-current" viewBox="0 0 24 24">
              <path d="M4 19h16v-2H4v2zm0-4h2.5l2-5 3.5 4 3.5-4 2 5H20v-2l-3-7.5-4 4.5-4-4.5L6 13v2z" />
            </svg>
          </div>
          <h1 className="m-0 text-base font-semibold tracking-tight">Feature Flags</h1>
          <div aria-hidden="true" className="hidden h-4 w-px bg-header-control-border md:block" />
          <p className="m-0 hidden text-[11px] font-medium text-header-muted md:block">
            Team flag management &amp; audit trail
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div aria-hidden="true" className="block h-4 w-px bg-header-control-border" />
          <ActorSelect actor={actor} onChange={handleActorChange} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 p-6 lg:min-h-0 lg:flex-row">
        <section className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:w-2/3">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card">
            <Filters filters={filters} onChange={setFilters} />
            <button
              type="button"
              data-testid="open-create"
              onClick={openCreate}
              className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3.5 text-xs font-medium text-accent-fg shadow-card transition-colors hover:bg-accent-hover"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4 fill-none stroke-current"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New flag
            </button>
          </div>
          <FlagTable filters={filters} actor={actor} />
        </section>
        <aside className="flex min-w-0 flex-col lg:min-h-0 lg:w-1/3">
          <ActivityFeed />
        </aside>
      </main>
      <CreateFlagDialog
        open={createOpen}
        actor={actor}
        onClose={() => setCreateOpen(false)}
        onCreated={(flag) => {
          setCreateOpen(false);
          setNotice(`Created ${flag.key} in ${flag.environment}`);
        }}
      />
      {notice ? (
        <p
          role="status"
          className="fixed right-6 bottom-6 z-50 m-0 flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-[13px] font-medium text-text shadow-dialog"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-live" />
          {notice}
        </p>
      ) : null}
    </div>
  );
}
