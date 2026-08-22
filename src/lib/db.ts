import { PrismaClient } from '@prisma/client'
import { installEncryptionMiddleware } from './prisma-encryption-middleware'
import { logger } from './logger'
import { maskArgs } from './data-masking'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaInitError: Error | undefined
}

// Resolve Prisma datasource URL — handle relative `file:` paths against project root
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('file:')) return url
  const filePath = url.slice(5) // strip 'file:'
  if (path.isAbsolute(filePath)) return url
  // Resolve relative path against project root (where this file's parent is)
  const absolutePath = path.resolve(process.cwd(), filePath)
  return `file:${absolutePath}`
}

// Lazy Prisma client initialization to handle dev server hot reload edge cases
function createPrismaClient(): PrismaClient {
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl || (!rawUrl.startsWith('file:') && !rawUrl.startsWith('postgresql://'))) {
    throw new Error(`Invalid DATABASE_URL: must start with 'file:' or 'postgresql://' (got: ${rawUrl})`)
  }
  const url = resolveDatabaseUrl(rawUrl)
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    errorFormat: 'pretty',
  })
}

let _db: PrismaClient | undefined
let _initError: Error | undefined

function getDb(): PrismaClient {
  if (_db) return _db
  if (_initError) throw _initError

  try {
    const existing = globalForPrisma.prisma
    if (existing) {
      _db = existing
      return _db
    }
    const client = new PrismaClient({
      datasources: { db: { url: resolveDatabaseUrl(process.env.DATABASE_URL!) } },
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      errorFormat: 'pretty',
    })
    try {
      installEncryptionMiddleware(client)
    } catch (e) {
      // Non-fatal: app continues; plaintext columns still readable in transitional mode
      logger.warn('PHI encryption middleware failed to install', e)
    }
    _db = client
    globalForPrisma.prisma = _db
    return _db
  } catch (err) {
    _initError = err as Error
    throw err
  }
}

// Lazy Prisma accessor — do NOT construct/validate Prisma at import time.
// Importing this module happens during `next build` page-data collection and
// inside docker image builds where DATABASE_URL is absent; eager
// `getDb()` there crashed with "Cannot read properties of undefined
// (reading 'startsWith')". Proxy defers getDb() to first actual use.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    return typeof prop === 'string' ? Reflect.get(getDb(), prop) : undefined
  },
})

// ── Connection lifecycle ──────────────────────────────────────────────

/**
 * Gracefully disconnect the Prisma Client.
 * Call this in your server shutdown / process termination handler.
 */
export async function disconnectDb(): Promise<void> {
  try {
    await db.$disconnect()
  } catch (err) {
    // Security: never log raw DB connection errors
    logger.phiSafeError(err, 'db.disconnect')
  }
}

/**
 * Handle unhandled promise rejections by disconnecting before exit.
 */
;(() => {
  if (process.env.NODE_ENV !== 'test') {
    process.on('SIGINT', async () => {
      await disconnectDb()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      await disconnectDb()
      process.exit(0)
    })

    // SECURITY: Catch unhandled exceptions to prevent silent crashes
    process.on('uncaughtException', (error: Error) => {
      logger.phiSafeError(error, 'uncaughtException')
      // Exit with error code for container restart
      process.exit(1)
    })
  }
})()

/**
 * Log a query-count summary when the process is about to exit (dev only).
 */
export function logQueryStats(): void {
  if (process.env.NODE_ENV !== 'development') return
  const engine = (db as PrismaClient & { _engine?: { metrics?: () => Promise<Record<string, number>> } })?._engine
  if (typeof engine?.metrics === 'function') {
    engine
      .metrics()
      .then((m: Record<string, number>) => {
        console.table({
          totalQueries: m.totalQueries ?? 0,
          totalQueriesFailed: m.totalQueriesFailed ?? 0,
        })
      })
      .catch(() => {
        // Silently ignore if metrics are unavailable
      })
  }
}

// ══ Health Data Protection: Global sensitive health data Console Override ═══════════════════════════════════════
// Safety net: in production, all console.* output is masked via maskArgs to
// prevent accidental sensitive health data leakage from any unmasked call site.
if (process.env.NODE_ENV === 'production') {
  const _maskArgs = maskArgs
  const _origError = console.error.bind(console)
  const _origWarn  = console.warn.bind(console)
  const _origInfo  = console.info.bind(console)

  // Mask all console output in production
  console.log   = (...a: any[]) => { /* disabled — use logger */ }
  console.error = (...a: any[]) => _origError(..._maskArgs(a))
  console.warn  = (...a: any[]) => _origWarn(..._maskArgs(a))
  console.info  = (...a: any[]) => _origInfo(..._maskArgs(a))
}