
import type { Metadata } from 'next'
import { CookiePolicy } from '@/components/kynthai/legal/privacy-policy'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How Kynthai uses cookies and tracking technologies.',
  alternates: { canonical: 'https://kynthai.app/cookies' },
}

export default function CookiesPage() {
  return (
    <ErrorBoundary>
      <CookiePolicy />
    </ErrorBoundary>
  )
}
