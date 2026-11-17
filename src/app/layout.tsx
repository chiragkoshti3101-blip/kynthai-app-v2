import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { PortalShell } from './portal-shell';
import { ReticleDev } from './reticle-dev';
import { StructuredData } from '@/components/structured-data';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'optional',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'optional',
});
const playfair = Playfair_Display({
  weight: ['600','700','800'],
  variable: '--font-playfair-display',
  subsets: ['latin'],
  display: 'optional',
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kynthai.app';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Kynthai — Your family's health, connected.",
    template: '%s | Kynthai',
  },
  description:
    'AI-powered medicine reminders, doctor consults, lab tests & family health management — families around the world. Free to start. Privacy-first.',
  keywords: [
    'Kynthai',
    'family health management app',
    'medication reminder app',
    'pill reminder app',
    'medication tracker',
    'family caregiver app',
    'health companion',
    'doctor consultation app',
    'online doctor consultation',
    'telemedicine app',
    'lab test booking',
    'book lab tests online',
    'family medication management',
    'care coordination app',
    'health reminder app',
    'privacy-first health app',
    'AI health assistant',
    'medication adherence',
    'family health tracker',
    'patient portal app',
  ],
  authors: [{ name: 'Kynthai' }],
  manifest: '/manifest.json',
  openGraph: {
    title: "Kynthai — Your family's health, connected.",
    description:
      "Smart reminders, doctor consultations, and lab tests—all in one place.",
    // Keep one canonical image so crawlers do not report duplicate OG tags.
    images: [{ url: '/og-image.png', width: 1200, height: 630, type: 'image/png' }],
    type: 'website',
    locale: 'en_US',
    siteName: 'Kynthai',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Kynthai — Your family's health, connected.",
    description:
      "Smart reminders, doctor consultations, and lab tests—all in one place. Privacy-first care for families managing care together.",
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kynthai',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  alternates: {
    canonical: 'https://kynthai.app',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  // One stable browser chrome color avoids duplicate-theme metadata reports.
  themeColor: '#0f9f6e',
  viewportFit: 'cover',
  // Founder P0 (APK): resizes the layout viewport when the soft keyboard opens
  // so the AI composer / inputs stay visible instead of being covered.
  // (Android Chromium ≥108; pairs with adjustResize in AndroidManifest.xml.)
  interactiveWidget: 'resizes-content',
} as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-deploy-version={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'}>
      <head>
        <StructuredData />
        {/* Instant first paint — prevents black/white flash on PWA cold start */}
        {/* The `prefers-color-scheme` fallbacks matter: next-themes strips the
            theme class and re-applies it a few frames later while it resolves
            `system`, and without them that gap painted the light background for
            a dark-mode visitor (the iOS light↔dark flash). `html:not(.light)`
            keeps an explicit light choice light while the class is missing.
            `-webkit-overflow-scrolling:auto` cancels the legacy override at the
            bottom of globals.css that makes WKWebView flicker while scrolling. */}
        <style dangerouslySetInnerHTML={{ __html: 'html,body{background:#f9fdfb!important;margin:0;min-height:100%;background-color:#f9fdfb;color-scheme:light;-webkit-overflow-scrolling:auto!important}html.dark,html.dark body{background:#070f0c!important;background-color:#070f0c;color-scheme:dark}@media (prefers-color-scheme:dark){html:not(.light),html:not(.light) body{background:#070f0c!important;background-color:#070f0c;color-scheme:dark}}#kynthai-boot{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f9fdfb;color:#064e3b;font-family:system-ui,sans-serif;font-weight:600;font-size:18px;letter-spacing:0.02em;transition:opacity .18s ease-out,visibility 0s linear .18s}html.dark #kynthai-boot{background:#070f0c;color:#ecfdf5}@media (prefers-color-scheme:dark){html:not(.light) #kynthai-boot{background:#070f0c;color:#ecfdf5}}#kynthai-boot.done{opacity:0;visibility:hidden;pointer-events:none}' }} />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Preconnect to critical origins for faster DNS + TLS */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://livekit.kynthai.app" />
        {/* Anti-FOUC: next-themes applies the theme class during hydration;
            without this pre-paint script, mobile Safari flashes white↔dark
            on every page load when the persisted theme differs from the
            default. Matches next-themes' 'theme' localStorage key. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=document.documentElement;var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark)d.classList.add('dark');}catch(e){}function done(){var b=document.getElementById('kynthai-boot');if(b&&!b.classList.contains('done'))b.classList.add('done');}function dismissBoot(){if(!document.getElementById('kynthai-boot'))return;requestAnimationFrame(function(){requestAnimationFrame(done);});}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',dismissBoot);}else{dismissBoot();}setTimeout(done,1200);})();`,
          }}
        />
        {/* ponytail: switch sizing is now handled entirely by inline styles
            in the Switch component — no CSS cache issues possible. */}
        {/* Stripe publishable key for frontend payment components */}
        {process.env.NEXT_PUBLIC_STRIPE_PK &&
          !/PLACEHOLDER|placeholder|REPLACE_WITH/i.test(process.env.NEXT_PUBLIC_STRIPE_PK) && (
          <meta name="stripe-pk" content={process.env.NEXT_PUBLIC_STRIPE_PK} />
        )}
        {/* Google Analytics 4 — loaded only when consent is granted via analytics-consent.ts */}
        {process.env.NEXT_PUBLIC_GA_ID &&
          !/PLACEHOLDER|placeholder|REPLACE_WITH/i.test(process.env.NEXT_PUBLIC_GA_ID) && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">{`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', { send_page_view: false });
            `}</Script>
          </>
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased text-foreground`}
      >
        {/* Deferred script for iOS Safari tab-restore recovery & chunk-load error retry */}
        <script defer src="/sw-recovery.js" />
        {/* ACCESSIBILITY: Skip link for keyboard/screen-reader users — FIXED */}
        <a
          href="#main-content"
          className="sr-only pointer-events-none focus:not-sr-only focus:pointer-events-auto focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-3 focus:text-white focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>
        {/* Raw HTML inside a React-owned shell on purpose: React rewrites
            `className` on the elements it manages, which re-opaqued the splash
            mid-fade (a full-screen white/dark blink on iOS). Markup parsed from
            innerHTML is never reconciled, so the fade survives hydration.
            BootSplashCleanup removes the shell after the fade has finished. */}
        <div id="kynthai-boot-shell">
          <div
            dangerouslySetInnerHTML={{
              __html: '<div id="kynthai-boot" aria-hidden="true">Kynthai</div>',
            }}
          />
        </div>
        <Providers>
          <PortalShell>{children}</PortalShell>
        </Providers>
        {process.env.NODE_ENV === 'development' && <ReticleDev />}
      </body>
    </html>
  );
}
