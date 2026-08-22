import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
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
    default: "Kynthai — America's AI Health Companion for Families",
    template: '%s | Kynthai US',
  },
  description:
    'AI-powered medicine reminders, doctor consults, lab tests & family health management — built for families in the US. Free to start. Privacy-first.',
  keywords: [
    'Kynthai',
    'AI health US',
    'medicine reminder USA',
    'family health app US',
    'doctor consultation US',
    'lab tests US',
    'health reminders US',
    'Privacy-first health app',
    'AI healthcare US',
    'medicine reminder app',
    'health management US',
    'telemedicine US',
    'online pharmacy US',
    'health tech US',
    'family medication management',
  ],
  authors: [{ name: 'Kynthai' }],
  manifest: '/manifest.json',
  openGraph: {
    title: 'Kynthai — AI Health & Medication Manager for American Families',
    description:
      'Manage medications, track adherence, check drug interactions, and connect with doctors. Built for families in the US.',
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
    title: "Kynthai — America's AI Health Companion",
    description:
      'AI-powered medicine reminders, doctor consults, lab tests & family health management for US families.',
    images: ['/og-image.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kynthai',
  },
  other: {
    'geo.region': 'US',
    'geo.placename': 'United States',
    // Verification codes: add after Google Search Console & Bing Webmaster Tools setup
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
  themeColor: '#10b981',
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const pathname = headerStore.get('x-nextjs-url') || '/';

  return (
    <html lang="en" suppressHydrationWarning data-deploy-version={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'}>
      <head>
        <StructuredData pathname={pathname} />
        <meta name="theme-color" content="#10b981" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#022c22" />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
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
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=document.documentElement;var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark)d.classList.add('dark');}catch(e){}})();`,
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
        <Providers>
          <PortalShell>{children}</PortalShell>
        </Providers>
        {process.env.NODE_ENV === 'development' && <ReticleDev />}
      </body>
    </html>
  );
}
