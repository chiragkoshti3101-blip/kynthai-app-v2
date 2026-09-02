'use client';

import * as React from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Home,
  Phone,
  PhoneCall,
  Pill,
  ShoppingBag,
  Sparkles,
  BookOpen,
  Siren,
  Loader2,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Heart,
  HeartPulse,
  Share2,
  Crown,
  CalendarDays,
  TrendingUp,
  Droplets,
  Thermometer,
  Weight,
  Plus,
  ChevronRight,
  FlaskConical,
  LayoutGrid,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAppStore, type AuthUser } from '@/lib/store';
import { KynthaiBrand } from '@/components/kynthai/logo';
import { useRouter } from 'next/navigation';
import { isDemoUser, isDemoEnabled } from '@/lib/demo-mode';
import { useGreeting } from '@/lib/greeting';
import { AchievementCelebration } from '@/components/kynthai/achievement-celebration';
import { useToast } from '@/hooks/use-toast';
import { TodayView } from '@/components/medication/today-view';
import { MedicationsList } from '@/components/medication/medications-list';
import { MedicationAlarmHost } from '@/components/medication/medication-alarm-host'
import { WebAlertsBanner } from '@/components/kynthai/web-alerts-banner'
import { InstallAppBanner } from '@/components/kynthai/install-app-banner'
import { NotificationPermissionBanner } from '@/components/kynthai/notification-permission-banner';
import { AiChat } from '@/components/medication/ai-chat';
import { CareHub } from '@/components/kynthai/caretaker/care-hub';
import { NotificationCenter } from '@/components/kynthai/notification-center';
import { OfflineIndicator } from '@/components/kynthai/offline-indicator';
import { ProfileHub } from '@/components/kynthai/patient/profile-hub';
import { EmergencyNumberCard, useEmergencyCountry } from '@/components/kynthai/emergency-country-selector';
import { ShareSheet } from '@/components/kynthai/share-sheet';
import { FadeIn } from '@/components/kynthai/animations';
import { LabResultsViewer } from '@/components/kynthai/patient/lab-results-viewer';
import { BookAppointment } from '@/components/kynthai/patient/book-appointment';
import { formatAppointmentTime } from '@/lib/appointment-time';
import dynamic from 'next/dynamic';

// ── dynamic video-call load ───────────────────────────────────────────────
const VideoCall = dynamic(
  () =>
    import('@/components/kynthai/video-call')
      .then(m => m.VideoCall)
      .catch(() => {
        // graceful fallback if the component is removed
        return () => (
          <div className="text-sm text-muted-foreground text-center py-8">
            Video call unavailable.
          </div>
        );
      }),
  { ssr: false, loading: () => <div className="h-40 rounded-xl bg-muted animate-pulse" /> }
);

// ── dynamic market load ────────────────────────────────────────────────────
const MarketView = dynamic(
  () =>
    import('@/components/kynthai/market/market-view')
      .then(m => m.MarketView)
      .catch(() => ({
        default: ({}: Record<string, never>) => (
          <div className="text-sm text-muted-foreground text-center py-8">Market view loading…</div>
        ),
      })),
  {
    ssr: false,
    // Founder P1: skeleton instead of text — feels instant even on 3G.
    loading: () => (
      <div className="space-y-3" aria-hidden>
        <div className="h-24 rounded-2xl bg-muted animate-pulse" />
        <div className="h-40 rounded-2xl bg-muted animate-pulse" />
        <div className="h-40 rounded-2xl bg-muted animate-pulse" />
      </div>
    ),
  }
);

// ════════════════════════════════════════════════════════════════════════════
// types & data
// ════════════════════════════════════════════════════════════════════════════

type Tab = 'home' | 'meds' | 'market' | 'lab' | 'ai' | 'journal' | 'tools' | 'sos' | 'more';
type TabVariant = Tab;

// Founder UX wave: 5 bottom tabs (native convention) + SOS as a floating
// emergency action. AI / Journal / Tools / SOS live inside the More hub and
// remain valid routes for notifications & quick links.
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'meds', label: 'Meds', icon: Pill },
  { id: 'market', label: 'Care', icon: ShoppingBag },
  { id: 'lab', label: 'Lab', icon: FlaskConical },
  { id: 'more', label: 'More', icon: LayoutGrid },
];

const MORE_ITEMS: { id: Tab; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'ai', label: 'AI Assistant', desc: 'Ask about meds, symptoms & health', icon: Sparkles },
  { id: 'journal', label: 'Health Journal', desc: 'Track how you feel each day', icon: BookOpen },
  { id: 'tools', label: 'Care Tools', desc: 'Family care & health checks', icon: HeartPulse },
  { id: 'sos', label: 'Emergency SOS', desc: 'Alert your trusted contacts', icon: Siren },
];

interface HealthMetric {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  trend: 'up' | 'down' | 'stable';
  color: string;
}

const METRICS: HealthMetric[] = [
  {
    label: 'Blood Pressure',
    value: '118/76',
    unit: 'mmHg',
    icon: HeartPulse,
    trend: 'stable',
    color: 'text-rose-600   bg-rose-50 dark:text-rose-400  dark:bg-rose-950/30',
  },
  {
    label: 'Blood Glucose',
    value: '102',
    unit: 'mg/dL',
    icon: Droplets,
    trend: 'up',
    color: 'text-blue-600   bg-blue-50 dark:text-blue-400   dark:bg-blue-950/30',
  },
  {
    label: 'Weight',
    value: '72.4',
    unit: 'kg',
    icon: Weight,
    trend: 'down',
    color: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30',
  },
  {
    label: 'Body Temp',
    value: '98.6',
    unit: '°F',
    icon: Thermometer,
    trend: 'stable',
    color: 'text-amber-600  bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30',
  },
];

interface JournalEntry {
  id: string;
  date: string;
  title: string;
  body: string;
  mood: 'good' | 'okay' | 'bad';
}

