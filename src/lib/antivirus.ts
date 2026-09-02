/**
 * Kynthai malware scan (ClamAV).
 *
 * HEALTH-SECURITY: uploaded files are validated (magic bytes, size, type) and
 * AES-256-GCM encrypted at rest, but that doesn't catch a genuinely malicious
 * PDF/document. ClamAV adds signature-based malware detection.
 *
 * Deployment reality:
 *  - Self-hosted / local / a box with the `clamscan` binary: REAL scanning.
 *  - Vercel serverless: `clamscan` is normally unavailable. In production,
 *    uploads therefore fail closed until a scanner is configured; use a
 *    separate scanner service/worker for serverless deployments.
 *
 * Policy:
 *  - `KYNTHAI_REQUIRE_AV=0` explicitly permits a best-effort scan.
 *  - Otherwise AV is required in production and whenever
 *    `KYNTHAI_REQUIRE_AV=1` is set. An unavailable, errored, or timed-out scan
 *    is never reported as clean when AV is required.
 */

import { spawn } from 'child_process';
import { logger } from '@/lib/logger';

export type ScanVerdict =
  | { clean: boolean; infected: boolean; engine: 'clamav' | 'unavailable'; details?: string };

export function isAntivirusRequired(): boolean {
  return process.env.KYNTHAI_REQUIRE_AV !== '0' && (
    process.env.NODE_ENV === 'production' || process.env.KYNTHAI_REQUIRE_AV === '1'
  )
}

/**
 * Scan a file's bytes with ClamAV (clamscan reading from stdin). Returns a
 * verdict. `clean:false, infected:true` if a signature matched; when the
 * binary isn't installed it reports `unavailable` (or fail-closed if
 * KYNTHAI_REQUIRE_AV=1).
 */
export function scanBuffer(buffer: Buffer, filename?: string): Promise<ScanVerdict> {
  return new Promise((resolve) => {
    let clamscan = process.env.KYNTHAI_CLAMSCAN || 'clamscan';

    const child = spawn(clamscan, ['-', '--no-summary', ...(filename ? [`--scan-archive=yes`] : [])], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        clean: !isAntivirusRequired(),
        infected: false,
        engine: 'unavailable',
        details: 'scan timeout',
      });
    }, 30000); // 30s hard cap per file

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      // clamscan not installed / not executable.
      const required = isAntivirusRequired();
      logger.phiSafeError(err, 'antivirus.scan-missing');
      resolve({
        clean: !required,
        infected: false,
        engine: 'unavailable',
        details: required ? 'AV unavailable (fail-closed)' : err.message,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      // clamscan exit codes: 0 = clean, 1 = infected, 2 = error.
      if (code === 0) return resolve({ clean: true, infected: false, engine: 'clamav' });
      if (code === 1) {
        const m = stdout.match(/^.*: ([A-Za-z0-9._\- ]+)\s+FOUND/m);
        return resolve({
          clean: false,
          infected: true,
          engine: 'clamav',
          details: m?.[1] || 'malware signature matched',
        });
      }
      // code 2 (scan error) is not evidence of a clean file. It is an
      // unavailable verdict; uploads reject it whenever AV is required.
      const required = isAntivirusRequired();
      logger.warn('antivirus.scan-unavailable', { code });
      resolve({
        clean: !required,
        infected: false,
        engine: 'unavailable',
        details: `clamscan error (code ${code})`,
      });
    });

    child.stdin.on('error', () => {});
    child.stdin.write(buffer);
    child.stdin.end();
  });
}
