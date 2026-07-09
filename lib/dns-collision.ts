import { promises as dns, Resolver as CallbackResolver } from 'node:dns';
import { promisify } from 'node:util';

export type SubdomainStatus = {
  label: string;
  fullHost: string;
  clear: boolean;
  collisions: string[];
};

/**
 * Preference order for the sender-DNS subdomain. `lead` first because it's
 * branded and unlikely to collide with anything someone already has. `magnets`
 * second as a branded fallback. The rest are neutral and progressively less
 * common as conflicts.
 */
const DEFAULT_CANDIDATES = ['lead', 'magnets', 'mail', 'e', 'news', 'marketing'] as const;

type ResolverFn = (host: string) => Promise<unknown>;

function tryResolver(servers: string[] | null) {
  const resolver = new CallbackResolver();
  if (servers) resolver.setServers(servers);
  return {
    resolveCname: promisify(resolver.resolveCname.bind(resolver)) as ResolverFn,
    resolveMx: promisify(resolver.resolveMx.bind(resolver)) as ResolverFn,
    resolveTxt: promisify(resolver.resolveTxt.bind(resolver)) as ResolverFn,
    resolveA: promisify(resolver.resolve4.bind(resolver)) as ResolverFn,
  };
}

function isMissing(err: unknown) {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    ['ENODATA', 'ENOTFOUND', 'ENOTIMP'].includes(String(err.code))
  );
}

async function probeOne(label: string, domain: string): Promise<SubdomainStatus> {
  const fullHost = `${label}.${domain}`;
  // Probe the host itself AND `send.<host>` (Resend's MX prefix) so we catch
  // pre-existing return-path setups too.
  const checks = [fullHost, `send.${fullHost}`, `resend._domainkey.${fullHost}`];
  const collisions: string[] = [];

  // Use 1.1.1.1 / 8.8.8.8 directly so we don't trust libuv's cached state.
  // If those resolvers can't be reached we fall back to the system path.
  const queryFor = async (h: string, kind: 'CNAME' | 'MX' | 'TXT' | 'A') => {
    const upstream = tryResolver(['1.1.1.1', '8.8.8.8']);
    const fn =
      kind === 'CNAME' ? upstream.resolveCname
      : kind === 'MX' ? upstream.resolveMx
      : kind === 'TXT' ? upstream.resolveTxt
      : upstream.resolveA;
    try {
      const result = await fn(h) as unknown[];
      return Array.isArray(result) && result.length > 0;
    } catch (err) {
      if (isMissing(err)) return false;
      // Fall back to system resolver if upstream fails (rare).
      try {
        const sys =
          kind === 'CNAME' ? await dns.resolveCname(h)
          : kind === 'MX' ? await dns.resolveMx(h)
          : kind === 'TXT' ? await dns.resolveTxt(h)
          : await dns.resolve4(h);
        return Array.isArray(sys) && sys.length > 0;
      } catch (sysErr) {
        if (isMissing(sysErr)) return false;
        // We genuinely couldn't tell. Treat as "unknown but probably clear"
        // rather than block — the verify step later catches real failures.
        return false;
      }
    }
  };

  for (const h of checks) {
    const [hasA, hasMx, hasTxt, hasCname] = await Promise.all([
      queryFor(h, 'A'),
      queryFor(h, 'MX'),
      queryFor(h, 'TXT'),
      queryFor(h, 'CNAME'),
    ]);
    if (hasA) collisions.push(`${h} (A record)`);
    if (hasMx) collisions.push(`${h} (MX record)`);
    if (hasTxt) collisions.push(`${h} (TXT record)`);
    if (hasCname) collisions.push(`${h} (CNAME record)`);
  }

  return {
    label,
    fullHost,
    clear: collisions.length === 0,
    collisions,
  };
}

/**
 * Probe a candidate list and return all of them with their status. Caller
 * decides which one to pick — usually the first `clear` one in preference
 * order, with a manual override available.
 */
export async function probeSubdomains(
  domain: string,
  candidates: readonly string[] = DEFAULT_CANDIDATES
): Promise<SubdomainStatus[]> {
  const cleanDomain = domain.trim().toLowerCase();
  if (!cleanDomain) return [];
  return Promise.all(candidates.map((label) => probeOne(label, cleanDomain)));
}

/**
 * Has the user already set up a DMARC policy at the apex? We must not show
 * "add this DMARC record" if they have one — replacing it would silently
 * remove their existing policy. Returns the existing values so we can show
 * them what they have.
 */
export async function probeApexDmarc(domain: string): Promise<string[]> {
  const cleanDomain = domain.trim().toLowerCase();
  if (!cleanDomain) return [];
  try {
    const records = (await dns.resolveTxt(`_dmarc.${cleanDomain}`)) as string[][];
    return records.map((parts) => parts.join('').trim()).filter(Boolean);
  } catch (err) {
    if (isMissing(err)) return [];
    return [];
  }
}

export const SUBDOMAIN_CANDIDATES = DEFAULT_CANDIDATES;
