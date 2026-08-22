'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Pill,
  Clock,
  Plus,
  Trash2,
  Pause,
  Play,
  Search,
  CheckCircle2,
  ScanLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { type Medication, getColorClasses } from '@/lib/types';
import { AddMedication } from './add-medication';
import { PrescriptionScanner } from './prescription-scanner';

function formatTime(t: string) {
  const [h = 0, m = 0] = t.split(':').map(Number) as [number, number];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function MedicationsList({
  userId,
  familyMemberId,
  isDemo,
  onLoaded,
}: { userId?: string; familyMemberId?: string; isDemo?: boolean; onLoaded?: () => void } = {}) {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    // Demo mode: show different sample medications per family member.
    if (isDemo) {
      const now = new Date().toISOString();
      const demoMeds: Record<string, Medication[]> = {
        fm1: [
          // Father
          {
            id: 'dm1',
            name: 'Metformin',
            dosage: '500mg',
            times: ['08:00', '20:00'],
            frequency: '2x daily',
            instructions: 'After meals',
            active: true,
            color: 'emerald',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'dm2',
            name: 'Amlodipine',
            dosage: '5mg',
            times: ['08:00'],
            frequency: 'Once daily',
            instructions: 'After breakfast',
            active: true,
            color: 'teal',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'dm3',
            name: 'Atorvastatin',
            dosage: '10mg',
            times: ['22:00'],
            frequency: 'At bedtime',
            instructions: 'With water',
            active: true,
            color: 'blue',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'dm4',
            name: 'Aspirin',
            dosage: '75mg',
            times: ['08:00'],
            frequency: 'Once daily',
            instructions: 'With food',
            active: true,
            color: 'amber',
            createdAt: now,
            updatedAt: now,
          },
        ],
        fm2: [
          // Mother
          {
            id: 'dm5',
            name: 'Thyroxine',
            dosage: '50mcg',
            times: ['07:00'],
            frequency: 'Once daily',
            instructions: 'Empty stomach, 30min before food',
            active: true,
            color: 'emerald',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'dm6',
            name: 'Calcium + D3',
            dosage: '500mg',
            times: ['20:00'],
            frequency: 'Once daily',
            instructions: 'After dinner',
            active: true,
            color: 'teal',
            createdAt: now,
            updatedAt: now,
          },
        ],
        fm3: [
          // Child
          {
            id: 'dm7',
            name: 'Cetirizine',
            dosage: '10mg',
            times: ['21:00'],
            frequency: 'As needed',
            instructions: 'For allergies',
            active: true,
            color: 'purple',
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      // If familyMemberId is provided, show that member's meds; otherwise show first member's
      const memberKey = familyMemberId || 'fm1';
      setMeds(demoMeds[memberKey] ?? demoMeds.fm1 ?? []);
      setLoading(false);
      onLoaded?.();
      return;
    }
    try {
      let url = '/api/medications';
      if (familyMemberId) url += `?familyMemberId=${encodeURIComponent(familyMemberId)}`;
      else if (userId) url += `?userId=${encodeURIComponent(userId)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal, credentials: 'include' });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      // The GET endpoint returns a paginated envelope ({ data: [...], meta })
      // — read the array out of it, not the whole object (which would make
      // `meds.filter(...)` crash with "filter is not a function").
      setMeds(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e) {
      // Fallback to empty list — spinner always resolves
      setMeds([]);
    } finally {
      setLoading(false);
      onLoaded?.();
    }
  }, [isDemo, toast, userId, familyMemberId, onLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (isDemo) {
      setMeds(prev => prev.filter(m => m.id !== id));
      toast({ title: 'Medication deleted' });
      return;
    }
    try {
      const res = await fetch(`/api/medications/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast({ title: 'Medication deleted' });
      setMeds(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const toggleActive = async (med: Medication) => {
    if (isDemo) {
      setMeds(prev => prev.map(m => (m.id === med.id ? { ...m, active: !m.active } : m)));
      return;
    }
    try {
      const res = await fetch(`/api/medications/${med.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !med.active }),
      });
      if (!res.ok) throw new Error('Update failed');
      setMeds(prev => prev.map(m => (m.id === med.id ? { ...m, active: !m.active } : m)));
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // ponytail: defensive — `meds` must always be an array (an API returning a
// non-array body used to set it to an object and crash `meds.filter`). Guard
// both the state shape and the filter so the portal can never blow up here.
const medList = Array.isArray(meds) ? meds : [];
  const filtered = medList.filter(
    m =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.dosage.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search medications..."
            className="pl-9"
          />
        </div>
        <Sheet open={scanOpen} onOpenChange={setScanOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" title="Scan prescription with AI">
              <ScanLine className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline ml-1">Scan</span>
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto custom-scroll">
            <SheetHeader>
              <SheetTitle>Scan prescription</SheetTitle>
              <SheetDescription>
                Upload a prescription photo and AI will extract all medications.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <PrescriptionScanner
                onImported={() => {
                  load();
                  setScanOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button className="bg-primary">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Add</span>
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto custom-scroll">
            <SheetHeader>
              <SheetTitle>Add medication</SheetTitle>
              <SheetDescription>
                Create a new medication reminder with AI assistance.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <AddMedication
                onAdded={isDemo ? undefined : load}
                onCreated={isDemo ? (m) => setMeds(prev => [...prev, m]) : undefined}
                onClose={() => setSheetOpen(false)}
                familyMemberId={familyMemberId}
                isDemo={isDemo}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Pill className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">{query ? 'No matches found' : 'No medications yet'}</p>
            <p className="text-sm mt-1">Tap “Add” to create your first medication reminder.</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[32rem]">
          <div className="space-y-3 pr-2">
            {filtered.map(med => {
              const cls = getColorClasses(med.color);
              return (
                <Card key={med.id} className={!med.active ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${cls.bg}`}
                      >
                        <Pill className={`h-5 w-5 ${cls.text}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{med.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            {med.dosage}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {med.frequency}
                          </Badge>
                          {!med.active && (
                            <Badge variant="outline" className="text-xs">
                              Paused
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {med.times.map(t => (
                            <span
                              key={t}
                              className={`px-1.5 py-0.5 rounded ${cls.bg} ${cls.text} font-medium`}
                            >
                              {formatTime(t)}
                            </span>
                          ))}
                        </div>

                        {med.instructions && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {med.instructions}
                          </p>
                        )}
                        {med.notes && (
                          <p className="text-sm mt-1 line-clamp-1">
                            <span className="text-muted-foreground">Note:</span> {med.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleActive(med)}
                          title={med.active ? 'Pause reminders' : 'Resume reminders'}
                        >
                          {med.active ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {med.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove the medication and all its reminders. This action
                                cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => remove(med.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {!loading && meds.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          {meds.length} medication{meds.length !== 1 ? 's' : ''} ·{' '}
          {meds.filter(m => m.active).length} active
        </p>
      )}
    </div>
  );
}
