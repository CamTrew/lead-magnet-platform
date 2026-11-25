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
pnpm test:editor-save           # save conflict retries + Neon pooled mutation locks
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

### Delivery email writing guidance

`lib/landing-page-guidance.ts` separately owns concise landing-page sales copy defaults across MCP creation/editing, editor copilot and AI draft generation: one clear headline, one supporting line, one brief description and three short benefit bullets. Keep detailed explanations inside the resource. These are generation defaults, not tighter storage validation or permission to rewrite existing customer pages. Preserve explicitly requested longer copy.

`lib/delivery-email-guidance.ts` owns the shared conversational delivery-email policy used by campaign MCP creation/editing and the in-editor copy assistant. Ground the handover, specific starting recommendation and natural closing in the current resource and creator. Do not impose a 50–120-word ceiling or copy another customer's text, stories, results, links or signature into shared prompts. Updating guidance affects newly generated copy, not stored customer emails. Existing URLs and the backwards-compatible body protocol must remain intact.

### Email editor and body protocol

The email editor is block-oriented in `components/dashboard/page-editor-client.tsx`, but storage remains a string for backwards compatibility.

- `lib/email-body-images.ts` owns image-line and image-row parsing/serialization, insertion at the current selection, side-by-side grouping/ungrouping, captions, borders, and legacy image syntax.
- `lib/email-body-links.ts` owns inline formatting plus structural tokens such as headings, quotes, sections, columns, content breaks, table of contents, footnotes, and YouTube cards.
- `lib/email-render.ts` is the canonical HTML + text rendering layer. HTML must be conservative email-safe markup: tables, inline styles, explicit widths, no iframe/script assumptions.
- `lib/email-header-text.ts` collapses whitespace in delivery/follow-up subjects and inbox preview text. Normalize on save and again before sending so legacy drafts with pasted line breaks cannot trigger Resend subject-validation errors. Preserve body line breaks.
- Pasted images must upload first and store a durable app/Vercel URL. `blob:` and `data:` preview URLs must never be persisted into a sendable body.
- Desktop images intentionally cap their rendered width; mobile remains fluid. Side-by-side image rows must collapse safely on narrow clients.
- The editor has explicit undo/redo history. Deleting, grouping, ungrouping, pasting, and uploading blocks must enter that history.
- Autosave is debounced and must recover automatically without a Save button. Do not allow an older response to overwrite a newer local edit.
- Save-lock conflicts (`save_in_progress`), network timeouts, rate limits, and server failures keep the draft dirty and retry the latest revision with capped backoff, including after connectivity returns. Permanent client errors (such as validation, authentication, or duplicate paths) pause retries until corrected. Never claim changes are saved before a confirmed successful response.
- Database mutation locks use transaction-scoped advisory locks inside an explicit transaction. Never use session-scoped advisory locks with Neon's transaction pooler; commit/rollback must release them, and a failed rollback must discard the connection.
- Increment `FOLLOW_UP_RENDER_VERSION` whenever stored Resend automation templates need regeneration because output HTML changed.

Run both `pnpm test:email-compatibility` and `pnpm smoke:follow-up` after touching parsing, serialization, previews, delivery rendering, footer markup, images, or follow-up templates.

### Follow-up runs and duplicate prevention

Creators can add and autosave incomplete follow-up emails while a sequence is off. The Sequence tab enables sending once every draft has a subject and body and the account can send. Removing the final email switches the sequence off.

`magnets_follow_up_runs` is the durable per-recipient state. Its unique `(lead_magnet_id, email)` constraint is intentional. `startLeadMagnetFollowUpSequence` checks/creates state atomically enough for duplicate form posts and uses a sequence fingerprint to understand what version a run represents.

- Multiple different people can join the same sequence.
- Editing a magnet's sequence must not stop existing runs.
- The same person submitting twice must not receive duplicate active runs.
- Follow-up Automations persist their sender at creation time. Account sender changes and successful Resend verification reconcile enabled Automations so follow-ups and delivery use the same resolved sender; existing recipients remain on their original Automation.
- Booking webhooks stop only eligible active runs and are idempotent.
- “Start sequence” in the signups UI is a recovery/manual action for a stored signup with no active sequence, not the normal signup path. Only offer Start/Retry when that row’s target magnet has enabled follow-up emails with non-empty subjects and bodies. `AccountSignup.followUpConfigured` comes from the same account-scoped magnet as the run status and start action, including filtered/paginated results. Delivery-only signups show “No follow-ups”; existing active runs keep their Stop action even if follow-ups are later disabled.

- The production post-build renderer upgrade reports per-account failures without failing the deployment. Failed accounts retain their stored render version for retry; explicit maintenance runs still exit unsuccessfully on failure.

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
- Analytics shows authoritative total signup events and the deduplicated unique-person count separately
  from tracked conversions. Conversion rate, daily conversion charts, and A/B tests use only conversions
  matched to an anonymous visit so the numerator and denominator cover the same tracking period.
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
- `app/robots.ts`, `app/sitemap.ts` — disallow `/api/` and `/dashboard/`. The `magnets.so` sitemap lists only Magnets-owned pages; customer hostnames receive their own published lead-magnet URLs and must never be aggregated into the platform sitemap.
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

Vercel TXT challenges require an explicit verification request; reading domain
status does not complete them. The publishing wizard's **Check again** submits
`POST /api/domain/verify-routing` when a challenge is pending, then refreshes
status. This account-scoped, rate-limited route holds the domain mutation lock,
re-reads the account, and calls Vercel's `/domains/:host/verify` only for its
ownership-verified, attached hostname. Background status polling remains read-only.

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

