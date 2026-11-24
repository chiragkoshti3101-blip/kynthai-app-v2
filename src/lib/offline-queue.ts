/**
 * Offline Action Queue — lightweight offline support for Kynthai.
 *
 * Stores failed API mutations in localStorage and auto-syncs when
 * connectivity returns. No service worker, no IndexedDB — just
 * localStorage + event listeners.
 *
 * Roles supported: patient, caretaker, doctor, lab
 */

// ── Types ──────────────────────────────────────────────────────────

export interface QueuedAction {
  id: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
  headers?: Record<string, string>
  role: string
  timestamp: number
  retries: number
}

interface OfflineState {
  isOnline: boolean
  pendingCount: number
  isSyncing: boolean
}

// ── Storage Keys ───────────────────────────────────────────────────

const QUEUE_KEY = 'kynthai_offline_queue'
const CACHE_PREFIX = 'kynthai_cache_'
const MAX_QUEUE = 50
const MAX_RETRIES = 3
const SYNC_INTERVAL = 30_000 // 30s

// ── Helpers ────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedAction[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)))
  } catch {
    // localStorage full — clear oldest entries
    const trimmed = queue.slice(-20)
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed)) } catch { /* ignore */ }
  }
}

function getCached<T>(key: string, ttlMs = 300_000): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Cache expires after ttlMs (5 minutes by default).
    if (Date.now() - parsed.cachedAt > ttlMs) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return parsed.data as T
  } catch {
    return null
  }
}

function setCached<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() }))
  } catch { /* ignore */ }
}

// ── Queue Operations ───────────────────────────────────────────────

export function queueAction(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>): QueuedAction {
  const entry: QueuedAction = {
    ...action,
    id: generateId(),
    timestamp: Date.now(),
    retries: 0,
  }
  const queue = getQueue()
  queue.push(entry)
  saveQueue(queue)
  return entry
}

export function getPendingCount(): number {
  return getQueue().length
}

export function removeQueuedAction(id: string): void {
  const queue = getQueue().filter((a) => a.id !== id)
  saveQueue(queue)
}

// ── Sync Engine ────────────────────────────────────────────────────

/**
 * How a replayed mutation's HTTP status should be handled.
 *
 * A 409/412 means the server state moved on while we were offline (the slot
 * was taken, the record changed). Retrying the same stale payload can never
 * succeed and would loop forever, so it is treated as a terminal *conflict*:
 * dropped from the queue and surfaced to the UI instead.
 */
export type SyncOutcome = 'ok' | 'conflict' | 'retry'

export function classifySyncResponse(status: number): SyncOutcome {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 409 || status === 412) return 'conflict'
  return 'retry'
}

const MAX_CONFLICTS_KEPT = 10
let recentConflicts: Array<{ url: string; method: string; status: number; at: number }> = []

export function getRecentConflicts() {
  return [...recentConflicts]
}

export function clearRecentConflicts(): void {
  recentConflicts = []
}

export async function syncQueue(): Promise<{ synced: number; failed: number; conflicts: number }> {
  const queue = getQueue()
  if (queue.length === 0) return { synced: 0, failed: 0, conflicts: 0 }

  // Every replayed mutation must carry a fresh CSRF token or the server
  // rejects it with 403 (token lives in a cookie set by GET /api/auth/csrf,
  // so a stored header would be stale). Fetch the token once per batch; if
  // it fails we're still offline — leave the queue untouched, no retry burn.
  let csrfToken: string | null = null
  try {
    const csrfRes = await fetch('/api/auth/csrf', { cache: 'no-store' })
    if (csrfRes.ok) {
      const csrfBody = await csrfRes.json().catch(() => null)
      csrfToken = (csrfBody as { token?: string } | null)?.token ?? null
    }
  } catch {
    // Offline still — keep queue as-is.
  }
  if (!csrfToken) return { synced: 0, failed: 0, conflicts: 0 }

  let synced = 0
  let failed = 0
  let conflicts = 0
  const remaining: QueuedAction[] = []

  for (const action of queue) {
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          // Fresh token wins over anything a queued action may have stored.
          ...(action.headers ?? {}),
          'X-CSRF-Token': csrfToken,
        },
        body: action.body ? JSON.stringify(action.body) : undefined,
        // Use no-cache to ensure we hit the server
        cache: 'no-store',
      })

      const outcome = classifySyncResponse(res.status)
      if (outcome === 'ok') {
        synced++
      } else if (outcome === 'conflict') {
        // Stale payload — drop it and record the conflict for the UI.
        conflicts++
        recentConflicts = [
          ...recentConflicts.slice(-(MAX_CONFLICTS_KEPT - 1)),
          { url: action.url, method: action.method, status: res.status, at: Date.now() },
        ]
      } else {
        action.retries++
        if (action.retries < MAX_RETRIES) {
          remaining.push(action)
        } else {
          failed++
        }
      }
    } catch {
      action.retries++
      if (action.retries < MAX_RETRIES) {
        remaining.push(action)
      } else {
        failed++
      }
    }
  }

  saveQueue(remaining)
  return { synced, failed, conflicts }
}

