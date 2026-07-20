# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Canonical maintainer context:** read `AGENTS.md` completely before changing code. It contains the current product invariants, signup ordering, email storage protocol, editor compatibility rules, hosted-resource security model, analytics constraints, copilot memory rules, integration behavior, and deployment checklist. `AGENTS.md` is the source of truth when this older compatibility file disagrees.

## Commands

Package manager is **pnpm**. Node + Next 15 (App Router) on React 19, Geist font, Tailwind 3.4 with a neutral `ink-*` palette (defined in `tailwind.config.ts`).

```bash
pnpm dev            # next dev — http://localhost:3000
pnpm build          # next build
pnpm start          # production server
pnpm lint           # eslint . (flat config in eslint.config.mjs)

pnpm db:generate    # drizzle-kit generate — regenerate SQL after editing db/schema.ts
pnpm db:migrate     # drizzle-kit migrate — apply pending migrations to DATABASE_URL
pnpm db:check       # drizzle-kit check — validate snapshots vs migrations
pnpm db:studio      # drizzle-kit studio
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

Per-account Resend/Beehiiv API keys are stored encrypted on `magnets_accounts` and supplied by the user via the dashboard. There is **no** platform-wide Resend env var.

## Architecture

### Data boundary

All DB access goes through `lib/platform-store.ts` and `lib/auth.ts`. Routes/components do not call `lib/db.ts` directly. New persistence work belongs in `platform-store.ts` against the Drizzle schema in `db/schema.ts`, not ad-hoc SQL elsewhere.

`lib/db.ts` exposes a singleton `pg.Pool` (stored on `globalThis` to survive HMR) and a `query()` helper. Most of `platform-store.ts` uses raw SQL via `query()` rather than the Drizzle query builder, with multi-CTE statements that insert-then-select to keep operations atomic (`getDashboardBase*`, `createUserWithPasswordSession`, `bulkRecordSubmissions`).

User identity lives in **`neon_auth."user"` and `neon_auth.session`** (Neon Auth) — queried directly by `platform-store.ts`, **not** modeled in `db/schema.ts`. The app-owned tables in `public` are all prefixed `magnets_`:

- `magnets_accounts` — one row per user (`owner_user_id` unique). Brand, domain/subdomain, sender email, encrypted Resend/Beehiiv keys, Substack publication.
- `magnets_auth_credentials` — password hashes keyed by `user_id`.
- `magnets_lead_magnets` — the published pages.
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
3. **`isSetupComplete(account)`** from `lib/setup.ts` — gates `/dashboard/pages`, `/dashboard/signups`, and `POST /api/lead-magnets` until the user has set domain, subdomain, sender email, and a Resend API key. Pages without these redirect to `/dashboard?setup=incomplete`. The sidebar dims the gated items via the `setupComplete` prop on `DashboardLayoutShell`.

### Routing layout

App Router under `app/`:

- `app/page.tsx` — marketing landing. Has `Organization`/`WebSite`/`SoftwareApplication` JSON-LD.
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
- `app/api/dns/verify` — DNS check. For `publishing` it builds the page CNAME/TXT and resolves via `node:dns/promises`. For `delivery` it calls Resend's domains API with the **user's** key, fetches their actual records (DKIM included), then verifies them.
- `app/api/vercel/status` — exposes Vercel domain attach/verification status for the dashboard.

### Email + integrations

`lib/resend.ts::sendLeadMagnetEmail` uses `account.resendApiKey`. Missing key → no-op with `{ id: 'local-preview' }` so dev still works without errors. Every email ends with a hardcoded footer link to magnets.so.

`lib/beehiiv.ts::addToBeehiiv` and `lib/substack.ts::addToSubstack` are best-effort and called after the email send in `app/api/submit/route.ts`. Errors are logged via `lib/logger.ts` but never block the response. Substack uses the undocumented `/api/v1/free` subscribe endpoint — fragile by design; the dashboard warns users about this in the help tooltip.

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

## Deployment (Vercel)

1. Set env vars listed above (`DATABASE_URL`, `MAGNETS_ENCRYPTION_KEY`, optionally `NEXT_PUBLIC_SITE_URL`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`).
2. Run `pnpm db:migrate` against the production `DATABASE_URL` before the first deploy serves traffic. There is no auto-migration on boot.
3. Attach the platform's own domain (e.g. `magnets.so`) to the Vercel project manually. After that, customer domains attach automatically via `syncProjectDomain` when they save the account.
4. The `pg` pool max is 5 per serverless instance, which is fine for Neon. If you ever see connection exhaustion, switch to Neon's serverless driver — not a Pool change.
