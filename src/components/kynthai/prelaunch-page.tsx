'use client';

import { useState } from 'react';

type PreLaunchPageProps = {
  onPickPortal: (portal: string) => void;
};

export function PreLaunchPage({ onPickPortal }: PreLaunchPageProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

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
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="min-h-screen bg-[#f9fdfb] text-[#0b1f19] antialiased selection:bg-emerald-100 selection:text-emerald-900">
      {/* Nav */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-7">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-[15px] font-semibold text-white">
            K
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-emerald-950">Kynthai</span>
        </div>
        <button
          onClick={() => onPickPortal('login')}
          className="text-[13px] font-medium text-emerald-800/70 transition-colors hover:text-emerald-800"
        >
          Sign in
        </button>
      </nav>

      {/* Hero — pure typography, centered, restrained */}
      <main className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-16 pb-24 text-center sm:pt-24">
        <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-950/10 bg-white px-3.5 py-1.5 text-[12.5px] font-medium tracking-wide text-emerald-800/80 shadow-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Coming soon
        </span>

        <h1 className="text-balance text-[clamp(2.5rem,7vw,4.5rem)] font-semibold leading-[1.04] tracking-[-0.025em] text-emerald-950">
          One calm app for your
          <br className="hidden sm:block" /> family&rsquo;s entire health.
        </h1>

        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#4d6159]">
          Medicine reminders that adapt to you, a private AI health assistant, verified doctors,
          and lab tests at your door. Connected, encrypted, and built for families — launching soon.
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
                className="flex-1 rounded-xl border border-emerald-950/10 bg-white px-4 py-3.5 text-[15px] text-emerald-950 shadow-sm outline-none transition placeholder:text-emerald-900/35 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="shrink-0 rounded-xl bg-emerald-700 px-6 py-3.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'loading' ? 'Joining…' : 'Join early'}
              </button>
            </div>
            <p className="mt-3 text-[12.5px] text-emerald-900/40">
              No spam — just the launch invite and your founder pricing.
            </p>
          </form>
        ) : (
          <div className="mt-10 w-full max-w-md rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-6 py-5">
            <p className="text-[15px] font-medium text-emerald-900">You&rsquo;re on the list.</p>
            <p className="mt-1 text-[13.5px] text-emerald-800/70">
              We&rsquo;ll email you the moment doors open — and your founder pricing is held.
            </p>
          </div>
        )}

        {status === 'error' && <p className="mt-3 text-[13px] text-rose-600">{error}</p>}
      </main>

      {/* Founder offer — quiet, centered */}
      <section className="border-y border-emerald-950/8 bg-white">
        <div className="mx-auto max-w-2xl px-6 py-12 text-center sm:py-14">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-emerald-700/70">
            For the first 500 members
          </p>
          <h2 className="mt-4 text-balance text-[26px] font-semibold tracking-tight text-emerald-950">
            Founder pricing, locked for life.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-[#4d6159]">
            Join now and keep a permanently discounted Plus plan. The price you lock today never
            goes up while you&rsquo;re a member — even after we launch.
          </p>
        </div>
      </section>

      {/* What&rsquo;s inside — minimal, two-column, no icons */}
      <section className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
        <h2 className="text-center text-[20px] font-semibold tracking-tight text-emerald-950">
          What&rsquo;s inside when we launch
        </h2>
        <dl className="mt-10 space-y-8">
          {[
            {
              dt: 'Smart medicine reminders',
              dd: 'Dosing alerts that learn your routine and nudge you at the right moment — not just the hour you set.',
            },
            {
              dt: 'A private AI health assistant',
              dd: 'Ask anything, scan a prescription, or identify a medicine. Encrypted, and yours alone.',
            },
            {
              dt: 'Verified doctors, transparent fees',
              dd: 'Book practitioners who set their own prices in the open. No hidden markup on your side.',
            },
            {
              dt: 'Lab tests, at home',
              dd: 'Order blood tests and more with home collection, priced honestly by distance.',
            },
          ].map((f) => (
            <div key={f.dt} className="grid gap-2 sm:grid-cols-[minmax(10rem,16rem)_1fr] sm:gap-6">
              <dt className="text-[15px] font-semibold text-emerald-950">{f.dt}</dt>
              <dd className="text-[14.5px] leading-relaxed text-[#4d6159]">{f.dd}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Footer */}
      <footer className="border-t border-emerald-950/8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-6 py-10 text-center">
          <p className="text-[13px] font-semibold text-emerald-950">Kynthai</p>
          <p className="text-[12.5px] text-emerald-900/45">
            Encrypted at rest · HIPAA-aligned · Privacy-first
          </p>
          <p className="mt-2 text-[12.5px] text-emerald-900/40">© 2026 Kynthai.</p>
        </div>
      </footer>
    </div>
  );
}
