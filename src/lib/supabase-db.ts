/** Server-only Prisma-shaped persistence over PostgREST. Never use an anon key
 * for server writes, swallow database errors, or pretend HTTP is a transaction. */
import { randomUUID } from 'node:crypto'
import models from './database-models.json'
import { encryptSensitiveFields, decryptSensitiveFields, rewriteWhereForEncryption } from './prisma-encryption-middleware'

type Args = Record<string, any>
const metadata = new Map<string, any>(models.map(m => [m.name, m]))
const column = (model: string, field: string): string => metadata.get(model).fields.find((f: any) => f.name === field)?.dbName || field

export class RestDatabaseError extends Error {
  code: string
  constructor(public status: number, public databaseCode?: string) {
    super(`Database request failed (${status})`)
    this.name = 'RestDatabaseError'
    this.code = databaseCode === '23505' ? 'P2002' : databaseCode === '23503' ? 'P2003' : 'DATABASE_ERROR'
  }
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server database requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  return { url, key }
}
async function request(model: string, params: URLSearchParams, method = 'GET', data?: unknown, prefer = '') {
  const { url, key } = config()
  const table = metadata.get(model)?.dbName
  if (!table) throw new Error(`Unknown database model: ${model}`)
  const response = await fetch(`${url}/rest/v1/${table}?${params}`, {
    method, cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: ['return=representation', prefer].filter(Boolean).join(',') },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new RestDatabaseError(response.status, error.code)
  }
  const text = await response.text()
  return { rows: text ? JSON.parse(text) : [], total: Number(response.headers.get('content-range')?.split('/')[1]) }
}
const scalar = (v: any) => v instanceof Date ? v.toISOString() : String(v)
const quoted = (v: any) => `"${scalar(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
function relation(model: string, field: any) {
  const target = metadata.get(field.type)
  if (field.relationFromFields?.length) return { target: field.type, local: field.relationFromFields[0], remote: field.relationToFields[0] }
  const inverse = target.fields.find((f: any) => f.kind === 'object' && f.type === model && f.relationName === field.relationName && f.relationFromFields?.length)
  if (!inverse) throw new Error(`Unsupported relation ${model}.${field.name}`)
  return { target: field.type, local: inverse.relationToFields[0], remote: inverse.relationFromFields[0] }
}

/** Each recursive branch preserves AND/OR/NOT grouping. Relation predicates are
 * resolved before the parent query; unknown operators fail closed, never widen. */
async function expressions(model: string, input: Args = {}): Promise<string[]> {
  const args = { where: structuredClone(input) }
  rewriteWhereForEncryption(args, model)
  const out: string[] = []
  for (const [key, value] of Object.entries(args.where)) {
    if (value === undefined) continue
    if (['AND', 'OR', 'NOT'].includes(key)) {
      const parts = await Promise.all((Array.isArray(value) ? value : [value]).map(v => expressions(model, v)))
      // Empty objects are true predicates. Never emit invalid and() syntax.
      if (key === 'OR' && parts.some(p => p.length === 0)) continue
      const effective = parts.filter(p => p.length > 0)
      if (key === 'OR' && !parts.length) { out.push('id.in.()'); continue }
      const groups = effective.map(p => p.length === 1 ? p[0] : `and(${p.join(',')})`)
      if (groups.length) out.push(`${key === 'OR' ? 'or' : key === 'NOT' ? 'not.and' : 'and'}(${groups.join(',')})`)
      continue
    }
    const field = metadata.get(model).fields.find((f: any) => f.name === key)
    if (field?.kind === 'object') {
      const rel = relation(model, field)
      const condition: any = value
      const negative = condition === null || condition?.is === null || condition?.none !== undefined || condition?.isNot !== undefined
      const clause = condition?.some ?? condition?.none ?? condition?.is ?? condition?.isNot ?? condition ?? {}
      if (condition?.every !== undefined) throw new Error('Relation every is not supported')
      const rows = await find(rel.target, { where: clause }, true)
      const ids = [...new Set(rows.map((r: any) => r[rel.remote]).filter((v: any) => v != null))]
      if (!ids.length) { if (!negative) out.push('id.in.()'); continue }
      const inExpr = `${rel.local}.${negative ? 'not.in' : 'in'}.(${ids.map(quoted).join(',')})`
      out.push(negative ? `or(${rel.local}.is.null,${inExpr})` : inExpr)
    } else if (!field && value && typeof value === 'object' && !Array.isArray(value)) {
      // Named Prisma compound unique key, e.g. medicationId_date_time.
      if (!metadata.get(model).uniqueFields.some((fields: string[]) => fields.join('_') === key) &&
          !metadata.get(model).uniqueIndexes.some((index: any) => index.name === key)) throw new Error(`Unknown filter ${model}.${key}`)
      out.push(...await expressions(model, value))
    } else {
      if (!field) throw new Error(`Unknown filter ${model}.${key}`)
      const filters = value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value) ? value : { equals: value }
      for (const [op, operand] of Object.entries(filters)) {
        if (operand === undefined || op === 'mode') continue
        const insensitive = filters.mode === 'insensitive'
        if (op === 'equals') out.push(`${column(model, key)}.${operand === null ? 'is.null' : `eq.${quoted(operand)}`}`)
        else if (op === 'not') {
          if (operand !== null && typeof operand === 'object') {
            out.push(`not.and(${(await expressions(model, { [key]: operand })).join(',')})`)
          } else out.push(`${column(model, key)}.${operand === null ? 'not.is.null' : `neq.${quoted(operand)}`}`)
        } else if (['in', 'notIn'].includes(op) && Array.isArray(operand)) out.push(`${column(model, key)}.${op === 'in' ? 'in' : 'not.in'}.(${operand.map(quoted).join(',')})`)
        else if (['gt','gte','lt','lte'].includes(op)) out.push(`${column(model, key)}.${op}.${quoted(operand)}`)
        else if (['contains','startsWith','endsWith'].includes(op)) {
          const pattern = scalar(operand).replace(/[\\%_*]/g, c => `\\${c}`)
          out.push(`${column(model, key)}.${insensitive ? 'ilike' : 'like'}.${quoted(`${op !== 'startsWith' ? '%' : ''}${pattern}${op !== 'endsWith' ? '%' : ''}`)}`)
        } else if (op === 'has') out.push(`${column(model, key)}.cs.${JSON.stringify([operand])}`)
        else if (op === 'hasSome') out.push(`${column(model, key)}.ov.${JSON.stringify(operand)}`)
        else if (op === 'hasEvery') out.push(`${column(model, key)}.cs.${JSON.stringify(operand)}`)
        else if (op === 'isEmpty') out.push(`${column(model, key)}.${operand ? 'eq' : 'neq'}.{}`)
        else throw new Error(`Unsupported filter operator ${op}`)
      }
    }
  }
  return out
}
async function paramsFor(model: string, args: Args) {
  const params = new URLSearchParams({ select: '*' })
  const filters = await expressions(model, args.where)
  if (filters.length) params.set('and', `(${filters.join(',')})`)
  const orders = (Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [])
    .flatMap(o => Object.entries(o).map(([k,v]) => {
      if (!metadata.get(model).fields.some((f: any) => f.name === k && f.kind !== 'object')) throw new Error('Invalid sort field')
      return `${column(model, k)}.${v === 'desc' ? 'desc' : 'asc'}`
    }))
  if (orders.length) params.set('order', orders.join(','))
  if (args.skip !== undefined) params.set('offset', String(args.skip))
  if (args.take !== undefined) {
    if (!Number.isInteger(args.take) || args.take < 0) throw new Error('Invalid query limit')
    params.set('limit', String(args.take))
  }
  if (args.cursor) {
    if (Object.keys(args.cursor).length !== 1 || !args.cursor.id) throw new Error('Unsupported cursor')
    const cursor = await find(model, { where: args.cursor, take: 1 }, true)
    if (cursor.length && orders.length === 1) {
      const [field, direction] = orders[0].split('.')
      params.set(field, `${direction === 'desc' ? 'lt' : 'gt'}.${scalar(cursor[0][field])}`)
      params.delete('offset')
    } else throw new Error('Cursor requires one ordered field')
  }
  return params
}
function hydrate(model: string, row: Args) {
  const mapped = { ...row }
  for (const f of metadata.get(model).fields) if (f.dbName && f.dbName !== f.name && Object.hasOwn(mapped, f.dbName)) {
    mapped[f.name] = mapped[f.dbName]; delete mapped[f.dbName]
  }
  const result = decryptSensitiveFields(mapped, model) as Args
  for (const f of metadata.get(model).fields) {
    if (f.type === 'DateTime' && result[f.name] != null) result[f.name] = new Date(result[f.name])
  }
  return result
}
async function shape(model: string, row: Args, args: Args) {
  const result = hydrate(model, row)
  const requested = { ...args.include, ...args.select }
  for (const [key, options] of Object.entries(requested)) {
    const field = metadata.get(model).fields.find((f: any) => f.name === key && f.kind === 'object')
    if (!field || !options) continue
    const rel = relation(model, field)
    if (result[rel.local] == null) { result[key] = field.isList ? [] : null; continue }
    const nested = options === true ? {} : options as Args
    const rows = await find(rel.target, { ...nested, where: { AND: [nested.where || {}, { [rel.remote]: result[rel.local] }] } })
    result[key] = field.isList ? rows : rows[0] ?? null
  }
  if (args.include?._count || args.select?._count) {
    const countOptions = (args.include?._count || args.select?._count)
    result._count = {}
    for (const field of metadata.get(model).fields.filter((f: any) => f.kind === 'object' && f.isList)) {
      if (countOptions !== true && !countOptions.select?.[field.name]) continue
      const rel = relation(model, field)
      result._count[field.name] = await delegate(rel.target).count({ where: { [rel.remote]: result[rel.local] } })
    }
  }
  if (args.select) return Object.fromEntries(Object.keys(args.select).filter(k => args.select[k]).map(k => [k, result[k]]))
  return result
}
async function find(model: string, args: Args = {}, raw = false): Promise<any[]> {
  const params = await paramsFor(model, args)
  // PostgREST caps results; never silently truncate relation/authorization queries.
  const rows: any[] = []
  const size = 500
  let offset = args.cursor ? 0 : args.skip || 0
  const limit = args.take ?? Infinity
  if (limit === 0) return []
  while (rows.length < limit) {
    const pageSize = Math.min(size, limit - rows.length)
    params.set('limit', String(pageSize)); params.set('offset', String(offset))
    const page = (await request(model, params)).rows
    rows.push(...page)
    if (page.length < pageSize) break
    offset += page.length
  }
  return raw ? rows : Promise.all(rows.map(row => shape(model, row, args)))
}
function payload(model: string, input: Args, creating: boolean) {
  const meta = metadata.get(model)
  const data: Args = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    const field = meta.fields.find((f: any) => f.name === key)
    if (!field) throw new Error(`Unknown write field ${model}.${key}`)
    if (field.kind === 'object') {
      const nested: any = value
      if (nested?.connect && field.relationFromFields?.length) {
        for (let i = 0; i < field.relationFromFields.length; i++) data[field.relationFromFields[i]] = nested.connect[field.relationToFields[i]]
      } else throw new Error(`Nested writes require an atomic RPC: ${model}.${key}`)
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value) && field.type !== 'Json') {
      if (Object.keys(value).length === 1 && 'set' in value) data[key] = value.set
      else throw new Error('Atomic numeric updates require a database RPC')
    } else data[key] = value
  }
  if (creating) {
    for (const f of meta.fields) {
      if (f.kind === 'object' || data[f.name] !== undefined || !f.hasDefaultValue) continue
      if (f.default?.name === 'cuid' || f.default?.name === 'uuid') data[f.name] = randomUUID()
      else if (f.default?.name === 'now') data[f.name] = new Date().toISOString()
      else if (f.default !== undefined && (typeof f.default !== 'object' || Array.isArray(f.default))) data[f.name] = f.default
    }
  }
  for (const f of meta.fields) if (f.isUpdatedAt && data[f.name] === undefined) data[f.name] = new Date().toISOString()
  const encrypted = encryptSensitiveFields(data, model) as Args
  return Object.fromEntries(Object.entries(encrypted).map(([key, value]) => [column(model, key), value]))
}
function delegate(model: string): any {
  const one = async (args: Args = {}) => (await find(model, { ...args, take: 1 }))[0] ?? null
  const missing = () => { const error: any = new Error('Record not found'); error.code = 'P2025'; throw error }
  const write = async (method: string, args: Args) => {
    if (method !== 'POST' && (!args.where || !Object.keys(args.where).length)) throw new Error('Refusing unfiltered single-record mutation')
    const params = await paramsFor(model, { where: args.where })
    const { rows } = await request(model, params, method, method === 'DELETE' ? undefined : payload(model, args.data, method === 'POST'))
    if (!rows[0]) return missing()
    return shape(model, rows[0], args)
  }
  return {
    findMany: (args: Args = {}) => find(model, args), findUnique: one, findFirst: one,
    findUniqueOrThrow: async (args: Args) => await one(args) ?? missing(),
    findFirstOrThrow: async (args: Args) => await one(args) ?? missing(),
    create: (args: Args) => write('POST', args), update: (args: Args) => write('PATCH', args), delete: (args: Args) => write('DELETE', args),
    createMany: async (args: Args) => {
      const data = (Array.isArray(args.data) ? args.data : [args.data]).map((r: Args) => payload(model, r, true))
      if (!data.length) return { count: 0 }
      const { rows } = await request(model, new URLSearchParams(), 'POST', data, args.skipDuplicates ? 'resolution=ignore-duplicates' : '')
      return { count: rows.length }
    },
    upsert: async (args: Args) => {
      // Conflict target uses the exact compound unique key. PATCH only the update
      // branch: merging create data would reset status/createdAt on existing rows.
      const existing = await one({ where: args.where })
      if (existing) return Object.keys(args.update || {}).length ? write('PATCH', { ...args, where: { id: existing.id }, data: args.update }) : shape(model, existing, args)
      try { return await write('POST', { ...args, where: undefined, data: args.create }) }
      catch (error) {
        if (!(error instanceof RestDatabaseError) || error.code !== 'P2002') throw error
        const raced = await one({ where: args.where })
        if (!raced) throw error
        return Object.keys(args.update || {}).length ? write('PATCH', { ...args, where: { id: raced.id }, data: args.update }) : shape(model, raced, args)
      }
    },
    updateMany: async (args: Args) => {
      const { rows } = await request(model, await paramsFor(model, { where: args.where }), 'PATCH', payload(model, args.data, false))
      return { count: rows.length }
    },
    deleteMany: async (args: Args = {}) => ({ count: (await request(model, await paramsFor(model, { where: args.where }), 'DELETE')).rows.length }),
    count: async (args: Args = {}) => {
      const params = await paramsFor(model, { where: args.where }); params.set('limit','0')
      const { total } = await request(model, params, 'GET', undefined, 'count=exact')
      if (!Number.isFinite(total)) throw new Error('Database did not return an exact count')
      return total
    },
    groupBy: async (args: Args) => {
      if (!Array.isArray(args.by) || !args.by.length) throw new Error('groupBy requires fields')
      for (const key of args.by) if (!metadata.get(model).fields.some((f: any) => f.name === key && f.kind !== 'object')) throw new Error('Invalid groupBy field')
      if (args.having) throw new Error('groupBy having is not supported')
      const rows = await find(model, { where: args.where })
      const groups = new Map<string, Args[]>()
      for (const row of rows) {
        const key = JSON.stringify(args.by.map((field: string) => row[field]))
        groups.set(key, [...(groups.get(key) || []), row])
      }
      let result = [...groups.values()].map(group => {
        const output: Args = Object.fromEntries(args.by.map((field: string) => [field, group[0][field]]))
        for (const op of ['_count', '_sum', '_avg', '_min', '_max']) if (args[op]) {
          if (op === '_count' && args[op] === true) { output[op] = group.length; continue }
          output[op] = {}
          for (const field of Object.keys(args[op])) {
            const values = group.map(row => row[field]).filter(value => value != null)
            output[op][field] = op === '_count' ? (field === '_all' ? group.length : values.length) : !values.length ? null : op === '_sum' ? values.reduce((sum, value) => sum + Number(value), 0) : op === '_avg' ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : op === '_min' ? values.reduce((a, b) => a < b ? a : b) : values.reduce((a, b) => a > b ? a : b)
          }
        }
        return output
      })
      if (args.orderBy) {
        const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]
        result.sort((a, b) => {
          for (const order of orders) for (const [field, direction] of Object.entries(order)) {
            const nested = typeof direction === 'object' && direction !== null ? Object.entries(direction)[0] : null
            const av = nested ? a[field]?.[nested[0]] : a[field], bv = nested ? b[field]?.[nested[0]] : b[field]
            if (av !== bv) return (av < bv ? -1 : 1) * ((nested ? nested[1] : direction) === 'desc' ? -1 : 1)
          }
          return 0
        })
      }
      if (args.skip) result = result.slice(args.skip)
      if (args.take !== undefined) result = result.slice(0, args.take)
      return result
    },
    aggregate: async (args: Args = {}) => {
      const rows = await find(model, args)
      const result: Args = {}
      for (const op of ['_count','_sum','_avg','_min','_max']) if (args[op]) {
        if (op === '_count' && args[op] === true) { result[op] = rows.length; continue }
        result[op] = {}
        for (const key of Object.keys(args[op])) {
          const values = rows.map(r => r[key]).filter(v => v != null)
          result[op][key] = op === '_count' ? (key === '_all' ? rows.length : values.length) : !values.length ? null : op === '_sum' ? values.reduce((a,b)=>a+Number(b),0) : op === '_avg' ? values.reduce((a,b)=>a+Number(b),0)/values.length : op === '_min' ? values.reduce((a,b)=>a<b?a:b) : values.reduce((a,b)=>a>b?a:b)
        }
      }
      return result
    },
  }
}
const database: Args = Object.fromEntries(models.map(m => [m.name[0].toLowerCase() + m.name.slice(1), delegate(m.name)]))
const unsupported = () => { throw new Error('SQL/transactions require an installed atomic database RPC; HTTP requests are not transactions') }
database.$transaction = unsupported
database.$queryRaw = unsupported
database.$queryRawUnsafe = unsupported
database.$executeRawUnsafe = unsupported
export const db: any = database

/** All clinical rows commit or roll back inside PostgreSQL, never a fake HTTP transaction. */
export async function createRecordsAtomically(records: { model: string; data: Args }[]): Promise<any[]> {
  const { url, key } = config()
  const prepared = records.map(record => {
    const model = modelNameForBatch(record.model)
    return { model, table: metadata.get(model)?.dbName, data: payload(model, record.data, true) }
  })
  const response = await fetch(`${url}/rest/v1/rpc/kynthai_atomic_create`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: prepared.map(({ table, data }) => ({ table, data })) }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new RestDatabaseError(response.status, error.code)
  }
  const rows = await response.json()
  if (!Array.isArray(rows) || rows.length !== records.length) throw new Error('Invalid atomic write result')
  return rows.map((row, index) => hydrate(prepared[index].model, row))
}
function modelNameForBatch(name: string) {
  const model = name[0].toUpperCase() + name.slice(1)
  if (!metadata.has(model)) throw new Error('Unknown atomic write model')
  return model
}

/** Server-only counter + audit transaction; no lost updates under concurrency. */
export async function recordUsageAtomically(userId: string, feature: string, action: string): Promise<number> {
  const { url, key } = config()
  const response = await fetch(`${url}/rest/v1/rpc/kynthai_record_usage`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId, p_feature: feature, p_action: action }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new RestDatabaseError(response.status, error.code)
  }
  const count = await response.json()
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid atomic usage result')
  return count
}

export async function reserveAiUsage(userId: string, limit: number): Promise<boolean> {
  const { url, key } = config()
  const response = await fetch(`${url}/rest/v1/rpc/kynthai_reserve_ai_usage`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId, p_limit: limit }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new RestDatabaseError(response.status, error.code)
  }
  const allowed = await response.json()
  if (typeof allowed !== 'boolean') throw new Error('Invalid AI reservation result')
  return allowed
}
