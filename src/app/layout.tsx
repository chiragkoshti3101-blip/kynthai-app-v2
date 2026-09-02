import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { PortalShell } from './portal-shell';
import { ReticleDev } from './reticle-dev';
import { StructuredData } from '@/components/structured-data';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
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
    'family health management',
    'medication reminder app',
    'health companion',
    'doctor consultation',
    'lab test booking',
    'family medication management',
    'privacy-first health app',
    'AI health assistant',
    'care coordination',
  ],
  authors: [{ name: 'Kynthai' }],
  manifest: '/manifest.json',
  openGraph: {
    title: "Kynthai — Your family's health, connected.",
    description:
      "Smart reminders, doctor consultations, and lab tests—all in one place.",
    images: [
      { url: '/og-image.webp', width: 1200, height: 630, type: 'image/webp' },
      { url: '/og-image.png', width: 1200, height: 630, type: 'image/png' },
    ],
    type: 'website',
    locale: 'en_US',
    siteName: 'Kynthai',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Kynthai — Your family's health, connected.",
    description:
      "Smart reminders, doctor consultations, and lab tests—all in one place. Privacy-first care for families everywhere.",
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fdfb' },
    { media: '(prefers-color-scheme: dark)', color: '#070f0c' },
  ],
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
        <meta name="theme-color" content="#f9fdfb" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#070f0c" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Instant first paint — prevents black/white flash on PWA cold start */}
        <style dangerouslySetInnerHTML={{ __html: 'html,body{background:#f9fdfb!important;margin:0;min-height:100%;background-color:#f9fdfb}html.dark,html.dark body{background:#070f0c!important;background-color:#070f0c}#kynthai-boot{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f9fdfb;color:#064e3b;font-family:system-ui,sans-serif;font-weight:600;font-size:18px;letter-spacing:0.02em;transition:opacity .2s}html.dark #kynthai-boot{background:#070f0c;color:#ecfdf5}#kynthai-boot.done{opacity:0;pointer-events:none;transition:opacity .25s}' }} />
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
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=document.documentElement;var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark)d.classList.add('dark');}catch(e){}function dismissBoot(){var b=document.getElementById('kynthai-boot');if(b&&!b.classList.contains('done')){requestAnimationFrame(function(){b.classList.add('done');});}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',dismissBoot);}else{dismissBoot();}})();`,
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased text-foreground`}
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
        <div id="kynthai-boot" aria-hidden="true" suppressHydrationWarning>Kynthai</div>
        <Providers>
          <PortalShell>{children}</PortalShell>
        </Providers>
        {process.env.NODE_ENV === 'development' && <ReticleDev />}
      </body>
    </html>
  );
}
