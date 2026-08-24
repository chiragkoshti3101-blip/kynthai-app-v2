import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const manifest = {
  id: '/?pwa=kynthai',
  name: 'Kynthai - Your Health Companion',
  short_name: 'Kynthai',
  description:
    'AI-powered health assistant for medicines, appointments, and family care in the US',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#f9fdfb',
  theme_color: '#089868',
  orientation: 'portrait-primary',
  categories: ['health', 'medical', 'lifestyle'],
  shortcuts: [
    {
      name: 'Add Medication',
      url: '/patient',
      description: 'Quickly add or manage medications',
    },
    {
      name: 'SOS Emergency',
      url: '/patient',
      description: 'Send emergency alert to your contacts',
    },
    {
      name: 'AI Health Chat',
      url: '/patient',
      description: 'Ask the AI health assistant',
    },
  ],
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  version: 'cb96d09-icon-v2',
};

export async function GET() {
  return NextResponse.json(manifest, {
    headers: {
      // Short TTL so PWAs notice version changes quickly after a deploy
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'Content-Type': 'application/manifest+json',
    },
  });
}
