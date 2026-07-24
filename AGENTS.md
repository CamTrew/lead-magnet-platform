# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm**. Node + Next 15 (App Router) on React 19, Geist font, Tailwind 3.4 with a neutral `ink-*` palette (defined in `tailwind.config.ts`).

```bash
pnpm dev            # next dev — http://localhost:3000
pnpm build          # next build
pnpm start          # production server
pnpm lint           # eslint . (flat config in eslint.config.mjs)
npx tsc --noEmit    # full TypeScript check

pnpm db:generate    # drizzle-kit generate — regenerate SQL after editing db/schema.ts
pnpm db:migrate     # drizzle-kit migrate — apply pending migrations to DATABASE_URL
pnpm db:check       # drizzle-kit check — validate snapshots vs migrations
pnpm db:studio      # drizzle-kit studio

pnpm test:email-compatibility   # legacy + current email renderer contract
pnpm smoke:follow-up            # follow-up/integration regression suite
pnpm test:hosted-resources      # private upload and public-token contract
pnpm test:lead-magnet-copilot   # prompt, memory, and patch contract
pnpm test:kit-integration       # Kit OAuth/subscriber contract
pnpm test:zapier-webhook        # Zapier URL security and payload contract
```

There is no test runner configured. There is no typecheck script — run `npx tsc --noEmit` when you need one.

### Env vars

Loaded via `.env.local` in dev; set in Vercel for prod.

Required:

- `DATABASE_URL` — Postgres (Neon in prod). `drizzle.config.ts` reads from `.env.local` for CLI tooling too.
- `MAGNETS_ENCRYPTION_KEY` (fallback `DATA_ENCRYPTION_KEY`) — AES-256-GCM key for stored integration secrets. **Required in production** or `SecretConfigurationError` throws on first secret read/write.

Optional but recommended in prod:

- `NEXT_PUBLIC_SITE_URL` — canonical base URL (defaults to `https://magnets.so`). Used by `app/layout.tsx`, `robots.ts`, `sitemap.ts`, and the dashboard's "View on magnets.so" fallback URL builder.
- `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID` — enables auto-attach/detach of customer domains on the Vercel project from `lib/vercel.ts`. Missing config → silent no-op; account saves still succeed.
- `MAGNETS_RESEND_API_KEY`, optional `MAGNETS_RESEND_FROM_EMAIL` — platform-managed email fallback. Accounts with a verified sender domain and their own key keep using that matching Resend workspace.
- `KIT_CLIENT_ID`, `KIT_CLIENT_SECRET`, `KIT_REDIRECT_URI` — supported Kit OAuth connection.
- `DEEPSEEK_API_KEY`, optional `DEEPSEEK_MODEL` — page-editor copilot.
- `BLOB_STORE_ID`/OIDC or `BLOB_READ_WRITE_TOKEN` — public lead-magnet and email images.
- `HOSTED_RESOURCES_BLOB_STORE_ID` — a **separate private** Vercel Blob store for hosted downloads. Never point this at the public image store.

Per-account Resend/Beehiiv keys, Kit OAuth tokens, calendar credentials, Slack hooks, Zapier hooks, and Pipedrive tokens are encrypted on `magnets_accounts`. The Magnets-managed Resend key is server-only and never stored on an account row.

## AI maintainer map — read before changing behavior

This is the durable memory for coding agents. Comments in code explain local invariants; this section explains how the pieces fit together. When behavior changes materially, update this file in the same change.

### Non-negotiable product invariants

