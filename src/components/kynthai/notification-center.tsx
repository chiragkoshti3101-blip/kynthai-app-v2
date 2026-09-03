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
import { safeNotificationPreview } from '@/lib/notification-privacy'
import { getDemoNotifications } from '@/lib/demo-notifications'

type NotificationType = 'reminder' | 'alert' | 'achievement' | 'family' | 'system' | string

interface Notification {
  id: string
  channel: string
  type: NotificationType
  title: string
  body: string
  status: string
  createdAt: string
  dedupeKey?: string | null
  read: boolean
  isEmergency?: boolean
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

function sanitizeNotification(notification: Notification): Notification {
  const safe = safeNotificationPreview(notification)
  return {
    ...notification,
    type: normalizeType(String(notification.type)),
    title: safe.title,
    body: safe.body,
    isEmergency: safe.isEmergency,
  }
}

const DEMO_READ_STORAGE_PREFIX = 'kynthai.demo.notifications.read.v2'

function demoReadStorageKey(userId: string, role?: string): string {
  return `${DEMO_READ_STORAGE_PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(role || 'patient')}`
}

function readDemoNotificationIds(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) || '[]')
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [],
    )
  } catch {
    return new Set()
  }
}

function persistDemoNotificationIds(key: string, ids: string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) return
  try {
    const all = new Set(readDemoNotificationIds(key))
    ids.forEach((id) => all.add(id))
    window.localStorage.setItem(key, JSON.stringify(Array.from(all)))
  } catch {
    /* best-effort; the current view still updates */
  }
}

export function NotificationCenter({ userId, isDemo, role, onNavigate }: NotificationCenterProps) {
  const [open, setOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [loading, setLoading] = React.useState(true)
  const [marking, setMarking] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [alarmActive, setAlarmActive] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const [sosAlert, setSosAlert] = React.useState<Notification | null>(null)
  const demoReadKey = demoReadStorageKey(userId, role)

  const unreadCount = notifications.filter((n) => !n.read).length

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const update = (event?: Event) => {
      const activeFromEvent = (event as CustomEvent<{ active?: unknown }> | undefined)?.detail?.active
      const active = typeof activeFromEvent === 'boolean'
        ? activeFromEvent
        : document.documentElement.dataset.kynthaiAlarmActive === 'true'
      setAlarmActive(active)
      if (active) setOpen(false)
    }
    update()
    window.addEventListener('kynthai:alarm-state', update)
    return () => window.removeEventListener('kynthai:alarm-state', update)
  }, [])

  const persistRead = React.useCallback(async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return
    let csrf: string | undefined
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' })
      const csrfData = await csrfResponse.json().catch(() => ({})) as { token?: unknown }
      if (typeof csrfData.token === 'string') csrf = csrfData.token
    } catch {
      /* the API will return a visible error if CSRF is required */
    }
    const response = await fetch('/api/notifications', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ notificationIds: ids }),
    })
    if (!response.ok) throw new Error('notification read update failed')
  }, [])

  const loadNotifications = React.useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    if (isDemo) {
      const readIds = readDemoNotificationIds(demoReadKey)
      setNotifications(
        getDemoNotifications(role)
          .map(sanitizeNotification)
          .map((notification) => readIds.has(notification.id) ? { ...notification, read: true } : notification),
      )
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/notifications', {
        cache: 'no-store',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('notification list failed')
      const data = await res.json()
      if (!Array.isArray(data.notifications)) throw new Error('invalid notification list')
      const list = data.notifications.map((n: Notification) => ({
        ...n,
        type: normalizeType(String(n.type)),
        title: n.title || 'Notification',
        body: n.body || '',
        read: n.read === true || n.status === 'read',
      }))
      setNotifications(list)
    } catch {
      setErrorMessage('Notifications are temporarily unavailable. Try again.')
    } finally {
      setLoading(false)
    }
  }, [demoReadKey, isDemo, role])

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
      (n) => n.type === 'alert' && !n.read && (n.isEmergency || /sos/i.test(`${n.title} ${n.body}`)),
    )
    setSosAlert(unreadSos || null)
  }, [notifications])

  const markAllRead = async () => {
    setMarking(true)
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) {
      setMarking(false)
      return
    }
    try {
      if (isDemo) {
        persistDemoNotificationIds(demoReadKey, unreadIds)
      } else {
        await persistRead(unreadIds)
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setErrorMessage(null)
    } catch {
      setErrorMessage('Could not mark notifications as read. Try again.')
    } finally {
      setMarking(false)
    }
  }

  const handleClick = async (notif: Notification) => {
    setErrorMessage(null)
    if (!notif.read) {
      setMarking(true)
      try {
        if (isDemo) {
          persistDemoNotificationIds(demoReadKey, [notif.id])
        } else {
          await persistRead([notif.id])
        }
        setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n))
      } catch {
        setErrorMessage('Could not mark this notification as read. Try again.')
        setMarking(false)
        return
      }
      setMarking(false)
    }
    if (onNavigate) {
      if (notif.type === 'reminder') onNavigate(role === 'lab' ? 'bookings' : 'meds')
      else if (notif.type === 'appointment') onNavigate(role === 'doctor' ? 'appointments' : 'home')
      else if (notif.type === 'lab') {
        const isResult = /result|report/i.test(`${notif.title} ${notif.body}`)
        onNavigate(role === 'lab' ? (isResult ? 'results' : 'bookings') : role === 'patient' ? 'lab' : 'care')
      }
      else if (notif.type === 'achievement' || notif.type === 'family') onNavigate('care')
      else if (notif.type === 'alert') onNavigate(role === 'admin' ? 'overview' : 'home')
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
            if (alarmActive) return
            setOpen((o) => !o)
            if (!open) loadNotifications()
          }}
          disabled={alarmActive}
          className="relative flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={alarmActive
            ? 'Notifications unavailable while medication alarm is active'
            : unreadCount
              ? `${unreadCount} unread notifications`
              : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <AnimatePresence>
          {open && !alarmActive && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-x-2 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-50 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]"
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
              {errorMessage && (
                <div role="status" className="border-b border-rose-500/20 bg-rose-500/5 px-4 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {errorMessage}
                </div>
              )}
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
