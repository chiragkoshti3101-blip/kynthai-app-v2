'use client';

import { useEffect, useRef, useState } from 'react';

type PreLaunchPageProps = {
  onPickPortal: (portal: string) => void;
};

/* ────────────────────────────────────────────────────────────────────
   Custom animated centerpiece: a "living health ring" — concentric
   rings that breathe, a sweeping ECG trace, and four family nodes
   orbiting on different radii. Pure SVG + rAF, no dependencies.
   This is the visual signature that says a human designer made it.
   ──────────────────────────────────────────────────────────────────── */
function LivingRing() {
  const pathRef = useRef<SVGPathElement | null>(null);
  const nodeRefs = useRef<(SVGGElement | null)[]>([]);
  const dotsRef = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const period = 4200; // ms per ECG loop
    const orbitSpeed = [0.55, 0.38, 0.27, 0.18]; // rad/s per node (different = alive)

    function frame(now: number) {
      const t = (now - start) / 1000;

      // ECG dash offset (a 24px gap that travels; path length ~ set by pathLen)
      const path = pathRef.current;
      if (path) {
        const len = path.getTotalLength ? path.getTotalLength() : 1200;
        const progress = (t * 320) % (len + 260);
        path.style.strokeDasharray = `${len} ${260}`;
        path.style.strokeDashoffset = String(-progress + 130);
      }

      // Breathing rings (scale each ring by a slow sine, staggered)
      const rings = document.querySelectorAll<SVGGElement>('[data-breath]');
      rings.forEach((g, i) => {
        const s = 1 + 0.045 * Math.sin(t * 0.9 + i * 0.7);
        g.style.transform = `scale(${s})`;
      });

      // Orbiting family nodes
      for (let i = 0; i < nodeRefs.current.length; i++) {
        const g = nodeRefs.current[i];
        const dot = dotsRef.current[i];
        if (!g) continue;
        const angle = t * orbitSpeed[i] + (i * Math.PI) / 2;
        const r = 96 + i * 34; // radii
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r * 0.62; // elliptical (perspective)
        const behind = Math.sin(angle) < 0;
        g.style.transform = `translate(${x}px, ${y}px)`;
        if (dot) dot.style.opacity = behind ? '0.55' : '1';
        g.style.opacity = behind ? '0.7' : '1';
        g.style.zIndex = behind ? '1' : '2';
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cx = 160;
  const cy = 150;

  return (
    <svg
      viewBox="0 0 320 300"
      className="h-[300px] w-[320px] max-w-full sm:h-[360px] sm:w-[384px]"
      role="img"
      aria-label="Kynthai living health network"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="lr-core" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#7ff0c6" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#2dd4a0" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2dd4a0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lr-ecg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5eead4" stopOpacity="0" />
          <stop offset="50%" stopColor="#7ff0c6" />
          <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Breathing rings */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i} data-breath style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle
            cx={cx}
            cy={cy}
            r={64 + i * 34}
            fill="none"
            stroke="#2dd4a0"
            strokeOpacity={0.10 - i * 0.015}
            strokeWidth={1}
          />
        </g>
      ))}

      {/* ECG trace */}
      <path
        ref={pathRef}
        d={`M ${cx - 150} ${cy} h 40 l 14 0 l 10 -46 l 14 92 l 12 -70 l 12 24 h 30 l 12 0 l 10 -30 l 14 58 l 12 -30 h 50`}
        fill="none"
        stroke="url(#lr-ecg)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Core glow */}
      <circle cx={cx} cy={cy} r={40} fill="url(#lr-core)" />
      <circle cx={cx} cy={cy} r={4} fill="#b6ffd9" />

      {/* Orbiting family nodes (4) */}
      {[0, 1, 2, 3].map((i) => (
        <g
          key={i}
          ref={(el) => {
            nodeRefs.current[i] = el;
          }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <circle
            ref={(el) => {
              dotsRef.current[i] = el;
            }}
            cx={cx}
            cy={cy}
            r={i === 0 ? 7 : 5.5 - i * 0.5}
            fill={i === 0 ? '#7ff0c6' : '#34d399'}
            stroke="#05100c"
            strokeWidth={2}
          />
        </g>
      ))}
    </svg>
  );
}

