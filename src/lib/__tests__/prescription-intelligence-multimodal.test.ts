import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('prescription intelligence multimodal path (KYN-HIGH-012)', () => {
  it('uses image_url content parts for imageData like prescription-scan', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/prescription-intelligence/route.ts'),
      'utf8',
    )
    expect(src).toContain("type: 'image_url'")
    expect(src).toContain('AI_TIMEOUTS.MEDIA')
  })
})