`brand.logoSize` stores the bounded small/medium/large display choice. Keep the
live page, editor preview, brand preview, and post-signup header on the shared
`BrandLogo` renderer so the selected size remains consistent.

The dashboard mirrors the check client-side, but treat the server check as authoritative.

### Signup import

`POST /api/signups/import` accepts either `{ type: 'manual', ... }` or `{ type: 'csv', csv, hasHeader, emailColumn, nameColumn, leadMagnetId }`. CSV parsing is a tiny RFC-4180-ish parser in `lib/csv.ts`. Bulk insert via `bulkRecordSubmissions` (single CTE round-trip). Limits: 2 MB CSV, 5,000 rows per request. Email regex validated server-side; duplicates within the batch are dropped.

The dashboard import UI starts with the column-mapping dropdowns **empty** — the user picks Email column and (optionally) Name column. No auto-guessing.

The signups dashboard uses stable cursor pagination over `(latest_signup_at, lower(email))`, loading 50 deduplicated emails at a time. Search and lead-magnet filters run in the database before pagination; do not replace them with filtering over the currently loaded client rows.

The Signups CSV keeps one row per email and appends one column per exported magnet and custom field ID. Use the newest submitted answer per field within the filters, including retired fields. Use current labels when available, and disambiguate matching headers. Dashboard and MCP downloads use the same export route.

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


### Assistant campaign creation (staging branch)

`MAGNETS_CREATION_ENABLED=1` enables `/create`, campaign APIs, and the dashboard entry.
`MAGNETS_ASSISTANT_ORIGIN` must be the exact HTTPS origin serving OAuth and `/mcp`.
`MAGNETS_STAGING_PREVIEW=1` is a read-only design mode: middleware denies
all customer-data and mutation routes, auth forms are disabled, and `/create` shows
explicitly labelled sample content. Keep this guard enabled when using the production DB read-only, as authorized by the user.
The dedicated staging project is `magnets-viral-staging`; never deploy this task to the
existing Magnets production project. Use `pnpm exec next build` locally, bypassing the existing
production postbuild hook. Hosted preview builds use `node scripts/build-staging.mjs`,
which refuses any Vercel environment other than preview and checks the staging project ID. The owner authorized the staging branch to use the existing production database. Additive campaign migrations 0034 and 0035 are installed; no existing customer records were rewritten. Never deploy the production project or run the production postbuild hook. Tests that insert fixtures remain restricted to the isolated local database.

- `/mcp` uses the official MCP SDK stateless Streamable HTTP transport. Native assistant
  inference stays with the customer's ChatGPT/Claude plan; it makes no paid AI API calls.
- `/oauth/*` provides dynamic client registration, explicit account consent, PKCE S256,
  resource-bound opaque access tokens and rotating refresh tokens. Only hashes persist
  in `magnets_assistant_grants`. Exact redirects are registered before consent. The
  `campaigns:create` scope cannot access subscribers, domain settings, or old magnets.
- `magnets_campaigns` stores a complete validated resource/page/email package and
  references a new draft magnet. Account/request uniqueness makes creation retry-safe.
  The existing editor, rendering, public signup and sequence code remain authoritative.
- New assistant campaigns start by asking whether the user already has a resource or wants to create one together in chat. Skip this when their choice is already explicit, on edits, and on retries. The shared onboarding starter explicitly requests a new document from scratch using the saved idea and brand, so it has already answered the source choice and must skip the existing-resource question. A saved topic alone is not a source choice. Existing resources keep their original bytes via `upload_resource` / `resource.hostedResource`; wait for access rather than silently generating a replacement. The shared instructions and `get_creation_guide.resourceChoice` cover both MCP scopes.
- `lib/campaign-schema.ts` is the strict content contract and writing guidance. Tools
  cannot supply IDs, integration settings, sender credentials or sequence timing.
  New campaigns default to delivery only (`followUps: []`, disabled automation).
  One to three follow-ups require `followUpsRequested:true` from an explicit user request;
  they use fixed delays of 1, 3, then 5 days after the previous email. Never retroactively
  remove existing sequences. Delivery copy should read like a complete personal note.
- `get_campaign` reads current editor copy and an opaque `editVersion`.
  `update_campaign` applies a strict copy-only patch under the existing mutation lock
  and one database transaction, checks both campaign revision and page timestamp,
  retains page versions, and preserves unrelated settings. Live copy edits require
  `confirmLiveEdit:true`; publication is not changed. Follow-ups on published or previously
  published campaigns (or those with an automation) remain editor-only to preserve
  active recipients. Existing magnets outside this campaign workflow remain inaccessible.
- Generated PDFs and template PNGs are rendered on demand from private DB content.
  `/campaign-resources/[token]` and `/campaign-covers/[token]` require an unguessable
  token and a published owning magnet. Unpublishing or deleting revokes public access.
  They do not expose Blob URLs or alter legacy hosted resources. Draft downloads are
  authenticated and account scoped. Covers accept bounded PNG/JPEG/WebP bytes only.
- `lib/campaign-service.ts` prepares email automation before exposing a new page, under
  the existing transaction-scoped magnet mutation lock. New MCP/import campaigns
  automatically publish through `createAndPublishCampaign` after readiness checks.
  A blocked publication retains a draft and returns `publicationError`. Retrying the
  same request never republishes a previously published, deliberately unpublished page. Assistant credentials are revocable from `/create`.