1. **Old emails must continue rendering.** `email_body` and follow-up bodies are a backwards-compatible text protocol, not disposable editor state. New block syntax must be additive and every new construct needs an HTML renderer, a plain-text fallback, editor parsing/serialization, preview coverage, and compatibility tests.
2. **Preview and sent email use the same renderers.** The editor imports `renderDeliveryEmailHtml` / `renderFollowUpEmailHtml`; delivery and follow-up sending must use those functions too. Do not build a second approximation in React.
3. **A signup is retained even if optional integrations fail.** Resource delivery, submission persistence, conversion attribution, sequence creation, and optional integration fan-out have deliberately different failure semantics; see the signup pipeline below.
4. **Sequence edits must not orphan active recipients.** Runs are persisted per lead-magnet/email, creation is idempotent, and render-version/fingerprint checks repair templates without producing duplicate active runs.
5. **Secrets never round-trip to the browser.** Dashboard payloads contain `********`; test/send routes re-fetch with `getAccountWithSecrets`. Masked values mean “preserve ciphertext,” not “save eight asterisks.”
6. **Hosted resources are private at rest.** Public access is only through an unguessable, revocable app token. The Vercel blob URL must never be treated as the customer-facing download link.
7. **Analytics is anonymous and non-blocking.** Visit/session IDs are random browser identifiers, not identity profiles. Analytics failure cannot stop rendering or form submission.
8. **The copilot may edit copy, not business logic.** It cannot invent facts or mutate IDs, links, publishing state, integrations, images, quiz routing, sequence timing, or unrelated fields.

### Signup pipeline and failure semantics

`POST /api/submit` is the critical public write path. Preserve this order:

1. Parse and rate-limit the public request.
2. Resolve the account + published lead magnet and confirm the submitted slug matches.
3. Send the requested resource email using the correct account/platform Resend pairing.
4. Persist the submission.
5. Attribute the analytics conversion when a session ID exists; failure is logged and non-fatal.
6. Start/persist the follow-up run before returning. A sequence error is non-fatal to the subscriber but must be logged; do not move this into untracked client work.
7. Use Next `after()` for best-effort Beehiiv, Substack, Kit, Slack, Zapier, and Pipedrive fan-out. The task list uses `Promise.allSettled` so one provider cannot suppress the others.

Never make Zapier/Slack/newsletter/CRM availability a prerequisite for accepting a signup. Conversely, do not move submission persistence itself into `after()`.

### Email editor and body protocol

The email editor is block-oriented in `components/dashboard/page-editor-client.tsx`, but storage remains a string for backwards compatibility.

- `lib/email-body-images.ts` owns image-line and image-row parsing/serialization, insertion at the current selection, side-by-side grouping/ungrouping, captions, borders, and legacy image syntax.
- `lib/email-body-links.ts` owns inline formatting plus structural tokens such as headings, quotes, sections, columns, content breaks, table of contents, footnotes, and YouTube cards.
- `lib/email-render.ts` is the canonical HTML + text rendering layer. HTML must be conservative email-safe markup: tables, inline styles, explicit widths, no iframe/script assumptions.
- Pasted images must upload first and store a durable app/Vercel URL. `blob:` and `data:` preview URLs must never be persisted into a sendable body.
- Desktop images intentionally cap their rendered width; mobile remains fluid. Side-by-side image rows must collapse safely on narrow clients.
- The editor has explicit undo/redo history. Deleting, grouping, ungrouping, pasting, and uploading blocks must enter that history.
- Autosave is debounced, but manual save remains. Do not allow an older response to overwrite a newer local edit.
- Increment `FOLLOW_UP_RENDER_VERSION` whenever stored Resend automation templates need regeneration because output HTML changed.

Run both `pnpm test:email-compatibility` and `pnpm smoke:follow-up` after touching parsing, serialization, previews, delivery rendering, footer markup, images, or follow-up templates.

### Follow-up runs and duplicate prevention

`magnets_follow_up_runs` is the durable per-recipient state. Its unique `(lead_magnet_id, email)` constraint is intentional. `startLeadMagnetFollowUpSequence` checks/creates state atomically enough for duplicate form posts and uses a sequence fingerprint to understand what version a run represents.

- Multiple different people can join the same sequence.
- Editing a magnet's sequence must not stop existing runs.
- The same person submitting twice must not receive duplicate active runs.
- Booking webhooks stop only eligible active runs and are idempotent.
- “Start sequence” in the signups UI is a recovery/manual action for a stored signup with no active sequence, not the normal signup path.

### Hosted resources

The feature spans `lib/hosted-resources.ts`, `app/api/hosted-resources/*`, `app/dashboard/resources`, `app/resources/[token]`, and `magnets_hosted_resources`.

