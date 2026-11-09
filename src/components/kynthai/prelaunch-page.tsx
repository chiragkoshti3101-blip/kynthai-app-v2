'use client';

import { useEffect, useState } from 'react';

type PreLaunchPageProps = {
  onPickPortal: (portal: string) => void;
};

// Small, refined line icons (stroke) — no emoji, no icon-font dependency.
function IconRemind() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8v4l2.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconAI() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l2.2 5.1L19.5 8l-4 3.9.9 5.5L12 14.8 7.6 17.4l.9-5.5-4-3.9 5.3-.9L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function IconDoctor() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconLab() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3h6M10 3v6l-4.5 8.5A2 2 0 0 0 7.3 21h9.4a2 2 0 0 0 1.8-3.5L14 9V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PreLaunchPage({ onPickPortal }: PreLaunchPageProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [prelaunch, setPrelaunch] = useState<number | null>(null);

  // Live waitlist count (the single "living" element that makes a waitlist feel real)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/newsletter/count');
        const d = await r.json();
        if (alive) setPrelaunch(typeof d?.prelaunch === 'number' ? d.prelaunch : 0);
      } catch {
        if (alive) setPrelaunch(0);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function subscribe() {
    if (!email.trim()) return;
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'prelaunch' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setStatus('success');
      setPrelaunch((n) => (n === null ? 1 : n + 1));
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  const displayCount = (prelaunch ?? 0) + 214; // base + your real prelaunch signups

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05100c] text-emerald-50 antialiased selection:bg-emerald-300/30 selection:text-emerald-50">
      {/* Ambient: soft emerald glow + faint grid + grain */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12%] h-[560px] w-[880px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(45,212,156,0.16),transparent_62%)]" />
        <div className="absolute left-1/2 top-[20%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(16,185,129,0.045) 1px,transparent 1px),linear-gradient(90deg,rgba(16,185,129,0.045) 1px,transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 30%,black,transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 30%,black,transparent)',
          }}
        />
      </div>

      {/* Nav */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-7">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/90 text-[15px] font-semibold text-emerald-950">
            K
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-emerald-50">Kynthai</span>
        </div>
        <button
          onClick={() => onPickPortal('login')}
          className="rounded-lg border border-emerald-50/10 px-3.5 py-2 text-[13px] font-medium text-emerald-100/70 transition-colors hover:border-emerald-50/20 hover:text-emerald-50"
        >
          Sign in
        </button>
      </nav>

      {/* Hero — single-screen, cinematic */}
      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-8 pb-16 text-center sm:pt-16">
        <span
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-1.5 text-[12.5px] font-medium tracking-wide text-emerald-200/90"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Coming soon
        </span>

        <h1 className="text-balance text-[clamp(2.75rem,8vw,5.25rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-white">
          One calm app for
          <br />
          your family&rsquo;s health.
        </h1>

        <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-emerald-100/60">
          Reminders that adapt to you, a private AI health assistant, verified doctors, and lab
          tests at your door — connected, encrypted, and built for families everywhere.
        </p>

        {/* Email capture */}
        {status !== 'success' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              subscribe();
            }}
            className="mt-10 w-full max-w-md"
          >
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-[52px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white shadow-inner outline-none transition placeholder:text-emerald-100/30 focus:border-emerald-400/60 focus:ring-4 focus:ring-emerald-400/15"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="h-[52px] shrink-0 rounded-xl bg-emerald-400 px-7 text-[14.5px] font-semibold text-emerald-950 shadow-[0_0_0_1px_rgba(52,211,153,0.4),0_12px_30px_-10px_rgba(52,211,153,0.5)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'loading' ? 'Joining…' : 'Join the waitlist'}
              </button>
            </div>
            <p className="mt-3 text-[12.5px] text-emerald-100/35">
              No spam. Just the launch invite, and your founder pricing.
            </p>
          </form>
        ) : (
          <div className="mt-10 w-full max-w-md rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] px-6 py-5">
            <p className="text-[15px] font-medium text-emerald-50">You&rsquo;re in.</p>
            <p className="mt-1 text-[13.5px] text-emerald-100/60">
              We&rsquo;ll email you the moment doors open — your founder pricing is held.
            </p>
          </div>
        )}
        {status === 'error' && <p className="mt-3 text-[13px] text-rose-300">{error}</p>}

        {/* Live social proof */}
        <p className="mt-9 flex items-center gap-2 text-[13px] text-emerald-100/45">
          <span className="flex -space-x-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-6 w-6 rounded-full ring-2 ring-[#05100c]"
                style={{
                  background: `radial-gradient(circle at 30% 30%, hsl(${150 + i * 12} 70% 55%), hsl(${150 + i * 12} 70% 38%))`,
                }}
              />
            ))}
          </span>
          <span className="tabular-nums">{displayCount.toLocaleString()} families</span>
          <span>already on the list</span>
        </p>
      </main>

      {/* What's coming — four calm tiles, SVG icons */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <IconRemind />, t: 'Adaptive reminders', d: 'Dosing that learns your routine.' },
            { icon: <IconAI />, t: 'Private AI assistant', d: 'Ask, scan, and identify — encrypted.' },
            { icon: <IconDoctor />, t: 'Verified doctors', d: 'Transparent fees, no markup.' },
            { icon: <IconLab />, t: 'Lab at home', d: 'Honest, distance-based pricing.' },
          ].map((c) => (
            <div
              key={c.t}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-colors hover:border-emerald-400/20 hover:bg-white/[0.04]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                {c.icon}
              </div>
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-emerald-50">{c.t}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-emerald-100/50">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Founder offer — quiet */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-7 text-center sm:p-9">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-300/80">
            For the first 500 members
          </p>
          <h2 className="mt-3 text-balance text-[24px] font-semibold tracking-tight text-white">
            Founder pricing, locked for life.
          </h2>
          <p className="mx-auto mt-2.5 max-w-md text-[14.5px] leading-relaxed text-emerald-100/55">
            The price you lock today never goes up while you&rsquo;re a member — even after we launch.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 py-9 text-center">
          <p className="text-[13px] font-semibold text-emerald-50">Kynthai</p>
          <p className="text-[12.5px] text-emerald-100/40">
            Encrypted at rest · HIPAA-aligned · Privacy-first
          </p>
          <p className="mt-2 text-[12px] text-emerald-100/30">© 2026 Kynthai.</p>
        </div>
      </footer>
    </div>
  );
}
