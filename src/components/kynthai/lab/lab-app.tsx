'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppStore, type AuthUser } from '@/lib/store';
import { LabVerification } from './lab-verification';
import { LabDashboard } from './lab-dashboard';
import { AppLoader } from '@/components/kynthai/app-loader';
import { InstallAppBanner } from '@/components/kynthai/install-app-banner'
import { NotificationPermissionBanner } from '@/components/kynthai/notification-permission-banner';

type ProfileState = 'loading' | 'none' | 'exists';

interface LabProfile {
  id: string;
  labName: string;
  licenseNumber: string;
  city: string;
  address: string;
  homeCollection: boolean;
  tests: { name: string; price: number }[];
  testsOffered?: { name: string; price: number }[];
  verified: boolean;
}

// Demo profile used when a user signs in via the "Lab demo" button.
const DEMO_PROFILE: LabProfile = {
  id: 'demo_lab_profile',
  labName: 'Kynthai Diagnostic Center',
  licenseNumber: 'CLIA-DEMO-001',
  city: 'Austin, TX',
  address: '1400Health Ave, Austin, TX 78701',
  homeCollection: true,
  tests: [
    { name: 'Complete Blood Count', price: 35 },
    { name: 'Lipid Panel', price: 49 },
    { name: 'HbA1c', price: 39 },
    { name: 'Thyroid Panel', price: 59 },
    { name: 'Vitamin D', price: 45 },
    { name: 'Liver Function Panel', price: 49 },
  ],
  verified: true,
};

export function LabApp({ user }: { user: AuthUser }) {
  const { logout } = useAppStore();
  const router = useRouter();
  const [state, setState] = React.useState<ProfileState>('loading');
  const [profile, setProfile] = React.useState<LabProfile | null>(null);

  const handleLogout = React.useCallback(async () => {
    router.replace('/login');
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    logout();
  }, [logout, router]);

  const load = React.useCallback(async () => {
    setState('loading');
    // Demo login: skip backend so the dashboard renders immediately.
    // isDemo flag may be lost during SSR hydration, so also check the email
    // directly — demo accounts are pre-seeded with verified profiles.
    if (user.isDemo || user.email?.endsWith('@kynthai.app')) {
      setProfile(DEMO_PROFILE);
      setState('exists');
      return;
    }
    try {
      const res = await fetch(`/api/labs?userId=${encodeURIComponent(user.id)}`);
      if (res.status === 404) {
        setState('none');
        return;
      }
      if (!res.ok) throw new Error('Failed to load profile');
      const data = await res.json();
      setProfile({ ...data, tests: data.tests ?? data.testsOffered ?? [] });
      setState('exists');
    } catch {
      // Backend not implemented — show the verification form by default
      setState('none');
    }
  }, [user.id, user.isDemo]);

  React.useEffect(() => {
    // Safety timeout — never let loading state hang forever
    const safetyTimer = setTimeout(() => setState(s => s === 'loading' ? 'none' : s), 5000);
    load();
    return () => clearTimeout(safetyTimer);
  }, [load]);

  if (state === 'loading') {
    return <AppLoader label="Loading your lab dashboard…" />;
  }

  if (state === 'none' || !profile) {
    return (
      <LabVerification
        user={user}
        onLogout={handleLogout}
        onSubmitted={() => {
          load();
        }}
      />
    );
  }

  if (profile) {
    return (
      <>
        <NotificationPermissionBanner />
      <InstallAppBanner />
        <LabDashboard user={user} profile={profile} onLogout={handleLogout} />
      </>
    );
  }

  return null;
}
