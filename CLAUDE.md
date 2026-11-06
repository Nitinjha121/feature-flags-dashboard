# CLAUDE.md — rules for AI agents working in this repo

Feature-flag dashboard with an immutable audit trail and an outbox-driven prod webhook.
Read `README.md` for the architecture and `docs/DECISIONS.md` for why things are the way they are.

## Commands

- `make dev`: full stack with hot reload (Postgres, migrate+seed, api, worker, webhook-receiver, web)
- `make ui`: same apps on the host in the Turborepo TUI (one sidebar entry per app); only Postgres in Docker
- `make test`: lint + typecheck + API integration + Playwright E2E in an isolated Docker stack. **It must pass before you say a task is done.**
- `make reset`: wipe the dev database (it reseeds on the next `make dev`)
- `pnpm lint` / `pnpm typecheck` / `pnpm format`: the same checks on the host, after `pnpm install`

## Layout

- `packages/shared`: Zod schemas and types shared by the API and the UI. **Change the contract here first.**
- `apps/api/src/db/schema.ts`: Drizzle schema, the source of truth for tables
- `apps/api/drizzle/`: generated SQL migrations, committed. `0001` is the hand-written immutability trigger.
- `apps/api/src/modules/flags/flags.service.ts`: every write path (transactions live here)
- `apps/api/src/outbox/`: `enqueue.ts` (called inside the transaction) and `worker.ts` (delivery)
- `apps/web/src`: React + TanStack Query. Styling is Tailwind CSS v4 utilities; the design tokens and theme live in `styles.css`.
- `e2e/tests`: Playwright, run in the official Playwright image

## Invariants — do not break these

1. **Every flag mutation writes its audit row in the same DB transaction as the change.** Never write audit entries outside the transaction or after commit.
2. **`audit_logs` is append-only.** Never add code that updates or deletes it, and never drop or bypass the `audit_logs_immutable` trigger.
3. **Side effects (webhooks, notifications) go through the outbox.** Call `enqueueOutboxEvent(tx, ...)` with the transaction handle. Never call external services from a request handler.
4. **Uniqueness is enforced by the database** (`UNIQUE(key, environment)`). Don't replace it with a "check then insert" in code.
5. **Reads that decide a write take a row lock** (`.for('update')`), as `setFlagEnabled` does.
6. **Schema changes only via Drizzle:** edit `schema.ts`, then `pnpm --filter @ff/api db:generate`. Never edit an applied migration; add a new one.
7. Validation lives in the shared Zod schemas. Don't duplicate rules in the UI or the routes.

## Conventions

- TypeScript strict and `noUncheckedIndexedAccess`. No `any`, no `@ts-ignore`. Use `import type` for types.
- API errors always have the shape `{ error: { code, message, details? } }` (see `http/errors.ts`).
- In the UI, mutations disable the control and then invalidate queries. No optimistic updates (a deliberate choice).
- Colours only through the theme tokens in `styles.css` (`bg-surface`, `text-muted`, …). Tailwind's default palette is removed, and `dark:` variants are never needed: the tokens switch with the theme. Never build class names by string interpolation (Tailwind only sees complete strings); use a lookup object.
- Tests hit a real Postgres. Don't mock the database in API tests.
- Dependencies: install scripts are blocked unless listed in `allowBuilds` in `pnpm-workspace.yaml`. Don't add to that list without a reason.
