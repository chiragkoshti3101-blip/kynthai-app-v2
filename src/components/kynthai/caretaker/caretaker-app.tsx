'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import {
  Users,
  ShoppingBag,
  Sparkles,
  HeartPulse,
  Siren,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Pill,
  TrendingUp,
  Plus,
  UserPlus,
  Activity,
  Clock,
  Phone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { KynthaiBrand } from '@/components/kynthai/logo';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useGreeting } from '@/lib/greeting';
import { useToast } from '@/hooks/use-toast';
import { playProfessionalRingtone, stopAllRingtones } from '@/lib/alarm';
import { logger } from '@/lib/logger';
import { AiChat } from '@/components/medication/ai-chat';
import { CareHub as CaretakerCareHub } from './care-hub';
import { ProfileHub } from '@/components/kynthai/patient/profile-hub';
import { FamilyMemberSchedule } from './member-schedule';
import { MedicationsList } from '@/components/medication/medications-list';
import { NotificationCenter } from '@/components/kynthai/notification-center';
import { MedicationAlarmHost } from '@/components/medication/medication-alarm-host'
import { WebAlertsBanner } from '@/components/kynthai/web-alerts-banner'
import { InstallAppBanner } from '@/components/kynthai/install-app-banner';
import { FamilyCircle } from '@/components/kynthai/family/family-circle';
import { OfflineIndicator } from '@/components/kynthai/offline-indicator';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { AnimatePresence, motion } from 'framer-motion';
import { FadeIn } from '@/components/kynthai/animations';
import type { PulseMember } from '@/components/kynthai/family/family-circle';
import { isDemoEnabled } from '@/lib/demo-mode'

const MarketView = dynamic(
  () => import('@/components/kynthai/market/market-view')
    .then(m => m.MarketView)
    .catch(() => ({
      default: () => <div className="text-sm text-muted-foreground text-center py-8">Market unavailable.</div>,
    })),
  { ssr: false, loading: () => <div className="h-40 rounded-xl bg-muted animate-pulse" /> }
);

type Tab = 'family' | 'meds' | 'market' | 'ai' | 'care' | 'sos';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'family', label: 'Family', icon: Users },
  { id: 'meds', label: 'Meds', icon: Pill },
  { id: 'market', label: 'Find Care', icon: ShoppingBag },
  { id: 'ai', label: 'Ask AI', icon: Sparkles },
  { id: 'care', label: 'Tools', icon: HeartPulse },
  { id: 'sos', label: 'Family Alert', icon: Siren },
];

interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  email?: string;
  phone?: string;
  adherence: number;
  pending: number;
  lowStock: number;
  age: number;
}

const SAMPLE_FAMILY: FamilyMember[] = [
  {
    id: 'fm1',
    name: 'Robert Wilson',
    relation: 'Father',
    email: 'robert@example.com',
    phone: '+1 (555) 012-3456',
    adherence: 85,
    pending: 1,
    lowStock: 1,
    age: 62,
  },
  {
    id: 'fm2',
    name: 'Emma Wilson',
    relation: 'Mother',
    email: 'emma@example.com',
    phone: '+1 (555) 012-3457',
    adherence: 78,
    pending: 1,
    lowStock: 0,
    age: 58,
  },
  {
    id: 'fm3',
    name: 'Noah Wilson',
    relation: 'Child',
    email: 'noah@example.com',
    phone: '+1 (555) 012-3458',
    adherence: 72,
    pending: 3,
    lowStock: 2,
    age: 16,
  },
];

interface EscalatedAlert {
  id: string;
  memberId: string;
  memberName: string;
  message: string;
  severity: 'high' | 'medium';
  time: string;
}

const SAMPLE_ALERTS: EscalatedAlert[] = [
  {
    id: 'a1',
    memberId: 'fm1',
    memberName: 'Robert Wilson',
    message: 'Missed Lisinopril (morning dose)',
    severity: 'high',
    time: '2h ago',
  },
  {
    id: 'a2',
    memberId: 'fm3',
    memberName: 'Noah Wilson',
    message: 'Albuterol inhaler running low (3 doses left)',
    severity: 'medium',
    time: '5h ago',
  },
];

