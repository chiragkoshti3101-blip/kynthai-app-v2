'use client';

import { Gift, Users, Check, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';
import { formatPrice } from '@/lib/currency';

interface EarlyAdopterCardProps {
  onSelect: (type: 'individual' | 'family') => void;
}

// Early Adopter — founding member pricing (no fake countdown)
// Slot tracking — uses localStorage for demo

export function EarlyAdopterCard({ onSelect }: EarlyAdopterCardProps) {
  const { currency } = useAppStore();
  const setCheckoutFounder = useAppStore(s => s.setCheckoutFounder);

  const handleSelect = (type: 'individual' | 'family') => {
    setCheckoutFounder(true);
    onSelect(type);
  };

  return (
    <Card className="border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Early Bird Pricing</h3>
              <p className="text-sm text-muted-foreground">
                Current early pricing for individuals and families
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-500">SAVE MORE</Badge>
        </div>

        <div className="rounded-lg border bg-white p-4 mb-4 dark:bg-background">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold">Individual Plan (Patient)</span>
            </div>
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Early pricing
            </Badge>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <>
              <span className="text-3xl font-bold text-emerald-600">$9.99</span>
              <span className="text-muted-foreground">/month</span>
            </>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <span>Or $99.99/year</span>
          </div>
          <Button onClick={() => handleSelect('individual')} className="min-h-11 w-full" variant="outline">
            Choose Individual
          </Button>
        </div>

        <div className="rounded-lg border bg-white p-4 mb-4 dark:bg-background">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold">Family Plan</span>
            </div>
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Early pricing
            </Badge>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-bold text-emerald-600">$19.99</span>
            <span className="text-muted-foreground">/month</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <span>Or $199.99/year</span>
          </div>
          <Button onClick={() => handleSelect('family')} className="min-h-11 w-full" variant="outline">
            Choose Family
          </Button>
        </div>

        <Separator className="my-4" />
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-emerald-500" />
            <span>Early pricing in USD — cancel anytime from your account</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-emerald-500" />
            <span>Cancel anytime — contact support to manage your subscription</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-emerald-500" />
            <span>Switch between monthly and annual plans anytime</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-emerald-500" />
            <span>Protected purchase with standard buyer safeguards</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
