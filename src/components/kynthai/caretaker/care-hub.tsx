'use client'

import * as React from 'react'
import {
  Activity,
  Sparkles,
  ShieldAlert,
  Stethoscope,
  ScanLine,
  Search,
  ChevronRight,
  HeartPulse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ResponsiveSheet } from '@/components/kynthai/responsive-sheet'
import { HealthInsights } from '@/components/medication/health-insights'
import { DrugInteractions } from '@/components/medication/drug-interactions'
import { SymptomAnalyzer } from '@/components/medication/symptom-analyzer'
import { IdentifyMedicine } from '@/components/medication/identify-medicine'
import { SearchMedicine } from '@/components/medication/search-medicine'
import { FamilyCircle } from '@/components/kynthai/family/family-circle'

type ToolId = 'chronic' | 'insights' | 'interactions' | 'symptoms' | 'identify' | 'search'

interface Tool {
  id: ToolId
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  tint: string
  badge?: string
  scoped?: boolean
}

const TOOLS: Tool[] = [
  {
    id: 'chronic',
    title: 'Chronic Conditions',
    description: 'Track diabetes, hypertension, thyroid & more over time.',
    icon: HeartPulse,
    tint: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    badge: 'Tracker',
  },
  {
    id: 'insights',
    title: 'AI Insights',
    description: 'Weekly AI report on adherence & trends for this member.',
    icon: Sparkles,
    tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    badge: 'AI',
    scoped: true,
  },
  {
    id: 'interactions',
    title: 'Drug Interactions',
    description: 'AI checks drug-drug & food interactions for this member.',
    icon: ShieldAlert,
    tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    badge: 'Safety',
    scoped: true,
  },
  {
    id: 'symptoms',
    title: 'Symptom Analyzer',
    description: 'AI analysis of symptoms with red flags & care tips.',
    icon: Stethoscope,
    tint: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    badge: 'AI',
  },
  {
    id: 'identify',
    title: 'Identify Medicine',
    description: 'Snap a pill photo — AI tells you what it is.',
    icon: ScanLine,
    tint: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    badge: 'VLM',
  },
  {
    id: 'search',
    title: 'Medicine Search',
    description: 'Web search for side effects, dosage & more.',
    icon: Search,
    tint: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    badge: 'Web',
  },
]

interface FamilyPulseMember {
  memberId: string
  name: string
  relation: string
  color: string
  score: number
  adherence: number
  total: number
  taken: number
  missed: number
  status: string
  lastTaken: string | null
  conditions: unknown[]
}

interface CaretakerCareHubProps {
  familyMemberId?: string
  memberName?: string
  familyPulse?: FamilyPulseMember[]
  pulseLoading?: boolean
}

export function CareHub({ familyMemberId, memberName, familyPulse, pulseLoading }: CaretakerCareHubProps) {
  const [active, setActive] = React.useState<ToolId | null>(null)
  const tool = TOOLS.find((t) => t.id === active) ?? null

  return (
    <div className="space-y-5">
      {/* Family Health Overview */}
      {(familyPulse !== undefined || pulseLoading) && (
        <section>
          <FamilyCircle members={familyPulse ?? []} loading={pulseLoading} />
        </section>
      )}

      {/* AI Tools */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Care Hub</h1>
        <p className="text-sm text-muted-foreground">
          {memberName ? (
            <>Scoped to <span className="font-semibold text-foreground">{memberName}</span> · health tools.</>
          ) : (
            'Health tools for your family.'
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className="group text-left"
          >
            <Card className="h-full transition-all hover:border-emerald-500/40 hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-4">
                <span
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                    t.tint
                  )}
                >
                  <t.icon className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{t.title}</h3>
                    {t.badge && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {t.badge}
                      </Badge>
                    )}
                    {t.scoped && memberName && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                        {(memberName || 'Family member').split(' ')[0]}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                    {t.description}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <ResponsiveSheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
          {tool && (
            <>
              <SheetHeader className="px-5 pt-4 pb-3 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl',
                      tool.tint
                    )}
                  >
                    <tool.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <SheetTitle className="text-base">{tool.title}</SheetTitle>
                    <SheetDescription className="text-sm">
                      {memberName ? `For ${memberName}` : tool.description}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="p-4">
                {active === 'chronic' && <ChronicConditions />}
                {active === 'insights' && <HealthInsights familyMemberId={familyMemberId} />}
                {active === 'interactions' && <DrugInteractions familyMemberId={familyMemberId} />}
                {active === 'symptoms' && <SymptomAnalyzer />}
                {active === 'identify' && <IdentifyMedicine />}
                {active === 'search' && <SearchMedicine />}
              </div>
            </>
          )}
      </ResponsiveSheet>
    </div>
  )
}

function ChronicConditions() {
  const conditions = [
    { name: 'Type 2 Diabetes', reading: '142 mg/dL', level: 'high' },
    { name: 'Hypertension', reading: '128/84 mmHg', level: 'borderline' },
    { name: 'Hypothyroidism', reading: 'TSH 3.1', level: 'normal' },
  ]
  return (
    <div className="space-y-4">
      <Card className="border-rose-500/30 bg-rose-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <HeartPulse className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Chronic Condition Tracker</p>
            <p className="text-sm text-muted-foreground mt-1">
              Track vitals over time. Connect a device or log readings manually.
              AI will flag anomalies and trends for the selected member.
            </p>
          </div>
        </CardContent>
      </Card>

      {conditions.map((c) => (
        <Card key={c.name}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{c.name}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Latest reading</p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  'font-bold',
                  c.level === 'high'
                    ? 'text-rose-600 dark:text-rose-400'
                    : c.level === 'borderline'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {c.reading}
              </p>
              <Badge
                variant="secondary"
                className={cn(
                  'text-[10px] mt-1',
                  c.level === 'high'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : c.level === 'borderline'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                )}
              >
                {c.level}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" className="w-full" disabled>
        <Activity className="h-4 w-4" />
        Add new condition
      </Button>
    </div>
  )
}
