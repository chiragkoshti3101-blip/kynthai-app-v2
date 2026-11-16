import { captureRequestError } from '@sentry/nextjs';
export const onRequestError = captureRequestError;

// Next.js instrumentation hook — required for @sentry/nextjs to initialize
// at runtime. Without this file the SDK never starts, so SENTRY_DSN in Vercel
// env had no effect. The configs themselves are no-ops when DSN is unset.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}