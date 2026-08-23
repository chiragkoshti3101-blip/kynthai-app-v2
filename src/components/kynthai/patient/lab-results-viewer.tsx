'use client';

import * as React from 'react';
import {
  FlaskConical,
  Download,
  FileText,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronRight,
  TestTubeDiagonal,
  Share2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/components/kynthai/loading-state';
import { FadeIn } from '@/components/kynthai/animations';

interface LabBooking {
  id: string;
  labName: string;
  tests: Array<{ name: string; price: number }>;
  scheduledAt: string;
  status: string;
  price: number;
  homeCollection: boolean;
}

interface LabResults {
  id: string;
  status: string;
  tests: Array<{ name: string; price: number }>;
  hasResultsFile: boolean;
  resultsNote: string | null;
  resultUploadedAt: string | null;
  labName: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: 'Pending',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    icon: Clock,
  },
  sample_collected: {
    label: 'Sample Collected',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    icon: TestTubeDiagonal,
  },
  processing: {
    label: 'Processing',
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    icon: Loader2,
  },
  completed: {
    label: 'Completed',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    icon: CheckCircle2,
  },
};

export function LabResultsViewer({ isDemo }: { isDemo: boolean }) {
  const { toast } = useToast();
  const [bookings, setBookings] = React.useState<LabBooking[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [downloading, setDownloading] = React.useState<string | null>(null);
  const [sharing, setSharing] = React.useState<string | null>(null);
  const [expandedResults, setExpandedResults] = React.useState<LabResults | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    if (isDemo) {
      setBookings([
        {
          id: 'demo-lb1',
          labName: 'Kynthai Diagnostic Center',
          tests: [{ name: 'Complete Blood Count', price: 35 }],
          scheduledAt: new Date().toISOString(),
          status: 'pending',
          price: 35,
          homeCollection: false,
        },
        {
          id: 'demo-lb2',
          labName: 'Kynthai Diagnostic Center',
          tests: [{ name: 'Lipid Panel', price: 49 }],
          scheduledAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          status: 'sample_collected',
          price: 49,
          homeCollection: true,
        },
        {
          id: 'demo-lb3',
          labName: 'Kynthai Diagnostic Center',
          tests: [{ name: 'HbA1c', price: 39 }, { name: 'Vitamin D', price: 45 }],
          scheduledAt: new Date(Date.now() - 86400000 * 5).toISOString(),
          status: 'completed',
          price: 84,
          homeCollection: false,
        },
      ]);
      setLoading(false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('/api/lab-bookings', { cache: 'no-store', signal: controller.signal, credentials: 'include' });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.bookings)
            ? data.bookings
            : [];
      setBookings(list);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async (bookingId: string) => {
    setDownloading(bookingId);
    if (isDemo || bookingId.startsWith('demo-')) {
      toast({
        title: bookingId === 'demo-lb3' ? 'Results ready' : 'No results file yet',
        description:
          bookingId === 'demo-lb3'
            ? 'HbA1c 6.4% · Vitamin D 32 ng/mL — demo values, not a real report.'
            : 'This booking is still in progress.',
      });
      setDownloading(null);
      return;
    }
    try {
      const res = await fetch(`/api/lab-bookings/${bookingId}/results`);
      if (!res.ok) throw new Error('Failed to fetch results');
      const data: LabResults = await res.json();

      if (!data.hasResultsFile) {
        toast({
          title: 'No results file',
          description: 'Results have not been uploaded yet.',
        });
        return;
      }

      if (data.resultsNote) {
        setExpandedResults(data);
      } else {
        toast({
          title: 'Results available',
          description: 'Results file is ready. Contact your lab for a copy.',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Could not load results. Try again later.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(null);
    }
  };

  const handleShare = async (bookingId: string) => {
    setSharing(bookingId);
    if (isDemo || bookingId.startsWith('demo-')) {
      toast({ title: 'Shared successfully', description: 'Your doctor(s) have been notified. (demo)' });
      setSharing(null);
      return;
    }
    try {
      const res = await fetch(`/api/lab-bookings/${bookingId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // will share with all linked doctors by default
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to share');
      }
      toast({ title: 'Shared successfully', description: 'Your doctor(s) have been notified.' });
    } catch (err: unknown) {
      toast({ title: 'Share failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSharing(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <LoadingState label="Loading lab bookings…" fullPage={false} />
        </CardContent>
      </Card>
    );
  }

  if (bookings.length === 0) {
    return (
      <FadeIn>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <FlaskConical className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">No lab bookings yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Book a lab test from the Care tab to see your results here.
              </p>
            </div>
          </CardContent>
        </Card>
      </FadeIn>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((b, i) => {
        const sc = (STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending)!;
        const StatusIcon = sc.icon;
        const isProcessing = b.status === 'processing';

        return (
          <FadeIn key={b.id} delay={i * 0.05}>
            <Card className="transition-all hover:shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
                    <FlaskConical className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{b.labName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {b.tests.map(t => t.name).join(', ') || 'Lab test'}
                      {b.homeCollection && ' · Home collection'}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn('text-[10px] shrink-0', sc.color)}
                  >
                    <StatusIcon
                      className={cn('h-3 w-3', isProcessing && 'animate-spin')}
                    />
                    {sc.label}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(b.scheduledAt).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="text-xs font-medium">
                    ${b.price}
                  </span>
                </div>

                {b.status === 'completed' && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => handleDownload(b.id)}
                      disabled={downloading === b.id}
                    >
                      {downloading === b.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" /> Download Results
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleShare(b.id)}
                      disabled={sharing === b.id}
                    >
                      {sharing === b.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Share2 className="h-3.5 w-3.5" /> Share
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </FadeIn>
        );
      })}

      {expandedResults && (
        <FadeIn>
          <Card className="ring-1 ring-emerald-500/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-semibold">Results — {expandedResults.labName}</p>
                <button
                  onClick={() => setExpandedResults(null)}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </div>
              {expandedResults.resultsNote && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 whitespace-pre-wrap">
                  {expandedResults.resultsNote}
                </p>
              )}
              {expandedResults.resultUploadedAt && (
                <p className="text-[10px] text-muted-foreground">
                  Uploaded {new Date(expandedResults.resultUploadedAt).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}
