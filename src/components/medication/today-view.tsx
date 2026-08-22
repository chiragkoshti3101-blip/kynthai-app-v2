'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  SkipForward,
  Clock,
  Pill,
  TrendingUp,
  CalendarDays,
  RefreshCw,
  Volume2,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { type Medication, type Reminder, type ReminderStats, getColorClasses } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { cachePatientData, getCachedPatientData } from '@/lib/offline-queue';
import {
  playProfessionalRingtone,
  playAlertRingtone,
  playSuccessChime,
  isAlarmRinging,
  stopAllRingtones,
} from '@/lib/alarm';

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(t: string) {
  const [h = 0, m = 0] = t.split(':').map(Number) as [number, number];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function isUpcoming(time: string) {
  const now = new Date();
  const [h = 0, m = 0] = time.split(':').map(Number) as [number, number];
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return target.getTime() >= now.getTime() - 60 * 1000;
}

export function TodayView({ userId, isDemo, onLoaded }: { userId?: string; isDemo?: boolean; onLoaded?: () => void } = {}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [stats, setStats] = useState<ReminderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const { toast } = useToast();
  const { alarmEnabled, alarmMode } = useAppStore();
  const date = todayStr();
  // Last-good snapshot key for offline viewing; 24h TTL so a long outage
  // still shows the list. ponytail: status may be stale while offline —
  // labeled via the offline banner, and queued actions sync on reconnect.
  const cacheKey = `reminders_${date}${userId ? `_${userId}` : ''}`;

  const load = useCallback(async () => {
    setLoading(true);
    // Demo mode: render sample reminders without touching the backend so
    // the patient portal doesn't break for one-tap demo logins.
    if (isDemo) {
      const demoMeds = [
        { id: 'dm1', name: 'Metformin', dosage: '500mg', color: 'emerald' },
        { id: 'dm2', name: 'Atorvastatin', dosage: '10mg', color: 'teal' },
        { id: 'dm3', name: 'Vitamin D3', dosage: '60K IU', color: 'amber' },
      ] as const;
      const demoReminders: Reminder[] = [
        {
          id: 'dr1',
          medicationId: 'dm1',
          date,
          time: '08:00',
          status: 'taken',
          medication: demoMeds[0],
        },
        {
          id: 'dr2',
          medicationId: 'dm2',
          date,
          time: '13:00',
          status: 'pending',
          medication: demoMeds[1],
        },
        {
          id: 'dr3',
          medicationId: 'dm3',
          date,
          time: '18:00',
          status: 'pending',
          medication: demoMeds[2],
        },
      ] as Reminder[];
      setReminders(demoReminders);
      setStats({ total: 3, taken: 1, skipped: 0, pending: 2, adherence: 33 });
      setLoading(false);
      onLoaded?.();
      return;
    }
    try {
      const qs = new URLSearchParams({ date });
      if (userId) qs.set('userId', userId);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const [remRes, statsRes] = await Promise.all([
        fetch(`/api/reminders?${qs.toString()}`, { signal: controller.signal, credentials: 'include' }),
        fetch(`/api/reminders/stats?${qs.toString()}`, { signal: controller.signal, credentials: 'include' }),
      ]);
      clearTimeout(timeoutId);
      if (!remRes.ok || !statsRes.ok) throw new Error('Failed to load');
      const [rems, s] = await Promise.all([remRes.json(), statsRes.json()]);
      const remList = Array.isArray(rems)
        ? rems
        : Array.isArray(rems?.data)
          ? rems.data
          : Array.isArray(rems?.reminders)
            ? rems.reminders
            : [];
      setReminders(remList);
      setStats(s && typeof s === 'object' ? s : null);
      setOffline(false);
      cachePatientData(cacheKey, rems);
      cachePatientData(`${cacheKey}_stats`, s);
    } catch (e) {
      // Offline (or transient failure): fall back to demo data if no cache.
      const cached = getCachedPatientData<Reminder[]>(cacheKey, 24 * 60 * 60 * 1000);
      const cachedStats = getCachedPatientData<ReminderStats>(
        `${cacheKey}_stats`,
        24 * 60 * 60 * 1000
      );
      if (cached && cached.length > 0) {
        setReminders(cached);
        setStats(cachedStats);
        setOffline(true);
        toast({
          title: 'Showing saved reminders',
          description: "You're offline — showing the last saved list.",
        });
      } else if (isDemo) {
        // Fallback to demo data so the user always sees something
        setReminders([
          { id: 'demo1', medicationId: 'm1', date, time: '08:00', status: 'taken', medication: { id: 'm1', name: 'Metformin', dosage: '500mg', color: 'emerald', times: ['08:00'], frequency: 'Once daily', active: true, createdAt: date, updatedAt: date } },
          { id: 'demo2', medicationId: 'm2', date, time: '13:00', status: 'pending', medication: { id: 'm2', name: 'Atorvastatin', dosage: '10mg', color: 'teal', times: ['13:00'], frequency: 'Once daily', active: true, createdAt: date, updatedAt: date } },
        ] as Reminder[]);
        setStats({ total: 2, taken: 1, skipped: 0, pending: 1, adherence: 50 });
        setOffline(false);
      } else {
        setReminders([]);
        setStats({ total: 0, taken: 0, skipped: 0, pending: 0, adherence: 0 });
        setOffline(true);
      }
    } finally {
      setLoading(false);
      onLoaded?.();
    }
  }, [date, isDemo, toast, userId, onLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (reminder: Reminder, status: 'taken' | 'skipped') => {
    setUpdating(reminder.id);
    // Play success chime when marking taken
    if (status === 'taken' && alarmEnabled) {
      playSuccessChime();
    }

    // Demo mode: update local state only.
    if (isDemo) {
      setReminders(prev => prev.map(r => (r.id === reminder.id ? { ...r, status } : r)));
      setStats(prev =>
        prev
          ? {
              ...prev,
              taken: status === 'taken' ? prev.taken + 1 : prev.taken,
              pending: prev.pending - 1,
              adherence: Math.round(
                ((prev.taken + (status === 'taken' ? 1 : 0)) / prev.total) * 100
              ),
            }
          : prev
      );
      toast({
        title: status === 'taken' ? 'Marked as taken' : 'Skipped',
        description:
          status === 'taken'
            ? `${reminder.medication?.name} — ${reminder.medication?.dosage}`
            : undefined,
      });
      setUpdating(null);
      return;
    }
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicationId: reminder.medicationId,
          date: reminder.date,
          time: reminder.time,
          status,
        }),
      });
      if (!res.ok) throw new Error('Update failed');
      toast({
        title: status === 'taken' ? 'Marked as taken' : 'Skipped',
        description:
          status === 'taken'
            ? `${reminder.medication?.name} — ${reminder.medication?.dosage}`
            : undefined,
      });
      await load();
    } catch (e) {
      // If offline, queue the action for later sync
      const { offlineFetch } = await import('@/lib/offline-queue');
      const queued = await offlineFetch('/api/reminders', {
        method: 'POST',
        body: {
          medicationId: reminder.medicationId,
          date: reminder.date,
          time: reminder.time,
          status,
        },
        role: 'patient',
      });
      if (queued.queued) {
        toast({
          title: 'Queued for sync',
          description: "You're offline — dose will be saved when you reconnect.",
        });
        // Optimistically update local state
        setReminders(prev => prev.map(r => (r.id === reminder.id ? { ...r, status } : r)));
        setUpdating(null);
        return;
      }
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  // ── In-app alarm: persistent repeating alarm with Take/Skip ──
  const [alarmTarget, setAlarmTarget] = useState<Reminder | null>(null);
  const alarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleNextAlarmRef = useRef<(alarmTarget: Reminder | null) => void>(() => {});

  const scheduleNextAlarm = React.useCallback(() => {
    const pending = reminders.filter(r => r.status === 'pending');
    if (pending.length === 0) {
      setAlarmTarget(null);
      return;
    }

    // Find the most urgent pending reminder (closest time)
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const sorted = [...pending].sort((a, b) => {
      const [ah = 0, am = 0] = a.time.split(':').map(Number) as [number, number];
      const [bh = 0, bm = 0] = b.time.split(':').map(Number) as [number, number];
      return ah * 60 + am - (bh * 60 + bm);
    });

    const closest = sorted[0];
    setAlarmTarget(closest ?? null);

    // Play alarm if not already ringing
    if (!isAlarmRinging()) {
      if (alarmMode === 'alert') playAlertRingtone();
      else playProfessionalRingtone();
    }

    // Schedule next alarm check based on reminderInterval
    // Default 10 minutes if medication doesn't specify
    const interval = (closest as unknown as { reminderInterval?: number }).reminderInterval || 10;
    if (interval > 0 && alarmTimer.current) {
      clearTimeout(alarmTimer.current);
      alarmTimer.current = setTimeout(
        () => {
          scheduleNextAlarmRef.current(alarmTarget);
        },
        interval * 60 * 1000
      );
    }
  }, [
    reminders,
    alarmMode,
    alarmTarget,
    isAlarmRinging,
    alarmMode,
    playAlertRingtone,
    playProfessionalRingtone,
  ]);

  React.useEffect(() => {
    scheduleNextAlarmRef.current = scheduleNextAlarm;
  }, [scheduleNextAlarm]);

  // Trigger alarm on first load and when reminders change
  React.useEffect(() => {
    if (!alarmEnabled || loading) return;
    const hasPending = reminders.some(r => r.status === 'pending');
    if (hasPending) {
      const timer = setTimeout(() => scheduleNextAlarm(), 800);
      return () => clearTimeout(timer);
    } else {
      setAlarmTarget(null);
      stopAllRingtones();
      return;
    }
  }, [alarmEnabled, reminders, loading, scheduleNextAlarm]);

  function handleAlarmAction(reminder: Reminder, status: 'taken' | 'skipped') {
    stopAllRingtones();
    if (alarmTimer.current) clearTimeout(alarmTimer.current);
    updateStatus(reminder, status);
    // Reschedule alarm if there are still pending reminders
    const remaining = reminders
      .filter(r => r.id !== reminder.id)
      .filter(r => r.status === 'pending');
    if (remaining.length > 0) {
      setTimeout(() => scheduleNextAlarm(), 2000);
    } else {
      setAlarmTarget(null);
    }
  }

  const grouped = {
    upcoming: (Array.isArray(reminders) ? reminders : []).filter(r => r.status === 'pending' && isUpcoming(r.time)),
    overdue: (Array.isArray(reminders) ? reminders : []).filter(r => r.status === 'pending' && !isUpcoming(r.time)),
    done: (Array.isArray(reminders) ? reminders : []).filter(r => r.status !== 'pending'),
  };

  return (
    <div className="space-y-6">
      {/* Persistent alarm banner — shows medication name + Take/Skip */}
      {alarmTarget && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-semibold">Time to take medication</span>
            </div>
            <button
              onClick={() => {
                stopAllRingtones();
                setAlarmTarget(null);
                if (alarmTimer.current) clearTimeout(alarmTimer.current);
              }}
              className="rounded-lg p-1 text-muted-foreground hover:bg-amber-500/20"
            >
              <span className="text-xs">✕</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20">
              <Pill className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">
                {(alarmTarget.medication as { name?: string })?.name ?? 'Medication'}
              </p>
              <p className="text-xs text-muted-foreground">
                {alarmTarget.time} · {(alarmTarget.medication as { dosage?: string })?.dosage ?? ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => handleAlarmAction(alarmTarget, 'skipped')}
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => handleAlarmAction(alarmTarget, 'taken')}
            >
              <CheckCircle2 className="h-4 w-4" />
              Take
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Alarm will repeat until taken. Tap Take or Skip.
          </p>
        </div>
      )}

      {/* Alarm toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-2.5">
        <div className="flex items-center gap-2">
          <Volume2
            className={`h-4 w-4 ${alarmEnabled ? 'text-emerald-600' : 'text-muted-foreground'}`}
          />
          <span className="text-xs font-medium">In-app alarm</span>
          <span className="text-[10px] text-muted-foreground">
            {alarmEnabled ? (alarmMode === 'alert' ? 'Loud beep' : 'Gentle chime') : 'Silent'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => useAppStore.getState().toggleAlarm()}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
              alarmEnabled ? 'bg-emerald-600' : 'bg-muted-foreground/30'
            }`}
            aria-label={alarmEnabled ? 'Disable alarm' : 'Enable alarm'}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                alarmEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
              } mt-0.5`}
            />
          </button>
          {alarmEnabled && (
            <button
              onClick={() =>
                useAppStore
                  .getState()
                  .setAlarmMode(alarmMode === 'professional' ? 'alert' : 'professional')
              }
              className="rounded-lg border border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent transition-colors"
              title="Toggle ringtone style"
            >
              {alarmMode === 'professional' ? 'Chime' : 'Beep'}
            </button>
          )}
        </div>
      </div>

      {/* Offline notice — data shown is the last saved snapshot */}
      {offline && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          Offline — showing last saved reminders. Take/Skip actions are queued and will sync when you&apos;re back online.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Pill className="h-4 w-4" />}
          label="Today's doses"
          value={loading ? null : (stats?.total ?? 0)}
          tint="emerald"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Taken"
          value={loading ? null : (stats?.taken ?? 0)}
          tint="cyan"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Pending"
          value={loading ? null : (stats?.pending ?? 0)}
          tint="amber"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Adherence"
          value={loading ? null : stats?.total ? `${stats?.adherence ?? 0}%` : '—'}
          tint="violet"
        />
      </div>

      {/* Adherence progress - only show when there are reminders */}
      {stats?.total ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Today&apos;s adherence
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </Button>
                <span className="font-semibold text-primary">{stats?.adherence ?? 0}%</span>
              </div>
            </div>
            <Progress value={stats?.adherence ?? 0} className="h-2" />
          </CardContent>
        </Card>
      ) : !loading ? (
        <Card>
          <CardContent className="p-4 text-center text-muted-foreground">
            <Pill className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Add medications to start tracking adherence</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Reminders */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : reminders.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Pill className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No reminders yet</p>
            <p className="text-sm mt-1">Add a medication to start getting reminders.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.overdue.length > 0 && (
            <ReminderSection
              title="Overdue"
              tone="amber"
              reminders={grouped.overdue}
              updating={updating}
              onStatus={updateStatus}
            />
          )}
          {grouped.upcoming.length > 0 && (
            <ReminderSection
              title="Upcoming"
              tone="emerald"
              reminders={grouped.upcoming}
              updating={updating}
              onStatus={updateStatus}
            />
          )}
          {grouped.done.length > 0 && (
            <ReminderSection
              title="Completed"
              tone="muted"
              reminders={grouped.done}
              updating={updating}
              onStatus={updateStatus}
            />
          )}
        </div>
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
  tint: string;
}) {
  const cls = getColorClasses(tint);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${cls.bg} ${cls.text}`}
          >
            {icon}
          </span>
          <span className="font-medium truncate">{label}</span>
        </div>
        {value === null ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <div className={`text-2xl font-bold ${cls.text}`}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function ReminderSection({
  title,
  tone,
  reminders,
  updating,
  onStatus,
}: {
  title: string;
  tone: 'amber' | 'emerald' | 'muted';
  reminders: Reminder[];
  updating: string | null;
  onStatus: (r: Reminder, s: 'taken' | 'skipped') => void;
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'emerald'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${toneClass}`}>
        {title} <Badge variant="secondary">{reminders.length}</Badge>
      </h3>
      <ScrollArea className="max-h-[28rem]">
        <div className="space-y-2 pr-2">
          {reminders.map(r => (
            <ReminderRow key={r.id} reminder={r} updating={updating === r.id} onStatus={onStatus} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ReminderRow({
  reminder,
  updating,
  onStatus,
}: {
  reminder: Reminder;
  updating: boolean;
  onStatus: (r: Reminder, s: 'taken' | 'skipped') => void;
}) {
  const med = reminder.medication as Medication | undefined;
  const cls = getColorClasses(med?.color || 'emerald');
  const done = reminder.status !== 'pending';

  return (
    <Card
      className={`${done ? 'opacity-60' : ''} ${
        reminder.status === 'pending' && !isUpcoming(reminder.time)
          ? 'ring-1 ring-amber-500/30'
          : ''
      }`}
    >
      <CardContent className="p-3 sm:p-4 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full ${cls.bg}`}
        >
          {done ? (
            <CheckCircle2 className={`h-5 w-5 ${cls.text}`} />
          ) : (
            <span className={`h-3 w-3 rounded-full ${cls.dot}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold truncate ${done ? 'line-through' : ''}`}>
              {med?.name || 'Medication'}
            </span>
            <Badge variant="outline" className="text-xs">
              {med?.dosage}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3" />
            {formatTime(reminder.time)}
            {med?.instructions && <span className="hidden sm:inline">· {med.instructions}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!done && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={updating}
                onClick={() => onStatus(reminder, 'skipped')}
                title="Skip"
              >
                <SkipForward className="h-4 w-4" />
                <span className="sr-only">Skip</span>
              </Button>
              <Button
                size="sm"
                disabled={updating}
                onClick={() => onStatus(reminder, 'taken')}
                className="bg-primary"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Take</span>
              </Button>
            </>
          )}
          {done && (
            <Badge variant={reminder.status === 'taken' ? 'default' : 'secondary'}>
              {reminder.status === 'taken' ? 'Taken' : 'Skipped'}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
