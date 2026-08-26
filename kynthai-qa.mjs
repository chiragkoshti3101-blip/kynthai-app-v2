import { chromium } from 'playwright';

const BASE = 'https://kynthai.app';
const results = [];
const errors = [];

function log(page, msg) { console.log(`[${page}] ${msg}`); }

async function newPage(ctx, name) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
  page._name = name;
  page._consoleErrors = consoleErrors;
  return page;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// ---------- AUTH: all four roles ----------
const accounts = [
  ['caretaker@kynthai.app', '/family', 'CARETAKER'],
  ['patient@kynthai.app', '/patient', 'PATIENT'],
  ['doctor@kynthai.app', '/doctor', 'DOCTOR'],
  ['lab@kynthai.app', '/lab', 'LAB'],
];

for (const [email, expectedPath, role] of accounts) {
  const page = await newPage(ctx, role);
  try {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    // click the role tab matching this account
    const roleTab = page.locator('button', { hasText: new RegExp(role === 'CARETAKER' ? 'Family' : role, 'i') }).first();
    if (await roleTab.count()) await roleTab.click().catch(() => {});
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'Demo@2024');
    await Promise.all([
      page.waitForURL(u => !String(u).includes('/login'), { timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"], button:has-text("Sign In")'),
    ]);
    await page.waitForTimeout(2500);
    const url = page.url();
    const landed = url.includes(expectedPath.slice(1));
    log(role, `login → ${url} ${landed ? 'OK' : '**MISROUTE**'}`);
    results.push({ role, test: 'login-redirect', pass: landed, url });
    if (!landed) {
      await page.screenshot({ path: `/tmp/qa-shots/${role}-login-fail.png` });
      // capture visible error text
      const errText = await page.locator('[role="alert"], .text-red, [class*="error"]').allTextContents().catch(() => []);
      log(role, 'login error text: ' + errText.join(' | ').slice(0, 200));
      results.push({ role, test: 'login-error-text', pass: false, url, detail: errText.join('|').slice(0,300) });
    }
    // save cookies per role for API tests
    const state = await ctx.storageState({ path: `/tmp/qa-state-${role}.json` });
  } catch (e) {
    log(role, 'EXCEPTION: ' + String(e).slice(0, 150));
    results.push({ role, test: 'login-flow', pass: false, url: page.url(), detail: String(e).slice(0,200) });
  }
  await page.close();
}

console.log('\n=== RESULTS ===');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.role}  ${r.test}  ${r.url}  ${r.detail || ''}`);
console.log('\n=== CONSOLE ERRORS ===');
errors.forEach(e => console.log(e));
await browser.close();
