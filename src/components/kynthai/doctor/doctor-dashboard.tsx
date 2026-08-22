'use client';

import * as React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Users,
  Wallet,
  Video,
  Trophy,
  Pill,
  Clock,
  Sun,
  Moon,
  Crown,
  Check,
  LayoutDashboard,
  RefreshCw,
  Mail,
  Phone,
  ExternalLink,
  Edit3,
  Save,
  X,
  AlertTriangle,
  Loader2,
  FileText,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useTheme } from 'next-themes';
import { KynthaiBrand } from '@/components/kynthai/logo';
import { useAppStore, type AuthUser } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { t, getLanguage, setLanguage, initLanguage } from '@/lib/i18n';
import { useGreeting } from '@/lib/greeting';
import { ProfileHub } from '@/components/kynthai/patient/profile-hub';
import { PatientCare } from './patient-care';
import { OfflineIndicator } from '@/components/kynthai/offline-indicator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { FadeIn } from '@/components/kynthai/animations';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VideoCall } from '@/components/kynthai/video-call';
import {
  DOCTOR_BASE_FEE_PCT,
  LOYALTY_TIERS,
  type LoyaltyTier,
  resolveTier,
  effectiveFeePct,
  platformFee,
  partnerKeeps,
  PAYOUT_POLICY,
} from '@/lib/commission';
import { isDemoEnabled } from '@/lib/demo-mode'
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
}

interface Appointment {
  id: string;
  patientName: string;
  time: string;
  date: string;
  type: 'video' | 'in-person';
  status: 'pending' | 'confirmed' | 'rescheduled' | 'completed' | 'cancelled' | 'no_show';
  fee: number;
}

