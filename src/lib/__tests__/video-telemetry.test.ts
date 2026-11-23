import { describe, expect, it } from 'vitest'
import { summarizeVideoTelemetry, type VideoCallRow } from '@/lib/video-telemetry'

const NOW = new Date('2026-11-23T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

const call = (overrides: Partial<VideoCallRow>): VideoCallRow => ({
  status: 'ended',
  durationSec: 600,
  qualityScore: 4,
  startedAt: daysAgo(1),
  participants: [{ connectionQuality: 'good', iceCandidateType: 'host' }],
  ...overrides,
})

describe('summarizeVideoTelemetry', () => {
  it('returns zeroed totals for no calls', () => {
    const s = summarizeVideoTelemetry([], NOW)
    expect(s.totalCalls).toBe(0)
    expect(s.relaySharePct).toBe(0)
    expect(s.avgQuality).toBeNull()
  })

  it('counts statuses, durations and quality', () => {
    const s = summarizeVideoTelemetry(
      [call({}), call({ durationSec: 300, qualityScore: 2, status: 'failed' })],
      NOW,
    )
    expect(s.totalCalls).toBe(2)
    expect(s.byStatus).toEqual({ ended: 1, failed: 1 })
    expect(s.avgDurationSec).toBe(450)
    expect(s.avgQuality).toBe(3)
    expect(s.poorQualityCalls).toBe(1)
  })

  it('computes relay share from participant ICE candidates', () => {
    const s = summarizeVideoTelemetry(
      [
        call({ participants: [{ iceCandidateType: 'relay' }] }),
        call({ participants: [{ iceCandidateType: 'srflx' }] }),
        call({ participants: [{ iceCandidateType: 'host' }, { iceCandidateType: 'relay' }] }),
        call({ participants: [{ iceCandidateType: 'host' }] }),
      ],
      NOW,
    )
    expect(s.relayCalls).toBe(2)
    expect(s.relaySharePct).toBe(50)
  })

  it('only counts calls started in the last 30 days', () => {
    const s = summarizeVideoTelemetry(
      [call({ startedAt: daysAgo(1) }), call({ startedAt: daysAgo(60) })],
      NOW,
    )
    expect(s.totalCalls).toBe(2)
    expect(s.callsLast30Days).toBe(1)
  })
})
