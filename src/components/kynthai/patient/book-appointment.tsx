'use client';

import * as React from 'react';
import { Loader2, CheckCircle2, CalendarDays, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
// FIX #6: real slots come from GET /api/doctors/[id]/slots?date= (availability
// windows + booked instants) expanded client-side via generateSlots.
import { generateSlots, type SlotOption } from '@/lib/booking-slots';

interface Doctor {
  id: string;
  name: string;
  specialization: string;
  consultationFee: number;
  experience: number;
  rating: number;
  reviewCount: number;
  city: string;
  videoCallEnabled: boolean;
  available?: boolean;
}

type Step = 'list' | 'form' | 'success';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookAppointment({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = React.useState(true);
  const [selectedDoctor, setSelectedDoctor] = React.useState<Doctor | null>(null);
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [step, setStep] = React.useState<Step>('list');
  const [slots, setSlots] = React.useState<SlotOption[]>([]);
  const [loadingSlots, setLoadingSlots] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoadingDoctors(true);
    fetch('/api/doctors', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        setDoctors(Array.isArray(data) ? data : []);
        setLoadingDoctors(false);
      })
      .catch(() => {
        setDoctors([]);
        setLoadingDoctors(false);
      });
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setSelectedDoctor(null);
      setDate('');
      setTime('');
      setReason('');
      setStep('list');
    }
  }, [open]);

  // FIX #6: fetch the doctor's real availability + booked times whenever the
  // selected doctor or date changes, and rebuild the slot grid from them.
  React.useEffect(() => {
    if (step !== 'form' || !selectedDoctor || !date) return;
    let cancelled = false;
    setLoadingSlots(true);
    fetch(`/api/doctors/${selectedDoctor.id}/slots?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('slots unavailable'))))
      .then((data: { windows?: Parameters<typeof generateSlots>[0]; booked?: string[] }) => {
        if (cancelled) return;
        const next = generateSlots(data.windows ?? [], date, { booked: data.booked ?? [] });
        setSlots(next);
        setTime(prev => (prev && next.some(s => s.value === prev && s.available) ? prev : ''));
        setLoadingSlots(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSlots(generateSlots([], date));
        setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, selectedDoctor, date]);

  function handleSelectDoctor(doctor: Doctor) {
    setSelectedDoctor(doctor);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow.toISOString().slice(0, 10));
    setStep('form');
  }

  async function handleSubmit() {
    if (!selectedDoctor || !date || !time) return;
    setSubmitting(true);
    try {
      // `time` is an HH:MM value from the slot grid — construct the local
      // instant directly (the old AM/PM string parsing is no longer needed).
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDoctor.id,
          scheduledAt,
          appointmentType: 'video',
          reason: reason.trim() || 'Video consultation',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Booking failed' }));
        throw new Error(err.error || 'Booking failed');
      }
      toast({
        title: 'Appointment booked!',
        description: `Confirmed with ${selectedDoctor.name}. Check your email for details.`,
      });
      setStep('success');
    } catch (e) {
      toast({
        title: 'Booking failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {step === 'list' && 'Book an Appointment'}
            {step === 'form' && `Book with ${selectedDoctor?.name}`}
            {step === 'success' && 'Booking Confirmed'}
          </SheetTitle>
          <SheetDescription>
            {step === 'list' && 'Choose a doctor to book a video consultation'}
            {step === 'form' && 'Select a date and time for your visit'}
            {step === 'success' && 'Your appointment has been scheduled'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 overflow-y-auto">
          {step === 'list' && (
            <div className="space-y-3">
              {loadingDoctors && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loadingDoctors && doctors.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No doctors available right now.
                </p>
              )}
              {doctors.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleSelectDoctor(d)}
                  className="w-full text-left rounded-xl border border-border p-3 transition-all hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs">
                        {d.name.split(' ').slice(1, 3).map(p => p[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.specialization}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-muted-foreground">{d.experience} yrs exp</span>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        <span className="text-[11px] text-muted-foreground">{d.city}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        ${d.consultationFee}
                      </p>
                      <p className="text-[10px] text-muted-foreground">per session</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'form' && selectedDoctor && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs">
                    {selectedDoctor.name.split(' ').slice(1, 3).map(p => p[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{selectedDoctor.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedDoctor.specialization}</p>
                </div>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  ${selectedDoctor.consultationFee}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appt-date">Date</Label>
                <Input
                  id="appt-date"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Time slot</Label>
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Checking availability…
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {slots.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => s.available && setTime(s.value)}
                        disabled={!s.available}
                        title={
                          s.available
                            ? 'Available'
                            : s.reason === 'booked'
                              ? 'Already booked'
                              : 'Past time'
                        }
                        className={cn(
                          // FIX #17: 44px minimum tap target.
                          'min-h-[44px] rounded-lg border text-xs font-medium transition-all',
                          time === s.value
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : s.available
                              ? 'border-border hover:border-emerald-500/40'
                              : 'border-border/60 text-muted-foreground/50 line-through cursor-not-allowed bg-muted/30',
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                    {slots.length === 0 && (
                      <p className="col-span-full text-sm text-muted-foreground py-2">
                        No slots for this day — try another date.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appt-reason">Reason for visit</Label>
                <textarea
                  id="appt-reason"
                  className="w-full rounded-md border border-border bg-transparent p-2 text-sm"
                  rows={3}
                  placeholder="Briefly describe your symptoms or reason for this consultation."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  maxLength={500}
                />
                <p className="text-[11px] text-muted-foreground">Optional. Helps the doctor prepare.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('list')}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                  disabled={!date || !time || submitting}
                  onClick={handleSubmit}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  <Video className="h-4 w-4 mr-1.5" />
                  Book Consult
                </Button>
              </div>
            </div>
          )}

          {step === 'success' && selectedDoctor && (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Your appointment with {selectedDoctor.name} has been booked.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {date} at {time} · Video consultation
                </p>
              </div>
              <Button
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