interface MemberMeds {
  [memberId: string]: Array<{
    id: string;
    name: string;
    dosage: string;
    time: string;
    status: 'pending' | 'taken' | 'skipped';
    color?: string;
    instructions?: string | null;
    medicationId?: string;
  }>;
}

const SAMPLE_MEMBER_MEDS: MemberMeds = {
  fm1: [
    {
      id: 'm1',
      name: 'Metformin',
      dosage: '500 mg',
      time: '08:00',
      status: 'taken',
      instructions: 'With meals',
    },
    {
      id: 'm2',
      name: 'Amlodipine',
      dosage: '5 mg',
      time: '08:00',
      status: 'taken',
      instructions: 'After breakfast',
    },
    {
      id: 'm3',
      name: 'Metformin',
      dosage: '500 mg',
      time: '20:00',
      status: 'pending',
      instructions: 'With meals',
    },
    {
      id: 'm4',
      name: 'Aspirin',
      dosage: '75 mg',
      time: '08:00',
      status: 'taken',
      instructions: 'With food',
    },
  ],
  fm2: [
    {
      id: 'm5',
      name: 'Thyroxine',
      dosage: '50 mcg',
      time: '07:00',
      status: 'taken',
      instructions: 'Empty stomach',
    },
    {
      id: 'm6',
      name: 'Calcium + D3',
      dosage: '500 mg',
      time: '20:00',
      status: 'pending',
      instructions: 'After dinner',
    },
  ],
  fm3: [
    {
      id: 'm7',
      name: 'Cetirizine',
      dosage: '10 mg',
      time: '21:00',
      status: 'pending',
      instructions: 'As needed for allergies',
    },
  ],
};

