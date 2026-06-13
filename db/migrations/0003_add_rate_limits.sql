create table if not exists public.magnets_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_start timestamptz not null default now(),
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint magnets_rate_limits_pkey primary key (scope, identifier_hash)
);
--> statement-breakpoint
create index if not exists magnets_rate_limits_scope_window_idx
  on public.magnets_rate_limits (scope, window_start);
--> statement-breakpoint
create index if not exists magnets_rate_limits_updated_at_idx
  on public.magnets_rate_limits (updated_at);
--> statement-breakpoint
drop trigger if exists set_magnets_rate_limits_updated_at on public.magnets_rate_limits;
--> statement-breakpoint
create trigger set_magnets_rate_limits_updated_at
before update on public.magnets_rate_limits
for each row execute function public.set_magnets_updated_at();
