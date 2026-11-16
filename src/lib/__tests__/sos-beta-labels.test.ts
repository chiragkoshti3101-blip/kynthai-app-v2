import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = (path: string) => readFileSync(`src/components/kynthai/${path}`, 'utf8');
describe('SOS beta labels', () => {
  it('labels patient navigation, trigger, and floating action visibly and accessibly', () => {
    const s = source('patient/patient-app.tsx');
    expect(s).toContain("label: 'Emergency SOS (Beta)'");
    expect(s).toContain('Trigger SOS alert to family (Beta)');
    expect(s).toContain('aria-label="Emergency SOS (Beta)"');
    expect(s).toMatch(/<span[^>]*>Beta<\/span>/);
  });
  it('labels both caretaker alert tiers and navigation', () => {
    const s = source('caretaker/caretaker-app.tsx');
    for (const label of ['Family Alert (Beta)', 'SOS -- Critical (Beta)', 'Alert Caretaker (Beta)']) expect(s).toContain(label);
  });
  it('labels the family quick action and SOS details action', () => {
    expect(source('family/health-pulse.tsx')).toContain('SOS (Beta)');
    expect(source('sos-toast.tsx')).toContain('View Details (Beta)');
  });
  it('does not label direct emergency-service calls as beta', () => {
    for (const p of ['patient/patient-app.tsx', 'caretaker/caretaker-app.tsx']) {
      expect(source(p)).not.toContain('Call {country.number} (Beta)');
    }
  });
});
