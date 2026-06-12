# Implementation Notes

## Data

The local version uses `.data/lead-magnet-platform.json` as a stand-in for Neon.

Core tables to create later:

- `users`
- `accounts`
- `lead_magnets`
- `submissions`

## Domains

Each account stores a future-ready custom domain shape:

- `domain`
- `subdomain`

For the current UI, users only choose the subdomain. The default subdomain is `get`.

Later custom-domain URLs can look like:

```txt
https://get.example.com/ai-pipeline-playbook
```

When custom-domain setup is added, suggested DNS records can be:

```txt
CNAME get -> cname.vercel-dns.com
TXT _lead-magnet.get -> lmp_verify_<account_id>
```

## Integrations

Each account supplies its own:

- Resend API key
- Resend verified sender
- Beehiiv API key
- Beehiiv publication ID

If a key is missing locally, that integration is skipped.
