'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldAlert,
  Loader2,
  Pill,
  Utensils,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { MedicalDisclaimer } from '@/components/kynthai/medical-disclaimer'

interface Interaction {
  medications: string[]
  severity: 'mild' | 'moderate' | 'severe'
  type: string
  description: string
  recommendation: string
}

interface FoodInteraction {
  medication: string
  food: string
  description: string
  recommendation: string
}

interface InteractionsResult {
  summary: string
  riskLevel: 'low' | 'moderate' | 'high' | string
  interactions: Interaction[]
  foodInteractions: FoodInteraction[]
  timingAdvice: string[]
  generalNote: string
}

const severityColor = (s: string) => {
  if (s === 'severe') return 'destructive'
  if (s === 'moderate') return 'secondary'
  return 'outline'
}

const riskBadge = (r: string) => {
  if (r === 'low') return 'default'
  if (r === 'moderate') return 'secondary'
  if (r === 'high') return 'destructive'
  return 'outline'
}

export function DrugInteractions({ familyMemberId }: { familyMemberId?: string } = {}) {
  const [result, setResult] = useState<InteractionsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [medNames, setMedNames] = useState<string[]>([])
  const [loadingMeds, setLoadingMeds] = useState(true)
  const { toast } = useToast()

  const loadMeds = useCallback(async () => {
    setLoadingMeds(true)
    try {
      const url = familyMemberId ? `/api/medications?userId=${encodeURIComponent(familyMemberId)}` : '/api/medications'
      const res = await fetch(url)
      if (!res.ok) return
      const payload = await res.json()
      // FIX #7: the GET returns a paginated envelope ({ data: [...], meta }) —
      // reading it as a bare array crashed meds.filter and the tool showed
      // "No active medications" even when meds existed.
      const meds: Array<{ active: boolean; name: string; dosage: string }> = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : []
      setMedNames(
        meds.filter((m) => m.active).map((m) => `${m.name} (${m.dosage})`),
      )
    } catch {
      /* ignore */
    } finally {
      setLoadingMeds(false)
    }
  }, [familyMemberId])

  useEffect(() => {
    loadMeds()
  }, [loadMeds])

  const check = useCallback(async () => {
    setLoading(true)
    try {
      const url = familyMemberId ? `/api/interactions?familyMemberId=${encodeURIComponent(familyMemberId)}` : '/api/interactions'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      const data: InteractionsResult = await res.json()
      setResult(data)
      toast({ title: 'Interaction analysis complete' })
    } catch (e) {
      toast({
        title: 'Analysis failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-primary">AI Drug Interaction Checker</p>
            <p className="text-muted-foreground text-xs mt-1">
              AI analyzes your active medications for drug-drug interactions,
              food interactions, and timing concerns.
            </p>
          </div>
          <Button onClick={check} disabled={loading} size="sm" className="bg-primary shrink-0">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            <span className="ml-1 hidden sm:inline">Check</span>
          </Button>
        </CardContent>
      </Card>

      {/* Current meds */}
      {loadingMeds ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Loading medications...</p>
          </CardContent>
        </Card>
      ) : medNames.length > 0 ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Checking {medNames.length} active medication{medNames.length !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {medNames.map((n, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  <Pill className="h-3 w-3 mr-1" />
                  {n}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading && !result ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : result ? (
        <>
          {/* Summary */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold">Analysis Summary</h3>
                <Badge variant={riskBadge(result.riskLevel)}>
                  {result.riskLevel} risk
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </CardContent>
          </Card>

          {/* Interactions */}
          {(result.interactions ?? []).length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Detected interactions ({(result.interactions ?? []).length})
              </h3>
              <div className="space-y-2">
                {(result.interactions ?? []).map((int, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex flex-wrap gap-1">
                          {(int.medications ?? []).map((m, j) => (
                            <Badge key={j} variant="outline" className="text-xs">
                              {m}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {int.type}
                          </Badge>
                          <Badge variant={severityColor(int.severity)}>
                            {int.severity}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm">{int.description}</p>
                      <p className="text-xs text-primary">
                        <span className="font-semibold">Recommendation: </span>
                        {int.recommendation}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                No significant drug interactions detected among your active medications.
              </CardContent>
            </Card>
          )}

          {/* Food interactions */}
{(result.foodInteractions ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Utensils className="h-4 w-4 text-orange-500" />
                Food interactions ({(result.foodInteractions ?? []).length})
              </h3>
              <div className="space-y-2">
                {(result.foodInteractions ?? []).map((f, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {f.medication}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Utensils className="h-3 w-3 mr-1" />
                          {f.food}
                        </Badge>
                      </div>
                      <p className="text-sm">{f.description}</p>
                      <p className="text-xs text-primary">
                        <span className="font-semibold">Tip: </span>
                        {f.recommendation}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Timing advice */}
          {(result.timingAdvice ?? []).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-primary" /> Timing advice
                </h4>
                <ul className="space-y-1.5 text-sm">
                  {(result.timingAdvice ?? []).map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">→</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Disclaimer */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {result.generalNote}
              </p>
            </CardContent>
          </Card>

          <MedicalDisclaimer compact />

          <Button variant="outline" onClick={check} disabled={loading} className="w-full">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="ml-2">Re-check interactions</span>
          </Button>
        </>
      ) : medNames.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No active medications</p>
            <p className="text-sm mt-1">
              Add medications first to check for interactions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Run an interaction check</p>
            <p className="text-sm mt-1 max-w-md mx-auto">
              Tap “Check” to let AI review your medications for potential
              interactions, food conflicts, and timing issues.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
