import type { NextResponse } from 'next/server';

export function setPortalRoleCookie(res: NextResponse, role: string, secure: boolean): void {
  res.cookies.set('kynthai-role', role, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearPortalRoleCookie(res: NextResponse): void {
  res.headers.append('Set-Cookie', 'kynthai-role=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
}
