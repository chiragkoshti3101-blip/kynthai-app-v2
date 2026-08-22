'use client';

import React from 'react';
import { ContactEmail, ContactEmailText } from '@/components/kynthai/contact-email';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

function FAQ() {
  const faqs: Array<{ q: string; a: string }> = [
    {
      q: 'Is Kynthai a doctor or hospital?',
      a: 'No. Kynthai is a health management app — reminders, organization, and optional tools. It does not diagnose, treat, or replace emergency care. In an emergency call 911. See our Medical Disclaimer.',
    },
    {
      q: 'Is my health data safe?',
      a: 'We design for privacy. Traffic uses TLS. Uploaded documents and prescription images are encrypted at rest (AES-256-GCM). We do not sell your personal health data. You can request export or deletion from your account or by emailing privacy@kynthai.app.',
    },
    {
      q: 'Are you HIPAA compliant?',
      a: 'Kynthai is a consumer health app. We are not a HIPAA covered entity or business associate and do not claim HIPAA compliance. See our Privacy Policy for how we handle data under applicable US consumer privacy rules.',
    },
    {
      q: 'Is it really free to start?',
      a: 'Yes. The Free plan includes a member profile, a limited set of medications and AI chats, and smart reminders. No credit card is required to sign up. Paid plans unlock more capacity when you need them.',
    },
    {
      q: 'What do paid plans cost?',
      a: 'Listed early pricing is in USD (for example Plus about $9.99/mo and Family Pro about $19.99/mo). Prices can change with notice. Cancel from your account when billing is active.',
    },
    {
      q: 'Are doctors on the platform verified?',
      a: 'When doctor listing is available, our team reviews credentials before access. A platform badge means our review was completed — doctors remain responsible for their own licenses with state boards.',
    },
    {
      q: 'Can I cancel anytime?',
      a: 'Yes. When you have a paid subscription, cancel from your profile. You keep access through the end of the paid period where applicable.',
    },
    {
      q: "What if my doctor is not on Kynthai?",
      a: 'You can still use reminders, AI chat (health topics), and other patient tools. Invite your clinician when they are ready to join.',
    },
  ];

  return (
    <section className="border-y border-border/60 bg-muted/30 py-10 lg:py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="secondary"
            className="mb-3 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          >
            Frequently asked questions
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to know
          </h2>
          <p className="mt-3 text-muted-foreground">
            Still curious? Email us at{' '}
            <ContactEmail
              address="hello@kynthai.app"
              className="rounded-md px-1 -mx-1 py-2 -my-2 font-medium text-emerald-600 hover:underline"
            />
            .
          </p>
        </div>

        <Card className="mt-4 p-2 sm:p-4">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="px-3 text-left text-base font-medium sm:text-[15px]">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="px-3 text-sm leading-relaxed text-muted-foreground sm:text-[13.5px]">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </div>
    </section>
  );
}

export { FAQ };
