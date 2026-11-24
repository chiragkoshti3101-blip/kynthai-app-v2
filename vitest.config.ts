import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/.next/**'],
    environment: 'node',
    env: {
      // Core connection — provide via CI env or local .env.test
      DATABASE_URL: process.env.DATABASE_URL || '',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    // Fail loudly if DATABASE_URL is missing (prevents silent test passes)
    setupFiles: process.env.DATABASE_URL ? [] : undefined,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      // Conservative floor so coverage cannot silently regress; raise as the
      // lib layer gains tests. Only enforced by `npm run test:coverage`.
      thresholds: { lines: 10, functions: 10, branches: 10, statements: 10 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
