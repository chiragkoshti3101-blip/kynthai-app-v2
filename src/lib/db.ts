import { db as restDatabase } from './supabase-db'

export function isDatabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return !!url && /^https?:\/\//.test(url) && !!key && key !== '[SENSITIVE]'
}
export class DatabaseNotConfiguredError extends Error {
  readonly code = 'DATABASE_NOT_CONFIGURED' as const
  constructor(message?: string) {
    super(message ?? 'Server database URL and service-role credential are not configured.')
    this.name = 'DatabaseNotConfiguredError'
  }
}
export const db: typeof restDatabase = new Proxy(restDatabase, {
  get(target, property) {
    if (!isDatabaseConfigured()) throw new DatabaseNotConfiguredError()
    return Reflect.get(target, property)
  },
})
