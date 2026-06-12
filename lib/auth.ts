import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ensureUser, getDashboardPayload } from './platform-store';

export const sessionCookieName = 'lmp_neon_auth_stub';

export async function createStubSession(email: string, name?: string) {
  const user = await ensureUser(email, name);
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return user;
}

export async function clearStubSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function getCurrentDashboardPayload() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(sessionCookieName)?.value;
  if (!userId) return null;

  return getDashboardPayload(userId);
}

export async function requireDashboardPayload() {
  const payload = await getCurrentDashboardPayload();
  if (!payload) redirect('/login');

  return payload;
}