// ponytail: dashboard API returns raw scheduledAt ISO strings; format once here instead of per-render.
const formatApptTime = (v: unknown): string => {
  const s = v ? String(v) : '';
  if (!s || !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s; // already a display string
  return new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const formatApptDate = (v: unknown): string => {
  const s = v ? String(v) : '';
  if (!s || !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s || 'Today';
  const d = new Date(s);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(new Date())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

interface Prescription {
  id: string;
  patientName: string;
  patientId?: string;
  medication: string;
  medications?: Array<{ name: string; dosage: string; frequency: string }>;
  date: string;
  followUpDate?: string | null;
  status?: string;
}

const APPOINTMENTS: Appointment[] = [
  {
    id: 'a1',
    patientName: 'Alex Johnson',
    time: '10:30 AM',
    date: 'Today',
    type: 'video',
    status: 'confirmed',
    fee: 75,
  },
  {
    id: 'a2',
    patientName: 'Jordan Smith',
    time: '12:00 PM',
    date: 'Today',
    type: 'video',
    status: 'confirmed',
    fee: 75,
  },
  {
    id: 'a3',
    patientName: 'Casey Lee',
    time: '09:00 AM',
    date: 'Yesterday',
    type: 'video',
    status: 'completed',
    fee: 75,
  },
  {
    id: 'a4',
    patientName: 'Taylor Reed',
    time: '02:00 PM',
    date: 'Yesterday',
    type: 'in-person',
    status: 'completed',
    fee: 55,
  },
  {
    id: 'a5',
    patientName: 'Morgan Patel',
    time: '03:30 PM',
    date: 'Today',
    type: 'video',
    status: 'pending',
    fee: 75,
  },
];

const PRESCRIPTIONS: Prescription[] = [
  {
    id: 'rx1',
    patientId: 'p1',
    patientName: 'Alex Johnson',
    medication: 'Lisinopril 10mg',
    date: 'Today',
    status: 'active',
    followUpDate: null,
    medications: [{ name: 'Lisinopril', dosage: '10mg', frequency: 'Once daily' }],
  },
  {
    id: 'rx2',
    patientId: 'p2',
    patientName: 'Jordan Smith',
    medication: 'Atorvastatin 20mg',
    date: 'Today',
    status: 'active',
    followUpDate: null,
    medications: [{ name: 'Atorvastatin', dosage: '20mg', frequency: 'Once daily' }],
  },
  {
    id: 'rx3',
    patientId: 'p3',
    patientName: 'Casey Lee',
    medication: 'Amoxicillin 500mg',
    date: 'Yesterday',
    status: 'active',
    followUpDate: null,
    medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'Three times daily' }],
  },
];

// Free-tier patient slot cap mirrors the 5-patient limit enforced server-side
// in POST /api/doctors/patients (returns 402 when exceeded).
const FREE_PATIENT_CAP = 5;

const PRO_FEATURES = [
  'unlimited_patients',
  'priority_placement',
  'advanced_analytics',
  'lower_commission',
] as const;

export function DoctorDashboard({ user, profile, isDemo = false }: { user: AuthUser; profile: DoctorProfile; isDemo?: boolean }) {
  const { logout, setScreen, doctorOnline, setDoctorOnline } = useAppStore();
  const router = useRouter();
  const [lang, setLangState] = React.useState('en');
  const [profileOpen, setProfileOpen] = React.useState(false);
  const greeting = useGreeting();
  const { toast } = useToast();

  // ── Consultation fee edit ──────────────────────────────────────────────────
  const [editingFee, setEditingFee] = React.useState(false);
  const [newFee, setNewFee] = React.useState(String(profile.consultationFee));
  const [savingFee, setSavingFee] = React.useState(false);
  const displayFee = editingFee ? Number(newFee) || 0 : profile.consultationFee;

  const handleSaveFee = React.useCallback(async () => {
    const fee = Number(newFee) || 0;
    if (fee < 0) {
      toast({ title: 'Invalid fee', description: 'Fee must be a positive number.', variant: 'destructive' });
      return;
    }
    setSavingFee(true);
    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      const csrf = (await csrfRes.json())?.token;
      const res = await fetch(`/api/doctors/${profile.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
        body: JSON.stringify({ consultationFee: fee }),
      });
      if (!res.ok) throw new Error('Failed to update fee');
      setEditingFee(false);
      toast({ title: 'Fee updated', description: `Consultation fee set to $${fee}` });
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' });
    } finally {
      setSavingFee(false);
    }
  }, [newFee, profile.id, toast]);

  const handleLogout = React.useCallback(async () => {
    // Navigate first to avoid landing page flash
    router.replace('/login');
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    logout();
  }, [logout, router]);

  React.useEffect(() => {
    initLanguage();
    setLangState(getLanguage());
  }, []);

  const toggleLang = () => {
    const next = lang === 'en' ? 'hi' : 'en';
    setLanguage(next);
    setLangState(next);
  };
  const [videoOn, setVideoOn] = React.useState(profile.videoCallEnabled);
  const [downloadingPdfId, setDownloadingPdfId] = React.useState<string | null>(null);

  const downloadPdf = React.useCallback(
    async (prescriptionId: string) => {
      setDownloadingPdfId(prescriptionId);
      try {
        // Fetch CSRF token first
        const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
        const csrf = (await csrfRes.json())?.token;
        
        const res = await fetch('/api/doctors/prescription-pdf', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf || '',
          },
          credentials: 'include',
          body: JSON.stringify({ prescriptionId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to generate prescription');
        }
        const html = await res.text();
        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const url = URL.createObjectURL(blob);

        // iOS Safari blocks document.createElement('a').click() for downloads.
        // Use window.open() as a fallback — opens the prescription in a new tab
        // where the user can use Share → Save to Files or Print → Save as PDF.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
          window.open(url, '_blank');
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = `prescription-${prescriptionId.slice(0, 8)}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        // Revoke after a delay to allow the new tab to load the blob
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast({
          title: 'Prescription downloaded',
          description: isIOS
            ? 'Opened in new tab — use Share → Save to Files or Print → Save as PDF.'
            : 'Open in browser and use Print → Save as PDF.',
        });
      } catch (error) {
        toast({
          title: 'Download failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setDownloadingPdfId(null);
      }
    },
    [toast]
  );
  const [view, setView] = React.useState<
    'overview' | 'appointments' | 'patients' | 'prescriptions'
  >('overview');
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [notesPatientId, setNotesPatientId] = React.useState('');
  const [notesContent, setNotesContent] = React.useState('');
  const [notesType, setNotesType] = React.useState<'observation' | 'diagnosis' | 'follow-up'>(
    'observation'
  );
  const [notesList, setNotesList] = React.useState<
    Array<{ id: string; content: string; type: string; createdAt: string }>
  >([]);
  const [aiNotesOpen, setAiNotesOpen] = React.useState(false);
  const [aiTranscript, setAiTranscript] = React.useState('');
  const [aiGenerating, setAiGenerating] = React.useState(false);
  const [patientCount, setPatientCount] = React.useState(0);
  const [appointmentSearch, setAppointmentSearch] = React.useState('');
  const [lowAdherenceCount, setLowAdherenceCount] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedPatient, setSelectedPatient] = React.useState<{
    id: string;
    name: string;
    email: string;
    medications: number;
    adherence: number;
    todayReminders: number;
    takenToday: number;
    weekReminders: number;
    takenWeek: number;
    inviteLink?: string | null;
  } | null>(null);
  const [joiningCallApptId, setJoiningCallApptId] = React.useState<string | null>(null);
  const [updatingApptId, setUpdatingApptId] = React.useState<string | null>(null);
  const [rescheduleApptId, setRescheduleApptId] = React.useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = React.useState('');
  const [rescheduleTime, setRescheduleTime] = React.useState('');

  // Auto-fetch notes whenever the selected patient changes (even while dialog is open)
  React.useEffect(() => {
    if (!notesPatientId || !notesOpen) {
      if (!notesOpen) setNotesList([]);
      return;
    }
    let cancelled = false;
    async function fetchNotes() {
      try {
        const res = await fetch(`/api/doctors/notes?patientId=${notesPatientId}`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setNotesList(data.notes ?? []);
        } else {
          setNotesList([]);
        }
      } catch {
        if (!cancelled) setNotesList([]);
      }
    }
    void fetchNotes();
    return () => {
      cancelled = true;
    };
  }, [notesPatientId, notesOpen]);

  // Availability
  type TimeSlot = { start: string; end: string };
  type WeeklySchedule = Record<string, TimeSlot[]>;
  const defaultSchedule: WeeklySchedule = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
  const [schedule, setSchedule] = React.useState<WeeklySchedule>(defaultSchedule);
  const [availOpen, setAvailOpen] = React.useState(false);
  const [editSchedule, setEditSchedule] = React.useState<WeeklySchedule>(defaultSchedule);

  // Doctor-side Pro flag. The DEMO_PROFILE in doctor-app.tsx doesn't carry a
  // subscriptionTier for the doctor (the user.subscriptionTier field is the
  // patient-side tier), so we keep a local flag and let the doctor flip it
  // from the paywall for demo purposes.
  const [isPro, setIsPro] = React.useState(false);
  const [renewsAt] = React.useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  });

  // Live data from the dashboard API with sample data as fallback
  const [dashboardData, setDashboardData] = React.useState<{
    appointments: typeof APPOINTMENTS;
    patients: { id: string; name: string }[];
    prescriptions: typeof PRESCRIPTIONS;
    stats: { completed: number; upcoming: number; grossEarnings: number };
    revenue?: { thisMonth: number; lastMonth: number; total: number; changePercent: number };
    alerts?: Array<{ type: string; severity: string; message: string; count: number }>;
    priorityList?: Array<{ type: string; priority: string; patientName: string; message: string; scheduledAt: string }>;
    subscription?: { tier: string; config: { patientSlotCap: number; priorityPlacement: boolean; advancedAnalytics: boolean } };
  } | null>(null);
  // Track whether API returned (even if empty) vs. still loading
  const [apiLoaded, setApiLoaded] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);

  const fetchDashboardData = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [dashRes, adherenceRes] = await Promise.all([
        fetch('/api/doctors/dashboard', { cache: 'no-store' }),
        fetch('/api/doctors/patients/adherence', { cache: 'no-store' }).catch(() => null),
      ]);
      const dashData = dashRes.ok ? await dashRes.json() : {};
      const adherenceData = adherenceRes?.ok ? await adherenceRes.json() : null;

      const apiAppointments = ((dashData as Record<string, unknown[]>).appointments ?? []).map(
        (a: unknown) => {
          const rec = a as Record<string, unknown>;
          return {
            id: String(rec.id ?? ''),
            patientName: String(
              (rec.patient as Record<string, string>)?.name ?? rec.patientName ?? 'Patient'
            ),
            time: formatApptTime(rec.time ?? rec.scheduledAt),
            date: formatApptDate(rec.date ?? rec.scheduledAt),
            type: (rec.type ?? 'video') as 'video' | 'in-person',
            status: (rec.status ?? 'confirmed') as Appointment['status'],
            fee: Number(rec.fee ?? rec.price ?? 0),
          };
        }
      );
      const apiPatients = ((dashData as Record<string, unknown[]>).patients ?? []).map(
        (p: unknown) => {
          const rec = p as Record<string, unknown>;
          return {
            id: String(rec.id ?? ''),
            name: String(rec.name ?? (rec.patient as Record<string, string>)?.name ?? 'Patient'),
          };
        }
      );
      const apiPrescriptions = ((dashData as Record<string, unknown[]>).prescriptions ?? []).map(
        (p: unknown) => {
          const rec = p as Record<string, unknown>;
          const meds = Array.isArray(rec.medications)
            ? rec.medications
            : typeof rec.medications === 'string'
              ? (() => {
                  try {
                    return JSON.parse(rec.medications);
                  } catch {
                    return [];
                  }
                })()
              : [];
          return {
            id: String(rec.id ?? ''),
            patientName: String(
              rec.patientName ?? (rec.patient as Record<string, string>)?.name ?? 'Patient'
            ),
            patientId: String(rec.patientId ?? ''),
            medication:
              meds.length > 0
                ? meds.map((m: Record<string, string>) => `${m.name} ${m.dosage}`).join(', ')
                : String(rec.medication ?? ''),
            medications: meds.map((m: Record<string, string>) => ({
              name: m.name ?? '',
              dosage: m.dosage ?? '',
              frequency: m.frequency ?? '',
            })),
            date: String(rec.date ?? rec.createdAt ?? 'Today'),
            followUpDate: rec.followUpDate ? String(rec.followUpDate) : null,
            status: String(rec.inviteStatus ?? 'active'),
          };
        }
      );
      const appointments = apiAppointments;
      const patients = apiPatients;
      const prescriptions = apiPrescriptions;
      const completed = appointments.filter(a => a.status === 'completed').length;
      const upcoming = appointments.filter(
        a => a.status === 'pending' || a.status === 'confirmed' || a.status === 'rescheduled'
      ).length;
      const grossEarnings = appointments
        .filter(a => a.status === 'completed')
        .reduce((s, a) => s + a.fee, 0);
      setDashboardData({
        appointments,
        patients,
        prescriptions,
        stats: { completed, upcoming, grossEarnings },
        revenue: (dashData as Record<string, unknown>).revenue as typeof dashboardData extends null ? never : NonNullable<typeof dashboardData>['revenue'],
        alerts: (dashData as Record<string, unknown>).alerts as typeof dashboardData extends null ? never : NonNullable<typeof dashboardData>['alerts'],
        priorityList: (dashData as Record<string, unknown>).priorityList as typeof dashboardData extends null ? never : NonNullable<typeof dashboardData>['priorityList'],
        subscription: (dashData as Record<string, unknown>).subscription as typeof dashboardData extends null ? never : NonNullable<typeof dashboardData>['subscription'],
      });
      setPatientCount(patients.length);

      const adherencePatients = (adherenceData?.patients ?? []) as Array<{
        id: string;
        name: string;
        email: string;
        medications: number;
        adherence: number;
        todayReminders: number;
        takenToday: number;
        weekReminders: number;
        takenWeek: number;
        inviteLink?: string | null;
      }>;
      const lowCount = adherencePatients.filter(p => p.adherence < 60).length;
      setLowAdherenceCount(lowCount);
      setApiLoaded(true);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setApiLoaded(true);
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleAppointmentAction = React.useCallback(
    async (appointmentId: string, newStatus: 'confirmed' | 'completed' | 'cancelled') => {
      setUpdatingApptId(appointmentId);
      try {
        const res = await fetch(`/api/appointments/${appointmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to update appointment');
        }
        toast({ title: 'Appointment updated', description: `Status changed to ${newStatus}` });
        fetchDashboardData(true);
      } catch (error) {
        toast({
          title: 'Update failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setUpdatingApptId(null);
      }
    },
    [toast, fetchDashboardData]
  );

  const handleReschedule = React.useCallback(
    async () => {
      if (!rescheduleApptId || !rescheduleDate || !rescheduleTime) {
        toast({ title: 'Please select date and time', variant: 'destructive' });
        return;
      }
      setUpdatingApptId(rescheduleApptId);
      try {
        const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
        const res = await fetch(`/api/appointments/${rescheduleApptId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledAt }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to reschedule');
        }
        toast({ title: 'Appointment rescheduled' });
        setRescheduleApptId(null);
        setRescheduleDate('');
        setRescheduleTime('');
        fetchDashboardData(true);
      } catch (error) {
        toast({
          title: 'Reschedule failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setUpdatingApptId(null);
      }
    },
    [rescheduleApptId, rescheduleDate, rescheduleTime, toast, fetchDashboardData]
  );

  // Fetch doctor availability
  React.useEffect(() => {
    fetch('/api/doctors/availability', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.schedule) setSchedule(d.schedule);
      })
      .catch(() => {});
  }, []);

  // Stats — use live data, sample only as demo fallback when API failed
  // Demo accounts: skip API and use sample data directly
  const isRealData = !isDemo && dashboardData !== null;
  const completed = isRealData
    ? (dashboardData?.stats?.completed ?? 0)
    : APPOINTMENTS.filter(a => a.status === 'completed').length;
  const upcoming = isRealData
    ? (dashboardData?.stats?.upcoming ?? 0)
    : APPOINTMENTS.filter(
        a => a.status === 'pending' || a.status === 'confirmed' || a.status === 'rescheduled'
      ).length;
  const grossEarnings = isRealData
    ? (dashboardData?.stats?.grossEarnings ?? 0)
    : APPOINTMENTS.filter(a => a.status === 'completed').reduce((s, a) => s + a.fee, 0);
  const liveAppointments = isRealData ? (dashboardData?.appointments ?? []) : APPOINTMENTS;
  const livePrescriptions = isRealData ? (dashboardData?.prescriptions ?? []) : PRESCRIPTIONS;
  const hasRealData =
    apiLoaded &&
    dashboardData !== null &&
    (dashboardData.appointments.length > 0 || dashboardData.patients.length > 0);
  const livePatients = dashboardData?.patients ?? [];

  // Loyalty tier — derived from lifetime fulfilled orders.
  const totalCompletedLifetime = isRealData
    ? completed
    : APPOINTMENTS.filter(a => a.status === 'completed').length;
  const currentTier: LoyaltyTier = resolveTier(totalCompletedLifetime);
  const tierInfo = LOYALTY_TIERS[currentTier];
  const nextTier = tierInfo.next ? LOYALTY_TIERS[tierInfo.next] : null;
  const progress =
    nextTier && nextTier.min > tierInfo.min
      ? Math.min(
          100,
          Math.round(
            ((totalCompletedLifetime - tierInfo.min) / (nextTier.min - tierInfo.min)) * 100
          )
        )
      : 100;

  // Commission: 20% base fee minus loyalty discount (Bronze 0, Silver 1, Gold 2, Platinum 3).
  const baseFeePct = DOCTOR_BASE_FEE_PCT;
  const effectiveFee = effectiveFeePct(baseFeePct, currentTier);
  const loyaltySavingPct = baseFeePct - effectiveFee;
  const feeAmount = platformFee(grossEarnings, effectiveFee);
  const youReceive = partnerKeeps(grossEarnings, effectiveFee);
  const perConsultFee = platformFee(displayFee, effectiveFee);
  const perConsultKeeps = partnerKeeps(displayFee, effectiveFee);

  // Paywall helpers
  const slotsUsed = Math.min(patientCount, FREE_PATIENT_CAP);
  const slotsPct = Math.round((slotsUsed / FREE_PATIENT_CAP) * 100);
  const slotsLeft = FREE_PATIENT_CAP - slotsUsed;
  const nearCap = slotsUsed >= FREE_PATIENT_CAP - 2; // 3+/5 → prompt upgrade

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-b from-emerald-50/40 via-background to-background dark:from-emerald-950/20">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl pt-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          {/* Kynthai Brand - Prominent, Left Side */}
          <div className="flex items-center">
            <KynthaiBrand iconSize={32} />
          </div>

          {/* Doctor Profile - Secondary, Right Side */}
          <div className="flex items-center gap-1">
            <button onClick={() => setProfileOpen(true)} className="flex items-center gap-3" aria-label="Profile">
              <Avatar className="h-10 w-10 ring-2 ring-emerald-500/20">
                <AvatarFallback className="bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-semibold">
                  {(isDemo ? 'G' : (user.name?.[0] ?? 'D')).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <p className="text-xs text-muted-foreground leading-tight">{greeting}</p>
                <p className="text-sm font-semibold leading-tight">
                  Dr. {isDemo ? 'Guest' : (user.name?.split(' ').slice(-1)[0] ?? 'Doctor')}
                </p>
              </div>
            </button>
            <div className="flex items-center gap-1">
              <OfflineIndicator />
              {/* Online/Offline toggle */}
              <button
                onClick={() => setDoctorOnline(!doctorOnline)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  doctorOnline
                    ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
                title={
                  doctorOnline
                    ? 'Go offline - stop accepting consultations'
                    : 'Go online - accept consultations'
                }
              >
                <span
                  className={`h-2 w-2 rounded-full ${doctorOnline ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`}
                />
                {doctorOnline ? t('online') : t('offline')}
              </button>
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hidden sm:inline-flex"
              >
                <CheckCircle2 className="h-3 w-3" />
                Verified
              </Badge>
              {isPro && (
                <Badge
                  variant="secondary"
                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  <Crown className="h-3 w-3" />
                  Pro
                </Badge>
              )}
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

      <main className="mx-auto max-w-3xl w-full flex-1 px-4 pb-20 pt-4 space-y-5">
        {/* API error banner */}
        {apiError && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Could not load live data. Showing sample data.{' '}
              <button
                onClick={() => {
                  setApiError(null);
                  fetchDashboardData();
                }}
                className="underline font-medium"
              >
                Retry
              </button>
            </p>
          </div>
        )}
        {/* Pull-to-refresh button */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            {refreshing ? t('refreshing') : t('refresh')}
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {view === 'overview' && (
            <FadeIn key="overview">
              <>
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 p-5 text-white shadow-lg shadow-emerald-600/20 mb-4">
                  <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative">
                    <p className="text-sm opacity-90">
                      {profile.specialization} · {profile.city}
                    </p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">
                      Dr. {user.name?.split(' ').slice(-1)[0] ?? 'Doctor'}
                    </h1>
                    <p className="mt-1 text-sm opacity-90">
                      {upcoming} upcoming today · {completed} completed recently
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                  <StatCard
                    icon={<CalendarDays className="h-4 w-4" />}
                    label={t('appointments')}
                    value={liveAppointments.length}
                    tint="emerald"
                  />
                  <StatCard
                    icon={<Clock className="h-4 w-4" />}
                    label={t('upcoming')}
                    value={upcoming}
                    tint="cyan"
                  />
                  <StatCard
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label={t('completed')}
                    value={completed}
                    tint="teal"
                  />
                  <StatCard
                    icon={<Users className="h-4 w-4" />}
                    label={t('patients')}
                    value={patientCount}
                    tint="amber"
                  />
                </div>

                {/* Alerts */}
                {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
                  <Card className="mt-4 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
                    <CardContent className="p-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Needs Attention
                      </h3>
                      <div className="space-y-2">
                        {dashboardData.alerts.map((alert, i) => (
                          <div
                            key={i}
                            className={cn(
                              'flex items-center gap-2 text-sm p-2 rounded-lg',
                              alert.severity === 'high' && 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
                              alert.severity === 'medium' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
                              alert.severity === 'low' && 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
                            )}
                          >
                            <span className="font-semibold">{alert.count}</span>
                            <span>{alert.message}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Today's Priority List */}
                {dashboardData?.priorityList && dashboardData.priorityList.length > 0 && (
                  <Card className="mt-4">
                    <CardContent className="p-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <Clock className="h-4 w-4 text-emerald-600" />
                        Today's Priority
                      </h3>
                      <div className="space-y-2">
                        {dashboardData.priorityList.slice(0, 5).map((item, i) => (
                          <div
                            key={i}
                            className={cn(
                              'flex items-center gap-3 p-2 rounded-lg border',
                              item.priority === 'high' && 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20',
                              item.priority === 'medium' && 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                item.priority === 'high' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                                item.priority === 'medium' && 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
                              )}
                            >
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.message}</p>
                              {item.scheduledAt && (
                                <p className="text-xs text-muted-foreground">
                                  {new Date(item.scheduledAt).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Revenue Card (Pro feature) */}
                {dashboardData?.revenue && (
                  <Card className="mt-4">
                    <CardContent className="p-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <Wallet className="h-4 w-4 text-emerald-600" />
                        Revenue
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">This Month</p>
                          <p className="text-xl font-bold text-emerald-600">
                            ${(dashboardData.revenue.thisMonth / 100).toLocaleString('en-US')}
                          </p>
                          {dashboardData.revenue.changePercent !== 0 && (
                            <p className={cn(
                              'text-xs font-medium',
                              dashboardData.revenue.changePercent > 0 ? 'text-emerald-600' : 'text-red-600',
                            )}>
                              {dashboardData.revenue.changePercent > 0 ? '↑' : '↓'} {Math.abs(dashboardData.revenue.changePercent)}% vs last month
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Earnings</p>
                          <p className="text-xl font-bold">
                            ${(dashboardData.revenue.total / 100).toLocaleString('en-US')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Subscription / paywall */}
                <Card
                  className={cn(
                    'mt-6 overflow-hidden border-0',
                    isPro ? 'ring-1 ring-amber-500/30' : nearCap && 'ring-1 ring-amber-500/30'
                  )}
                >
                  <div
                    className={cn(
                      'relative bg-gradient-to-br p-5 text-white',
                      isPro
                        ? 'from-amber-500 via-amber-600 to-orange-600'
                        : 'from-slate-700 via-slate-800 to-slate-900'
                    )}
                  >
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs opacity-80 uppercase tracking-wider">
                          {t('subscription')}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {isPro ? <Crown className="h-6 w-6" /> : <Users className="h-6 w-6" />}
                          <span className="text-2xl font-bold">
                            {' '}
                            {isPro ? t('pro') : t('free')}
                          </span>
                        </div>
                        <p suppressHydrationWarning className="mt-1 text-xs opacity-90">
                          {isPro
                            ? `Renews on ${renewsAt}`
                            : `${slotsUsed} / ${FREE_PATIENT_CAP} patient slots used`}
                        </p>
                      </div>
                      <Badge className="bg-white/20 text-white border-0">
                        {isPro ? t('active') : `${slotsLeft} ${t('left')}`}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-4 space-y-3">
                    {isPro ? (
                      <>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                          You&apos;re on Pro — enjoy unlimited patients, priority placement,
                          advanced analytics, and lower commission tier qualification.
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push('/pricing')}
                            className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                          >
                            <Crown className="h-3.5 w-3.5" />
                            {t('manage_subscription')}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">Patient slots</span>
                            <span
                              className={cn(
                                'font-semibold',
                                nearCap
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              )}
                            >
                              {slotsUsed} / {FREE_PATIENT_CAP}
                            </span>
                          </div>
                          <Progress value={slotsPct} className="h-2" />
                          {nearCap && (
                            <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                              You&apos;re near the Free-tier cap. Upgrade to Pro to add unlimited
                              patients.
                            </p>
                          )}
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold">Upgrade to Pro</p>
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              $29.99
                              <span className="text-xs font-normal text-muted-foreground">
                                /month
                              </span>
                              <span className="mx-1 text-muted-foreground">·</span>
                              $299.99
                              <span className="text-xs font-normal text-muted-foreground">
                                /year
                              </span>
                            </p>
                          </div>
                          <ul className="grid sm:grid-cols-2 gap-1.5">
                            {PRO_FEATURES.map(f => (
                              <li
                                key={f}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                              >
                                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>{t(f)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <Button
                          onClick={() => router.push('/pricing')}
                          className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-95"
                        >
                          <Crown className="h-4 w-4" />
                          {t('upgrade_to_pro')}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Loyalty card */}
                <Card className="mt-6 overflow-hidden border-0">
                  <div className={cn('relative bg-gradient-to-br p-5 text-white', tierInfo.tint)}>
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                    <div className="relative flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-xs opacity-80 uppercase tracking-wider">
                          {t('loyalty_tier')}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-2xl">{tierInfo.icon}</span>
                          <span className="text-2xl font-bold">{currentTier}</span>
                        </div>
                        <p className="mt-1 text-xs opacity-90">
                          {totalCompletedLifetime} lifetime appointments
                        </p>
                        <p className="mt-1 text-xs opacity-90 font-medium">
                          Platform fee: {effectiveFee}%{' '}
                          {loyaltySavingPct > 0 && (
                            <span className="opacity-90">(−{loyaltySavingPct}% loyalty)</span>
                          )}
                        </p>
                      </div>
                      <Trophy className="h-8 w-8 opacity-80 shrink-0" />
                    </div>
                  </div>
                  <CardContent className="p-4">
                    {nextTier ? (
                      <>
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-muted-foreground">Progress to {tierInfo.next}</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {progress}%
                          </span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {nextTier.min - totalCompletedLifetime} more appointments to unlock{' '}
                          {tierInfo.next} perks
                          {tierInfo.next && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {' '}
                              (fee → {effectiveFeePct(baseFeePct, tierInfo.next)}%)
                            </span>
                          )}
                          .
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-center text-emerald-600 dark:text-emerald-400">
                        Top tier unlocked — enjoy maximum fee discount!
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Analytics */}
                <Card className="mt-6">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <LayoutDashboard className="h-4 w-4 text-emerald-600" />
                      Quick Analytics
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border/60 p-3">
                        <p className="text-[11px] text-muted-foreground">This Week</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {upcoming}
                        </p>
                        <p className="text-[10px] text-muted-foreground">upcoming appointments</p>
                      </div>
                      <div className="rounded-lg border border-border/60 p-3">
                        <p className="text-[11px] text-muted-foreground">Completed</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {completed}
                        </p>
                        <p className="text-[10px] text-muted-foreground">total consultations</p>
                      </div>
                      <div className="rounded-lg border border-border/60 p-3">
                        <p className="text-[11px] text-muted-foreground">Patients</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {patientCount}
                        </p>
                        <p className="text-[10px] text-muted-foreground">in your panel</p>
                      </div>
                      <div className="rounded-lg border border-border/60 p-3">
                        <p className="text-[11px] text-muted-foreground">Prescriptions</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {livePrescriptions.length}
                        </p>
                        <p className="text-[10px] text-muted-foreground">issued this month</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Video call toggle */}
                <Card className="mt-6">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Video className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{t('video_consultations')}</p>
                        <p className="text-xs text-muted-foreground">
                          {videoOn ? 'Accepting video appointments' : 'Currently disabled'}
                        </p>
                      </div>
                    </div>
                    <Switch checked={videoOn} onCheckedChange={setVideoOn} />
                  </CardContent>
                </Card>

                {/* Availability */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-emerald-600" />
                        Weekly availability
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          setEditSchedule(schedule);
                          setAvailOpen(true);
                        }}
                      >
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {(
                        [
                          'monday',
                          'tuesday',
                          'wednesday',
                          'thursday',
                          'friday',
                          'saturday',
                          'sunday',
                        ] as const
                      ).map(day => {
                        const slots = schedule[day] ?? [];
                        const hasSlots = slots.length > 0;
                        return (
                          <div key={day} className="flex items-center gap-2 text-xs">
                            <span
                              className={cn(
                                'w-20 font-medium capitalize',
                                hasSlots ? 'text-foreground' : 'text-muted-foreground'
                              )}
                            >
                              {day.slice(0, 3)}
                            </span>
                            {hasSlots ? (
                              <div className="flex flex-wrap gap-1">
                                {slots.map((s, i) => (
                                  <span
                                    key={i}
                                    className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300 font-medium"
                                  >
                                    {s.start}–{s.end}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground/60">Off</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Pricing */}
                <Card className="mt-6">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-emerald-600" />
                        {t('pricing_earnings')}
                      </h3>
                      <Badge variant="secondary" className="text-[10px]">
                        Per session
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl border border-border/60 p-2 sm:p-3 text-center">
                        <p className="text-[11px] text-muted-foreground">Consult fee</p>
                        {editingFee ? (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-sm">$</span>
                            <input
                              type="number"
                              value={newFee}
                              onChange={e => setNewFee(e.target.value)}
                              className="w-16 text-base font-bold bg-transparent border-b border-primary outline-none text-center"
                              min={0}
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={handleSaveFee} disabled={savingFee} className="h-7 text-xs">
                              {savingFee ? 'Saving…' : '✓'}
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingFee(true); setNewFee(String(profile.consultationFee)); }}
                            className="flex items-center gap-1 justify-center mx-auto text-base sm:text-lg font-bold hover:opacity-70 transition-opacity"
                            title="Edit consultation fee"
                          >
                            ${profile.consultationFee}
                            <Edit3 className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                      <div className="rounded-xl border border-border/60 p-2 sm:p-3 text-center">
                        <p className="text-[11px] text-muted-foreground">
                          Platform fee ({effectiveFee}%)
                        </p>
                        <p className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400">
                          −${perConsultFee}
                        </p>
                        {loyaltySavingPct > 0 && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                            saving ${Math.round((displayFee * loyaltySavingPct) / 100)}
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-2 sm:p-3 text-center">
                        <p className="text-[11px] text-muted-foreground">You receive</p>
                        <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          ${perConsultKeeps}
                        </p>
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Recent gross ({completed} sessions)
                      </span>
                      <span className="font-semibold">
                        ${grossEarnings.toLocaleString('en-US')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-muted-foreground">Platform fee ({effectiveFee}%)</span>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        −${feeAmount.toLocaleString('en-US')}
                      </span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Net payout</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        ${youReceive.toLocaleString('en-US')}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {PAYOUT_POLICY.cadence} payout · min ${PAYOUT_POLICY.minPayoutUsd} · via{' '}
                      {PAYOUT_POLICY.methods.join('/')}
                    </p>
                  </CardContent>
                </Card>
              </>
            </FadeIn>
          )}
        </AnimatePresence>

        {view === 'appointments' && (
          <>
            {/* Appointments */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-emerald-600" />
                  {t('appointments')}
                </h2>
              </div>
              {liveAppointments.length === 0 && hasRealData ? (
                <Card className="border-dashed">
                  <CardContent className="p-8 text-center">
                    <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('no_appointments')}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {t('first_consultation')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder={t('search_by_patient')}
                    value={appointmentSearch}
                    onChange={e => setAppointmentSearch(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-background px-3.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 mb-3"
                  />
                  <div className="space-y-2 pr-1">
                    {liveAppointments
                      .filter(
                        a =>
                          !appointmentSearch ||
                          a.patientName.toLowerCase().includes(appointmentSearch.toLowerCase())
                      )
                      .map(a => (
                        <Card
                          key={a.id}
                          className={cn(
                            (a.status === 'confirmed' || a.status === 'rescheduled') &&
                              'ring-1 ring-emerald-500/20'
                          )}
                        >
                          <CardContent className="p-3 flex items-center gap-3">
                            <span
                              className={cn(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                a.status === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : a.status === 'cancelled'
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              )}
                            >
                              {a.type === 'video' ? (
                                <Video className="h-5 w-5" />
                              ) : (
                                <Users className="h-5 w-5" />
                              )}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{a.patientName}</p>
                              <p className="text-xs text-muted-foreground">
                                {a.date} · {a.time}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">${a.fee}</span>
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-[10px]',
                                  a.status === 'pending' &&
                                    'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                                  (a.status === 'confirmed' || a.status === 'rescheduled') &&
                                    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                                  a.status === 'completed' &&
                                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                  a.status === 'cancelled' &&
                                    'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                )}
                              >
                                {a.status}
                              </Badge>
                            </div>
                          </CardContent>
                          {a.status === 'pending' && (
                            <div className="px-3 pb-3 flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={updatingApptId === a.id}
                                onClick={() => handleAppointmentAction(a.id, 'confirmed')}
                              >
                                {updatingApptId === a.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Accept'
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-8 text-xs border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400"
                                disabled={updatingApptId === a.id}
                                onClick={() => handleAppointmentAction(a.id, 'cancelled')}
                              >
                                {updatingApptId === a.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Reject'
                                )}
                              </Button>
                            </div>
                          )}
                          {(a.status === 'confirmed' || a.status === 'rescheduled') && (
                            <div className="px-3 pb-3 flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={updatingApptId === a.id}
                                onClick={() => handleAppointmentAction(a.id, 'completed')}
                              >
                                {updatingApptId === a.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    Complete
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-8 text-xs"
                                onClick={() => setJoiningCallApptId(a.id)}
                              >
                                <Video className="h-3 w-3" />
                                {t('join')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-muted-foreground"
                                onClick={() => setRescheduleApptId(a.id)}
                              >
                                {t('reschedule')}
                              </Button>
                            </div>
                          )}
                        </Card>
                      ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {view === 'patients' && (
          <>
            {/* Patient Care — full prescribe + adherence + nudge + invite flow */}
            <div className="pt-2">
              <PatientCare
                onPatientClick={p =>
                  setSelectedPatient({
                    id: p.id,
                    name: p.name,
                    email: p.email,
                    medications: p.medications,
                    adherence: p.adherence,
                    todayReminders: p.todayReminders,
                    takenToday: p.takenToday,
                    weekReminders: p.weekReminders,
                    takenWeek: p.takenWeek,
                    inviteLink: p.inviteLink,
                  })
                }
              />
            </div>
          </>
        )}

        {view === 'prescriptions' && (
          <>
            {/* Prescriptions */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Pill className="h-4 w-4 text-emerald-600" />
                  {t('prescription_history')}
                </h2>
                <Badge variant="secondary" className="text-[10px]">
                  {livePrescriptions.length} total
                </Badge>
              </div>
              <div className="space-y-2 pr-1">
                {livePrescriptions.map(rx => (
                  <Card key={rx.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Pill className="h-4 w-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{rx.patientName}</p>
                          <p className="text-[11px] text-muted-foreground">{rx.date}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {rx.status === 'accepted'
                            ? 'Accepted'
                            : rx.status === 'sent'
                              ? 'Sent'
                              : 'Active'}
                        </Badge>
                      </div>
                      {rx.medications && rx.medications.length > 0 && (
                        <div className="ml-12 space-y-1">
                          {rx.medications.map((m, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <span className="text-emerald-600 dark:text-emerald-400">•</span>
                              <span className="font-medium">{m.name}</span>
                              <span className="text-muted-foreground">{m.dosage}</span>
                              <span className="text-muted-foreground">· {m.frequency}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {rx.followUpDate && (
                        <p className="ml-12 text-[11px] text-muted-foreground">
                          Follow-up:{' '}
                          {new Date(rx.followUpDate).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                      <div className="ml-12 flex flex-wrap gap-1.5 pt-1 sm:gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setView('patients')}
                        >
                          <Pill className="h-3 w-3" />
                          {t('prescribe_again')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={async () => {
                            setNotesPatientId(rx.patientId ?? '');
                            setNotesContent('');
                            setNotesType('observation');
                            setNotesOpen(true);
                          }}
                        >
                          {t('view_notes')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={async () => {
                            await downloadPdf(rx.id);
                          }}
                          disabled={downloadingPdfId === rx.id}
                        >
                          {downloadingPdfId === rx.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          {downloadingPdfId === rx.id ? '...' : 'PDF'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {livePrescriptions.length === 0 && hasRealData && (
                  <Card className="border-dashed">
                    <CardContent className="p-8 text-center">
                      <Pill className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-muted-foreground">
                        {t('no_prescriptions')}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {t('create_from_patient_care')}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Spacer pushes gradient to fill viewport behind fixed bottom nav */}
      <div className="h-20 shrink-0" aria-hidden />

      {/* Bottom tab navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/80 backdrop-blur-xl pb-safe">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2 py-2">
          {[
            { id: 'overview' as const, label: t('overview'), icon: LayoutDashboard },
            { id: 'appointments' as const, label: t('appointments'), icon: CalendarDays },
            {
              id: 'patients' as const,
              label: t('patients'),
              icon: Users,
              badge: lowAdherenceCount,
            },
            { id: 'prescriptions' as const, label: t('prescriptions'), icon: Pill },
          ].map(tItem => {
            const Icon = tItem.icon;
            const active = view === tItem.id;
            return (
              <button
                key={tItem.id}
                onClick={() => setView(tItem.id)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 min-h-11 text-[11px] font-medium transition-all relative',
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl transition-all relative',
                    active
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : ''
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {tItem.badge != null && tItem.badge > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {tItem.badge}
                    </span>
                  )}
                </span>
                {tItem.label}
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

      {/* Notes dialog */}
      {notesOpen && (
        <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('consultation_notes')}</DialogTitle>
              <DialogDescription>{t('view_add_notes')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2 overflow-y-auto">
              {notesList.length > 0 ? (
                notesList.map(n => (
                  <div key={n.id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {n.type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(n.createdAt).toLocaleDateString('en-US', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{n.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">{t('no_notes')}</p>
              )}
            </div>
            {/* AI Notes section */}
            <div className="space-y-2 border-t border-border/40 pt-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  AI Clinical Notes
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] gap-1 ml-auto"
                  onClick={() => setAiNotesOpen(!aiNotesOpen)}
                >
                  {aiNotesOpen ? 'Hide' : 'Generate with AI'}
                </Button>
              </div>
              {aiNotesOpen && (
                <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <Textarea
                    rows={3}
                    placeholder="Enter visit transcript or symptoms (e.g. 'Patient presents with fever, cough, and body ache for 3 days')..."
                    value={aiTranscript}
                    onChange={e => setAiTranscript(e.target.value)}
                    className="text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!aiTranscript.trim() || !notesPatientId) {
                        toast({
                          title: 'Enter transcript and select a patient',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setAiGenerating(true);
                      try {
                        const res = await fetch('/api/doctors/ai-notes', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            patientId: notesPatientId,
                            transcript: aiTranscript.trim(),
                            symptoms: [],
                          }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setNotesList(prev => [data.note, ...prev]);
                          setAiTranscript('');
                          setAiNotesOpen(false);
                          toast({
                            title: 'AI notes generated',
                            description: `Confidence: ${data.suggestions?.confidence ?? 'N/A'}%`,
                          });
                        } else {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err?.error || 'AI generation failed');
                        }
                      } catch (e) {
                        toast({
                          title: 'AI notes failed',
                          description: e instanceof Error ? e.message : 'Unknown error',
                          variant: 'destructive',
                        });
                      } finally {
                        setAiGenerating(false);
                      }
                    }}
                    disabled={aiGenerating}
                    className="gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white h-7 text-xs"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3" />
                        Generate Note
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
            {/* Manual Notes entry */}
            <div className="space-y-2 pt-3">
              <div className="flex gap-2">
                {(['observation', 'diagnosis', 'follow-up'] as const).map(t => (
                  <Button
                    key={t}
                    size="sm"
                    variant={notesType === t ? 'default' : 'outline'}
                    className="h-7 text-[10px] capitalize"
                    onClick={() => setNotesType(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
              <Textarea
                rows={3}
                placeholder={t('add_note')}
                value={notesContent}
                onChange={e => setNotesContent(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotesOpen(false)}>
                {t('close')}
              </Button>
              <Button
                onClick={async () => {
                  if (!notesContent.trim()) return;
                  try {
                    const res = await fetch('/api/doctors/notes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        patientId: notesPatientId,
                        content: notesContent.trim(),
                        type: notesType,
                      }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setNotesList(prev => [data.note, ...prev]);
                      setNotesContent('');
                    }
                  } catch {
                    /* ignore */
                  }
                }}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
              >
                {t('add_note_button')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Patient profile dialog */}
      {selectedPatient && (
        <Dialog open={!!selectedPatient} onOpenChange={o => !o && setSelectedPatient(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('patient_profile')}</DialogTitle>
              <DialogDescription>{selectedPatient.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-semibold">
                    {selectedPatient.name[0]?.toUpperCase() ?? 'P'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">{selectedPatient.name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {selectedPatient.email}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Adherence</p>
                  <p
                    className={cn(
                      'text-lg font-bold',
                      selectedPatient.adherence >= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : selectedPatient.adherence >= 60
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {selectedPatient.adherence}%
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Active meds</p>
                  <p className="text-lg font-bold">{selectedPatient.medications}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Today&apos;s progress</p>
                <div className="flex items-center gap-2 text-xs">
                  <Progress
                    value={
                      selectedPatient.todayReminders
                        ? Math.round(
                            (selectedPatient.takenToday / selectedPatient.todayReminders) * 100
                          )
                        : 0
                    }
                    className="h-1.5 flex-1"
                  />
                  <span className="font-medium">
                    {selectedPatient.takenToday}/{selectedPatient.todayReminders} taken
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">7-day progress</p>
                <div className="flex items-center gap-2 text-xs">
                  <Progress value={selectedPatient.adherence} className="h-1.5 flex-1" />
                  <span className="font-medium">
                    {selectedPatient.takenWeek}/{selectedPatient.weekReminders} taken
                  </span>
                </div>
              </div>

              {selectedPatient.adherence < 60 && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    Low adherence alert
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    This patient needs follow-up or a nudge.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPatient(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setSelectedPatient(null);
                  setView('patients');
                }}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('view_full_profile')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Availability edit dialog */}
      {availOpen && (
        <Dialog open={availOpen} onOpenChange={setAvailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit availability</DialogTitle>
              <DialogDescription>
                Set your weekly schedule. Patients can book during these hours.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    const full: WeeklySchedule = {
                      monday: [{ start: '09:00', end: '18:00' }],
                      tuesday: [{ start: '09:00', end: '18:00' }],
                      wednesday: [{ start: '09:00', end: '18:00' }],
                      thursday: [{ start: '09:00', end: '18:00' }],
                      friday: [{ start: '09:00', end: '18:00' }],
                      saturday: [{ start: '09:00', end: '18:00' }],
                      sunday: [],
                    };
                    setEditSchedule(full);
                  }}
                >
                  Full day (9–6)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    const morn: WeeklySchedule = {
                      monday: [{ start: '09:00', end: '13:00' }],
                      tuesday: [{ start: '09:00', end: '13:00' }],
                      wednesday: [{ start: '09:00', end: '13:00' }],
                      thursday: [{ start: '09:00', end: '13:00' }],
                      friday: [{ start: '09:00', end: '13:00' }],
                      saturday: [{ start: '09:00', end: '13:00' }],
                      sunday: [],
                    };
                    setEditSchedule(morn);
                  }}
                >
                  Morning only (9–1)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    const eve: WeeklySchedule = {
                      monday: [{ start: '14:00', end: '18:00' }],
                      tuesday: [{ start: '14:00', end: '18:00' }],
                      wednesday: [{ start: '14:00', end: '18:00' }],
                      thursday: [{ start: '14:00', end: '18:00' }],
                      friday: [{ start: '14:00', end: '18:00' }],
                      saturday: [{ start: '14:00', end: '18:00' }],
                      sunday: [],
                    };
                    setEditSchedule(eve);
                  }}
                >
                  Evening only (2–6)
                </Button>
              </div>
              {(
                [
                  'monday',
                  'tuesday',
                  'wednesday',
                  'thursday',
                  'friday',
                  'saturday',
                  'sunday',
                ] as const
              ).map(day => {
                const slots = editSchedule[day] ?? [];
                return (
                  <div key={day} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold capitalize">{day}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] text-muted-foreground"
                        onClick={() =>
                          setEditSchedule(prev => ({
                            ...prev,
                            [day]: [...slots, { start: '09:00', end: '12:00' }],
                          }))
                        }
                      >
                        + Add slot
                      </Button>
                    </div>
                    {slots.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">Off</p>
                    ) : (
                      <div className="space-y-1.5">
                        {slots.map((slot, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={slot.start}
                              onChange={e => {
                                const newSlots = [...slots];
                                const currentSlot = newSlots[idx] ?? { start: '', end: '' };
                                newSlots[idx] = {
                                  ...currentSlot,
                                  start: e.target.value as string,
                                  end: currentSlot.end,
                                };
                                setEditSchedule(prev => ({ ...prev, [day]: newSlots }));
                              }}
                              className="h-7 w-28 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">to</span>
                            <Input
                              type="time"
                              value={slot.end}
                              onChange={e => {
                                const newSlots = [...slots];
                                const currentSlot = newSlots[idx] ?? { start: '', end: '' };
                                newSlots[idx] = {
                                  ...currentSlot,
                                  end: e.target.value as string,
                                  start: currentSlot.start,
                                };
                                setEditSchedule(prev => ({ ...prev, [day]: newSlots }));
                              }}
                              className="h-7 w-28 text-xs"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                const newSlots = slots.filter((_, i) => i !== idx);
                                setEditSchedule(prev => ({ ...prev, [day]: newSlots }));
                              }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAvailOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const entries = Object.entries(editSchedule).map(([day, slots]) => ({
                      day,
                      slots,
                    }));
                    const res = await fetch('/api/doctors/availability', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ schedule: entries }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setSchedule(data.schedule);
                      setAvailOpen(false);
                    }
                  } catch {
                    /* ignore */
                  }
                }}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Save schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {/* Reschedule Dialog */}
      {rescheduleApptId && (
        <Dialog open={!!rescheduleApptId} onOpenChange={() => setRescheduleApptId(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reschedule Appointment</DialogTitle>
              <DialogDescription>Select a new date and time for this appointment.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reschedule-date">Date</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reschedule-time">Time</Label>
                <Input
                  id="reschedule-time"
                  type="time"
                  value={rescheduleTime}
                  onChange={e => setRescheduleTime(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRescheduleApptId(null)}>Cancel</Button>
              <Button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime || updatingApptId === rescheduleApptId}>
                {updatingApptId === rescheduleApptId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reschedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {joiningCallApptId && (
        <VideoCall
          roomName={joiningCallApptId}
          displayName={user.name}
          identity={user.id}
          role="doctor"
          onEndCall={() => setJoiningCallApptId(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tint: 'emerald' | 'cyan' | 'teal' | 'amber';
}) {
  const cls = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  }[tint];
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">
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
