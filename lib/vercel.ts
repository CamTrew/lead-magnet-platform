const API_BASE = 'https://api.vercel.com';

type VercelEnvelope = {
  error?: { code?: string; message?: string };
};

export type VercelDomainStatus = {
  configured: boolean;
  verified: boolean;
  verification: Array<{ type: string; domain: string; value: string; reason: string }>;
  apexName?: string;
  raw?: unknown;
};

export class VercelNotConfigured extends Error {
  constructor() {
    super('Vercel API integration is not configured (missing VERCEL_API_TOKEN or VERCEL_PROJECT_ID).');
    this.name = 'VercelNotConfigured';
  }
}

export class VercelApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'VercelApiError';
    this.status = status;
    this.code = code;
  }
}

function vercelConfig() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!token || !projectId) return null;
  return { token, projectId, teamId };
}

export function isVercelConfigured() {
  return vercelConfig() !== null;
}

function withTeam(url: string, teamId?: string) {
  if (!teamId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}teamId=${encodeURIComponent(teamId)}`;
}

async function readEnvelope(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as VercelEnvelope;
  } catch {
    return null;
  }
}

function isValidHost(host: string) {
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) && host.includes('.');
}

/**
 * Attach a hostname to the Vercel project. Idempotent: returns null silently when Vercel
 * is not configured, when the host is invalid, or when the domain is already attached to
 * this same project. Throws VercelApiError for other failures (domain owned by another
 * project, 401, 429, etc.) so the caller can decide whether to surface the error.
 */
export async function attachDomain(host: string): Promise<VercelDomainStatus | null> {
  const config = vercelConfig();
  if (!config) return null;
  if (!host || !isValidHost(host)) return null;

  const response = await fetch(
    withTeam(`${API_BASE}/v10/projects/${encodeURIComponent(config.projectId)}/domains`, config.teamId),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: host }),
    }
  );

  if (response.ok) {
    return getDomainStatusInternal(host);
  }

  const envelope = await readEnvelope(response);
  const code = envelope?.error?.code;
  const message = envelope?.error?.message || `Vercel responded ${response.status}`;

  // Already attached to *this* project — treat as success.
  if (
    response.status === 409 &&
    (code === 'domain_already_in_use_by_this_project' ||
      code === 'domain_already_in_use' && message.toLowerCase().includes('this project'))
  ) {
    return getDomainStatusInternal(host);
  }

  throw new VercelApiError(response.status, message, code);
}

/**
 * Detach a hostname from the Vercel project. Idempotent: a 404 (not attached) is
 * treated as success. Returns true if a delete happened, false if there was nothing
 * to delete or Vercel is not configured.
 */
export async function removeDomain(host: string): Promise<boolean> {
  const config = vercelConfig();
  if (!config) return false;
  if (!host || !isValidHost(host)) return false;

  const response = await fetch(
    withTeam(
      `${API_BASE}/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(host)}`,
      config.teamId
    ),
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.token}` },
    }
  );

  if (response.ok) return true;
  if (response.status === 404) return false;

  const envelope = await readEnvelope(response);
  const message = envelope?.error?.message || `Vercel responded ${response.status}`;
  throw new VercelApiError(response.status, message, envelope?.error?.code);
}

