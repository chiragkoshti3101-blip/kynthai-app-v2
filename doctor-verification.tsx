'use client';

import * as React from 'react';
import {
  Upload,
  Loader2,
  ShieldCheck,
  FileText,
  Award,
  MapPin,
  Video,
  X,
  Scale,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LogOut } from 'lucide-react';
import type { AuthUser } from '@/lib/store';
import { KynthaiBrand } from '../logo';
import { t, initLanguage } from '@/lib/i18n';
import { apiFetch } from '@/lib/client-fetch';

interface DoctorVerificationProps {
  user: AuthUser;
  existing?: {
    specialization?: string;
    licenseNumber?: string;
    experience?: number;
    consultationFee?: number;
    city?: string;
    state?: string;
    bio?: string;
    videoCallEnabled?: boolean;
    rejectionReason?: string | null;
    degreeType?: string;
    medicalCouncil?: string;
    npiNumber?: string;
    taxId?: string;
  } | null;
  onSubmitted: () => void;
  onLogout?: () => void;
}

const SPECIALIZATIONS = [
  'General Physician',
  'Cardiologist',
  'Dermatologist',
  'Pediatrician',
  'Psychiatrist',
  'Gynecologist',
  'Orthopedic',
  'ENT',
  'Neurologist',
  'Oncologist',
  'Endocrinologist',
  'Gastroenterologist',
];

interface UploadedDoc {
  id: string;
  name: string;
  type: string;
  size: number;
}

interface DocSlot {
  id: string;
  label: string;
}

const DOC_TYPES: DocSlot[] = [
  { id: 'license', label: t('medical_license') },
  { id: 'degree', label: t('degree_certificate') },
  { id: 'id', label: t('government_id') },
  { id: 'photo', label: t('profile_photo') },
];

