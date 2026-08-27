'use client';

import * as React from 'react';
import { Stethoscope, ShieldCheck, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { DoctorVerification } from './doctor-verification';
import { DoctorDashboard } from './doctor-dashboard';
import { AppLoader } from '@/components/kynthai/app-loader';

type ProfileState = 'loading' | 'none' | 'pending' | 'verified' | 'rejected';

interface DoctorProfile {
  id: string;
  specialization: string;
  licenseNumber: string;
  experience: number;
  consultationFee: number;
  city: string;
  bio: string;
  videoCallEnabled: boolean;
  verified: boolean;
  rejectionReason?: string | null;
}

// Demo profile used when a user signs in via the "Doctor demo" button on
// the login page. Lets investors / owners explore the dashboard without
// having to go through real verification.
const DEMO_PROFILE: DoctorProfile = {
  id: 'demo_doctor_profile',
  specialization: 'Family Medicine',
  licenseNumber: 'USMD-DEMO-001',
  experience: 12,
  consultationFee: 100,
  city: 'Austin, TX',
  bio: 'Demo doctor account for product exploration.',
  videoCallEnabled: true,
  verified: true,
};

export function DoctorApp({ user }: { user: AuthUser }) {
  const { toast } = useToast();
  const { setScreen, logout } = useAppStore();
  const router = useRouter();
  const isDemo = !!user.isDemo;
  const [state, setState] = React.useState<ProfileState>('loading');
  const [profile, setProfile] = React.useState<DoctorProfile | null>(null);

  // Real logout: clear the server session cookie (AuthGuard would otherwise
  // re-authenticate via /me and bounce the user straight back into the
  // portal), then clear the store and land on the home page.
  const handleLogout = React.useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    logout();
    router.replace('/login');
  }, [logout, router]);

  const load = React.useCallback(async () => {
    setState('loading');
    // Demo login: skip backend entirely so the dashboard renders.
    // isDemo flag may be lost during SSR hydration, so also check the email
    // directly — demo accounts are pre-seeded with verified profiles.
    if (user.isDemo || user.email?.endsWith('@kynthai.app')) {
      setProfile(DEMO_PROFILE);
      setState('verified');
      return;
    }
    try {
      const res = await fetch(`/api/doctors?userId=${encodeURIComponent(user.id)}`);
      if (res.status === 404) {
        setState('none');
        return;
      }
      if (!res.ok) throw new Error('Failed to load profile');
      const data = await res.json();
      setProfile(data);
      if (data.verified) setState('verified');
      else if (data.rejectionReason) setState('rejected');
      else setState('pending');
    } catch {
      // No backend table yet — fall back to "none" so the form is shown.
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
    return <AppLoader label="Loading your dashboard…" />;
  }

  if (state === 'none' || state === 'rejected') {
    return (
      <DoctorVerification
        user={user}
        existing={profile}
        onLogout={handleLogout}
        onSubmitted={() => {
          toast({
            title: 'Application submitted',
            description: 'Our team will review your profile within 24-48 hours.',
          });
          load();
        }}
      />
    );
  }

  if (state === 'pending') {
    return (
      <PendingState
        user={user}
        onRefresh={load}
        onLogout={handleLogout}
      />
    );
  }

  if (profile) return <DoctorDashboard user={user} profile={profile} isDemo={!!user.isDemo || user.email?.endsWith('@kynthai.app')} />;

  return null;
}

function PendingState({
  user,
  onRefresh,
  onLogout,
}: {
  user: AuthUser;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const isDemo = !!user.isDemo;
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-amber-50/50 via-background to-background dark:from-amber-950/20">
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <Badge
            variant="secondary"
            className="mb-3 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          >
            Verification in progress
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">
            Hi Dr. {isDemo ? 'Demo User' : (user.name?.split(' ').slice(-1)[0] ?? 'Doctor')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Thanks for submitting your details. Our admin team is reviewing your profile and
            documents. You&apos;ll receive an email once approved (usually within 24-48 hours).
          </p>

          <Card className="mt-6 w-full border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Stethoscope className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-left text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">What happens next?</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Admin verifies your license & documents</li>
                    <li>You&apos;ll get an email once approved</li>
                    <li>Dashboard unlocks — start seeing patients</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={onRefresh}>
              Refresh status
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={onLogout}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
