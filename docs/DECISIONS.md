# Decisions & trade-offs

This was built to the brief's 3–4 hour budget. The depth went into **correctness of the write path** (transactions, locking, database-enforced invariants, the outbox) and the **harness**. Everything else is kept deliberately simple, and each simplification is listed here.

## 1. Async notification: transactional outbox + worker

**Chosen:** the flag change, the audit row and an `outbox_events` row are committed in **one transaction**. A separate worker process delivers the events.

| Option                                                               | Why not                                                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Call the webhook inside the request                                  | Blocks the UI on a third party, and its failures leak into the API response                                 |
| Fire-and-forget after commit (`setImmediate`, an un-awaited promise) | The event is lost if the process crashes between the commit and the send; there's no retry and no record    |
| Publish to a broker (BullMQ/Redis, SQS, Kafka) from the handler      | It's a _dual write_: the DB commit and the publish can disagree. It also adds infrastructure to the harness |

The outbox makes "the change happened" and "a notification is owed" a single atomic fact. A broker could still come later. The worker would then publish to it instead of POSTing directly, and the guarantee wouldn't change.

**Worker design:** each pass is one transaction:

1. `SELECT … FOR UPDATE SKIP LOCKED LIMIT 5`
2. POST the events in parallel, each with its own 5s timeout
3. Record each result on its own row
4. Commit

If anything throws, the whole pass rolls back and the events stay `pending`.

- **Retries:** exponential backoff (2s, 4s, 8s…, capped at 60s, with jitter). After `OUTBOX_MAX_ATTEMPTS` (5) the event becomes `failed`, a final state kept in the table for inspection.
- **Crash safety:** if the worker dies mid-send, the transaction rolls back and the lock is released, so the next pass retries the event. There's no lease column or stuck-state cleanup to get wrong.
- **Backstop:** the worker's DB session sets `idle_in_transaction_session_timeout=30s`.

**The biggest trade-off: row locks are held during HTTP calls.** A pass holds one DB connection and up to 5 row locks for at most about 5s. That's fine at this scale. At higher volume I'd switch to **claim + lease**:

1. A short transaction marks the events `processing` with a `locked_until` and counts the attempt.
2. The worker sends with no transaction open.
3. A second short transaction records the outcome.
4. Expired leases are reclaimed.

That design holds no locks during network I/O and scales out cleanly, at the cost of more states and more code. A known limit of the current design: a crash rolls back the attempt counter too. An event that _crashes the worker process itself_ every time would therefore never reach the limit. Ordinary failures (errors, timeouts, non-2xx) are always counted.

## 2. Delivery semantics: at-least-once, not exactly-once

The worker can deliver the same event twice, e.g. if the receiver processed it but the worker crashed before committing `delivered`. Every request carries `Idempotency-Key: <event id>`.

The mock receiver dedupes on that key **in memory**: the first delivery is recorded, and repeats get 200 and only bump a counter. **That's a demo, not a guarantee.** The keys are lost on restart and aren't shared between instances. A real consumer would get _effectively-once processing_ by persisting the key **in the same transaction as its side effect** (a unique constraint), or with Redis `SET NX` plus a TTL. Exactly-once _delivery_ isn't achievable over HTTP.

## 3. ORM: Drizzle

The two critical queries are `SELECT … FOR UPDATE` (toggle) and `FOR UPDATE SKIP LOCKED` (worker). Drizzle has both as typed builder methods, its schema is plain TypeScript with no codegen step, and its migrations are SQL files we commit and review. Prisma would need `$queryRaw` for both locks, so the most important code would lose type safety. Sequelize's weak typing and its easy-to-forget `{ transaction: t }` are risky when the core rule is "audit row in the same transaction".

## 4. Invariants enforced by the database, not only by code