- Validate extension, MIME, size, account-scoped blob pathname, and returned blob URL on the server.
- Store files in the dedicated private blob store.
- The dashboard only lists rows belonging to the authenticated account.
- `/resources/[token]` resolves the public UUID token and streams/redirects through the controlled server path.
- Deleting a resource removes access and should best-effort clean up the blob; never let a blob cleanup failure expose another account's row.

### Conversion analytics

`magnets_lead_magnet_visits` stores one row per `(lead_magnet_id, session_id)` with first/last seen, capped engaged seconds, and optional conversion time.

Post-signup video plays and quiz completions are nullable timestamps on
`magnets_submissions`. They are one-per-successful-submission outcomes: video
requires an explicit Play action, and quiz completion is set server-side only
after all configured answers have been saved. Never replace these with raw
client counters, which would allow refreshes and retries to inflate results.

- The browser tracker sends bounded heartbeats to `/api/analytics/visit`.
- The submit route marks the matching session converted after the submission is retained.
- All read queries must be account-scoped.
- Keep collection lightweight: no fingerprinting, raw browsing history, or marketing cookies.
- Analytics endpoints are public but schema-validated and rate-limited.

### Lead-magnet copilot and memory

Copilot history is persisted per magnet in `magnets_lead_magnet_copilot_messages`. Ownership is checked through the magnet/account relationship on every read/write/reset.

- `lib/lead-magnet-copilot-prompt.ts` contains the durable writing policy and bounded memory selection.
- The prompt treats saved draft/chat text as untrusted context to resist prompt injection.
- `selectCopilotConversationMemory` retains the earliest grounding messages plus recent working context under a character/message cap.
- Structured output is allowlisted through `lib/lead-magnet-copilot.ts`; apply only known copy fields and known follow-up IDs.
- Preserve `{name}`, email image rows, and existing links unless the user explicitly changes them.
- Never send unbounded chat history or log whole prompts/drafts.

### Optional integrations

- **Beehiiv:** supported API subscription plus a deterministic per-lead-magnet tag.
- **Substack:** best-effort undocumented public subscribe endpoint; keep its UI warning.
- **Kit:** OAuth authorization-code flow in `app/api/account/kit/*`; encrypted rotating tokens, refresh lock, subscriber upsert, deterministic magnet tag.
- **Slack:** exact `hooks.slack.com/services/...` validation and compact signup notification.
- **Zapier:** exact `https://hooks.zapier.com/hooks/catch/...` validation. POST a flat `lead_magnet.signup` JSON object so fields map cleanly in Catch Hook. The URL is a credential.
- **Pipedrive:** find/upsert person by normalized email.
- **Calendly/Cal.com:** booking webhooks stop eligible follow-up runs; webhook tokens/secrets remain server-only.

All optional signup integrations are non-blocking. Test routes are authenticated, rate-limited, re-fetch decrypted secrets server-side, and return provider-safe errors.

## Architecture

### Data boundary

All DB access goes through `lib/platform-store.ts` and `lib/auth.ts`. Routes/components do not call `lib/db.ts` directly. New persistence work belongs in `platform-store.ts` against the Drizzle schema in `db/schema.ts`, not ad-hoc SQL elsewhere.

`lib/db.ts` exposes a singleton `pg.Pool` (stored on `globalThis` to survive HMR) and a `query()` helper. Most of `platform-store.ts` uses raw SQL via `query()` rather than the Drizzle query builder, with multi-CTE statements that insert-then-select to keep operations atomic (`getDashboardBase*`, `createUserWithPasswordSession`, `bulkRecordSubmissions`).

User identity lives in **`neon_auth."user"` and `neon_auth.session`** (Neon Auth) — queried directly by `platform-store.ts`, **not** modeled in `db/schema.ts`. The app-owned tables in `public` are all prefixed `magnets_`:

- `magnets_accounts` — one row per user (`owner_user_id` unique). Brand, domain/subdomain, sender email, encrypted Resend/Beehiiv keys, Substack publication.
- `magnets_auth_credentials` — password hashes keyed by `user_id`.
- `magnets_lead_magnets` — the published pages.
- `magnets_lead_magnet_copilot_messages` — durable per-magnet copilot conversation history.
- `magnets_hosted_resources` — account-owned private blob metadata and revocable public tokens.
- `magnets_lead_magnet_visits` — anonymous visit, engagement, and conversion aggregates.
- `magnets_follow_up_runs` — durable/idempotent recipient sequence state.
- `magnets_submissions` — form submissions. Index `magnets_submissions_account_email_idx` on `(account_id, lower(email))` keeps the per-account dedup query (`listAccountSignups`) fast.
- `magnets_rate_limits` — counters used by `lib/rate-limit.ts` (single multi-row CTE upsert; do not bypass).

