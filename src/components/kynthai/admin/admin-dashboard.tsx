'use client';

import * as React from 'react';
import {
  Stethoscope,
  Microscope,
  AlertTriangle,
  TrendingDown,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Loader2,
  Users,
  Wallet,
  TrendingUp,
  Banknote,
  Receipt,
  LayoutDashboard,
  LogOut,
  Shield,
  UserCircle,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { KynthaiBrand } from '@/components/kynthai/logo';
import { ResponsiveSheet } from '@/components/kynthai/responsive-sheet';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAppStore, type AuthUser } from '@/lib/store';
import { apiFetch } from '@/lib/client-fetch';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { OverviewTab, type OverviewData } from '@/components/kynthai/admin/overview-tab';
import {
  DOCTOR_BASE_FEE_PCT,
  LAB_BASE_FEE_PCT,
  LOYALTY_TIERS,
  type LoyaltyTier,
  effectiveFeePct,
  platformFee,
  PAYOUT_POLICY,
} from '@/lib/commission';

type AdminTab = 'overview' | 'doctors' | 'labs' | 'refunds' | 'revenue' | 'retention' | 'fraud';

interface DoctorApp {
  id: string;
  name: string;
  email: string;
  specialization: string;
  licenseNumber: string;
  city: string;
  experience: number;
  fee: number;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  documents: { name: string; type: string }[];
}

interface LabApp {
  id: string;
  labName: string;
  email: string;
  licenseNumber: string;
  city: string;
  testCount: number;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  documents: { name: string; type: string }[];
}

/* Partner leaderboard row — filled from the real /api/admin/overview
   aggregations (no demo data). */
interface PartnerRevenueRow {
  id: string;
  name: string;
  type: 'Doctor' | 'Lab';
  lifetimeOrders: number;
  grossUsd: number;
  tier: LoyaltyTier;
}

