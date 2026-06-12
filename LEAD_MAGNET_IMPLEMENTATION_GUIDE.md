# Implementation Notes

## Data

The local version uses `.data/lead-magnet-platform.json` as a stand-in for Neon.

Core tables to create later:

- `users`
- `accounts`
- `lead_magnets`
- `submissions`

## Domains

Each account stores the custom domain shape used by the dashboard:

- `domain`
- `subdomain`

Users choose the domain and subdomain. The recommended default subdomain is `get`.

Custom-domain URLs can look like:

```txt
https://get.example.com/ai-pipeline-playbook
```

The dashboard shows page publishing records:

```txt
CNAME get -> cname.vercel-dns.com
TXT _lead-magnet.get -> lmp_verify_<account_id>
```

## Integrations

Email is platform-managed. Users do not need their own Resend account or API key.

Platform email configuration:

- `PLATFORM_RESEND_API_KEY`
- fallback: `RESEND_API_KEY`

Each account supplies:

- sender email address
- email DNS records for the sending domain
- Beehiiv API key
- Beehiiv publication ID

If a key is missing locally, that integration is skipped.
