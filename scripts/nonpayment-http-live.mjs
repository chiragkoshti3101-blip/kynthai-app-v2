import nextEnv from '@next/env'
const { loadEnvConfig } = nextEnv
import { spawnSync } from 'node:child_process'
if (process.env.RUN_LIVE_NONPAYMENT_HTTP !== '1') {
  console.error('Explicit RUN_LIVE_NONPAYMENT_HTTP=1 required; creates and deletes synthetic live fixtures.')
  process.exit(1)
}
loadEnvConfig(process.cwd())
const result = spawnSync('pnpm', ['--config.verify-deps-before-run=false', '--config.manage-package-manager-versions=false', 'exec', 'vitest', 'run', 'scripts/nonpayment-http-live.test.ts'], { stdio: 'inherit', env: process.env })
process.exit(result.status ?? 1)
