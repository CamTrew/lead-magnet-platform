# Lead Magnet Platform

A Next.js 15 platform for creating configurable lead magnet landing pages at scale.

The current build uses a local file-backed Neon-shaped stub for auth, account settings, uploads, lead magnets, and submissions. It is designed so the data layer can be swapped for Neon DB and Neon Auth later.

## What It Does

- Forces `/` to `/login`
- Creates a stub Neon Auth session from the login screen
- Lets each account configure:
  - domain and subdomain preference, with `get` as the recommended default
  - DNS records for publishing lead magnet pages on that subdomain
  - logo upload
  - text logo fallback
  - primary, accent, and success colors
  - managed email sender address and DNS records
  - Beehiiv API key and publication ID
- Lets users create lead magnet pages using the same fields as the original Airtable setup
- Renders public pages at `/slug` locally and supports future custom-domain routing for `get.<domain>/<slug>`
- Sends lead magnet emails through the platform Resend key when configured
- Adds subscribers to the user's Beehiiv list when Beehiiv settings are present

## Local Development

```bash
pnpm install
pnpm dev
```

Open:

```txt
http://localhost:3000/login
```

Main app routes:

```txt
/dashboard
/dashboard/pages
/<lead-magnet-slug>
```

The local stub database is stored at:

```txt
.data/lead-magnet-platform.json
```

That file is ignored by git.

Email sending is platform-managed. Set one of these environment variables when you want local submissions to send real email:

```txt
PLATFORM_RESEND_API_KEY=...
```

`RESEND_API_KEY` is also accepted as a local fallback.

## Lead Magnet Fields

Each page uses the original Airtable-era fields:

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

`email_body` supports `{name}` and `{download_link}`.

## Future Neon Swap

The boundary is `lib/platform-store.ts` and `lib/auth.ts`. Replace those with Neon DB/Auth calls while keeping the API routes and UI contracts intact.
