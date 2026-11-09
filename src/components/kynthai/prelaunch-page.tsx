'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LoginPortal } from '@/lib/store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PreLaunchPageProps {
  onPickPortal?: (portal?: string) => void;
}

// ─── Feature list (static, no data dependency) ───────────────────────────────

const FEATURES = [
  {
    icon: '💊',
    title: 'Smart medicine reminders',
    desc: 'AI-powered dosing alerts that adapt to your routine — never miss a dose again.',
  },
  {
    icon: '👩‍⚕️',
    title: 'Doctor consultations',
    desc: 'Book and connect with verified doctors who set their own transparent fees.',
  },
  {
    icon: '🔬',
    title: 'Lab testing at home',
    desc: 'Order blood tests and more. Home collection with honest, distance-based pricing.',
  },
  {
    icon: '🤖',
    title: 'AI health assistant',
    desc: 'Ask questions, scan prescriptions, and identify medicines with your personal AI.',
  },
  {
    icon: '👨‍👩‍👧‍👦',
    title: 'Family health hub',
    desc: 'Manage up to 4 family members, share lab results, and coordinate care together.',
  },
  {
    icon: '🔒',
    title: 'Privacy-first, always',
    desc: 'HIPAA-aligned design, encrypted storage, and you own your data — always.',
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function PreLaunchPage({ onPickPortal }: PreLaunchPageProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  const handleSubscribe = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      setErrorMsg('Please enter a valid email address.');
      inputRef.current?.focus();
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), source: 'other' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }, [email, status]);

  // Pulse the input on success (small delight)
  useEffect(() => {
    if (status === 'success' && submittedRef.current) {
      // already handled
    }
  }, [status]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submittedRef.current = true;
    handleSubscribe(e);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/40 dark:from-emerald-950/20 dark:via-background dark:to-emerald-900/10" />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* ─── Top nav ─────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
            K
          </div>
          <span className="text-lg font-semibold tracking-tight">Kynthai</span>
        </div>
        {onPickPortal && (
          <button
            onClick={() => onPickPortal('patient')}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Have an account? Sign in
          </button>
        )}
      </nav>

      {/* ─── Main hero ──────────────────────────────────────────────────── */}
      <main className="relative z-10 flex flex-col items-center px-4 pb-16 pt-8 sm:px-6 sm:pt-14 lg:pt-20">
        {/* Coming soon badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </span>
          Launching Soon
        </div>

        {/* Headline */}
        <h1 className="max-w-2xl text-center text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          Your family&apos;s health,{' '}
          <span className="text-emerald-600">connected.</span>
        </h1>

        {/* Sub-headline */}
        <p className="mt-5 max-w-xl text-center text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Kynthai brings smart medicine reminders, AI-powered health chat,
          verified doctor consults, and home lab testing — all in one
          privacy-first app built for families worldwide.
        </p>

        {/* ─── Email capture ─────────────────────────────────────────────── */}
        <div className="mt-10 w-full max-w-md">
          {status === 'success' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
              <div className="mb-1 text-2xl">🎉</div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                You&apos;re on the list!
              </p>
              <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                You&apos;ll be the first to know when Kynthai launches — and you&apos;ll
                lock in <strong>founder pricing</strong> for life. No spam, ever.
              </p>
              <p className="mt-3 text-xs text-emerald-600/60">
                {email} is confirmed.
              </p>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} noValidate>
              <div className="flex gap-2 sm:gap-3">
                <div className="relative flex-1">
                  <label htmlFor="prelaunch-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    ref={inputRef}
                    id="prelaunch-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (status === 'error') { setStatus('idle'); setErrorMsg(''); } }}
                    placeholder="you@example.com"
                    disabled={status === 'loading'}
                    className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="h-12 whitespace-nowrap rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {status === 'loading' ? 'Joining…' : 'Join early'}
                </button>
              </div>

              {status === 'error' && errorMsg && (
                <p className="mt-2 text-sm text-red-500" role="alert">{errorMsg}</p>
              )}

              <p className="mt-3 text-xs text-muted-foreground/70">
                🔐 <strong>Founder perk:</strong> Register before launch and lock in
                <span className="font-semibold text-foreground"> lifetime founder pricing</span> —
                a discounted Plus plan you keep for as long as you&apos;re a member.
              </p>
            </form>
          )}
        </div>

        {/* ─── Social proof strip ───────────────────────────────────────── */}
        <div className="mt-8 flex items-center gap-6 text-xs text-muted-foreground/60">
          <span>🔒 Encrypted at rest</span>
          <span>·</span>
          <span>HIPAA-aligned</span>
          <span>·</span>
          <span>Privacy-first</span>
        </div>

        {/* ─── Feature grid ─────────────────────────────────────────────── */}
        <section aria-label="What&apos;s coming" className="mt-16 w-full max-w-4xl sm:mt-20">
          <h2 className="mb-8 text-center text-2xl font-bold tracking-tight sm:text-3xl">
            What&apos;s inside when we launch
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:shadow-md"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl transition-colors group-hover:bg-emerald-100 dark:bg-emerald-950/40 dark:group-hover:bg-emerald-900/40">
                  {f.icon}
                </div>
                <h3 className="mb-1.5 text-sm font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Founder pricing callout ──────────────────────────────────── */}
        <section className="mt-14 w-full max-w-lg sm:mt-16">
          <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-center dark:border-emerald-700 dark:bg-emerald-950/20">
            <div className="mb-2 text-3xl">⚡</div>
            <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
              Founders only — limited spots
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-emerald-700/80 dark:text-emerald-400/80">
              The first group of members gets <strong>founder pricing locked in permanently</strong> —
              a significant discount on the Plus plan that never increases, plus early access
              to new features before public release. Once the founder tier is full, it&apos;s gone.
            </p>
            {status !== 'success' && (
              <button
                onClick={() => {
                  inputRef.current?.focus();
                  document.getElementById('prelaunch-email')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                Lock in your spot
              </button>
            )}
            {status === 'success' && (
              <p className="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                ✓ Spot reserved — we&apos;ll email you at launch
              </p>
            )}
          </div>
        </section>

        {/* ─── Footer ───────────────────────────────────────────────────── */}
        <footer className="mt-16 flex w-full flex-col items-center gap-3 text-xs text-muted-foreground/60 sm:mt-20">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-[10px] font-bold text-white">
              K
            </div>
            <span>Kynthai</span>
          </div>
          <p>Built with care for families everywhere. Privacy-first · HIPAA-aligned · Encrypted at rest.</p>
          <p>© {new Date().getFullYear()} Kynthai. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="/privacy" className="transition-colors hover:text-foreground">Privacy</a>
            <a href="/terms" className="transition-colors hover:text-foreground">Terms</a>
            <a href="/contact" className="transition-colors hover:text-foreground">Contact</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
