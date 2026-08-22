'use client';

import * as React from 'react';
import {
  Moon,
  Sun,
  Bell,
  Globe,
  Shield,
  LogOut,
  Crown,
  Mail,
  Phone,
  ChevronRight,
  Heart,
  Sparkles,
  Users,
  ArrowLeftRight,
  Stethoscope,
  Microscope,
  UserCircle,
  HeartPulse,
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { ResponsiveSheet } from '@/components/kynthai/responsive-sheet';
import { useAppStore, type AuthUser } from '@/lib/store';
import { apiFetch } from '@/lib/client-fetch';
import { ReferralDashboard } from '@/components/kynthai/referral-dashboard';
import { PushNotificationToggle } from '@/components/kynthai/push-notification-toggle';
import { HealthPulseRing } from '@/components/kynthai/health-pulse-ring';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ProfileHubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser;
  onLogout: () => void;
  onShowPricing: () => void;
  onShowPrivacy: () => void;
  /** Called when the user wants to switch to a different portal role. */
  onSwitchPortal?: () => void;
}

type TierInfo = {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  features: string[];
};

const TIER_INFO: Record<string, TierInfo> = {
  free: {
    name: 'Free',
    icon: Heart,
    tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    features: ['10 medications', '3 AI chats / day', 'Smart reminders'],
  },
  plus: {
    name: 'Plus',
    icon: Sparkles,
    tint: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    features: ['Unlimited meds', 'Unlimited AI', 'Drug checks', 'Insights'],
  },
  family_pro: {
    name: 'Family Pro',
    icon: Users,
    tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    features: ['Up to 4 members', 'Caretaker alerts', 'Priority support'],
  },
};