async function getDomainStatusInternal(host: string): Promise<VercelDomainStatus | null> {
  const config = vercelConfig();
  if (!config) return null;
  if (!host || !isValidHost(host)) return null;

  const response = await fetch(
    withTeam(
      `${API_BASE}/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(host)}`,
      config.teamId
    ),
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.token}` },
      cache: 'no-store',
    }
  );

  if (response.status === 404) {
    return { configured: false, verified: false, verification: [] };
  }

  if (!response.ok) {
    const envelope = await readEnvelope(response);
    const message = envelope?.error?.message || `Vercel responded ${response.status}`;
    throw new VercelApiError(response.status, message, envelope?.error?.code);
  }

  const data = (await response.json()) as {
    apexName?: string;
    verified?: boolean;
    verification?: Array<{ type: string; domain: string; value: string; reason: string }>;
  };

  return {
    configured: true,
    verified: Boolean(data.verified),
    verification: data.verification || [],
    apexName: data.apexName,
    raw: data,
  };
}

export async function getDomainStatus(host: string) {
  return getDomainStatusInternal(host);
}

/**
 * Fetch the per-project DNS recommendation Vercel hands out for `host`.
 * This is the right CNAME target to show the user (e.g. <hash>.vercel-dns-017.com)
 * rather than the generic cname.vercel-dns.com.
 *
 * Returns `null` when Vercel isn't configured. Otherwise returns the best
 * (rank 1) recommended CNAME / IPv4, plus whether Vercel currently observes
 * the domain as misconfigured.
 */
export async function getDomainConfig(host: string) {
  const config = vercelConfig();
  if (!config) return null;
  if (!host || !isValidHost(host)) return null;

  const url = new URL(`${API_BASE}/v6/domains/${encodeURIComponent(host)}/config`);
  url.searchParams.set('projectIdOrName', config.projectId);
  if (config.teamId) url.searchParams.set('teamId', config.teamId);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    const envelope = await readEnvelope(response);
    const message = envelope?.error?.message || `Vercel responded ${response.status}`;
    throw new VercelApiError(response.status, message, envelope?.error?.code);
  }

  const data = (await response.json()) as {
    configuredBy?: 'A' | 'CNAME' | 'dns-01' | 'http' | null;
    misconfigured?: boolean;
    recommendedCNAME?: Array<{ rank: number; value: string }>;
    recommendedIPv4?: Array<{ rank: number; value: string[] }>;
  };

  const cnameSorted = [...(data.recommendedCNAME || [])].sort((a, b) => a.rank - b.rank);
  const ipv4Sorted = [...(data.recommendedIPv4 || [])].sort((a, b) => a.rank - b.rank);

  return {
    configuredBy: data.configuredBy ?? null,
    misconfigured: Boolean(data.misconfigured),
    recommendedCname: cnameSorted[0]?.value || '',
    recommendedIpv4: ipv4Sorted[0]?.value?.[0] || '',
  };
}

/**
 * Reconcile Vercel project domains with the host the user just saved.
 * - If the host changed, attach the new one and detach the old one.
 * - Returns a partial status report — never throws to the caller.
 */
export async function syncProjectDomain({
  previous,
  current,
}: {
  previous: string[];
  current: string[];
}) {
  const config = vercelConfig();
  if (!config) {
    return { configured: false, attached: [] as string[], detached: [] as string[], errors: [] as string[] };
  }

  const previousSet = new Set(previous.filter(Boolean).map((host) => host.toLowerCase()));
  const currentSet = new Set(current.filter(Boolean).map((host) => host.toLowerCase()));

  const toAttach = [...currentSet].filter((host) => !previousSet.has(host));
  const toDetach = [...previousSet].filter((host) => !currentSet.has(host));

  const attached: string[] = [];
  const detached: string[] = [];
  const errors: string[] = [];

  for (const host of toAttach) {
    try {
      const result = await attachDomain(host);
      if (result) attached.push(host);
    } catch (error) {
      if (error instanceof VercelApiError) {
        errors.push(`Attach ${host}: ${error.message}`);
      } else {
        errors.push(`Attach ${host}: ${(error as Error).message}`);
      }
    }
  }

  for (const host of toDetach) {
    try {
      const removed = await removeDomain(host);
      if (removed) detached.push(host);
    } catch (error) {
      if (error instanceof VercelApiError) {
        errors.push(`Detach ${host}: ${error.message}`);
      } else {
        errors.push(`Detach ${host}: ${(error as Error).message}`);
      }
    }
  }

  return { configured: true, attached, detached, errors };
}
