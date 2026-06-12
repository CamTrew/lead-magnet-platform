# Lead Magnet Platform

A Next.js 15 platform for creating configurable lead magnet landing pages at scale.

The current build uses a local file-backed Neon-shaped stub for auth, account settings, uploads, lead magnets, and submissions. It is designed so the data layer can be swapped for Neon DB and Neon Auth later.

## What It Does

- Forces `/` to `/login`
- Creates a stub Neon Auth session from the login screen
- Lets each account configure:
  - workspace name
  - custom domain and subdomain, with `get` as the default
  - logo upload
  - primary, accent, and success colors
  - Resend API key and verified sender
  - Beehiiv API key and publication ID
- Lets users create lead magnet pages using the same fields as the original Airtable setup
- Renders public pages at `/slug` locally and `https://get.customer-domain.com/slug` when the host matches an account
- Sends lead magnet emails through the user's Resend key
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

The local stub database is stored at:

```txt
.data/lead-magnet-platform.json
```

That file is ignored by git.

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
