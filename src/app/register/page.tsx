import type { Metadata } from 'next'
import { LoginPage } from '@/components/kynthai/login-page'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create a Kynthai account — family, patient, doctor, or lab portal.',
  alternates: { canonical: 'https://kynthai.app/register' },
}

export default function RegisterRoute() {
  return (
    <ErrorBoundary>
      <LoginPage initialMode="register" />
    </ErrorBoundary>
  )
}
