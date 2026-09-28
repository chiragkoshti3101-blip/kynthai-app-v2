// Server wrapper — renders the Client Component.
// The component reads the secret `?key=` URL parameter client-side via useSearchParams.
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
