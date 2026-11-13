import { describe, expect, it } from 'vitest'
import {
  doctorDashboardErrorBannerCopy,
  resolveDoctorDashboardCounts,
} from '@/lib/doctor-dashboard-data'

describe('doctor dashboard data source policy (KYN-HIGH-009)', () => {
  it('returns zero stats for real users on API error (no demo fallback)', () => {
    const stats = resolveDoctorDashboardCounts({
      useDemoSamples: false,
      apiError: true,
      demoAppointments: [{ status: 'completed', fee: 5000 }],
    })
    expect(stats).toEqual({ completed: 0, upcoming: 0, grossEarnings: 0, todayCount: 0 })
  })

  it('uses demo sample stats only in demo mode', () => {
    const stats = resolveDoctorDashboardCounts({
      useDemoSamples: true,
      apiError: true,
      demoAppointments: [
        { status: 'completed', fee: 100 },
        { status: 'pending', fee: 100 },
      ],
    })
    expect(stats.completed).toBe(1)
    expect(stats.upcoming).toBe(1)
  })

  it('does not promise sample data to verified doctors on errors', () => {
    expect(doctorDashboardErrorBannerCopy(false)).not.toMatch(/sample data/i)
  })
})
