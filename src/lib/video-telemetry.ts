/**
 * Video-call telemetry aggregation.
 *
 * The client emits lightweight, PHI-safe stats (RTT / bytes / state) while a
 * call runs; durable call outcomes live in VideoCall/VideoCallParticipant.
 * This module rolls those rows into the numbers an operator actually needs:
 * connection success rate, duration, quality, and relay (TURN) reliance —
 * high relay share signals NAT/firewall trouble.
 */

export type VideoCallRow = {
  status: string
  durationSec?: number | null
  qualityScore?: number | null
  startedAt?: Date | string | null
  endedAt?: Date | string | null
  participants?: Array<{
    connectionQuality?: string | null
    iceCandidateType?: string | null
  }>
}

export type VideoTelemetrySummary = {
  totalCalls: number
  byStatus: Record<string, number>
  callsLast30Days: number
  avgDurationSec: number
  avgQuality: number | null
  /** Calls with at least one participant on a TURN relay candidate. */
  relayCalls: number
  relaySharePct: number
  poorQualityCalls: number
}

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function summarizeVideoTelemetry(
  rows: ReadonlyArray<VideoCallRow>,
  now: Date = new Date(),
): VideoTelemetrySummary {
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const byStatus: Record<string, number> = {}
  let durationSum = 0
  let durationCount = 0
  let qualitySum = 0
  let qualityCount = 0
  let relayCalls = 0
  let poorQualityCalls = 0
  let callsLast30Days = 0

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1

    const started = row.startedAt ? new Date(row.startedAt).getTime() : NaN
    if (!Number.isNaN(started) && started >= thirtyDaysAgo) callsLast30Days++

    const duration = num(row.durationSec)
    if (duration !== null) {
      durationSum += duration
      durationCount++
    }
    const quality = num(row.qualityScore)
    if (quality !== null) {
      qualitySum += quality
      qualityCount++
    }
    if (quality !== null && quality <= 2) poorQualityCalls++

    if ((row.participants ?? []).some((p) => p.iceCandidateType === 'relay')) relayCalls++
  }

  const totalCalls = rows.length
  return {
    totalCalls,
    byStatus,
    callsLast30Days,
    avgDurationSec: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
    avgQuality: qualityCount > 0 ? Math.round((qualitySum / qualityCount) * 10) / 10 : null,
    relayCalls,
    relaySharePct: totalCalls > 0 ? Math.round((relayCalls / totalCalls) * 100) : 0,
    poorQualityCalls,
  }
}
