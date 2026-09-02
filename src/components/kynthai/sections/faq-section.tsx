import { ChevronDown } from 'lucide-react';
import { ContactEmail } from '@/components/kynthai/contact-email';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { HOME_FAQS } from '@/components/kynthai/faq-data';

function FAQ() {
  const faqs = HOME_FAQS;

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
          <div className="w-full">
            {faqs.map((f) => (
              <details key={f.q} className="group border-b last:border-b-0">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-md px-3 py-4 text-left text-base font-medium outline-none transition-all hover:underline focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span>{f.q}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <div className="px-3 pb-4 text-sm leading-relaxed text-muted-foreground sm:text-[13.5px]">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

export { FAQ };
