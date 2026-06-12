import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type {
  AccountSettings,
  DashboardPayload,
  LeadMagnet,
  NeonAuthUser,
  PlatformData,
  Submission,
} from './types';

const dataDir = path.join(process.cwd(), '.data');
const dataFile = path.join(dataDir, 'lead-magnet-platform.json');

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

const demoUserId = 'user_demo';
const demoAccountId = 'acct_demo';

function defaultLeadMagnet(accountId: string): LeadMagnet {
  const timestamp = now();

  return {
    id: 'lm_demo',
    accountId,
    slug: 'ai-pipeline-playbook',
    title: 'The AI Pipeline Playbook for Revenue Teams',
    subtitle: 'A practical guide to turning anonymous website traffic into qualified meetings.',
    description:
      'Most website visitors leave before they ever speak to sales. This playbook shows how teams can identify, engage, qualify, and route buyers while momentum is still fresh.\n\nUse it to map the moments where a lead magnet can capture intent and move visitors toward a booked meeting.',
    bullets: [
      'Spot the signals that separate casual browsers from qualified buyers',
      'Design capture flows that feel helpful instead of scripted',
      'Connect captured intent to your email and newsletter workflow',
      'Measure meetings, influenced pipeline, and conversion lift',
    ],
    bulletsHeading: 'Inside the guide:',
    ctaText: 'Get the playbook',
    formHeading: 'Send me the playbook',
    formSubtext: 'Enter your details and we will email the download link.',
    imageUrl: '',
    downloadLink: 'https://example.com/playbook',
    emailSubject: 'Your AI Pipeline Playbook',
    emailBody:
      'Hi {name},\n\nHere is your AI Pipeline Playbook:\n\n{download_link}\n\nUse it to find the moments where your website can answer, qualify, and convert more visitors.',
    emailPreview: 'Your playbook is ready.',
    published: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function defaultAccount(ownerUserId: string): AccountSettings {
  const timestamp = now();

  return {
    id: demoAccountId,
    ownerUserId,
    name: 'Demo Workspace',
    subdomain: 'get',
    domain: 'your-domain.com',
    logoUrl: '',
    logoText: 'Your Brand',
    brand: {
      primary: '#2d7373',
      accent: '#7c3aed',
      success: '#84cc16',
    },
    resendApiKey: '',
    resendFromEmail: 'hello@example.com',
    beehiivApiKey: '',
    beehiivPublicationId: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function initialData(): PlatformData {
  const timestamp = now();
  const user: NeonAuthUser = {
    id: demoUserId,
    email: 'founder@example.com',
    name: 'Founder',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const account = defaultAccount(user.id);

  return {
    users: [user],
    accounts: [account],
    leadMagnets: [defaultLeadMagnet(account.id)],
    submissions: [],
  };
}

async function readData(): Promise<PlatformData> {
  try {
    const raw = await readFile(dataFile, 'utf8');
    const data = JSON.parse(raw) as PlatformData;
    let changed = false;

    for (const account of data.accounts) {
      if (!account.logoText) {
        account.logoText = account.name;
        changed = true;
      }
    }

    if (changed) {
      await writeData(data);
    }

    return data;
  } catch {
    const seed = initialData();
    await writeData(seed);
    return seed;
  }
}

async function writeData(data: PlatformData) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function mutateData<T>(mutator: (data: PlatformData) => T | Promise<T>) {
  const data = await readData();
  const result = await mutator(data);
  await writeData(data);
  return result;
}

export async function ensureUser(email: string, name?: string): Promise<NeonAuthUser> {
  const normalizedEmail = email.trim().toLowerCase();

  return mutateData((data) => {
    let user = data.users.find((item) => item.email === normalizedEmail);

    if (!user) {
      const timestamp = now();
      user = {
        id: id('user'),
        email: normalizedEmail,
        name: name?.trim() || normalizedEmail.split('@')[0] || 'User',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.users.push(user);
    }

    const account = data.accounts.find((item) => item.ownerUserId === user.id);
    if (!account) {
      const newAccount = defaultAccount(user.id);
      newAccount.id = id('acct');
      newAccount.name = `${user.name}'s Workspace`;
      data.accounts.push(newAccount);
      data.leadMagnets.push(defaultLeadMagnet(newAccount.id));
    }

    return user;
  });
}

export async function getDashboardPayload(userId: string): Promise<DashboardPayload | null> {
  const data = await readData();
  const user = data.users.find((item) => item.id === userId);
  if (!user) return null;

  const account = data.accounts.find((item) => item.ownerUserId === user.id);
  if (!account) return null;

  return {
    user,
    account,
    leadMagnets: data.leadMagnets.filter((item) => item.accountId === account.id),
  };
}

export async function updateAccount(
  accountId: string,
  updates: Partial<Omit<AccountSettings, 'id' | 'ownerUserId' | 'createdAt' | 'updatedAt'>>
) {
  return mutateData((data) => {
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account) return null;

    Object.assign(account, updates, { updatedAt: now() });
    return account;
  });
}

export async function createLeadMagnet(accountId: string) {
  return mutateData((data) => {
    const template = defaultLeadMagnet(accountId);
    const leadMagnet: LeadMagnet = {
      ...template,
      id: id('lm'),
      slug: `new-resource-${data.leadMagnets.filter((item) => item.accountId === accountId).length + 1}`,
      title: 'Untitled Lead Magnet',
      published: false,
      createdAt: now(),
      updatedAt: now(),
    };

    data.leadMagnets.push(leadMagnet);
    return leadMagnet;
  });
}

export async function updateLeadMagnet(
  accountId: string,
  leadMagnetId: string,
  updates: Partial<Omit<LeadMagnet, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>>
) {
  return mutateData((data) => {
    const leadMagnet = data.leadMagnets.find(
      (item) => item.id === leadMagnetId && item.accountId === accountId
    );
    if (!leadMagnet) return null;

    Object.assign(leadMagnet, updates, { updatedAt: now() });
    return leadMagnet;
  });
}

export async function deleteLeadMagnet(accountId: string, leadMagnetId: string) {
  return mutateData((data) => {
    const before = data.leadMagnets.length;
    data.leadMagnets = data.leadMagnets.filter(
      (item) => item.id !== leadMagnetId || item.accountId !== accountId
    );

    return data.leadMagnets.length < before;
  });
}

export async function findPublishedLeadMagnet(host: string, slug: string) {
  const data = await readData();
  const hostname = host.split(':')[0].toLowerCase();
  const account =
    data.accounts.find((item) => `${item.subdomain}.${item.domain}`.toLowerCase() === hostname) ||
    data.accounts.find((item) => item.domain.toLowerCase() === hostname) ||
    data.accounts[0];

  if (!account) return null;

  const leadMagnet = data.leadMagnets.find(
    (item) => item.accountId === account.id && item.slug === slug && item.published
  );

  if (!leadMagnet) return null;

  return { account, leadMagnet };
}

export async function findLeadMagnet(accountId: string, leadMagnetId: string) {
  const data = await readData();
  const account = data.accounts.find((item) => item.id === accountId);
  const leadMagnet = data.leadMagnets.find(
    (item) => item.id === leadMagnetId && item.accountId === accountId
  );

  return account && leadMagnet ? { account, leadMagnet } : null;
}

export async function recordSubmission(submission: Omit<Submission, 'id' | 'createdAt'>) {
  return mutateData((data) => {
    const saved: Submission = {
      ...submission,
      id: id('sub'),
      createdAt: now(),
    };
    data.submissions.push(saved);
    return saved;
  });
}