- The import fallback accepts the same JSON package when a plan lacks remote connectors.
  Claude prefers compact SVG through the Magnets graphic preview/attachment tools; ChatGPT may use native image generation. `lib/campaign-artwork-guidance.ts` owns both paths and is shared by MCP instructions, tool responses and image briefs. Pages remain image-free until real artwork is attached. Only the dedicated allowlisted graphic tools accept SVG drawing source. The raster upload tool still rejects SVG/HTML; never invent bytes or assume every assistant session can export files.
- MCP `save_campaign` and `get_campaign` return a server-built `imageGeneration` brief
  using the account's current saved name, palette, page theme and logo. Refresh with
  `get_campaign` immediately before generation; do not reuse an old chat prompt.
  Valid inline logos are bounded raster MCP image references, never base64 prompt text;
  HTTPS logo references are returned without server fetching. Invalid logos are explicitly
  unavailable, never invented. Native image capabilities still determine whether the
  real logo can be used. `attach_campaign_cover` accepts the brief's `brandVersion` and
  atomically rejects versioned attachments if branding changed during generation.
  This parameter is optional for older clients and manual upload compatibility;
  new assistant instructions require it. No schema migration or paid image API is used.
- `test:campaign-creation` and `scripts/campaign-mcp-http-smoke.ts` deliberately require
  localhost:55439/magnets_staging_test. They must never run against customer databases.
  The HTTP suite expects a local Next server on 127.0.0.1:3108 with preview mode off.
- Hosted write-flow integration testing still requires a separate Neon/Auth schema, staging-only
  email service, encryption key, and an OAuth endpoint reachable by the native assistant.
  Vercel protection on the visual preview prevents remote assistants connecting.
  A three-minute completion claim must be measured with real provider connections.

The staging marketing landing (`CreationLanding`) is always dark, independently of
the saved dashboard theme. It has no theme toggle, how-it-works modal, or motion
control. Keep respecting the OS reduced-motion preference automatically.

The user authorized production database connectivity for staging on 2026-11-10,
strictly without any data changes or production deployment. Only the staging
project's Preview environment may receive DATABASE_URL. Keep both
MAGNETS_STAGING_PREVIEW=1 and MAGNETS_DATABASE_READ_ONLY=1. lib/db.ts executes all
queries and transaction callbacks inside explicit PostgreSQL READ ONLY transactions
in either mode, which works with transaction pooling; direct ORM access is blocked.
The staging build checks transaction_read_only via a SELECT, without reading customer
rows or attempting writes. Do not migrate, provision roles, copy integration secrets,
send emails, or enable signup/campaign mutations against the shared database.
Run scripts/staging-read-only-smoke.ts only against the isolated local test database;
it verifies rejected mutations there, never against production.

Login and registration use `AuthScene` for a permanently dark animated campaign backdrop.
It wraps the shared auth form without changing validation, consent or redirect behavior.
Keep the saved creation brief, explicit free-account/no-card copy, reduced-motion fallback,
and visible read-only staging notice. Neither page exposes a theme toggle. Login retains password recovery and the shared
auth handler; staging blocks sign-in as well as registration.

### Verified marketing typography

Magnets Brand Guidelines V1, typography section 08 (PDF page 10), specifies
Glyke Regular for the logotype only; use the existing logo artwork. Landing,
login and registration use Geist Bold (700) for hero headlines, Semibold (600)
for titles/actions, and Regular (400) for body/UI text, with reduced tracking.
Use `GeistSans` from `geist/font/sans` and `--font-geist-sans` for these pages.
The legacy `app/fonts/geist-vf.ttf` has a 32–240 weight axis, not CSS 100–900;
do not load it as a 100–900 variable font. Do not substitute Arial, Georgia,
system UI or Geist Mono into this marketing typography. Existing dashboard
typography is outside this staging change's scope.

### Staging product walkthrough

`/preview` and its named screens are an isolated visual walkthrough, available
only when `MAGNETS_STAGING_PREVIEW=1`. The server returns 404 otherwise. Middleware
allows only this new UI namespace in addition to the existing safe preview paths;
customer/dashboard/API routes remain blocked. `ProductPreview` never reads a
session or customer data. Its records and metrics are labelled illustrative,
profile/brand controls stay in component state, and only the existing creation
brief uses localStorage. `/preview/onboarding` is the proposed simplified journey,
not a completed account or real assistant connection. The existing onboarding
API and account setup are unchanged. Campaign output screens embed the actual
`CreationWorkspace` with sample data and reuse the canonical email renderers.
Keep previews clearly labelled; never simulate successful publication or billing.

The first-run staging screens (`/preview`, `/preview/onboarding`, `/preview/create`,
and preview-mode `/create`) share the focused idea-first studio. Ask only for an idea
initially; reveal assistant choice after submission and campaign tools after that.
Do not restore the pre-creation tour, profile questionnaire, or full navigation.
This remains a design-only flow: do not simulate generation or imply a connected
assistant; keep the existing write guards and explicit sample labels.

In the design preview, assistant-choice dialogs offer an explicit example creation
walkthrough instead of copying prompts or opening providers. Its timed stages
and fixed campaign result are labelled as a demo, never real generation. Keep
timers cleaned up on unmount and preserve the non-preview connector/import flow.

### Saved-idea handoff

