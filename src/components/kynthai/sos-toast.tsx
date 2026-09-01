'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Siren, X, MapPin, Phone, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useEmergencyCountry } from '@/components/kynthai/emergency-country-selector';

interface SosToastProps {
  alert: {
    memberName: string;
    location?: string;
    notes?: string;
    medicalInfo?: string;
    timestamp: string;
  };
  onDismiss: () => void;
  onNavigate?: (tab: string) => void;
}

export function SosToast({ alert, onDismiss, onNavigate }: SosToastProps) {
  const { country } = useEmergencyCountry();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed bottom-4 right-4 z-[100] w-full max-w-md sm:bottom-6 sm:right-6"
      >
        <Card className="border-rose-500/50 bg-rose-50/90 dark:bg-rose-950/90 shadow-2xl shadow-rose-500/10">
          <CardContent className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/10">
                  <Siren className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                    SOS Alert: {alert.memberName}
                  </p>
                  <p className="text-xs text-rose-600/80 dark:text-rose-400/80">
                    Emergency SOS triggered
                  </p>
                </div>
              </div>
              <button
                onClick={onDismiss}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-rose-600/70 hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                aria-label="Dismiss SOS alert"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Details */}
            <div className="space-y-2 text-sm">
              {alert.location && (
                <div className="flex items-center gap-2 text-rose-700/90 dark:text-rose-300/90">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">{alert.location}</span>
                </div>
              )}
              {alert.notes && (
                <div className="flex items-start gap-2 text-rose-700/80 dark:text-rose-300/80">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{alert.notes}</span>
                </div>
              )}
              {alert.medicalInfo && (
                <div className="flex items-start gap-2 text-rose-700/80 dark:text-rose-300/80">
                  <div className="h-3.5 w-3.5 shrink-0 mt-0.5 rounded-full bg-rose-500/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-rose-600">M</span>
                  </div>
                  <span>{alert.medicalInfo}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-rose-500/20">
              <Button
                onClick={() => {
                  onNavigate?.('home');
                  onDismiss();
                }}
                className="flex-1 gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/25"
              >
                <Siren className="h-3.5 w-3.5" />
                View Details
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  // Call emergency services only when the account country is known.
                  if (typeof window !== 'undefined' && country.dialNumber) {
                    window.location.href = `tel:${country.dialNumber}`;
                  }
                }}
                disabled={!country.dialNumber}
                className="h-11 w-11 rounded-full"
                aria-label={country.dialNumber
                  ? `Call emergency services at ${country.number}`
                  : 'Local emergency number unavailable'}
              >
                <Phone className="h-4 w-4 text-rose-600" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}