'use client'

import * as React from 'react'
import {
  Bell,
  CheckCheck,
  X,
  Pill,
  Calendar,
  Trophy,
  Users,
  Info,
  AlertTriangle,
  Siren,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { SosToast } from './sos-toast'

type NotificationType = 'reminder' | 'alert' | 'achievement' | 'family' | 'system' | string

interface Notification {
  id: string
  channel: string
  type: NotificationType
  title: string
  body: string
  status: string
  createdAt: string
  read: boolean
}

interface NotificationCenterProps {
  userId: string
  isDemo: boolean
  role?: string
  onNavigate?: (tab: string) => void
}

function normalizeType(t: string): NotificationType {
  const x = (t || 'system').toLowerCase()
  if (x.includes('remind') || x === 'medication') return 'reminder'
  if (x.includes('sos') || x.includes('emerg') || x === 'alert' || x === 'escalation') return 'alert'
  if (x.includes('achieve') || x.includes('streak')) return 'achievement'
  if (x.includes('family') || x.includes('invite') || x.includes('care')) return 'family'
  if (x.includes('appoint') || x.includes('consult')) return 'appointment'
  if (x.includes('lab') || x.includes('booking') || x.includes('result')) return 'lab'
  return x || 'system'
}

export function NotificationCenter({ userId, isDemo, role, onNavigate }: NotificationCenterProps) {
  const [open, setOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [loading, setLoading] = React.useState(true)
  const [marking, setMarking] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const [sosAlert, setSosAlert] = React.useState<Notification | null>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  const loadNotifications = React.useCallback(async () => {
    setLoading(true)
    if (isDemo) {
      const now = Date.now()
      const r = (role || 'patient').toLowerCase()
      if (r === 'doctor') {
        setNotifications([
          { id: 'd1', channel: 'app', type: 'appointment', title: 'New consultation request', body: 'Alex Rivera · Video · Accept or Decline', status: 'sent', createdAt: new Date(now).toISOString(), read: false },
          { id: 'd2', channel: 'app', type: 'appointment', title: 'Patient cancelled', body: 'Jordan Lee cancelled tomorrow 10:00 AM', status: 'sent', createdAt: new Date(now - 3600000).toISOString(), read: false },
          { id: 'd3', channel: 'app', type: 'system', title: 'Welcome, Doctor', body: 'New consult requests appear here and as device alerts when enabled.', status: 'sent', createdAt: new Date(now - 7200000).toISOString(), read: true },
        ])
      } else if (r === 'lab') {
        setNotifications([
          { id: 'l1', channel: 'app', type: 'lab', title: 'New lab booking', body: 'CBC + Lipid panel · Confirm slot', status: 'sent', createdAt: new Date(now).toISOString(), read: false },
          { id: 'l2', channel: 'app', type: 'lab', title: 'Results ready to share', body: 'Patient waiting on metabolic panel', status: 'sent', createdAt: new Date(now - 3600000).toISOString(), read: false },
        ])
      } else if (r === 'caretaker' || r === 'family') {
        setNotifications([
          { id: 'c1', channel: 'app', type: 'family', title: 'Missed dose alert', body: 'Robert · Atorvastatin 10mg · 8:00 AM', status: 'sent', createdAt: new Date(now).toISOString(), read: false },
          { id: 'c2', channel: 'app', type: 'reminder', title: 'Upcoming: Emma', body: 'Vitamin D3 · 6:00 PM', status: 'sent', createdAt: new Date(now - 1800000).toISOString(), read: false },
          { id: 'c3', channel: 'app', type: 'family', title: 'Dose taken', body: 'Noah marked morning dose as taken', status: 'sent', createdAt: new Date(now - 7200000).toISOString(), read: true },
        ])
      } else {
        setNotifications([
          { id: '1', channel: 'app', type: 'reminder', title: 'Time for Metformin', body: 'Take your 500mg dose', status: 'sent', createdAt: new Date(now).toISOString(), read: false },
          { id: '2', channel: 'app', type: 'appointment', title: 'Consultation confirmed', body: 'Dr. Sharma accepted your request', status: 'sent', createdAt: new Date(now - 3600000).toISOString(), read: false },
          { id: '3', channel: 'app', type: 'lab', title: 'Lab results ready', body: 'Open Lab to view your report', status: 'sent', createdAt: new Date(now - 7200000).toISOString(), read: true },
        ])
      }
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/notifications', {
        cache: 'no-store',
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        const list = (data.notifications ?? []).map((n: Notification) => ({
          ...n,
          type: normalizeType(String(n.type)),
          title: n.title || 'Notification',
          body: n.body || '',
          read: n.read === true || n.status === 'read',
        }))
        setNotifications(list)
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [isDemo, role])

  React.useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  React.useEffect(() => {
    if (isDemo) return
    const interval = setInterval(() => {
      loadNotifications()
    }, 15000)
    return () => clearInterval(interval)
  }, [loadNotifications, isDemo])

  React.useEffect(() => {
    const unreadSos = notifications.find(
      (n) => n.type === 'alert' && !n.read && n.title?.toLowerCase().includes('sos'),
    )
    if (unreadSos) setSosAlert(unreadSos)
  }, [notifications])

  const markAllRead = async () => {
    setMarking(true)
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (isDemo) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setMarking(false)
      return
    }
    if (unreadIds.length === 0) {
      setMarking(false)
      return
    }
    try {
      // CSRF via shared interceptor if present; also mint token explicitly
      let csrf: string | undefined
      try {
        const c = await fetch('/api/auth/csrf', { credentials: 'include' }).then((r) => r.json())
        csrf = c.token
      } catch {
        /* ignore */
      }
      await fetch('/api/notifications', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({ notificationIds: unreadIds }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      /* silent */
    } finally {
      setMarking(false)
    }
  }

  const handleClick = (notif: Notification) => {
    if (onNavigate) {
      if (notif.type === 'reminder') onNavigate('meds')
      else if (notif.type === 'achievement' || notif.type === 'family') onNavigate('care')
      else if (notif.type === 'alert') onNavigate('home')
    }
    setOpen(false)
  }

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const iconFor = (type: NotificationType) => {
    switch (type) {
      case 'reminder':
        return Pill
      case 'appointment':
        return Calendar
      case 'lab':
        return Info
      case 'alert':
        return AlertTriangle
      case 'achievement':
        return Trophy
      case 'family':
        return Users
      default:
        return Info
    }
  }

  return (
    <>
      {sosAlert && (
        <SosToast
          alert={{
            memberName: sosAlert.title || 'SOS',
            notes: sosAlert.body,
            timestamp: sosAlert.createdAt,
          }}
          onDismiss={() => setSosAlert(null)}
          onNavigate={onNavigate}
        />
      )}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o)
            if (!open) loadNotifications()
          }}
          className="relative flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/10"
            >
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <p className="text-sm font-semibold">Notifications</p>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={marking}
                      onClick={markAllRead}
                      className="h-9 gap-1 text-xs"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <ScrollArea className="h-80">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No notifications yet</p>
                    <p className="text-xs text-muted-foreground">
                      Reminders and family alerts will appear here.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {notifications.slice(0, 30).map((notif) => {
                      const Icon = iconFor(notif.type)
                      return (
                        <li key={notif.id}>
                          <button
                            type="button"
                            onClick={() => handleClick(notif)}
                            className={cn(
                              'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                              !notif.read && 'bg-emerald-500/5',
                            )}
                          >
                            <span
                              className={cn(
                                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                                notif.type === 'alert'
                                  ? 'bg-rose-500/10 text-rose-600'
                                  : 'bg-emerald-500/10 text-emerald-600',
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium leading-snug">{notif.title}</span>
                                {!notif.read && (
                                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                                )}
                              </span>
                              {notif.body && (
                                <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                                  {notif.body}
                                </span>
                              )}
                              <span className="mt-1 block text-[10px] text-muted-foreground">
                                {new Date(notif.createdAt).toLocaleString()}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
