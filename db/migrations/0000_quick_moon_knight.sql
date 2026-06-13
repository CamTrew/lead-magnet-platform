create table if not exists public.magnets_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references neon_auth."user"(id) on delete cascade,
  subdomain text not null default 'get',
  domain text not null default '',
  logo_url text not null default '',
  logo_text text not null default '',
  brand jsonb not null default '{"primary":"#8b76e8","accent":"#d8c8ff","success":"#22c55e"}'::jsonb,
  resend_from_email text not null default '',
  beehiiv_api_key text not null default '',
  beehiiv_publication_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create table if not exists public.magnets_auth_credentials (
  user_id uuid primary key references neon_auth."user"(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create table if not exists public.magnets_lead_magnets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.magnets_accounts(id) on delete cascade,
  slug text not null,
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  bullets jsonb not null default '[]'::jsonb,
  bullets_heading text not null default '',
  cta_text text not null default 'Get the guide',
  form_heading text not null default '',
  form_subtext text not null default '',
  image_url text not null default '',
  download_link text not null default '',
  email_subject text not null default '',
  email_body text not null default '',
  email_preview text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create table if not exists public.magnets_submissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.magnets_accounts(id) on delete cascade,
  lead_magnet_id uuid not null references public.magnets_lead_magnets(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
alter table public.magnets_accounts
  alter column subdomain set default 'get',
  alter column domain set default '',
  alter column logo_url set default '',
  alter column logo_text set default '',
  alter column brand set default '{"primary":"#8b76e8","accent":"#d8c8ff","success":"#22c55e"}'::jsonb,
  alter column resend_from_email set default '',
  alter column beehiiv_api_key set default '',
  alter column beehiiv_publication_id set default '';
--> statement-breakpoint
create unique index if not exists magnets_accounts_owner_user_id_unique
  on public.magnets_accounts (owner_user_id);
--> statement-breakpoint
create index if not exists magnets_accounts_domain_idx
  on public.magnets_accounts (domain);
--> statement-breakpoint
create index if not exists magnets_accounts_domain_subdomain_idx
  on public.magnets_accounts (domain, subdomain);
--> statement-breakpoint
create index if not exists magnets_accounts_lower_domain_idx
  on public.magnets_accounts (lower(domain))
  where domain <> '';
--> statement-breakpoint
create index if not exists magnets_accounts_lower_host_idx
  on public.magnets_accounts (lower(subdomain || '.' || domain))
  where domain <> '';
--> statement-breakpoint
create index if not exists magnets_accounts_updated_at_idx
  on public.magnets_accounts (updated_at desc);
--> statement-breakpoint
create unique index if not exists magnets_lead_magnets_account_slug_unique
  on public.magnets_lead_magnets (account_id, slug);
--> statement-breakpoint
create index if not exists magnets_lead_magnets_account_updated_idx
  on public.magnets_lead_magnets (account_id, updated_at desc);
--> statement-breakpoint
create index if not exists magnets_lead_magnets_slug_idx
  on public.magnets_lead_magnets (slug);
--> statement-breakpoint
create index if not exists magnets_lead_magnets_public_lookup_idx
  on public.magnets_lead_magnets (account_id, slug)
  where published = true;
--> statement-breakpoint
create index if not exists magnets_lead_magnets_published_slug_idx
  on public.magnets_lead_magnets (slug, updated_at desc)
  where published = true;
--> statement-breakpoint
create index if not exists magnets_lead_magnets_account_id_idx
  on public.magnets_lead_magnets (account_id, id);
--> statement-breakpoint
create index if not exists magnets_submissions_account_created_idx
  on public.magnets_submissions (account_id, created_at desc);
--> statement-breakpoint
create index if not exists magnets_submissions_lead_magnet_created_idx
  on public.magnets_submissions (lead_magnet_id, created_at desc);
--> statement-breakpoint
create index if not exists magnets_submissions_account_email_idx
  on public.magnets_submissions (account_id, lower(email));
--> statement-breakpoint
create index if not exists magnets_submissions_email_idx
  on public.magnets_submissions (email);
--> statement-breakpoint
create or replace function public.set_magnets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
--> statement-breakpoint
drop trigger if exists set_magnets_accounts_updated_at on public.magnets_accounts;
--> statement-breakpoint
create trigger set_magnets_accounts_updated_at
before update on public.magnets_accounts
for each row execute function public.set_magnets_updated_at();
--> statement-breakpoint
drop trigger if exists set_magnets_auth_credentials_updated_at on public.magnets_auth_credentials;
--> statement-breakpoint
create trigger set_magnets_auth_credentials_updated_at
before update on public.magnets_auth_credentials
for each row execute function public.set_magnets_updated_at();
--> statement-breakpoint
drop trigger if exists set_magnets_lead_magnets_updated_at on public.magnets_lead_magnets;
--> statement-breakpoint
create trigger set_magnets_lead_magnets_updated_at
before update on public.magnets_lead_magnets
for each row execute function public.set_magnets_updated_at();