### Secrets

`lib/secrets.ts`: `encryptSecret` / `decryptSecret` (AES-256-GCM, prefix `enc:v1:`), `redactSecret` (returns the literal `'********'`), `isMaskedSecret`.

Convention:

- `mapAccount(row, { revealSecrets: true })` returns plaintext for server-side use (sending email, calling Resend).
- `mapAccount(row)` returns `'********'` for anything sent to the client (the dashboard payload).
- On `updateAccount`, `isMaskedSecret(value)` means "user didn't change it" — preserve existing ciphertext instead of re-encrypting the mask.

Use `getAccountWithSecrets(accountId)` when a server route needs the real key (the DNS verify route does this).

### Auth flow and access control

`lib/auth.ts` owns the session cookie `magnets_session`. Tokens are stored in `neon_auth.session` as both the raw token and a `sha256:` hash (lookups check either). `requireDashboardPayload()` is the per-route gate: it redirects to `/login` when unauthenticated and returns a `DashboardPayload` with **redacted** secrets.

There are **three** layers of access control. Don't remove one assuming another covers it:

1. **`middleware.ts` (edge)** — bounces `/dashboard/*` to `/login?next=…` and returns 401 JSON for non-public `/api/*` when no session cookie is present. Allowlist of public APIs in `PUBLIC_API_PREFIXES`. Logged-in users hitting `/login` or `/register` are redirected to `/dashboard`. Also sets security headers (CSP-adjacent, HSTS in prod).
2. **`requireDashboardPayload()`** in each authed page/API route — re-checks the session against the DB. The cookie can outlive the session row, so this catches that case.
3. **`isSetupComplete(account)`** from `lib/setup.ts` — gates `/dashboard/pages`, `/dashboard/signups`, and `POST /api/lead-magnets` until the user has claimed a valid Magnets username or completed the legacy custom-domain publishing setup. Sender-domain and integration settings remain optional. Incomplete accounts redirect to `/dashboard?setup=incomplete`, and the sidebar dims gated items through the `setupComplete` prop on `DashboardLayoutShell`.

### Onboarding and in-app help

First-run education is mounted from `app/dashboard/layout.tsx` whenever
`account.onboardingCompletedAt` is empty. `components/dashboard/onboarding-gate.tsx`
must teach the lead-magnet model before collecting profile answers, make the
free `magnets.so` publishing route the low-friction default, and offer custom
domain setup as an optional branch. Completing onboarding reserves a platform
username through `completeOnboarding`; do not make DNS or integrations a
prerequisite for finishing it.

Persistent education lives in `components/dashboard/help-center.tsx` and opens
from the dashboard sidebar or the contextual help button in each page header.
Keep the core explanations ("what", "why", "how", and "what works best"), the
first-launch path, and the searchable operational guides available after
onboarding. The modal starts with a full-width topic library and opens one
focused article at a time with a Back control; do not reintroduce a permanently
visible article sidebar. The help centre documents the editor, hosted resources,
brand settings, workspace setup, delivery emails, sequences, after-signup
experiences, custom domains, sender setup, legal links, newsletter and
automation connections, calendars, signups, analytics, account settings, and
the video walkthrough. Keep instructions aligned with the labels and paths in
the live dashboard. Custom-domain help should link to
`/dashboard?setup=custom-domain`, which opens the existing publishing wizard
rather than duplicating DNS behavior.

### Routing layout

App Router under `app/`:

- `app/page.tsx` — marketing landing. Has `Organization`/`WebSite`/`SoftwareApplication` JSON-LD. Its `components/landing/hero-dashboard.tsx` hero media uses the existing `WalkthroughVideo`; preserve its responsive and dark-mode framing when changing the landing page.
- `app/login`, `app/register` — auth.
- `app/dashboard/*` — authenticated UI. `layout.tsx` reads the payload, computes `setupComplete`, and passes both into `DashboardLayoutShell`. The shell owns the sidebar; pages render their own `<PageHeader>` so the sidebar persists across navigation.
- `app/[slug]/page.tsx` — **public lead-magnet page on the customer's custom domain**. Resolves the account via `host` header through `findPublishedLeadMagnet(host, slug)`. On `localhost` it falls back to "any published page with this slug".
- `app/p/[id]/page.tsx` — **platform-managed URL** at `magnets.so/p/<lead-magnet-uuid>`. Looks the magnet up by UUID via `findPublishedLeadMagnetById` — does not depend on the host. Use this for the dashboard's "View" link until the user attaches a real domain.
- Both render `components/lead-magnet-page-view.tsx`. Both `generateMetadata` for SEO.
- `app/terms`, `app/privacy` — legal, render via `components/legal-page.tsx`.
- `app/robots.ts`, `app/sitemap.ts` — disallow `/api/` and `/dashboard/`; list public routes.
- `app/api/account` — PUT settings. Also reconciles Vercel project domains via `syncProjectDomain` (best-effort).
- `app/api/auth/{login,logout,register}` — session endpoints.
- `app/api/lead-magnets`, `app/api/lead-magnets/[id]` — CRUD. POST creates a magnet (title + downloadLink both required); PUT/DELETE are gated by per-user rate limits.
- `app/api/signups`, `app/api/signups/export`, `app/api/signups/import` — list, CSV export, and manual/CSV import with column mapping.
- `app/api/submit` — public form handler: rate-limits, sends email via Resend, pushes to Beehiiv + Substack (best-effort, errors swallowed), records the submission.
- `app/api/analytics/visit` — public, rate-limited engagement heartbeat; no authentication cookie required.
- `app/api/hosted-resources/*` — authenticated private resource upload/list/delete.
- `app/resources/[token]` — public revocable hosted-resource link.
- `app/api/lead-magnets/[id]/copilot` — authenticated, owner-scoped persistent copilot chat.
- `app/api/account/kit/*` and provider test routes — authenticated integration setup/testing.
- `app/api/dns/verify` — DNS check. For `publishing` it builds the page CNAME/TXT and resolves via `node:dns/promises`. For `delivery` it calls Resend's domains API with the **user's** key, fetches their actual records (DKIM included), then verifies them.
- `app/api/vercel/status` — exposes Vercel domain attach/verification status for the dashboard.

### Email + integrations

`lib/platform-resend.ts` resolves a matched verified customer sender/key pair or the Magnets-managed sender/key. Never combine a customer's verified From address with the platform API key: Resend workspaces own their domains.

`lib/resend.ts::sendLeadMagnetEmail` and `lib/email-render.ts` produce the real delivery output. Every email ends with the canonical full-width Magnets footer. Preview and sent email must stay on the same renderer.

`lib/beehiiv.ts`, `lib/substack.ts`, `lib/kit.ts`, `lib/slack.ts`, `lib/zapier.ts`, and `lib/pipedrive.ts` are best-effort after-signup integrations. Errors are logged via `lib/logger.ts` but never block the response. Substack uses the undocumented `/api/v1/free` subscribe endpoint — fragile by design; the dashboard warns users about this in the help tooltip.

### DNS

`lib/dns-records.ts` is the single source of truth for record shapes. `buildPageDnsRecords` returns the CNAME to `cname.vercel-dns.com` and a TXT verification record. `buildEmailDnsRecords` returns generic SPF/MX/DMARC as a *preview* only. The dashboard's "Check DNS" in delivery replaces those with the *exact* records Resend returns (including the unique DKIM selector), which is why the verify route needs the user's Resend key — see `getResendEmailDnsRecords`.

The DNS verify route's error path scrubs Resend keys from any error message before returning it to the client — see `scrubResendErrorMessage`.

### Vercel domain reconciliation

`lib/vercel.ts` calls the Vercel Projects-Domains API to keep the project in sync with each user's `subdomain.domain` and apex `domain`. `syncProjectDomain` diffs old → new on every account save and attaches/detaches accordingly. It is **idempotent and best-effort**:

