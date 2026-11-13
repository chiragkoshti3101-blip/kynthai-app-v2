'use client'

import { useState } from 'react'
import {
  Stethoscope,
  Loader2,
  AlertTriangle,
  Pill,
  Lightbulb,
  Activity,
  ExternalLink,
  Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { MedicalDisclaimer } from '@/components/kynthai/medical-disclaimer'

interface Analysis {
  possibleCauses: string[]
  selfCareTips: string[]
  otcOptions: string[]
  redFlags: string[]
  whenToSeeDoctor: string
  disclaimer: string
}

interface SymptomResponse {
  analysis: Analysis
  sources: { name: string; url: string; snippet: string }[]
}

const QUICK_SYMPTOMS = [
  'Headache and fever',
  'Upset stomach and nausea',
  'Sore throat',
  'Back pain',
]

export function SymptomAnalyzer() {
  const [symptoms, setSymptoms] = useState('')
  const [age, setAge] = useState('')
  const [result, setResult] = useState<SymptomResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const analyze = async () => {
    if (!symptoms.trim()) {
      toast({ title: 'Describe your symptoms first', variant: 'destructive' })
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/symptom-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms: symptoms.trim(),
          age: age ? parseInt(age, 10) : undefined,
          withSearch: true,
        }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      const data: SymptomResponse = await res.json()
      setResult(data)
      toast({ title: 'Analysis complete' })
    } catch (e) {
      toast({
        title: 'Analysis failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Stethoscope className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-primary">AI Symptom Analyzer</p>
            <p className="text-muted-foreground text-xs mt-1">
              Describe your symptoms and AI will analyze possible causes,
              self-care tips, and red flags. This is educational guidance, not a diagnosis.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Input */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="symptoms">Describe your symptoms</Label>
            <div className="flex gap-2">
              <Textarea
                id="symptoms"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="e.g. I've had a headache and mild fever since this morning, with some body aches"
                className="min-h-[72px] resize-none"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-2 flex-1 max-w-[140px]">
              <Label htmlFor="age">Age (optional)</Label>
              <Input
                id="age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="30"
              />
            </div>
            <Button
              onClick={analyze}
              disabled={loading}
              className="bg-primary flex-1"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Stethoscope className="h-4 w-4" />
              )}
              <span className="ml-1">Analyze</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_SYMPTOMS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className="text-xs h-auto py-1"
                onClick={() => setSymptoms(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {/* Result */}
      {result && result.analysis && (
        <div className="space-y-3">
          {/* Red flags */}
          {(result.analysis.redFlags ?? []).length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive mb-2">
                  <AlertTriangle className="h-4 w-4" /> Red flags — seek urgent care
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {(result.analysis.redFlags ?? []).map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-destructive mt-0.5">⚠</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Possible causes */}
          {(result.analysis.possibleCauses ?? []).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-primary" /> Possible causes
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {(result.analysis.possibleCauses ?? []).map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Self-care */}
          {(result.analysis.selfCareTips ?? []).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" /> Self-care tips
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {(result.analysis.selfCareTips ?? []).map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">→</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* OTC options */}
          {(result.analysis.otcOptions ?? []).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Pill className="h-4 w-4 text-violet-500" /> OTC options
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {(result.analysis.otcOptions ?? []).map((o, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-violet-500 mt-0.5">•</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Always check with a pharmacist before taking any medication.
                </p>
              </CardContent>
            </Card>
          )}

          {/* When to see doctor */}
          {result.analysis.whenToSeeDoctor && (
            <Card className="border-primary/20">
              <CardContent className="p-4 flex items-start gap-2">
                <Phone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    When to see a doctor
                  </p>
                  <p className="text-sm mt-0.5">{result.analysis.whenToSeeDoctor}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sources */}
          {(result.sources ?? []).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-2">Web sources</h3>
                <div className="space-y-2">
                  {(result.sources ?? []).map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs hover:underline group"
                    >
                      <span className="font-medium text-primary flex items-center gap-1">
                        {s.name}
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                      </span>
                      <span className="text-muted-foreground line-clamp-2">
                        {s.snippet}
                      </span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground text-center px-4">
            {result.analysis.disclaimer}
          </p>
          <MedicalDisclaimer compact />
        </div>
      )}
    </div>
  )
}
