'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Users,
  HeartPulse,
  Stethoscope,
  Microscope,
  Lock,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAppStore, selectors, type AuthUser, type LoginPortal } from '@/lib/store';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { KynthaiBrand } from './logo';
import { FadeIn } from './animations';
import { TurnstileWidget, type TurnstileWidgetHandle } from './turnstile-widget';
import { runDemoLogin, demoRolePath, type DemoRole, DEMO_ROLES } from '@/lib/demo-login';
import { AppLoader } from '@/components/kynthai/app-loader';
import { isDemoEnabled } from '@/lib/demo-mode'

interface PortalConfig {
  id: LoginPortal;
  label: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}

const PORTALS: PortalConfig[] = [
  {
    id: 'caretaker',
    label: 'Family',
    tagline: 'Manage up to 4 family members',
    icon: Users,
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'patient',
    label: 'Patient',
    tagline: 'Your personal health companion',
    icon: HeartPulse,
    gradient: 'from-emerald-500 to-emerald-700',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    tagline: 'Verified practitioners',
    icon: Stethoscope,
    gradient: 'from-teal-500 to-emerald-600',
  },
  {
    id: 'lab',
    label: 'Lab',
    tagline: 'Diagnostic partners',
    icon: Microscope,
    gradient: 'from-teal-500 to-teal-700',
  },
];

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )kynthai-csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

