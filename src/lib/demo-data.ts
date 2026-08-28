/**
 * Demo data for preview/dev mode.
 *
 * All demo data lives in this single file so production components don't
 * need to inline furniture objects. Gate its usage with NODE_ENV !== 'production'
 * or NEXT_PUBLIC_ENABLE_DEMO === 'true'.
 */

// ── Medications ────────────────────────────────────────────────────────────

export const DEMO_MEDICATIONS_FATHER: Medication[] = [
  {
    id: 'dm1',
    name: 'Metformin',
    dosage: '500mg',
    times: ['08:00', '20:00'],
    frequency: '2x daily',
    instructions: 'After meals',
    active: true,
    color: 'emerald',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'dm2',
    name: 'Amlodipine',
    dosage: '5mg',
    times: ['08:00'],
    frequency: 'Once daily',
    instructions: 'After breakfast',
    active: true,
    color: 'teal',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'dm3',
    name: 'Atorvastatin',
    dosage: '10mg',
    times: ['22:00'],
    frequency: 'At bedtime',
    instructions: 'With water',
    active: true,
    color: 'blue',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'dm4',
    name: 'Aspirin',
    dosage: '75mg',
    times: ['08:00'],
    frequency: 'Once daily',
    instructions: 'With food',
    active: true,
    color: 'amber',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
] as const;

export const DEMO_MEDICATIONS_MOTHER: Medication[] = [
  {
    id: 'dm5',
    name: 'Thyroxine',
    dosage: '50mcg',
    times: ['07:00'],
    frequency: 'Once daily',
    instructions: 'Empty stomach, 30min before food',
    active: true,
    color: 'emerald',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'dm6',
    name: 'Calcium + D3',
    dosage: '500mg',
    times: ['20:00'],
    frequency: 'Once daily',
    instructions: 'After dinner',
    active: true,
    color: 'teal',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
];

export const DEMO_MEDICATIONS_CHILD: Medication[] = [
  {
    id: 'dm7',
    name: 'Cetirizine',
    dosage: '10mg',
    times: ['21:00'],
    frequency: 'As needed',
    instructions: 'For allergies',
    active: true,
    color: 'purple',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
];

// ── Reminders ──────────────────────────────────────────────────────────────

export function makeDemoReminders(date: string): Reminder[] {
  return [
    {
      id: 'dr1',
      medicationId: 'dm1',
      date,
      time: '08:00',
      status: 'taken',
      medication: DEMO_MEDICATIONS_FATHER[0] as any,
    },
    {
      id: 'dr2',
      medicationId: 'dm2',
      date,
      time: '13:00',
      status: 'pending',
      medication: DEMO_MEDICATIONS_FATHER[1] as any,
    },
    {
      id: 'dr3',
      medicationId: 'dm3',
      date,
      time: '18:00',
      status: 'pending',
      medication: DEMO_MEDICATIONS_FATHER[2] as any,
    },
  ] as Reminder[];
}

// ── Appointments ──────────────────────────────────────────────────────────

export const DEMO_APPOINTMENTS: Appointment[] = [
  {
    id: 'demo_a1',
    doctor: 'Dr. Sarah Chen',
    specialty: 'Cardiology',
    date: '2026-07-16',
    time: '10:00 AM',
    type: 'in-person',
    status: 'confirmed',
  },
  {
    id: 'demo_a2',
    doctor: 'Dr. James Miller',
    specialty: 'General Care',
    date: '2026-07-22',
    time: '2:30 PM',
    type: 'video',
    status: 'upcoming',
  },
];

// ── Journal ────────────────────────────────────────────────────────────────

export const DEMO_JOURNAL: JournalEntry[] = [
  {
    id: 'j1',
    date: '2026-07-13',
    title: 'Feeling better today',
    body: 'Took morning meds on time. Energy levels improving after breakfast.',
    mood: 'good',
  },
  {
    id: 'j2',
    date: '2026-07-12',
    title: 'Rough night',
    body: 'Could not sleep well. Woke up around 3 AM. Need to adjust evening routine.',
    mood: 'bad',
  },
  {
    id: 'j3',
    date: '2026-07-11',
    title: 'Good walk in the park',
    body: 'Walked 30 minutes. Appetite is back. No headaches today.',
    mood: 'good',
  },
  {
    id: 'j4',
    date: '2026-07-10',
    title: 'Starting new medication',
    body: 'Began the new course today. Doctor advised to take after meals.',
    mood: 'okay',
  },
];

// ── Doctor sample data ─────────────────────────────────────────────────────

export const DEMO_DOCTOR_APPOINTMENTS: Appointment[] = [
  {
    id: 'demo_a1',
    patientName: 'Alex Johnson',
    time: '10:30 AM',
    date: 'Today',
    type: 'video',
    status: 'upcoming',
    fee: 75,
  },
  {
    id: 'demo_a2',
    patientName: 'Jordan Smith',
    time: '12:00 PM',
    date: 'Today',
    type: 'video',
    status: 'upcoming',
    fee: 75,
  },
  {
    id: 'demo_a3',
    patientName: 'Casey Lee',
    time: '09:00 AM',
    date: 'Yesterday',
    type: 'video',
    status: 'completed',
    fee: 75,
  },
  {
    id: 'demo_a4',
    patientName: 'Taylor Reed',
    time: '02:00 PM',
    date: 'Yesterday',
    type: 'in-person',
    status: 'completed',
    fee: 55,
  },
];

export const DEMO_DOCTOR_PRESCRIPTIONS: Prescription[] = [
  {
    id: 'demo_rx1',
    patientId: 'p1',
    patientName: 'Alex Johnson',
    medication: 'Lisinopril 10mg',
    date: 'Today',
    status: 'active',
    followUpDate: null,
    medications: [{ name: 'Lisinopril', dosage: '10mg', frequency: 'Once daily' }],
  },
  {
    id: 'demo_rx2',
    patientId: 'p2',
    patientName: 'Jordan Smith',
    medication: 'Atorvastatin 20mg',
    date: 'Today',
    status: 'active',
    followUpDate: null,
    medications: [{ name: 'Atorvastatin', dosage: '20mg', frequency: 'Once daily' }],
  },
  {
    id: 'demo_rx3',
    patientId: 'p3',
    patientName: 'Casey Lee',
    medication: 'Amoxicillin 500mg',
    date: 'Yesterday',
    status: 'active',
    followUpDate: null,
    medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'Three times daily' }],
  },
];

// ── AI Chat welcome ────────────────────────────────────────────────────────

export const DEMO_AI_WELCOME = `Hi! I'm **Kynthai**, your AI health & medication assistant. I'm here to help you understand your medicines, manage side effects, and feel confident about your health.

**How can I help you today?** Try asking about:
• Any medicine you're taking
• Side effects you're experiencing
• Food or drink interactions
• When to take your medications`;

export const DEMO_AI_FALLBACK = `I'm Kynthai, your **health & medication** assistant. I'm here to help you understand your medicines, manage your health, and feel confident about your care.

**In this demo, I can help with 20+ common medicines** including Metformin, Atorvastatin, Amoxicillin, Omeprazole, Losartan, Aspirin, Levothyroxine, and more.

Try asking me things like:
• "What is Metformin used for?"
• "What are the side effects of Atorvastatin?"
• "Can I take Aspirin with food?"

For full capabilities — symptom analysis, drug interactions, and personalized health advice — create your free account. Your health journey starts here. 💚`;

// ── Health metrics ────────────────────────────────────────────────────────

export const DEMO_HEALTH_METRICS: HealthMetric[] = [
  {
    label: 'Blood Pressure',
    value: '118/76',
    unit: 'mmHg',
    icon: HeartPulse,
    trend: 'stable',
    color: 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/30',
  },
  {
    label: 'Blood Glucose',
    value: '102',
    unit: 'mg/dL',
    icon: Droplets,
    trend: 'up',
    color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30',
  },
  {
    label: 'Weight',
    value: '72.4',
    unit: 'kg',
    icon: Weight,
    trend: 'down',
    color: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30',
  },
  {
    label: 'Body Temp',
    value: '98.6',
    unit: '°F',
    icon: Thermometer,
    trend: 'stable',
    color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30',
  },
];

// ── Family member medications map ─────────────────────────────────────────

export const DEMO_FAMILY_MEDICATIONS: Record<string, Medication[]> = {
  fm1: DEMO_MEDICATIONS_FATHER,
  fm2: DEMO_MEDICATIONS_MOTHER,
  fm3: DEMO_MEDICATIONS_CHILD,
};

// ── Family member meds with full Medication shape (for caretaker) ───────────

export interface MemberMed {
  id: string;
  medicationId: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions?: string;
  status?: string;
  color: string;
  date: string;
  time: string;
}

export const DEMO_MEMBER_MEDS: Record<string, MemberMed[]> = {
  fm1: [
    {
      id: 'fm1-m1',
      medicationId: 'dm1',
      name: 'Metformin',
      dosage: '500mg',
      frequency: '2x daily',
      instructions: 'After meals',
      status: 'active',
      color: 'emerald',
      date: '2026-07-15',
      time: '08:00',
    },
    {
      id: 'fm1-m1b',
      medicationId: 'dm1b',
      name: 'Metformin',
      dosage: '500mg',
      frequency: '2x daily',
      instructions: 'After dinner',
      status: 'active',
      color: 'emerald',
      date: '2026-07-15',
      time: '20:00',
    },
    {
      id: 'fm1-m2',
      medicationId: 'dm2',
      name: 'Amlodipine',
      dosage: '5mg',
      frequency: 'Once daily',
      instructions: 'After breakfast',
      status: 'active',
      color: 'teal',
      date: '2026-07-15',
      time: '08:00',
    },
    {
      id: 'fm1-m3',
      medicationId: 'dm3',
      name: 'Atorvastatin',
      dosage: '10mg',
      frequency: 'At bedtime',
      instructions: 'With water',
      status: 'active',
      color: 'blue',
      date: '2026-07-15',
      time: '22:00',
    },
    {
      id: 'fm1-m4',
      medicationId: 'dm4',
      name: 'Aspirin',
      dosage: '75mg',
      frequency: 'Once daily',
      instructions: 'With food',
      status: 'active',
      color: 'amber',
      date: '2026-07-15',
      time: '08:00',
    },
  ],
  fm2: [
    {
      id: 'fm2-m1',
      medicationId: 'dm5',
      name: 'Thyroxine',
      dosage: '50mcg',
      frequency: 'Once daily',
      instructions: 'Empty stomach, 30min before food',
      status: 'active',
      color: 'emerald',
      date: '2026-07-15',
      time: '07:00',
    },
    {
      id: 'fm2-m2',
      medicationId: 'dm6',
      name: 'Calcium + D3',
      dosage: '500mg',
      frequency: 'Once daily',
      instructions: 'After dinner',
      status: 'active',
      color: 'teal',
      date: '2026-07-15',
      time: '20:00',
    },
  ],
  fm3: [
    {
      id: 'fm3-m1',
      medicationId: 'dm7',
      name: 'Cetirizine',
      dosage: '10mg',
      frequency: 'As needed',
      instructions: 'For allergies',
      status: 'active',
      color: 'purple',
      date: '2026-07-15',
      time: '21:00',
    },
  ],
};

// ── Doctor / Lab profile data ───────────────────────────────────────────────

export interface LabProfile {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  tests: string[];
  rating: number;
  verified: boolean;
}

export const DEMO_LAB_PROFILE: LabProfile = {
  id: 'demo_lab',
  name: 'Kynthai Diagnostic Center',
  city: 'Austin, TX',
  address: '1234 Health Blvd, Austin, TX 78701',
  phone: '+1 (512) 555-0142',
  email: 'demo@kynthaidiagnostics.com',
  tests: [
    'Complete Blood Count (CBC)',
    'Lipid Panel',
    'HbA1c',
    'Thyroid Function',
    'Vitamin D',
    'Liver Function',
  ],
  rating: 4.8,
  verified: true,
};

// ── Admin dashboard data ────────────────────────────────────────────────────

export interface DoctorApp {
  id: string;
  name: string;
  specialty: string;
  city: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

export interface LabApp {
  id: string;
  name: string;
  city: string;
  tests: number;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

export interface ChurnRisk {
  id: string;
  name: string;
  tier: string;
  risk: 'high' | 'medium' | 'low';
  daysSinceActivity: number;
  lastActive: string;
}

export interface FraudFlag {
  id: string;
  type: string;
  entity: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  flaggedAt: string;
}

export interface PartnerRevenueRow {
  id: string;
  name: string;
  type: 'doctor' | 'lab';
  grossRevenue: number;
  commission: number;
  netPayout: number;
  period: string;
}

export interface SubscriptionRevenue {
  plus: { subscribers: number; revenue: number };
  familyPro: { subscribers: number; revenue: number };
  period: string;
}

export const ADMIN_DOCTOR_APPS: DoctorApp[] = [
  {
    id: 'da1',
    name: 'Dr. Sarah Johnson',
    specialty: 'Cardiology',
    city: 'Austin, TX',
    email: 'sarah@demo.com',
    status: 'pending',
    submittedAt: '2026-07-14',
  },
  {
    id: 'da2',
    name: 'Dr. Michael Chen',
    specialty: 'General Medicine',
    city: 'Chicago, IL',
    email: 'mchen@demo.com',
    status: 'pending',
    submittedAt: '2026-07-13',
  },
  {
    id: 'da3',
    name: 'Dr. Emily Rodriguez',
    specialty: 'Dermatology',
    city: 'San Francisco, CA',
    email: 'emily@demo.com',
    status: 'approved',
    submittedAt: '2026-07-10',
  },
];

export const ADMIN_LAB_APPS: LabApp[] = [
  {
    id: 'la1',
    name: 'HealthStreet Labs',
    city: 'Austin, TX',
    tests: 24,
    email: 'hs@demo.com',
    status: 'pending',
    submittedAt: '2026-07-14',
  },
  {
    id: 'la2',
    name: 'National Diagnostic Network',
    city: 'Dallas, TX',
    tests: 48,
    email: 'ndn@demo.com',
    status: 'approved',
    submittedAt: '2026-07-08',
  },
];

export const ADMIN_CHURN_RISKS: ChurnRisk[] = [
  {
    id: 'cr1',
    name: 'Jordan M.',
    tier: 'free',
    risk: 'high',
    daysSinceActivity: 12,
    lastActive: '2026-07-03',
  },
  {
    id: 'cr2',
    name: 'Taylor R.',
    tier: 'plus',
    risk: 'medium',
    daysSinceActivity: 8,
    lastActive: '2026-07-07',
  },
  {
    id: 'cr3',
    name: 'Morgan L.',
    tier: 'free',
    risk: 'low',
    daysSinceActivity: 5,
    lastActive: '2026-07-10',
  },
];

export const ADMIN_FRAUD_FLAGS: FraudFlag[] = [
  {
    id: 'ff1',
    type: 'Suspicious booking pattern',
    entity: 'Dr. Imran K.',
    severity: 'high',
    description: 'Multiple overlapping appointments detected',
    flaggedAt: '2026-07-15',
  },
  {
    id: 'ff2',
    type: 'Fake lab registration',
    entity: 'QuickLab Inc.',
    severity: 'high',
    description: 'No valid business license found',
    flaggedAt: '2026-07-14',
  },
  {
    id: 'ff3',
    type: 'Unusual prescription volume',
    entity: 'Patient X',
    severity: 'medium',
    description: '8 prescriptions in 30 days',
    flaggedAt: '2026-07-13',
  },
];

export const ADMIN_PARTNER_REVENUE: PartnerRevenueRow[] = [
  {
    id: 'pr1',
    name: 'Dr. Sarah Chen',
    type: 'doctor',
    grossRevenue: 4200,
    commission: 630,
    netPayout: 3570,
    period: 'July 2026',
  },
  {
    id: 'pr2',
    name: 'Dr. James Miller',
    type: 'doctor',
    grossRevenue: 3100,
    commission: 465,
    netPayout: 2635,
    period: 'July 2026',
  },
  {
    id: 'pr3',
    name: 'Dr. A. Patel',
    type: 'doctor',
    grossRevenue: 2800,
    commission: 420,
    netPayout: 2380,
    period: 'July 2026',
  },
  {
    id: 'pr4',
    name: 'Kynthai Diagnostic Center',
    type: 'lab',
    grossRevenue: 5400,
    commission: 972,
    netPayout: 4428,
    period: 'July 2026',
  },
  {
    id: 'pr5',
    name: 'HealthStreet Labs',
    type: 'lab',
    grossRevenue: 3200,
    commission: 576,
    netPayout: 2624,
    period: 'July 2026',
  },
  {
    id: 'pr6',
    name: 'National Diagnostic',
    type: 'lab',
    grossRevenue: 2100,
    commission: 378,
    netPayout: 1722,
    period: 'July 2026',
  },
];

export const ADMIN_SUB_REVENUE: SubscriptionRevenue = {
  plus: { subscribers: 420, revenue: 420 * 9.99 },
  familyPro: { subscribers: 130, revenue: 130 * 19.99 },
  period: 'July 2026',
};

// ── Care journey timeline ───────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  type: 'prescription' | 'lab' | 'consultation';
  title: string;
  description: string;
  date: string;
  status: 'active' | 'completed' | 'accepted' | 'pending';
  doctorOrLab: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function getDemoTimeline(): TimelineEvent[] {
  const now = Date.now();
  return [
    {
      id: 'tl1',
      type: 'prescription',
      status: 'active',
      title: 'New Prescription Issued',
      description: 'Metformin 500mg + Atorvastatin 10mg — Dr. Rajesh Kumar',
      date: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      doctorOrLab: 'Dr. Rajesh Kumar',
    },
    {
      id: 'tl2',
      type: 'lab',
      status: 'completed',
      title: 'Lab Test Completed',
      description: 'Complete Blood Count — MediTest Labs',
      date: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      doctorOrLab: 'MediTest Labs',
    },
    {
      id: 'tl3',
      type: 'prescription',
      status: 'accepted',
      title: 'Prescription Renewed',
      description: 'Vitamin D3 60K IU — Dr. Rajesh Kumar',
      date: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      doctorOrLab: 'Dr. Rajesh Kumar',
    },
  ];
}

// ── Chronic conditions ──────────────────────────────────────────────────────

export interface DemoCondition {
  id: string;
  name: string;
  status: 'controlled' | 'borderline' | 'needs_attention';
  value: string;
  note: string;
}

export const DEMO_CONDITIONS: DemoCondition[] = [
  {
    id: 'c1',
    name: 'Type 2 Diabetes',
    status: 'controlled',
    value: '142 mg/dL',
    note: 'HbA1c 6.2% — within target',
  },
  {
    id: 'c2',
    name: 'Hypertension',
    status: 'borderline',
    value: '128/84 mmHg',
    note: 'Slightly elevated — monitor daily',
  },
  {
    id: 'c3',
    name: 'Hypothyroidism',
    status: 'controlled',
    value: 'TSH 3.1',
    note: 'Within normal range',
  },
];

// ── Notifications ───────────────────────────────────────────────────────────

export interface DemoNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'reminder' | 'achievement' | 'system' | 'alert';
  icon?: React.ComponentType<{ className?: string }>;
}

export const DEMO_NOTIFICATIONS: DemoNotification[] = [
  {
    id: 'dn1',
    title: 'Medication Reminder',
    message: 'Time to take Metformin 500mg',
    time: '15m ago',
    read: false,
    type: 'reminder',
  },
  {
    id: 'dn2',
    title: '7-Day Streak!',
    message: "You've taken all medications for 7 days straight",
    time: '2h ago',
    read: false,
    type: 'achievement',
  },
  {
    id: 'dn3',
    title: 'Notes Updated',
    message: 'Your caretaker updated your health notes',
    time: '5h ago',
    read: true,
    type: 'system',
  },
  {
    id: 'dn4',
    title: 'App Updated',
    message: 'Kynthai 2.1 is now available with new features',
    time: '1d ago',
    read: true,
    type: 'system',
  },
];

// ── Challenge templates ─────────────────────────────────────────────────────

export interface ChallengeTemplate {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  target: number;
  unit: string;
}

export const DEMO_CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'ct1',
    title: '5 Journal Entries',
    description: 'Log 5 health journal entries this week',
    icon: BookOpen,
    target: 5,
    unit: 'entries',
  },
  {
    id: 'ct2',
    title: 'Perfect Adherence',
    description: 'Take all medications on time for 7 days',
    icon: Pill,
    target: 7,
    unit: 'days',
  },
  {
    id: 'ct3',
    title: 'AI Health Chat',
    description: 'Ask the AI assistant 3 health questions',
    icon: Bot,
    target: 3,
    unit: 'chats',
  },
  {
    id: 'ct4',
    title: 'Family Check-in',
    description: 'Check in with 2 family members',
    icon: Users,
    target: 2,
    unit: 'members',
  },
];

