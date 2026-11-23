import { describe, expect, it } from 'vitest'
import { classifySyncResponse } from '@/lib/offline-queue'

describe('classifySyncResponse', () => {
  it('treats 2xx as success', () => {
    expect(classifySyncResponse(200)).toBe('ok')
    expect(classifySyncResponse(201)).toBe('ok')
    expect(classifySyncResponse(204)).toBe('ok')
  })

  it('treats 409 and 412 as terminal conflicts (no retry)', () => {
    expect(classifySyncResponse(409)).toBe('conflict')
    expect(classifySyncResponse(412)).toBe('conflict')
  })

  it('retries transient failures', () => {
    expect(classifySyncResponse(500)).toBe('retry')
    expect(classifySyncResponse(503)).toBe('retry')
    expect(classifySyncResponse(429)).toBe('retry')
    expect(classifySyncResponse(403)).toBe('retry')
  })
})