`magnets_creation_briefs` stores one account-owned brief and preferred format.
`POST /api/campaigns/brief` reserves the account's free publishing username on its
first creation action, without the legacy profile questionnaire. Saving the same
brief preserves its request ID; changing it creates a fresh ID. The MCP
`get_creation_guide` returns only the connected account's saved brief. Assistants
reuse that ID in `save_campaign`, and the creation screen picks up the saved draft.
The live creation flow does not expose sample campaigns or simulated generation.
`/preview/*` redirects to `/create` in functional mode. Visual-only mode remains
read-only. `lib/campaign-email.ts` resolves `{resource_url}` identically for the
saved delivery body and canonical email preview; legacy bodies are unchanged.

### Account email verification

New registration/resend emails contain a random six-digit code, valid for 10 minutes.
`lib/email-verification-code.ts` hashes codes with an email-bound, domain-separated HMAC
using `MAGNETS_VERIFICATION_KEY` (at least 32 random characters), with the existing
encryption key as a legacy fallback. Staging uses a dedicated verification key so
registration does not require rotating the shared integration encryption key. Codes
sent with a valid legacy key remain accepted until expiry. Registration checks key
configuration before saving an account; unverified accounts can retry with the same
password without changing credentials, while verified accounts and wrong-password
retries remain rejected. Only hashes use the existing verification-token table;
no schema change is needed. Confirmation is limited by IP and email (five attempts per
10 minutes); resend does not reset that limit. Resending replaces previous codes, while
legacy links remain supported. User-row locks serialize resend/consume and prevent replay.
The pending page shows the address in white and accepts `one-time-code` autofill, with no
email-client link. Run verification tests only against the isolated local test database.

### Guided assistant setup

`AssistantSetup` presents four illustrated steps: open provider setup, add the connection,
authorise, then enable Magnets in chat and ask for the saved idea. Connection status comes
from active OAuth grants, not from clicking Next. It is not proof of a successful tool call;
the create step waits for a real saved campaign. `/create` restores the saved creation brief
and pending request after reload. `GET /api/campaigns/brief` returns that account's brief and
appearance-only brand. `get_creation_guide` also supplies bounded brand name/colours and
whether a logo exists; never include account secrets or inline logo bytes. The canonical
public landing page already uses the account logo and brand. No brand settings are changed
by connecting or creating. Edits remain explicit in the existing shared Brand settings page.

### Campaign handoff and images

Assistant tool results include review/editor/Audience links and a `publicUrl` only when
the owning page is published. The owning magnet's publishing flag is authoritative,
including when it was published from the existing editor. The assistant offers an image in ChatGPT or a branded graphic in Claude after saving; on acceptance it must attach real bytes through
`attach_campaign_cover` and confirm success. It must disclose unavailable image/file
capabilities and offer the Resource tab's upload fallback, never claim a generated image
was attached without a successful response. Image approval does not approve publication.
`lib/campaign-cover.ts` validates and normalizes raster bytes for MCP and authenticated
upload. Saving holds the magnet mutation lock and atomically updates the cover and the
draft page image URL. Live-page changes remain explicit in the existing editor.
Template cover lettering uses bundled Geist glyph outlines, avoiding server font dependencies.

The assistant-enabled Lead magnets library uses `AssistantEntry` as its main
creation entry, with an on-demand animated four-step walkthrough (idea, assistant,
review/publish in Magnets, Signups/analytics). `/create?new=1` starts a fresh focused
idea flow even when campaigns exist; polling must not select an old campaign while
waiting for the new brief. Library campaign links are account-scoped metadata only.
Draft campaign thumbnails use the authenticated resource endpoint, while custom
editor images keep their own URL. The library has no “Review package” button;
manual creation, normal editing, live-page links and analytics remain available.
Tours direct users to Edit and Hosted resources instead.

Website brand import is available in assistant creation and Brand settings when
creation is enabled. `/api/account/brand/import` POST returns suggestions only;
PUT applies explicitly selected name/logo/colour fields after review. It checks a
brand fingerprint under a row lock, preserves all other account fields, and never
calls domain or sender reconciliation. `lib/website-brand.ts` reads bounded public
HTTPS assets with checked and pinned IPv4 DNS on every redirect; no cookies,
scripts or third-party credentials are sent. Only raster logo bytes are converted
to bounded PNGs. SVG/ICO are skipped. Metadata, CSS variables and icon fallbacks
are suggestions with provenance, not guaranteed brand guidelines. Missing values
leave current branding selected for preservation. Run `test:website-brand` only
against localhost:55439/magnets_staging_test. It covers extraction, address safety,
review/apply isolation, stale review rejection and unrelated account preservation.

The focused creation onboarding runs idea → website brand import/review (or skip) → assistant connection. Branding is offered before handing off to chat so `get_creation_guide` receives the saved account brand. Applying the reviewed suggestion advances the flow; skipping preserves the current brand. Brand settings and the campaign sidebar retain the import entry for later changes.

After the connection wizard confirms an assistant grant, its final action opens the animated `AssistantHandoff`: explicit instructions to create in the assistant plus a dashboard link to `/dashboard/pages?assistant=ChatGPT` (or Claude). This is a handoff, not simulated generation. The library refreshes on return/focus so drafts saved from chat appear with Edit controls. The assistant query only selects instructional copy and fixed external destinations, never authorizes access or marks a connection complete.

