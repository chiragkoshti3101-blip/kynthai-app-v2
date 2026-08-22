'use client';

import * as React from 'react';
import { Gift, Clock, Users, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EarlyAdopterBannerProps {
  onGetStarted: (portal?: string) => void;
}

export function EarlyAdopterBanner({ onGetStarted }: EarlyAdopterBannerProps) {
  return (
    <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white">
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between sm:gap-4">
          {/* Left: Main message */}
          <div className="flex items-start gap-2.5 sm:items-center sm:gap-3 text-center sm:text-left">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 sm:h-10 sm:w-10">
              <Gift className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight sm:text-base">🎉 Pricing — $9.99/mo Individual, $19.99/mo Family</p>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-100 sm:text-sm">
                Transparent pricing with no surprise charges at checkout.
              </p>
            </div>
          </div>

          {/* Right: CTA */}
          <Button
            onClick={() => onGetStarted()}
            className="shrink-0 min-h-11 bg-white text-emerald-700 hover:bg-emerald-50"
            size="sm"
          >
            Get Started
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
