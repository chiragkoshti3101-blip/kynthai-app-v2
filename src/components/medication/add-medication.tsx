'use client'

import { useState } from 'react'
import { Plus, Loader2, Sparkles, X, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { MEDICATION_COLORS, getColorClasses } from '@/lib/types'

const FREQUENCIES = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Four times daily',
  'As needed',
  'Every other day',
  'Weekly',
  'Custom',
]

interface AddMedicationProps {
  onAdded?: () => void
  onClose?: () => void
  familyMemberId?: string
  isDemo?: boolean
  onCreated?: (med: {
    id: string
    name: string
    dosage: string
    times: string[]
    frequency: string
    instructions: string
    notes: string
    color: string
    active: boolean
    createdAt: string
    updatedAt: string
  }) => void
}

export function AddMedication({ onAdded, onClose, familyMemberId, isDemo, onCreated }: AddMedicationProps) {
  const [name, setName] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('Once daily')
  const [times, setTimes] = useState<string[]>(['08:00'])
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')
  const [color, setColor] = useState('emerald')
  const [timeWindowEnd, setTimeWindowEnd] = useState('09:00')
  const [reminderInterval, setReminderInterval] = useState(10)

  const [parsing, setParsing] = useState(false)
  const [scheduleText, setScheduleText] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const addTime = () => setTimes([...times, '12:00'])
  const removeTime = (i: number) =>
    setTimes(times.filter((_, idx) => idx !== i))
  const updateTime = (i: number, v: string) =>
    setTimes(times.map((t, idx) => (idx === i ? v : t)))

  const parseSchedule = async () => {
    if (!scheduleText.trim()) {
      toast({ title: 'Enter a description first', variant: 'destructive' })
      return
    }
    setParsing(true)
    try {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => d.token as string)
        .catch(() => null)
      const res = await fetch('/api/parse-schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({ text: scheduleText }),
      })
      if (!res.ok) throw new Error('Parse failed')
      const data = await res.json()
      const s = data.schedule
      if (s.name) setName(s.name)
      if (s.dosage) setDosage(s.dosage)
      if (s.frequency) setFrequency(s.frequency)
      if (Array.isArray(s.times) && s.times.length > 0) setTimes(s.times)
      if (s.instructions) setInstructions(s.instructions)
      toast({
        title: 'Schedule parsed',
        description: 'Review and save your medication.',
      })
    } catch (e) {
      toast({
        title: 'Could not parse schedule',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setParsing(false)
    }
  }

  const save = async () => {
    if (!name.trim() || !dosage.trim() || times.length === 0) {
      toast({
        title: 'Missing fields',
        description: 'Name, dosage and at least one time are required.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      if (isDemo) {
        const now = new Date().toISOString()
        onCreated?.({
          id: `local-${Date.now()}`,
          name: name.trim(),
          dosage: dosage.trim(),
          times,
          frequency,
          instructions,
          notes,
          color,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
        toast({ title: 'Medication added', description: name })
        setName('')
        setDosage('')
        setTimes(['08:00'])
        setInstructions('')
        setNotes('')
        setScheduleText('')
        onAdded?.()
        onClose?.()
        return
      }
      const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => d.token as string)
        .catch(() => null)
      const res = await fetch('/api/medications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: JSON.stringify({
          name,
          dosage,
          frequency,
          times,
          instructions,
          notes,
          color,
          timeWindowEnd,
          reminderInterval,
          ...(familyMemberId ? { familyMemberId } : {}),
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast({ title: 'Medication added', description: name })
      // reset
      setName('')
      setDosage('')
      setTimes(['08:00'])
      setInstructions('')
      setNotes('')
      setScheduleText('')
      onAdded?.()
      onClose?.()
    } catch (e) {
      toast({
        title: 'Failed to save',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* AI Schedule Parser */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            AI Schedule Parser
            <Badge variant="secondary" className="ml-1 text-xs">
              NLP
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Describe your prescription in plain English and let AI fill the form
            for you.
          </p>
          <div className="flex gap-2">
            <Textarea
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              placeholder="e.g. Take Metformin 500mg twice a day after meals, one in the morning and one at night"
              className="min-h-[72px] resize-none bg-background"
            />
            <div className="flex flex-col gap-2">
              <Button
                onClick={parseSchedule}
                disabled={parsing}
                className="bg-primary"
              >
                {parsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="ml-1">Parse</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="med-name">Medicine name</Label>
          <div className="flex gap-2">
            <Input
              id="med-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Metformin"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="med-dose">Dosage</Label>
            <div className="flex gap-2">
              <Input
                id="med-dose"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder="e.g. 1 tablet (500 mg)"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Reminder times</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addTime}
            >
              <Plus className="h-3.5 w-3.5" /> Add time
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {times.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-1 rounded-md border bg-card pl-2"
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="time"
                  value={t}
                  onChange={(e) => updateTime(i, e.target.value)}
                  className="bg-transparent py-1.5 text-sm outline-none"
                />
                {times.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => removeTime(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Time window — patient must take between reminder time and this */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            Time window & repeat reminders
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Must take before</Label>
              <input
                type="time"
                value={timeWindowEnd}
                onChange={(e) => setTimeWindowEnd(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none"
              />
              <p className="text-[10px] text-muted-foreground">If not taken by this time, caretaker is notified</p>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Repeat reminder every</Label>
              <select
                value={reminderInterval}
                onChange={(e) => setReminderInterval(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none"
              >
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={20}>20 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={0}>Don't repeat</option>
              </select>
              <p className="text-[10px] text-muted-foreground">Alarm repeats until taken or window closes</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="med-instructions">Instructions (optional)</Label>
          <div className="flex gap-2">
            <Textarea
              id="med-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Take with food and a full glass of water"
              className="min-h-[60px] resize-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="med-notes">Notes (optional)</Label>
          <Input
            id="med-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. For blood sugar control"
          />
        </div>

        <div className="space-y-2">
          <Label>Color tag</Label>
          <div className="flex flex-wrap gap-2">
            {MEDICATION_COLORS.map((c) => {
              const cls = getColorClasses(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full ${cls.dot} ring-2 ring-offset-2 ring-offset-background transition ${
                    color === c ? 'ring-foreground scale-110' : 'ring-transparent'
                  }`}
                  aria-label={c}
                />
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={save} disabled={saving} className="flex-1 bg-primary">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="ml-1">Save medication</span>
        </Button>
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: Use the AI Schedule Parser above to auto-fill this form from your prescription.
      </p>
    </div>
  )
}