// ── Patient-side prescriptions (from a doctor to this patient) ──────────────

export interface PatientPrescription {
  id: string;
  doctorName: string;
  medications: { name: string; dosage: string; frequency: string }[];
  date: string;
  followUpDate: string | null;
  status: string;
}

export const DEMO_PATIENT_PRESCRIPTIONS: PatientPrescription[] = [
  {
    id: 'pp1',
    doctorName: 'Dr. Anjali Mehta',
    medications: [
      { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily with meals' },
      { name: 'Atorvastatin', dosage: '10mg', frequency: 'Once daily at bedtime' },
    ],
    date: '2026-07-15',
    followUpDate: '2026-08-15',
    status: 'active',
  },
];

// ── Daily priorities ────────────────────────────────────────────────────────

export interface Priority {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  icon: React.ComponentType<{ className?: string }>;
  action?: { label: string; onClick: () => void };
}

export function getDemoPriorities(onNavigate?: (tab: string) => void): Priority[] {
  return [
    {
      id: 'demo_dp1',
      title: 'Take Metformin 500mg',
      description: 'Due at 8:00 AM — take after breakfast',
      priority: 'high',
      icon: Pill,
      action: onNavigate ? { label: 'Mark taken', onClick: () => onNavigate('meds') } : undefined,
    },
    {
      id: 'demo_dp2',
      title: 'Log your symptoms',
      description: "Track how you're feeling today",
      priority: 'medium',
      icon: BookOpen,
      action: onNavigate
        ? { label: 'Open journal', onClick: () => onNavigate('journal') }
        : undefined,
    },
    {
      id: 'demo_dp3',
      title: 'Chat with Dr. Kynthai',
      description: 'Ask about side effects or drug interactions',
      priority: 'low',
      icon: Bot,
      action: onNavigate ? { label: 'Start chat', onClick: () => onNavigate('ai') } : undefined,
    },
  ];
}

// ── Local type definitions (these interfaces are only used in this file) ─────

export interface Appointment {
  id: string;
  doctor?: string;
  specialty?: string;
  patientName?: string;
  date: string;
  time: string;
  type: 'in-person' | 'video';
  status: string;
  fee?: number;
  price?: number;
  commission?: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  body: string;
  mood: 'good' | 'okay' | 'bad';
}

export interface HealthMetric {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  trend: 'up' | 'down' | 'stable';
  color: string;
}

export interface Prescription {
  id: string;
  patientId?: string;
  patientName: string;
  medication: string;
  medications?: Array<{ name: string; dosage: string; frequency: string }>;
  date: string;
  followUpDate?: string | null;
  status?: string;
}

// ── Type imports (must be last) ─────────────────────────────────────────────

import type { Medication, Reminder } from '@/lib/types';
import {
  HeartPulse,
  Droplets,
  Weight,
  Thermometer,
  BookOpen,
  Pill,
  Bot,
  Users,
} from 'lucide-react';
