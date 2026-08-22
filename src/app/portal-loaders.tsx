'use client';

/**
 * portal-loaders.ts
 *
 * Lazy-load map for portal apps. Kept in a separate 'use client' module
 * so Next.js does not infer the portal dynamic() calls from the root page
 * module — the chunks therefore load only when a user actually visits a
 * portal route, not eagerly at root-page hydration.
 */

import dynamic from 'next/dynamic';
import { type ReactNode, Suspense } from 'react';
import { ErrorBoundary } from '@/components/kynthai/error-boundary';
import { AppLoader } from '@/components/kynthai/app-loader';
// Client-side CSRF interceptor — auto-attaches X-CSRF-Token to same-origin
// mutating /api/ requests (fixes the recurring "CSRF token missing" 403s).
import { installGlobalCsrf } from '@/lib/client-fetch';
installGlobalCsrf();

// Global fetch timeout — prevents stuck spinners on mobile by aborting
// any fetch that takes longer than 8 seconds.
import { installFetchTimeout } from '@/lib/fetch-timeout';
installFetchTimeout();

function PortalSkeleton() {
  return <AppLoader label="Loading…" />;
}

function PortalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4 p-8 text-center border rounded-lg border-border/60 bg-card">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-semibold">Portal failed to load</h2>
          <p className="text-sm text-muted-foreground">
            {error.message || 'An unexpected error occurred loading this area.'}
          </p>
          <button onClick={reset} className="text-sm text-emerald-600 hover:underline">
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * loadPortal(role, user)
 *
 * SECURITY-CRITICAL: Strict role-based access control.
 * Each portal can ONLY be accessed by users with the matching role.
 * Patients CANNOT access doctor/lab portals, doctors CANNOT access patient portals, etc.
 * An unauthenticated user or a user with the wrong role gets null.
 */
// Memoized dynamic() loaders — see loadPortal. Created once per role so the
// component type is stable across re-renders (prevents spurious portal remounts).
const lazyCompCache: Record<string, React.ComponentType<any>> = {};

export function loadPortal(
  role: string,
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    subscriptionTier?: string;
    isDemo?: boolean;
  } | null
): { key: string; node: ReactNode } {
  const loaders: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
    patient: () =>
      import('@/components/kynthai/patient/patient-app').then(m => ({ default: m.PatientApp })),
    doctor: () =>
      import('@/components/kynthai/doctor/doctor-app').then(m => ({ default: m.DoctorApp })),
    lab: () => import('@/components/kynthai/lab/lab-app').then(m => ({ default: m.LabApp })),
    caretaker: () =>
      import('@/components/kynthai/caretaker/caretaker-app').then(m => ({
        default: m.CaretakerApp,
      })),
    family: () =>
      import('@/components/kynthai/caretaker/caretaker-app').then(m => ({
        default: m.CaretakerApp,
      })),
    admin: () =>
      import('@/components/kynthai/admin/admin-dashboard').then(m => ({
        default: m.AdminDashboard,
      })),
  };
  const keys: Record<string, string> = {
    patient: 'patient-portal',
    doctor: 'doctor-portal',
    lab: 'lab-portal',
    caretaker: 'caretaker-portal',
    family: 'family-portal',
    admin: 'admin-portal',
  };

  const load = loaders[role];
  if (!load) return { key: role, node: null };

  // SECURITY-CRITICAL: Verify the user is authenticated AND has the correct role
  // Caretaker (DB role) accesses the family portal
  if (!user) return { key: keys[role] ?? role, node: null };
  const roleMatches = user.role === role || (user.role === 'caretaker' && role === 'family');
  if (!roleMatches) return { key: keys[role] ?? role, node: null };

  // ponytail: dynamic() MUST be created once per role at module scope, not per
  // call. loadPortal runs on every render of its portal client; its callers
  // subscribe to the whole zustand store, so any unrelated store write (e.g.
  // flipping the in-app ringtone toggle) re-renders the client → re-invokes
  // loadPortal → a NEW dynamic() component type → React unmounts the portal
  // subtree and mounts a fresh one, which resets every component's useState
  // (e.g. PatientApp's active-tab defaulting to 'home'). Memoizing the Comp
  // keeps the type stable so React reconciles in place instead of remounting.
  if (!lazyCompCache[role]) {
    lazyCompCache[role] = dynamic(load, { ssr: false, loading: () => <PortalSkeleton /> });
  }
  const Comp = lazyCompCache[role];
  const wrapped = (
    <ErrorBoundary fallback={props => <PortalError {...props} />}>
      <Comp user={user} />
    </ErrorBoundary>
  );
  return { key: keys[role] ?? role, node: wrapped };
}
