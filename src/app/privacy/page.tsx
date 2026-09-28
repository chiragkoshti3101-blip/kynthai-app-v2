
import type { Metadata } from 'next'
import { PrivacyPolicy } from "@/components/kynthai/legal/privacy-policy"
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Kynthai collects, uses, and protects your health data.',
  alternates: { canonical: 'https://kynthai.app/privacy' },
}

export default function PrivacyPage() {
  return (
    <ErrorBoundary>
      <PrivacyPolicy />
    </ErrorBoundary>
  )
}
