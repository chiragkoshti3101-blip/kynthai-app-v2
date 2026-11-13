export function isSeedDemoDisabled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_DEMO !== 'true';
}

export function seedDemoResponseBody(count: number, results: Array<{ email: string; action: string }>) {
  return { ok: true, count, results };
}
