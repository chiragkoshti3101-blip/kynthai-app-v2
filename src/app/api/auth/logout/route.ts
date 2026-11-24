import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/auth';
import { getSupabaseProfile } from '@/lib/supabase/sync';
import { checkCsrf } from '@/lib/csrf';
import { createServerClient } from '@supabase/ssr';
import { clearPortalRoleCookie } from '@/lib/portal-role-cookie';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const csrfErr = await checkCsrf(req);
  if (csrfErr) return csrfErr;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user: supabaseUser } } = await supabase.auth.getUser();

  let userId = 'unknown';
  if (supabaseUser) {
    const profile = await getSupabaseProfile(supabaseUser);
    if (profile) {
      userId = profile.id;
      await logAudit(profile.id, 'auth.logout');
    }
  }

  // Sign out from Supabase
  await supabase.auth.signOut();

  // Build response with cleared cookies
  const res = NextResponse.json({ success: true });

  // Explicitly clear kynthai-session cookie (used by local auth fallback)
  res.headers.append('Set-Cookie', 'kynthai-session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
  clearPortalRoleCookie(res);

  // Parse cookies from raw Cookie header and clear them all
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookiePairs = cookieHeader.split(';');
  for (const pair of cookiePairs) {
    const name = pair.trim().split('=')[0];
    // Keep the CSRF token: it is not a credential, only a double-submit
    // value. Clearing it while the browser still holds the matching token
    // makes the very next sign-in fail with "CSRF token mismatch".
    if (name?.trim() === 'kynthai-csrf') continue;
    if (name && name.trim()) {
      // Use append to add multiple Set-Cookie headers
      res.headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0`);
    }
  }

  return res;
}
