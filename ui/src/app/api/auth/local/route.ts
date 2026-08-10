/*
  Provides authentication token to LocalProviderWrapper once loaded
  in the browser.
  Returns 401 if no token cookie exists (user needs to log in).
  Also validates the JWT against the API so stale/invalid sessions
  are cleared instead of leaving the UI "logged in" with failing API calls.
*/
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getServerBackendUrl } from '@/lib/apiClient';
import { getAuthProvider } from '@/lib/auth/config';

const LOCAL_AUTH_TOKEN_COOKIE = 'elphie_auth_token';
const LOCAL_AUTH_USER_COOKIE = 'elphie_auth_user';

function clearAuthCookies(response: NextResponse) {
  response.cookies.set(LOCAL_AUTH_TOKEN_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(LOCAL_AUTH_USER_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function GET() {
  const authProvider = await getAuthProvider();

  // Only handle self-hosted (local auth) mode
  if (authProvider !== 'local') {
    return NextResponse.json({ error: 'Not in self-hosted mode' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(LOCAL_AUTH_TOKEN_COOKIE)?.value;
  const user = cookieStore.get(LOCAL_AUTH_USER_COOKIE)?.value;

  // If no token exists, return 401 (user needs to sign up or log in)
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Validate the cookie JWT with the API. Without this, a stale token still
  // unlocks the UI while every authenticated request returns 401.
  try {
    const backendUrl = getServerBackendUrl().replace(/\/$/, '');
    const probe = await fetch(`${backendUrl}/api/v1/user/auth/user`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (probe.status === 401 || probe.status === 403) {
      return clearAuthCookies(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
      );
    }
  } catch {
    // Backend unreachable — still return the cookie so the UI can load;
    // individual pages will surface connectivity errors.
  }

  // Return the auth info as JSON
  return NextResponse.json({
    token,
    user: user ? JSON.parse(user) : { id: token, name: 'Local User', provider: 'local' },
  });
}