- 409 "already attached to this project" → success.
- 404 on delete (already detached) → success.
- Missing env vars → silent no-op.
- Any other error is collected into `vercel.errors` on the API response; saves never fail because of Vercel.

### Logging

`lib/logger.ts` emits structured JSON lines for Vercel/Datadog. Use `log.info/warn/error` instead of `console.*` in routes. The logger **redacts**:

- Anything that looks like a Resend key (`re_...`) or a Bearer token.
- Object fields named `password`, `passwordHash`, `token`, `sessionToken`, `cookie`, `authorization`, `resendApiKey`, `beehiivApiKey`, `apiKey`, `api_key`.
- Slack/Zapier webhook URLs and Kit/calendar/Pipedrive secret field names. When adding an integration credential, update both field-name redaction and recognizable string patterns.
- Strings longer than 500 chars are truncated.

If you need to log something untrusted (e.g. an error from Resend), pass it through the `extra: { error: err }` slot so the redactor processes it. Never `console.log(request.body)`.

### Logo upload security

`lib/upload.ts::validateLogoDataUrl`. Server-side:

- Allowed MIME: PNG / JPG / WebP / GIF. SVG is explicitly rejected (XSS via `<svg onload>`).
- Magic-byte check confirms the bytes match the claimed MIME.
- 1 MB cap.

The dashboard mirrors the check client-side, but treat the server check as authoritative.

### Signup import

`POST /api/signups/import` accepts either `{ type: 'manual', ... }` or `{ type: 'csv', csv, hasHeader, emailColumn, nameColumn, leadMagnetId }`. CSV parsing is a tiny RFC-4180-ish parser in `lib/csv.ts`. Bulk insert via `bulkRecordSubmissions` (single CTE round-trip). Limits: 2 MB CSV, 5,000 rows per request. Email regex validated server-side; duplicates within the batch are dropped.

The dashboard import UI starts with the column-mapping dropdowns **empty** — the user picks Email column and (optionally) Name column. No auto-guessing.

### Conventions

- `'use client'` only where state/effects are needed. Most pages are server components; client logic lives in `components/dashboard/*-client.tsx`.
- Zod schemas live next to the route they validate. Use `.strict()` to reject unknown keys.
- Tailwind uses an `ink-*` neutral palette (defined in `tailwind.config.ts`). The visual language is Vercel-inspired: black/white with single black accent, sharp small radii, minimal shadows. Brand-colored decoration only appears on the public lead-magnet page (which uses CSS vars driven by each account's color choices).
- Brand name: "Magnets". Domain: `magnets.so`. Avoid the longer "Lead magnet platform" framing.
- Email sending and DNS verification depend on per-account secrets being **decrypted** — do not pass the result of `requireDashboardPayload()` to those, since its `account.resendApiKey` is just the masked `'********'`. Fetch via `getAccountWithSecrets` instead.
- Every magnet has a stable UUID — prefer linking via `/p/<id>` for any URL you generate inside the dashboard (it works without DNS). The branded `subdomain.domain/<slug>` is the customer-facing URL.
- Add comments for surprising security, compatibility, or ordering constraints. Do not comment obvious assignments or JSX; stale narration is worse than no comment.
- A schema change is incomplete until `pnpm db:generate` creates the SQL + snapshot and `pnpm db:check` passes. Migrate before deploying code that selects the new column.
- Preserve unrelated dirty work. This repository is commonly edited across a long product-improvement session.

## Deployment (Vercel)

1. Set env vars listed above. Confirm the private hosted-resource blob store is distinct from the public image store.
2. Run `pnpm db:migrate` against the production `DATABASE_URL` **before** code that reads new columns serves traffic. There is no auto-migration on boot.
3. Attach the platform's own domain (e.g. `magnets.so`) to the Vercel project manually. After that, customer domains attach automatically via `syncProjectDomain` when they save the account.
4. The `pg` pool max is 5 per serverless instance, which is fine for Neon. If you ever see connection exhaustion, switch to Neon's serverless driver — not a Pool change.
5. Minimum pre-production checks for broad changes: `pnpm lint`, `npx tsc --noEmit`, `pnpm db:check`, `pnpm test:email-compatibility`, `pnpm smoke:follow-up`, and `pnpm build`, plus the feature-specific smoke script.
