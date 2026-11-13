export type DemoAppointment = { status: string; fee: number };

export function useDoctorDemoSampleFallback(isDemo: boolean, demoEnabled: boolean): boolean {
  return isDemo && demoEnabled;
}

export function resolveDoctorDashboardCounts(params: {
  useDemoSamples: boolean;
  apiError: boolean;
  dashboardStats?: { completed?: number; upcoming?: number; grossEarnings?: number; today?: number };
  demoAppointments: DemoAppointment[];
}): {
  completed: number;
  upcoming: number;
  grossEarnings: number;
  todayCount: number;
} {
  const { useDemoSamples, apiError, dashboardStats, demoAppointments } = params;

  if (!useDemoSamples && apiError) {
    return { completed: 0, upcoming: 0, grossEarnings: 0, todayCount: 0 };
  }

  if (!useDemoSamples && dashboardStats) {
    const upcoming = dashboardStats.upcoming ?? 0;
    return {
      completed: dashboardStats.completed ?? 0,
      upcoming,
      grossEarnings: dashboardStats.grossEarnings ?? 0,
      todayCount: dashboardStats.today ?? upcoming,
    };
  }

  if (useDemoSamples) {
    const completed = demoAppointments.filter(a => a.status === 'completed').length;
    const upcoming = demoAppointments.filter(
      a => a.status === 'pending' || a.status === 'confirmed' || a.status === 'rescheduled',
    ).length;
    const grossEarnings = demoAppointments
      .filter(a => a.status === 'completed')
      .reduce((s, a) => s + a.fee, 0);
    return { completed, upcoming, grossEarnings, todayCount: upcoming };
  }

  return { completed: 0, upcoming: 0, grossEarnings: 0, todayCount: 0 };
}

export function doctorDashboardErrorBannerCopy(useDemoSamples: boolean): string {
  return useDemoSamples
    ? 'Could not load live data. Showing sample data.'
    : 'Could not load live data. Please retry shortly.';
}
