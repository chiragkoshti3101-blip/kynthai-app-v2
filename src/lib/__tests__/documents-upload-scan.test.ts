import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('documents upload antivirus wiring (KYN-HIGH-007)', () => {
  it('invokes scanBuffer before encryption in documents upload route', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/documents/upload/route.ts'),
      'utf8',
    )
    const scanPos = src.indexOf('const verdict = await scanBuffer')
    const encryptPos = src.indexOf('encryptFile(fileBuffer)')
    expect(scanPos).toBeGreaterThan(-1)
    expect(encryptPos).toBeGreaterThan(scanPos)
    expect(src).toContain('isAntivirusRequired')
  })
})
