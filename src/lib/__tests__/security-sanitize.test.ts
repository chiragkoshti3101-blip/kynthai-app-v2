import { describe, expect, it } from 'vitest'
import { sanitizeText } from '@/lib/security'

describe('sanitizeText', () => {
  it('preserves clinical comparisons that look like markup', () => {
    expect(sanitizeText('BP < 120 and > 90')).toBe('BP < 120 and > 90')
    expect(sanitizeText('temp > 38 < 40')).toBe('temp > 38 < 40')
  })

  it('removes the javascript: scheme instead of rewriting it to itself', () => {
    expect(sanitizeText('javascript:alert(1)')).toBe('alert(1)')
    expect(sanitizeText('JaVaScRiPt:alert(document.cookie)')).toBe('alert(document.cookie)')
  })

  it('removes script blocks together with their contents', () => {
    expect(sanitizeText('hello<script>alert(1)</script>world')).toBe('helloworld')
  })

  it('strips tags, event handlers and comments', () => {
    expect(sanitizeText('<b>hello</b>')).toBe('hello')
    expect(sanitizeText('<img src=x onerror="alert(1)">')).toBe('')
    expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe('')
    expect(sanitizeText('a<!--<b>-->b')).toBe('ab')
  })

  it('stays linear on long whitespace input', () => {
    const input = ' '.repeat(200_000) + 'on'
    const started = performance.now()
    const result = sanitizeText(input, 200_000)
    const elapsed = performance.now() - started

    expect(result).toBe('on')
    // Regression guard: the removed event-handler regex was quadratic and took
    // ~50s on this input; the whole sanitizer now runs in well under a ms.
    expect(elapsed).toBeLessThan(1000)
  })

  it('still trims and truncates to maxLen', () => {
    expect(sanitizeText('  abc  ', 2)).toBe('ab')
  })
})
