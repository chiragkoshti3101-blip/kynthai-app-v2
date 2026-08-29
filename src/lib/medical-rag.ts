/**
 * Medical RAG — Retrieval Augmented Generation for the Kynthai AI chat.
 *
 * Injects relevant medical knowledge chunks into the LLM prompt so the
 * generic model responds with specific, accurate healthcare information
 * instead of generic chatbot replies.
 *
 * Flow: User message → retrieve relevant chunks → inject into system prompt
 */

interface MedicalChunk {
  id: string;
  type: 'drug_info' | 'interaction' | 'condition' | 'guideline' | 'emergency';
  title: string;
  content: string;
  keywords: string[];
  urgency: 'info' | 'caution' | 'warning' | 'emergency';
}

/**
 * Tokenize a query into normalized search terms.
 * Strips punctuation, lowercases, removes stop words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(
      w =>
        w.length > 2 &&
        ![
          'the',
          'and',
          'for',
          'are',
          'but',
          'not',
          'you',
          'all',
          'can',
          'had',
          'her',
          'was',
          'one',
          'our',
          'out',
          'has',
          'have',
          'been',
          'will',
          'with',
          'this',
          'that',
          'they',
          'from',
          'what',
          'when',
          'much',
          'many',
          'more',
          'some',
          'does',
          'like',
          'just',
          'know',
          'take',
          'took',
          'able',
          'about',
        ].includes(w)
    );
}

/**
 * Score a chunk against query tokens by keyword overlap.
 */
function scoreChunk(chunk: MedicalChunk, tokens: string[]): number {
  let score = 0;
  const chunkText = `${chunk.title} ${chunk.content} ${chunk.keywords.join(' ')}`.toLowerCase();
  for (const token of tokens) {
    if (chunk.keywords.some(kw => kw.includes(token) || token.includes(kw))) {
      score += 3; // keyword match is strongest
    } else if (chunkText.includes(token)) {
      score += 1; // content match
    }
  }
  return score;
}

/**
 * Retrieve the top N most relevant medical knowledge chunks for a query.
 */
