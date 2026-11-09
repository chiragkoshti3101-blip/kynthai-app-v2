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
      {/* Nav — minimal, quiet */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
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
          Have an account? Sign in
        </button>
      </nav>

      {/* Hero — product-forward, editorial */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-4 pb-20 sm:pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        {/* Copy */}
        <div className="order-2 lg:order-1">
          <p className="mb-6 inline-flex items-center gap-2 text-[12.5px] font-medium tracking-wide text-emerald-700/80">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Coming soon
          </p>
          <h1 className="text-balance text-[clamp(2.5rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-emerald-950">
            One calm app for your<br className="hidden sm:block" /> family&rsquo;s entire health.
          </h1>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-[#4d6159]">
            Medicine reminders that actually adapt, a private AI health assistant, verified doctors,
            and lab tests at your door. Everything connected — built with your privacy as the default.
          </p>

          {/* Email capture */}
          {status !== 'success' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                subscribe();
              }}
              className="mt-9 max-w-md"
            >
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                  className="h-12 flex-1 rounded-xl border border-emerald-950/10 bg-white px-4 text-[15px] text-emerald-950 placeholder:text-emerald-900/35 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="h-12 shrink-0 rounded-xl bg-emerald-700 px-6 text-[14px] font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'loading' ? 'Joining…' : 'Join early'}
                </button>
              </div>
              <p className="mt-3 text-[12.5px] text-emerald-900/40">
                Be first in line. No spam — just the launch invite and your founder pricing.
              </p>
            </form>
          ) : (
            <div className="mt-9 max-w-md rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-5 py-4">
              <p className="text-[15px] font-medium text-emerald-900">You&rsquo;re on the list.</p>
              <p className="mt-1 text-[13px] text-emerald-800/70">
                We&rsquo;ll email you the moment doors open — and your founder pricing is held.
              </p>
            </div>
          )}

          {status === 'error' && <p className="mt-3 text-[13px] text-rose-600">{error}</p>}
        </div>

        {/* Product */}
        <div className="order-1 flex justify-center lg:order-2">
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-emerald-200/50 via-emerald-100/40 to-transparent blur-2xl" />
            <div className="w-[300px] overflow-hidden rounded-[2.25rem] border border-emerald-950/10 bg-white shadow-[0_40px_80px_-24px_rgba(7,128,95,0.35)] ring-1 ring-emerald-950/5">
              <img
                src="/product-mobile.png"
                alt="Kynthai patient dashboard"
                className="block h-auto w-full select-none"
                draggable={false}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Founder offer — calm, concrete */}
      <section className="border-y border-emerald-950/8 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
          <div className="grid items-center gap-8 sm:grid-cols-[auto_1fr]">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold tracking-wide text-emerald-800 ring-1 ring-emerald-200/70">
              For the first 500 members
            </span>
            <div>
              <h2 className="text-[19px] font-semibold tracking-tight text-emerald-950">
                Founder pricing, locked for life.
              </h2>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[#4d6159]">
                Join the waitlist now and keep a permanently discounted Plus plan — the price you
                lock today never goes up while you&rsquo;re a member, even after launch.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What&rsquo;s inside — clean list, no emoji */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <h2 className="text-[22px] font-semibold tracking-tight text-emerald-950">
          What you&rsquo;ll get on launch day
        </h2>
        <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {[
            {
              title: 'Smart medicine reminders',
              body: 'Dosing alerts that learn your routine and nudge you at the right moment — not just the hour you set.',
            },
            {
              title: 'A private AI health assistant',
              body: 'Ask anything, scan a prescription, or identify a medicine. Your data stays encrypted and yours alone.',
            },
            {
              title: 'Verified doctors',
              body: 'Book and consult practitioners who set their own fees in the open. No hidden markup on your side.',
            },
            {
              title: 'Lab tests, at home',
              body: 'Order blood tests and more with home collection, priced honestly by distance — you always see the real cost.',
            },
          ].map((f) => (
            <div key={f.title} className="flex gap-4">
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8.5 6 11.5 13 4.5" stroke="#047857" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <h3 className="text-[15.5px] font-semibold tracking-tight text-emerald-950">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[#4d6159]">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Close the loop */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-2xl bg-emerald-950 px-8 py-12 text-center sm:px-12">
          <h2 className="text-balance text-[clamp(1.75rem,3.5vw,2.25rem)] font-semibold leading-tight tracking-[-0.01em] text-emerald-50">
            Be part of it from day one.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-emerald-100/70">
            A few hundred families are already on the list. Reserve yours and lock in the founder rate.
          </p>
          {status !== 'success' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                subscribe();
              }}
              className="mx-auto mt-8 flex max-w-md flex-col gap-2.5 sm:flex-row"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="h-12 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 text-[15px] text-white placeholder:text-emerald-100/40 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/20"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="h-12 shrink-0 rounded-xl bg-emerald-400 px-6 text-[14px] font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'loading' ? 'Joining…' : 'Reserve my spot'}
              </button>
            </form>
          ) : (
            <p className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13.5px] text-emerald-50 ring-1 ring-white/15">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8.5 6 11.5 13 4.5" stroke="#6ee7b7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              You&rsquo;re reserved — watch your inbox for the launch.
            </p>
          )}
          {status === 'error' && <p className="mt-3 text-[13px] text-rose-300">{error}</p>}
        </div>
      </section>

      {/* Footer — quiet, honest */}
      <footer className="border-t border-emerald-950/8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-[13px] font-semibold text-emerald-950">Kynthai</p>
            <p className="mt-1 text-[12.5px] text-emerald-900/45">
              Encrypted at rest · HIPAA-aligned · Privacy-first
            </p>
          </div>
          <p className="text-[12.5px] text-emerald-900/40">
            © 2026 Kynthai.
          </p>
        </div>
      </footer>
    </div>
  );
}
