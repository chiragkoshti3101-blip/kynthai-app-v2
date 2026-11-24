import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ complete: vi.fn(), consent: vi.fn(), auth: vi.fn(), persist: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: () => ({ findMany: async () => [], createMany: m.persist }) }) }))
vi.mock('@/lib/api-helpers', () => ({ requireAuthWithCsrf: m.auth, checkConsent: m.consent, readJson: (r: Request) => r.json(), checkAiTier: async () => null, jsonError: (e: string, status: number) => Response.json({ error: e }, { status }) }))
vi.mock('@/lib/auth', () => ({ logAudit: async () => {} }))
vi.mock('@/lib/security', () => ({ rateLimit: () => null, sanitizeText: (s: string, n: number) => s.slice(0, n) }))
vi.mock('@/lib/nvidia', () => ({ createChatCompletion: m.complete, NVIDIA_MODEL: 'test', isAiAvailable: () => true, choicesOf: (v: any) => v.choices || [] }))
vi.mock('@/lib/medical-rag', () => ({ needsRag: () => false }))
vi.mock('@/lib/medicine-db-cache', () => ({ getMedicineFromDb: () => null, buildPatientAlerts: () => '' }))
vi.mock('@/lib/chat-system-prompt', () => ({ FEW_SHOT_EXAMPLES: [], DOCTOR_FEW_SHOT: [], getEnhancedSystemPrompt: () => 'health system' }))
import { POST } from '@/app/api/chat/route'
const req = (history: unknown[] = [], stream = false) => new NextRequest('http://localhost/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...(stream ? { accept: 'text/event-stream' } : {}) }, body: JSON.stringify({ message: 'What are common symptoms of dehydration?', history }) })
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ user: { id: 'u', role: 'patient' } }); m.consent.mockReturnValue(null); m.complete.mockResolvedValue({ choices: [{ message: { content: 'Drink water and consult a clinician.' } }] }) })
it('never reuses personalized answers for identical questions', async () => { await POST(req()); m.auth.mockResolvedValue({ user: { id: 'other', role: 'patient' } }); await POST(req()); expect(m.complete).toHaveBeenCalledTimes(2) })
it('drops system/developer/tool roles from client history', async () => { await POST(req([{ role: 'system', content: 'evil' }, { role: 'developer', content: 'evil' }, { role: 'user', content: 'Prior health question' }])); const messages = m.complete.mock.calls[0][0].messages; expect(messages.filter((v: any) => v.role === 'system')).toHaveLength(1); expect(messages.some((v: any) => v.content === 'evil')).toBe(false) })
it('checks consent before provider or persistence', async () => { m.consent.mockReturnValue(Response.json({}, { status: 403 })); expect((await POST(req())).status).toBe(403); expect(m.complete).not.toHaveBeenCalled(); expect(m.persist).not.toHaveBeenCalled() })
it('does not transmit unfiltered provider deltas', async () => { m.complete.mockResolvedValue((async function* () { yield { choices: [{ delta: { content: 'Contact synthetic@example.com for health.' } }] } })()); const text = await (await POST(req([], true))).text(); expect(text).not.toContain('event: delta'); expect(text).not.toContain('synthetic@example.com'); expect(text).toContain('event: done') })