Every authenticated dashboard page has the same “Explain this page” button in the sticky top bar, mounted once by `DashboardLayoutShell`. `page-explanations.ts` maps Home, Lead magnets, editor, analytics, Hosted resources, resource reader, Signups, Brand, Customise and Account to focused tours and existing help articles. The creation/onboarding and campaign-review screens also use the same button in their top-right header, with standalone help-article handling. `DashboardTour` uses real `data-dashboard-tour`/accessible selectors, never clicks controls or writes customer data, skips hidden spotlight targets while retaining their explanation, and closes on route changes. Keep selectors and copy aligned with the actual controls (including explicit Save brand / Update name). Tours are optional and replayable; full help remains in the sidebar and “Read the full guide”. Native dialogs trap focus and restore it on close, respect reduced motion, and position within the viewport without adding body padding. The persistent header must not cover a scrolled spotlight target.

### Home and resource navigation

With `MAGNETS_CREATION_ENABLED=1`, `/dashboard` without setup/connection queries
redirects to `/dashboard/home`. Home is first in the sidebar and owns assistant
creation, connection help, the replayable per-account Home tour, and links to the
library, signups/CSV export and manual creation. `/dashboard?setup=workspace`
preserves legacy workspace setup; custom-domain/connection query routes still work.
Configured legacy accounts without an onboarding timestamp may enter normally;
only incomplete first-run accounts are redirected to `/create`. Existing users
see the new Home tour once per browser, without any account or page mutations.
Lead magnets remains the saved-work library. Campaign resource review links to
`/dashboard/campaigns/[id]/resource`, authenticated and account scoped, with a PDF
download. Landing-page review opens the existing editor, which uses the account's
saved brand. Do not replace it with a generic preview or change public token access.

Assistant connection guides match the selected provider using the server's
`listAssistantGrants` display attribution (OAuth redirect hostname, then an
unambiguous client name). An existing ChatGPT connection must not complete the
Claude guide or vice versa. Unknown clients remain usable through OAuth/MCP but
are not treated as either provider by the setup UI. Attribution never authorizes
access, and raw redirect URIs are not added to the dashboard payload.

The shared assistant setup checks connection status on opening and when the user
returns from the provider tab. Only a completed workspace grant for the selected
provider advances the guide; failed background checks leave the manual Check
connection action available. Home must not treat an older creation-only grant as
full workspace access. Once users have chosen their publishing URL, onboarding
also offers a dashboard exit so an unavailable connector does not trap them.

The page editor previews assistant campaign artwork through the authenticated campaign resource endpoint. Keep that URL display-only: autosave must retain the public campaign cover URL, and anonymous draft cover requests must remain denied.

Hosted resources also lists assistant-generated PDFs through `listGeneratedHostedResources` when creation is enabled. This is an account-scoped join to existing campaigns and magnets, not a duplicate Blob upload. Cards link to the authenticated reader/PDF, existing editor, and `/p/<id>` only while published. Keep upload storage/count quotas separate and retain draft resource access checks.

### Lead magnet creation allowance

All new lead magnets share an account-wide rolling limit of 10 successful creations per 24 hours. Both `createLeadMagnet` (manual/generated-draft API) and `saveCampaignPackage` (MCP/import) enforce it under the account row lock. Timestamped creation events live in the existing `magnets_rate_limits` table under a hashed account-specific `lead-magnets:created:*` scope; these are rolling events, not fixed-window counters. Recent existing magnets are included on first use. Deletion preserves the event, failed transactions do not consume allowance, and an existing campaign request ID returns before the quota check. Editing, publication and resource/image updates do not count. Never move this enforcement to just a route or a client check. APIs return 429 with Retry-After and the next available time; MCP returns a tool error with the same details. No schema migration is required.

Assistant onboarding now saves the idea without silently reserving a username. New accounts review their brand, choose their shared `magnets.so/<username>` URL through `/api/campaigns/username`, then connect an assistant. Explicit claims validate reserved routes, use the existing unique account-username constraint and return 409 on conflicts; they never silently suffix or rename an existing URL. Legacy onboarding callers without a username keep their automatic reservation fallback. Existing configured accounts skip this step. Campaign publishing and assistant links use the chosen username plus the actual saved magnet slug, with `/p/<id>` retained as a fallback and existing public route. Test with `test:creator-username` and `test:campaign-mcp` against the isolated local test database only.

- Connection setup must use the server-configured `assistantOrigin()`, not the browser's
  current hostname: one-off preview URLs can differ from the OAuth resource origin.
  The local MCP HTTP suite exercises the consent page/POST, PKCE exchange, refresh
  rotation, revocation, and the distinction between pending and completed connections.

Auth screens size to usable viewport height. Preserve 16px input text, 44px minimum controls, and separate password rows. Short screens reduce spacing; narrow screens omit the decorative story and keep the saved idea in an expandable disclosure. Never use page scaling, fixed-height clipping, or hidden overflow to force forms above the fold: keyboard, zoom, expanded content, and unusually long errors must remain scrollable.

Marketing and first-run onboarding prioritise the main message, required fields and next action within the usable viewport. Validate short laptop heights (1280×650), tablets and small phones (360×640), not physical screen inches alone. Reduce decorative spacing before reducing type size. Connection guides and brand review keep navigation/actions outside an independently scrollable content area. Expanded help, long content, keyboard and zoom states must remain reachable by scrolling; never scale or clip the entire page to force a fit.

