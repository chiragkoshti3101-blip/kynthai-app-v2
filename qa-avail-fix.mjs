import { chromium } from 'playwright';
const BASE = 'https://kynthai.app';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => { const b = document.getElementById('kynthai-boot'); if (b) b.classList.add('done'); });
await page.fill('input[type="email"]', 'doctor@kynthai.app');
await page.fill('input[type="password"]', 'Demo@2024');
await page.locator('form button:has-text("Sign In")').last().click();
await page.waitForTimeout(7000);
const r = await page.evaluate(async () => {
  const c = await fetch('/api/auth/csrf', {credentials:'include'}).then(x=>x.json());
  const resp = await fetch('/api/doctors/availability', {credentials:'include'});
  return { status: resp.status, body: await resp.json() };
});
console.log('Doctor availability:', r.status, 'schedule keys:', Object.keys(r.body.schedule || {}).length);
await browser.close();