export function DoctorVerification({ user, existing, onSubmitted, onLogout }: DoctorVerificationProps) {
  const { toast } = useToast();
  React.useEffect(() => {
    initLanguage();
  }, []);
  const [specialization, setSpecialization] = React.useState(existing?.specialization ?? '');
  const [licenseNumber, setLicenseNumber] = React.useState(existing?.licenseNumber ?? '');
  const [experience, setExperience] = React.useState(existing?.experience?.toString() ?? '');
  const [consultationFee, setConsultationFee] = React.useState(
    existing?.consultationFee?.toString() ?? ''
  );
  const [city, setCity] = React.useState(existing?.city ?? '');
  const [bio, setBio] = React.useState(existing?.bio ?? '');
  const [videoCall, setVideoCall] = React.useState(existing?.videoCallEnabled ?? true);
  const [degreeType, setDegreeType] = React.useState(existing?.degreeType ?? '');
  const [medicalCouncil, setMedicalCouncil] = React.useState(existing?.medicalCouncil ?? '');
  const [npiNumber, setNpiNumber] = React.useState(existing?.npiNumber ?? '');
  const [taxId, setTaxId] = React.useState(existing?.taxId ?? '');
  const [state, setState] = React.useState(existing?.state ?? '');
  const [doctorLiabilityAgreement, setDoctorLiabilityAgreement] = React.useState(false);
  const [documents, setDocuments] = React.useState<Record<string, UploadedDoc | undefined>>({});
  const [uploading, setUploading] = React.useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Step completion tracking
  const step1Complete = !!specialization && !!licenseNumber && !!city && !!state;
  const step2Complete = !!degreeType && !!medicalCouncil && !!npiNumber;
  const step3Complete = Object.values(documents).some(f => f !== undefined);
  const currentStep = step1Complete ? (step2Complete ? 3 : 2) : 1;

  const updateDoc = (id: string, file?: UploadedDoc) => setDocuments(p => ({ ...p, [id]: file }));

  const uploadFile = async (docId: string, file: File) => {
    setUploading(p => ({ ...p, [docId]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'CERTIFICATE');
      formData.append('category', 'ADMINISTRATIVE');
      formData.append('visibility', 'PRIVATE');
      formData.append('title', `Doctor certification — ${docId}`);
      formData.append('providerRole', 'doctor');
      formData.append('providerSlot', docId);
      const res = await apiFetch('/api/documents/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const payload = await res.json();
      const saved = payload.document;
      if (!saved?.id) throw new Error('Upload response was missing a document ID');
      setDocuments(p => ({
        ...p,
        [docId]: { id: saved.id, name: file.name, type: file.type, size: file.size },
      }));
    } catch {
      toast({ title: 'Upload failed', description: 'The encrypted certificate could not be stored.', variant: 'destructive' });
    } finally {
      setUploading(p => ({ ...p, [docId]: false }));
    }
  };

  const submit = async () => {
    if (!specialization) {
      toast({ title: t('select_specialization_toast'), variant: 'destructive' });
      return;
    }
    if (!licenseNumber) {
      toast({ title: t('license_required'), variant: 'destructive' });
      return;
    }
    if (!city) {
      toast({ title: t('city_required'), variant: 'destructive' });
      return;
    }
    if (!doctorLiabilityAgreement) {
      toast({ title: t('must_accept_liability'), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          name: user.name,
          specialization,
          licenseNumber,
          experience: parseInt(experience, 10) || 0,
          consultationFee: parseFloat(consultationFee) || 0,
          city,
          bio,
          videoCallEnabled: videoCall,
          documents: Object.fromEntries(
            Object.entries(documents).map(([k, v]) => [k, v ? { id: v.id } : null])
          ),
          degreeType,
          medicalCouncil,
          npiNumber,
          taxId,
          state,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || 'Submit failed');
      }
      onSubmitted();
    } catch (error) {
      toast({
        title: 'Submission failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-background to-background dark:from-emerald-950/20">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between">
          <KynthaiBrand />
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              {t('doctor_verification')}
            </Badge>
            {onLogout && (
              <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground hover:text-destructive">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6">
          <h1 className="text-2xl font-bold tracking-tight">
            {t('welcome_doctor')} {user.name?.split(' ').slice(-1)[0] ?? 'Doctor'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('complete_profile')}</p>
        </div>

        {existing?.rejectionReason && (
          <Card className="mt-4 border-rose-500/40 bg-rose-500/5">
            <CardContent className="p-4 text-sm">
              <p className="font-semibold text-rose-600 dark:text-rose-400">
                {t('previous_needs_changes')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{existing.rejectionReason}</p>
            </CardContent>
          </Card>
        )}

        {/* Progress stepper */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {[
            { step: 1, label: t('basic_info'), done: step1Complete },
            { step: 2, label: t('identity'), done: step2Complete },
            { step: 3, label: t('documents'), done: step3Complete },
          ].map((s, i) => (
            <React.Fragment key={s.step}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all',
                    s.done
                      ? 'bg-emerald-500 text-white'
                      : currentStep === s.step
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/30'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.step}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    currentStep === s.step
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground'
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < 2 && (
                <div
                  className={cn('h-0.5 w-8 mt-[-16px]', s.done ? 'bg-emerald-500' : 'bg-muted')}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <Card className="mt-4">
          <CardContent className="p-5 space-y-5">
            <Section
              icon={Award}
              title={t('professional_details')}
              tint="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t('specialization')}</Label>
                  <Select value={specialization} onValueChange={setSpecialization}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('select_specialization')} />
                    </SelectTrigger>
                    <SelectContent>
                      {SPECIALIZATIONS.map(s => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="license">{t('license_number')}</Label>
                    <Input
                      id="license"
                      value={licenseNumber}
                      onChange={e => setLicenseNumber(e.target.value)}
                      placeholder="USMD-XXXXX / NPI / State medical license"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="exp">{t('experience_years')}</Label>
                    <Input
                      id="exp"
                      type="number"
                      min={0}
                      value={experience}
                      onChange={e => setExperience(e.target.value)}
                      placeholder="12"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fee">{t('consultation_fee')}</Label>
                    <Input
                      id="fee"
                      type="number"
                      min={0}
                      value={consultationFee}
                      onChange={e => setConsultationFee(e.target.value)}
                      placeholder="500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city">{t('city')}</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="city"
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        placeholder="City"
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="degree">{t('degree_type')}</Label>
                    <Select value={degreeType} onValueChange={setDegreeType}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select_degree')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MBBS">MBBS</SelectItem>
                        <SelectItem value="MD">MD</SelectItem>
                        <SelectItem value="MS">MS</SelectItem>
                        <SelectItem value="Diploma">Diploma</SelectItem>
                        <SelectItem value="BDS">BDS</SelectItem>
                        <SelectItem value="MDS">MDS</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="medicalCouncil">Medical Council / Board</Label>
                    <Input
                      id="medicalCouncil"
                      value={medicalCouncil}
                      onChange={e => setMedicalCouncil(e.target.value)}
                      placeholder="State medical board / council no."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="npi">NPI Number</Label>
                    <Input
                      id="npi"
                      value={npiNumber}
                      onChange={e => setNpiNumber(e.target.value)}
                      placeholder="Optional 10-digit US NPI"
                      maxLength={10}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={e => setState(e.target.value)}
                      placeholder="CA"
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="taxId">Tax ID / EIN</Label>
                    <Input
                      id="taxId"
                      value={taxId}
                      onChange={e => setTaxId(e.target.value.toUpperCase())}
                      placeholder="XX-XXXXXXX"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bio">{t('bio_about')}</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder={t('bio_placeholder')}
                    rows={3}
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Video className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{t('video_consultations')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('accept_video_appointments')}
                      </p>
                    </div>
                  </div>
                  <Switch checked={videoCall} onCheckedChange={setVideoCall} />
                </div>
              </div>
            </Section>

            <Separator />

            <Section
              icon={FileText}
              title={t('document_uploads')}
              tint="bg-teal-500/10 text-teal-600 dark:text-teal-400"
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {DOC_TYPES.map(d => (
                  <DocUpload
                    key={d.id}
                    label={d.label}
                    doc={documents[d.id]}
                    uploading={!!uploading[d.id]}
                    onChange={f => (f ? uploadFile(d.id, f) : updateDoc(d.id, undefined))}
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{t('accepted_formats')}</p>
            </Section>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{t('submit_info_confirm')}</p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
              <Scale className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground">{t('doctor_liability')}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{t('liability_text')}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Checkbox
                    id="doctor-liability"
                    checked={doctorLiabilityAgreement}
                    onCheckedChange={v => setDoctorLiabilityAgreement(!!v)}
                  />
                  <label
                    htmlFor="doctor-liability"
                    className="text-[11px] leading-snug cursor-pointer select-none"
                  >
                    {t('agree_terms')}
                  </label>
                </div>
              </div>
            </div>

            <Button
              onClick={submit}
              disabled={submitting || !doctorLiabilityAgreement}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/20 h-11"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('submitting')}
                </>
              ) : (
                t('submit_for_verification')
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  tint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tint)}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function DocUpload({
  label,
  doc,
  uploading,
  onChange,
}: {
  label: string;
  doc?: UploadedDoc;
  uploading: boolean;
  onChange: (file?: File) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          'mt-1.5 flex w-full items-center gap-2 rounded-xl border border-dashed p-3 text-left transition-all',
          doc
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-border hover:border-emerald-500/40',
          uploading && 'opacity-60 cursor-wait'
        )}
      >
        {uploading ? (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
            <span className="text-xs text-muted-foreground">Uploading...</span>
          </>
        ) : doc ? (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileText className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{doc.name}</p>
              <p className="text-[10px] text-muted-foreground">{Math.round(doc.size / 1024)} KB</p>
            </div>
            <X
              className="h-4 w-4 text-muted-foreground hover:text-destructive"
              onClick={e => {
                e.stopPropagation();
                onChange(undefined);
              }}
            />
          </>
        ) : (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Upload className="h-4 w-4" />
            </span>
            <span className="text-xs text-muted-foreground">{t('tap_to_upload')}</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