async function apiCall(path: string, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const url = `/api${path.startsWith('/auth') ? path : path}`;

  let token = getCsrfToken();
  if (!token) {
    await fetch(`/api/auth/csrf`, { method: 'GET', credentials: 'include' });
    token = getCsrfToken();
  }
  if (token) headers['X-CSRF-Token'] = token;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });
  // Parse the body defensively: a 5xx may return empty or non-JSON, which
  // would otherwise throw and surface a confusing "Unexpected end of JSON"
  // error to the user instead of the real failure.
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason =
      (data && typeof data === 'object' && (data as { error?: string }).error) ||
      (res.status >= 500
        ? 'Something went wrong on our side. Please try again in a moment.'
        : 'Request failed. Please try again.');
    throw new Error(reason);
  }
  return data;
}

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
  const bootRequestingDemo =
    initialDemo ||
    (typeof window !== 'undefined' &&
    isDemoEnabled() &&
    // URL marker survives only until the auto-login effect consumes it
    (new URLSearchParams(window.location.search).get('demo') === '1' ||
      ['patient', 'doctor', 'caretaker', 'lab', 'admin'].includes(
        (window.location.hash || '').replace('#', '').toLowerCase()
      )));
  const [demoBooting, setDemoBooting] = React.useState(bootRequestingDemo);
  // ───────────────────────────────────────────────────────────────────────────

  const [mode, setMode] = React.useState<'signin' | 'register'>(initialMode);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
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
  // ── SECURITY: Cloudflare Turnstile (active only when the site key is set) ────
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
  // ────────────────────────────────────────────────────────────────────────────

  // ── COMPLIANCE: auto-show age-gate when user switches to registration ─────
  React.useEffect(() => {
    if (mode === 'register' && !ageGateDismissed) {
      setAgeGateOpen(true);
    }
    if (mode === 'signin') {
      setAgeGateOpen(false);
    }
  }, [mode, ageGateDismissed]);

  // Turnstile tokens are single-use — discard any minted token when the
  // mode flips so a stale one can never be reused for the other flow.
  React.useEffect(() => {
    setCaptchaToken(null);
  }, [mode]);
  // ───────────────────────────────────────────────────────────────────────────

  // Returning-user redirect: only navigate when the session is LIVE.
  // A persisted store user can be stale (session cookie expired/rotated, or
  // the store holds a different account than the current session). Blindly
  // pushing to the store-role portal made the login page thrash form →
  // portal → login on every load (mobile "form is blinking" report): this
  // effect redirected on the stale user while AuthGuard skips /login, so
  // nothing reconciled store vs. session until the portal bounced back.
  // Verify /api/auth/me first; sync the store to the server truth, or clear
  // the stale user and stay on the form (no redirect, no loop).
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.authenticated && data?.user) {
          if (data.user.id !== user.id) useAppStore.getState().login(data.user);
          const targetScreen =
            data.user.role === 'patient'
              ? 'patient'
              : data.user.role === 'doctor'
                ? 'doctor'
                : data.user.role === 'lab'
                  ? 'lab'
                  : data.user.role === 'admin'
                    ? 'admin'
                    : 'caretaker';
          router.push(`/${targetScreen}`);
        } else {
          // Session is gone — the persisted user is stale. Clear it so the
          // form stays put (no redirect) and the next login starts clean.
          useAppStore.getState().logout();
        }
      } catch {
        // Network error — do nothing; don't navigate, don't clear, don't loop.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  // Demo login is EXPLICIT, never automatic. It only fires when the URL
  // explicitly requests it — `?demo=1` or a role hash like `#patient`
  // / `#doctor` / `#caretaker` / `#lab` / `#admin` — or when the user
  // clicks the "Try the demo" button (which navigates to ?demo=1).
  // Previously this fired for EVERY unauthenticated visitor to /login,
  // silently signing real users into the demo patient account and
  // redirecting them to /patient — breaking the real sign-in journey
  // (the middleware gate is NODE_ENV-aware, but this effect wasn't).
  React.useEffect(() => {
    if (!isDemoEnabled()) return;
    if (user) return;
    if (loading || demoBusy) return;
    if (typeof window === 'undefined') return;
    // Explicit opt-in gate — no URL marker, no auto-login.
    const qs = new URLSearchParams(window.location.search);
    const wantsDemo = qs.get('demo') === '1';
    const hashRole = (window.location.hash || '').replace('#', '').toLowerCase();
    if (!wantsDemo && !(DEMO_ROLES as string[]).includes(hashRole)) return;

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
      : 'patient';
    setDemoBusy(true);
    void (async () => {
      const ok = await runDemoLogin(role);
      if (ok) {
        router.push(demoRolePath(role));
        return;
      }
      setDemoBusy(false); // session failed — fall back to the sign-in form
    })();
  }, []);

  const portalEmpathy: Record<LoginPortal, string> = {
    caretaker: 'Keep the whole family on track with shared reminders.',
    patient: 'Your personal health companion, always on.',
    doctor: 'See patients faster with smarter scheduling.',
    lab: 'More bookings, less paperwork.',
    admin: 'Monitor quality, safety, and growth.',
  };
  const visiblePortals = PORTALS;
  const active: PortalConfig = visiblePortals.find(p => p.id === loginPortal) ?? PORTALS[0]!;

  async function submit(e: React.FormEvent) {
    logger.debug('Login submit', { email, hasPassword: !!password?.length, mode, loginPortal });
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: 'Missing details',
        description: 'Email and password are required.',
        variant: 'destructive',
      });
      return;
    }
    if (
      mode === 'register' &&
      (!name ||
        !dateOfBirth ||
        !termsConsent ||
        !dataConsent ||
        !aiTrainingConsent ||
        ((active.id === 'patient' || active.id === 'caretaker') && !emergencyContact1))
    ) {
      toast({
        title: 'Almost there',
        description: !aiTrainingConsent
          ? 'Please accept the AI training consent, add your name, date of birth, accept the checkboxes, and provide an emergency contact.'
          : 'Please add your name, date of birth, accept the consent checkboxes, and provide an emergency contact.',
        variant: 'destructive',
      });
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      toast({
        title: 'Security check required',
        description: 'Please complete the human verification before continuing.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Turnstile tokens are single-use: track the token sent with each
      // request so a consumed one is never replayed.
      let effectiveCaptcha: string | undefined = captchaToken || undefined;

      if (mode === 'register') {
        await apiCall('/auth/register', {
          email,
          password,
          name,
          role: active.id,
          phone: phone ? `+${phone.replace(/\D/g, '')}` || undefined : undefined,
          dateOfBirth: dateOfBirth || undefined,
          consentAccepted: termsConsent,
          dataProcessingConsent: dataConsent,
          aiTrainingConsent,
          captchaToken: effectiveCaptcha,
        });
        toast({ title: 'Account created', description: 'Welcome to Kynthai!' });

        // The register request consumed the CAPTCHA token server-side.
        // Mint a fresh one for the auto-login below — replaying the same
        // token fails with `timeout-or-duplicate` (CAPTCHA_FAILED).
        if (turnstileSiteKey && turnstileRef.current) {
          const fresh = await turnstileRef.current.mint().catch(() => null);
          if (fresh) {
            effectiveCaptcha = fresh;
            setCaptchaToken(fresh);
          }
        }
      }

      const data = await apiCall('/auth/login', { email, password, captchaToken: effectiveCaptcha });
      const user: AuthUser = {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role,
        phone: data.phone,
        subscriptionTier: data.subscriptionTier,
        isDemo: data.isDemo,
        // COMPLIANCE: include runtime flag from login response (undefined = false for older accounts)
        isUserMinor: Boolean((data as { isUserMinor?: boolean }).isUserMinor),
      };
      login(user);

      if (mode === 'signin') {
        setInvitesLoading(true);
        try {
          const invRes = await fetch('/api/family/invite', { credentials: 'include' });
          if (invRes.ok) {
            const invites = await invRes.json();
            setPendingInvites(invites);
            if (invites.length > 0) {
              toast({
                title: `You have ${invites.length} pending invite${invites.length > 1 ? 's' : ''}`,
                description: invites
                  .map(
                    (i: { invitedBy: string; relation: string }) => `${i.invitedBy} (${i.relation})`
                  )
                  .join(', '),
                duration: 6000,
              });
            }
          }
        } catch {
          // Ignore
        } finally {
          setInvitesLoading(false);
        }
      }

      toast({
        title:
          mode === 'signin'
            ? `Welcome back, ${user.name}`
            : `Account created — welcome, ${user.name}`,
        description: `You're signed in to the ${active.label} portal.`,
      });
    } catch (err) {
      // A failed submit consumed the single-use CAPTCHA token — reset the
      // widget so the next attempt mints a fresh one instead of replaying a
      // stale token (which fails with CAPTCHA_FAILED).
      turnstileRef.current?.reset();
      setCaptchaToken(null);
      toast({
        title: mode === 'signin' ? 'Sign in failed' : 'Registration failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // ponytail: removed demoBooting loading screen — the form stays visible
  // with disabled buttons while the demo logs in, avoiding a double-loading
  // spinner (login page → target page).

  // When the user clicks "Try the demo" (or arrives at /login?demo=1) show a
  // single branded AppLoader for the whole sign-in, so the login form never
  // flickers/reloads before the portal loads its own AppLoader.
  if (demoBooting) {
    return <AppLoader label="Preparing your demo…" />;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 h-[40rem] sm:w-[40rem] w-full -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background: 'radial-gradient(closest-side, rgba(16,185,129,0.35), transparent 70%)',
          }}
        />
      </div>

      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md py-2 -my-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <KynthaiBrand />
          <button
            onClick={() => router.push('/')}
            className="hidden min-h-11 min-w-11 py-2 -my-2 text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            Home
          </button>
        </div>

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {portalEmpathy[loginPortal]}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {active.label} portal — sign in or create an account to continue.
            </p>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:max-w-md">
              {visiblePortals.map(p => (
                <button
                  key={p.id}
                  onClick={() => setLoginPortal(p.id)}
                  aria-current={loginPortal === p.id ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition-all active:scale-[0.98]',
                    loginPortal === p.id
                      ? 'border-emerald-500 shadow-lg shadow-emerald-500/10'
                      : 'border-border hover:border-emerald-500/50'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow',
                      p.gradient
                    )}
                  >
                    <p.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">{p.label}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.tagline}</p>
                </button>
              ))}
            </div>
          </div>

          <FadeIn delay={0.1}>
            <Card className="overflow-hidden border-emerald-500/20 shadow-xl shadow-emerald-900/5">
              <CardContent className="p-6 sm:p-8">
                {pendingInvites.length > 0 && (
                  <div className="mb-5 space-y-2">
                    {pendingInvites.map(inv => (
                      <div
                        key={inv.id}
                        className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Users className="h-4 w-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {inv.invitedBy} invited you as{' '}
                            <span className="text-emerald-600">{inv.relation}</span>
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
                                .then(r => r.json())
                                .then(d => d.token);
                              const res = await fetch('/api/family/invite', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'X-CSRF-Token': csrf,
                                },
                                credentials: 'include',
                                body: JSON.stringify({ action: 'accept', inviteId: inv.id }),
                              });
                              if (res.ok) {
                                setPendingInvites(p => p.filter(i => i.id !== inv.id));
                                toast({
                                  title: 'Invite accepted!',
                                  description: `You're now part of ${inv.invitedBy}'s family.`,
                                });
                              } else {
                                const d = await res.json().catch(() => ({}));
                                toast({
                                  title: 'Could not accept invite',
                                  description: d.error || 'Please try again.',
                                  variant: 'destructive',
                                });
                              }
                            } catch {
                              toast({
                                title: 'Offline',
                                description: 'Re-connected, try again.',
                                variant: 'destructive',
                              });
                            }
                          }}
                          className="shrink-0 min-h-11 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
                        >
                          Accept
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {invitesLoading && pendingInvites.length === 0 && (
                  <div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking for invites...
                  </div>
                )}

                <div className="mb-6 inline-flex rounded-full border border-border bg-muted/40 p-1">
                  <button
                    onClick={() => setMode('signin')}
                    className={cn(
                      'min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-all',
                      mode === 'signin'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setMode('register');
                      setAgeGateDismissed(false);
                      setAgeGateOpen(true);
                    }}
                    className={cn(
                      'min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-all',
                      mode === 'register'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Create Account
                  </button>
                </div>

                {isDemoEnabled() && (
                  <div className="mb-5">
                    <button
                      type="button"
                      disabled={demoBusy}
                      onClick={async () => {
                        // Inline demo login for the SELECTED portal tab — no page
                        // reload. Pick a portal above (Family/Patient/Doctor/Lab)
                        // then one tap enters that demo.
                        setDemoBusy(true);
                        const role = loginPortal as DemoRole;
                        const ok = await runDemoLogin(role);
                        if (ok) {
                          router.push(demoRolePath(role));
                          return;
                        }
                        setDemoBusy(false);
                      }}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300 disabled:opacity-60 disabled:pointer-events-none"
                    >
                      <Sparkles className="h-4 w-4" />
                      Try the {active.label} demo — explore instantly
                    </button>
                  </div>
                )}

                <div className="mb-5 flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white',
                      active.gradient
                    )}
                  >
                    <active.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{active.label} portal</p>
                    <p className="text-xs text-muted-foreground">{active.tagline}</p>
                  </div>
                </div>

                {/* ── COMPLIANCE: age-gate modal — prevents under-18 registration ─── */}
                {ageGateOpen && !ageGateDismissed && (
                  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:items-center">
                    <Card className="my-auto w-full max-w-sm border-amber-500/30 shadow-xl">
                      <CardContent className="p-6 text-center space-y-4">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <ShieldCheck className="h-6 w-6 text-amber-600" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          Age verification required
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Kynthai is designed for users{' '}
                          <span className="font-semibold text-foreground">18 years or older</span>.
                          By proceeding, you confirm that you meet this age requirement.
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          If you are under 18, a parent or legal guardian must create and manage
                          your account through the{' '}
                          <span className="text-emerald-600">Family portal</span>.
                        </p>
                        <Button
                          type="button"
                          onClick={() => {
                            setAgeGateDismissed(true);
                            setAgeGateOpen(false);
                          }}
                          variant="brand"
                          size="cta"
                          className="w-full"
                        >
                          I am 18 or older — proceed
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
                {/* ───────────────────────────────────────────────────────────────────── */}

                <form id="login-form" onSubmit={submit} className="space-y-4">
                  {/* Registration fields - always rendered, hidden when mode === 'signin' */}
                  <div
                    className={cn('space-y-3.5', mode === 'register' ? 'block' : 'hidden')}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="name">
                        Full name <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="name"
                        placeholder="Sarah Johnson"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        autoComplete="name"
                        required
                        disabled={mode !== 'register'}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Phone (optional)</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+1 (555) 123-4567"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        autoComplete="tel"
                      />
                      <p className="text-xs text-muted-foreground">
                        Used only for account security and care-team alerts.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dob">
                        Date of birth <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="dob"
                        type="date"
                        value={dateOfBirth}
                        onChange={e => setDateOfBirth(e.target.value)}
                        required
                        disabled={mode !== 'register'}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="emergency1">
                        Emergency contact 1{' '}
                        {active.id === 'patient' || active.id === 'caretaker' ? (
                          <span className="text-rose-500">*</span>
                        ) : (
                          <span className="text-muted-foreground">(optional for this portal)</span>
                        )}
                      </Label>
                      <Input
                        id="emergency1"
                        type="tel"
                        placeholder="+1 (555) 123-4567"
                        value={emergencyContact1}
                        onChange={e => setEmergencyContact1(e.target.value)}
                        autoComplete="tel"
                        required={active.id === 'patient' || active.id === 'caretaker'}
                        disabled={mode !== 'register'}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="emergency2">Emergency contact 2 (optional)</Label>
                      <Input
                        id="emergency2"
                        type="tel"
                        placeholder="+1 (555) 123-4567"
                        value={emergencyContact2}
                        onChange={e => setEmergencyContact2(e.target.value)}
                        autoComplete="tel"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">
                      Email <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>

                  {/* Confirm password field - removed as per schema update */}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">
                        Password <span className="text-rose-500">*</span>
                      </Label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => router.push('/forgot-password')}
                          className="min-h-11 min-w-11 rounded-md px-1 -mx-1 py-2 -my-2 text-[13px] font-medium text-emerald-600 underline-offset-2 hover:text-emerald-700 hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        required
                        minLength={mode === 'register' ? 8 : undefined}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(s => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Consent checkboxes - always rendered to satisfy React 19 hooks rules */}
                  <div
                    className={cn(
                      'space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3',
                      mode === 'register' ? 'block' : 'hidden'
                    )}
                  >
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        checked={termsConsent}
                        onCheckedChange={v => setTermsConsent(v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-[13px] text-muted-foreground leading-relaxed">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => router.push('/terms')}
                          className="rounded-md px-1 -mx-1 py-2 -my-2 font-medium text-emerald-600 underline"
                        >
                          Terms of Service
                        </button>{' '}
                        and{' '}
                        <button
                          type="button"
                          onClick={() => router.push('/privacy')}
                          className="rounded-md px-1 -mx-1 py-2 -my-2 font-medium text-emerald-600 underline"
                        >
                          Privacy Policy
                        </button>
                        .
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        checked={dataConsent}
                        onCheckedChange={v => setDataConsent(v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-[13px] text-muted-foreground leading-relaxed">
                        I consent to processing of my personal and health data under US health
                        data laws.{' '}
                        <span className="font-medium text-foreground">Privacy-first</span>.
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5">
                      <Checkbox
                        checked={aiTrainingConsent}
                        onCheckedChange={v => setAiTrainingConsent(v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-[13px] text-muted-foreground leading-relaxed">
                        I consent to letting Kynthai use <em>de-identified</em> health data to
                        improve AI features. My personal data is never shared or identifiable. See
                        the{' '}
                        <button
                          type="button"
                          onClick={() => router.push('/privacy')}
                          className="rounded-md px-1 -mx-1 py-2 -my-2 font-medium text-emerald-600 underline"
                        >
                          Privacy Policy
                        </button>{' '}
                        for details.
                      </span>
                    </label>
                  </div>

                  {turnstileSiteKey && (
                    <div className="flex justify-center">
                      <TurnstileWidget
                        ref={turnstileRef}
                        siteKey={turnstileSiteKey}
                        onToken={setCaptchaToken}
                        onExpire={() => setCaptchaToken(null)}
                      />
                    </div>
                  )}

                  <Button
                    id="login-submit-btn"
                    type="submit"
                    disabled={loading || demoBusy}
                    className="min-h-11 w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25 hover:from-emerald-600 hover:to-teal-700"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>

                <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  TLS in transit · document encryption at rest · Privacy-first
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
