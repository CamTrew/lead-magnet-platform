drop index if exists public.magnets_accounts_lower_host_idx;
--> statement-breakpoint
create unique index if not exists magnets_accounts_lower_host_unique
  on public.magnets_accounts (lower(subdomain || '.' || domain))
  where domain <> '';
