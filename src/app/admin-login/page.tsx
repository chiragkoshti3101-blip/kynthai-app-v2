// Server wrapper — renders the Client Component.
// Admin sign-in accepts only a real admin credential pair (email + password);
// there is no magic-link / `?key=` URL parameter. Secrets in URLs would leak
// into server logs, browser history, and referrers, so none are used.
import type { Metadata } from 'next'
import AdminLoginClient from './admin-login-client';
import { ErrorBoundary } from '@/components/kynthai/error-boundary';

export const metadata: Metadata = {
  title: 'Admin Login',
  description: 'Restricted administrator access to the Kynthai platform.',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://kynthai.app/admin-login' },
}

export default function AdminLoginPage() {
  return (
    <ErrorBoundary>
      <AdminLoginClient />
    </ErrorBoundary>
  );
}