Landing/auth/verification navigation stays inside the Next router. After an auth API sets a session cookie, refresh the router cache so anonymous prefetched content cannot survive sign-in. `lib/app-route-theme.ts` scopes the persistent dark canvas to Magnets entry routes; the head bootstrap sets it before first paint and AppThemeBoundary updates it before client-navigation paint. The shared loading fallback must inherit that canvas. Do not globally force customer landing pages into dark mode or reintroduce full document reloads between auth steps.

Website brand import ranks declared icon sizes before applying its bounded fetch limit, so a site's small favicon variants cannot crowd out larger touch icons. Decoded raster dimensions are authoritative: reject images that need enlargement to fill the medium logo box at 2× density, and retain a labelled social-image fallback. Never upscale a tiny favicon or overwrite saved branding during extraction. The website-brand smoke suite covers smallest-first icon lists, misleading size metadata and fallback selection.

Website colour extraction also inspects base brand/button/accent classes actually used in the page, after explicit root CSS variables. It resolves bounded variable aliases and opaque hex/RGB/HSL colours across up to four same-origin stylesheets. Ignore hover states, unused framework classes, pale palette shades and translucent decoration. Do not execute website code or relax the pinned public-address fetch checks. Missing suggestions stay unchecked and are labelled as undetected; applying a reviewed import remains the only persistence step.

- Assistant cover attachment can update a live campaign only with `confirmLiveEdit:true` after image consent; ownership, image validation and current-brand checks still apply. Creation publishes the page before the optional artwork step. No changes to legacy/manual creation defaults.

- `DELIVERY_EMAIL_GUIDANCE` in `lib/campaign-schema.ts` is shared by the creation guide and delivery-body tool schema. New delivery emails lead with the download and use short conversational paragraphs; a worked example, P.S., reply question or signature is optional and must be grounded in supplied content. Do not invent newsletter promises or support commitments. This guidance does not rewrite existing saved emails or change the canonical renderer.

- New campaign slugs and manual-create URL suggestions use `suggestLeadMagnetSlug`: up to three meaningful words and 28 characters before collision suffixes. Existing URLs and explicitly entered slugs are not shortened. Both creation paths keep the account transaction lock and check all existing account slugs (draft or live); collisions gain `-2`, `-3`, etc., backed by the account/slug unique index.

- Before a new assistant campaign is saved/published, ask whether the creator wants delivery only or follow-ups too, unless already specified in the current request/brief. Wait for the answer; if follow-ups are selected, clarify the count (1–3) and explain supported days 1, 4 and 9 after signup. Retries and unrelated edits do not repeat the question. `followUpsRequested` still gates opt-in at persistence.

### Original files in assistant campaigns

The assistant distinguishes an explicitly selected downloadable file from research/reference attachments and brand assets. Do not ask everyone for a file. `upload_resource` accepts original base64 file bytes up to 1 MB, validates format, and stores them in the dedicated private Hosted resources store. Larger/inaccessible chat attachments use the existing dashboard upload (50 MB), then the owner supplies its Magnets resource link. Never claim attachment access or upload without actual bytes.

Campaign `resource` is either the existing generated-document structure or `{ hostedResource: resourceId }`. Save resolves owner-supplied IDs/links server-side, checks account ownership, locks the resource and canonicalises its ID. Original bytes are never converted into a generated PDF. Download routes resolve the selected file; missing/deleted files fail closed. Copy-only MCP edits preserve the download. Upload retries deduplicate by account/filename/content hash; upload and quota locks reuse one transaction connection. No schema migration is required. `scripts/assistant-file-smoke.ts` requires the isolated local test database and mocks Blob calls.

Hosted resources library Open actions (including card artwork) go directly to the current lead magnet download URL when published, or the authenticated file endpoint for drafts. Do not route these actions through the campaign HTML reader. Preserve published-file links changed in the existing editor.

All newly generated campaign copy and copy edits reject literal and encoded em dashes through `humanVoiceViolations`, including nested bullets, emails and image prompts. `NO_EM_DASH_RULE` also instructs native image generation to inspect visible lettering before attachment. This is guidance for raster image contents, not server-side OCR verification. Preserve existing customer files, logos, URLs and legacy email parsing; do not bulk rewrite saved content or alter original uploaded bytes.


### Workspace management from ChatGPT / Claude

The original `/mcp` resource remains `campaigns:create` and retains its eight
creation tools. Full workspace access requires a new connection to
`/mcp/workspace` with `workspace:manage` consent. The resource URL is persisted in
`magnets_assistant_grants` and checked at authorization, code/refresh exchange and
every request. Never grant workspace tools to an old creation token or infer
permissions from a client-supplied scope alone. This split needs no migration.
Setup now copies the workspace URL and checks the returned grant `access` value;
legacy connections still work but cannot satisfy the expanded consent check.

`lib/assistant-mcp.ts` shares the transport and creation tools across both
endpoints. `lib/assistant-workspace.ts` adds a guide, scoped reads, partial
lead-magnet edits and an allowlisted action dispatcher. It reuses existing API
handlers for validation, rate limits, version history, email automation and
integration behavior. Only after validating the workspace grant may it enter
`assistantWorkspaceContext`, a server-only AsyncLocalStorage account context.
Never accept account identity, arbitrary route names or auth headers from tool
arguments. Cookie authentication remains unchanged outside this context.

Chat edits read the current magnet/account and supply its content hash. The
existing save locks recheck that hash before writing. Partial changes preserve
unrequested fields, provider IDs, A/B completion state and active follow-up runs.
Follow-up changes require explicit opt-in. Live edits, global settings, deletion,
sequence sending/stopping and external test messages require explicit user
instruction represented by confirmation flags. Creation retains the shared
10-per-24-hour limit. Version restoration preserves current publication state
and must still pass published-page validation.

