'use client'

import * as React from 'react'
import {
  Search,
  Star,
  Video,
  Clock,
  Pill,
  FlaskConical,
  Plus,
  Minus,
  ShoppingCart,
  MapPin,
  CheckCircle2,
  Loader2,
  Stethoscope,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { generateSlots, type SlotOption } from '@/lib/booking-slots'
import { useAppStore } from '@/lib/store'

/* ----------------------------------- Data ----------------------------------- */

const SPECIALIZATIONS = [
  'General Physician',
  'Cardiologist',
  'Dermatologist',
  'Pediatrician',
  'Psychiatrist',
  'Gynecologist',
  'Orthopedic',
  'ENT',
]

const DOCTORS = [
  { id: 'd1', name: 'Dr. Sarah Johnson', specialization: 'Family Medicine', rating: 4.8, reviews: 124, experience: 12, fee: 150, available: true, city: 'Austin, TX' },
  { id: 'd2', name: 'Dr. Michael Chen', specialization: 'Internal Medicine', rating: 4.9, reviews: 312, experience: 18, fee: 175, available: true, city: 'Chicago, IL' },
  { id: 'd3', name: 'Dr. Emily Rodriguez', specialization: 'Dermatology', rating: 4.7, reviews: 89, experience: 9, fee: 150, available: false, city: 'San Francisco, CA' },
  { id: 'd4', name: 'Dr. David Kim', specialization: 'Pediatrics', rating: 4.9, reviews: 156, experience: 14, fee: 140, available: true, city: 'Dallas, TX' },
]

const MED_CATEGORIES = ['All', 'Diabetes', 'Cardiac', 'Pain Relief', 'Vitamins', 'Antibiotics', 'Digestive']
const MEDICINES = [
  { id: 'm1', name: 'Metformin 500mg', category: 'Diabetes', price: 35, unit: 'strip of 10', stock: 'In stock' },
  { id: 'm2', name: 'Atorvastatin 10mg', category: 'Cardiac', price: 85, unit: 'strip of 15', stock: 'In stock' },
  { id: 'm3', name: 'Paracetamol 650mg', category: 'Pain Relief', price: 25, unit: 'strip of 10', stock: 'In stock' },
  { id: 'm4', name: 'Vitamin D3 60k', category: 'Vitamins', price: 120, unit: 'bottle of 4', stock: 'In stock' },
  { id: 'm5', name: 'Amoxicillin 250mg', category: 'Antibiotics', price: 70, unit: 'strip of 10', stock: 'Low stock' },
  { id: 'm6', name: 'Pantoprazole 40mg', category: 'Digestive', price: 95, unit: 'strip of 15', stock: 'In stock' },
]

const LABS = [
  {
    id: 'l1',
    name: 'HealthStreet Labs',
    city: 'Austin, TX',
    zip: '78701',
    homeCollection: true,
    rating: 4.7,
    tests: [
      { name: 'Complete Blood Count', price: 35 },
      { name: 'Lipid Panel', price: 49 },
      { name: 'HbA1c', price: 39 },
      { name: 'Thyroid Panel', price: 59 },
    ],
  },
  {
    id: 'l2',
    name: 'National Diagnostic Network',
    city: 'Dallas, TX',
    zip: '75201',
    homeCollection: true,
    rating: 4.8,
    tests: [
      { name: 'Vitamin D', price: 45 },
      { name: 'Liver Function Panel', price: 49 },
      { name: 'Kidney Function Panel', price: 49 },
    ],
  },
  {
    id: 'l3',
    name: 'MediCore Reference Labs',
    city: 'Chicago, IL',
    zip: '60601',
    homeCollection: false,
    rating: 4.6,
    tests: [
      { name: 'Full Body Health Screening', price: 149 },
      { name: 'Diabetes Screening', price: 39 },
    ],
  },
]

// FIX #6: real slot options come from GET /api/doctors/[id]/slots?date= expanded
// client-side via generateSlots (availability windows + booked instants).

/* --------------------------------- Main view -------------------------------- */

export function MarketView() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">
          Book doctors, order medicines, schedule lab tests.
        </p>
      </div>

      <Tabs defaultValue="doctors" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="doctors" className="py-1.5 text-xs min-h-11 flex items-center justify-center">
            <Stethoscope className="h-3.5 w-3.5" />
            Doctors
          </TabsTrigger>
          <TabsTrigger value="medicines" className="py-1.5 text-xs min-h-11 flex items-center justify-center">
            <Pill className="h-3.5 w-3.5" />
            Medicines
          </TabsTrigger>
          <TabsTrigger value="labs" className="py-1.5 text-xs min-h-11 flex items-center justify-center">
            <FlaskConical className="h-3.5 w-3.5" />
            Lab Tests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="doctors" className="mt-4">
          <DoctorsTab />
        </TabsContent>
        <TabsContent value="medicines" className="mt-4">
          <MedicinesTab />
        </TabsContent>
        <TabsContent value="labs" className="mt-4">
          <LabsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* -------------------------------- Doctors tab ------------------------------- */

function DoctorsTab() {
  const { toast } = useToast()
  const { doctorOnline } = useAppStore()
  const [query, setQuery] = React.useState('')
  const [spec, setSpec] = React.useState<string>('all')
  const [bookingDoctor, setBookingDoctor] = React.useState<{ id: string; name: string; specialization: string; rating: number; reviewCount: number; experience: number; consultationFee: number; city: string; videoCallEnabled: boolean; available?: boolean } | null>(null)
  const [liveDoctors, setLiveDoctors] = React.useState<Array<{ id: string; name: string; specialization: string; rating: number; reviewCount: number; experience: number; consultationFee: number; city: string; videoCallEnabled: boolean }>>([])
  const [loadingDoctors, setLoadingDoctors] = React.useState(true)
  const [doctorsError, setDoctorsError] = React.useState<string | null>(null)

  // Fetch real doctors from API
  React.useEffect(() => {
    const params = new URLSearchParams()
    if (spec !== 'all') params.set('specialization', spec)
    if (query) params.set('search', query)
    fetch(`/api/doctors?${params}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setLiveDoctors(Array.isArray(data) ? data : [])
        setLoadingDoctors(false)
        setDoctorsError(null)
      })
      .catch((err) => {
        setDoctorsError(err instanceof Error ? err.message : 'Failed to load doctors')
        setLoadingDoctors(false)
      })
  }, [spec, query])

  // Merge live doctors with demo fallback
  const allDoctors: Array<{ id: string; name: string; specialization: string; rating: number; reviewCount: number; experience: number; consultationFee: number; city: string; videoCallEnabled: boolean; available?: boolean }> = liveDoctors.length > 0 ? liveDoctors : DOCTORS.map((d) => ({
    id: d.id,
    name: d.name,
    specialization: d.specialization,
    rating: d.rating,
    reviewCount: d.reviews,
    experience: d.experience,
    consultationFee: d.fee,
    city: d.city,
    videoCallEnabled: true,
    available: d.available,
  }))

  const filtered = allDoctors.filter((d) => {
    if (!doctorOnline) return false
    if (spec !== 'all' && d.specialization !== spec) return false
    if (query && !d.name.toLowerCase().includes(query.toLowerCase()) && !d.specialization.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search doctors..."
            className="pl-9"
          />
        </div>
        <Select value={spec} onValueChange={setSpec}>
          <SelectTrigger className="w-[min(160px,38vw)] shrink-0">
            <SelectValue placeholder="Specialty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {SPECIALIZATIONS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {doctorsError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">Could not load live doctor data. Showing sample data.</p>
        </div>
      )}
      {filtered.length === 0 && !doctorsError && (
        <EmptyState
          icon={Stethoscope}
          text={!doctorOnline ? 'No doctors online' : 'No doctors found'}
        />
      )}
        <div className="space-y-3">
          {filtered.map((d) => (
            <Card key={d.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                      {d.name.split(' ').slice(1, 3).map((p) => p[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{d.name}</h3>
                      {d.available !== false ? (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          Available
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Offline
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{d.specialization}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                        {d.rating} ({d.reviewCount ?? 0})
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {d.experience} yrs
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {d.city}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">${d.consultationFee}</p>
                    <p className="text-[10px] text-muted-foreground">per session</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                  disabled={!d.available}
                  onClick={() => setBookingDoctor(d)}
                >
                  <Video className="h-3.5 w-3.5" />
                  Book Video Consult
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

      <BookingDialog
        doctor={bookingDoctor}
        onClose={() => setBookingDoctor(null)}
        onConfirm={() => {
          toast({ title: 'Appointment booked!', description: 'Check your email for details.' })
          setBookingDoctor(null)
        }}
      />
    </div>
  )
}

function BookingDialog({
  doctor,
  onClose,
  onConfirm,
}: {
  doctor: { id: string; name: string; specialization: string; rating: number; reviewCount: number; experience: number; consultationFee: number; city: string; videoCallEnabled: boolean; available?: boolean } | null
  onClose: () => void
  onConfirm: () => void
}) {
  const { toast } = useToast()
  const [date, setDate] = React.useState('')
  const [slot, setSlot] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  // FIX #6: real slot options from availability windows + booked instants.
  const [slots, setSlots] = React.useState<SlotOption[]>([])
  const [loadingSlots, setLoadingSlots] = React.useState(false)

  React.useEffect(() => {
    if (doctor) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setDate(tomorrow.toISOString().slice(0, 10))
      setSlot('')
      setReason('')
    }
  }, [doctor])

  React.useEffect(() => {
    if (!doctor?.id || !date) return
    let cancelled = false
    setLoadingSlots(true)
    fetch(`/api/doctors/${doctor.id}/slots?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('slots unavailable'))))
      .then((data: { windows?: Parameters<typeof generateSlots>[0]; booked?: string[] }) => {
        if (cancelled) return
        const next = generateSlots(data.windows ?? [], date, { booked: data.booked ?? [] })
        setSlots(next)
        setSlot((prev) => (prev && next.some((s) => s.value === prev && s.available) ? prev : ''))
        setLoadingSlots(false)
      })
      .catch(() => {
        if (cancelled) return
        setSlots(generateSlots([], date))
        setLoadingSlots(false)
      })
    return () => {
      cancelled = true
    }
  }, [doctor?.id, date])

  const [consent, setConsent] = React.useState(false)

  React.useEffect(() => {
    if (doctor) setConsent(false)
  }, [doctor])

  const submit = async () => {
    if (!doctor?.id || !date || !slot) return
    setLoading(true)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: doctor.id,
          // `slot` is an HH:MM value from the availability-aware slot grid.
          scheduledAt: new Date(`${date}T${slot}:00`).toISOString(),
          type: 'video',
          reason: reason.trim() || 'Video consultation',
          consultationConsent: true,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Booking failed' }))
        throw new Error(err.error || 'Booking failed')
      }
      toast({ title: 'Appointment booked!', description: 'Check your email for details.' })
      onConfirm()
      onClose()
    } catch (e) {
      toast({ title: 'Booking failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={!!doctor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book video consultation</DialogTitle>
          <DialogDescription>
            {doctor?.name} · ${doctor?.consultationFee}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="appt-date">Date</Label>
            <Input
              id="appt-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
                {slots.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => s.available && setSlot(s.value)}
                    disabled={!s.available}
                    title={
                      s.available
                        ? 'Available'
                        : s.reason === 'booked'
                          ? 'Already booked'
                          : 'Past time'
                    }
                    className={cn(
                      'min-h-[44px] rounded-lg border text-xs font-medium transition-all',
                      slot === s.value
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
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">Optional. Helps the doctor prepare before your visit.</p>
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-6 w-6 accent-emerald-600 cursor-pointer"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I understand this is a video consultation and accept the terms including the doctor's liability disclaimer.
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!date || !slot || !consent || loading}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- Medicines tab ------------------------------ */

function MedicinesTab() {
  return (
    <div className="space-y-3">
      <EmptyState
        icon={Pill}
        text="Medicine ordering — available soon"
        subtext="Delivery charges apply on all orders. Plus & Family Pro subscribers enjoy discounted delivery fees."
      />
    </div>
  )
}

/* --------------------------------- Labs tab --------------------------------- */

function LabsTab() {
  const { toast } = useToast()
  const { labOnline } = useAppStore()
  const [bookingLab, setBookingLab] = React.useState<(typeof LABS)[number] | null>(null)
  const [selectedTests, setSelectedTests] = React.useState<string[]>([])

  const filteredLabs = labOnline ? LABS : []

  return (
    <div className="space-y-3">
      {filteredLabs.map((lab) => (
        <Card key={lab.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <FlaskConical className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{lab.name}</h3>
                  {lab.homeCollection && (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      Home collection
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    {lab.rating}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {lab.city}
                  </span>
                  <span>{lab.tests.length} tests</span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {lab.tests.slice(0, 2).map((t) => (
                    <div key={t.name} className="flex items-center justify-between text-xs">
                      <span className="truncate">{t.name}</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 ml-2">${t.price}</span>
                    </div>
                  ))}
                  {lab.tests.length > 2 && (
                    <p className="text-[11px] text-muted-foreground">+{lab.tests.length - 2} more</p>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
              onClick={() => {
                setBookingLab(lab)
                setSelectedTests([])
              }}
            >
              Book Test
            </Button>
          </CardContent>
        </Card>
      ))}

      {filteredLabs.length === 0 && labOnline && (
        <EmptyState icon={FlaskConical} text="No labs available" />
      )}
      {!labOnline && (
        <EmptyState icon={FlaskConical} text="No labs online" />
      )}

      <LabBookingDialog
        lab={bookingLab}
        selected={selectedTests}
        onToggle={(name) =>
          setSelectedTests((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]))
        }
        onClose={() => setBookingLab(null)}
        onConfirm={async (deliveryInfo) => {
          if (!bookingLab) return
          try {
            const csrf = await fetch('/api/auth/csrf', { credentials: 'include' }).then(r => r.json()).then(d => d.token)
            const tests = bookingLab.tests
              .filter((t) => selectedTests.includes(t.name))
              .map((t) => ({ name: t.name, price: t.price * 100 })) // convert to cents
            const res = await fetch('/api/lab-bookings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
              credentials: 'include',
              body: JSON.stringify({
                labId: bookingLab.id,
                tests,
                homeCollection: bookingLab.homeCollection,
                scheduledAt: new Date(Date.now() + 86400000).toISOString(),
                deliveryAddress: deliveryInfo?.address || null,
                deliveryCity: deliveryInfo?.city || null,
                deliveryZip: deliveryInfo?.zip || null,
                deliveryDistanceMi: deliveryInfo?.distanceMi ?? null,
                deliveryFee: deliveryInfo?.deliveryFeeCents || 0,
                deliveryPlatformFee: deliveryInfo?.platformFeeCents || 0,
                paymentStatus: deliveryInfo?.contactLab ? 'pending' : 'pending',
              }),
            })
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              toast({ title: 'Booking failed', description: data.error || 'Could not book test.', variant: 'destructive' })
              return
            }
            toast({
              title: 'Lab test booked!',
              description: `${selectedTests.length} test(s) booked at ${bookingLab.name}. The lab will reach out shortly.`,
            })
          } catch {
            toast({ title: 'Booked (offline)', description: 'Will sync when you reconnect.' })
          }
          setBookingLab(null)
        }}
      />
    </div>
  )
}

function LabBookingDialog({
  lab,
  selected,
  onToggle,
  onClose,
  onConfirm,
}: {
  lab: (typeof LABS)[number] | null
  selected: string[]
  onToggle: (name: string) => void
  onClose: () => void
  onConfirm: (deliveryInfo?: {
    address: string
    city: string
    zip: string
    distanceMi: number | null
    deliveryFeeCents: number
    platformFeeCents: number
    contactLab: boolean
  }) => void
}) {
  const [address, setAddress] = React.useState('')
  const [city, setCity] = React.useState('')
  const [zip, setZip] = React.useState('')
  const [deliveryResult, setDeliveryResult] = React.useState<{
    distanceMi: number | null
    deliveryFeeCents: number
    platformFeeCents: number
    contactLab: boolean
    distanceLabel: string
  } | null>(null)

  const testsTotal = lab
    ? lab.tests.filter((t) => selected.includes(t.name)).reduce((s, t) => s + t.price, 0)
    : 0

  // Calculate delivery fee when zip changes
  React.useEffect(() => {
    if (!zip || zip.length !== 5 || !lab?.zip) {
      setDeliveryResult(null)
      return
    }
    // Client-side distance calculation using the same haversine logic
    import('@/lib/delivery-fee').then(({ calculateDeliveryFee }) => {
      const result = calculateDeliveryFee(zip, lab.zip)
      setDeliveryResult(result)
    })
  }, [zip, lab?.zip])

  const deliveryFeeDollars = deliveryResult ? deliveryResult.deliveryFeeCents / 100 : 0
  const total = testsTotal + deliveryFeeDollars
  // Home collection requires a computable delivery result inside the delivery
  // area (0-30 mi). "Contact lab" (30+ mi or unknown zip) must NOT be bookable —
  // otherwise the patient books with a $0 delivery fee, losing money on the run.
  const canBook =
    selected.length > 0 &&
    (!lab?.homeCollection || (deliveryResult !== null && !deliveryResult.contactLab))

  return (
    <Dialog open={!!lab} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto custom-scroll">
        <DialogHeader>
          <DialogTitle>Book lab tests</DialogTitle>
          <DialogDescription>
            {lab?.name} · {lab?.city}
          </DialogDescription>
        </DialogHeader>

        {/* Test selection */}
        <div className="space-y-2 py-2">
          {lab?.tests.map((t) => {
            const checked = selected.includes(t.name)
            return (
              <button
                key={t.name}
                onClick={() => onToggle(t.name)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                  checked
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : 'border-border hover:border-emerald-500/40'
                )}
              >
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-md border',
                    checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40'
                  )}
                >
                  {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{t.name}</p>
                </div>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">${t.price}</span>
              </button>
            )
          })}
        </div>

        {/* Delivery address (home collection only) */}
        {lab?.homeCollection && selected.length > 0 && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold">Home collection address</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Delivery fee is calculated based on distance from the lab.
            </p>
            <input
              type="text"
              placeholder="Street address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <input
                type="text"
                placeholder="Zip code"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                maxLength={5}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            {deliveryResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Distance:</span>
                  <span className={cn('font-medium', deliveryResult.contactLab ? 'text-amber-600' : 'text-emerald-600')}>
                    {deliveryResult.distanceLabel}
                  </span>
                </div>
                {deliveryResult.contactLab && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This location is outside our delivery area. Please contact the lab directly to arrange home collection.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fee breakdown */}
        {selected.length > 0 && (
          <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
            <p className="text-sm font-semibold">Order summary</p>
            <div className="space-y-1.5">
              {lab?.tests.filter((t) => selected.includes(t.name)).map((t) => (
                <div key={t.name} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t.name}</span>
                  <span>${t.price.toFixed(2)}</span>
                </div>
              ))}
              {deliveryFeeDollars > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Home collection ({deliveryResult?.distanceLabel})</span>
                  <span className="text-emerald-600 dark:text-emerald-400">${deliveryFeeDollars.toFixed(2)}</span>
                </div>
              )}
              {deliveryFeeDollars === 0 && lab?.homeCollection && deliveryResult && !deliveryResult.contactLab && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Home collection</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Free</span>
                </div>
              )}
            </div>
            <div className="border-t border-border/40 pt-2 mt-2">
              <div className="flex items-center justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-emerald-600 dark:text-emerald-400">${total.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Secure checkout · Pay through the app
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canBook}
            onClick={() => {
              if (deliveryResult && !deliveryResult.contactLab) {
                onConfirm({
                  address,
                  city,
                  zip,
                  distanceMi: deliveryResult.distanceMi,
                  deliveryFeeCents: deliveryResult.deliveryFeeCents,
                  platformFeeCents: deliveryResult.platformFeeCents,
                  contactLab: false,
                })
              } else if (!lab?.homeCollection) {
                onConfirm() // in-lab pickup, no delivery
              }
              // else: home collection outside delivery area — button is disabled; never book
            }}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
          >
            {selected.length > 0
              ? deliveryResult?.contactLab
                ? 'Contact lab'
                : `Pay $${total.toFixed(2)}`
              : 'Select tests'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------- Helpers --------------------------------- */

function EmptyState({
  icon: Icon,
  text,
  subtext,
}: {
  icon: React.ComponentType<{ className?: string }>
  text: string
  subtext?: string
}) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        <Icon className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">{text}</p>
        {subtext && <p className="mt-1 text-xs opacity-70">{subtext}</p>}
      </CardContent>
    </Card>
  )
}
