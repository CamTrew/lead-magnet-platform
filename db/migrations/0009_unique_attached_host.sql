CREATE UNIQUE INDEX IF NOT EXISTS "magnets_accounts_attached_host_unique"
  ON "magnets_accounts" (lower("domain_attached_host"))
  WHERE "domain_attached_host" <> '';
