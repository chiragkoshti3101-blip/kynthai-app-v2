import type { Metadata } from 'next'
import { LoginPage } from '@/components/kynthai/login-page'
import { ErrorBoundary } from '@/components/kynthai/error-boundary'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Kynthai — family health, patient, doctor, or lab portal.',
}

export default async function LoginRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  return (
    <ErrorBoundary>
      <LoginPage initialDemo={params?.demo === '1'} />
    </ErrorBoundary>
  )
}