const DEMO_JOURNAL: JournalEntry[] = [
  {
    id: 'j1',
    date: '2026-07-13',
    title: 'Feeling better today',
    body: 'Took morning meds on time. Energy levels improving after breakfast.',
    mood: 'good',
  },
  {
    id: 'j2',
    date: '2026-07-12',
    title: 'Rough night',
    body: 'Could not sleep well. Woke up around 3 AM. Need to adjust evening routine.',
    mood: 'bad',
  },
  {
    id: 'j3',
    date: '2026-07-11',
    title: 'Good walk in the park',
    body: 'Walked 30 minutes. Appetite is back. No headaches today.',
    mood: 'good',
  },
  {
    id: 'j4',
    date: '2026-07-10',
    title: 'Starting new medication',
    body: 'Began the new course today. Doctor advised to take after meals.',
    mood: 'okay',
  },
];

interface Appointment {
  id: string;
  doctor: string;
  specialty: string;
  date: string;
  time: string;
  type: 'in-person' | 'video';
  status: 'pending' | 'upcoming' | 'confirmed' | 'completed' | 'cancelled';
}

// Wave-8: no more raw ISO strings in the UI — dates render through formatters.
function formatApptDay(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Keep read-only demo appointments relative to the current date so a demo
// never decays into an empty state simply because its sample dates are stale.
function demoAppointmentIso(daysFromToday: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const DEMO_APPOINTMENTS: Appointment[] = [
  {
    id: 'a1',
    doctor: 'Dr. Sarah Chen',
    specialty: 'Cardiology',
    date: demoAppointmentIso(1, 10, 0),
    time: '10:00 AM',
    type: 'in-person',
    status: 'confirmed',
  },
  {
    id: 'a2',
    doctor: 'Dr. James Miller',
    specialty: 'General Care',
    date: demoAppointmentIso(3, 14, 30),
    time: '2:30 PM',
    type: 'video',
    status: 'upcoming',
  },
  {
    id: 'a3',
    doctor: 'Dr. Priya Gupta',
    specialty: 'Dermatology',
    date: demoAppointmentIso(7, 11, 0),
    time: '11:00 AM',
    type: 'video',
    status: 'pending',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// sub-views
// ════════════════════════════════════════════════════════════════════════════

function StreakRing({ days, target }: { days: number; target?: number }) {
  const pct = Math.min(((days || 0) / (target || 7)) * 100, 100);
  const r = 36;
  const C = 2 * Math.PI * r;
  const offset = C - (pct / 100) * C;
  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted/30"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          className="text-emerald-500"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{days}</span>
        <span className="text-[0.625rem] text-muted-foreground">days</span>
      </div>
    </div>
  );
}

function MetricCard({ m, index }: { m: HealthMetric; index: number }) {
  const Icon = m.icon;
  return (
    <FadeIn delay={index * 0.07}>
      <Card>
        <CardContent className="flex items-center gap-3 p-3.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.color}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] text-muted-foreground">{m.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-semibold">{m.value}</span>
              <span className="text-[0.625rem] text-muted-foreground">{m.unit}</span>
            </div>
          </div>
          <TrendingUp
            className={`h-3.5 w-3.5 shrink-0 ${m.trend === 'stable' ? 'opacity-30' : m.trend === 'down' ? 'rotate-180' : ''}`}
          />
        </CardContent>
      </Card>
    </FadeIn>
  );
}

function ApptRow({
  appt,
  onJoinCall,
  onCancel,
  cancellingId,
}: {
  appt: Appointment;
  onJoinCall?: (id: string) => void;
  onCancel?: (id: string) => void;
  cancellingId?: string | null;
}) {
  // Demo rows carry fictional ids (a1/a3/...) — actions that would PATCH
  // /api/appointments/{demo-id} or open a fake WebRTC room are simply not
  // rendered (handlers are passed as undefined for demo sessions).
  const sc: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    upcoming: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
        <CalendarDays className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium line-clamp-2 break-words">
          {appt.doctor}{' '}
          <span className="text-muted-foreground font-normal">· {appt.specialty}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {formatApptDay(appt.date)}
          {appt.time ? ` · ${appt.time}` : ''} · {appt.type === 'video' ? '📹 Video' : '📍 In-person'}
        </p>
      </div>
      <Badge variant="secondary" className={`text-[0.625rem] shrink-0 ${sc[appt.status] ?? sc.pending}`}>
        {appt.status}
      </Badge>
      {appt.type === 'video' && appt.status === 'confirmed' && onJoinCall && (
        <button
          onClick={() => onJoinCall(appt.id)}
          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          Join
        </button>
      )}
      {appt.status === 'confirmed' && onCancel && (
        <button
          onClick={() => onCancel(appt.id)}
          disabled={cancellingId === appt.id}
          className="shrink-0 rounded-lg border border-rose-300 px-4 py-1.5 text-xs font-medium min-h-11 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 disabled:opacity-50"
        >
          {cancellingId === appt.id ? '...' : 'Cancel'}
        </button>
      )}
    </div>
  );
}

function MoodEmoji({ mood }: { mood: JournalEntry['mood'] }) {
  if (mood === 'good') return <span className="text-lg leading-none">😊</span>;
  if (mood === 'okay') return <span className="text-lg leading-none">😐</span>;
  return <span className="text-lg leading-none">😔</span>;
}

// ── Home tab ────────────────────────────────────────────────────────────────
function HomeTab({
  user,
  isFree,
  isDemo,
  onNavigate,
  onJoinCall,
  onCancelAppointment,
  cancellingApptId,
  appointmentsVersion,
}: {
  user: AuthUser;
  isFree: boolean;
  isDemo: boolean;
  onNavigate: (t: Tab) => void;
  onJoinCall: (id: string) => void;
  onCancelAppointment?: (id: string) => void;
  cancellingApptId?: string | null;
  appointmentsVersion?: number;
}) {
  const greeting = useGreeting();
  const [journalOpen, setJournalOpen] = React.useState(false);
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const { toast } = useToast();
  // Wave-8 single source of truth: appointments / adherence / streak all come
  // from the real APIs. The hardcoded demo constants are only a fallback for
  // demo sessions when the API has nothing to show — and demo rows never get
  // action buttons (their ids are fictional).
  const [liveAppointments, setLiveAppointments] = React.useState<Appointment[]>([]);
  const [apptsLoaded, setApptsLoaded] = React.useState(false);
  const [adherence, setAdherence] = React.useState<number | null>(null);
  const [streakDays, setStreakDays] = React.useState(0);
  const avgMood: JournalEntry['mood'] = 'good';

  const loadHome = React.useCallback(async () => {
    try {
      const res = await fetch('/api/appointments', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const rows: unknown[] = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { data?: unknown[] })?.data)
            ? (payload as { data: unknown[] }).data
            : [];
        const now = Date.now();
        const mapped: Appointment[] = rows
          .map(r => r as Record<string, unknown>)
          .filter(r => r.status === 'pending' || r.status === 'confirmed')
          .filter(r => {
            const t = new Date(String(r.scheduledAt ?? '')).getTime();
            return !isNaN(t) && t > now - 60 * 60 * 1000; // keep appts that just started
          })
          .sort(
            (a, b) =>
              new Date(String(a.scheduledAt)).getTime() - new Date(String(b.scheduledAt)).getTime()
          )
          .slice(0, 5)
          .map(r => ({
            id: String(r.id),
            doctor: String(r.doctorName ?? 'Your doctor'),
            specialty: String(r.specialization ?? 'General Care'),
            date: String(r.scheduledAt ?? ''),
            time: formatAppointmentTime(r.scheduledAt),
            type: r.type === 'video' ? ('video' as const) : ('in-person' as const),
            status: r.status === 'pending' ? ('pending' as const) : ('confirmed' as const),
          }));
        setLiveAppointments(mapped);
      }
    } catch {
      /* keep whatever we have */
    } finally {
      setApptsLoaded(true);
    }
    // Real weekly adherence from the reminder log (no more hardcoded 92).
    try {
      const res = await fetch(`/api/reminders/stats?userId=${encodeURIComponent(user.id)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const s = await res.json();
        if (typeof s?.weeklyAdherence === 'number') setAdherence(s.weeklyAdherence);
      }
    } catch {
      /* keep null — renders as an honest “not tracked yet” */
    }
    // Real daily-meds streak (demo accounts get the curated demo streak).
    try {
      const res = await fetch('/api/streaks', { credentials: 'include' });
      if (res.ok) {
        const s = await res.json();
        const list = Array.isArray(s?.streaks) ? s.streaks : [];
        const daily = list.find((x: { type?: string; count?: number }) => x?.type === 'daily_meds');
        if (daily && typeof daily.count === 'number') setStreakDays(daily.count);
      }
    } catch {
      /* keep 0 */
    }
  }, [user.id, isDemo]);

  React.useEffect(() => {
    loadHome();
  }, [loadHome, appointmentsVersion]);

  const demoAppointments = DEMO_APPOINTMENTS.filter(a => a.status !== 'completed');
  const appointments = isDemo ? demoAppointments : liveAppointments;

  // Achievement celebration state (defined before JSX for proper closure)
  const achievementState = React.useState({ show: false, type: 'adherence' as const, milestone: 0 });
  const [achievement, setAchievement] = achievementState;
  const showAchievement = achievement.show;
  const setShowAchievement = (v: boolean) => setAchievement(a => ({ ...a, show: v }));

  // Trigger celebration only ONCE PER DAY — not on every mount. adherence is
  // derived/demo data, so re-showing the same "achievement" every time the
  // user opens the app (or returns to Home) is noise, not a reward. Persist
  // the last celebration date so it can't nag day after day either.
  const [celebratedDate, setCelebratedDate] = React.useState<string | null>(null);
  const displayAdherence = adherence ?? 0;
  React.useEffect(() => {
    if (displayAdherence < 80) return;
    const today = new Date().toISOString().slice(0, 10);
    let last: string | null = null;
    try {
      last = window.localStorage.getItem('kynthai:lastAchievementShown');
    } catch { /* storage unavailable */ }
    if (last === today) return; // already celebrated today
    setAchievement({ show: true, type: 'adherence' as const, milestone: displayAdherence });
    setCelebratedDate(today);
  }, [displayAdherence]);

  // Persist the celebration date the moment it actually appears (so a
  // dismissed popup doesn't re-trigger on the next render in the same session).
  React.useEffect(() => {
    if (showAchievement && celebratedDate) {
      try { window.localStorage.setItem('kynthai:lastAchievementShown', celebratedDate); } catch { /* ignore */ }
    }
  }, [showAchievement, celebratedDate]);

  return (
    <div className="space-y-5">
      <AchievementCelebration
        show={showAchievement}
        type={achievement.type}
        milestone={achievement.milestone}
        onDismiss={() => setShowAchievement(false)}
      />

      {/* Greeting + streak */}
      <FadeIn>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              {greeting}{user.name ? `, ${user.name.split(' ')[0]}` : ''}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {appointments.length > 0
                ? `${appointments.length} upcoming appointment${appointments.length > 1 ? 's' : ''}`
                : apptsLoaded
                  ? 'All clear — no upcoming appointments'
                  : 'Loading appointments…'}
            </p>
            {appointments.length === 0 && (
              <button
                onClick={() => onNavigate('lab')}
                className="mt-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
              >
                Book a health check →
              </button>
            )}
          </div>
          <div className="flex flex-col items-center">
            <StreakRing days={streakDays} />
            <span className="text-[0.625rem] text-muted-foreground mt-0.5">day streak</span>
          </div>
        </div>
      </FadeIn>

      {/* Plus upsell */}
      {isFree && (
        <FadeIn delay={0.05}>
          <Card
            className="cursor-pointer border-amber-500/30 bg-gradient-to-r from-amber-50/80 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/10"
            onClick={() => onNavigate('market')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                  <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Upgrade to Plus — $9/mo</p>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Unlimited AI, lab booking & advanced analytics
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Vitals grid — demo tour content only. Real users never see
          fabricated blood-pressure/heart-rate numbers (wave-8). */}
      {isDemo && (
        <FadeIn delay={0.1}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
            Today&apos;s Vitals
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {METRICS.map((m, i) => (
              <MetricCard key={m.label} m={m} index={i} />
            ))}
          </div>
        </FadeIn>
      )}

      {/* Appointments */}
      <FadeIn delay={0.12}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Appointments
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBookingOpen(true)}
              className="inline-flex items-center min-h-[44px] px-2 -mx-2 text-xs text-emerald-600 font-medium hover:underline"
            >
              + Book
            </button>
            <button
              onClick={() => onNavigate('market')}
              className="inline-flex items-center min-h-[44px] px-2 -mx-2 text-xs text-emerald-600 hover:underline"
            >
              See all
            </button>
          </div>
        </div>
        <div className="space-y-2.5">
          {appointments.length > 0 ? (
            appointments.map(a => (
              <ApptRow
                key={a.id}
                appt={a}
                onJoinCall={isDemo ? undefined : onJoinCall}
                onCancel={isDemo ? undefined : onCancelAppointment}
                cancellingId={cancellingApptId}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {apptsLoaded ? 'No upcoming appointments' : 'Loading…'}
            </p>
          )}
        </div>
      </FadeIn>

      {/* Adherence */}
      <FadeIn delay={0.14}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Med Adherence</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {adherence === null
                    ? 'Log your doses to start tracking'
                    : displayAdherence >= 80
                      ? 'Great progress this week!'
                      : 'Every dose counts — keep going!'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {adherence === null ? '—' : `${displayAdherence}%`}
                </span>
                <p className="text-[0.625rem] text-muted-foreground">
                  {displayAdherence >= 80 && adherence !== null ? '🔥' : ''}
                  {adherence === null ? '' : `${displayAdherence}%`}
                </p>
              </div>
            </div>
            <Progress value={displayAdherence} className="mt-3 h-2" />
          </CardContent>
        </Card>
      </FadeIn>

      {/* Quick journal card */}
      <FadeIn delay={0.18}>
        <button
          onClick={() => setJournalOpen(true)}
          className="w-full rounded-xl border border-dashed border-border px-4 py-4 text-left transition-all hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
              <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {avgMood === 'good'
                  ? '😊 Feeling good — how about you?'
                  : 'How are you feeling today?'}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">Tap to add a journal entry</p>
            </div>
            <Plus className="ml-auto h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </FadeIn>

      {/* Journal sheet */}
      <Sheet open={journalOpen} onOpenChange={setJournalOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] flex flex-col">
          <SheetHeader>
            <SheetTitle>New Journal Entry</SheetTitle>
            <SheetDescription>Record how you&apos;re feeling today</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 flex-1 overflow-y-auto">
            <div>
              <Label>Title</Label>
              <input
                id="j-title"
                placeholder="e.g. Morning walk went well"
                className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div>
              <Label>Details</Label>
              <Textarea
                id="j-body"
                placeholder="Describe your symptoms, energy, mood..."
                rows={4}
                className="mt-1 resize-none"
              />
            </div>
            <div>
              <Label>Mood</Label>
              <div className="flex gap-2 mt-2">
                {(['good', 'okay', 'bad'] as const).map(m => (
                  <button
                    key={m}
                    className={cn(
                      'flex-1 rounded-lg border py-2.5 text-sm font-medium transition-all',
                      m === 'good'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                        : 'border-border hover:border-emerald-500/40'
                    )}
                  >
                    {m === 'good' ? '😊 Good' : m === 'okay' ? '😐 Okay' : '😔 Rough'}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={async () => {
                const t = (document.getElementById('j-title') as HTMLInputElement | null)?.value?.trim() || '';
                const b = (document.getElementById('j-body') as HTMLTextAreaElement | null)?.value?.trim() || '';
                if (!t && !b) {
                  toast({ title: 'Write something first', variant: 'destructive' });
                  return;
                }
                try {
                  const res = await fetch('/api/health-journal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      mood: 'okay',
                      notes: b ? `${t}\n\n${b}` : t,
                      symptoms: [],
                    }),
                  });
                  if (res.ok) {
                    setJournalOpen(false);
                    toast({ title: 'Journal entry saved' });
                  } else {
                    toast({ title: 'Failed to save entry', variant: 'destructive' });
                  }
                } catch {
                  toast({ title: 'Failed to save entry', variant: 'destructive' });
                }
              }}
            >
              Save Entry
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <BookAppointment open={bookingOpen} onOpenChange={setBookingOpen} />


    </div>
  );
}

// ── Meds tab ────────────────────────────────────────────────────────────────
function MedsTab({ userId, isDemo, showDebugAlarm }: { userId: string; isDemo: boolean; showDebugAlarm: boolean }) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">My Medications</h2>
      {/* Founder P0: QA debug tools must never render in production builds.
          isDemoEnabled() is build-time gated (false when NODE_ENV=production),
          so the demo alarm-test button only exists in local development. */}
      {showDebugAlarm && (
        <button
          type="button"
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md active:scale-[0.99]"
          onClick={() => {
            try {
              window.dispatchEvent(new Event('kynthai:test-alarm'))
            } catch { /* ignore */ }
          }}
        >
          Test full-screen dose alarm now
        </button>
      )}
      <TodayView userId={userId} isDemo={isDemo} externalAlarm />
      <MedicationsList userId={userId} isDemo={isDemo} />
      <PatientPrescriptions userId={userId} isDemo={isDemo} />
    </div>
  );
}

// ── Patient prescriptions ───────────────────────────────────────────────────
type PatientPrescription = {
  id: string;
  doctorName?: string | null;
  specialization?: string | null;
  medications?: Array<{ name?: string | null }> | null;
  createdAt: string;
};

function PatientPrescriptions({ userId, isDemo }: { userId: string; isDemo: boolean }) {
  const { toast } = useToast();
  const [prescriptions, setPrescriptions] = React.useState<PatientPrescription[]>([]);
  const [loading, setLoading] = React.useState(!isDemo);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isDemo) {
      setPrescriptions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/prescriptions?patientId=${encodeURIComponent(userId)}`,
          { credentials: 'include', cache: 'no-store' },
        );
        if (!res.ok) throw new Error('Unable to load prescriptions');
        const data = await res.json();
        if (!cancelled) setPrescriptions(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!cancelled) {
          setPrescriptions([]);
          toast({
            title: 'Could not load prescriptions',
            description: error instanceof Error ? error.message : 'Please try again later.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDemo, toast, userId]);

  const downloadPrescription = React.useCallback(
    async (prescriptionId: string) => {
      setDownloadingId(prescriptionId);
      try {
        const csrfRes = await fetch('/api/auth/csrf', {
          credentials: 'include',
          cache: 'no-store',
        });
        const csrf = (await csrfRes.json().catch(() => ({})))?.token;
        if (!csrf) throw new Error('Could not start a secure download');

        const res = await fetch('/api/doctors/prescription-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
          },
          credentials: 'include',
          body: JSON.stringify({ prescriptionId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to generate prescription');
        }

        const html = await res.text();
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html; charset=utf-8' }));
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
          window.open(url, '_blank', 'noopener,noreferrer');
        } else {
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `prescription-${prescriptionId.slice(0, 8)}.html`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast({
          title: 'Prescription downloaded',
          description: isIOS
            ? 'Opened in a new tab. Use Share or Print to save it.'
            : 'Open the downloaded file and choose Print → Save as PDF.',
        });
      } catch (error) {
        toast({
          title: 'Download failed',
          description: error instanceof Error ? error.message : 'Please try again later.',
          variant: 'destructive',
        });
      } finally {
        setDownloadingId(null);
      }
    },
    [toast],
  );

  return (
    <Card className="border-emerald-100 dark:border-emerald-900/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Prescriptions</h3>
            <p className="text-xs text-muted-foreground">
              Download a printable copy of prescriptions issued to you.
            </p>
          </div>
          <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading prescriptions
          </div>
        ) : prescriptions.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            Prescriptions issued by your doctors will appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {prescriptions.map((prescription) => {
              const medicationNames = Array.isArray(prescription.medications)
                ? prescription.medications
                    .map((medication) => medication?.name)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(', ')
                : '';

              return (
                <div
                  key={prescription.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      Dr. {prescription.doctorName || 'Your doctor'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {prescription.specialization || 'Prescription'} ·{' '}
                      {new Date(prescription.createdAt).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    {medicationNames && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {medicationNames}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={downloadingId === prescription.id}
                    onClick={() => downloadPrescription(prescription.id)}
                  >
                    {downloadingId === prescription.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {downloadingId === prescription.id ? 'Preparing…' : 'Download'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Market tab ──────────────────────────────────────────────────────────────
function MarketTab() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Find Care</h2>
      <p className="text-sm text-muted-foreground">Browse verified doctors and book appointments</p>
      <MarketView />

    </div>
  );
}

// ── Lab tab ────────────────────────────────────────────────────────────────
function LabTab({ isDemo }: { isDemo: boolean }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Lab Results</h2>
      <p className="text-sm text-muted-foreground">View and download your lab test results</p>
      <LabResultsViewer isDemo={isDemo} />

    </div>
  );
}

// ── AI tab ──────────────────────────────────────────────────────────────────
function AiTab({ onNavigate, aiAvailable }: { onNavigate: (t: Tab) => void; aiAvailable: boolean | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">AI Assistant</h2>
        {aiAvailable === false ? (
          <Badge
            variant="secondary"
            className="text-[0.625rem] bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          >
            Being set up
          </Badge>
        ) : (
          /* ponytail: backend is NVIDIA NIM (see src/app/api/chat/route.ts —
              getNvidia / NVIDIA_MODEL). Don't claim a specific vendor in the UI
              because the provider may change; show the assistant's own name. */
          <Badge
            variant="secondary"
            className="text-[0.625rem] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
          >
            Kynthai AI
          </Badge>
        )}
      </div>
      {aiAvailable === false ? (
        /* Founder P0: never show a composer that 402s. When the server has no
           funded AI key, be honest — no marketing badge, no dead composer. */
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden />
          <h3 className="mt-2 text-sm font-semibold">Kynthai AI is being set up</h3>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            Our health assistant is finishing configuration and will be back shortly. Meanwhile you can
            review your medications or note how you feel in your Health Journal.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant="outline" className="min-h-11" onClick={() => onNavigate('meds')}>
              <Pill className="h-4 w-4" /> My Meds
            </Button>
            <Button size="sm" variant="outline" className="min-h-11" onClick={() => onNavigate('journal')}>
              <BookOpen className="h-4 w-4" /> Journal
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Ask about symptoms, meds, or general health. Triage only — not a diagnosis.
          </p>
          <AiChat onNavigate={(t) => onNavigate(t as Tab)} />
        </>
      )}

    </div>
  );
}

// ── More hub ────────────────────────────────────────────────────────────────
// Founder UX: AI / Journal / Tools / SOS live here so the bottom bar stays at
// the native 5-tab convention. SOS is ALSO a floating red action on every tab.
function MoreTab({ onNavigate, aiAvailable }: { onNavigate: (t: Tab) => void; aiAvailable: boolean | null }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">More</h2>
      <div className="grid gap-2">
        {MORE_ITEMS.map(item => {
          const Icon = item.icon;
          const settingUp = item.id === 'ai' && aiAvailable === false;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:bg-accent/50',
                item.id === 'sos' && 'border-rose-500/25 bg-rose-500/[0.03] hover:bg-rose-500/10'
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  item.id === 'sos'
                    ? 'bg-rose-500/10 text-rose-600'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{item.label}</span>
                  {settingUp && (
                    <Badge variant="secondary" className="text-[0.625rem] text-amber-700 dark:text-amber-400">
                      Setting up
                    </Badge>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {settingUp ? 'AI is being configured — check back soon' : item.desc}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Journal tab ─────────────────────────────────────────────────────────────
function JournalTab() {
  const { toast } = useToast();
  const { user } = useAppStore();
  const isDemo = isDemoUser(user);
  const [entries, setEntries] = React.useState<JournalEntry[]>(isDemo ? DEMO_JOURNAL : []);
  const [open, setOpen] = React.useState(false);

  // Real users: load persisted entries. Demo users keep the hardcoded samples.
  const load = React.useCallback(async () => {
    if (isDemo) return;
    try {
      const res = await fetch('/api/health-journal');
      if (res.ok) {
        const data = await res.json();
        const list: JournalEntry[] = (data.entries || []).map((e: any) => ({
          id: e.id,
          date: String(e.date).slice(0, 10),
          title: e.notes ? e.notes.split('\n')[0].slice(0, 80) : 'Journal entry',
          body: e.notes || '',
          mood: e.mood === 'bad' || e.mood === 'okay' || e.mood === 'good' ? e.mood : 'okay',
        }));
        setEntries(list);
      }
    } catch {
      // Keep whatever is shown; a failed load should not crash the tab.
    }
  }, [isDemo]);

  React.useEffect(() => {
    load();
  }, [load]);

  const saveEntry = async (title: string, body: string) => {
    try {
      const res = await fetch('/api/health-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood: 'okay',
          notes: body ? `${title}\n\n${body}` : title,
          symptoms: [],
        }),
      });
      if (res.ok) {
        await load();
        return true;
      }
    } catch {
      // fall through to failure toast
    }
    return false;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Health Journal</h2>
        <Button size="sm" onClick={() => setOpen(true)} className="min-h-11 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New
        </Button>
      </div>

      {/* mood summary */}
      <FadeIn>
        <Card className="bg-gradient-to-br from-emerald-50/50 to-background dark:from-emerald-950/20">
          <CardContent className="flex items-center gap-4 p-4">
            <span className="text-3xl">😊</span>
            <div>
              <p className="text-sm font-semibold">
                {entries.length > 0 ? 'Your recent entries' : 'Start tracking today'}
              </p>
              <p className="text-xs text-muted-foreground">
                {entries.length} entries · {entries.filter(e => e.mood === 'good').length} good days
              </p>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* entries */}
      <div className="space-y-2.5">
        {entries.map((e, i) => (
          <FadeIn key={e.id} delay={i * 0.06}>
            <Card className="hover:shadow-sm transition-all">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <MoodEmoji mood={e.mood} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold">{e.title}</p>
                      <span className="text-[0.625rem] text-muted-foreground shrink-0">
                        {formatApptDay(e.date)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{e.body}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        ))}
        {entries.length === 0 && !isDemo && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No journal entries yet. Tap &ldquo;New&rdquo; to record how you&apos;re feeling today.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add entry dialog */}
      <JournalDialog
        open={open}
        onOpenChange={setOpen}
        onSave={async (title, body) => {
          const ok = await saveEntry(title, body);
          toast(
            ok
              ? { title: 'Journal entry saved' }
              : { title: 'Failed to save entry', variant: 'destructive' }
          );
        }}
      />

    </div>
  );
}

function JournalDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (title: string, body: string) => void | Promise<void>;
}) {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  React.useEffect(() => {
    if (!open) {
      setTitle('');
      setBody('');
    }
  }, [open]);
  async function handleSave() {
    if (!title.trim()) return;
    await onSave(title, body);
    onOpenChange(false);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>New Journal Entry</SheetTitle>
          <SheetDescription>How are you feeling today?</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 flex-1 overflow-y-auto">
          <div>
            <Label htmlFor="j-title">Title</Label>
            <input
              id="j-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Morning meds taken"
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="j-body">Details</Label>
            <Textarea
              id="j-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Describe symptoms, energy, sleep..."
              rows={4}
              className="mt-1 resize-none"
            />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={!title.trim()}>
            Save Entry
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── SOS tab ─────────────────────────────────────────────────────────────────
function SosTab({ phone }: { phone?: string | null }) {
  const [stage, setStage] = React.useState<'idle' | 'triggering' | 'triggered'>('idle');
  const [response, setResponse] = React.useState<{
    notifiedContacts: { name: string }[];
    summary: string;
  } | null>(null);
  // First family member with a phone number on file = the patient's entered contact.
  const [callContact, setCallContact] = React.useState<{ name: string; phone: string } | null>(null);
  const { country } = useEmergencyCountry(phone);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/emergency-sos/contacts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        const contact = (d.contacts ?? [])[0];
        if (contact) setCallContact({ name: contact.name, phone: contact.phone });
      })
      .catch(() => {
        /* best-effort — SOS never depends on the contact lookup */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trigger = async () => {
    setStage('triggering');
    try {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => d.token as string)
        .catch(() => null);
      const res = await fetch('/api/emergency-sos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({ location: 'Patient app', notes: 'Emergency SOS', medicalInfo: '' }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        // Surface the real failure — never fake a success in an emergency UI.
        setResponse({
          notifiedContacts: [],
          summary:
            (data.error as string) ||
            'SOS alert could not be sent. Contact local emergency services immediately.',
        });
        setStage('triggered');
        return;
      }
      setResponse({
        notifiedContacts: (data.notifiedContacts as { name: string }[]) ?? [],
        summary: (data.summary as string) ?? 'SOS alert sent to your family and listed contacts.',
      });
    } catch {
      setResponse({
        notifiedContacts: [],
        summary: 'SOS alert could not be sent. Contact local emergency services immediately.',
      });
    }
    setStage('triggered');
  };
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-rose-600 dark:text-rose-400">Emergency SOS</h2>
      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardContent className="p-5 space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10">
            <Siren className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Alerts your family and listed contacts, and sends them a reminder text with your
            location. It does not replace contacting local emergency services.
          </p>
          {/* Always-available call actions — never hidden behind the trigger state */}
          <div className="space-y-3">
            <EmergencyNumberCard phone={phone} />
            {country.dialNumber ? (
              <a href={`tel:${country.dialNumber}`} aria-label={`Call emergency services at ${country.number}`} className="block">
                <Button
                  size="lg"
                  className="w-full h-14 text-base bg-gradient-to-r from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-600/30 hover:from-rose-600 hover:to-rose-800"
                >
                  <Phone className="h-5 w-5" /> Call {country.number}
                </Button>
              </a>
            ) : (
              <p className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-muted-foreground">
                Country-specific emergency number unavailable — check local guidance before calling.
              </p>
            )}
            {country.dialNumber && (
              <p className="text-[0.6875rem] text-muted-foreground mt-1">Use your local emergency number</p>
            )}
            {callContact ? (
              <a href={`tel:${callContact.phone}`} aria-label={`Call ${callContact.name}`} className="block">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12 text-sm border-rose-500/40 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10"
                >
                  <PhoneCall className="h-4 w-4" /> Call {callContact.name}
                </Button>
              </a>
            ) : (
              <p className="text-[0.6875rem] text-muted-foreground text-center">
                No contact number on file — add one in your family profile to enable one-tap
                calling.
              </p>
            )}
          </div>
          {stage === 'idle' && (
            <Button
              size="lg"
              variant="outline"
              onClick={trigger}
              className="w-full h-12 text-sm border-rose-500/40 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10"
            >
              <Siren className="h-4 w-4" /> Trigger SOS alert to family
            </Button>
          )}
          {stage === 'triggering' && (
            <Button size="lg" disabled className="w-full h-14 text-base bg-rose-600 text-white">
              <Activity className="h-5 w-5 animate-pulse" /> Notifying contacts…
            </Button>
          )}
          {stage === 'triggered' && response && (
            <div className="space-y-2">
              <p
                className={cn(
                  'text-xs font-semibold',
                  response.notifiedContacts.length > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-amber-600 dark:text-amber-400'
                )}
              >
                {response.summary}
              </p>
              {response.notifiedContacts.length > 0 ? (
                response.notifiedContacts.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-rose-600" />
                    <span className="text-sm font-medium">{c.name} notified</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No family members with accounts were notified. If this is an emergency, contact local
                  emergency services yourself.
                </p>
              )}
            </div>
          )}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-relaxed text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 inline-block -mt-0.5 mr-1 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold text-amber-700 dark:text-amber-400">Important:</span>{' '}
            Kynthai cannot place calls or dispatch responders. In a life-threatening emergency,
            always <span className="font-semibold text-foreground">contact your local emergency services yourself</span> and
            call your hospital directly. Kynthai sends alerts and reminder texts to your listed
            contacts, but it is not a replacement for emergency services.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export function PatientApp({ user }: { user: AuthUser }) {
  const { logout, user: _ } = useAppStore();
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<Tab>('home');
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [joiningCallApptId, setJoiningCallApptId] = React.useState<string | null>(null);
  const [cancellingApptId, setCancellingApptId] = React.useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = React.useState<string | null>(null);
  // Bumped after a successful cancel so HomeTab refetches live appointments.
  const [apptsVersion, setApptsVersion] = React.useState(0);
  // null = unknown (assume working); false = server has no funded AI key.
  const [aiAvailable, setAiAvailable] = React.useState<boolean | null>(null);

  // Founder P0: AI tab must never be a silent 402. One cheap status probe per
  // session tells the UI to show the honest "being set up" panel instead.
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/status', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { available: true }))
      .then(d => {
        if (!cancelled) setAiAvailable(!!d?.available);
      })
      .catch(() => {
        // Status probe failing should never break the AI tab itself.
        if (!cancelled) setAiAvailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Founder P1: kill the tab-switch "white pop" — preload the heaviest
  // dynamic tab chunk (Care/Market) once the dashboard is idle. The dynamic()
  // import above dedupes, so this warms the cache before first navigation.
  React.useEffect(() => {
    const t = setTimeout(() => {
      import('@/components/kynthai/market/market-view').catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  // Missed-dose escalation: when a real patient opens their dashboard,
  // surface overdue reminders (self-nudge) and alert linked caretakers.
  // Fire-and-forget — the API marks reminders escalated so this runs once
  // per overdue dose, never repeatedly for the same reminder.
  React.useEffect(() => {
    if (isDemoUser(user)) return;
    let cancelled = false;
    fetch('/api/auth/csrf', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) =>
        fetch('/api/reminders/escalate', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': d.token },
          body: JSON.stringify({}),
        }),
      )
      .then((r) => {
        if (!cancelled && r.ok) {
          // no-op: results are logged server-side
        }
      })
      .catch(() => {
        /* best-effort — escalation is never critical-path */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleCancelAppointment = React.useCallback(
    async (appointmentId: string) => {
      setCancelConfirmId(null);
      setCancellingApptId(appointmentId);
      try {
        const res = await fetch(`/api/appointments/${appointmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to cancel appointment');
        }
        setApptsVersion(v => v + 1);
        toast({ title: 'Appointment cancelled' });
      } catch (error) {
        toast({
          title: 'Cancel failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setCancellingApptId(null);
      }
    },
    [toast]
  );

  const isFree = (user?.subscriptionTier ?? 'free') === 'free';
  const isDemo = isDemoUser(user);
  // QA debug tools exist only for demo accounts in non-production builds.
  const showDebugAlarm = isDemo && isDemoEnabled();
  const initial = isDemo ? 'K' : (user?.name?.[0] ?? 'U').toUpperCase();

  const handleLogout = React.useCallback(async () => {
    router.replace('/login');
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    logout();
  }, [logout, router]);

  return (
    <div className="relative min-h-dvh flex flex-col bg-gradient-to-b from-emerald-50/40 via-background to-background dark:from-emerald-950/20">
      <>
      {/* FIX #20: Consolidated into single NotificationBanner */}
      <NotificationPermissionBanner />
      <MedicationAlarmHost userId={user.id} isDemo={isDemo} />
      </>
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background pt-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <KynthaiBrand iconSize={30} />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShareOpen(true)}
              className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Share"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <OfflineIndicator />
            <NotificationCenter
              role="patient"
              userId={user.id}
              isDemo={isDemo}
              onNavigate={(t: string) => setTab(t as Tab)}
            />
            <button
              onClick={() => setProfileOpen(true)}
              aria-label="Profile"
              className="relative flex items-center gap-1.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-accent"
            >
              <Avatar className="h-10 w-10 ring-2 ring-emerald-500/25">
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-xs font-medium text-muted-foreground">Profile</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-3xl w-full flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
        <AnimatePresence initial={false}>
          {tab === 'home' && (
            <FadeIn key="home">
              <HomeTab
                user={user}
                isFree={isFree}
                isDemo={isDemo}
                onNavigate={setTab}
                onJoinCall={setJoiningCallApptId}
                onCancelAppointment={(id) => setCancelConfirmId(id)}
                cancellingApptId={cancellingApptId}
                appointmentsVersion={apptsVersion}
              />
            </FadeIn>
          )}
          {tab === 'meds' && (
            <FadeIn key="meds">
              <MedsTab userId={user.id} isDemo={isDemo} showDebugAlarm={showDebugAlarm} />
            </FadeIn>
          )}
          {tab === 'market' && (
            <FadeIn key="market">
              <MarketTab />
            </FadeIn>
          )}
          {tab === 'lab' && (
            <FadeIn key="lab">
              <LabTab isDemo={isDemo} />
            </FadeIn>
          )}
          {tab === 'ai' && (
            <FadeIn key="ai">
              <AiTab onNavigate={setTab} aiAvailable={aiAvailable} />
            </FadeIn>
          )}
          {tab === 'more' && (
            <FadeIn key="more">
              <MoreTab onNavigate={setTab} aiAvailable={aiAvailable} />
            </FadeIn>
          )}
          {tab === 'journal' && (
            <FadeIn key="journal">
              <JournalTab />
            </FadeIn>
          )}
          {tab === 'tools' && (
            <FadeIn key="tools">
              <CareHub memberName={user.name} />
            </FadeIn>
          )}
          {tab === 'sos' && (
            <FadeIn key="sos">
              <SosTab phone={user.phone} />
            </FadeIn>
          )}
        </AnimatePresence>
      </main>

      {/* Spacer pushes gradient to fill viewport behind fixed bottom nav */}
      <div className="h-20 shrink-0" aria-hidden />

      {/* Floating SOS — emergency actions stay in thumb reach on every tab
          (founder P1). Hidden while the SOS view itself is open. */}
      {tab !== 'sos' && (
        <button
          type="button"
          onClick={() => setTab('sos')}
          aria-label="Emergency SOS"
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/40 transition-transform active:scale-95"
        >
          <Siren className="h-6 w-6" aria-hidden />
        </button>
      )}

      {/* Minimal legal footer */}

      {/* Active video call overlay */}
      {joiningCallApptId && (
        <FadeIn>
          <VideoCall
            roomName={joiningCallApptId}
            displayName={user.name}
            identity={user.id}
            role="patient"
            onEndCall={() => setJoiningCallApptId(null)}
          />
        </FadeIn>
      )}

      {/* Share sheet — wave-8: no fabricated streak/adherence numbers in
          shared content; the share text is honest app promotion. */}
      {shareOpen && (
        <ShareSheet
          open={shareOpen}
          onOpenChange={setShareOpen}
          title="Share Kynthai"
          shareText={`${user.name ?? 'I'} use${user.name ? 's' : ''} Kynthai—your family's health, connected—with dose reminders, family updates and doctor consultations in one app.`}
        />
      )}

      {/* Profile sheet */}
      <ProfileHub
        open={profileOpen}
        onOpenChange={setProfileOpen}
        user={user}
        onLogout={handleLogout}
        onShowPricing={() => router.push('/pricing')}
        onShowPrivacy={() => router.push('/privacy')}
        onOpenSettings={() => router.push('/settings')}
      />

      {/* Cancel appointment confirmation dialog */}
      <Dialog open={!!cancelConfirmId} onOpenChange={(open) => { if (!open) setCancelConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Appointment?</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this appointment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelConfirmId(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              disabled={cancellingApptId === cancelConfirmId}
              onClick={() => cancelConfirmId && handleCancelAppointment(cancelConfirmId)}
            >
              {cancellingApptId === cancelConfirmId ? 'Cancelling...' : 'Cancel Appointment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bottom nav — 5 tabs (Home · Meds · Care · Lab · More), labels always
          visible (native convention), icon+text thumb targets ≥44px */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background pb-safe">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around gap-1 overflow-x-auto px-2 py-1 scrollbar-none">
          {TABS.map(t => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-label={t.label}
                aria-current={active ? 'page' : undefined}
                title={active ? undefined : t.label}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 min-h-11 min-w-[44px] text-[0.625rem] font-medium transition-all',
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-xl transition-all',
                    active
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
    </div>
  );
}