export function AdminDashboard({ user }: { user: AuthUser }) {
  const { logout } = useAppStore();
  const router = useRouter();
  // Real logout: clear the server session first — AuthGuard's mount-time
  // /api/auth/me check would otherwise re-authenticate and bounce straight
  // back into the portal (the old onLogout={logout} only cleared the store).
  const handleLogout = React.useCallback(async () => {
    router.replace('/login');
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    logout();
  }, [logout, router]);
  const [tab, setTab] = React.useState<AdminTab>('overview');
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [reviewApp, setReviewApp] = React.useState<DoctorApp | LabApp | null>(null);
  const [reviewType, setReviewType] = React.useState<'doctor' | 'lab' | null>(null);

  // Live data, fetched per tab from the real admin APIs (null = not loaded).
  const [doctorApps, setDoctorApps] = React.useState<DoctorApp[] | null>(null);
  const [labApps, setLabApps] = React.useState<LabApp[] | null>(null);
  const [refunds, setRefunds] = React.useState<RefundRow[] | null>(null);
  const [fraudFlags, setFraudFlags] = React.useState<FraudFlag[] | null>(null);
  const [blockedUsers, setBlockedUsers] = React.useState<BlockedUser[] | null>(null);
  const [tabError, setTabError] = React.useState<string | null>(null);
  const [refetchTick, setRefetchTick] = React.useState(0);

  // Owner-level overview — one real aggregation call, shared by Overview,
  // Revenue, Retention and the headline stat cards.
  const [overview, setOverview] = React.useState<OverviewData | null>(null);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/overview', { credentials: 'include', cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load overview');
        if (!cancelled) {
          setOverview(data);
          setOverviewError(null);
        }
      } catch (e) {
        if (!cancelled) setOverviewError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refetchTick]);

  // Fetch real data whenever a live tab opens (and re-fetch after an action).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setTabError(null);
      try {
        if (tab === 'doctors') {
          const res = await fetch('/api/admin/doctors', { credentials: 'include', cache: 'no-store' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Failed to load doctors');
          if (!cancelled) setDoctorApps((data ?? []).map(toDoctorApp));
        } else if (tab === 'labs') {
          const res = await fetch('/api/admin/labs', { credentials: 'include', cache: 'no-store' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Failed to load labs');
          if (!cancelled) setLabApps((data ?? []).map(toLabApp));
        } else if (tab === 'fraud') {
          const res = await fetch('/api/admin/fraud', { credentials: 'include', cache: 'no-store' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Failed to load fraud flags');
          if (!cancelled) setFraudFlags(data?.flags ?? []);
          const blockedRes = await fetch('/api/admin/blocked', { credentials: 'include', cache: 'no-store' });
          const blockedData = await blockedRes.json().catch(() => ([]));
          if (blockedRes.ok && !cancelled) setBlockedUsers(Array.isArray(blockedData) ? blockedData : []);
        } else if (tab === 'refunds') {
          const res = await fetch('/api/refunds', { credentials: 'include', cache: 'no-store' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Failed to load refunds');
          if (!cancelled) setRefunds(data ?? []);
        }
      } catch (e) {
        if (!cancelled) setTabError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, refetchTick]);

  const pendingDoctors = overview?.stats.doctorApps.pending ?? 0;
  const pendingLabs = overview?.stats.labApps.pending ?? 0;
  const activeDoctors = overview?.stats.doctorApps.approved ?? 0;
  const churnCount = overview?.atRisk.length ?? 0;
  const fraudCount = overview?.stats.fraud.total ?? 0;

  // ---- Owner-level revenue aggregations (real, from /api/admin/overview) ----
  const revenue = overview?.revenue;
  const platformCommission = revenue?.platformCommissionUsd ?? 0;
  const doctorCommission = revenue?.doctorCommissionUsd ?? 0;
  const labCommission = revenue?.labCommissionUsd ?? 0;
  const totalPartnerGross = revenue?.grossUsd ?? 0;
  const subscriptionMrr = revenue?.mrrUsd ?? 0;
  const totalMrr = revenue?.totalMrrUsd ?? 0;
  const avgTakeRate = revenue?.takeRatePct ?? 0;
  const partners: PartnerRevenueRow[] =
    overview?.partners.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      lifetimeOrders: p.lifetimeOrders,
      grossUsd: p.grossUsd,
      tier: p.tier as LoyaltyTier,
    })) ?? [];

  const fmtUsd = (n: number) => `$${n.toLocaleString('en-US')}`;

  const openReview = (app: DoctorApp | LabApp, type: 'doctor' | 'lab') => {
    setReviewApp(app);
    setReviewType(type);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-background to-background dark:from-emerald-950/20">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background pt-safe">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between px-4 py-3">
          <KynthaiBrand iconSize={30} />
          <div className="flex items-center gap-1">
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              <ShieldAlert className="h-3 w-3" />
              Super admin
            </Badge>
            <button
              onClick={() => setProfileOpen(true)}
              aria-label="Profile"
              className="relative flex items-center gap-1.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-accent"
            >
              <Avatar className="h-9 w-9 ring-2 ring-emerald-500/20">
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold">
                  {(user.name?.[0] ?? 'A').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-xs font-medium text-muted-foreground">Profile</span>
            </button>
          </div>
        </div>
      </header>

      {/* All tabs act on real data (aggregated by /api/admin/overview). */}
      {overviewError && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-1.5 text-center text-[11px] text-rose-700 dark:text-rose-300">
          Overview aggregation failed — {overviewError}
        </div>
      )}

      <main id="main-content" className="mx-auto max-w-6xl px-4 pb-12 pt-4 space-y-5">
        {/* Quick owner stats — real values from the overview aggregation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<Wallet className="h-4 w-4" />}
            label="Net revenue"
            value={fmtUsd(platformCommission - (overview?.stats.refunds.issuedUsd ?? 0))}
            sub={`avg take ${avgTakeRate.toFixed(1)}%`}
            tint="emerald"
          />
          <StatCard
            icon={<Stethoscope className="h-4 w-4" />}
            label="Doctors pending"
            value={pendingDoctors}
            sub={`${activeDoctors} active`}
            tint="teal"
          />
          <StatCard
            icon={<Microscope className="h-4 w-4" />}
            label="Labs pending"
            value={pendingLabs}
            sub={`${overview?.stats.labApps.total ?? 0} total`}
            tint="amber"
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Fraud flags"
            value={fraudCount}
            sub={`${churnCount} churn risks`}
            tint="rose"
          />
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as AdminTab)} className="w-full">
          {/* Mobile: 2-col grid so labels stay readable; sm+: 6-col strip */}
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 h-auto p-1 gap-1">
            <TabsTrigger value="overview" className="py-1.5 text-xs col-span-3 sm:col-span-1">
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="doctors" className="py-1.5 text-xs">
              <Stethoscope className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Doctors</span>
            </TabsTrigger>
            <TabsTrigger value="labs" className="py-1.5 text-xs">
              <Microscope className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Labs</span>
            </TabsTrigger>
            <TabsTrigger value="refunds" className="py-1.5 text-xs">
              <Receipt className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refunds</span>
            </TabsTrigger>
            <TabsTrigger value="revenue" className="py-1.5 text-xs">
              <Wallet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Revenue</span>
            </TabsTrigger>
            <TabsTrigger value="retention" className="py-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Retention</span>
            </TabsTrigger>
            <TabsTrigger value="fraud" className="py-1.5 text-xs">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fraud</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab
              data={overview}
              loading={!overview && !overviewError}
              error={overviewError}
              userName={user.name ?? ''}
              onNavigate={tabId => setTab(tabId as AdminTab)}
            />
          </TabsContent>

          <TabsContent value="revenue" className="mt-4">
            <RevenueTab
              platformCommission={platformCommission}
              doctorCommission={doctorCommission}
              labCommission={labCommission}
              totalPartnerGross={totalPartnerGross}
              subscriptionMrr={subscriptionMrr}
              totalMrr={totalMrr}
              avgTakeRate={avgTakeRate}
              partners={partners}
            />
          </TabsContent>

          <TabsContent value="doctors" className="mt-4">
            {tabError && tab === 'doctors' ? (
              <ErrorCard message={tabError} />
            ) : doctorApps === null ? (
              <LoadingCard />
            ) : (
              <ApplicationsTab
                title="Doctor applications"
                apps={doctorApps.map(d => ({
                  id: d.id,
                  name: d.name,
                  subtitle: d.specialization,
                  meta: `${d.city} · ${d.experience}y exp · $${d.fee}`,
                  license: d.licenseNumber,
                  status: d.status,
                  submittedAt: d.submittedAt,
                  documents: d.documents,
                }))}
                onReview={id => {
                  const app = doctorApps.find(d => d.id === id);
                  if (app) openReview(app, 'doctor');
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="labs" className="mt-4">
            {tabError && tab === 'labs' ? (
              <ErrorCard message={tabError} />
            ) : labApps === null ? (
              <LoadingCard />
            ) : (
              <ApplicationsTab
                title="Lab applications"
                apps={labApps.map(l => ({
                  id: l.id,
                  name: l.labName,
                  subtitle: `${l.testCount} tests`,
                  meta: `${l.city} · NABL: ${l.licenseNumber}`,
                  license: l.licenseNumber,
                  status: l.status,
                  submittedAt: l.submittedAt,
                  documents: l.documents,
                }))}
                onReview={id => {
                  const app = labApps.find(l => l.id === id);
                  if (app) openReview(app, 'lab');
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="refunds" className="mt-4">
            <RefundsTab
              refunds={refunds}
              loading={refunds === null}
              error={tabError && tab === 'refunds' ? tabError : null}
              onDone={() => setRefetchTick(t => t + 1)}
            />
          </TabsContent>

          <TabsContent value="retention" className="mt-4">
            <RetentionTab
              risks={overview?.atRisk ?? []}
              loading={!overview && !overviewError}
              stats={
                overview?.stats.retention
                  ? {
                      totalPatients: overview.stats.retention.totalPatients,
                      activated: overview.stats.retention.activated,
                      repeat: overview.stats.retention.repeat,
                    }
                  : null
              }
            />
          </TabsContent>

          <TabsContent value="fraud" className="mt-4">
            <FraudTab
              flags={fraudFlags ?? []}
              loading={fraudFlags === null}
              error={tabError && tab === 'fraud' ? tabError : null}
              blocked={blockedUsers}
              blockedLoading={blockedUsers === null}
              onBlock={async (email, reason) => {
                // Resolve the email to a userId via the overview's user list is
                // not available here; block by looking up the user server-side.
                const res = await apiFetch('/api/admin/blocked', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: email, reason }),
                });
                if (!res.ok) {
                  const j = await res.json().catch(() => ({}));
                  throw new Error(j.error || 'Block failed');
                }
                setRefetchTick(t => t + 1);
              }}
              onUnblock={async userId => {
                const res = await apiFetch('/api/admin/blocked', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId }),
                });
                if (!res.ok) {
                  const j = await res.json().catch(() => ({}));
                  throw new Error(j.error || 'Unblock failed');
                }
                setRefetchTick(t => t + 1);
              }}
            />
          </TabsContent>
        </Tabs>
      </main>

      <ReviewDialog
        app={reviewApp}
        type={reviewType}
        onClose={() => {
          setReviewApp(null);
          setReviewType(null);
        }}
        onDone={() => setRefetchTick(t => t + 1)}
      />

      <AdminProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user}
        onLogout={handleLogout}
      />
    </div>
  );
}

/* --------------------------- Admin profile sheet --------------------------- */

function AdminProfileSheet({
  open,
  onOpenChange,
  user,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser;
  onLogout: () => void;
}) {
  const initial = (user.name?.[0] ?? 'A').toUpperCase();

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader className="px-5 pt-3 pb-3">
        <SheetTitle className="text-sm text-muted-foreground">Profile &amp; Settings</SheetTitle>
      </SheetHeader>

      {/* Identity card */}
      <div className="px-5">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 p-5 text-white shadow-lg shadow-emerald-600/20">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-4 ring-white/30">
              <AvatarFallback className="bg-white/20 text-white text-xl font-bold">{initial}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{user.name}</h2>
              <div className="mt-1 flex items-center gap-2">
                <Badge className="bg-white/20 text-white border-0 capitalize">{user.role}</Badge>
                <Badge className="bg-white/20 text-white border-0">Super admin</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="px-5 mt-4 space-y-2">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Email</p>
            <p className="text-sm font-medium truncate">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Account actions */}
      <div className="px-5 mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Account</h3>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            <button
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Shield className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">Owner access</p>
                <p className="text-xs text-muted-foreground">Orders, refunds, fraud &amp; analytics</p>
              </div>
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <UserCircle className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">Identity</p>
                <p className="text-xs text-muted-foreground">Account ID: {user.id.slice(0, 8)}…</p>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Logout */}
      <div className="px-5 mt-5 pb-8">
        <Separator className="mb-4" />
        <Button
          variant="outline"
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={() => {
            onOpenChange(false);
            onLogout();
          }}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Kynthai v3 · Data encrypted in transit &amp; at rest
        </p>
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------- Revenue tab -------------------------------- */

function RevenueTab({
  platformCommission,
  doctorCommission,
  labCommission,
  totalPartnerGross,
  subscriptionMrr,
  totalMrr,
  avgTakeRate,
  partners,
}: {
  platformCommission: number;
  doctorCommission: number;
  labCommission: number;
  totalPartnerGross: number;
  subscriptionMrr: number;
  totalMrr: number;
  avgTakeRate: number;
  partners: PartnerRevenueRow[];
}) {
  const fmtUsd = (n: number) => `${n.toLocaleString('en-US')}`;
  const doctorShare = platformCommission > 0 ? (doctorCommission / platformCommission) * 100 : 0;
  const labShare = platformCommission > 0 ? (labCommission / platformCommission) * 100 : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4 text-emerald-600" />
          Platform revenue
        </h2>
        <p className="text-xs text-muted-foreground">
          Owner view — commission from partners + subscription MRR from patients.
        </p>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Wallet className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium truncate">Commission (FY)</span>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {fmtUsd(platformCommission)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">From partners</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium truncate">Avg take rate</span>
            </div>
            <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
              {avgTakeRate.toFixed(1)}%
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Blended</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <Receipt className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium truncate">Sub MRR</span>
            </div>
            <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
              {fmtUsd(subscriptionMrr)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Patient subscriptions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Banknote className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium truncate">Est. total MRR</span>
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {fmtUsd(Math.round(totalMrr))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Commission ÷ 12 + subs</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue split card */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3">Commission split by partner type</h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5">
                  <Stethoscope className="h-3 w-3 text-emerald-600" />
                  Doctors ({DOCTOR_BASE_FEE_PCT}% base fee)
                </span>
                <span className="font-semibold">
                  {fmtUsd(doctorCommission)} · {doctorShare.toFixed(0)}%
                </span>
              </div>
              <Progress value={doctorShare} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5">
                  <Microscope className="h-3 w-3 text-teal-600" />
                  Labs ({LAB_BASE_FEE_PCT}% base fee)
                </span>
                <span className="font-semibold">
                  {fmtUsd(labCommission)} · {labShare.toFixed(0)}%
                </span>
              </div>
              <Progress value={labShare} className="h-2" />
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total partner gross processed</span>
            <span className="font-semibold">{fmtUsd(totalPartnerGross)}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-muted-foreground">Total platform commission</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {fmtUsd(platformCommission)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Partner leaderboard */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3">Top partners by gross volume</h3>
          <div className="space-y-2">
            {partners
              .slice()
              .sort((a, b) => b.grossUsd - a.grossUsd)
              .map(p => {
                const baseFee = p.type === 'Doctor' ? DOCTOR_BASE_FEE_PCT : LAB_BASE_FEE_PCT;
                const effFee = effectiveFeePct(baseFee, p.tier);
                const fee = platformFee(p.grossUsd, effFee);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 p-3"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback
                        className={cn(
                          'bg-gradient-to-br text-white text-xs',
                          p.type === 'Doctor'
                            ? 'from-emerald-500 to-teal-600'
                            : 'from-teal-500 to-emerald-600'
                        )}
                      >
                        {p.name.replace(/^Dr\.\s*/, '')[0] ?? 'P'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {p.type}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        >
                          {LOYALTY_TIERS[p.tier].icon} {p.tier}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {p.lifetimeOrders} orders · fee {effFee}% (-{baseFee - effFee}% loyalty)
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{fmtUsd(p.grossUsd)}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        +{fmtUsd(fee)} fee
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Payout policy reminder */}
      <Card className="border-dashed">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Banknote className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Payout policy</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Partners are paid on a{' '}
                <span className="font-medium text-foreground">{PAYOUT_POLICY.cadence}</span>{' '}
                schedule with a minimum of{' '}
                <span className="font-medium text-foreground">${PAYOUT_POLICY.minPayoutUsd}</span>{' '}
                via {PAYOUT_POLICY.methods.join(', ')}. Withholding tax deducted per US tax law.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ----------------------------- Applications tab ----------------------------- */

interface AppRow {
  id: string;
  name: string;
  subtitle: string;
  meta: string;
  license: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  documents: { name: string; type: string }[];
}

function ApplicationsTab({
  title,
  apps,
  onReview,
}: {
  title: string;
  apps: AppRow[];
  onReview: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">Review applications and approve or reject.</p>
      </div>
      {apps.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No applications to review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {apps.map(a => (
            <Card key={a.id} className={cn(a.status === 'pending' && 'ring-1 ring-amber-500/30')}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                      {a.name.replace(/^Dr\.\s*/, '')[0] ?? 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{a.name}</h3>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.subtitle}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{a.meta}</p>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Submitted {a.submittedAt}
                      <span>·</span>
                      <FileText className="h-3 w-3" />
                      {a.documents.length} docs
                    </div>
                  </div>
                  {a.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => onReview(a.id)}
                      className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                    >
                      Review
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Retention tab ------------------------------ */

function RetentionTab({
  risks,
  loading,
  stats,
}: {
  risks: {
    id: string;
    name: string;
    tier: string;
    days: number;
    reason: string;
    risk: 'high' | 'medium' | 'low';
  }[];
  loading?: boolean;
  stats?: { totalPatients: number; activated: number; repeat: number } | null;
}) {
  if (loading) return <LoadingCard />;

  const activationPct = stats && stats.totalPatients > 0 ? (stats.activated / stats.totalPatients) * 100 : 0;
  const repeatPct = stats && stats.activated > 0 ? (stats.repeat / stats.activated) * 100 : 0;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Patient retention</h2>
        <p className="text-xs text-muted-foreground">
          Real funnel — patients who booked at least once, then came back.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Patients</p>
              <p className="text-xl font-bold">{stats.totalPatients}</p>
              <p className="text-[11px] text-muted-foreground">Registered accounts</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Activated</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats.activated} <span className="text-xs font-medium text-muted-foreground">({activationPct.toFixed(0)}%)</span>
              </p>
              <p className="text-[11px] text-muted-foreground">≥1 booking</p>
            </CardContent>
          </Card>
          <Card className="border-teal-500/30 bg-teal-500/5">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Repeat</p>
              <p className="text-xl font-bold text-teal-600 dark:text-teal-400">
                {stats.repeat} <span className="text-xs font-medium text-muted-foreground">({repeatPct.toFixed(0)}% of activated)</span>
              </p>
              <p className="text-[11px] text-muted-foreground">≥2 bookings</p>
            </CardContent>
          </Card>
        </div>
      )}

      <h3 className="text-sm font-semibold pt-2">Churn risks</h3>
      <p className="text-xs text-muted-foreground -mt-1">
        Patients who booked before but haven&apos;t in 7+ days.
      </p>
      {risks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No churn risks detected.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {risks.map(r => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    r.risk === 'high'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : r.risk === 'medium'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  <TrendingDown className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{r.name}</h3>
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {r.tier}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                </div>
                <div className="text-right">
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-[10px] capitalize',
                      r.risk === 'high'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : r.risk === 'medium'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    )}
                  >
                    {r.risk} risk
                  </Badge>
                  <p className="text-[11px] text-muted-foreground mt-1">{r.days}d inactive</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Fraud tab -------------------------------- */

function FraudTab({
  flags,
  loading,
  error,
  blocked,
  blockedLoading,
  onBlock,
  onUnblock,
}: {
  flags: FraudFlag[];
  loading?: boolean;
  error?: string | null;
  blocked?: BlockedUser[] | null;
  blockedLoading?: boolean;
  onBlock?: (email: string, reason: string) => Promise<void>;
  onUnblock?: (userId: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [email, setEmail] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [actingId, setActingId] = React.useState<string | null>(null);

  const doBlock = async () => {
    if (!email.trim()) {
      toast({ title: 'Email required', description: 'Enter the account email to block.', variant: 'destructive' });
      return;
    }
    setActingId('__new__');
    try {
      await onBlock?.(email.trim(), reason.trim() || 'Blocked by admin');
      toast({ title: 'Account blocked', description: `${email.trim()} can no longer sign in.` });
      setEmail('');
      setReason('');
    } catch (e) {
      toast({ title: 'Block failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  const doUnblock = async (id: string) => {
    setActingId(id);
    try {
      await onUnblock?.(id);
      toast({ title: 'Account unblocked', description: 'The user can sign in again.' });
    } catch (e) {
      toast({ title: 'Unblock failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Fraud &amp; access control</h2>
        <p className="text-xs text-muted-foreground">
          Automated checks: duplicate licenses, same-phone accounts, commission
          farming, zero-value bookings, missing consent, multi-bookings. Blocked
          accounts are denied sign-in and all API access app-wide.
        </p>
      </div>

      {/* Block by email */}
      <Card className="border-rose-500/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-semibold">Block an account</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/40"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason (optional)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/40"
              />
              <Button size="sm" variant="destructive" onClick={doBlock} disabled={actingId !== null}>
                {actingId === '__new__' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Block'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fraud flags */}
      {loading ? (
        <LoadingCard />
      ) : error ? (
        <ErrorCard message={error} />
      ) : flags.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No fraud flags. All clear.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {flags.map(f => (
            <Card key={f.id} className={cn(f.severity === 'high' && 'ring-1 ring-rose-500/30')}>
              <CardContent className="p-3 flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    f.severity === 'high'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : f.severity === 'medium'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{f.entity}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {f.type}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{f.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.issue}</p>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[10px] capitalize',
                    f.severity === 'high'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      : f.severity === 'medium'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {f.severity}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Blocked accounts */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-500" />
          Blocked accounts
        </h3>
        <p className="text-xs text-muted-foreground mb-2">
          These accounts are denied sign-in and all API access until unblocked.
        </p>
        {blockedLoading ? (
          <LoadingCard />
        ) : !blocked || blocked.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No blocked accounts.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {blocked.map(b => (
              <Card key={b.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{b.name || '—'}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {b.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{b.email}</p>
                    {b.verificationRejectedReason && (
                      <p className="text-[11px] text-rose-500/80 truncate">{b.verificationRejectedReason}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actingId === b.id}
                    onClick={() => doUnblock(b.id)}
                  >
                    {actingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Unblock'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Review modal ------------------------------- */

function ReviewDialog({
  app,
  type,
  onClose,
  onDone,
}: {
  app: DoctorApp | LabApp | null;
  type: 'doctor' | 'lab' | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = React.useState('');
  const [acting, setActing] = React.useState<'approve' | 'reject' | null>(null);

  React.useEffect(() => {
    setReason('');
    setActing(null);
  }, [app]);

  if (!app || !type) return null;

  const isDoctor = type === 'doctor';
  const docApp = isDoctor ? (app as DoctorApp) : null;
  const labApp = !isDoctor ? (app as LabApp) : null;
  const displayName = docApp?.name ?? labApp?.labName ?? 'Applicant';
  const documents = app.documents;

  // Real action against the admin API (previously a fake setTimeout+toast).
  const act = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !reason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Provide a reason for rejection.',
        variant: 'destructive',
      });
      return;
    }
    setActing(action);
    try {
      const endpoint = isDoctor ? '/api/admin/doctors' : '/api/admin/labs';
      const res = await apiFetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: app.id,
          action,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Action failed');
      toast({
        title: action === 'approve' ? 'Application approved' : 'Application rejected',
        description:
          action === 'approve'
            ? `${displayName} has been notified and activated.`
            : `${displayName} has been notified with your reason.`,
      });
      onClose();
      onDone();
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Action failed',
        variant: 'destructive',
      });
    } finally {
      setActing(null);
    }
  };

  return (
    <Dialog open={!!app} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDoctor ? (
              <Stethoscope className="h-4 w-4 text-emerald-600" />
            ) : (
              <Microscope className="h-4 w-4 text-emerald-600" />
            )}
            Review application
          </DialogTitle>
          <DialogDescription>
            {displayName} · submitted {app.submittedAt}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Profile info */}
          <Card className="bg-muted/40">
            <CardContent className="p-3 space-y-1.5 text-xs">
              {docApp && (
                <>
                  <Row label="Specialization" value={docApp.specialization} />
                  <Row label="License" value={docApp.licenseNumber} />
                  <Row label="City" value={docApp.city} />
                  <Row label="Experience" value={`${docApp.experience} years`} />
                  <Row label="Consultation fee" value={`$${docApp.fee}`} />
                </>
              )}
              {labApp && (
                <>
                  <Row label="Lab name" value={labApp.labName} />
                  <Row label="License" value={labApp.licenseNumber} />
                  <Row label="City" value={labApp.city} />
                  <Row label="Tests offered" value={`${labApp.testCount}`} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Documents ({documents.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {documents.map((d, i) => (
                <button
                  key={i}
                  className="flex items-center gap-2 rounded-xl border border-border/60 p-2.5 text-left hover:border-emerald-500/40 transition-all"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{d.name}</p>
                    <p className="text-[10px] text-muted-foreground">{d.type} · preview</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-xl border border-dashed border-border p-4 text-center">
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Document preview will open in a new tab (secure viewer).
              </p>
            </div>
          </div>

          {/* Rejection reason */}
          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              Reason (required for rejection)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. License not found in registry. Please resubmit with a valid KMC number."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => act('reject')}
            disabled={!!acting}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            {acting === 'reject' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Reject
          </Button>
          <Button
            onClick={() => act('approve')}
            disabled={!!acting}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
          >
            {acting === 'approve' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

/* ------------------------------- Refunds tab ------------------------------ */

interface RefundRow {
  id: string;
  userId: string;
  paymentId: string;
  appointmentId: string | null;
  amount: number;
  reason: string | null;
  status: string;
  notes: string | null;
  processedAt: string | null;
  createdAt: string;
  user?: { name: string | null; email: string | null } | null;
}

interface FraudFlag {
  id: string;
  entity: string;
  type: string;
  issue: string;
  severity: 'high' | 'medium' | 'low';
  time: string;
}

interface BlockedUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  phone: string | null;
  verificationRejectedReason: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

const REFUND_REASONS: Record<string, string> = {
  doctor_no_show: 'Doctor no-show',
  lab_no_show: 'Lab no-show',
  patient_cancel: 'Patient cancellation',
  technical_issue: 'Technical issue',
  complaint: 'Complaint',
  admin_override: 'Admin override',
};

const REFUND_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending review', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  processing: { label: 'Processing', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  completed: { label: 'Refunded', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  failed: { label: 'Failed', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  rejected: { label: 'Rejected', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
};

const REFUND_REVIEW_MS = 7 * 24 * 60 * 60 * 1000; // matches the 7-business-day promise

function isRefundOverdue(r: RefundRow) {
  return r.status === 'pending' && Date.now() - new Date(r.createdAt).getTime() > REFUND_REVIEW_MS;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Map the /api/admin/doctors + /api/admin/labs rows to the dashboard's shapes.
function toDoctorApp(x: any): DoctorApp {
  const status =
    x.verificationStatus === 'approved'
      ? 'approved'
      : x.verificationStatus === 'rejected'
        ? 'rejected'
        : 'pending';
  return {
    id: x.id,
    name: x.name ?? 'Unknown doctor',
    email: x.email ?? '',
    specialization: x.specialization ?? '',
    licenseNumber: x.licenseNumber ?? '',
    city: x.city ?? '',
    experience: x.experience ?? 0,
    fee: x.consultationFee ?? 0,
    status,
    submittedAt: x.submittedAt ? timeAgo(x.submittedAt) : 'unknown',
    documents: x.documents ?? [],
  };
}

function toLabApp(x: any): LabApp {
  const status =
    x.verificationStatus === 'approved'
      ? 'approved'
      : x.verificationStatus === 'rejected'
        ? 'rejected'
        : 'pending';
  return {
    id: x.id,
    labName: x.labName ?? 'Unknown lab',
    email: x.email ?? '',
    licenseNumber: x.licenseNumber ?? '',
    city: x.city ?? '',
    testCount: (x.testsOffered ?? []).length,
    status,
    submittedAt: x.submittedAt ? timeAgo(x.submittedAt) : 'unknown',
    documents: x.documents ?? [],
  };
}

function RefundsTab({
  refunds,
  loading,
  error,
  onDone,
}: {
  refunds: RefundRow[] | null;
  loading: boolean;
  error?: string | null;
  onDone: () => void;
}) {
  const [reviewing, setReviewing] = React.useState<RefundRow | null>(null);
  const pending = refunds?.filter(r => r.status === 'pending').length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-600" />
            Refund requests
          </h2>
          <p className="text-xs text-muted-foreground">
            Review patient refunds. Approving processes the refund immediately
            (payment reversed, partner commission clawed back).
          </p>
        </div>
        {!loading && !error && refunds && (
          <Badge
            variant="secondary"
            className="shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          >
            {pending} pending
          </Badge>
        )}
      </div>

      {loading ? (
        <LoadingCard />
      ) : error ? (
        <ErrorCard message={error} />
      ) : !refunds || refunds.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No refund requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {refunds.map(r => {
            const st = REFUND_STATUS[r.status] ?? { label: r.status, cls: 'bg-muted text-muted-foreground' };
            return (
              <Card key={r.id} className={cn(isRefundOverdue(r) && 'ring-1 ring-amber-500/40')}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                        {(r.user?.name ?? 'P')[0] ?? 'P'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{r.user?.name ?? 'Patient'}</h3>
                        <Badge variant="secondary" className={cn('text-[10px] capitalize', st.cls)}>
                          {st.label}
                        </Badge>
                        {isRefundOverdue(r) && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400"
                          >
                            overdue
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {REFUND_REASONS[r.reason ?? ''] ?? r.reason ?? 'Refund'} · $
                        {(r.amount / 100).toFixed(2)}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Submitted {timeAgo(r.createdAt)}
                        {r.user?.email ? <span>· {r.user.email}</span> : null}
                      </div>
                      {r.notes ? (
                        <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{r.notes}</p>
                      ) : null}
                    </div>
                    {r.status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => setReviewing(r)}
                        className="bg-gradient-to-r from-amber-500 to-orange-600 text-white"
                      >
                        Review
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RefundReviewDialog
        refund={reviewing}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null);
          onDone();
        }}
      />
    </div>
  );
}

function RefundReviewDialog({
  refund,
  onClose,
  onDone,
}: {
  refund: RefundRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = React.useState('');
  const [acting, setActing] = React.useState<'approve' | 'reject' | null>(null);

  React.useEffect(() => {
    setNote('');
    setActing(null);
  }, [refund]);

  if (!refund) return null;

  const act = async (action: 'approve' | 'reject') => {
    setActing(action);
    try {
      const res = await apiFetch(`/api/refunds/${refund.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNote: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Action failed');
      toast({
        title: action === 'approve' ? 'Refund approved' : 'Refund rejected',
        description:
          action === 'approve'
            ? `$${(refund.amount / 100).toFixed(2)} is being refunded to the patient.`
            : 'The patient has been notified.',
      });
      onDone();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Action failed', variant: 'destructive' });
    } finally {
      setActing(null);
    }
  };

  return (
    <Dialog open={!!refund} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-amber-600" />
            Review refund
          </DialogTitle>
          <DialogDescription>
            {refund.user?.name ?? 'Patient'} · ${(refund.amount / 100).toFixed(2)} · submitted{' '}
            {timeAgo(refund.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Card className="bg-muted/40">
            <CardContent className="p-3 space-y-1.5 text-xs">
              <Row
                label="Reason"
                value={REFUND_REASONS[refund.reason ?? ''] ?? refund.reason ?? '—'}
              />
              <Row label="Status" value={REFUND_STATUS[refund.status]?.label ?? refund.status} />
              <Row label="Amount" value={`$${(refund.amount / 100).toFixed(2)}`} />
              <Row label="Patient" value={refund.user?.email ?? refund.userId} />
              {refund.notes ? <Row label="Note" value={refund.notes} /> : null}
            </CardContent>
          </Card>

          <div className="space-y-1.5">
            <Label htmlFor="review-note" className="text-xs">
              Note (sent to the patient; optional for approval)
            </Label>
            <Textarea
              id="review-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Verified with the call recording; refunding the consultation fee."
              rows={3}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Approving reverses the payment immediately and claws back the partner
            commission. This action is audit-logged.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => act('reject')}
            disabled={!!acting}
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            {acting === 'reject' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Reject
          </Button>
          <Button
            onClick={() => act('approve')}
            disabled={!!acting}
            className="bg-gradient-to-r from-amber-500 to-orange-600 text-white"
          >
            {acting === 'approve' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve & refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-rose-600 dark:text-rose-400 text-sm">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-60" />
        {message}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- Helpers --------------------------------- */

function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'text-[10px] capitalize',
        status === 'approved' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        status === 'pending' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        status === 'rejected' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
      )}
    >
      {status}
    </Badge>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub: string;
  tint: 'emerald' | 'teal' | 'amber' | 'rose';
}) {
  const cls = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  }[tint];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md', cls)}>
            {icon}
          </span>
          <span className="font-medium truncate">{label}</span>
        </div>
        <div className={cn('text-2xl font-bold', cls.split(' ').slice(1).join(' '))}>{value}</div>
        <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