- **Uniqueness:** `UNIQUE (key, environment)`. A "check then insert" in code races under concurrency. The unique violation (`23505`, which Drizzle wraps in `cause`) is mapped to 409. There's a test with two concurrent creates.
- **Key format:** a `CHECK` constraint mirrors the Zod regex.
- **Immutable audit log:** a `BEFORE UPDATE OR DELETE` trigger raises, so even a direct SQL session can't rewrite history. The application also has no code path that updates or deletes audit rows. _Limit:_ `TRUNCATE` isn't covered by row triggers (the tests use it to reset). In production the app's DB role would only get `INSERT, SELECT` on `audit_logs`.
- **Correct `previous_state`:** the toggle reads the flag with `FOR UPDATE`. A deterministic test proves that without the lock, a concurrent change produces a false audit entry.

## 5. API shape: `PATCH { enabled }` (desired state), not `POST /toggle`

A blind toggle isn't idempotent: a retried request flips the flag back. With the desired state, a retry is a no-op. It returns `meta.changed: false` and writes **no audit entry**, so the history only contains real transitions.

## 6. Actor from an `X-Actor` header (no auth)

The brief needs an actor, not authentication. The UI's "Acting as" selector sets the header, and the API validates it. **In production** the actor would come from the verified identity (an OIDC/JWT `sub` via Keycloak, Entra ID, …), never from a client header. Changing prod flags would also need an elevated role (RBAC).

## 7. Activity feed: polling every 3s, not SSE/WebSockets

Mutations also invalidate the feed, so your own changes show up immediately. Polling only covers other users' changes. It's simple, cache-friendly, and good enough for a dashboard. With more time I'd use **SSE**: one-way server→client and plain HTTP, so it's simpler than WebSockets.

## 8. Shared Zod contract (`packages/shared`)

The API validates requests and the UI validates forms with the same schemas, and the response types come from the same place. The two sides can't drift apart. Server-side validation is still authoritative.

## 9. UI choices

- **No optimistic updates.** The switch is disabled while its request is in flight, then the queries refetch. It's always correct, and the latency is invisible locally. Optimistic UI with rollback is an easy later step.
- **Tailwind CSS v4 on top of design tokens.** The light and dark values are plain CSS custom properties in `styles.css`. `@theme inline` exposes them as Tailwind colours (`bg-surface`, `text-muted`, …), and Tailwind's default palette is removed, so every colour comes from a token. Components never use `dark:` variants: switching the theme only swaps the variables. Dark mode follows the OS by default or can be picked manually, with no flash on load.
- **Create lives in a native `<dialog>`.** `showModal()` gives focus trapping, Escape and a backdrop with no modal library. The form only mounts while the dialog is open, so it starts empty each time.
- **Visual design** started from a Google Stitch mockup, cut down to what the app really does. Fonts are self-hosted (`@fontsource`), so the UI makes no CDN calls.

## 10. Harness choices

- **Everything runs in Docker**, including lint and Playwright, so a reviewer only needs Docker, Make and Git.
- **One image** for all Node services. `node_modules` is installed in the image and **never bind-mounted** from the host, because macOS and Linux native binaries differ. Only source folders are mounted, for hot reload.
- **A one-shot `migrate` service:** the API and worker wait on `service_completed_successfully`, so they never start against an unmigrated schema.
- **An isolated test stack:** project `ff-test`, a tmpfs DB and no host ports. It can't touch dev data and can run while `make dev` is up.
- **Dev-mode containers** (`tsx`, the Vite dev server) for both dev and test. Production would use multi-stage builds that compile to JS and serve the static UI from a CDN or nginx, running as a non-root user.
- **Supply chain:** pnpm blocks dependency install scripts by default, and only `esbuild` is allowlisted. The Docker build checks that its native binary runs.

## What I'd do with more time (cut deliberately)

- Authentication + RBAC (prod changes need an elevated role), with the actor taken from the token
- Claim + lease worker; a failed-events view with replay; persistent idempotency on the receiver; HMAC-signed webhooks
- SSE for the activity feed; pagination (keyset cursor on `created_at, id`) for the feed and the flag list
- Optimistic UI; component tests for the form and table states
- Observability: structured logs (pino), OpenTelemetry traces across API → outbox → worker, and metrics on outbox lag and failures
- CI pipeline running `make test`; production Dockerfiles; DB role grants (`INSERT, SELECT` only on `audit_logs`)
- Flag features: targeting rules, percentage rollouts, archiving instead of deleting, and an SDK/evaluation endpoint with caching
