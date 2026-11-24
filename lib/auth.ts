import { assistantWorkspaceContext } from './assistant-workspace-context';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createHash, randomBytes } from 'node:crypto';
import {
  consumeEmailVerificationToken,
  createEmailVerificationCodeToken,
  createPasswordResetToken,
  createDatabaseSession,
  createUserWithPassword,
  deleteDatabaseSession,
  findUserWithPasswordByEmail,
  getDashboardBasePayloadBySessionToken,
  getDashboardPayloadBySessionToken,
  resetPasswordFromToken,
} from './platform-store';
import { assertVerificationCodeConfiguration, generateVerificationCode, hashVerificationCode, verificationCodeHashes, VERIFICATION_CODE_TTL_MS } from './email-verification-code';
import { hashPassword, verifyPassword } from './passwords';

export const sessionCookieName = 'magnets_session';

export class AuthActionError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AuthActionError';
    this.status = status;
    this.code = code;
  }
}

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

async function createSessionForUser(userId: string) {
  const token = await createDatabaseSession(userId);
  await setSessionCookie(token);
}

export async function createLoginSession(email: string, password: string) {
  const result = await findUserWithPasswordByEmail(email);

  if (!result) {
    throw new AuthActionError('Email or password is incorrect.', 401);
  }

  if (!result.passwordHash) {
    throw new AuthActionError('This account needs a password. Create an account to finish setup.', 409);
  }

  const passwordMatches = await verifyPassword(password, result.passwordHash);

  if (!passwordMatches) {
    throw new AuthActionError('Email or password is incorrect.', 401);
  }

  if (!result.emailVerified) {
    throw new AuthActionError(
      'Verify your email before signing in.',
      403,
      'email_verification_required'
    );
  }

  await createSessionForUser(result.user.id);
  return result.user;
}

export async function createRegistration(email: string, password: string, name?: string) {
  // Fail before persisting an account if its verification cannot be issued.
  assertVerificationCodeConfiguration();
  const result = await createUserWithPassword(email, await hashPassword(password), name);

  if (!result) {
    throw new AuthActionError('Could not create an account. Try again.', 500);
  }

  if (result.existingPasswordHash) {
    // A retry after interrupted verification can resume only with the original
    // password. Never overwrite credentials or reopen a verified account.
    if (await verifyPassword(password, result.existingPasswordHash)) {
      const existing = await findUserWithPasswordByEmail(email);
      if (existing && !existing.emailVerified) return existing.user;
    }
    throw new AuthActionError('An account already exists for that email. Sign in instead.', 409);
  }

  return result.user;
}

function hashEmailVerificationToken(token: string) {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

async function issueEmailVerification(userId: string, email: string) {
  const code = generateVerificationCode();
  await createEmailVerificationCodeToken(
    userId,
    hashVerificationCode(email, code),
    new Date(Date.now() + VERIFICATION_CODE_TTL_MS)
  );
  return { email, code };
}

export async function createEmailVerificationForUser(userId: string, email: string) {
  return issueEmailVerification(userId, email);
}

/** Unknown or already-verified addresses return null to prevent enumeration. */
export async function createEmailVerificationForAddress(email: string) {
  const result = await findUserWithPasswordByEmail(email);
  if (!result || result.emailVerified || !result.passwordHash) return null;
  return issueEmailVerification(result.user.id, result.user.email);
}

export async function completeEmailVerification(token: string) {
  const userId = await consumeEmailVerificationToken(hashEmailVerificationToken(token));
  if (!userId) {
    throw new AuthActionError(
      'This verification link is invalid or has expired. Request a new one.',
      400,
      'invalid_email_verification'
    );
  }

  await createSessionForUser(userId);
}

export async function completeEmailVerificationCode(email: string, code: string) {
  let userId: string | null = null;
  for (const hash of verificationCodeHashes(email, code)) {
    userId = await consumeEmailVerificationToken(hash);
    if (userId) break;
  }
  if (!userId) {
    throw new AuthActionError(
      'That code is incorrect or has expired. Try again or request a new code.',
      400,
      'invalid_email_verification'
    );
  }
  await createSessionForUser(userId);
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function hashPasswordResetToken(token: string) {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

/**
 * Unknown addresses deliberately return null. The caller always gives the
 * same response so this route cannot be used to discover registered emails.
 */
export async function createPasswordReset(email: string) {
  const result = await findUserWithPasswordByEmail(email);
  if (!result) return null;

  const token = randomBytes(32).toString('base64url');
  await createPasswordResetToken(
    result.user.id,
    hashPasswordResetToken(token),
    new Date(Date.now() + PASSWORD_RESET_TTL_MS)
  );

  return { email: result.user.email, token };
}

export async function completePasswordReset(token: string, password: string) {
  const userId = await resetPasswordFromToken(
    hashPasswordResetToken(token),
    await hashPassword(password)
  );

  if (!userId) {
    throw new AuthActionError('This reset link is invalid or has expired. Request another.', 400);
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    await deleteDatabaseSession(token);
  }

  cookieStore.delete(sessionCookieName);
}

export const getCurrentDashboardPayload = cache(async () => {
  // Full payload access is deliberately unavailable to internal MCP adapters.
  if (assistantWorkspaceContext.getStore()) throw new Error('Use the account-scoped dashboard base in assistant tools.');
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  return getDashboardPayloadBySessionToken(token);
});

const getCookieDashboardBase = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  return getDashboardBasePayloadBySessionToken(token);
});

export async function getCurrentDashboardBase() {
  return assistantWorkspaceContext.getStore()?.payload ?? getCookieDashboardBase();
}

export async function requireDashboardBase() {
  const payload = await getCurrentDashboardBase();
  if (!payload) redirect('/login');

  return payload;
}

export async function requireDashboardPayload() {
  // Kept as a compatibility alias for API routes. Authentication and account
  // settings never need every lead magnet, so this must stay on the small
  // base payload rather than reintroducing the old megabyte-scale auth query.
  return requireDashboardBase();
}
