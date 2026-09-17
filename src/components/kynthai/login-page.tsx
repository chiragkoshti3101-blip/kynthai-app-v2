'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore, selectors, type LoginPortal } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, EyeOff, Sparkles, ArrowLeft, ShieldCheck, Stethoscope, FlaskConical, Users, UserRound, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/client-fetch';
import { isNativeShell, isStandaloneDisplay } from '@/lib/native-shell';
import { installGlobalCsrf } from '@/lib/providers';
import { logger } from '@/lib/logger';
import { isDemoLoginEnabled, isDemoUser } from '@/lib/demo-mode';
import { runDemoLogin, demoRolePath, type DemoRole, DEMO_ROLES } from '@/lib/demo-login';

export function LoginPage({
  initialMode = 'signin',
  initialDemo = false,
}: { initialMode?: 'signin' | 'register'; initialDemo?: boolean } = {}) {
  const loginPortal = useAppStore(selectors.loginPortal);
  const setLoginPortal = useAppStore((s) => s.setLoginPortal);
  const login = useAppStore((s) => s.login);
  const setScreen = useAppStore((s) => s.setScreen);
  const user = useAppStore(selectors.user);
  const router = useRouter();
  const { toast } = useToast();

  // ── DEMO: suppress the login-form "blink" ────────────────────────────────
  // The demo auto-login (below) runs an async login then replaces to the
  // portal. Without a gate, the first paint shows the sign-in form, then the
  // effect kicks in — a brief but real form→portal flash ("demo blinks for a
  // second on the same page"). Compute the intent synchronously here (before
  // effects) so the FIRST render already shows a loader and never the form.
  //
  // `initialDemo` comes from the server component (searchParams.demo === '1')
  // so both SSR and client agree on the state — no hydration flash.
  // Keep the server-rendered loader and client auto-login on the same feature flag.
  // When demos are disabled in production, /login?demo=1 must fall back to the
  // normal sign-in form instead of rendering a loader whose effect will never run.
  const hasDemoMarker =
    typeof window !== 'undefined' &&
    // URL marker survives only until the auto-login effect consumes it
    (new URLSearchParams(window.location.search).get('demo') === '1' ||
      ['patient', 'doctor', 'caretaker', 'lab', 'admin'].includes(
        (window.location.hash || '').replace('#', '').toLowerCase()
      ));
  const bootRequestingDemo = isDemoLoginEnabled() && (initialDemo || hasDemoMarker);
  const [demoBooting, setDemoBooting] = React.useState(bootRequestingDemo);
  const [hideDownloadCta, setHideDownloadCta] = React.useState(false);
  React.useEffect(() => {
    setHideDownloadCta(isNativeShell() || isStandaloneDisplay())
  }, []);
  // ───────────────────────────────────────────────────────────────────────────

  const [mode, setMode] = React.useState<'signin' | 'register'>(initialMode);
  // ponytail: read sessionStorage in an effect, NOT the state initializer —
  // a render-phase browser read is a server/client branch and caused an
  // intermittent React #418 hydration mismatch (full-page boot-splash lockup).
  const [email, setEmail] = React.useState('');
  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem('kynthai.login.email')
      if (saved) setEmail(saved)
    } catch { /* private mode */ }
  }, []);
  const [password, setPassword] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [dateOfBirth, setDateOfBirth] = React.useState('');
  const [termsConsent, setTermsConsent] = React.useState(false);
  const [dataConsent, setDataConsent] = React.useState(false);
  const [aiTrainingConsent, setAiTrainingConsent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [demoBusy, setDemoBusy] = React.useState(false);
  const [invitesLoading, setInvitesLoading] = React.useState(false);
  const [emergencyContact1, setEmergencyContact1] = React.useState('');
  const [emergencyContact2, setEmergencyContact2] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  // ── SECURITY: Cloudflare Turnstile (active only when the site key is set) ───
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);
  const turnstileRef = React.useRef<TurnstileWidgetHandle>(null);
  // ────────────────────────────────────────────────────────────────────────────
  const [pendingInvites, setPendingInvites] = React.useState<
    { id: string; invitedBy: string; relation: string }[]
  >([]);
  // ── COMPLIANCE: age-gate modal ──────────────────────────────────────────────
  // Blocks registration until the caller confirms they are 18+. Shown before the
  // form when mode is 'register'; dismissed by clicking "I am 18 or older".
  const [ageGateOpen, setAgeGateOpen] = React.useState(false);
  const [ageGateDismissed, setAgeGateDismissed] = React.useState(false);
  const [showPrivacy, setShowPrivacy] = React.useState(false);
  const [showTerms, setShowTerms] = React.useState(false);

  const resetCaptcha = React.useCallback(() => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  }, []);

  React.useEffect(() => {
    installGlobalCsrf();
  }, []);

  React.useEffect(() => {
    if (user?.isDemo) return;
    if (user) router.replace(demoRolePath(user.role));
  }, [user, router]);

  // Demo login is EXPLICIT, never automatic. It only fires when the URL
  // explicitly requests it — `?demo=1` or a role hash like `#patient`
  // / `#doctor` / `#caretaker` / `#lab` / `#admin` — or when the user
  // clicks the "Try the demo" button (which navigates to ?demo=1).
  React.useEffect(() => {
    if (!isDemoLoginEnabled()) return;
    if (loading || demoBusy) return;
    if (typeof window === 'undefined') return;
    // Explicit opt-in gate — no URL marker, no auto-login.
    const qs = new URLSearchParams(window.location.search);
    const wantsDemo = qs.get('demo') === '1';
    const hashRole = (window.location.hash || '').replace('#', '').toLowerCase();
    if (!wantsDemo && !(DEMO_ROLES as string[]).includes(hashRole)) return;

    // A signed-in real user must never be silently replaced. An existing
    // seeded demo session may explicitly switch to the requested demo role,
    // which keeps role links reliable when the browser already has a demo
    // cookie from a prior portal visit.
    const requestedRole = (DEMO_ROLES as string[]).includes(hashRole)
      ? (hashRole as DemoRole)
      : 'caretaker';
    if (user && !isDemoUser(user)) {
      setDemoBooting(false);
      return;
    }
    if (user && user.role === requestedRole) {
      router.replace(demoRolePath(requestedRole));
      return;
    }

    // CONSUME the demo marker immediately: once we've decided to auto-login
    // from `?demo=1` / `#role`, strip it from the URL so a LATER visit to
    // /login (e.g. the user logs out of the admin demo and returns here) is a
    // clean form — otherwise the stale marker silently re-triggers the demo
    // and looks like "touching Patient opens the demo" / "logout needs twice".
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch { /* history may be unavailable; ignore */ }

    const role = (DEMO_ROLES as string[]).includes(hashRole)
      ? (hashRole as DemoRole)
      : 'caretaker';
    setDemoBusy(true);
    void (async () => {
      const ok = await runDemoLogin(role);
      if (ok) {
        router.push(demoRolePath(role));
        return;
      }
      setDemoBusy(false); // session failed — fall back to the sign-in form
      setDemoBooting(false);
    })();
  }, [user, loading, demoBusy, router]);

  const portalEmpathy: Record<LoginPortal, string> = {
    caretaker: 'Keep the whole family on track with shared reminders.',
    patient: 'Your personal health companion, always on.',
    doctor: 'See patients faster with smarter scheduling.',
    lab: 'Make every test result count for the people who need it.',
    admin: 'Keep Kynthai safe, trusted, and running smoothly.',
  };

  const visiblePortals = (Object.keys(portalEmpathy) as LoginPortal[]).filter(role => {
    if (role === 'admin') return process.env.NODE_ENV !== 'production';
    return true;
  });
  const active: PortalConfig = visiblePortals.find(p => p.id === loginPortal) ?? PORTALS[0]!;
  const redirectAfterLogin = React.useCallback((role: LoginPortal) => {
    const portalPath = role === 'admin' ? '/admin' : demoRolePath(role);
    router.replace(portalPath);
  }, [router]);
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    logger.debug('Login submit', { email, hasPassword: !!password?.length, mode, loginPortal });
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { email: email.trim(), password };
      if (captchaToken) payload.captchaToken = captchaToken;
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Unable to sign in.');
      login({ ...data, isDemo: data.isDemo === true });
      try { sessionStorage.setItem('kynthai.login.email', email.trim()); } catch { /* private mode */ }
      redirectAfterLogin(data.role);
    } catch (err) {
      logger.error('Login error', err);
      const msg = err instanceof Error ? err.message : 'Unable to sign in.';
      setFormError(msg);
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !email.trim() || !password) {
      setFormError('Please complete all required fields.');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (!termsConsent || !dataConsent || !aiTrainingConsent) {
      setFormError('Please accept all required consent options.');
      return;
    }
    if (phone && !/^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s-]/g, ''))) {
      setFormError('Please enter a valid international phone number.');
      return;
    }
    if (!dateOfBirth) {
      setFormError('Date of birth is required.');
      return;
    }
    setLoading(true);
    try {
      const payload = { name: name.trim(), email: email.trim(), password, phone: phone || undefined, dateOfBirth, termsConsent, dataConsent, aiTrainingConsent, captchaToken: captchaToken || undefined };
      const response = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Unable to create your account.');
      login({ ...data, isDemo: false });
      setFormError(null);
      router.replace('/patient');
    } catch (err) {
      logger.error('Registration error', err);
      setFormError(err instanceof Error ? err.message : 'Unable to create your account.');
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  // ── Profile/account helpers ──────────────────────────────────────────────
  const formatDate = (value: string | null | undefined) => {
    if (!value) return '';
    try {
      const d = new Date(value);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  const fetchPendingInvites = React.useCallback(async () => {
    try {
      const res = await fetch('/api/family/invite', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPendingInvites(data.invites || []);
      }
    } catch { /* non-critical */ }
  }, []);

  React.useEffect(() => {
    if (user?.role === 'caretaker') fetchPendingInvites();
  }, [user, fetchPendingInvites]);

  const handleInviteAccept = async (inviteId: string) => {
    try {
      const response = await apiFetch('/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ inviteId, action: 'accept' }),
      });
      if (!response.ok) throw new Error('Unable to accept invite');
      await fetchPendingInvites();
      toast({ title: 'Invite accepted' });
    } catch {
      toast({ title: 'Invite failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const handleInviteDecline = async (inviteId: string) => {
    try {
      const response = await apiFetch('/api/family/invite', {
        method: 'POST',
        body: JSON.stringify({ inviteId, action: 'decline' }),
      });
      if (!response.ok) throw new Error('Unable to decline invite');
      await fetchPendingInvites();
      toast({ title: 'Invite declined' });
    } catch {
      toast({ title: 'Invite failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (demoBooting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl" />
            <Loader2 className="relative h-10 w-10 animate-spin text-emerald-600" />
          </div>
          <p className="text-sm text-muted-foreground">Opening your demo portal…</p>
        </div>
      </div>
    );
  }

  const portalConfig: Record<LoginPortal, PortalConfig> = {
    caretaker: { id: 'caretaker', label: 'Family', icon: Users, description: 'Family care portal' },
    patient: { id: 'patient', label: 'Patient', icon: UserRound, description: 'Personal health portal' },
    doctor: { id: 'doctor', label: 'Doctor', icon: Stethoscope, description: 'Professional portal' },
    lab: { id: 'lab', label: 'Lab', icon: FlaskConical, description: 'Laboratory portal' },
    admin: { id: 'admin', label: 'Admin', icon: ShieldCheck, description: 'Admin portal' },
  };
  const PORTALS = Object.values(portalConfig);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to your Kynthai account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            {visiblePortals.map((p) => (
              <button key={p} type="button" onClick={() => setLoginPortal(p)} className={cn('flex-1 rounded-md px-2 py-2 text-sm', loginPortal === p ? 'bg-emerald-600 text-white' : 'bg-muted')}>
                {portalConfig[p].label}
              </button>
            ))}
          </div>
          {formError && <div role="alert" className="mb-4 text-sm text-red-600">{formError}</div>}
          <form onSubmit={mode === 'signin' ? handleLogin : handleRegister} className="space-y-4">
            {mode === 'register' && <>
              <div><Label htmlFor="name">Full name</Label><Input id="name" value={name} onChange={e => setName(e.target.value)} /></div>
              <div><Label htmlFor="phone">Phone</Label><Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} /></div>
              <div><Label htmlFor="dob">Date of birth</Label><Input id="dob" type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} /></div>
              <div className="flex items-center gap-2"><Checkbox checked={termsConsent} onCheckedChange={v => setTermsConsent(!!v)} /><Label>I agree to the terms</Label></div>
              <div className="flex items-center gap-2"><Checkbox checked={dataConsent} onCheckedChange={v => setDataConsent(!!v)} /><Label>I consent to data processing</Label></div>
              <div className="flex items-center gap-2"><Checkbox checked={aiTrainingConsent} onCheckedChange={v => setAiTrainingConsent(!!v)} /><Label>I consent to AI training</Label></div>
            </>}
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="password">Password</Label><div className="flex gap-2"><Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} /><Button type="button" variant="ghost" onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></div>
            <Button type="submit" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : 'Sign in'}</Button>
          </form>
          {isDemoLoginEnabled() && <Button type="button" disabled={demoBusy} onClick={async () => { setDemoBusy(true); const role = loginPortal as DemoRole; const ok = await runDemoLogin(role); if (ok) { router.push(demoRolePath(role)); return; } setDemoBusy(false); }}> <Sparkles /> Try the demo </Button>}
        </CardContent>
      </Card>
    </main>
  );
}

type PortalConfig = { id: LoginPortal; label: string; icon: React.ComponentType<{ className?: string }>; description: string };
interface TurnstileWidgetHandle { reset: () => void }
