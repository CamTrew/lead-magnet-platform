# Implementation notes

## Data

Neon Postgres with Drizzle migrations.

Core app-owned tables (all in `public`):

- `public.magnets_accounts`
- `public.magnets_auth_credentials`
- `public.magnets_lead_magnets`
- `public.magnets_rate_limits`
- `public.magnets_submissions`

Schema source: `db/schema.ts`. SQL migrations: `db/migrations`.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:check
```

Indexes include per-account signup dedup on `(account_id, lower(email))`, used by `listAccountSignups`.

## Required env vars

```txt
DATABASE_URL="postgresql://..."
MAGNETS_ENCRYPTION_KEY="long random value"
```

`MAGNETS_ENCRYPTION_KEY` encrypts every stored integration secret (Resend, Beehiiv). Required in production.

Optional in production:

```txt
NEXT_PUBLIC_SITE_URL="https://magnets.so"
VERCEL_API_TOKEN="..."
VERCEL_PROJECT_ID="prj_..."
VERCEL_TEAM_ID="team_..."
```

Without the Vercel vars, customer-domain attach silently no-ops and a human has to add each domain to the Vercel project by hand.

## Domains

Per account: `domain` (root) + `subdomain` (default `get`).

Customer-facing URLs:

```txt
https://get.example.com/<slug>
```

Platform fallback URL (always works, even before DNS is set up):

```txt
https://magnets.so/p/<lead-magnet-uuid>
```

Dashboard publishing records:

```txt
CNAME <subdomain> -> cname.vercel-dns.com
TXT  _magnets.<subdomain> -> magnets_verify_<account_id>
```

Sending DNS (DKIM/SPF/DMARC) is fetched live from the user's own Resend account when they hit "Check DNS" in Delivery. Generic preview values are shown until then.

## Integrations

Bring-your-own. The platform never resells email or newsletter access.

Each account supplies in the dashboard:

- Sender email address.
- Resend API key (required to actually send email).
- Beehiiv API key + publication ID (optional).
- Substack publication subdomain (optional).
- Email DNS records for the sending domain (Resend-generated, verified live).

Submit flow (`app/api/submit/route.ts`):

1. Rate-limit by IP and by (lead-magnet, email).
2. Look up the published lead magnet.
3. `sendLeadMagnetEmail` via Resend with the account's key. If the key is empty, no-op.
4. Best-effort: `addToBeehiiv` if Beehiiv is configured.
5. Best-effort: `addToSubstack` if a Substack publication is set.
6. `recordSubmission` regardless.

Best-effort failures are logged via `lib/logger.ts` (which redacts API keys) but never block the response.

## Access control

Three layers, all required:

1. `middleware.ts` — edge gate. Redirects `/dashboard/*` to `/login?next=...` and returns 401 JSON for non-public `/api/*` if there is no session cookie.
2. `requireDashboardPayload()` — per-route gate. Re-verifies the session against the DB.
3. `isSetupComplete()` from `lib/setup.ts` — gates `/dashboard/pages`, `/dashboard/signups`, and `POST /api/lead-magnets` until the account has a valid domain, subdomain, sender, and Resend key.

## Logging and PII

Use `log.info/warn/error` from `lib/logger.ts` in API routes. The logger emits one JSON line per call and redacts:

- Any string matching `re_[A-Za-z0-9_-]{8,}` (Resend keys).
- Any string matching `Bearer ...`.
- Object fields named `password`, `passwordHash`, `token`, `sessionToken`, `cookie`, `authorization`, `resendApiKey`, `beehiivApiKey`, `apiKey`, `api_key`.

Pass errors via `extra: { error: err }` so the redactor walks them. Never `console.log` a request body.

## Logo upload

`lib/upload.ts::validateLogoDataUrl`:

- Allowed MIME: PNG / JPG / WebP / GIF.
- SVG is rejected (XSS via embedded scripts).
- 1 MB cap.
- Magic-byte check confirms the file matches the claimed MIME.

The dashboard mirrors the check client-side. Treat the server check as authoritative.

## Signup import

`POST /api/signups/import`:

- `{ type: 'manual', leadMagnetId, name, email }` for single rows.
- `{ type: 'csv', leadMagnetId, csv, hasHeader, emailColumn, nameColumn }` for bulk.
- Limits: 2 MB CSV body, 5,000 rows per request.
- Email validated by regex; duplicates within the batch are dropped before insert.
- Bulk insert via `bulkRecordSubmissions` (single CTE round-trip).

The dashboard column-mapping UI starts with the dropdowns empty — the user picks Email column and (optionally) Name column. No auto-guessing.
