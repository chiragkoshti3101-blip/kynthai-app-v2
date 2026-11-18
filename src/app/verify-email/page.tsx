import type { Metadata } from 'next'
import VerifyEmailClient from './verify-email-client'

export const metadata: Metadata = {
  title: 'Verify your email',
  description: 'Confirm your email address to unlock video consultations on Kynthai.',
  alternates: { canonical: 'https://kynthai.app/verify-email' },
}

export default function VerifyEmailPage() {
  return <VerifyEmailClient />
}
