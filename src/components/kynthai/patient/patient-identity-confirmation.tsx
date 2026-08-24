'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  ShieldCheck,
  Upload,
  IdCard,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Camera,
  FileText,
  X,
  AlertCircle,
  Mail,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { VerificationBadge, getNextVerificationStep } from '@/components/kynthai/verification-badge';
import { ID_DOCUMENT_TYPES } from '@/lib/patient-verify';
import type { VerificationLevel } from '@/components/kynthai/verification-badge';

interface IdentityConfirmationProps {
  userId: string;
  userName: string;
  userEmail: string;
  /**
   * Current verification level.
   * Determines which step the user starts on.
   */
  currentLevel: VerificationLevel;
  /**
   * Whether the user currently has a phone stored.
   */
  currentPhone?: string;
  /**
   * Called after a verification step completes.
   */
  onComplete: (newLevel: VerificationLevel) => void;
  /**
   * Called when the user wants to skip/dismiss this flow.
   */
  onDismiss?: () => void;
}

type Step = 'start' | 'phone' | 'identity' | 'id_upload' | 'complete';

const stepOrder: Step[] = ['start', 'phone', 'identity', 'id_upload', 'complete'];

/* ── Step transition variants ─────────────────────────────────────── */
const stepVariants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.2, ease: 'easeIn' as const } },
};

/* ── Shake animation for error feedback ──────────────────────────── */
const shakeVariants = {
  shake: {
    x: [0, -6, 6, -4, 4, -2, 2, 0],
    transition: { duration: 0.4, ease: 'easeInOut' as const },
  },
  idle: { x: 0 },
};