Workspace reads include old/manual pages, paginated signups, filtered CSV links,
resource links, version history, analytics and aggregate quiz data. Native chat
analyses the quiz data without paid server inference. Passwords, API keys,
provider OAuth and account deletion use authenticated browser handoffs; tools
must not claim those handoffs completed. Website branding returns review details
and a logo image; applying re-fetches and verifies the suggestion digest and
account brand version before using the real logo bytes. Public resource tokens
are intentional download access; private Blob URLs and credentials are redacted.

Run `test:workspace-mcp` plus the legacy `test:campaign-mcp` suite against the
isolated localhost:55439/magnets_staging_test database and mock-email server.
These tests must never run against customer databases. The workspace suite checks
OAuth audience containment, consent, cross-account denial, legacy edits,
concurrent save conflicts, live confirmation, restoration, follow-up editing,
signup import/export/deletion, settings preservation and credential redaction.

### Dashboard headings and marketing share artwork

Dashboard overview pages use one `PageHeader` title and short description. Do not
add a second hero/library heading that restates the page title. Keep meaningful
section labels (such as Identity, Uploaded files, and Change password) and place
primary page actions in the header.

Marketing Open Graph and Twitter images share `lib/site-social.ts` and the
1200 x 630 `public/brand/magnets-social-v2.png` artwork. Its editable source is
`scripts/assets/magnets-social-card.html`, using the official logo and Geist.
Keep customer page metadata in `lib/lead-magnet-metadata.ts` independent so
customer pages continue sharing their own title, brand, and image.

Assistant campaigns start with no page image. Never substitute an automatic
orange template cover. A saved `cover_data` image remains optional and is shown
only after upload/assistant attachment. Older empty campaign covers are omitted
at read time through `withoutPlaceholderCovers`; this must not migrate or erase
customer image URLs. Keep no-image public pages and resource/library cards compact.
Cover endpoints return 404 when no actual artwork exists.

Published lead-magnet layout sizing lives in
`components/lead-magnet-page-view.module.css`. Use available viewport height
(`svh`) to bound optional artwork and spacing on short laptops. Keep the form
before optional artwork on narrow screens, readable input sizes, and natural
scrolling for long content or zoom. Never force a fixed-height page, clip copy,
or scale the whole page to fit. Check both the initial form and its confirmation.

Keep public-page headline, subtitle, description and bullets in one independent
desktop copy column. Do not split them into grid rows spanning the media/form
column: tall artwork or confirmation content must never stretch text spacing.

The Help centre starts with the assistant-led flow (idea and brand, connect, create
in chat, automatic publication, manage in Magnets). Keep manual creation as an
alternative and existing operational guides searchable. Connection help links to
the shared visual guide on Home instead of duplicating provider setup screens.
Document delivery-only as a valid choice, explicit optional follow-ups, and the
difference between a live signup page and a hosted-resource download link.

Assistant dashboard panels, connection/setup simulations, brand import, resource
readers and tour dialogs use the shared --studio-* palette in app/globals.css.
Portals inherit it from html. Light dashboard mode must include the illustrations,
secondary actions and all dialog states, not just the page background. Dark entry
screens keep their route canvas; customer landing-page brand colours stay separate.

### Magnets-owned dark surfaces

Use brand black `#111111` for the landing, authentication, onboarding and dashboard dark canvas. Cards, dialogs and assistant simulations use neutral charcoal layers through `--studio-*`; do not reintroduce brown surfaces or large orange background washes. Keep brand orange in controls, artwork and small highlights. Match the pre-hydration canvas, loading and overscroll colours. Light-mode workspace surfaces and customer-selected public page colours remain independent.

The Customise page explanation uses `reveal` steps to expand the target’s ancestor disclosure panels. The tour restores previously closed panels on step changes and exit, preserving panels the user already opened. It must never click setup, DNS verification, test-send or integration-connect controls, or mutate account settings. Explain custom domains, sender setup and each optional connector separately; keep Substack’s best-effort limitation explicit.

### Assistant graphics without file transfer

`preview_campaign_graphic` accepts bounded, allowlisted SVG drawing source and returns a PNG MCP image plus sourceHash without saving it. `attach_campaign_graphic` requires the same source hash, current brandVersion and explicit live-edit permission, then reuses `attachCampaignCover` and its transaction/ownership checks. This is the preferred Claude path when container files cannot be passed into MCP calls. Never ask the model to transcribe large base64 data or silently replace an approved raster image with a different graphic.
`lib/campaign-graphic.ts` reconstructs an allowlisted drawing with saxes, rejecting DTDs, entities, scripts, CSS, external resources, embedded images, filters and executable markup. Text uses bundled Geist glyph paths; SVG is never persisted or served. Size, depth, element, output and render-time limits bound work. `/mcp` and `/mcp/workspace` must include the campaign font in their deployment traces. No paid AI call, database migration or production deployment is needed.

### Grouped dashboard settings

The sidebar keeps Home (when enabled), Lead magnets, Hosted resources and Signups visible. Customise, Brand and Account live under the keyboard-accessible Settings disclosure. It expands on settings routes and resets on navigation; keep existing routes and setup gates unchanged. Help remains a top-level action. The ChatGPT setup opening link copies the workspace MCP URL while opening setup in a new tab; clipboard failures keep manual copying available and must never imply a completed connection.

