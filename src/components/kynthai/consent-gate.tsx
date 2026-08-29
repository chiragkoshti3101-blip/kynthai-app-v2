'use client';

import * as React from 'react';
import { ShieldAlert, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

interface ConsentGateProps {
  consentAccepted: boolean;
  dataProcessingConsent: boolean;
  userName?: string;
}

export function ConsentGate({
  consentAccepted,
  dataProcessingConsent,
  userName,
}: ConsentGateProps) {
  const router = useRouter();
  const [granting, setGranting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const missingItems = [
    {
      key: 'consentAccepted',
      label: 'Terms of Service & Privacy Policy',
      accepted: consentAccepted,
    },
    {
      key: 'dataProcessingConsent',
      label: 'Health Data Processing Consent',
      accepted: dataProcessingConsent,
    },
  ] as const;

  // Grants all three consents in one call. The global CSRF interceptor
  // (client-fetch) attaches X-CSRF-Token automatically; PATCH /api/user/consent
  // is the one endpoint exempted from the consent block so unconsented users
  // can consent in the first place. On success the store re-fetches /api/auth/me
  // on reload, which returns the fresh flags and lets the portal render.
  const grantConsent = async () => {
    setGranting(true);
    setError(null);
    try {
      const res = await fetch('/api/user/consent', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentAccepted: true,
          dataProcessingConsent: true,
          aiTrainingConsent: true,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || 'Could not save consent — please try again.');
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save consent — please try again.');
      setGranting(false);
    }
  };

  return (
    <div className="w-full max-w-md px-4">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Consent Required</h2>
              <p className="text-xs text-muted-foreground">
                {userName ? `${userName}, ` : ''}please review and accept the following to access
                your health data.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {missingItems.map(item => (
              <div
                key={item.key}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3',
                  item.accepted
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-amber-500/30 bg-amber-500/5'
                )}
              >
                {item.accepted ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                <span
                  className={cn(
                    'text-sm',
                    item.accepted
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  )}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your data is protected under applicable privacy law in your jurisdiction. We only process your
            health information to provide care services. You can withdraw consent at any time from
            your profile settings.
          </p>

          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          <Button
            onClick={grantConsent}
            disabled={granting}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
          >
            {granting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Accept & Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
          <button
            onClick={() => router.push('/privacy')}
            className="w-full text-center text-xs text-muted-foreground hover:text-emerald-600"
          >
            View Privacy Policy
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

// Local cn helper (avoids importing from utils at module level in a critical path)
function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
