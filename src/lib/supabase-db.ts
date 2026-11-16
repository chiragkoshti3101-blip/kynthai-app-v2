const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

const tableMap: Record<string, string> = {
  user: 'users', doctorProfile: 'doctor_profiles', labProfile: 'lab_profiles',
  appointment: 'appointments', labBooking: 'lab_bookings', prescription: 'prescriptions',
  medication: 'medications', reminder: 'reminders', chatMessage: 'chat_messages',
  family: 'families', familyMember: 'family_members', emergencyAlert: 'emergency_alerts',
  payment: 'payments', auditLog: 'audit_logs', consultationNote: 'consultation_notes',
  healthJournal: 'health_journals', healthScore: 'health_scores',
  familyHealthAlert: 'family_health_alerts', medicineInventory: 'medicine_inventories',
  userStreak: 'user_streaks', userBadge: 'user_badges',
  prescriptionIntelligence: 'prescription_intelligence',
  prescriptionTemplate: 'prescription_templates', medicineOrder: 'medicine_orders',
  videoCall: 'video_calls', videoCallParticipant: 'video_call_participants',
  doctorAvailabilitySlot: 'doctor_availability_slots', refund: 'refunds',
  payout: 'payouts', notificationLog: 'notification_logs', referral: 'referrals',
  referralUsage: 'referral_usages', complaint: 'complaints', consultMessage: 'consult_messages',
  chronicCondition: 'chronic_conditions', medicalDocument: 'medical_documents',
  freeTierUsage: 'free_tier_usage', freeTierUsageAudit: 'free_tier_usage_audit',
  newsletterSubscriber: 'newsletter_subscribers', pushSubscription: 'push_subscriptions',
  revokedSession: 'revoked_sessions',
}

function getTable(model: string): string {
  return tableMap[model] || model
}

function sbHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

function buildWhereParams(where: any): string[] {
  const params: string[] = []
  if (!where) return params
  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' && Array.isArray(value)) {
      for (const item of value) {
        params.push(...buildWhereParams(item))
      }
    } else if (key === 'OR' && Array.isArray(value)) {
      const orClauses = value.map((item: any) => {
        const clauses = []
        for (const [k, v] of Object.entries(item)) {
          clauses.push(`${k}.eq.${encodeURIComponent(v as string)}`)
        }
        return clauses.join(',')
      })
      params.push(`or=(${orClauses.join(',')})`)
    } else if (value === null) {
      params.push(`${key}=is.null`)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const v = value as any
      if (v.equals !== undefined) params.push(`${key}=eq.${encodeURIComponent(v.equals)}`)
      else if (v.contains !== undefined) params.push(`${key}=ilike.*${encodeURIComponent(v.contains)}*`)
      else if (v.gte !== undefined) params.push(`${key}=gte.${encodeURIComponent(v.gte)}`)
      else if (v.lte !== undefined) params.push(`${key}=lte.${encodeURIComponent(v.lte)}`)
      else if (v.gt !== undefined) params.push(`${key}=gt.${encodeURIComponent(v.gt)}`)
      else if (v.lt !== undefined) params.push(`${key}=lt.${encodeURIComponent(v.lt)}`)
      else if (v.not !== undefined) params.push(`${key}=neq.${encodeURIComponent(v.not)}`)
      else if (v.in !== undefined && Array.isArray(v.in)) {
        params.push(`${key}=in.(${v.in.map((x: any) => encodeURIComponent(x)).join(',')})`)
      } else {
        for (const [k, val] of Object.entries(v)) {
          if (val !== undefined && val !== null) {
            params.push(`${k}=eq.${encodeURIComponent(val as string)}`)
          }
        }
      }
    } else if (Array.isArray(value)) {
      params.push(`${key}=in.(${value.map((v: any) => encodeURIComponent(v)).join(',')})`)
    } else {
      params.push(`${key}=eq.${encodeURIComponent(value)}`)
    }
  }
  return params
}

