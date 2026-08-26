import { chromium } from 'playwright';
const BASE = 'https://kynthai.app';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

page.on('response', async r => {
  if (r.url().includes('/api/chat') || r.url().includes('/api/ai') || r.url().includes('/api/symptom')) {
    const body = await r.text().catch(() => '');
    console.log(`[${r.status()}] ${r.url().replace(BASE,'').slice(0,80)} → ${body.slice(0,200)}`);
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

// Type and send
await page.locator('textarea').fill('What is Atorvastatin used for?');
await page.waitForTimeout(500);

// Find the send button inside the form
const sent = await page.evaluate(() => {
  const form = document.querySelector('form');
  if (!form) return 'no form';
  const btn = form.querySelector('button[type="submit"]') || form.querySelector('button:last-of-type');
  if (btn) { btn.click(); return 'clicked submit'; }
  return 'no button in form';
});
console.log('Send:', sent);
await page.waitForTimeout(8000);

// Check for any response text
const chatContent = await page.evaluate(() => {
  const msgs = document.querySelectorAll('[class*="prose"], [class*="markdown"], [class*="message"], p');
  return [...msgs].slice(-5).map(m => m.textContent?.trim().slice(0, 100)).filter(t => t && t.length > 10);
});
console.log('Chat content:', JSON.stringify(chatContent));
await page.screenshot({ path: '/tmp/qa-shots/ai-chat-result.png' });

await browser.close();