export function PatientIdentityConfirmation({
  userId,
  userName,
  userEmail,
  currentLevel,
  currentPhone,
  onComplete,
  onDismiss,
}: IdentityConfirmationProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = React.useState<Step>(
    currentLevel === 'unverified' ? 'start'
    : currentLevel === 'email_verified' ? 'phone'
    : 'start'
  );
  const [loading, setLoading] = React.useState(false);
  const [shaking, setShaking] = React.useState(false);

  // Phone verification state
  const [phone, setPhone] = React.useState(currentPhone || '');
  const [smsCode, setSmsCode] = React.useState('');
  const [smsSent, setSmsSent] = React.useState(false);
  const [phoneVerified, setPhoneVerified] = React.useState(false);
  const [countdown, setCountdown] = React.useState(0);

  // Identity confirmation state
  const [identityChecked, setIdentityChecked] = React.useState(false);

  // ID upload state
  const [idType, setIdType] = React.useState('');
  const [idFile, setIdFile] = React.useState<File | null>(null);
  const [idPreview, setIdPreview] = React.useState<string | null>(null);
  const [selfieFile, setSelfieFile] = React.useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = React.useState<string | null>(null);

  // Track step key for AnimatePresence
  const [stepKey, setStepKey] = React.useState(0);

  // Countdown timer for SMS resend
  React.useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const goToStep = (step: Step) => {
    setCurrentStep(step);
    setStepKey(k => k + 1);
  };

  const triggerShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const sendSmsCode = async () => {
    if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
      toast({ title: 'Valid phone required (e.g. +15551234567)', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/users/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_sms', phone }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to send code');
      }
      setSmsSent(true);
      setCountdown(30);
      toast({ title: 'Verification code sent to your phone' });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const verifySmsCode = async () => {
    if (!smsCode || smsCode.length !== 6) {
      toast({ title: 'Enter the 6-digit code', variant: 'destructive' });
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/users/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_sms', smsCode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Invalid code');
      }
      setPhoneVerified(true);
      toast({ title: 'Phone verified!' });
      setTimeout(() => goToStep('identity'), 600);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
      triggerShake();
      setSmsCode('');
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when 6 digits are entered
  const handleOtpComplete = (value: string) => {
    if (value.length === 6) {
      setSmsCode(value);
      // Auto-trigger verification
      setLoading(true);
      (async () => {
        try {
          const res = await fetch('/api/users/verify', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify_sms', smsCode: value }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || 'Invalid code');
          }
          setPhoneVerified(true);
          toast({ title: 'Phone verified!' });
          setTimeout(() => goToStep('identity'), 600);
        } catch (err) {
          toast({ title: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
          triggerShake();
          setSmsCode('');
        } finally {
          setLoading(false);
        }
      })();
    }
  };

  const confirmIdentity = async () => {
    if (!identityChecked) {
      toast({ title: 'Please check the confirmation box', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/users/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_identity', identityConfirmed: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Confirmation failed');
      }
      toast({ title: 'Identity confirmed! You are verified.' });
      onComplete('identity_confirmed');
      goToStep('id_upload');
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const uploadIdDocument = async () => {
    if (!idFile || !idType) {
      toast({ title: 'Please select document type and upload a file', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(idFile);
      });

      const res = await fetch('/api/users/verify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_id',
          idDocumentType: idType,
          idDocumentData: base64,
          idDocumentName: idFile.name,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Upload failed');
      }
      toast({ title: 'Document uploaded for review' });
      onComplete('pending_review');
      goToStep('complete');
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Upload failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleIdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIdFile(file);
      const url = URL.createObjectURL(file);
      setIdPreview(url);
    }
  };

  const handleSelfieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelfieFile(file);
      const url = URL.createObjectURL(file);
      setSelfiePreview(url);
    }
  };

  const steps = [
    { id: 'start', label: 'Start', done: currentLevel !== 'unverified' },
    { id: 'phone', label: 'Phone', done: phoneVerified },
    { id: 'identity', label: 'Identity', done: currentLevel === 'identity_confirmed' || currentLevel === 'id_verified' || currentLevel === 'pending_review' },
    { id: 'id_upload', label: 'ID Upload', done: currentLevel === 'pending_review' || currentLevel === 'id_verified' },
  ];

  return (
    <Card className="border-emerald-500/20 shadow-lg shadow-emerald-600/5">
      <CardContent className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Verify Your Identity</h2>
              <p className="text-xs text-muted-foreground">
                {getNextVerificationStep(currentLevel)}
              </p>
            </div>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDismiss}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Current status */}
        <div className="flex items-center justify-center gap-3">
          <VerificationBadge level={currentLevel} size="md" />
        </div>

        {/* Progress stepper */}
        <div className="flex items-center justify-center gap-1 sm:gap-2">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                    s.done
                      ? 'bg-emerald-500 text-white'
                      : currentStep === s.id
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/30'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {s.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn(
                  'text-[9px] font-medium',
                  currentStep === s.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                )}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn(
                  'h-px w-6 sm:w-10 mt-[-14px]',
                  s.done ? 'bg-emerald-500' : 'bg-muted'
                )} />
              )}
            </React.Fragment>
          ))}
        </div>

        <Separator />

        {/* ── Animated Step Content ──────────────────────────────── */}
        <AnimatePresence initial={false}>
          <motion.div
            key={`step-${currentStep}-${stepKey}`}
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* ── Step: Start ──────────────────────────────────────── */}
            {currentStep === 'start' && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                  <ShieldCheck className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Help us confirm you&apos;re a real person</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
                    Complete a few quick steps to unlock full access. Your data is encrypted and never shared.
                  </p>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 max-w-lg mx-auto">
                  {[
                    { icon: Smartphone, label: 'Verify Phone', sub: 'SMS code' },
                    { icon: Lock, label: 'Confirm Identity', sub: 'Legal declaration' },
                    { icon: IdCard, label: 'Upload ID', sub: 'Optional but recommended' },
                  ].map(item => (
                    <div key={item.label} className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 p-3">
                      <item.icon className="h-5 w-5 text-emerald-600" />
                      <span className="text-xs font-medium">{item.label}</span>
                      <span className="text-[10px] text-muted-foreground">{item.sub}</span>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => goToStep('phone')}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/20"
                >
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {/* ── Step: Phone Verification ──────────────────────────── */}
            {currentStep === 'phone' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-semibold">Verify Your Phone Number</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll send a 6-digit code to confirm you own this number.
                </p>

                {!smsSent ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="verify-phone">Phone Number (E.164 format)</Label>
                      <Input
                        id="verify-phone"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+15551234567"
                      />
                    </div>
                    <Button
                      onClick={sendSmsCode}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Send Verification Code
                    </Button>
                  </div>
                ) : phoneVerified ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Phone Verified!</p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Enter 6-digit code</Label>
                      <motion.div
                        variants={shakeVariants}
                        animate={shaking ? 'shake' : 'idle'}
                        className="flex justify-center"
                      >
                        <InputOTP
                          maxLength={6}
                          value={smsCode}
                          onChange={setSmsCode}
                          onComplete={handleOtpComplete}
                          disabled={loading}
                          containerClassName="gap-2 sm:gap-3"
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} className="h-12 w-10 sm:h-14 sm:w-12 text-lg sm:text-xl font-bold rounded-l-md border-l" />
                            <InputOTPSlot index={1} className="h-12 w-10 sm:h-14 sm:w-12 text-lg sm:text-xl font-bold" />
                            <InputOTPSlot index={2} className="h-12 w-10 sm:h-14 sm:w-12 text-lg sm:text-xl font-bold" />
                          </InputOTPGroup>
                          <InputOTPGroup>
                            <InputOTPSlot index={3} className="h-12 w-10 sm:h-14 sm:w-12 text-lg sm:text-xl font-bold" />
                            <InputOTPSlot index={4} className="h-12 w-10 sm:h-14 sm:w-12 text-lg sm:text-xl font-bold" />
                            <InputOTPSlot index={5} className="h-12 w-10 sm:h-14 sm:w-12 text-lg sm:text-xl font-bold rounded-r-md" />
                          </InputOTPGroup>
                        </InputOTP>
                      </motion.div>
                      {loading && (
                        <div className="flex justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSmsSent(false)}
                        className="text-xs"
                      >
                        Change phone number
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={sendSmsCode}
                        disabled={countdown > 0 || loading}
                        className="text-xs"
                      >
                        {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step: Identity Confirmation ───────────────────────── */}
            {currentStep === 'identity' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-semibold">Confirm Your Identity</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  By checking the box below, you make a legal declaration confirming your identity.
                </p>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Identity Affidavit</p>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        I, <strong>{userName || userEmail}</strong>, hereby confirm that I am a real person
                        and that all information I have provided to Kynthai is true and accurate to the
                        best of my knowledge. I understand that providing false information may result in
                        permanent account suspension and forfeiture of all services.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="identity-affidavit"
                      checked={identityChecked}
                      onCheckedChange={v => setIdentityChecked(!!v)}
                    />
                    <label htmlFor="identity-affidavit" className="text-xs leading-snug cursor-pointer select-none">
                      I confirm that I am a real person and that my identity details are accurate.
                    </label>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => goToStep('phone')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button
                    onClick={confirmIdentity}
                    disabled={loading || !identityChecked}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/20"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirm & Verify
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step: ID Upload ───────────────────────────────────── */}
            {currentStep === 'id_upload' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <IdCard className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-semibold">Upload Government ID (Optional)</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  For maximum trust level, upload a government-issued ID. <strong>Encrypted end-to-end.</strong>
                </p>

                <div className="space-y-1.5">
                  <Label>Document Type</Label>
                  <Select value={idType} onValueChange={setIdType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ID_DOCUMENT_TYPES.map(dt => (
                        <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  {/* ID Document Upload */}
                  <div className="space-y-1.5">
                    <Label>ID Document (front)</Label>
                    <button
                      type="button"
                      onClick={() => document.getElementById('id-file-input')?.click()}
                      className={cn(
                        'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-all',
                        idFile
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-border hover:border-emerald-500/40 hover:bg-emerald-500/5'
                      )}
                    >
                      {idPreview ? (
                        <img src={idPreview} alt="ID preview" className="max-h-28 rounded-lg object-contain" />
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Tap to upload</span>
                          <span className="text-[10px] text-muted-foreground">JPG, PNG, or PDF</span>
                        </>
                      )}
                    </button>
                    <input
                      id="id-file-input"
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      className="hidden"
                      onChange={handleIdFileChange}
                    />
                  </div>

                  {/* Selfie Upload */}
                  <div className="space-y-1.5">
                    <Label>Selfie / Profile Photo</Label>
                    <button
                      type="button"
                      onClick={() => document.getElementById('selfie-file-input')?.click()}
                      className={cn(
                        'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-all',
                        selfieFile
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-border hover:border-emerald-500/40 hover:bg-emerald-500/5'
                      )}
                    >
                      {selfiePreview ? (
                        <img src={selfiePreview} alt="Selfie preview" className="max-h-28 rounded-full object-cover aspect-square" />
                      ) : (
                        <>
                          <Camera className="h-8 w-8 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Take a selfie</span>
                          <span className="text-[10px] text-muted-foreground">JPG or PNG</span>
                        </>
                      )}
                    </button>
                    <input
                      id="selfie-file-input"
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={handleSelfieChange}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onComplete('identity_confirmed')}>
                    Skip for now
                  </Button>
                  <Button
                    onClick={uploadIdDocument}
                    disabled={loading || !idFile || !idType}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/20"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Upload for Review
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step: Complete ─────────────────────────────────────── */}
            {currentStep === 'complete' && (
              <div className="space-y-4 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10"
                >
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-semibold">Identity Verified!</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your documents have been submitted for review. You&apos;ll receive a confirmation
                    once the admin team has verified them.
                  </p>
                </div>
                <div className="flex justify-center">
                  <VerificationBadge level="pending_review" size="lg" showTooltip={true} />
                </div>
                {onDismiss && (
                  <Button onClick={onDismiss} variant="outline">
                    Done
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer privacy note */}
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2.5">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Your identity documents are encrypted and only used for verification purposes.
            They are never shared with third parties. You can request deletion at any time.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