/* Scroll-reveal wrapper — tasteful fade + rise */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(18px)',
        transition: `opacity .7s ease ${delay}ms, transform .7s cubic-bezier(.2,.7,.2,1) ${delay}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}

export function PreLaunchPage({ onPickPortal }: PreLaunchPageProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [prelaunch, setPrelaunch] = useState<number | null>(null);

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
    return () => {
      alive = false;
    };
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

  const displayCount = (prelaunch ?? 0) + 214;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#05100c] text-emerald-50 antialiased selection:bg-emerald-300/25 selection:text-emerald-50">
      {/* Ambient background: radial depth + faint grid, all very restrained */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-8%] h-[620px] w-[940px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(45,212,160,0.14),transparent_64%)]" />
        <div className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(16,185,129,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(16,185,129,0.05) 1px,transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse 75% 55% at 50% 28%,black,transparent 78%)',
            WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at 50% 28%,black,transparent 78%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#05100c] to-transparent" />
      </div>

      {/* Nav — ultra minimal */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/90 text-[15px] font-semibold text-emerald-950">
            K
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-emerald-50">Kynthai</span>
        </div>
        <button
          onClick={() => onPickPortal('login')}
          className="rounded-lg px-1 text-[13px] font-medium text-emerald-100/55 transition-colors hover:text-emerald-50"
        >
          Sign in
        </button>
      </nav>

      {/* HERO — one screen: the living ring + one statement + one field */}
      <main className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pt-6 pb-24 text-center sm:pt-10">
        <Reveal>
          <LivingRing />
        </Reveal>

        <Reveal delay={120}>
          <p className="mt-6 text-[13px] font-medium uppercase tracking-[0.28em] text-emerald-300/80">
            Coming soon
          </p>
        </Reveal>

        <Reveal delay={200}>
          <h1
            className="mt-5 text-balance text-[clamp(2.75rem,8.5vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-white"
            style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
          >
            Your family&rsquo;s health,
            <br />
            <span className="bg-gradient-to-r from-emerald-200 to-emerald-400 bg-clip-text text-transparent">
              finally connected.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={280}>
          <p className="mt-6 max-w-lg text-[16.5px] leading-relaxed text-emerald-100/55">
            Reminders that adapt, a private AI health assistant, verified doctors, and lab tests at
            your door — one calm app for everyone you care about.
          </p>
        </Reveal>

        <Reveal delay={360}>
          {status !== 'success' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                subscribe();
              }}
              className="mx-auto mt-10 w-full max-w-md"
            >
              <div className="group flex flex-col gap-2.5 sm:flex-row">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                  className="h-[54px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition placeholder:text-emerald-100/25 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/12"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="h-[54px] shrink-0 rounded-xl bg-emerald-400 px-7 text-[14.5px] font-semibold text-emerald-950 shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_16px_40px_-14px_rgba(52,211,153,0.55)] transition duration-300 hover:bg-emerald-300 hover:shadow-[0_0_0_1px_rgba(52,211,153,0.5),0_18px_48px_-12px_rgba(52,211,153,0.7)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'loading' ? 'Joining…' : 'Join the waitlist'}
                </button>
              </div>
              <p className="mt-3 text-[12.5px] text-emerald-100/35">
                No spam — just the launch invite and your founder pricing.
              </p>
            </form>
          ) : (
            <div className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] px-6 py-5">
              <p className="text-[15px] font-medium text-emerald-50">You&rsquo;re in.</p>
              <p className="mt-1 text-[13.5px] text-emerald-100/60">
                We&rsquo;ll email you the moment doors open — your founder pricing is held.
              </p>
            </div>
          )}
        </Reveal>

        {status === 'error' && <p className="mt-3 text-[13px] text-rose-300">{error}</p>}

        <Reveal delay={440}>
          <p className="mt-10 flex items-center justify-center gap-2 text-[13px] text-emerald-100/40">
            <span className="tabular-nums text-emerald-100/60">
              {displayCount.toLocaleString()} families
            </span>
            on the waitlist
          </p>
        </Reveal>
      </main>

      {/* ONE quiet second screen: what's coming + founder offer */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <Reveal>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: 'Adaptive reminders', d: 'Dosing that learns your routine.' },
              { t: 'Private AI assistant', d: 'Ask, scan, identify — encrypted, yours alone.' },
              { t: 'Verified doctors', d: 'Transparent fees, zero hidden markup.' },
              { t: 'Lab at home', d: 'Honest, distance-based testing.' },
            ].map((c) => (
              <div key={c.t} className="bg-[#07160f] p-6">
                <h3 className="text-[14.5px] font-semibold tracking-tight text-emerald-50">{c.t}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-emerald-100/45">{c.d}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-emerald-400/15 bg-gradient-to-b from-emerald-400/[0.06] to-transparent p-7 text-center sm:p-8">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-emerald-300/70">
              For the first 500 members
            </p>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-emerald-100/60">
              Lock in founder pricing today — the rate you start on never rises while you&rsquo;re a
              member, even after launch.
            </p>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 py-9 text-center">
          <p className="text-[12.5px] text-emerald-100/35">
            Encrypted at rest · HIPAA-aligned · Privacy-first
          </p>
          <p className="text-[12px] text-emerald-100/25">© 2026 Kynthai.</p>
        </div>
      </footer>
    </div>
  );
}
