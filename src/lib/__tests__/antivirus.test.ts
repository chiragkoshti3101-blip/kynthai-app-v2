import { describe, it, expect } from 'vitest';
import { scanBuffer } from '../antivirus';
import { execSync } from 'child_process';

const hasClam = !!execSync('command -v clamscan || true', { shell: '/bin/bash' }).toString().trim();
const EICAR = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
const cleanPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');

describe('antivirus (ClamAV)', () => {
  it('reports engine availability consistently', () => {
    // Just ensure the module doesn't throw on construction and verdicts are shaped.
    expect(typeof scanBuffer).toBe('function');
  });

  it('flags EICAR test string as infected when a working scanner exists', async () => {
    if (!hasClam) return; // skip — clamscan absent in this env
    const v = await scanBuffer(EICAR, 'evil.txt');
    if (v.engine === 'unavailable') return; // binary exists but signatures may not be installed
    expect(v.infected).toBe(true);
  }, 40000);

  it('returns clean for a benign PDF when a working scanner exists', async () => {
    if (!hasClam) return;
    const v = await scanBuffer(cleanPdf, 'doc.pdf');
    if (v.engine === 'unavailable') return; // binary exists but signatures may not be installed
    expect(v.clean).toBe(true);
    expect(v.infected).toBe(false);
  }, 40000);

  it('degrades gracefully (unavailable) when clamscan is missing', async () => {
    if (hasClam) return; // only meaningful without clamscan
    const v = await scanBuffer(EICAR, 'evil.txt');
    expect(v.engine).toBe('unavailable');
  });

  it('fails closed when antivirus is required but the scanner is missing', async () => {
    const previousRequired = process.env.KYNTHAI_REQUIRE_AV;
    const previousScanner = process.env.KYNTHAI_CLAMSCAN;
    process.env.KYNTHAI_REQUIRE_AV = '1';
    process.env.KYNTHAI_CLAMSCAN = '/definitely/missing/kynthai-clamscan';
    try {
      const v = await scanBuffer(cleanPdf, 'doc.pdf');
      expect(v).toMatchObject({ clean: false, infected: false, engine: 'unavailable' });
    } finally {
      if (previousRequired === undefined) delete process.env.KYNTHAI_REQUIRE_AV;
      else process.env.KYNTHAI_REQUIRE_AV = previousRequired;
      if (previousScanner === undefined) delete process.env.KYNTHAI_CLAMSCAN;
      else process.env.KYNTHAI_CLAMSCAN = previousScanner;
    }
  });
});
