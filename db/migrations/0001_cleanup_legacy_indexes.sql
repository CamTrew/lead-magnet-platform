alter table public.magnets_accounts
  drop constraint if exists magnets_accounts_owner_user_id_key;
--> statement-breakpoint
alter table public.magnets_lead_magnets
  drop constraint if exists magnets_lead_magnets_account_id_slug_key;