export function ProfileHub({
  open,
  onOpenChange,
  user,
  onLogout,
  onShowPricing,
  onShowPrivacy,
  onSwitchPortal,
}: ProfileHubProps) {
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  // B13 — Modal state for account deletion (replaces window.prompt)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [notifPrefs, setNotifPrefs] = React.useState({
    reminders: true,
    labResults: true,
    emergency: true,
    insights: true,
    family: true,
  });
  const language = useAppStore(s => s.language);
  const setLanguage = useAppStore(s => s.setLanguage);
  const isDemo = !!user.isDemo;
  const initial = isDemo ? 'K' : (user.name?.[0] ?? 'U').toUpperCase();
  const tier = user.subscriptionTier ?? 'free';
  const tierInfo: TierInfo = (TIER_INFO[tier] ?? TIER_INFO.free) as TierInfo;
  const TierIcon = tierInfo.icon;
  const userRole = user.role;
  const isAdmin = userRole === 'admin';
  const publicPortals = ['caretaker', 'patient', 'doctor', 'lab'];
  const switchablePortals = isAdmin ? [...publicPortals, 'admin'] : publicPortals;
  const switchLabel = switchablePortals
    .map(id => {
      const map: Record<string, string> = {
        caretaker: 'Family',
        patient: 'Patient',
        doctor: 'Doctor',
        lab: 'Lab',
        admin: 'Admin',
      };
      return map[id];
    })
    .join(' · ');

  const [healthScore, setHealthScore] = React.useState<number | null>(null);
  const [scoreLoading, setScoreLoading] = React.useState(true);

  // ── Edit Profile state ─────────────────────────────────────────────────
  const [editingProfile, setEditingProfile] = React.useState(false);
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [editName, setEditName] = React.useState(user.name || '');
  const [editPhone, setEditPhone] = React.useState(user.phone || '');
  const [editDob, setEditDob] = React.useState('');

  // ── Data Operations handlers ──────────────────────────────────────────
  const [exporting, setExporting] = React.useState(false);

  async function handleSaveProfile(): Promise<void> {
    if (!editName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setProfileSaving(true);
    try {
      const res = await fetch('/api/user/account', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          dateOfBirth: editDob || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Update failed');
      }
      // Update local store
      const { login } = useAppStore.getState();
      login({ ...user, name: editName.trim(), phone: editPhone.trim() || undefined });
      setEditingProfile(false);
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' });
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleExportData(): Promise<void> {
    setExporting(true);
    try {
      const res = await fetch('/api/user/data-export', {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kynthai-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Failed to export data.',
        variant: 'destructive',
      });
    }
  }

  // B13 — Opens the React modal; actual API call happens after dialog confirmation
  function handleDeleteAccountClick(): void {
    setDeleteConfirmOpen(true);
  }

  async function confirmDeleteAccount(): Promise<void> {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    try {
      // ponytail: apiFetch() attaches the real CSRF token (the previous
      // hardcoded '' empty header blocked the global interceptor → 403 every
      // time → account deletion silently never worked).
      const res = await apiFetch('/api/user/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: 'Deletion failed',
          description: data.error || 'Failed to delete account.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Account deleted',
        description: 'Your account and all data have been permanently deleted.',
      });
      // Full reload after account deletion to clear all React state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/';
    } catch {
      toast({
        title: 'Network error',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }

  React.useEffect(() => {
    const fetchScore = async () => {
      try {
        const res = await fetch('/api/health/score?days=1');
        if (res.ok) {
          const data = await res.json();
          if (data.scores && data.scores.length > 0) {
            setHealthScore(data.scores[data.scores.length - 1].score);
          }
        }
      } catch {
        /* ignore */
      }
      setScoreLoading(false);
    };
    fetchScore();
  }, [user.id]);

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader className="px-5 pt-3 pb-3">
        <SheetTitle
          className={cn('text-sm text-muted-foreground', isMobile ? 'text-center' : 'text-left')}
        >
          Profile &amp; Settings
        </SheetTitle>
      </SheetHeader>

      {/* Identity card */}
      <div className="px-5">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 p-5 text-white shadow-lg shadow-emerald-600/20">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-4 ring-white/30">
              <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{isDemo ? 'Guest' : user.name}</h2>
              <div className="mt-1 flex items-center gap-2">
                <Badge className="bg-white/20 text-white border-0 capitalize">{user.role}</Badge>
                <Badge className="bg-white/20 text-white border-0">{tierInfo.name}</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Health Score Ring */}
      <div className="px-5 mt-4">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Overall Health Score
          </p>
          <div className="flex items-center gap-4">
            {scoreLoading ? (
              <div className="h-[80px] w-[80px] rounded-full bg-muted/50 animate-pulse" />
            ) : healthScore !== null ? (
              <HealthPulseRing score={healthScore} size={80} showLabel={false} />
            ) : (
              <div className="h-[80px] w-[80px] rounded-full bg-muted/30 flex items-center justify-center">
                <HeartPulse className="h-6 w-6 text-muted-foreground/50" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">
                {scoreLoading
                  ? 'Loading...'
                  : healthScore !== null
                    ? `${healthScore}/100`
                    : 'No data yet'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {healthScore !== null && healthScore >= 80
                  ? 'Excellent health metrics'
                  : healthScore !== null && healthScore >= 60
                    ? 'Good progress'
                    : 'Start logging to build your score'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="px-5 mt-4 space-y-2">
        <ContactRow icon={Mail} label="Email" value={user.email} />
        {user.phone && <ContactRow icon={Phone} label="Phone" value={user.phone} />}
        <button
          onClick={() => {
            setEditName(user.name || '');
            setEditPhone(user.phone || '');
            setEditingProfile(!editingProfile);
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3 hover:bg-accent/40 transition-colors"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <UserCircle className="h-4 w-4" />
          </span>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium">{editingProfile ? 'Cancel editing' : 'Edit profile'}</p>
            <p className="text-[11px] text-muted-foreground">
              {editingProfile ? 'Discard changes' : 'Update your name, phone, and date of birth'}
            </p>
          </div>
          <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', editingProfile && 'rotate-90')} />
        </button>
      </div>

      {/* Edit Profile Form */}
      {editingProfile && (
        <div className="px-5 mt-3">
          <Card className="border-blue-500/20">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name" className="text-xs font-medium">Full name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Your name"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone" className="text-xs font-medium">Phone (optional)</Label>
                <Input
                  id="edit-phone"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="+15551234567"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-dob" className="text-xs font-medium">Date of birth (optional)</Label>
                <Input
                  id="edit-dob"
                  type="date"
                  value={editDob}
                  onChange={e => setEditDob(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
              >
                {profileSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {profileSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subscription */}
      <div className="px-5 mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Subscription
        </h3>
        <Card className="border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  tierInfo.tint
                )}
              >
                <TierIcon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-sm">{tierInfo.name} plan</p>
                <p className="text-xs text-muted-foreground">
                  {tierInfo.features.slice(0, 2).join(' · ')}
                </p>
              </div>
              {tier === 'free' && (
                <Button
                  size="sm"
                  onClick={onShowPricing}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                >
                  <Crown className="h-3.5 w-3.5" />
                  Plans
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Settings */}
      <div className="px-5 mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Settings
        </h3>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            <SettingRow
              icon={theme === 'dark' ? Moon : Sun}
              label="Dark mode"
              tint="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            >
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={c => setTheme(c ? 'dark' : 'light')}
              />
            </SettingRow>
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Bell className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Choose what you get notified about
                  </p>
                </div>
              </div>
              <div className="ml-12 space-y-1">
                {(
                  [
                    {
                      key: 'reminders',
                      label: 'Medication reminders',
                      desc: 'Take-your-med alerts',
                    },
                    { key: 'labResults', label: 'Lab results', desc: 'When results are ready' },
                    { key: 'emergency', label: 'Family Alert', desc: 'SOS & critical updates' },
                    { key: 'insights', label: 'AI insights', desc: 'Weekly health reports' },
                    { key: 'family', label: 'Family updates', desc: 'Caretaker notifications' },
                  ] as const
                ).map(item => (
                  <div
                    key={item.key}
                    className="flex min-h-14 items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{item.label}</p>
                      <p className="text-xs text-muted-foreground leading-snug">{item.desc}</p>
                    </div>
                    <Switch
                      checked={notifPrefs[item.key]}
                      onCheckedChange={async c => {
                        setNotifPrefs(p => ({ ...p, [item.key]: c }));
                        try {
                          await fetch('/api/user/notification-prefs', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ [item.key]: c }),
                          });
                        } catch {
                          toast({ title: 'Failed to save', variant: 'destructive' });
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <SettingRow
              icon={Globe}
              label="Language"
              tint="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
              value={language === 'en-US' ? 'English (US)' : 'English (US)'}
            >
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={language === 'en-US' ? 'default' : 'outline'}
                  className="h-6 text-xs px-2"
                  onClick={() => setLanguage('en-US')}
                >
                  EN
                </Button>
              </div>
            </SettingRow>
          </CardContent>
        </Card>
      </div>

      {/* ── Consent Manager ─────────────────────────────────────────────── */}
      <ConsentManager
        consentFlags={{
          consentAccepted: user.consentAccepted ?? true,
          dataProcessingConsent: user.dataProcessingConsent ?? true,
          aiTrainingConsent: user.aiTrainingConsent ?? true,
        }}
      />

      {/* ── Data Operations ─────────────────────────────────────────────── */}
      <div className="px-5 mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Your Data
        </h3>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {/* Export Data */}
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{exporting ? 'Exporting…' : 'Export my data'}</p>
                <p className="text-xs text-muted-foreground">
                  Download all your health data as a JSON file
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Delete Account */}
            <button
              onClick={handleDeleteAccountClick}
              disabled={deleting}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-destructive/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">
                  {deleting ? 'Deleting…' : 'Delete my account'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Permanently erase all data — this cannot be undone
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Privacy + Switch portal */}
      <div className="px-5 mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Account
        </h3>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            {onSwitchPortal && (
              <button
                onClick={onSwitchPortal}
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <ArrowLeftRight className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Switch portal</p>
                  <p className="text-xs text-muted-foreground">{switchLabel}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={onShowPrivacy}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Shield className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">Privacy &amp; Security</p>
                <p className="text-xs text-muted-foreground">US privacy · data export</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Notifications (push) */}
      <div className="px-5 mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Notifications
        </h3>
        <Card>
          <CardContent className="p-0 divide-y divide-border/60">
            <PushNotificationToggle />
          </CardContent>
        </Card>
      </div>

      {/* Legal — users already consented at signup; one clean link. */}
      <div className="px-5 mt-4">
        <a
          href="/legal"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Legal & Privacy
        </a>
        <p suppressHydrationWarning className="mt-2 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Kynthai™. All rights reserved.
        </p>
      </div>

      {/* Referral Dashboard */}
      <div className="px-5 mt-5">
        <ReferralDashboard />
      </div>

      {/* Logout */}
      <div className="px-5 mt-5 pb-8">
        <Separator className="mb-4" />
        <Button
          variant="outline"
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Kynthai v3 · Data encrypted in transit &amp; at rest
        </p>
      </div>

      {/* B13 — Account deletion confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Permanently delete account?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  This will <strong>permanently delete your account and ALL associated data</strong>
                  . This includes medications, reminders, health records, and AI chat history.
                </p>
                <p>
                  This action <strong>cannot be undone</strong>. A 7-day cooldown applies before you
                  can create a new account.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteAccount} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Yes, permanently delete my account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResponsiveSheet>
  );
}

// ── ConsentManager ──────────────────────────────────────────────────────────
// Renders three toggles for the user consent flags. Each toggle calls
// PATCH /api/user/consent, reverts on failure, and shows a saving spinner.
//
// Gracefully disables AI features: when aiTrainingConsent=false a banner
// warns that AI is unavailable (server-side blocks AI endpoints anyway, but
// this avoids confusing error messages on the client).
interface ConsentManagerProps {
  consentFlags: {
    consentAccepted: boolean;
    dataProcessingConsent: boolean;
    aiTrainingConsent: boolean;
  };
}

const CONSENT_ITEMS: {
  key: keyof ConsentManagerProps['consentFlags'];
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  disabled?: boolean;
}[] = [
  {
    key: 'aiTrainingConsent',
    label: 'AI training data',
    desc: 'Allow de-identified data to improve AI features. Revoke any time.',
    icon: Sparkles,
    tint: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
];

function ConsentManager({ consentFlags }: ConsentManagerProps) {
  // Refs for re-rendering via fetch to sync with server state.
  const [localFlags, setLocalFlags] = React.useState(consentFlags);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  // Keep local state in sync when user object changes externally.
  React.useEffect(() => {
    setLocalFlags(consentFlags);
  }, [
    consentFlags.consentAccepted,
    consentFlags.dataProcessingConsent,
    consentFlags.aiTrainingConsent,
  ]);

  async function handleToggle(key: keyof typeof localFlags, next: boolean) {
    setLocalFlags(prev => ({ ...prev, [key]: next }));
    setSavingKey(key);
    try {
      const res = await fetch('/api/user/consent', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Update failed');
      }
      const data = await res.json().catch(() => ({}));
      if (data.consentAccepted !== undefined)
        setLocalFlags(p => ({ ...p, consentAccepted: data.consentAccepted }));
      if (data.dataProcessingConsent !== undefined)
        setLocalFlags(p => ({ ...p, dataProcessingConsent: data.dataProcessingConsent }));
      if (data.aiTrainingConsent !== undefined)
        setLocalFlags(p => ({ ...p, aiTrainingConsent: data.aiTrainingConsent }));
    } catch {
      // Revert toggle on error.
      setLocalFlags(prev => ({ ...prev, [key]: !next }));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="px-5 mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        AI Preferences
      </h3>
      <Card>
        <CardContent className="p-0 divide-y divide-border/60">
          {/* AI disabled banner */}
          {!localFlags.aiTrainingConsent && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/5 border-b border-border/60">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">AI features are currently disabled.</strong>{' '}
                Re-enable the &ldquo;AI training data&rdquo; consent below to access AI-powered
                insights, chat, and health recommendations.
              </p>
            </div>
          )}

          {CONSENT_ITEMS.map(item => {
            const Icon = item.icon;
            const checked = localFlags[item.key];
            const isSaving = savingKey === item.key;
            return (
              <div key={item.key} className="flex items-center gap-3 p-4">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    item.tint
                  )}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={c => handleToggle(item.key, c === true)}
                  disabled={isSaving}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Withdrawing any consent is immediate and recorded in the audit log.
      </p>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function SettingRow({
  icon: Icon,
  label,
  tint,
  value,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tint: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 p-4">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tint)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
      </div>
      {value && (
        <p className="max-w-[40%] truncate text-xs text-muted-foreground shrink-0">{value}</p>
      )}
      <div className="shrink-0">{children}</div>
    </div>
  );
}
