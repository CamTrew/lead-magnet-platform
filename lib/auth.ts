import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createHash, randomBytes } from 'node:crypto';
import {
  createPasswordResetToken,
  createDatabaseSession,
  createUserWithPasswordSession,
  deleteDatabaseSession,
  findUserWithPasswordByEmail,
  getDashboardBasePayloadBySessionToken,
  getDashboardPayloadBySessionToken,
  resetPasswordFromToken,
} from './platform-store';
import { hashPassword, verifyPassword } from './passwords';

export const sessionCookieName = 'magnets_session';

export class AuthActionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthActionError';
    this.status = status;
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

  await createSessionForUser(result.user.id);
  return result.user;
}

export async function createRegisterSession(email: string, password: string, name?: string) {
  const result = await createUserWithPasswordSession(email, await hashPassword(password), name);

  if (!result) {
    throw new AuthActionError('Could not create an account. Try again.', 500);
  }

  if (result.existingPasswordHash) {
    throw new AuthActionError('An account already exists for that email. Sign in instead.', 409);
  }

  if (!result.sessionToken) {
    throw new AuthActionError('That account was just created. Sign in to continue.', 409);
  }

  await setSessionCookie(result.sessionToken);
  return result.user;
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
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  return getDashboardPayloadBySessionToken(token);
});

export const getCurrentDashboardBase = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  return getDashboardBasePayloadBySessionToken(token);
});

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
