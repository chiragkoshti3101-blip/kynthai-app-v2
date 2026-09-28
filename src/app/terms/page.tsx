
import type { Metadata } from 'next'
import { TermsOfService } from '@/components/kynthai/legal/privacy-policy'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The agreement between you and Kynthai — the terms of using the service.',
  alternates: { canonical: 'https://kynthai.app/terms' },
}

export default function TermsPage() {
  return (
    <ErrorBoundary>
      <TermsOfService />
    </ErrorBoundary>
  )
}
