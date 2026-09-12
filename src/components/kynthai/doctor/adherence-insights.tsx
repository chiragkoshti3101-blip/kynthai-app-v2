"use client"

import * as React from "react"
import { Users, AlertTriangle, TrendingUp, TrendingDown, Minus, ExternalLink, Pill, CalendarDays, ChevronRight, Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"

interface PatientInsight {
  id: string
  name: string | null
  email: string
  adherence: number
  trend: "improving" | "declining" | "stable"
  lastConsultation: string | null
  activeMedications: number
  missedDoses: number
  needsAttention: boolean
}

interface AdherenceInsightsProps {
  patients: PatientInsight[]
  summary: { total: number; needsAttention: number; avgAdherence: number }
  onPatientClick?: (patient: PatientInsight) => void
}

export function AdherenceInsights({ patients = [], summary, onPatientClick }: AdherenceInsightsProps) {
  const adherenceColor = (v: number) =>
    v >= 80 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950 border-emerald-200" :
    v >= 60 ? "text-amber-600 bg-amber-50 dark:bg-amber-950 border-amber-200" :
    "text-red-600 bg-red-50 dark:bg-red-950 border-red-200"

  const adherenceBarColor = (v: number) =>
    v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-red-500"

  const trendIcon = (t: string) =>
    t === "improving" ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> :
    t === "declining" ? <TrendingDown className="h-3.5 w-3.5 text-red-500" /> :
    <Minus className="h-3.5 w-3.5 text-muted-foreground" />

  const trendLabel = (t: string) =>
    t === "improving" ? "Improving" : t === "declining" ? "Declining" : "Stable"

  const trendColor = (t: string) =>
    t === "improving" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950" :
    t === "declining" ? "text-red-600 bg-red-50 dark:bg-red-950" :
    "text-muted-foreground bg-muted"

  const sorted = [...patients].sort((a, b) => a.adherence - b.adherence)
  const attentionPatients = sorted.filter((p) => p.needsAttention)
  const stablePatients = sorted.filter((p) => !p.needsAttention)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-600" />
              Adherence Insights
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {summary.total} patients · avg {summary.avgAdherence}% adherence · {summary.needsAttention} need attention
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-[10px]">{patients.length} total</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Attention section */}
        {attentionPatients.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Needs Attention ({attentionPatients.length})
            </div>
            <div className="space-y-2">
              {attentionPatients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPatientClick?.(p)}
                  className="w-full rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3 text-left hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-semibold">
                        {(p.name || 'Patient').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.activeMedications} meds · {p.missedDoses} missed</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={"text-xs font-bold " + (p.adherence < 60 ? "text-red-600" : "text-amber-600")}>{p.adherence}%</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                  <Progress value={p.adherence} className="h-1.5" />
                  <div className="flex items-center justify-between mt-1.5">
                    <Badge variant="secondary" className={"text-[9px] " + trendColor(p.trend)}>
                      {trendIcon(p.trend)} {trendLabel(p.trend)}
                    </Badge>
                    {p.lastConsultation && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(p.lastConsultation).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stable/improving patients */}
        {stablePatients.length > 0 && (
          <div className="space-y-2">
            {attentionPatients.length > 0 && <Separator />}
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Other Patients ({stablePatients.length})
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scroll pr-1">
              {stablePatients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPatientClick?.(p)}
                  className="w-full rounded-lg border border-border/60 p-2.5 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={"flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-semibold " + (p.adherence >= 80 ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600" : "bg-amber-100 dark:bg-amber-900/50 text-amber-600")}>
                        {(p.name || 'Patient').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.activeMedications} meds</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={"text-xs font-semibold " + (p.adherence >= 80 ? "text-emerald-600" : "text-amber-600")}>{p.adherence}%</span>
                      <Badge variant="secondary" className={"text-[9px] " + trendColor(p.trend)}>
                        {trendIcon(p.trend)}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {patients.length === 0 && (
          <div className="py-6 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No patients yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
