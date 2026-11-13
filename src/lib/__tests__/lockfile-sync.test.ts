import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('lockfile sync (KYN-HIGH-013)', () => {
  it('package-lock references magicast dependency from package tree', () => {
    const lock = readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')
    expect(lock).toContain('magicast')
  })
})
