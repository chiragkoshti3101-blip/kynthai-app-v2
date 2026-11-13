#!/usr/bin/env node
/**
 * QA API sweep: unauthenticated probes for every route.ts under src/app/api.
 * - Protected routes must not return 200 with data (expect 401/403/405/503).
 * - Public GET routes must return < 500.
 *
 * Usage: PROBE_URL=http://localhost:3000 node scripts/qa-api-routes.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const BASE = (process.env.PROBE_URL || 'http://localhost:3000').replace(/\/$/, '')

function listRouteFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listRouteFiles(full))
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

function fileToPath(file) {
  const rel = path.relative(path.join(ROOT, 'src/app/api'), file).replace(/\\/g, '/')
  const segments = rel
    .replace(/\/route\.ts$/, '')
    .split('/')
    .map(s => (s.startsWith('[') ? 'qa-param-id' : s))
  return `/api/${segments.join('/')}`
}

function methods(file) {
  const src = fs.readFileSync(file, 'utf8')
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter(m =>
    new RegExp(`export async function ${m}\\b`).test(src),
  )
}

const PUBLIC_GET_HINTS = [
  '/api/health',
  '/api/auth/csrf',
  '/api/auth/me',
  '/api/doctors',
  '/api/labs',
  '/api/feedback',
  '/api/newsletter',
  '/api/invite',
  '/api/debug', // dev-only diagnostics (404 in production)
]

const files = listRouteFiles(path.join(ROOT, 'src/app/api'))
const results = { pass: 0, fail: 0, notes: [] }

for (const file of files) {
  const apiPath = fileToPath(file)
  const exported = methods(file)
  const tryGet = exported.includes('GET')
  if (!tryGet) {
    results.notes.push({ path: apiPath, status: 'SKIP', detail: 'no GET' })
    continue
  }
  const isLikelyPublic = PUBLIC_GET_HINTS.some(p => apiPath === p || apiPath.startsWith(p + '/'))
  try {
    const res = await fetch(`${BASE}${apiPath}`, { redirect: 'manual' })
    const status = res.status
    if (status >= 500) {
      results.fail++
      results.notes.push({ path: apiPath, status: 'FAIL', detail: `GET ${status}` })
    } else if (!isLikelyPublic && status === 200) {
      results.fail++
      results.notes.push({ path: apiPath, status: 'FAIL', detail: 'protected GET returned 200 unauthenticated' })
    } else {
      results.pass++
      results.notes.push({ path: apiPath, status: 'PASS', detail: `GET ${status}` })
    }
  } catch (e) {
    results.fail++
    results.notes.push({ path: apiPath, status: 'FAIL', detail: String(e).slice(0, 80) })
  }
}

console.log(JSON.stringify({ total: files.length, ...results }, null, 2))
process.exit(results.fail > 0 ? 1 : 0)
