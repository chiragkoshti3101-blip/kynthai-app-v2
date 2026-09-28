import type { Metadata } from 'next'
import ForgotPasswordClient from './forgot-password-client'

export const metadata: Metadata = {
  title: 'Forgot Password',
  description: 'Reset your Kynthai account password with a secure email link.',
  alternates: { canonical: 'https://kynthai.app/forgot-password' },
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />
}
