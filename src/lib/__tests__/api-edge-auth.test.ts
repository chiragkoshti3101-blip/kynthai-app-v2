import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  getApiPublicAccessAllowlist,
  isPublicApiPath,
  isSystemApiPath,
  portalRoleAllowed,
  requiresAuthenticatedApi,
} from '@/lib/api-edge-auth'

describe('API edge auth (KYN-HIGH-010)', () => {
  it('requires auth for /api/user routes by default', () => {
    expect(requiresAuthenticatedApi('/api/user/data-export', 'GET')).toBe(true)
    expect(requiresAuthenticatedApi('/api/user/account', 'DELETE')).toBe(true)
  })

  it('leaves public auth endpoints open', () => {
    expect(requiresAuthenticatedApi('/api/auth/login', 'POST')).toBe(false)
    expect(requiresAuthenticatedApi('/api/health', 'GET')).toBe(false)
  })

  it('allows GET /api/invite for public token validation', () => {
    expect(requiresAuthenticatedApi('/api/invite', 'GET')).toBe(false)
    expect(requiresAuthenticatedApi('/api/invite', 'POST')).toBe(true)
  })

  it('allows POST /api/feedback for the contact form', () => {
    expect(requiresAuthenticatedApi('/api/feedback', 'POST')).toBe(false)
    expect(requiresAuthenticatedApi('/api/feedback', 'GET')).toBe(true)
  })

  it('allows GET /api/auth/me without session (200 { authenticated: false })', () => {
    expect(requiresAuthenticatedApi('/api/auth/me', 'GET')).toBe(false)
    expect(isPublicApiPath('/api/auth/me', 'GET')).toBe(true)
  })

  it('allows POST /api/auth/demo-login at edge; route 404s in production', () => {
    expect(requiresAuthenticatedApi('/api/auth/demo-login', 'POST')).toBe(false)
  })
})

describe('webhook CSRF exemptions', () => {
  it('treats Stripe webhook and CSP report as system (CSRF-exempt) paths', () => {
    expect(isSystemApiPath('/api/stripe/webhook')).toBe(true)
    expect(isSystemApiPath('/api/csp-report')).toBe(true)
    expect(requiresAuthenticatedApi('/api/stripe/webhook', 'POST')).toBe(false)
    expect(requiresAuthenticatedApi('/api/csp-report', 'POST')).toBe(false)
  })
})

describe('public directory profiles', () => {
  it('allows GET /api/doctors/{id} but not nested doctor APIs', () => {
    expect(isPublicApiPath('/api/doctors/clxyz123', 'GET')).toBe(true)
    expect(isPublicApiPath('/api/doctors/availability', 'GET')).toBe(false)
    expect(isPublicApiPath('/api/doctors/clxyz/slots', 'GET')).toBe(false)
  })

  it('allows GET /api/labs/{id} but not lab dashboard', () => {
    expect(isPublicApiPath('/api/labs/lab123', 'GET')).toBe(true)
    expect(isPublicApiPath('/api/labs/dashboard', 'GET')).toBe(false)
  })
})

describe('portal role at edge (KYN-HIGH-011)', () => {
  it('blocks patient sessions from admin portal when role cookie present', () => {
    expect(portalRoleAllowed('patient', '/admin')).toBe(false)
    expect(portalRoleAllowed('admin', '/admin')).toBe(true)
  })
})

describe('API route audit', () => {
  const apiRoot = path.join(process.cwd(), 'src/app/api')

  function listRouteFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...listRouteFiles(full))
      else if (entry.name === 'route.ts') out.push(full)
    }
    return out
  }

  function fileToApiPath(file: string): string {
    const rel = path.relative(apiRoot, file).replace(/\\/g, '/')
    const segments = rel
      .replace(/\/route\.ts$/, '')
      .split('/')
      .map(s => (s.startsWith('[') ? ':param' : s))
    return `/api/${segments.join('/')}`
  }

  function exportedMethods(file: string): string[] {
    const src = fs.readFileSync(file, 'utf8')
    const methods: string[] = []
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      if (new RegExp(`export async function ${m}\\b`).test(src)) methods.push(m)
    }
    return methods
  }

  /** Routes documented or implemented as intentionally public (handler-enforced where noted). */
  const explicitlyPublic: Array<{ path: string; method: string; note?: string }> = [
    { path: '/api/invite', method: 'GET' },
    { path: '/api/feedback', method: 'POST' },
    { path: '/api/auth/me', method: 'GET' },
    { path: '/api/auth/demo-login', method: 'POST' },
    { path: '/api/stripe/webhook', method: 'POST' },
    { path: '/api/csp-report', method: 'POST' },
    { path: '/api/admin/bootstrap-schema', method: 'GET' },
    { path: '/api/debug', method: 'GET' },
    { path: '/api/newsletter', method: 'GET' },
    { path: '/api/newsletter', method: 'POST' },
    { path: '/api/doctors', method: 'GET' },
    { path: '/api/labs', method: 'GET' },
    { path: '/api/search-medicine', method: 'GET' },
    { path: '/api/doctors/:param', method: 'GET' },
    { path: '/api/labs/:param', method: 'GET' },
  ]

  it('discovers all API route modules', () => {
    const files = listRouteFiles(apiRoot)
    expect(files.length).toBeGreaterThan(0)
    // Audit discovered handlers, not a stale historical module count.
    expect(files).toContain(path.join(apiRoot, 'auth/me/route.ts'))
    expect(new Set(files).size).toBe(files.length)
  })

  it('explicit public routes are not blocked by default-deny', () => {
    for (const row of explicitlyPublic) {
      const samplePath = row.path.replace(':param', 'sample-id')
      expect(
        requiresAuthenticatedApi(samplePath, row.method),
        `${row.method} ${row.path}`,
      ).toBe(false)
    }
  })

  it('GET handlers marked no-auth in source are not blocked at edge', () => {
    const files = listRouteFiles(apiRoot)
    const offenders: string[] = []
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      if (!/publicly reachable \(no auth required\)|public list of verified/i.test(src)) continue
      if (!exportedMethods(file).includes('GET')) continue
      const apiPath = fileToApiPath(file).replace(':param', 'probe-id')
      if (requiresAuthenticatedApi(apiPath, 'GET')) {
        offenders.push(`GET ${apiPath} (${file})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('exports a stable full allowlist catalog', () => {
    const catalog = getApiPublicAccessAllowlist()
    expect(catalog.systemPaths).toContain('/api/stripe/webhook')
    expect(catalog.publicGetExact).toContain('/api/auth/me')
    expect(catalog.publicPostExact).toContain('/api/feedback')
  })
})
