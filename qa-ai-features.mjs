import { chromium } from 'playwright';
const BASE = 'https://kynthai.app';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0,150)));
page.on('response', r => { if (r.status() >= 400 && !r.url().includes('_rsc')) console.log(`  [${r.status()}]`, r.url().replace(BASE,'').slice(0,80)); });

async function login(email) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = document.getElementById('kynthai-boot'); if (b) b.classList.add('done'); });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'Demo@2024');
  await page.locator('form button:has-text("Sign In")').last().click();
  await page.waitForTimeout(7000);
  const alarm = await page.evaluate(() => !!document.querySelector('[role="alertdialog"]'));
  if (alarm) await page.locator('[role="alertdialog"] button:has-text("Skip")').click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Accept all"), button:has-text("Essential only")').first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(500);
}

await login('patient@kynthai.app');
errors.length = 0;

// Navigate to AI tab
console.log('=== AI TAB ===');
await page.locator('nav button[aria-label="AI"]').click({ timeout: 4000 });
await page.waitForTimeout(2500);
const aiHeading = await page.evaluate(() => document.querySelector('h1,h2')?.textContent?.trim().slice(0,50));
console.log('AI heading:', aiHeading);
await page.screenshot({ path: '/tmp/qa-shots/patient-ai.png' });

// Try sending a message to the AI
const chatInput = await page.evaluate(() => {
  const input = document.querySelector('textarea, input[type="text"][placeholder*="message" i], input[placeholder*="ask" i], input[placeholder*="type" i]');
  return input ? { tag: input.tagName, placeholder: input.placeholder?.slice(0,40) } : null;
});
console.log('Chat input:', JSON.stringify(chatInput));

if (chatInput) {
  // Type a message
  await page.locator('textarea, input[type="text"]').last().fill('What is Atorvastatin used for?');
  await page.waitForTimeout(500);
  // Find send button
  const sendBtn = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => 
      b.querySelector('svg') && (b.textContent?.trim() === '' || /send|submit/i.test(b.getAttribute('aria-label') || ''))
    );
    return btns.length;
  });
  console.log('Send buttons found:', sendBtn);
  // Try clicking send
  await page.locator('form button[type="submit"], button[aria-label*="send" i]').last().click({ timeout: 3000 }).catch(async () => {
    // fallback: press enter
    await page.keyboard.press('Enter');
  });
  await page.waitForTimeout(5000);
  // Check for response
  const response = await page.evaluate(() => {
    const msgs = document.querySelectorAll('[class*="message"], [class*="chat"], [class*="bubble"]');
    return [...msgs].slice(-2).map(m => m.textContent?.trim().slice(0, 100));
  });
  console.log('AI response:', JSON.stringify(response));
  await page.screenshot({ path: '/tmp/qa-shots/patient-ai-response.png' });
}

// Navigate to Symptom Analyzer
console.log('\n=== SYMPTOM ANALYZER ===');
// Look for symptom analyzer in the AI tab or tools
const symptomLink = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, a')].filter(b => /symptom|analyzer|check/i.test(b.textContent || ''));
  return btns.map(b => b.textContent?.trim().slice(0, 30));
});
console.log('Symptom links:', JSON.stringify(symptomLink));

// Navigate to Tools tab
await page.locator('nav button[aria-label="Tools"]').click({ timeout: 4000 });
await page.waitForTimeout(2500);
const toolsHeading = await page.evaluate(() => document.querySelector('h1,h2')?.textContent?.trim().slice(0,50));
console.log('Tools heading:', toolsHeading);
await page.screenshot({ path: '/tmp/qa-shots/patient-tools.png' });

// Check drug interactions
console.log('\n=== DRUG INTERACTIONS ===');
const drugLink = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, a')].filter(b => /drug|interaction|interact/i.test(b.textContent || ''));
  return btns.map(b => ({ text: b.textContent?.trim().slice(0, 30), tag: b.tagName }));
});
console.log('Drug interaction links:', JSON.stringify(drugLink));

console.log('\nERRORS:', errors.length);
errors.slice(0,8).forEach(e => console.log(' ', e));
await browser.close();
