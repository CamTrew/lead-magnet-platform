import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createDatabaseSession,
  createUserWithPasswordSession,
  deleteDatabaseSession,
  findUserWithPasswordByEmail,
  getDashboardPayloadBySessionToken,
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
    throw new AuthActionError('No account found for that email. Create an account first.', 404);
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

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    await deleteDatabaseSession(token);
  }

  cookieStore.delete(sessionCookieName);
}

export async function getCurrentDashboardPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  return getDashboardPayloadBySessionToken(token);
}

export async function requireDashboardPayload() {
  const payload = await getCurrentDashboardPayload();
  if (!payload) redirect('/login');

  return payload;
}
