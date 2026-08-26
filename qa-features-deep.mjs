import { chromium } from 'playwright';
const BASE = 'https://kynthai.app';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const apiErrors = [];
page.on('response', r => { if (r.status() >= 400 && !r.url().includes('_rsc')) apiErrors.push(`[${r.status()}] ${r.url().replace(BASE,'').slice(0,80)}`); });

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
await page.locator('button:has-text("Accept all"), button:has-text("Essential only")').first().click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(500);
apiErrors.length = 0;

// === TOOLS TAB ===
console.log('=== TOOLS TAB ===');
await page.locator('nav button[aria-label="Tools"]').click({ timeout: 4000 });
await page.waitForTimeout(2500);
const toolsBtns = await page.evaluate(() => {
  return [...document.querySelectorAll('button, a')].filter(b => b.offsetParent !== null && b.textContent && b.textContent.trim().length > 2 && b.textContent.trim().length < 40)
    .map(b => b.textContent?.trim()).filter(t => t && !['Home','Meds','Care','Lab','AI','Journal','Tools','SOS'].includes(t));
});
console.log('Tools buttons:', JSON.stringify([...new Set(toolsBtns)].slice(0, 15)));

// Click Drug Interactions
const drugBtn = await page.locator('button:has-text("Drug Interactions"), button:has-text("Drug interaction")').first();
if (await drugBtn.count()) {
  await drugBtn.click({ timeout: 4000 });
  await page.waitForTimeout(2500);
  const drugContent = await page.evaluate(() => document.querySelector('main')?.textContent?.trim().slice(0, 300));
  console.log('\nDrug Interactions content:', drugContent?.slice(0, 200));
  await page.screenshot({ path: '/tmp/qa-shots/drug-interactions.png' });
  // Go back
  await page.locator('nav button[aria-label="Tools"]').click({ timeout: 4000 });
  await page.waitForTimeout(1500);
}

// Click Symptom Analyzer
const symptomBtn = await page.locator('button:has-text("Symptom"), button:has-text("symptom")').first();
if (await symptomBtn.count()) {
  await symptomBtn.click({ timeout: 4000 });
  await page.waitForTimeout(2500);
  const symptomContent = await page.evaluate(() => document.querySelector('main,h1,h2')?.textContent?.trim().slice(0, 200));
  console.log('\nSymptom Analyzer:', symptomContent?.slice(0, 200));
  await page.screenshot({ path: '/tmp/qa-shots/symptom-analyzer.png' });
} else {
  console.log('\nSymptom Analyzer: NO BUTTON FOUND');
}

// === PROFILE ===
console.log('\n=== PROFILE ===');
await page.locator('nav button[aria-label="Home"]').click({ timeout: 4000 });
await page.waitForTimeout(1500);
const profileText = await page.evaluate(() => {
  const els = [...document.querySelectorAll('*')].filter(e => /guest|Demo|Patient/i.test(e.textContent || '') && e.children.length === 0);
  return els.slice(0, 5).map(e => e.textContent?.trim().slice(0, 40));
});
console.log('Profile text:', JSON.stringify(profileText));

// === LAB BOOKING ===
console.log('\n=== LAB BOOKING ===');
await page.locator('nav button[aria-label="Lab"]').click({ timeout: 4000 });
await page.waitForTimeout(2500);
const labBtns = await page.evaluate(() => {
  return [...document.querySelectorAll('button')].filter(b => /book|schedule|order/i.test(b.textContent || '') && b.offsetParent !== null)
    .map(b => ({ text: b.textContent?.trim().slice(0, 30), disabled: b.disabled }));
});
console.log('Lab booking buttons:', JSON.stringify(labBtns));
await page.screenshot({ path: '/tmp/qa-shots/lab-booking.png' });

console.log('\nAPI errors:', apiErrors.length, apiErrors.slice(0, 5));
await browser.close();