export function retrieve(query: string, maxChunks = 3): MedicalChunk[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = MEDICAL_KNOWLEDGE_BASE.map(chunk => ({
    chunk,
    score: scoreChunk(chunk, tokens),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter(s => s.score > 0)
    .slice(0, maxChunks)
    .map(s => s.chunk);
}

/**
 * Format retrieved chunks into a context string for injection into the system prompt.
 */
export function buildContext(chunks: MedicalChunk[]): string {
  if (chunks.length === 0) return '';

  const lines: string[] = [
    '\n---',
    '## Relevant medical knowledge (use this to inform your response)',
    '',
  ];

  for (const chunk of chunks) {
    const urgency =
      chunk.urgency === 'emergency'
        ? '🚨 EMERGENCY'
        : chunk.urgency === 'warning'
          ? '⚠️ WARNING'
          : chunk.urgency === 'caution'
            ? '⚡ CAUTION'
            : '📋 INFO';

    lines.push(`### ${urgency}: ${chunk.title}`);
    lines.push(chunk.content);
    lines.push('');
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Build a RAG-enhanced system prompt for a given user query.
 */
export function getSystemPromptWithRAG(query: string, basePrompt: string): string {
  const chunks = retrieve(query, 3);
  const context = buildContext(chunks);
  if (!context) return basePrompt;
  return basePrompt + '\n' + context;
}

/**
 * Check if a query needs RAG enhancement (skip for simple greetings).
 */
export function needsRag(query: string): boolean {
  const greetings = [
    'hello',
    'hi',
    'hey',
    'good morning',
    'good evening',
    'howdy',
    'sup',
    'whatsup',
  ];
  const normalized = query.toLowerCase().trim();
  if (greetings.some(g => normalized === g || normalized.startsWith(g + ' '))) return false;
  if (normalized.length < 4) return false;
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// MEDICAL KNOWLEDGE BASE
// ──────────────────────────────────────────────────────────────────────────────

const MEDICAL_KNOWLEDGE_BASE: MedicalChunk[] = [
  // ── EMERGENCY PROTOCOLS ──

  {
    id: 'emergency-001',
    type: 'emergency',
    title: 'Heart Attack Warning Signs',
    content: `**Contact your local emergency services immediately** if someone experiences:
- Chest pain or pressure (may feel like squeezing, fullness, or pain in the center of the chest that lasts more than a few minutes, or goes away and comes back)
- Pain or discomfort in one or both arms, the back, neck, jaw, or stomach
- Shortness of breath (with or without chest discomfort)
- Cold sweat, nausea, or lightheadedness

Women are more likely than men to experience shortness of breath, nausea/vomiting, and back or jaw pain. Don't wait — even if unsure, contact emergency services. Every minute matters.`,
    keywords: [
      'chest pain',
      'heart attack',
      'myocardial',
      'cardiac',
      'heart',
      '911',
      'emergency',
      'shortness of breath',
      'arm pain',
    ],
    urgency: 'emergency',
  },
  {
    id: 'emergency-002',
    type: 'emergency',
    title: 'Stroke Warning Signs (FAST)',
    content: `**Contact your local emergency services immediately** if you notice:
- **F**ace drooping: one side of the face droops or feels numb
- **A**rm weakness: one arm drifts downward when raised
- **S**peech difficulty: slured speech or trouble speaking/understanding
- **T**ime matters: contact emergency services immediately

Additional signs: sudden numbness/weakness, confusion, trouble seeing, dizziness, loss of balance, severe headache with no known cause. Time is critical — treatment is most effective within 3-4.5 hours.`,
    keywords: [
      'stroke',
      'face drooping',
      'arm weakness',
      'speech',
      'FAST',
      'paralysis',
      'numbness',
      'weakness',
      'confusion',
      'vision loss',
    ],
    urgency: 'emergency',
  },
  {
    id: 'emergency-003',
    type: 'emergency',
    title: 'Anaphylaxis (Severe Allergic Reaction)',
    content: `**Contact your local emergency services immediately**. Anaphylaxis is life-threatening.
Signs: difficulty breathing, swelling of throat/tongue, hives, rapid pulse, dizziness/fainting, nausea/vomiting, wheezing.
If the person has an epinephrine auto-injector (EpiPen), use it immediately while waiting for EMS. Do NOT drive yourself to the hospital.`,
    keywords: [
      'anaphylaxis',
      'allergic reaction',
      'epinephrine',
      'EpiPen',
      'swelling',
      'throat closing',
      'anaphylactic',
      'hives',
      'wheezing',
    ],
    urgency: 'emergency',
  },
  {
    id: 'emergency-004',
    type: 'emergency',
    title: 'When to Contact Emergency Services vs Urgent Care vs ER',
    content: `**Emergency services**: Chest pain, difficulty breathing, stroke symptoms, severe bleeding, head injury, poisoning, severe burns.
**Emergency Room**: Broken bones, severe pain without emergency symptoms, high fever (104°F+), severe vomiting/diarrhea causing dehydration.
**Urgent Care**: Minor cuts needing stitches, sprains, fever without alarming symptoms, flu symptoms, urinary symptoms, persistent diarrhea.
**Call Doctor/Telehealth**: Any uncertainty — better safe than sorry.`,
    keywords: ['911', 'emergency room', 'urgent care', 'ER', 'when to go', 'emergency', 'hospital'],
    urgency: 'emergency',
  },

  // ── DRUG INTERACTIONS ──

  {
    id: 'interaction-001',
    type: 'interaction',
    title: 'Blood Thinners + NSAIDs',
    content: `**Major interaction — avoid or use with caution.**
NSAIDs (ibuprofen, naproxen, aspirin at high doses) increase bleeding risk when combined with blood thinners like warfarin, apixaban (Eliquis), rivaroxaban (Xarelto), or clopidogrel (Plavix).
- This combination can significantly increase bleeding risk
- GI bleeding is a serious concern
- If pain relief is needed, acetaminophen (Tylenol) is generally safer — but even that has limits with warfarin

**Action**: Always consult your doctor or pharmacist before taking ANY pain medication with a blood thinner.`,
    keywords: [
      'warfarin',
      'blood thinner',
      'ibuprofen',
      'naproxen',
      'NSAID',
      'bleeding',
      'apixaban',
      'Eliquis',
      'Xarelto',
      'Plavix',
      'clopidogrel',
      'interaction',
      'aspirin',
    ],
    urgency: 'warning',
  },
  {
    id: 'interaction-002',
    type: 'interaction',
    title: 'Statins + Grapefruit',
    content: `**Avoid grapefruit juice with most statins.**
Grapefruit contains furanocoumarins that block the CYP3A4 enzyme, causing statin levels to rise 2-3x above normal. This dramatically increases the risk of muscle damage (rhabdomyolysis) and liver injury.
- Affected statins: atorvastatin (Lipitor), simvastatin (Zocor), lovastatin (Mevacor)
- NOT affected: rosuvastatin (Crestor), pravastatin (Pravachol) — can be taken with grapefruit
- One small glass of grapefruit juice can affect drug levels for up to 72 hours`,
    keywords: [
      'grapefruit',
      'statin',
      'atorvastatin',
      'simvastatin',
      'Lipitor',
      'Zocor',
      'interaction',
      'Crestor',
      'muscle pain',
      'liver',
    ],
    urgency: 'warning',
  },
  {
    id: 'interaction-003',
    type: 'interaction',
    title: 'Metformin + Contrast Dye',
    content: `**Important: Tell your doctor you take metformin before any imaging with IV contrast dye.**
IV contrast dye (used in CT scans, angiograms) can temporarily affect kidney function. When combined with metformin (which is processed by kidneys), there's a rare but serious risk of lactic acidosis.
- Before contrast: doctor may ask you to hold metformin for 48 hours
- After contrast: don't restart metformin until kidney function is confirmed normal
- If you had imaging with contrast and weren't told about this, call your doctor`,
    keywords: [
      'metformin',
      'contrast',
      'CT scan',
      'MRI',
      'imaging',
      'kidney',
      'contrast dye',
      'lactic acidosis',
      'IV contrast',
    ],
    urgency: 'warning',
  },
  {
    id: 'interaction-004',
    type: 'interaction',
    title: 'SSRIs + Other Serotonergic Drugs',
    content: `**Increased risk of serotonin syndrome.**
Combining SSRIs (fluoxetine, sertraline, escitalopram, citalopram, paroxetine) with other serotonergic drugs can cause serotonin syndrome — a potentially life-threatening condition.
Drugs to watch:
- Tramadol (pain medication)
- Triptans (migraine medications: sumatriptan, rizatriptan)
- Linezolid (antibiotic)
- St. John's Wort (herbal supplement)
- Dextromethorphan (cough syrup — cough/Cold medicines)
- Other antidepressants (don't combine two SSRIs or add an SNRI without doctor guidance)

Signs of serotonin syndrome: agitation, confusion, rapid heart rate, high blood pressure, dilated pupils, muscle rigidity, heavy sweating, diarrhea. Seek emergency care if these occur.`,
    keywords: [
      'SSRI',
      'sertraline',
      'fluoxetine',
      'escitalopram',
      'serotonin',
      'serotonin syndrome',
      'tramadol',
      'migraine',
      'triptan',
      'antidepressant',
      'interaction',
    ],
    urgency: 'warning',
  },
  {
    id: 'interaction-005',
    type: 'interaction',
    title: 'Common Antibiotics + Birth Control',
    content: `**Antibiotics can reduce birth control effectiveness.**
Certain antibiotics (especially rifampin, rifabutin) can make hormonal birth control less effective.
Broad-spectrum antibiotics like tetracycline and doxycycline may also reduce effectiveness — the evidence is less clear but caution is advised.
**Action**: Use backup contraception (condoms) while taking antibiotics and for 7 days after finishing the course. Ask your pharmacist for a medication review if concerned.`,
    keywords: [
      'antibiotic',
      'birth control',
      'contraceptive',
      'pill',
      'BCP',
      'amoxicillin',
      'doxycycline',
      'tetracycline',
      'rifampin',
      'pregnancy',
      'interaction',
    ],
    urgency: 'caution',
  },
  {
    id: 'interaction-006',
    type: 'interaction',
    title: 'Omeprazole/PPIs + Clopidogrel',
    content: `**Reduced effectiveness of clopidogrel (Plavix) with certain PPIs.**
Omeprazole (Prilosec) and esomeprazole (Nexium) can reduce the antiplatelet effect of clopidogrel via CYP2C19 inhibition.
- Pantoprazole (Protonix) has less interaction
- Consider timing: take PPI 12 hours apart from clopidogrel if using omeprazole
- Discuss alternatives with your cardiologist or pharmacist`,
    keywords: [
      'omeprazole',
      'PPI',
      'clopidogrel',
      'Plavix',
      'Nexium',
      'Protonix',
      'antacid',
      'interaction',
      'blood thinner',
      'heart',
    ],
    urgency: 'caution',
  },

  // ── CONDITIONS ──

  {
    id: 'condition-001',
    type: 'condition',
    title: 'Type 2 Diabetes Management Basics',
    content: `**Understanding A1c targets:**
- Target A1c: below 7% for most adults with type 2 diabetes (ADA recommendation)
- More stringent: below 6.5% if achievable without hypoglycemia
- Less stringent: below 8% for those with shorter life expectancy or hypoglycemia risk

**3 pillars of management:**
1. **Medication adherence** — metformin is first-line. Don't skip doses — blood sugar rebounds within days.
2. **Diet** — consistent carbohydrate intake, portion control, limit sugary drinks. Mediterranean-style eating pattern recommended.
3. **Activity** — 150 minutes/week of moderate exercise (brisk walking, cycling). Resistance training 2x/week helps with insulin sensitivity.

**What A1c measures**: Your average blood glucose over the past 2-3 months. A 1% drop in A1c significantly reduces risk of kidney, eye, and nerve complications.`,
    keywords: [
      'diabetes',
      'A1c',
      'type 2',
      'blood sugar',
      'glucose',
      'insulin',
      'metformin',
      'HbA1c',
      'prediabetes',
      'glucose control',
    ],
    urgency: 'info',
  },
  {
    id: 'condition-002',
    type: 'condition',
    title: 'Hypertension (High Blood Pressure)',
    content: `**Understanding blood pressure readings:**
- Normal: below 120/80 mmHg
- Elevated: 120-129/<80
- Hypertension Stage 1: 130-139/80-89
- Hypertension Stage 2: 140+/90+
- Crisis: 180+/120+ (seek emergency care)

**Lifestyle factors that lower BP:**
- Reduce sodium to under 2,300mg/day (ideally 1,500mg)
- Regular exercise: 150 min/week moderate activity
- Weight loss (even 5-10 lbs helps)
- Limit alcohol (men: max 2 drinks/day; women: max 1)
- DASH diet: fruits, vegetables, whole grains, lean proteins, low-fat dairy
- Manage stress (linked to BP spikes)

**Medication adherence is critical** — high blood pressure often has no symptoms. Just because you feel fine doesn't mean it's controlled.`,
    keywords: [
      'hypertension',
      'blood pressure',
      'high BP',
      'lisinopril',
      'amlodipine',
      'metoprolol',
      ' pressure',
      'high blood',
      'dizziness',
      'headache',
    ],
    urgency: 'info',
  },
  {
    id: 'condition-003',
    type: 'condition',
    title: 'Managing Asthma: Controller vs Rescue',
    content: `**Two types of medications:**
1. **Controller (maintenance)**: inhaled corticosteroids (fluticasone, budesonide) — taken daily to reduce airway inflammation. THIS IS THE MOST IMPORTANT medication for asthma management.
2. **Rescue (reliever)**: albuterol (Ventolin, ProAir) — used during flare-ups. Works within minutes.

**Using your rescue inhaler correctly:**
- Shake well, exhale fully, put mouthpiece between teeth, press canister while slowly inhaling, hold breath for 10 seconds
- Use spacer if available — it delivers more medication to lungs
- If you need rescue inhaler more than twice a week (excluding exercise), your asthma isn't well-controlled — see your doctor

**Triggers to watch**: pollen, dust, pet dander, smoke, cold air, exercise, respiratory infections`,
    keywords: [
      'asthma',
      'inhaler',
      'albuterol',
      'rescue',
      'controller',
      'fluticasone',
      'breathe',
      'wheezing',
      'shortness of breath',
      'flovent',
    ],
    urgency: 'info',
  },
  {
    id: 'condition-004',
    type: 'condition',
    title: 'Depression and Antidepressant Medications',
    content: `**Key facts about antidepressants:**
- SSRIs (sertraline/Zoloft, fluoxetine/Prozac, escitalopram/Lexapro) are first-line treatments
- They typically take 4-6 weeks to show full effect — don't stop early if not feeling better immediately
- Common initial side effects (usually within first 1-2 weeks, subside): nausea, headache, sleep changes, mild anxiety
- Don't stop abruptly — taper under doctor supervision to avoid discontinuation syndrome

**Warning signs that need immediate attention:**
- Worsening depression or suicidal thoughts (especially in first few weeks for ages 18-24)
- Unusual agitation, restlessness, or panic attacks
- Call 988 (Suicide & Crisis Lifeline) or 911 if there's immediate danger

**Beyond medication**: Therapy (especially CBT), regular exercise, sleep hygiene, and social support are proven treatments alongside or instead of medication.`,
    keywords: [
      'depression',
      'antidepressant',
      'SSRI',
      'sertraline',
      'fluoxetine',
      'Lexapro',
      'Zoloft',
      'Prozac',
      'anxiety',
      'mood',
      'mental health',
      'suicide',
      '988',
      'CBT',
    ],
    urgency: 'info',
  },
  {
    id: 'condition-005',
    type: 'condition',
    title: 'Thyroid Disorders: Hypothyroidism',
    content: `**Hypothyroidism (underactive thyroid) basics:**
- Levothyroxine (Synthroid, Levoxyl) replaces the thyroid hormone your body isn't making
- MUST be taken on an empty stomach — 30-60 min before breakfast, with water only
- Wait 4 hours before calcium/iron supplements (they block absorption)
- Don't switch brands without doctor approval — small potency differences between brands
- Takes 4-6 weeks to see full effect after dose change
- Blood tests (TSH, T4) guide dose adjustments — never adjust dose yourself`,
    keywords: [
      'thyroid',
      'hypothyroid',
      'levothyroxine',
      'Synthroid',
      'TSH',
      'T4',
      'fatigue',
      'weight gain',
      'cold',
      'hair loss',
      'hair thinning',
    ],
    urgency: 'info',
  },

  // ── GUIDELINES ──

  {
    id: 'guideline-001',
    type: 'guideline',
    title: 'Medication Adherence Best Practices',
    content: `**Statistics**: About 50% of medications for chronic conditions are not taken as prescribed. This is one of the biggest preventable health problems worldwide.

**Proven strategies:**
1. **Link to routine** — take meds with a daily habit (breakfast, brushing teeth)
2. **Use a pill organizer** — weekly boxes labeled by day and time
3. **Set multiple reminders** — phone alarms at the exact times you need them
4. **Keep medication visible** — not in a cabinet where you'll forget
5. **Sync refills** — ask pharmacy to align all refill dates to the same day
6. **Medication list** — keep an updated list (paper or phone) with names, doses, and what each is for
7. **Travel preparation** — pack extra in case of delays, keep in carry-on, carry a doctor's note for injectables`,
    keywords: [
      'adherence',
      'compliance',
      'forgot',
      'missed',
      'reminder',
      'forget',
      'pill',
      'organizer',
      'routine',
      'habit',
      'skip',
      'consistency',
    ],
    urgency: 'info',
  },
  {
    id: 'guideline-002',
    type: 'guideline',
    title: 'Medication Disposal Safety',
    content: `**Don't flush medications down the toilet** — they contaminate water supply. Don't throw in trash where children/animals can access them.

**Safe disposal options:**
1. **Drug take-back programs**: DEA-authorized collection sites (pharmacies, law enforcement). Find one at: deadiversion.usdoj.gov
2. **Disposal bags**: Mix meds with undesirable substance (coffee grounds, kitty litter), seal in bag, trash.
3. **Flushing (when labeled)**: Only for opioids (oxycodone, hydrocodone, fentanyl) and benzodiazepines that specifically say "flush immediately" on the label.

Most states have take-back programs. The DEA holds National Prescription Drug Take-Back Days twice yearly.`,
    keywords: [
      'disposal',
      'dispose',
      'expired',
      'recycle',
      'trash',
      'flushing',
      'flush',
      'take back',
      'unused',
      'leftover',
      'throw away',
      'throw out',
    ],
    urgency: 'info',
  },
  {
    id: 'guideline-003',
    type: 'guideline',
    title: 'Understanding US Prescription Costs',
    content: `**Ways to reduce prescription costs:**
- **Generic substitution**: Same active ingredient, 80-85% cheaper. Ask your pharmacist or doctor.
- **$4 generic programs**: Walmart, CVS, Kroger, and others offer many generics at $4 for 30-day supply.
- **Manufacturer coupons**: Available for brand-name drugs (check manufacturer websites)
- **GoodRx/NeedyMeds**: Price comparison and discount cards — no insurance needed
- **State Pharmaceutical Assistance Programs (SPAP)**: Many states offer help for seniors
- **Medicare Part D Extra Help**: Low-income subsidy for Medicare beneficiaries
- **Patient assistance programs**: Manufacturer programs for uninsured/underinsured`,
    keywords: [
      'cost',
      'price',
      'insurance',
      'generic',
      'expensive',
      'afford',
      'copay',
      'GoodRx',
      'discount',
      'prescription cost',
      'coverage',
      'deductible',
    ],
    urgency: 'info',
  },
  {
    id: 'guideline-004',
    type: 'guideline',
    title: 'Pharmacist Consultation: What to Discuss',
    content: `**Your pharmacist is a free, underutilized healthcare resource.**
Pharmacists can review all your medications, check for interactions, counsel on proper use, and often have walk-in hours (no appointment needed).

**What to ask your pharmacist:**
- "Can you review all my medications together?" (comprehensive medication review)
- "What foods or drugs should I avoid with this?"
- "Can I get this as a generic?"
- "What's the best way to take this — with food, morning vs evening?"
- "Is there a cheaper alternative that works the same way?"
- "How should I dispose of medications I'm no longer taking?"
- "Does this interact with my other medications?" (especially OTC and supplements)`,
    keywords: [
      'pharmacist',
      'consult',
      'questions to ask',
      'OTC',
      'supplement',
      'vitamin',
      'herbal',
      'review',
      'check interaction',
    ],
    urgency: 'info',
  },

  // ── DRUG-SPECIFIC GUIDANCE ──

  {
    id: 'drug-guidance-001',
    type: 'guideline',
    title: 'Prednisone: Tapering and Side Effects',
    content: `**Prednisone is a powerful corticosteroid — important safety notes:**
- Never stop abruptly — can cause adrenal insufficiency
- Always follow tapering schedule prescribed by your doctor
- Short courses (5-7 days): usually no taper needed
- Longer courses (>2 weeks): gradual taper required
- Common long-term side effects: weight gain, increased appetite, mood changes, insomnia, elevated blood sugar, bone thinning
- Take with food to reduce stomach irritation
- Take in the morning to mimic natural cortisol rhythm (less sleep disruption)
- Calcium and vitamin D supplementation recommended for long-term use`,
    keywords: [
      'prednisone',
      'steroid',
      'corticosteroid',
      'taper',
      'cortisol',
      'weight gain',
      'insomnia',
      'mood',
      'bone',
      'inflammation',
      'arthritis',
      'pain',
    ],
    urgency: 'caution',
  },
  {
    id: 'drug-guidance-002',
    type: 'guideline',
    title: 'Pain Management: NSAIDs vs Acetaminophen',
    content: `**Choosing the right pain reliever:**
- **Acetaminophen (Tylenol)**: Safer for stomach, safe in pregnancy (Category B), but watch total daily dose (max 3,000-4,000mg). Does NOT reduce inflammation.
- **Ibuprofen (Advil, Motrin)**: Reduces inflammation. Take with food. Max 1,200mg/day OTC. Not safe in late pregnancy.
- **Naproxen (Aleve)**: Long-lasting (8-12 hours). Better for chronic pain. Same NSAID cautions as ibuprofen.
- **Aspirin**: Anti-inflammatory at high doses, anti-blood-clotting at low doses. Never give to children/teens with viral illness (Reye's syndrome risk).

**Red flags for pain**: Pain that wakes you at night, unexplained weight loss, fever + pain, sudden onset, or pain that worsens over weeks — see a doctor.`,
    keywords: [
      'pain',
      'ibuprofen',
      'acetaminophen',
      'Tylenol',
      'Advil',
      'Naproxen',
      'Aleve',
      'NSAID',
      'headache',
      'migraine',
      'back pain',
      'joint pain',
      'arthritic',
    ],
    urgency: 'caution',
  },
  {
    id: 'drug-guidance-003',
    type: 'guideline',
    title: 'Gabapentin: What Patients Should Know',
    content: `**Gabapentin (Neurontin) — important points:**
- Originally for seizures, commonly prescribed for nerve pain (neuropathy, shingles, diabetic nerve pain), and sometimes for anxiety
- Take consistently — same time each day
- Start low, increase gradually (reduces side effects)
- Initial drowsiness usually fades after 1-2 weeks
- Don't stop abruptly — taper under doctor guidance
- Avoid alcohol (increases sedation)
- May affect mental status in elderly — falls risk
- Some states classify gabapentin as a controlled substance due to misuse potential`,
    keywords: [
      'gabapentin',
      'Neurontin',
      'nerve pain',
      'neuropathy',
      'seizure',
      'shingles',
      'tingling',
      'numbness',
      'diabetic nerve',
      'anxiety',
    ],
    urgency: 'caution',
  },
  {
    id: 'drug-guidance-004',
    type: 'guideline',
    title: 'Furosemide (Lasix): Diuretic Guidance',
    content: `**Furosemide (Lasix) — loop diuretic:**
- Take in the MORNING to avoid nighttime bathroom trips
- Low potassium is a significant side effect — doctor may prescribe potassium supplement
- Potassium-rich foods help: bananas, oranges, potatoes, spinach
- Get up slowly from sitting/lying — can cause dizziness (orthostatic hypotension)
- Daily weight monitoring — sudden weight gain may mean fluid retention
- Report muscle cramps, irregular heartbeat, or confusion to doctor (may be potassium-related)
- Sun sensitivity increased — use sun protection`,
    keywords: [
      'furosemide',
      'Lasix',
      'diuretic',
      'water pill',
      'swelling',
      'edema',
      'potassium',
      'frequent urination',
      'leg swelling',
    ],
    urgency: 'caution',
  },
  {
    id: 'drug-guidance-005',
    type: 'guideline',
    title: 'Albuterol Inhaler: Proper Use',
    content: `**Using your albuterol rescue inhaler correctly:**
1. Remove cap and check mouthpiece
2. Breathe out fully (away from inhaler)
3. Place mouthpiece between teeth, close lips around it
4. Start breathing in slowly, press canister down, continue breathing in deeply
5. Hold breath for 10 seconds (or as long as comfortable)
6. Wait 1 minute between puffs if taking 2 puffs

**When to use**: Shortness of breath, wheezing, chest tightness, before exercise if prescribed.

**When to worry**: Using rescue inhaler more than twice a week (not counting exercise use) means asthma isn't controlled — see doctor. If no improvement after 2 puffs, seek emergency care.

**Cleaning**: Rinse mouthpiece weekly with warm water (no detergent), air dry.`,
    keywords: [
      'albuterol',
      'inhaler',
      'rescue',
      'wheezing',
      'shortness of breath',
      'asthma',
      'breathing',
      'Ventolin',
      'ProAir',
      'Proventil',
    ],
    urgency: 'info',
  },

  // ── GENERAL HEALTH GUIDANCE ──

  {
    id: 'guideline-005',
    type: 'guideline',
    title: 'Healthcare Navigation: Telehealth, Pharmacy, Prescriptions',
    content: `**Navigating healthcare in your country:**
- **Prescription delivery**: Most chain pharmacies (CVS, Walgreens, Walmart) offer home delivery. Setting up auto-refill saves trips.
- **Telehealth**: Covered by most insurance plans in 2025. Good for medication refills, allergy symptoms, skin issues, mental health.
- **Generic availability**: Ask your doctor if a generic is available — same active ingredient, much cheaper.
- **Pharmacy networks**: Check if your pharmacy is in-network to avoid surprise bills
- **Prescription synchronization**: Ask pharmacy to align all your monthly refill dates
- **GoodRx**: Free app showing pharmacy prices for cash payments (no insurance needed).`,
    keywords: [
      'telehealth',
      'pharmacy',
      'prescription',
      'CVS',
      'Walgreens',
      'Walmart',
      'refill',
      'delivery',
      'generic',
      'insurance',
      'cost',
      'GoodRx',
      'doctor appointment',
      'virtual',
    ],
    urgency: 'info',
  },
  {
    id: 'guideline-006',
    type: 'guideline',
    title: 'Medication Safety: Common Mistakes to Avoid',
    content: `**Common medication errors (and how to avoid them):**
1. **Double dosing**: Set phone reminders. Use a pill organizer.
2. **Mixing up similar-looking pills**: Keep original bottles until empty, label organizer.
3. **Taking expired meds**: Effectiveness decreases over time. Some (like tetracycline, nitroglycerin) become dangerous.
4. **Sharing medications**: Never share — what works for one person can harm another.
5. **Crushing/chewing extended-release pills**: Doctors sometimes prescribe these — check your prescription label.
6. **Not telling your doctor about supplements**: Herbal supplements can interact with medications.
7. **Stopping antibiotics early**: Always complete the full course, even if you feel better.
8. **Grapefruit juice interactions**: Affects 50+ medications (most statins, some blood pressure meds).`,
    keywords: [
      'safety',
      'overdose',
      'expired',
      'sharing',
      'crush',
      'chew',
      'antibiotic',
      'side effects',
      'interaction',
      'mixing',
      'mistake',
      'dangerous',
    ],
    urgency: 'warning',
  },
  {
    id: 'guideline-007',
    type: 'guideline',
    title: 'Child Safety and Medications',
    content: `**Keep children safe from medications:**
- Store ALL medications (prescription and OTC) up and locked away
- Requests "candy-flavored" liquid medications are still dangerous if overconsumed
- Never refer to medications as "candy" to encourage taking them
- Use child-resistant caps but don't rely on them alone
- Keep purses/ bags containing medications out of reach
- Grandparent safety: 2/3 of accidental pediatric exposures happen at grandparents' homes (generations.org)
- Poison control: 1-800-222-1222 — save this number`,
    keywords: [
      'children',
      'kids',
      'child',
      'pediatric',
      'pediatric',
      'poison',
      'toxic',
      'overdose',
      'baby',
      'toddler',
      'infant',
      'accidental',
      'safety',
      'grandparent',
    ],
    urgency: 'warning',
  },

  // ── US HEALTHCARE ──

  {
    id: 'us-health-001',
    type: 'guideline',
    title: 'Prescription Assistance Programs',
    content: `**If you can't afford your medications:**
- **Partnership for Prescription Assistance (pparx.org)**: Free service connects to 475+ patient assistance programs
- **NeedyMeds**: Government and nonprofit assistance programs database
- **RxAssist**: Lists pharmaceutical manufacturer patient assistance programs
- **Medicare Extra Help (Low-Income Subsidy)**: Covers Part D premiums, deductibles, copays for eligible Medicare beneficiaries
- **State programs**: Many states have prescription assistance for uninsured, disabled, or elderly residents
- **Hospital financial assistance**: Ask hospital billing departments — many have charity care
- **ACA Marketplace plans**: Must cover 10 essential health benefits including prescription drugs`,
    keywords: [
      'afford',
      'assistance',
      'financial',
      'low income',
      'insurance',
      'Medicare',
      'Medicaid',
      'ACA',
      'Obamacare',
      'copay',
      'manufacturer',
      'patient assistance',
      'help paying',
    ],
    urgency: 'info',
  },
  {
    id: 'us-health-002',
    type: 'guideline',
    title: 'Health Insurance Basics for Patients',
    content: `**Understanding your health insurance:**
- **Premium**: Monthly payment — fixed regardless of healthcare usage
- **Deductible**: Amount you pay before insurance covers services
- **Copay**: Fixed amount per visit/prescription
- **Coinsurance**: Percentage you pay after meeting deductible
- **Out-of-pocket maximum**: The most you'll pay in a year — after that, insurance pays 100%
- **Formulary**: List of covered prescription drugs — check if your medication is on it
- **Prior authorization**: Insurance may require your doctor to justify certain medications
- **Essential Health Benefits**: ACA plans must cover prescriptions, preventive care, emergency services

**Tip**: Always check if specialists and facilities are in-network. Out-of-network bills are a top cause of surprise medical bills.`,
    keywords: [
      'insurance',
      'premium',
      'deductible',
      'copay',
      'coinsurance',
      'formulary',
      'out of pocket',
      'out-of-pocket',
      'ACA',
      'Obamacare',
      'Medicare',
      'coverage',
      'network',
      'billing',
    ],
    urgency: 'info',
  },

  // ── LIFESTYLE ──

  {
    id: 'lifestyle-001',
    type: 'guideline',
    title: 'Medication and Nutrition: Helpful Food Interactions',
    content: `**Food and supplements that affect medications:**
- **Grapefruit juice**: Affects 50+ medications including most statins (atorvastatin, simvastatin), some blood pressure meds, some anxiety meds, some immunosuppressants. The effect lasts 24-72 hours per serving.
- **Calcium/iron supplements**: Reduce absorption of thyroid meds (levothyroxine), some antibiotics (ciprofloxacin, tetracycline), and PPIs. Wait 4+ hours.
- **Vitamin K (leafy greens)**: Affects warfarin dosing — keep intake consistent, don't suddenly increase or decrease
- **Alcohol**: Interacts with acetaminophen (liver risk), metformin (lactic acidosis), blood thinners (bleeding), sedatives (enhanced drowsiness)
- **High-fiber foods**: Can reduce absorption of certain medications — take meds 1-2 hours before or after high-fiber meals
- **Licorice (DGL)**: Can raise blood pressure and counteract blood pressure medications`,
    keywords: [
      'food',
      'grapefruit',
      'dairy',
      'calcium',
      'iron',
      'vitamin',
      'supplement',
      'alcohol',
      'diet',
      'food interaction',
      'eating',
      'breakfast',
      'meals',
    ],
    urgency: 'info',
  },
  {
    id: 'lifestyle-002',
    type: 'guideline',
    title: 'Hydration and Medications',
    content: `**Staying properly hydrated matters for medication effectiveness:**
- Take medications with a full glass (8 oz) of water unless instructed otherwise — this helps prevent esophageal irritation and improves absorption
- Dehydration affects medication clearance from the body
- Blood pressure and diuretic medications can affect hydration status
- Signs of dehydration: dark urine, dizziness, dry mouth, reduced urination
- Older adults often don't feel thirsty — drink on schedule, not just when thirsty
- Forgetting water with pills is a common cause of esophageal irritation or ulcers`,
    keywords: [
      'water',
      'hydration',
      'dehydrated',
      'thirsty',
      'fluids',
      'drink',
      'swallow',
      'esophagus',
      'stomach',
      'heartburn',
    ],
    urgency: 'info',
  },
  {
    id: 'lifestyle-003',
    type: 'guideline',
    title: 'Sleep and Medication Timing',
    content: `**Nighttime medication considerations:**
- Cholesterol-lowering statins work best at bedtime (cholesterol production peaks at night)
- Blood pressure medications often have evening dosing options — some (like ACE inhibitors) work better at night
- Diuretics: always take in morning to avoid nighttime bathroom trips
- Sedating medications (trazodone for sleep, diphenhydramine/benadryl) interact with alcohol — avoid combination
- **Sleep hygiene** affects medication effectiveness: poor sleep worsens blood pressure, blood sugar, mood disorders
- If medications are causing sleep problems, talk to your doctor about timing adjustments`,
    keywords: [
      'sleep',
      'insomnia',
      'bedtime',
      'night',
      'trazodone',
      'diphenhydramine',
      'Benadryl',
      'melatonin',
      'restless',
      'waking',
    ],
    urgency: 'info',
  },

  // ── WOMEN'S HEALTH ──

  {
    id: 'womens-001',
    type: 'guideline',
    title: 'Pregnancy and Medication Safety',
    content: `**Pregnancy medication categories (FDA):**
- **Category A**: Controlled studies show no risk (e.g., levothyroxine, folic acid)
- **Category B**: No evidence of risk in humans (e.g., amoxicillin, omeprazole)
- **Category C**: Use only if clearly needed (e.g., prednisone, fluoxetine)
- **Category D**: Risk to fetus outweighs benefit (e.g., lisinopril, losartan, atorvastatin)
- **Category X**: DO NOT use (e.g., isotretinoin/Accutane, warfarin)

**Always**: Before pregnancy or if you think you might be pregnant, discuss ALL medications (including OTC, supplements, herbs) with your OB/GYN.

**Never stop a medication on your own during pregnancy** — untreated conditions can be more harmful than the medication.`,
    keywords: [
      'pregnancy',
      'pregnant',
      'prenatal',
      'baby',
      'fetus',
      'breastfeeding',
      'nursing',
      'prenatal',
      'trimester',
      'folic acid',
      'prenatal vitamin',
      'conception',
    ],
    urgency: 'caution',
  },
  {
    id: 'womens-002',
    type: 'guideline',
    title: 'Menopause and Hormone Therapy',
    content: `**Hormone replacement therapy (HRT) considerations:**
- Can help with hot flashes, night sweats, mood changes, and bone loss
- Small increased risk of blood clots, stroke, and breast cancer
- Lowest effective dose for shortest duration needed
- Not recommended for women with history of breast cancer, blood clots, or active liver disease
- Non-hormonal options: SSRI/snri for hot flashes, gabapentin for night sweats, vaginal estrogen for dryness

**Bone health**: After menopause, calcium (1,200mg/day) and vitamin D (800-1000 IU/day) plus weight-bearing exercise helps maintain bone density.`,
    keywords: [
      'menopause',
      'hormone',
      'HRT',
      'estrogen',
      'hot flash',
      'osteoporosis',
      'bone density',
      'peri',
      'postmenopausal',
    ],
    urgency: 'info',
  },

  // ── MENTAL HEALTH ──

  {
    id: 'mental-001',
    type: 'guideline',
    title: 'Sleep Hygiene and Medication',
    content: `**Many medications affect sleep:**
- **Stimulants** (adderall, ritalin): Don't take after 2pm — can persist 8+ hours
- **Beta blockers** (metoprolol): Can cause vivid dreams and insomnia in some people
- **SSRIs**: Can cause vivid dreams, especially in the first weeks
- **Prednisone**: Causes insomnia in most people on higher doses
- **Decongestants** (pseudoephedrine/Sudafed): CNS stimulant effect — avoid afternoon/evening

**Good sleep hygiene:**
- Same bedtime and wake time daily (even weekends)
- No screens 1 hour before bed
- Cool, dark, quiet room
- Avoid caffeine after 2pm
- Regular exercise (but not within 3 hours of bedtime)`,
    keywords: [
      'sleep',
      'insomnia',
      'insomnia',
      'dreams',
      'caffeine',
      'bedtime',
      'melatonin',
      'restless',
      'awake',
      'tired',
      'drowsy',
      'fatigue',
    ],
    urgency: 'info',
  },
];