function createModelProxy(tableName: string): any {
  return {
    findUnique: async (args: any = {}) => {
      const params = buildWhereParams(args?.where || {})
      params.push('select=*', 'limit=1')
      const url = `${SUPABASE_URL}/rest/v1/${tableName}?${params.join('&')}`
      try {
        const res = await fetch(url, { headers: sbHeaders() })
        const data = await res.json()
        return Array.isArray(data) && data.length > 0 ? data[0] : null
      } catch { return null }
    },
    findFirst: async (args: any = {}) => {
      const params = buildWhereParams(args?.where || {})
      params.push('select=*', 'limit=1')
      if (args?.orderBy) {
        const oc = Object.entries(args.orderBy).map(([k, d]) => `${k}.${d === 'desc' ? 'desc' : 'asc'}`)
        params.push(`order=${oc.join(',')}`)
      }
      const url = `${SUPABASE_URL}/rest/v1/${tableName}?${params.join('&')}`
      try {
        const res = await fetch(url, { headers: sbHeaders() })
        const data = await res.json()
        return Array.isArray(data) && data.length > 0 ? data[0] : null
      } catch { return null }
    },
    findMany: async (args: any = {}) => {
      const params = buildWhereParams(args?.where || {})
      params.push('select=*')
      if (args?.orderBy) {
        const oc = Object.entries(args.orderBy).map(([k, d]) => `${k}.${d === 'desc' ? 'desc' : 'asc'}`)
        params.push(`order=${oc.join(',')}`)
      }
      if (args?.take) params.push(`limit=${args.take}`)
      if (args?.skip) params.push(`offset=${args.skip}`)
      const url = `${SUPABASE_URL}/rest/v1/${tableName}?${params.join('&')}`
      try {
        const res = await fetch(url, { headers: sbHeaders() })
        const data = await res.json()
        return Array.isArray(data) ? data : []
      } catch { return [] }
    },
    create: async (args: any = {}) => {
      const data = args?.data || {}
      if (!data.id) data.id = crypto.randomUUID()
      if (!data.createdAt) data.createdAt = new Date().toISOString()
      if (!data.updatedAt) data.updatedAt = new Date().toISOString()
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
          method: 'POST',
          headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(data),
        })
        const result = await res.json()
        return Array.isArray(result) ? result[0] : result
      } catch { return null }
    },
    update: async (args: any = {}) => {
      const where = args?.where || {}
      const data = args?.data || {}
      if (!data.updatedAt) data.updatedAt = new Date().toISOString()
      const filters = []
      for (const [key, value] of Object.entries(where)) {
        filters.push(`${key}=eq.${encodeURIComponent(value as string)}`)
      }
      const url = `${SUPABASE_URL}/rest/v1/${tableName}?${filters.join('&')}`
      try {
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify(data),
        })
        const result = await res.json()
        return Array.isArray(result) ? result[0] : result
      } catch { return null }
    },
    delete: async (args: any = {}) => {
      const where = args?.where || {}
      const filters = []
      for (const [key, value] of Object.entries(where)) {
        filters.push(`${key}=eq.${encodeURIComponent(value as string)}`)
      }
      const url = `${SUPABASE_URL}/rest/v1/${tableName}?${filters.join('&')}`
      try {
        const res = await fetch(url, { method: 'DELETE', headers: sbHeaders() })
        return res.ok
      } catch { return false }
    },
    count: async (args: any = {}) => {
      const params = buildWhereParams(args?.where || {})
      const url = `${SUPABASE_URL}/rest/v1/${tableName}?${params.join('&')}`
      try {
        const res = await fetch(url, { headers: { ...sbHeaders(), 'Prefer': 'count=exact' } })
        const count = res.headers.get('content-range')?.split('/')[1]
        return count ? parseInt(count) : 0
      } catch { return 0 }
    },
    upsert: async (args: any = {}) => {
      const data = args?.create || args?.update || {}
      if (!data.id) data.id = crypto.randomUUID()
      if (!data.createdAt) data.createdAt = new Date().toISOString()
      if (!data.updatedAt) data.updatedAt = new Date().toISOString()
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
          method: 'POST',
          headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(data),
        })
        const result = await res.json()
        return Array.isArray(result) ? result[0] : result
      } catch { return null }
    },
    deleteMany: async (args: any = {}) => {
      const where = args?.where || {}
      const filters = buildWhereParams(where)
      const url = `${SUPABASE_URL}/rest/v1/${tableName}?${filters.join('&')}`
      try {
        await fetch(url, { method: 'DELETE', headers: sbHeaders() })
        return { count: 0 }
      } catch { return { count: 0 } }
    },
    updateMany: async (args: any = {}) => {
      return { count: 0 }
    },
    aggregate: async (args: any) => { return {} },
    groupBy: async (args: any) => { return [] },
  }
}

const dbProxy: any = {}
for (const model of Object.keys(tableMap)) {
  dbProxy[model] = createModelProxy(tableMap[model])
}

dbProxy.$queryRaw = async (...args: any[]) => { return [] }
dbProxy.$queryRawUnsafe = async (query: string, ...params: any[]) => { return [] }
dbProxy.$executeRawUnsafe = async (query: string, ...params: any[]) => { return 0 }
dbProxy.$transaction = async (fn: any) => { return fn(dbProxy) }

export const db: any = dbProxy
