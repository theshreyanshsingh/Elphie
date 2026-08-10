import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const LOCAL_AUTH_TOKEN_COOKIE = 'elphie_auth_token';
const LOCAL_AUTH_USER_COOKIE = 'elphie_auth_user';

export async function POST() {
  const cookieStore = await cookies();

  cookieStore.set(LOCAL_AUTH_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  cookieStore.set(LOCAL_AUTH_USER_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return NextResponse.json({ success: true });
}