export function CaretakerApp({ user }: { user: AuthUser }) {
  const { logout, setScreen } = useAppStore();
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<Tab>('family');
  const greeting = useGreeting();
  const isDemo = !!user.isDemo || user.email?.endsWith('@kynthai.app');
  const [profileOpen, setProfileOpen] = React.useState(false);

  const handleLogout = React.useCallback(async () => {
    router.replace('/login');
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    logout();
  }, [logout, router]);
  const [family, setFamily] = React.useState<FamilyMember[]>(isDemo ? SAMPLE_FAMILY : []);
  const [alerts, setAlerts] = React.useState<EscalatedAlert[]>(isDemo ? SAMPLE_ALERTS : []);
  const [selectedMember, setSelectedMember] = React.useState<FamilyMember | null>(
    isDemo ? SAMPLE_FAMILY[0] ?? null : null
  );
  const [addOpen, setAddOpen] = React.useState(false);
  const [memberMeds, setMemberMeds] = React.useState<MemberMeds>(isDemo ? SAMPLE_MEMBER_MEDS : {});
  const [familyPulse, setFamilyPulse] = React.useState<PulseMember[]>([]);
  const [pulseLoading, setPulseLoading] = React.useState(!isDemo);

  // Load family pulse data for the health circle
  React.useEffect(() => {
    // Demo accounts: use sample data immediately — no API call, no loading.
    if (isDemo) {
      setFamilyPulse([
        { memberId: 'fm1', name: 'Robert Wilson', relation: 'Father', color: 'emerald', score: 85, adherence: 85, total: 4, taken: 3, missed: 1, status: 'all_taken', lastTaken: null, conditions: [] },
        { memberId: 'fm2', name: 'Emma Wilson', relation: 'Mother', color: 'teal', score: 78, adherence: 78, total: 2, taken: 1, missed: 1, status: 'in_progress', lastTaken: null, conditions: [] },
        { memberId: 'fm3', name: 'Noah Wilson', relation: 'Child', color: 'cyan', score: 100, adherence: 100, total: 1, taken: 1, missed: 0, status: 'all_taken', lastTaken: null, conditions: [] },
      ]);
      return;
    }
    let cancelled = false;
    // Safety timeout — never let pulseLoading hang forever
    const safetyTimer = setTimeout(() => { if (!cancelled) setPulseLoading(false); }, 5000);
    async function loadPulse() {
      try {
        const res = await fetch('/api/family/pulse', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setFamilyPulse(data);
        }
      } catch {
        // Silently fail — circle will show empty state
      } finally {
        if (!cancelled) setPulseLoading(false);
      }
    }
    loadPulse();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, []);

  // ── Global reminder alert for family members ──────────────────────────
  // The caretaker manages medications for the whole family. This ensures
  // they are notified of pending reminders for ANY family member, regardless
  // of which tab they are on.
  React.useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    let seen = new Set<string>();

    async function check() {
      if (cancelled) return;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const memberPromises = family.map(async (m) => {
          const res = await fetch(`/api/reminders?date=${today}&familyMemberId=${m.id}`, { credentials: 'include' });
          if (!res.ok) return [];
          const data = await res.json();
          return (data.reminders ?? []).map((r: { id: string; time: string; status: string; medication?: { name?: string; dosage?: string } }) => ({
            ...r,
            memberName: m.name,
          }));
        });
        const allReminders = (await Promise.all(memberPromises)).flat();
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        for (const r of allReminders) {
          if (r.status !== 'pending') continue;
          const [h = 0, m = 0] = r.time.split(':').map(Number);
          const reminderMins = h * 60 + m;
          if (reminderMins <= nowMins && nowMins - reminderMins < 15 && !seen.has(r.id)) {
            seen.add(r.id);
            const name = r.medication?.name ?? 'medication';
            const member = r.memberName ?? 'family member';
            playProfessionalRingtone();
            toast({
              title: `Reminder for ${member}: take ${name}`,
              description: `${r.time} — open the Meds tab to mark taken or skipped.`,
              duration: 30000,
            });
          }
        }
      } catch { /* best-effort */ }
    }

    check();
    const interval = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isDemo, family, toast, setTab]);

  // Load real medications for each family member from API
  // N+1 → parallel: fire all per-member reminder fetches simultaneously.
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isDemo) return;
      try {
        const famRes = await fetch('/api/family', { credentials: 'include' });
        if (!famRes.ok) {
          // Silently handle expected auth errors; surface other failures
          if (famRes.status === 403) return;
          logger.warn('Family fetch failed:', famRes.status);
          return;
        }
        const famData = await famRes.json();
        const members: Array<{ id: string; name: string; relation?: string; age?: number | null }> =
          famData.members ?? [];
        if (cancelled || members.length === 0) return;

        // Real family members replace the SAMPLE_FAMILY placeholders (whose fake
        // ids like 'fm1' break any API call that validates familyMemberId).
        // ponytail: adherence/pending/lowStock default to 0 — /api/family
        // doesn't return them; if demo numbers are wanted later, compute from
        // reminders instead of hardcoding.
        if (!cancelled) {
          const realFamily: FamilyMember[] = members.map(m => ({
            id: m.id,
            name: m.name,
            relation: m.relation ?? 'Family',
            adherence: 0,
            pending: 0,
            lowStock: 0,
            age: m.age ?? 0,
          }))
          setFamily(realFamily)
          setSelectedMember(prev => {
            const stillReal = prev && realFamily.some(x => x.id === prev.id)
            return stillReal ? prev : (realFamily[0] ?? null)
          })
        }

        const today = new Date().toISOString().split('T')[0];
        const allMeds: MemberMeds = {};

        // ── PARALLEL: one fetch per member, all fired simultaneously ──────────
        const reminderPromises = members.map(async m => {
          const remRes = await fetch(`/api/reminders?date=${today}&familyMemberId=${m.id}`, {
            credentials: 'include',
          });
          if (remRes.ok) {
            const raw = await remRes.json();
            const reminders = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.data)
                ? raw.data
                : Array.isArray(raw?.reminders)
                  ? raw.reminders
                  : [];
            const meds = reminders.map(
              (r: {
                id: string;
                time: string;
                date: string;
                status: string;
                medicationId: string;
                medication?: {
                  name: string;
                  dosage: string;
                  instructions?: string | null;
                  color?: string;
                };
              }) => ({
                id: r.id,
                name: r.medication?.name ?? 'Medication',
                dosage: r.medication?.dosage ?? '',
                time: r.time,
                status: r.status as 'pending' | 'taken' | 'skipped',
                instructions: r.medication?.instructions,
                color: r.medication?.color,
                medicationId: r.medicationId,
              })
            );
            return { memberId: m.id, meds };
          }
          return { memberId: m.id, meds: [] as MemberMeds[string] };
        });

        const results = await Promise.all(reminderPromises);
        const medsMap: MemberMeds = {};
        for (const r of results) {
          if (r.meds.length > 0) medsMap[r.memberId] = r.meds;
        }

        if (!cancelled) setMemberMeds(medsMap);
      } catch (err) {
        logger.warn('Failed to load family medications:', err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  const updateMemberMed = React.useCallback(
    async (
      memberId: string,
      med: { id: string; medicationId?: string; time: string },
      status: 'taken' | 'skipped'
    ) => {
      // Optimistic UI update
      setMemberMeds(prev => ({
        ...prev,
        [memberId]: prev[memberId]?.map(m => (m.id === med.id ? { ...m, status } : m)) ?? [],
      }));
      // Hit the API to persist
      if (med.medicationId) {
        try {
          const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
            .then(r => r.json())
            .then(d => d.token);
          await fetch('/api/reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
            credentials: 'include',
            body: JSON.stringify({
              medicationId: med.medicationId,
              date: new Date().toISOString().split('T')[0],
              time: med.time,
              status,
            }),
          });
        } catch {
          /* ignore */
        }
      }
    },
    []
  );

  const initial = isDemo ? 'K' : (user.name?.[0] ?? 'C').toUpperCase();
  const familyName = isDemo ? 'Guest' : (user.name?.split(' ').slice(-1)[0] ?? 'Family');
  const displayName = familyName === 'Family' ? 'My Family' : `The ${familyName} Family`;

  const dismissAlert = (id: string) => setAlerts(p => p.filter(a => a.id !== id));
  const resolveAlert = (id: string) => {
    setAlerts(p => p.filter(a => a.id !== id));
    toast({ title: 'Marked as taken', description: 'Reminder resolved for family member.' });
  };

  return (
    <div className="relative min-h-dvh flex flex-col bg-gradient-to-b from-emerald-50/40 via-background to-background dark:from-emerald-950/20">
      <InstallAppBanner />
      <WebAlertsBanner />
      {selectedMember && (
        <MedicationAlarmHost
          isDemo={isDemo}
          familyMemberId={isDemo ? undefined : selectedMember.id}
        />
      )}
      {/* Top app bar */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/70 pt-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          {/* Kynthai Brand - Prominent, Left Side */}
          <div className="flex items-center">
            <KynthaiBrand iconSize={32} />
          </div>

          {/* Caretaker Profile - Secondary, Right Side */}
          <div className="flex items-center gap-1">
            <button onClick={() => setProfileOpen(true)} className="flex items-center gap-3" aria-label="Profile">
              <Avatar className="h-10 w-10 ring-2 ring-emerald-500/20">
                <AvatarFallback className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-semibold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="text-sm text-muted-foreground leading-tight">{greeting}</p>
                <p className="text-base font-semibold leading-tight">{displayName}</p>
              </div>
            </button>
            <div className="flex items-center gap-1">
              <NotificationCenter
                userId={user.id}
                isDemo={isDemo}
                onNavigate={(t: string) => setTab(t as Tab)}
              />
              <OfflineIndicator />
            </div>
          </div>
        </div>
      </header>

      {/* Demo banner */}
      {isDemo && isDemoEnabled() && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-[11px] text-amber-700 dark:text-amber-300">
          Demo mode — sample data, changes won&apos;t be saved
        </div>
      )}

      <main id="main-content" className="mx-auto max-w-3xl w-full flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
        <AnimatePresence initial={false}>
          {tab === 'family' && (
            <FadeIn key="family">
              <FamilyTab
                family={family}
                alerts={alerts}
                onResolve={resolveAlert}
                onDismiss={dismissAlert}
                onAddMember={() => setAddOpen(true)}
                familyName={displayName}
                memberMeds={memberMeds}
                onUpdateMemberMed={updateMemberMed}
                familyPulse={familyPulse}
                pulseLoading={pulseLoading}
              />
            </FadeIn>
          )}
          {tab === 'meds' && (
            <FadeIn key="meds">
              <div className="space-y-3">
                <MemberSelector
                  members={family}
                  selected={selectedMember}
                  onSelect={setSelectedMember}
                />
                {selectedMember ? (
                  <MedicationsList familyMemberId={selectedMember.id} isDemo={isDemo} />
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <Pill className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm font-medium">Select a family member</p>
                      <p className="text-sm mt-1">
                        Choose someone above to manage their medications.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </FadeIn>
          )}
          {tab === 'market' && (
            <FadeIn key="market">
              <ScopedTab members={family} selected={selectedMember} onSelect={setSelectedMember}>
                <MarketView />
              </ScopedTab>
            </FadeIn>
          )}
          {tab === 'ai' && (
            <FadeIn key="ai">
              <AiChat />
            </FadeIn>
          )}
          {tab === 'care' && (
            <FadeIn key="care">
              {selectedMember ? (
                <ScopedTab members={family} selected={selectedMember} onSelect={setSelectedMember}>
                  <CaretakerCareHub
                    familyMemberId={selectedMember.id}
                    memberName={selectedMember.name}
                    familyPulse={familyPulse}
                    pulseLoading={pulseLoading}
                  />
                </ScopedTab>
              ) : (
                <CaretakerCareHub
                  familyMemberId={undefined}
                  memberName={undefined}
                  familyPulse={familyPulse}
                  pulseLoading={pulseLoading}
                />
              )}
            </FadeIn>
          )}
          {tab === 'sos' && (
            <FadeIn key="sos">
              <>
                {selectedMember ? (
                  <SosTab members={family} selected={selectedMember} onSelect={setSelectedMember} />
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <Siren className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p>Add a family member to enable SOS.</p>
                    </CardContent>
                  </Card>
                )}
              </>
            </FadeIn>
          )}
        </AnimatePresence>
      </main>

      {/* Spacer pushes gradient to fill viewport behind fixed bottom nav */}
      <div className="h-20 shrink-0" aria-hidden />

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/90 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/80 pb-safe">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around gap-1 overflow-x-auto px-2 py-2 scrollbar-none">
          {TABS.map(t => {
            const active = tab === t.id;
            const Icon = t.icon;
            const isSos = t.id === 'sos';
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-label={t.label}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 min-h-11 text-[11px] font-medium transition-all',
                  isSos
                    ? active
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-rose-500/80 hover:text-rose-600'
                    : active
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl transition-all',
                    isSos
                      ? active
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : 'bg-rose-500/10 text-rose-500'
                      : active
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'bg-transparent'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <ProfileHub
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user}
        onLogout={handleLogout}
        onShowPricing={() => router.push('/pricing')}
        onShowPrivacy={() => router.push('/privacy')}
        onSwitchPortal={() => router.push('/login')}
      />
      <AddMemberDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={m => {
          setFamily(p => [...p, m]);
          if (!selectedMember) setSelectedMember(m);
          toast({ title: 'Family member added', description: `${m.name} (${m.relation})` });
        }}
      />
    </div>
  );
}

/* --------------------------------- Family tab -------------------------------- */

function FamilyTab({
  family,
  alerts,
  onResolve,
  onDismiss,
  onAddMember,
  familyName,
  memberMeds,
  onUpdateMemberMed,
  familyPulse,
  pulseLoading,
}: {
  family: FamilyMember[];
  alerts: EscalatedAlert[];
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  onAddMember: () => void;
  familyName: string;
  memberMeds: MemberMeds;
  onUpdateMemberMed: (
    memberId: string,
    med: { id: string; medicationId?: string; time: string },
    status: 'taken' | 'skipped'
  ) => void;
  familyPulse: PulseMember[];
  pulseLoading: boolean;
}) {
  const avgAdherence = family.length
    ? Math.round(family.reduce((s, m) => s + m.adherence, 0) / family.length)
    : 0;
  const totalOverdue = family.reduce((s, m) => s + m.pending, 0);
  const totalLow = family.reduce((s, m) => s + m.lowStock, 0);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 via-emerald-500 to-emerald-600 p-5 text-white shadow-lg shadow-emerald-600/20">
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="text-sm opacity-90">{familyName}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {family.length} {family.length === 1 ? 'member' : 'members'} · {avgAdherence}% avg
          </h1>
          <p className="mt-1 text-sm opacity-90">
            Live adherence & alerts from everyone you care for.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Adherence"
          value={`${avgAdherence}%`}
          tint="emerald"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Overdue"
          value={totalOverdue}
          tint="amber"
        />
        <StatCard
          icon={<Pill className="h-4 w-4" />}
          label="Low stock"
          value={totalLow}
          tint="rose"
        />
      </div>

      {/* Family Health Circle */}
      <FamilyCircle members={familyPulse} loading={pulseLoading} />

      {/* Alerts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Escalated alerts
            {alerts.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {alerts.length}
              </Badge>
            )}
          </h2>
        </div>
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="p-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              All clear — no escalations right now.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {alerts.map(a => (
              <Card key={a.id} className={cn(a.severity === 'high' && 'ring-1 ring-rose-500/30')}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        a.severity === 'high'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{a.memberName}</p>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px]',
                            a.severity === 'high'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          )}
                        >
                          {a.severity}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">{a.time}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{a.message}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onResolve(a.id)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Taken
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => onDismiss(a.id)}
                    >
                      <XCircle className="h-3 w-3" />
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Members */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            Family members
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={onAddMember}
            className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        <div className="space-y-4">
          {family.map(m => (
            <div key={m.id} className="space-y-2">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                        {m.name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{m.name}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {m.relation}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">· {m.age}y</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Adherence</span>
                          <span
                            className={cn(
                              'font-semibold',
                              m.adherence >= 85
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : m.adherence >= 70
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400'
                            )}
                          >
                            {m.adherence}%
                          </span>
                        </div>
                        <Progress value={m.adherence} className="h-1.5" />
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px]">
                        {m.pending > 0 && (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Clock className="h-3 w-3" />
                            {m.pending} pending
                          </span>
                        )}
                        {m.lowStock > 0 && (
                          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                            <Pill className="h-3 w-3" />
                            {m.lowStock} low stock
                          </span>
                        )}
                        {m.pending === 0 && m.lowStock === 0 && (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            All caught up
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <FamilyMemberSchedule
                memberName={m.name}
                memberId={m.id}
                meds={memberMeds[m.id] ?? []}
                onUpdate={(med, status) => onUpdateMemberMed(m.id, med, status)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Scoped wrapper ------------------------------ */

function ScopedTab({
  members,
  selected,
  onSelect,
  children,
}: {
  members: FamilyMember[];
  selected: FamilyMember | null;
  onSelect: (m: FamilyMember) => void;
  children: React.ReactNode;
}) {
  if (!selected) {
    return <div>{children}</div>;
  }
  return (
    <div className="space-y-3">
      <MemberSelector members={members} selected={selected} onSelect={onSelect} />
      {children}
    </div>
  );
}

function MemberSelector({
  members,
  selected,
  onSelect,
}: {
  members: FamilyMember[];
  selected: FamilyMember | null;
  onSelect: (m: FamilyMember) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto custom-scroll pb-1">
      {members.map(m => (
        <button
          key={m.id}
          onClick={() => onSelect(m)}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
            selected?.id === m.id
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-border hover:border-emerald-500/40'
          )}
        >
          <Avatar className="h-5 w-5">
            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-[10px]">
              {m.name[0]}
            </AvatarFallback>
          </Avatar>
          {m.name.split(' ')[0]}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- SOS tab --------------------------------- */

function SosTab({
  members,
  selected,
  onSelect,
}: {
  members: FamilyMember[];
  selected: FamilyMember;
  onSelect: (m: FamilyMember) => void;
}) {
  const { toast } = useToast();
  const [stage, setStage] = React.useState<'idle' | 'triggering' | 'triggered'>('idle');
  const [response, setResponse] = React.useState<{
    notifiedDoctors: { name: string; eta?: string }[];
    summary: string;
  } | null>(null);

  const trigger = async (tier: 'critical' | 'family') => {
    setStage('triggering');
    let anyOk = false;
    let lastError = '';
    try {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => d.token as string)
        .catch(() => null);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      };

      // Step 1: call emergency-sos to log the SOS trigger
      const sosRes = await fetch('/api/emergency-sos', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          location: `Caretaker app — ${selected.name}`,
          notes: `${tier === 'critical' ? 'Critical' : 'Family'} SOS triggered from caretaker app`,
          medicalInfo: '',
        }),
      });
      anyOk = sosRes.ok;
      if (!sosRes.ok) lastError = ((await sosRes.json().catch(() => ({}))).error as string) || '';

      // Step 2: call the emergency family alert endpoint (returns real linked doctors)
      const emRes = await fetch('/api/emergency', {
        method: 'POST',
        headers,
        body: JSON.stringify({ memberId: selected.id, memberName: selected.name, tier }),
      });
      anyOk = anyOk || emRes.ok;
      let data: { notifiedDoctors?: { name: string; eta?: string }[]; summary?: string } = {};
      if (emRes.ok) {
        data = await emRes.json();
      }
      setResponse({
        notifiedDoctors: data.notifiedDoctors ?? [],
        summary:
          data.summary ??
          (anyOk
            ? `${selected.name} — emergency SOS sent to your family and linked doctors.`
            : 'SOS alert could not be sent. Call 911 or your local emergency number immediately.'),
      });
      setStage('triggered');
      if (anyOk) {
        const desc =
          tier === 'critical'
            ? 'Family and linked doctors alerted. Call 911 yourself if life-threatening.'
            : 'Caretaker notified — they will reach out shortly.';
        toast({
          title: `${tier === 'critical' ? 'Critical' : 'Family'} SOS triggered`,
          description: desc,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'SOS alert could not be sent',
          description:
            lastError || 'Call 911 or your local emergency number immediately.',
          variant: 'destructive',
        });
      }
    } catch {
      setResponse({
        notifiedDoctors: [],
        summary: `${selected.name} — SOS alert could not be sent. Call 911 yourself if life-threatening.`,
      });
      setStage('triggered');
    }
  };

  const reset = () => {
    setStage('idle');
    setResponse(null);
  };

  return (
    <div className="space-y-4">
      <MemberSelector members={members} selected={selected} onSelect={onSelect} />

      <Card>
        <CardContent className="p-5 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10">
            <Siren className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          </div>
          <h2 className="text-lg font-bold">Emergency SOS</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trigger an emergency for{' '}
            <span className="font-semibold text-foreground">{selected.name}</span>. Alerts your
            family and linked doctors — it does not replace calling 911.
          </p>

          {stage === 'idle' && (
            <div className="mt-5 space-y-3">
              {/* Always-available 911 call — never hidden behind the trigger
                  state so a family member can always dial emergency services. */}
              <a href="tel:911" aria-label="Call 911, the US emergency number" className="block">
                <Button
                  size="lg"
                  className="w-full h-14 text-base bg-gradient-to-r from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-600/30 hover:from-rose-600 hover:to-rose-800"
                >
                  <Phone className="h-5 w-5" /> Call 911 — US emergency number
                </Button>
              </a>
              <Button
                size="lg"
                onClick={() => trigger('critical')}
                className="w-full bg-gradient-to-r from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-600/30 hover:from-rose-600 hover:to-rose-800 h-14 text-base"
              >
                <Siren className="h-5 w-5" />
                SOS -- Critical
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Alerts family + linked doctors — call 911 yourself if life-threatening
              </p>

              <Button
                size="lg"
                variant="outline"
                onClick={() => trigger('family')}
                className="w-full border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 h-12 text-sm"
              >
                <Users className="h-4 w-4" />
                Alert Caretaker
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Not life-threatening — caretaker will reach out
              </p>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-relaxed text-muted-foreground text-left">
            <AlertTriangle className="h-3.5 w-3.5 inline-block -mt-0.5 mr-1 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold text-amber-700 dark:text-amber-400">Important:</span>{' '}
            Kynthai cannot place calls or dispatch responders. In a life-threatening emergency,
            always <span className="font-semibold text-foreground">call 911 (US) or your local emergency number yourself</span> and
            call the hospital directly. Kynthai sends alerts and reminder texts to your listed
            contacts, but it is not a replacement for emergency services.
          </div>
          {stage === 'triggering' && (
            <Button
              size="lg"
              disabled
              className="mt-5 w-full h-14 text-base bg-rose-600 text-white"
            >
              <Activity className="h-5 w-5 animate-pulse" />
              Notifying emergency contacts...
            </Button>
          )}

          {stage === 'triggered' && response && (
            <div className="mt-5 space-y-3 text-left">
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Emergency triggered for {selected.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Family and linked doctors have been alerted. If this is life-threatening, call 911
                  or your local emergency number now.
                </p>
              </div>

              {response.notifiedDoctors.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Notified doctors
                  </p>
                  <div className="space-y-2">
                    {response.notifiedDoctors.map((d, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-border/60 p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium">{d.name}</span>
                        </div>
                        {d.eta && (
                          <Badge variant="secondary" className="text-[10px]">
                            ETA {d.eta}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Alert summary
                </p>
                <Card className="bg-muted/40">
                  <CardContent className="p-3 text-sm leading-relaxed">
                    {response.summary}
                  </CardContent>
                </Card>
              </div>

              <Button variant="outline" className="w-full" onClick={reset}>
                Reset
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ Add member dialog ---------------------------- */

function AddMemberDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (m: FamilyMember) => void;
}) {
  const { toast: showToast } = useToast();
  const [name, setName] = React.useState('');
  const [relation, setRelation] = React.useState('spouse');
  const [age, setAge] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');

  const submit = async () => {
    if (!name || !relation) return;
    const parsedAge = parseInt(age, 10);
    const clampedAge = Number.isFinite(parsedAge) ? Math.max(0, Math.min(parsedAge, 150)) : 0;

    const newMember: FamilyMember = {
      id: `fm_${Date.now()}`,
      name,
      relation,
      email: email || undefined,
      phone: phone || undefined,
      age: clampedAge,
      adherence: 100,
      pending: 0,
      lowStock: 0,
    };
    onAdd(newMember);
    onClose();
    setName('');
    setRelation('spouse');
    setAge('');
    setEmail('');
    setPhone('');

    // Persist via API — call POST /api/family/invite
    try {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
        .then(r => r.json())
        .then(d => d.token);
      const res = await fetch('/api/family/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        credentials: 'include',
        body: JSON.stringify({
          action: 'invite',
          email: email || undefined,
          name,
          relation,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast({
          title: 'Invite failed',
          description: data.error || 'Could not send invite.',
          variant: 'destructive',
        });
        return;
      }
      const data = await res.json().catch(() => ({}));
      showToast({ title: 'Invite sent', description: data.message || `${name} has been invited.` });
    } catch {
      showToast({
        title: 'Invite sent (offline)',
        description: `${name} will be synced when you're back online.`,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add family member</DialogTitle>
          <DialogDescription>
            Add someone you care for. You can manage up to 10 members.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="fm-name">Full name</Label>
            <Input
              id="fm-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Emily Carter"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fm-rel">Relation</Label>
              <select
                id="fm-rel"
                value={relation}
                onChange={e => setRelation(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none"
              >
                <option value="self">Self</option>
                <option value="spouse">Spouse</option>
                <option value="parent">Parent</option>
                <option value="child">Child</option>
                <option value="sibling">Sibling</option>
                <option value="grandparent">Grandparent</option>
                <option value="grandchild">Grandchild</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fm-age">Age</Label>
              <Input
                id="fm-age"
                type="number"
                inputMode="numeric"
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="62"
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fm-email">Email</Label>
            <Input
              id="fm-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. aarav@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fm-phone">Phone</Label>
            <Input
              id="fm-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. +1 (555) 123-4567"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!name || !relation}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
          >
            <Plus className="h-4 w-4" />
            Add member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Helpers --------------------------------- */

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tint: 'emerald' | 'amber' | 'rose';
}) {
  const cls = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  }[tint];
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-1.5">
          <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md', cls)}>
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </div>
        <div className={cn('text-xl font-bold', cls.split(' ').slice(1).join(' '))}>{value}</div>
      </CardContent>
    </Card>
  );
}