Assistant setup uses four focused screens: open, add details, approve, ready. Claude opens the supported `/customize/connectors?modal=add-custom-connector&connectorName=Magnets&connectorUrl=...` shortcut; it prefills the name and workspace URL but never approves access. Keep a manual copy fallback for sign-in redirects or clients that drop those parameters. ChatGPT opens Plugins, copies the workspace URL, and retains guided manual setup. Visible guides poll the account-scoped connection endpoint every five seconds with an eight-second timeout, plus focus/visibility checks; stop polling after a current workspace grant is found. A grant confirms account authorisation, not that the provider finished installation or enabled Magnets in chat, so the ready screen explains that last step. Returning creation users recheck their grant and skip setup when valid. Per-provider, per-origin v2 instruction progress expires after 24 hours and clears on connection/completion; it never substitutes for server confirmation. No directory submission, extension, or paid AI service is involved.

Claude creation buttons use `claudeCreateUrl` to open `/new?q=...` with an unsent starter message. Onboarding and saved-idea dashboard entry use the shared `SAVED_LEAD_MAGNET_PROMPT`; dashboard creation without a saved idea uses a generic new-resource prompt. Only these fixed messages enter external URLs, never the stored brief, branding or credentials. The link does not enable a connector or submit the message. Keep explicit enable-Magnets/press-Enter instructions. The final onboarding handoff has one action: open the assistant in a new tab, then replace the Magnets tab with Dashboard Home. Do not add separate Copy, Continue or dashboard actions to this screen. ChatGPT's existing mention-prefill behaviour is unchanged.

The “Explain this page” tour button appears only on Dashboard Home (`/dashboard/home`). Do not add it to onboarding, creation, campaign review or other dashboard pages. The sidebar Help centre remains available throughout the dashboard.

### Campaign completion without generated posts

Do not generate or display promotional launch posts. Campaign creation/edit schemas omit `linkedinPost`; legacy stored values are stripped at read boundaries without a migration or rewriting customer records. Both MCP endpoints share `CAMPAIGN_COMPLETION_GUIDANCE`: successful creation/publication returns the live URL, clearly states the page is live, offers to improve it together in chat, and invites the creator to write their own post and capture emails. Automatic publication remains enabled. Do not ask whether an already-live page is ready to publish or introduce a draft approval gate. Requested improvements use get_campaign/update_campaign with current editVersion and explicit live-edit permission, never a duplicate save_campaign. Do not include generated promotional copy, extra links or unrelated questions in that completion. After automatic publication, ask once whether they want any fields beyond Name and Email, unless already specified or declined. Use the existing versioned campaign/workspace field edits for addition, placement, dropdown option changes and removal. Previous submissions retain their original labels and values. Also offer an optional image in ChatGPT or branded graphic in Claude, unless artwork already exists or the user declined it. This offer never blocks publication; refresh current branding before generation and retain the existing preview/attachment permission rules. Preserve draft/error guidance when publication fails, and keep editor/audience links available on request.


### Production release configuration

The owner explicitly authorized this production release on 2026-11-24. The
staging-only build script remains restricted to its existing preview project;
never use it as the production build command. Use the normal production build
and run `pnpm check:production-config` with the production environment first.
Keep `MAGNETS_CREATION_ENABLED=1`, `MAGNETS_ASSISTANT_ORIGIN=https://magnets.so`,
and `NEXT_PUBLIC_SITE_URL=https://magnets.so`; no staging/read-only flags may be
enabled. Preserve existing encryption keys. Staging OAuth grants remain scoped
to staging, so users must connect to the production MCP endpoint separately.

`NEXT_PUBLIC_MAGNETS_IMAGE_BLOB_ACCESS` must match the image store access mode.
The existing production image store is private, separate from the private hosted
resource store. Image upload controls share `IMAGE_BLOB_ACCESS`; private images
continue through the existing logo, magnet-image and email-image proxies. Never
change a store's privacy or move customer files to work around upload mismatches.
`pnpm test:production-config` verifies configuration mistakes without contacting
services. `pnpm test:follow-up-upgrade` covers the production post-build failure
policy without touching real automations. Local QA artifacts under `.data` are
excluded from lint and deployments.

ChatGPT creation links prefill the full starter message using `prompt`, with the
same saved-idea distinction as Claude. Do not prefill `@mag` or imply that URL
text opens the app picker or selects Magnets. The handoff instructs users to
select Magnets through ChatGPT's + menu before sending. No automatic consent
or automatic message submission is claimed.

In visual staging, Home, Lead magnets, and the editor for one fixed sample ID use their normal dashboard URLs and components with fictional data. Field edits are in memory only. The previous standalone signup-fields demo redirects to Home. Keep all other customer routes and API mutations behind the staging guard.

The shared campaign writing guide includes original paired landing-page and delivery-email examples. For both chat clients, optional page.signupFields are configured through normal versioned campaign and workspace tools. IDs survive renames. The landing-page editor shows dropdown choices as individual rows with an Add option control and saves their order in the existing choices array. Use signupFormRows for both the public form and builder. Custom questions can precede Name or Email using the optional before property and otherwise follow Email. The Position selector on add/edit and the drag handle both use this order. Reordering must preserve field IDs and answers. Public submissions validate against the current magnet before sending mail and store answer labels and values together. Design previews stay read-only. Apply migration 0036 before enabling functional code connected to a database.