// ── Role-specific cache helpers ────────────────────────────────────

export function cachePatientData(key: string, data: unknown): void {
  setCached(`patient_${key}`, data)
}

export function getCachedPatientData<T>(key: string, ttlMs?: number): T | null {
  return getCached<T>(`patient_${key}`, ttlMs)
}

export function cacheCaretakerData(key: string, data: unknown): void {
  setCached(`caretaker_${key}`, data)
}

export function getCachedCaretakerData<T>(key: string): T | null {
  return getCached<T>(`caretaker_${key}`)
}

export function cacheDoctorData(key: string, data: unknown): void {
  setCached(`doctor_${key}`, data)
}

export function getCachedDoctorData<T>(key: string): T | null {
  return getCached<T>(`doctor_${key}`)
}

export function cacheLabData(key: string, data: unknown): void {
  setCached(`lab_${key}`, data)
}

export function getCachedLabData<T>(key: string): T | null {
  return getCached<T>(`lab_${key}`)
}

// ── Connectivity Listener ─────────────────────────────────────────

type ConnectivityCallback = (state: OfflineState) => void

const listeners = new Set<ConnectivityCallback>()
let currentState: OfflineState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pendingCount: getPendingCount(),
  isSyncing: false,
}

function notifyListeners(): void {
  currentState.pendingCount = getPendingCount()
  listeners.forEach((cb) => cb({ ...currentState }))
}

export function onConnectivityChange(callback: ConnectivityCallback): () => void {
  listeners.add(callback)
  callback({ ...currentState })
  return () => { listeners.delete(callback) }
}

// Auto-sync when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    currentState.isOnline = true
    currentState.isSyncing = true
    notifyListeners()
    try {
      await syncQueue()
    } finally {
      currentState.isSyncing = false
      notifyListeners()
    }
  })

  window.addEventListener('offline', () => {
    currentState.isOnline = false
    notifyListeners()
  })

  // Periodic sync while online
  setInterval(async () => {
    if (currentState.isOnline && getPendingCount() > 0) {
      currentState.isSyncing = true
      notifyListeners()
      try {
        await syncQueue()
      } finally {
        currentState.isSyncing = false
        notifyListeners()
      }
    }
  }, SYNC_INTERVAL)
}

// ── Utilities ──────────────────────────────────────────────────────

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY)
}

export function getQueueActions(): QueuedAction[] {
  return getQueue()
}

// ── Offline-aware fetch ────────────────────────────────────────────

export async function offlineFetch(
  url: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    role: string
    cacheKey?: string
    cacheData?: unknown
  }
): Promise<{ ok: boolean; queued?: boolean; actionId?: string }> {
  const { method = 'GET', body, headers = {}, role, cacheKey, cacheData } = options

  // Cache data for offline reads
  if (cacheKey && cacheData && method === 'GET') {
    switch (role) {
      case 'patient': cachePatientData(cacheKey, cacheData); break
      case 'caretaker': cacheCaretakerData(cacheKey, cacheData); break
      case 'doctor': cacheDoctorData(cacheKey, cacheData); break
      case 'lab': cacheLabData(cacheKey, cacheData); break
    }
  }

  // If online, try the request
  if (isOnline()) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      })
      if (res.ok) return { ok: true }
    } catch {
      // Fall through to queue
    }
  }

  // If offline or request failed, queue mutations
  if (method !== 'GET') {
    const entry = queueAction({
      method: method as QueuedAction['method'],
      url,
      body,
      headers: { ...headers, 'X-Queued-Offline': 'true' },
      role,
    })
    return { ok: false, queued: true, actionId: entry.id }
  }

  return { ok: false }
}
