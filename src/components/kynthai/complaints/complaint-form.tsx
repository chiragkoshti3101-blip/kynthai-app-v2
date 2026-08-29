'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ComplaintFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
  {
    value: 'doctor',
    label: 'Doctor',
    icon: '🩺',
    desc: 'Misconduct, wrong diagnosis, unprofessional behavior',
  },
  { value: 'lab', label: 'Lab', icon: '🔬', desc: 'Wrong results, delays, sample mishandling' },
  {
    value: 'billing',
    label: 'Billing / Refund',
    icon: '💳',
    desc: 'Wrong charges, refund issues, payment problems',
  },
  {
    value: 'prescription',
    label: 'Prescription',
    icon: '💊',
    desc: 'Wrong medication, dosage errors, prescription issues',
  },
  {
    value: 'medication',
    label: 'Medication',
    icon: '💉',
    desc: 'Side effects, wrong delivery, stock issues',
  },
  {
    value: 'identity',
    label: 'Identity / Documents',
    icon: '🪪',
    desc: 'Wrong credentials, ID verification, name correction',
  },
  {
    value: 'technical',
    label: 'Technical',
    icon: '🔧',
    desc: 'App bugs, video call issues, data not saving',
  },
  {
    value: 'privacy',
    label: 'Privacy / Data',
    icon: '🔒',
    desc: 'Data breach, wrong info shared, US privacy concern',
  },
  { value: 'other', label: 'Other', icon: '📋', desc: 'Anything else' },
] as const;

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'text-muted-foreground' },
  { value: 'medium', label: 'Medium', color: 'text-blue-600' },
  { value: 'high', label: 'High', color: 'text-amber-600' },
  { value: 'critical', label: 'Critical', color: 'text-red-600' },
] as const;

export function ComplaintForm({ open, onOpenChange }: ComplaintFormProps) {
  const [step, setStep] = React.useState<'category' | 'details'>('category');
  const [category, setCategory] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState('medium');
  const [entityType, setEntityType] = React.useState('');
  const [entityId, setEntityId] = React.useState('');
  const [proofFile, setProofFile] = React.useState<File | null>(null);
  const [evidenceNote, setEvidenceNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const reset = () => {
    setStep('category');
    setCategory('');
    setSubject('');
    setDescription('');
    setPriority('medium');
    setEntityType('');
    setEntityId('');
    setProofFile(null);
    setEvidenceNote('');
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!category) {
      toast({ title: 'Select a category', variant: 'destructive' });
      return;
    }
    if (!subject.trim()) {
      toast({ title: 'Subject is required', variant: 'destructive' });
      return;
    }
    if (!description.trim()) {
      toast({ title: 'Please describe your issue', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      let uploadedProof: string | undefined;

      if (proofFile) {
        const fd = new FormData();
        fd.append('file', proofFile);
        const ur = await fetch('/api/upload', { method: 'POST', body: fd });
        if (ur.ok) {
          const data = await ur.json();
          uploadedProof = data.fileToken;
        }
      }

      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          description: description.trim(),
          priority,
          relatedEntityType: entityType || undefined,
          relatedEntityId: entityId || undefined,
          proofFile: uploadedProof,
          evidenceNote: evidenceNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit complaint');
      }

      toast({
        title: 'Complaint submitted',
        description: `Your complaint (${data.id.slice(0, 8)}) has been filed. Our team will respond within 2 business days.`,
      });

      handleClose(false);
      router.refresh();
    } catch (e: unknown) {
      toast({
        title: 'Submission failed',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            File a complaint
          </DialogTitle>
          <DialogDescription>
            Report any issue you&apos;re facing. Our team reviews all complaints.
          </DialogDescription>
        </DialogHeader>

        {step === 'category' && (
          <div className="space-y-3">
            <Label>What is this about?</Label>
            <div className="grid gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    setCategory(c.value);
                    setStep('details');
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all hover:border-emerald-500/40',
                    category === c.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-border'
                  )}
                >
                  <span className="text-xl leading-none mt-0.5">{c.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('category')}
                className="h-7 px-2 text-xs"
              >
                ← Back
              </Button>
              <span className="text-xs text-muted-foreground">
                {CATEGORIES.find(c => c.value === category)?.label}
              </span>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="complaint-subject">Subject</Label>
              <Input
                id="complaint-subject"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Brief summary of your issue"
                maxLength={200}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="complaint-desc">Describe the issue</Label>
              <Textarea
                id="complaint-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Please provide as much detail as possible — what happened, when, and how it affected you..."
                rows={5}
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <div className="flex gap-2">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={cn(
                      'flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all',
                      priority === p.value
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                        : 'border-border hover:border-emerald-500/40'
                    )}
                  >
                    <span className={cn(priority === p.value && 'font-bold', p.color)}>
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Related entity (optional) */}
            <details className="rounded-xl border border-border/60">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                Link to a booking / appointment (optional)
              </summary>
              <div className="grid grid-cols-2 gap-3 p-3 pt-0">
                <div className="space-y-1.5">
                  <Label htmlFor="entity-type" className="text-xs">
                    Type
                  </Label>
                  <Input
                    id="entity-type"
                    value={entityType}
                    onChange={e => setEntityType(e.target.value)}
                    placeholder="e.g. appointment"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entity-id" className="text-xs">
                    ID
                  </Label>
                  <Input
                    id="entity-id"
                    value={entityId}
                    onChange={e => setEntityId(e.target.value)}
                    placeholder="e.g. appt_abc123"
                  />
                </div>
              </div>
            </details>

            {/* Evidence upload */}
            <div className="space-y-1.5">
              <Label>Supporting evidence (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Screenshots, photos, or documents that help explain the issue.
              </p>
              {proofFile ? (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/50 bg-emerald-500/5 p-3">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{proofFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(proofFile.size / 1024)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive h-8 w-8"
                    onClick={() => setProofFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-4 transition-colors hover:border-emerald-500/40">
                  <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">
                    Click to upload (PDF, JPG, PNG — max 5 MB)
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={e => setProofFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>

            {/* Evidence note */}
            <div className="space-y-1.5">
              <Label htmlFor="evidence-note">Additional context</Label>
              <Input
                id="evidence-note"
                value={evidenceNote}
                onChange={e => setEvidenceNote(e.target.value)}
                placeholder="Any reference numbers, dates, or people involved..."
              />
            </div>

            {/* Notice */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-500/20 p-3">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Urgent medical emergency?</strong> Call{' '}
                <strong>local emergency services</strong>. For identity/document verification issues, our team reviews
                within 1 business day.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'details' && (
            <>
              <Button variant="outline" onClick={() => setStep('category')} disabled={submitting}>
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
              >
                {submitting ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Submitting...
                  </>
                ) : (
                  'Submit Complaint'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
