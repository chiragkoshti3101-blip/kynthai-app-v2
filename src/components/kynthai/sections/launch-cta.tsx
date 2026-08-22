'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LoginPortal } from '@/lib/store';

/* ------------------------------------------------------------------ */
/* Launch CTA — get users into the app now                            */
/* ------------------------------------------------------------------ */
export function LaunchCTA({ onPickPortal }: { onPickPortal: (portal: LoginPortal) => void }) {
  return (
    <section className="border-y border-border/60 bg-gradient-to-b from-emerald-500/[0.03] to-teal-500/[0.03] py-10 lg:py-14">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
        <Badge
          variant="secondary"
          className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
        >
          Available now
        </Badge>
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Kynthai is live <span className="text-emerald-600">for US families</span>
        </h2>
        <p className="mt-3 text-muted-foreground">
          Start managing your family&apos;s health today — free to sign up, no credit card required.
        </p>

        <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
          <Button
            onClick={() => onPickPortal('patient')}
            className="h-12 min-h-12 flex-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 text-white shadow-lg shadow-emerald-600/20"
          >
            Get Started Free
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.href = '/login'
            }}
            className="h-12 min-h-12 flex-1 rounded-full border-border px-6"
          >
            Sign In
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Privacy-first · free to start · not a medical provider
        </p>
      </div>
    </section>
  );
}
