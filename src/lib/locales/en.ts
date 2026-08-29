export const en = {
  // Common
  appName: 'Kynthai',
  loading: 'Loading...',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  back: 'Back',
  next: 'Next',
  submit: 'Submit',
  search: 'Search...',
  noResults: 'No results found',
  error: 'Something went wrong',
  retry: 'Try again',

  // Navigation
  nav: {
    home: 'Home',
    meds: 'Meds',
    findCare: 'Find Care',
    askAI: 'Ask AI',
    tools: 'Tools',
    emergency: 'Emergency',
    orders: 'Orders',
  },

  // Patient Dashboard
  dashboard: {
    greeting: 'Good {timeOfDay}',
    stayOnTrack: 'Stay on track today',
    subtitle: 'Your meds, your AI assistant, your care — all in one place.',
    todaySchedule: "Today's schedule",
    overdue: 'Overdue',
    upcoming: 'Upcoming',
    completed: 'Completed',
    noReminders: 'No reminders yet',
    addMedication: 'Add a medication to start getting reminders.',
    adherence: 'Adherence',
    taken: 'Taken',
    pending: 'Pending',
    skipped: 'Skipped',
  },

  // Medications
  meds: {
    title: 'My Medications',
    addNew: 'Add Medication',
    search: 'Search medications...',
    noMeds: 'No medications yet',
    addFirst: 'Tap "Add" to create your first medication reminder.',
    active: 'Active',
    paused: 'Paused',
    pause: 'Pause reminders',
    resume: 'Resume reminders',
    deleteConfirm: 'Delete {name}?',
    deleteWarning: 'This will remove the medication and all its reminders. This action cannot be undone.',
    name: 'Medicine name',
    namePlaceholder: 'e.g. Metformin',
    dosage: 'Dosage',
    dosagePlaceholder: 'e.g. 500mg',
    frequency: 'Frequency',
    times: 'Reminder times',
    addTime: 'Add time',
    instructions: 'Instructions (optional)',
    instructionsPlaceholder: 'e.g. Take with food and a full glass of water',
    notes: 'Notes (optional)',
    notesPlaceholder: 'e.g. For blood sugar control',
    colorTag: 'Color tag',
    saveMedication: 'Save medication',
    stock: 'Stock',
    remaining: 'remaining',
    refillNeeded: 'Refill needed',
    inStock: 'In stock',
    outOfStock: 'Out of stock',
    takeOne: 'Take One',
    refill: 'Refill',
    orderNow: 'Order Now',
  },

  // AI Chat
  chat: {
    title: 'Kynthai Assistant',
    subtitle: 'AI-powered medication Q&A',
    placeholder: 'Ask about your medications...',
    clear: 'Clear conversation',
    thinking: 'Thinking...',
    disclaimer: 'For informational purposes only. Always consult a healthcare professional.',
    suggestions: {
      sideEffects: 'What are common side effects of Metformin?',
      reminders: 'How do I remember to take my pills on time?',
      foodInteraction: 'Can I take Vitamin D with food?',
      avoidFoods: 'What foods should I avoid while on blood pressure medication?',
    },
  },

  // Family
  family: {
    title: 'Family Health',
    members: '{count} members',
    avgAdherence: '{score}% avg',
    addMember: 'Add Member',
    selectMember: 'Select a family member',
    selectMemberHint: 'Choose someone above to manage their medications.',
    escalatedAlerts: 'Escalated alerts',
    noAlerts: 'All clear — no escalations right now.',
    member: '{name} ({relation})',
    adherence: 'Adherence',
    pending: '{count} pending',
    lowStock: '{count} low stock',
    allCaughtUp: 'All caught up',
  },

  // Emergency
  emergency: {
    title: 'Emergency SOS',
    triggerFor: 'Trigger an emergency for {name}.',
    description: 'Notifies your caretaker and linked doctors. Contact local emergency services if needed.',
    critical: 'SOS — Critical',
    criticalDesc: 'Local emergency services, doctors, and emergency contacts',
    caretaker: 'Alert Caretaker',
    caretakerDesc: 'Not life-threatening — caretaker will reach out',
    notifying: 'Notifying emergency contacts...',
    triggered: 'Emergency triggered for {name}',
    helpOnWay: 'Help is on the way. Stay calm and keep the patient comfortable.',
    notifiedDoctors: 'Notified doctors',
    medicalSummary: 'Medical summary shared',
  },

  // Pricing
  pricing: {
    title: 'Choose your plan',
    subtitle: 'Start free, upgrade when you need more.',
    free: 'Free',
    freeTagline: 'Start your health journey — free forever',
    plus: 'Plus',
    plusTagline: 'Unlimited AI, advanced insights, priority support',
    familyPro: 'Family Pro',
    familyProTagline: 'Manage up to 4 members, full family dashboard',
    monthly: 'Monthly',
    yearly: 'Yearly',
    savePercent: 'Save {percent}%',
    currentPlan: 'Current Plan',
    upgrade: 'Upgrade',
    perMonth: '/month',
    perYear: '/year',
  },

  // Onboarding
  onboarding: {
    welcome: 'Welcome to Kynthai',
    slide1Title: 'Welcome to Kynthai',
    slide1Desc: 'Your AI health companion for the whole family — reminders, insights, doctors and labs, all in one calm, beautiful app.',
    slide2Title: 'Care for the whole family',
    slide2Desc: 'Add up to four family members. Caretakers get live adherence updates and weekly AI insights — so nobody misses a dose.',
    slide3Title: 'Never miss a medicine',
    slide3Desc: 'Smart reminders, drug-interaction checks, and AI schedule parsing — managing meds has never felt this easy.',
    getStarted: 'Get Started',
    continue: 'Continue',
    skip: 'Skip',
  },

  // Auth
  auth: {
    signIn: 'Sign In',
    signUp: 'Create Account',
    email: 'Email',
    password: 'Password',
    name: 'Full name',
    phone: 'Phone (+1 (555) 123-4567)',
    dob: 'Date of birth',
    emergencyContact: 'Emergency Contact 1',
    termsAgree: 'I agree to the Terms of Service and Privacy Policy',
    privacyConsent: 'I consent to the processing of my personal and health data for service delivery under Health Data Protection',
    aiConsent: 'I optionally agree to let Kynthai use de-identified health data to improve AI features',
    createAccount: 'Create Account',
    orContinue: 'or',
    demoMode: 'Continue with {portal} account',
    tryDemo: 'TRY A DEMO',
    demoDesc: 'One tap to explore any portal with sample data.',
  },

  // Health Score
  healthScore: {
    title: 'Health Score',
    excellent: 'Excellent',
    good: 'Good',
    needsAttention: 'Needs Attention',
    breakdown: 'Score Breakdown',
    medicationAdherence: 'Medication Adherence',
    symptomTracking: 'Symptom Tracking',
    healthJournal: 'Health Journal',
    familyEngagement: 'Family Engagement',
  },

  // Streaks
  streaks: {
    title: 'Streaks & Achievements',
    activeStreaks: 'Active Streaks',
    earnedBadges: 'Earned Badges',
    nextMilestone: 'Next Milestone',
    noStreaks: 'Start taking your meds to build streaks!',
    noBadges: 'Complete health actions to earn badges!',
  },

  // Health Journal
  journal: {
    title: 'Health Journal',
    newEntry: 'New Entry',
    howFeeling: 'How are you feeling?',
    symptoms: 'Symptoms',
    vitals: 'Vitals (Optional)',
    bloodPressure: 'Blood Pressure',
    bloodSugar: 'Blood Sugar (mg/dL)',
    weight: 'Weight (kg)',
    temperature: 'Temperature (°F)',
    notes: 'Notes',
    notesPlaceholder: 'How was your day? Any observations about your health...',
    saveEntry: 'Save Entry',
    noEntries: 'No journal entries yet',
    startTracking: 'Start tracking your daily health to see trends!',
  },

  // Medicine Cabinet
  cabinet: {
    title: 'Medicine Cabinet',
    addMedicine: 'Add Medicine',
    remaining: 'Remaining: {remaining} / {total}',
    refillIn: 'Refill in {days} days',
    expires: 'Expires: {date}',
    noMedicines: 'No medicines in your cabinet',
    addFirst: 'Add your medications to track inventory and get refill reminders',
  },

  // Consultation Prep
  consultation: {
    title: 'Doctor Visit Prep',
    exportPdf: 'Export PDF',
    generateReport: 'Generate Report',
    patientInfo: 'Patient Information',
    currentMeds: 'Current Medications ({count})',
    adherenceRate: 'Adherence Rate',
    recentSymptoms: 'Recent Symptoms',
    allergies: 'Allergies',
    conditions: 'Conditions',
    questionsForDoctor: 'Questions for Your Doctor',
    noData: 'No consultation data available',
    startTracking: 'Start tracking your health to generate a doctor visit report',
  },

  // Family Feed
  feed: {
    title: 'Family Health Feed',
    noActivity: 'No activity yet',
    healthActivity: 'Health activity from your family will appear here',
  },

  // Profile
  profile: {
    title: 'Profile & Settings',
    email: 'Email',
    subscription: 'SUBSCRIPTION',
    freePlan: 'Free plan',
    freePlanDesc: '10 medications · 3 AI chats / day',
    settings: 'SETTINGS',
    darkMode: 'Dark mode',
    notifications: 'Notifications',
    language: 'Language',
  },

  // Time
  time: {
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
  },
} as const
