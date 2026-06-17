CREATE UNIQUE INDEX IF NOT EXISTS magnets_accounts_attached_host_unique
  ON public.magnets_accounts (lower(domain_attached_host))
  WHERE domain_attached_host <> '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS magnets_lead_magnets_public_lookup_idx
  ON public.magnets_lead_magnets (account_id, slug)
  WHERE published = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS magnets_lead_magnets_published_slug_idx
  ON public.magnets_lead_magnets (slug, updated_at DESC)
  WHERE published = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS magnets_lead_magnets_account_id_idx
  ON public.magnets_lead_magnets (account_id, id);
