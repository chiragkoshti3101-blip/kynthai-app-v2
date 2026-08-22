'use client';

import React from 'react';
import { ContactEmail, ContactEmailText } from '@/components/kynthai/contact-email';
import { Scale, ShieldPlus, Server, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function USTrust() {
  const badges = [
    {
      icon: Scale,
      label: 'Privacy-First',
      sub: 'Data protection by design',
      description: 'Your data stays yours',
      highlight: true,
    },
    {
      icon: ShieldPlus,
      label: 'Encrypted Uploads',
      sub: 'AES-256-GCM for documents',
      description: 'Prescription images & files encrypted at rest',
    },
    {
      icon: Server,
      label: 'Secure Infrastructure',
      sub: 'Protected cloud hosting',
      description: 'Hosted with major cloud providers',
    },
    {
      icon: Globe,
      label: 'US-Focused Product',
      sub: 'Built for US families',
      description: 'USD pricing · US-oriented workflows',
    },
  ];

  return (
    <section
      aria-labelledby="compliance-heading"
      className="border-y border-border/60 bg-gradient-to-b from-muted/30 via-emerald-500/5 to-muted/30 py-12"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-8">
          <Badge
            variant="secondary"
            className="mb-3 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          >
            Trust & Security
          </Badge>
          <h3 id="compliance-heading" className="text-2xl font-bold tracking-tight">
            Your data is safe, <span className="text-emerald-600">by design</span>.
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            TLS in transit · Document encryption at rest · Privacy-first architecture
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {badges.map(b => (
            <div key={b.label}>
              <div
                className={cn(
                  'flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-all',
                  b.highlight
                    ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 shadow-md shadow-emerald-600/5'
                    : 'border-border/60 bg-card hover:shadow-md'
                )}
              >
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-xl',
                    b.highlight
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg'
                      : 'bg-emerald-500/10 text-emerald-600'
                  )}
                  aria-hidden="true"
                >
                  <b.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{b.label}</p>
                  <p className="text-[11px] text-muted-foreground">{b.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legal footnote */}
        <p className="mx-auto mt-6 max-w-2xl text-center text-[10px] leading-relaxed text-muted-foreground">
          Kynthai Health Technologies operates secure data handling practices. Data is encrypted in
          transit (TLS 1.3), and uploaded documents and prescription images are additionally encrypted
          at rest with AES-256-GCM. For questions: <ContactEmailText address="privacy@kynthai.app" />.
        </p>
      </div>
    </section>
  );
}

export { USTrust };
