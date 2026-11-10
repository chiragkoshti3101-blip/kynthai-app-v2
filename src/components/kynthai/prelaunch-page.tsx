'use client';

import { useEffect, useState } from 'react';

type PreLaunchPageProps = {
  onPickPortal: (portal: string) => void;
};

/* Glow light that follows the cursor inside the hero — a single, human
   touch that feels like a premium brand, not a template. */
function CursorGlow() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let x = 0, y = 0;
    let rx = 0, ry = 0;
    const raf = () => {
      rx += (x - rx) * 0.08;
      ry += (y - ry) * 0.08;
      el.style.setProperty('--x', `${rx}px`);
      el.style.setProperty('--y', `${ry}px`);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    const onMove = (e: MouseEvent) => { x = e.clientX; y = e.clientY; };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return <div ref={ref} className="fixed inset-0 pointer-events-none -z-10" style={{
    background: 'radial-gradient(650px circle at var(--x) var(--y), rgba(16,185,129,0.06), transparent 40%)',
  }} />;
}

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
    <div className="relative min-h-screen overflow-x-hidden bg-[#064e3b] text-white antialiased">
      <CursorGlow />

      {/* Nav */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-[14px] font-semibold text-[#064e3b]">
            K
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white">Kynthai</span>
        </div>
        <button
          onClick={() => onPickPortal('login')}
          className="rounded-lg px-1 text-[13px] font-medium text-white/70 transition-colors hover:text-white"
        >
          Sign in
        </button>
      </nav>

      {/* HERO — editorial, asymmetric, one job */}
      <main className="mx-auto max-w-7xl px-6 lg:px-12 py-16 lg:py-24 flex flex-col lg:flex-row items-start justify-between gap-8">
        {/* LEFT — editorial headline */}
        <div className="lg:w-[42%] flex-shrink-0 flex flex-col justify-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-emerald-200/80 mb-4">Coming soon</p>
          <h1 className="text-[clamp(3rem,9vw,5.5rem)] font-[800] leading-[1.04] tracking-[-0.035em] text-white italic font-playfair-display">
            Your family’s health,
            <br />
            finally
            <br />
            connected.
          </h1>
          <p className="mt-6 text-[16px] leading-relaxed text-white/60 max-w-[28ch]">
            Reminders that adapt, a private AI health assistant, verified doctors, and lab tests at
            your door — one calm app for everyone you care about.
          </p>
          <p className="mt-4 text-[13px] text-white/40">
            Lock in founder pricing before launch.
          </p>
        </div>

        {/* RIGHT — the email form */}
        <div className="flex-1 flex flex-col items-center justify-center lg:items-end lg:w-[50%]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              subscribe();
            }}
            className="w-full max-w-[420px] flex flex-col gap-3 group"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              autoComplete="email"
              className="h-[56px] rounded-xl border border-white/15 bg-white/5 px-5 text-[15px] text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/60 focus:ring-4 focus:ring-emerald-400/20"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="h-[56px] rounded-xl bg-white text-[#064e3b] px-8 text-[14.5px] font-semibold tracking-tight shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_20px_40px_-10px_rgba(0,0,0,0.35)] transition duration-300 hover:bg-emerald-200 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.5),0_24px_48px_-8px_rgba(0,0,0,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'loading' ? 'Joining…' : 'Join'}
            </button>
            {status !== 'success' ? (
              <>
                <p className="text-[12px] text-white/35">No spam — just the launch invite.</p>
                {status === 'error' && <p className="mt-2 text-[12px] text-rose-200">{error}</p>}
              </>
            ) : (
              <div className="bg-white/10 rounded-xl border border-white/15 px-4 py-3 text-[14px] text-white/80">
                You&rsquo;re in — doors open soon.
              </div>
            )}
          </form>
        </div>
      </main>

      {/* Quiet founder-offer strip */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 py-12 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.3em] text-emerald-200/60">
            For the first 500 members
          </p>
          <p className="mt-2 text-[16px] leading-relaxed text-white/55 max-w-[52ch] mx-auto">
            The rate you lock today never goes up while you&rsquo;re a member — even after we launch.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 py-10 flex flex-col items-center justify-between gap-3 text-center">
          <p className="text-[12px] font-semibold tracking-tight text-white">Kynthai</p>
          <p className="text-[12px] text-white/35">Encrypted at rest · HIPAA-aligned · Privacy-first</p>
          <p className="text-[11px] text-white/25">© 2026 Kynthai.</p>
        </div>
      </footer>
    </div>
  );
}
