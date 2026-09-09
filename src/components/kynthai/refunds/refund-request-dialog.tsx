'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface RefundRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  bookingType: 'appointment' | 'lab';
  amount: number;
  description: string;
}

const REASONS = [
  { value: 'doctor_no_show', label: 'Doctor did not show up for the call' },
  { value: 'lab_no_show', label: 'Lab did not arrive for sample collection' },
  { value: 'patient_cancel', label: 'I need to cancel this appointment' },
  { value: 'technical_issue', label: 'Technical issue prevented the consultation' },
  { value: 'complaint', label: 'I have a complaint about the service' },
] as const;

export function RefundRequestDialog({
  open,
  onOpenChange,
  bookingId,
  bookingType,
  amount,
  description,
}: RefundRequestDialogProps) {
  const [reason, setReason] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [proofNote, setProofNote] = React.useState('');
  const [proofFile, setProofFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleSubmit = async () => {
    if (!reason) {
      toast({ title: 'Select a reason', variant: 'destructive' });
      return;
    }
    if (!notes.trim()) {
      toast({ title: 'Please explain your situation', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      let uploadedProofFile: string | undefined;

      // Upload proof file if present
      if (proofFile) {
        const fd = new FormData();
        fd.append('file', proofFile);
        const ur = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!ur.ok) throw new Error('File upload failed');
        const { fileToken } = await ur.json();
        uploadedProofFile = fileToken;
      }

      const endpoint = '/api/refunds';
      const body = {
        [bookingType === 'appointment' ? 'appointmentId' : 'labBookingId']: bookingId,
        reason,
        notes,
        proofFile: uploadedProofFile,
        proofNote: proofNote || undefined,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      toast({
        title: 'Refund request submitted',
        description: `Your request for $${(data.refundAmount / 100).toFixed(2)} is under review. We'll respond within 10 business days.`,
      });
      onOpenChange(false);
      setReason('');
      setNotes('');
      setProofNote('');
      setProofFile(null);
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-background p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Request a refund</h2>
            <p className="text-xs text-muted-foreground">
              {description} — ${(amount / 100).toFixed(2)}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason for refund</label>
            <div className="space-y-1.5">
              {REASONS.map(r => (
                <label
                  key={r.value}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                    reason === r.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-border hover:border-emerald-500/40'
                  )}
                >
                  <input
                    type="radio"
                    name="refund-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={e => setReason(e.target.value)}
                    className="h-4 w-4 text-emerald-600"
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Explanation */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Describe your situation</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Please provide details about why you're requesting this refund..."
              rows={3}
            />
          </div>

          {/* Proof upload */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Supporting proof (optional but recommended)
            </label>
            <p className="text-xs text-muted-foreground">
              Upload screenshots, call records, or any evidence that supports your request.
            </p>
            <div
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border border-dashed p-4 transition-colors cursor-pointer',
                proofFile
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-border hover:border-emerald-500/40'
              )}
              onClick={() => proofFile && setProofFile(null)}
            >
              {proofFile ? (
                <div className="flex items-center gap-3 w-full">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <FileText className="h-5 w-5" />
                  </span>
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
                    onClick={e => {
                      e.stopPropagation();
                      setProofFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="text-xs text-muted-foreground">Click to upload proof</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) setProofFile(f);
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* 7-day notice */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Our team will review your request and proof within <strong>10 business days</strong>.
              You will be notified of the decision via in-app notification.
            </p>
          </div>

          {/* Submit */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 text-white"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Refund Request'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
