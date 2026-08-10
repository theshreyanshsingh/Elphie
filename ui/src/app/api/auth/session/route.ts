import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const LOCAL_AUTH_TOKEN_COOKIE = 'elphie_auth_token';
const LOCAL_AUTH_USER_COOKIE = 'elphie_auth_user';

export async function POST(request: NextRequest) {
  const { token, user } = await request.json();

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const cookieStore = await cookies();

  cookieStore.set(LOCAL_AUTH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  cookieStore.set(LOCAL_AUTH_USER_COOKIE, JSON.stringify(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return NextResponse.json({ success: true });
}
