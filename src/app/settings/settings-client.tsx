'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ErrorBoundary } from '@/components/kynthai/error-boundary';
import {
  ArrowLeft,
  User,
  Bell,
  Moon,
  Sun,
  Globe,
  Shield,
  Lock,
  Mail,
  Phone,
  Calendar,
  Save,
  Loader2,
  Download,
  Trash2,
  AlertTriangle,
  ChevronRight,
  Heart,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTheme } from 'next-themes';
import { useAppStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { KynthaiBrand } from '@/components/kynthai/logo';
import { PushNotificationToggle } from '@/components/kynthai/push-notification-toggle';

export default function SettingsClient() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { user, login, logout } = useAppStore();
  const language = useAppStore(s => s.language);
  const setLanguage = useAppStore(s => s.setLanguage);

  // Profile editing
  const [editName, setEditName] = React.useState(user?.name || '');
  const [editPhone, setEditPhone] = React.useState(user?.phone || '');
  const [editDob, setEditDob] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Password change
  const [showPasswordSection, setShowPasswordSection] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showCurrentPw, setShowCurrentPw] = React.useState(false);
  const [showNewPw, setShowNewPw] = React.useState(false);
  const [pwSaving, setPwSaving] = React.useState(false);

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = React.useState({
    reminders: true,
    labResults: true,
    emergency: true,
    insights: true,
    family: true,
  });

  // Consent
  const [consentFlags, setConsentFlags] = React.useState({
    consentAccepted: user?.consentAccepted ?? true,
    dataProcessingConsent: user?.dataProcessingConsent ?? true,
    aiTrainingConsent: user?.aiTrainingConsent ?? true,
  });

  // Delete account
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Data export
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    if (user) return;
    const timer = window.setTimeout(() => {
      if (!useAppStore.getState().user) router.replace('/login');
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [user, router]);

  if (!user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 pb-safe">
        <p className="text-sm text-muted-foreground">Loading your settings…</p>
      </div>
    );
  }

  const isDemo = !!user.isDemo;
  const initial = isDemo ? 'K' : (user.name?.[0] ?? 'U').toUpperCase();

  // ── Handlers ────────────────────────────────────────────────────────────

  async function handleSaveProfile() {
    if (!editName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      const { token: csrfToken } = await csrfRes.json();

      const res = await fetch('/api/user/account', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
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
      if (user) {
        login({
          id: user.id,
          email: user.email,
          name: editName.trim(),
          role: user.role,
          phone: editPhone.trim() || undefined,
          subscriptionTier: user.subscriptionTier,
          isDemo: user.isDemo,
          consentAccepted: user.consentAccepted,
          dataProcessingConsent: user.dataProcessingConsent,
          aiTrainingConsent: user.aiTrainingConsent,
        });
      }
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' });
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'All fields required', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 12) {
      toast({ title: 'Password must be at least 12 characters', variant: 'destructive' });
      return;
    }
    setPwSaving(true);
    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      const { token: csrfToken } = await csrfRes.json();

      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Password change failed');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordSection(false);
      toast({ title: 'Password updated', description: 'Your password has been changed.' });
    } catch (err) {
      toast({
        title: 'Failed to change password',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPwSaving(false);
    }
  }

  async function handleExportData() {
    setExporting(true);
    try {
      const res = await fetch('/api/user/data-export', { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kynthai-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Data exported', description: 'Your data has been downloaded.' });
    } catch (err) {
      toast({ title: 'Export failed', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      const { token: csrfToken } = await csrfRes.json();

      const res = await fetch('/api/user/account', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      logout();
      router.replace('/login');
      toast({ title: 'Account deleted', description: 'Your account has been permanently deleted.' });
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  async function handleNotifToggle(key: string, value: boolean) {
    const prev = notifPrefs;
    setNotifPrefs(p => ({ ...p, [key]: value }));
    try {
      const res = await fetch('/api/user/notification-prefs', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      setNotifPrefs(prev);
      toast({ title: 'Failed to save notification preference', variant: 'destructive' });
    }
  }

  async function handleConsentToggle(key: string, value: boolean) {
    // Core legal/data consent: confirm before withdraw
    if (
      !value &&
      (key === 'consentAccepted' || key === 'dataProcessingConsent') &&
      typeof window !== 'undefined' &&
      !window.confirm(
        'Turning this off may limit access to health features. Withdraw consent?',
      )
    ) {
      return;
    }
    const prev = consentFlags;
    setConsentFlags(p => ({ ...p, [key]: value }));
    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      const { token: csrfToken } = await csrfRes.json();
      const res = await fetch('/api/user/consent', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error('save failed');
      toast({ title: value ? 'Consent updated' : 'Consent withdrawn' });
    } catch {
      setConsentFlags(prev);
      toast({ title: 'Failed to save consent', variant: 'destructive' });
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    logout();
    router.replace('/login');
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-background pb-safe">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-4">
          <button onClick={() => router.back()} className="inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Settings</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-2xl font-bold text-white">
                {initial}
              </div>
              <div>
                <p className="font-semibold">{isDemo ? 'Guest' : user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <Badge variant="secondary" className="mt-1 capitalize">{user.role}</Badge>
              </div>
            </div>

            <Separator />

            {/* Edit Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your name" />
            </div>

            {/* Edit Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+15551234567" />
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth (optional)</Label>
              <Input id="dob" type="date" value={editDob} onChange={e => setEditDob(e.target.value)} />
            </div>

            <Button onClick={handleSaveProfile} disabled={saving} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4" /> Security
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showPasswordSection ? (
              <button onClick={() => setShowPasswordSection(true)} className="flex w-full items-center justify-between rounded-lg p-3 hover:bg-accent/40 transition-colors">
                <div className="flex items-center gap-3">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Change password</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <div className="relative">
                    <Input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowPasswordSection(false)} className="flex-1">Cancel</Button>
                  <Button onClick={handleChangePassword} disabled={pwSaving} className="flex-1">
                    {pwSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {pwSaving ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Moon className="h-4 w-4" /> Appearance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex min-h-14 items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {theme === 'dark' ? <Moon className="h-4 w-4 shrink-0 text-violet-500" /> : <Sun className="h-4 w-4 shrink-0 text-amber-500" />}
                <span className="text-sm font-medium">Dark mode</span>
              </div>
              <Switch checked={theme === 'dark'} onCheckedChange={c => setTheme(c ? 'dark' : 'light')} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-cyan-500" />
                <span className="text-sm font-medium">Language</span>
              </div>
              <Badge variant="outline">{language === 'en-US' ? 'English (US)' : language}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" /> Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">This device</p>
              <PushNotificationToggle />
            </div>
            {[
              { key: 'reminders', label: 'Medication reminders', desc: 'Take-your-med alerts' },
              { key: 'labResults', label: 'Lab results', desc: 'When results are ready' },
              { key: 'emergency', label: 'Emergency alerts', desc: 'SOS & critical updates' },
              { key: 'insights', label: 'AI insights', desc: 'Weekly health reports' },
              { key: 'family', label: 'Family updates', desc: 'Caretaker notifications' },
            ].map(item => (
              <div key={item.key} className="flex min-h-14 items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{item.label}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{item.desc}</p>
                </div>
                <Switch
                  checked={(notifPrefs as any)[item.key]}
                  onCheckedChange={c => handleNotifToggle(item.key, c)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Privacy & Consent */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" /> Privacy & Consent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { key: 'consentAccepted', label: 'Terms of Service', desc: 'Kynthai Terms & Privacy Policy' },
              { key: 'dataProcessingConsent', label: 'Data processing', desc: 'Store and process health data under US privacy' },
              { key: 'aiTrainingConsent', label: 'AI training data', desc: 'Allow de-identified data to improve AI' },
            ].map(item => (
              <div key={item.key} className="flex min-h-14 items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{item.label}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{item.desc}</p>
                </div>
                <Switch
                  checked={(consentFlags as any)[item.key]}
                  onCheckedChange={c => handleConsentToggle(item.key, c)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Data Operations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" /> Your Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button onClick={handleExportData} disabled={exporting} className="flex w-full items-center gap-3 rounded-lg p-3 hover:bg-accent/40 transition-colors">
              <Download className="h-4 w-4 text-cyan-500" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">{exporting ? 'Exporting...' : 'Export my data'}</p>
                <p className="text-xs text-muted-foreground">Download all your health data as JSON</p>
              </div>
            </button>
            <Separator />
            <button onClick={() => setDeleteOpen(true)} className="flex w-full items-center gap-3 rounded-lg p-3 hover:bg-destructive/5 transition-colors">
              <Trash2 className="h-4 w-4 text-rose-500" />
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-destructive">Delete my account</p>
                <p className="text-xs text-muted-foreground">Permanently erase all data</p>
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Logout */}
        <Button variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleLogout}>
          Log out
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-8">
          Kynthai v3 · Data encrypted in transit & at rest
        </p>
      </div>

      {/* Delete Account Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Delete account?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Yes, delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ErrorBoundary>
  );
}
