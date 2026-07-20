# Magnets

A Next.js 15 platform for building branded lead-magnet landing pages — free, on your own domain, with your own sender and newsletter integrations.

The current build uses Neon Postgres for accounts, credentials, lead-magnet pages, and submissions. Drizzle owns the app schema and migrations.

## What it does

- Email/password registration and login (Neon Auth).
- Each account configures, once:
  - Root domain + subdomain (default `get`).
  - Page DNS records (CNAME to Vercel + a verification TXT).
  - Logo image (PNG/JPG/WebP/GIF, 1 MB cap, SVG blocked) or fallback logo text.
  - Brand colors (primary, accent, success).
  - Sender email + Resend API key (required for sending).
  - Beehiiv API key + publication ID (optional).
  - Substack publication subdomain (optional).
  - Kit OAuth connection (optional).
  - Zapier Catch Hook URL (optional).
- Setup is enforced — Pages and Signups unlock only when domain, subdomain, sender, and Resend key are all set.
- Lead-magnet pages are edited inline (WYSIWYG) at `/dashboard/pages/[id]`.
- Hosted resources can be uploaded to private Vercel Blob storage, managed in
  an account-only card library, and shared through revocable unguessable links.
- Each magnet has lightweight conversion analytics for anonymous visits,
  successful form conversions, conversion rate, average engaged time, and
  configuration-aware post-signup video plays and quiz completions.
- Each page is published at:
  - `https://<subdomain>.<root-domain>/<slug>` — branded URL, served via Vercel + the customer's DNS.
  - `https://magnets.so/p/<uuid>` — platform fallback URL that works regardless of DNS status (always live, works locally too).
- Signups dashboard:
  - Deduped list of every signup across every magnet on the account.
  - CSV export.
  - Manual add (single row).
  - CSV import with explicit column mapping (no AI guessing).
- Email delivery via the account's own Resend key. Optional Beehiiv, Substack, Kit, Slack, Pipedrive, and Zapier forwarding.
- Vercel domain attach/detach is automated via the Vercel Projects-Domains API when env vars are set.

## Local development

```bash
pnpm install
pnpm dev
```

Open:

- Marketing: `http://localhost:3000`
- Login: `http://localhost:3000/login`
- Dashboard: `http://localhost:3000/dashboard`
- Public magnet (platform URL): `http://localhost:3000/p/<lead-magnet-uuid>`
- Public magnet (by slug, when host matches the account's domain): `http://localhost:3000/<slug>` (works in dev by falling back to "any published page with this slug").

## Environment variables

Create `.env.local`:

```txt
DATABASE_URL="postgresql://..."
MAGNETS_ENCRYPTION_KEY="long-random-string"      # `openssl rand -hex 32`
NEXT_PUBLIC_SITE_URL="http://localhost:3000"     # optional; defaults to https://magnets.so
```

Hosted Resource uploads require a separate Vercel Blob store created with
private access and connected to the project. Set its id explicitly so hosted
files can never fall back to the app's public image store:

```txt
HOSTED_RESOURCES_BLOB_STORE_ID="store_..."
```

For Vercel custom-domain auto-attach (optional but recommended in production):

```txt
VERCEL_API_TOKEN="..."
VERCEL_PROJECT_ID="prj_..."
VERCEL_TEAM_ID="team_..."   # only if the project lives on a team account
```

For Kit, create a secure Kit app, enable API access, and configure:

- Authorization URL: `https://magnets.so/api/account/kit/connect`
- Redirect URI: `https://magnets.so/api/account/kit/callback`
- Secure application: enabled

Then set the server-only credentials:

```txt
KIT_CLIENT_ID="..."         # Kit app with API access enabled
KIT_CLIENT_SECRET="..."     # server-only Kit app secret
KIT_REDIRECT_URI="http://localhost:3000/api/account/kit/callback"
```

Per-account Resend and Beehiiv credentials are set by users in the dashboard. Kit uses the supported OAuth authorization-code flow. Its per-account access and refresh tokens, together with secret webhook URLs such as Zapier Catch Hooks, are encrypted with `MAGNETS_ENCRYPTION_KEY`. **In production, the key must be set before any account is saved.**

## Database

Tables (all prefixed `magnets_`, all in `public`):

- `magnets_accounts`
- `magnets_auth_credentials`
- `magnets_lead_magnets`
- `magnets_hosted_resources`
- `magnets_lead_magnet_visits`
- `magnets_rate_limits`
- `magnets_submissions`

Drizzle files:

- `db/schema.ts`
- `db/migrations`
- `drizzle.config.ts`

Common commands:

```bash
pnpm db:generate    # after editing db/schema.ts
pnpm db:migrate     # apply pending migrations against DATABASE_URL
pnpm db:check
pnpm db:studio
```

Indexes cover login lookups, dashboard page lists, public-domain host lookup, unique custom hosts, published page lookup, rate-limit upserts, submission history, and per-account signup dedup (`magnets_submissions_account_email_idx` on `(account_id, lower(email))`).

## Deployment (Vercel)

1. Set the env vars above for Production.
2. Run `pnpm db:migrate` against the production `DATABASE_URL` before the first deploy serves traffic.
3. Attach the platform's own domain (e.g. `magnets.so`) to the Vercel project once manually. After that, customer-owned domains attach automatically on every account save via `lib/vercel.ts::syncProjectDomain`.
4. Customer DNS-only setup (CNAME at the registrar) is **not** enough on Vercel — the domain has to be registered on the Vercel project for Vercel to route to it. That's what the auto-attach does.

## Lead-magnet fields

- `slug`
- `title`
- `subtitle`
- `description`
- `bullets`
- `bullets_heading`
- `cta_text`
- `form_heading`
- `form_subtext`
- `image_url`
- `download_link`
- `email_subject`
- `email_body`
- `email_preview`
- `published`

`email_body` supports `{name}` and `{download_link}`.

## Architecture

- `lib/platform-store.ts` — single DB boundary. Raw SQL via the singleton `pg.Pool` in `lib/db.ts`.
- `lib/auth.ts` — session cookie (`magnets_session`) and `requireDashboardPayload()` for protected pages/APIs.
- `lib/setup.ts` — `setupChecklist()` / `isSetupComplete()` gating Pages and Signups.
- `lib/vercel.ts` — Vercel Projects-Domains API client. Best-effort; missing config is a silent no-op.
- `lib/logger.ts` — structured JSON logger with secret/key redaction. Use instead of `console.*` in API routes.
- `lib/upload.ts` — server-side logo validation (magic bytes + MIME allowlist; SVG blocked).
- `lib/csv.ts` — tiny RFC-4180-ish parser used by the CSV signup import.
- `middleware.ts` — edge auth gate for `/dashboard/*` and non-public `/api/*`, plus security headers.
- `components/lead-magnet-page-view.tsx` — the public lead-magnet renderer. Shared by `app/[slug]/page.tsx` and `app/p/[id]/page.tsx`.

## Logging and security

- Structured logs (`lib/logger.ts`) redact anything that looks like a Resend key (`re_…`), Bearer tokens, and any object field named `password*`, `*Token`, `*ApiKey`, `cookie`, `authorization`.
- The DNS verify route scrubs Resend keys from error messages before returning them to the client.
- Rate limits cover every mutating endpoint plus the public submit endpoint (`lib/rate-limit.ts`, single CTE upsert in `magnets_rate_limits`).
- Logo upload is validated by magic bytes server-side, with SVG rejected and a 1 MB cap.
- Middleware gates `/dashboard/*` and non-public `/api/*`. The public form post (`/api/submit`) and auth endpoints are allowlisted.
