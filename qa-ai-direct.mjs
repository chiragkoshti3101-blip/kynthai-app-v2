import { chromium } from 'playwright';
const BASE = 'https://kynthai.app';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const apiResponses = [];
page.on('response', async r => {
  if (r.url().includes('/api/chat')) {
    const body = await r.json().catch(() => ({}));
    apiResponses.push({ status: r.status(), source: body.source, response: String(body.response || '').slice(0, 100) });
  }
});

await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.evaluate(() => { const b = document.getElementById('kynthai-boot'); if (b) b.classList.add('done'); });
await page.fill('input[type="email"]', 'patient@kynthai.app');
await page.fill('input[type="password"]', 'Demo@2024');
await page.locator('form button:has-text("Sign In")').last().click();
await page.waitForTimeout(7000);
const alarm = await page.evaluate(() => !!document.querySelector('[role="alertdialog"]'));
if (alarm) await page.locator('[role="alertdialog"] button:has-text("Skip")').click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(1000);

// Go to AI tab
await page.locator('nav button[aria-label="AI"]').click({ timeout: 4000 });
await page.waitForTimeout(2000);

// Check existing messages in the chat
const existingMsgs = await page.evaluate(() => {
  const els = document.querySelectorAll('[class*="prose"], [class*="markdown"]');
  return [...els].map(e => e.textContent?.trim().slice(0, 80));
});
console.log('Existing messages:', JSON.stringify(existingMsgs));

// Type and send a NEW message
await page.locator('textarea').fill('What is Metformin?');
await page.waitForTimeout(300);
// Submit via keyboard
await page.locator('textarea').press('Enter');
await page.waitForTimeout(8000);

console.log('API responses:', JSON.stringify(apiResponses, null, 1));

// Check final state
const finalMsgs = await page.evaluate(() => {
  const els = document.querySelectorAll('[class*="prose"], [class*="markdown"]');
  return [...els].slice(-3).map(e => e.textContent?.trim().slice(0, 100));
});
console.log('Final messages:', JSON.stringify(finalMsgs));
await page.screenshot({ path: '/tmp/qa-shots/ai-final.png' });

await browser.close();
