import type { Metadata } from 'next'
import ResetPasswordClient from './reset-password-client'

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Set a new password for your Kynthai account.',
  alternates: { canonical: 'https://kynthai.app/reset-password' },
}

export default function ResetPasswordPage() {
  return <ResetPasswordClient />
}
