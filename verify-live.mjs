// Drives the persisted project org-chart layout against the LIVE abc site.
// Try abc.wehive.co.uk first (4-part subdomain → tenant 'abc'); fall back to
// the .web.app URL if DNS isn't there (note: that resolves to tenant 'admin'
// per tenant.ts, which won't have the same data — surface that clearly).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const CANDIDATES = [
  'https://abc.wehive.co.uk',
  'https://hrapp-1febc.web.app',
];
const SHOTS = './verify-shots-live';

async function shot(page, name) {
  await fs.mkdir(SHOTS, { recursive: true });
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log('shot:', p);
  return p;
}

const log = (...a) => console.log('[verify-live]', ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('console', m => {
  const t = m.type();
  if (t === 'error' || t === 'warning') console.log('  [page]', t, m.text());
});
page.on('pageerror', e => console.log('  [pageerror]', e.message));

let BASE = null;
for (const url of CANDIDATES) {
  try {
    log('try', url);
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (r && r.ok()) { BASE = url; break; }
    log('  status:', r ? r.status() : 'no response');
  } catch (e) {
    log('  unreachable:', e.message.split('\n')[0]);
  }
}
if (!BASE) {
  console.error('VERIFY ERROR: no candidate URL reachable');
  await browser.close();
  process.exit(2);
}
log('using', BASE);

try {
  await page.waitForTimeout(3000);
  await shot(page, '01-loaded');

  // Detect what tenant the live page is serving — the header chip shows the
  // company name; that's our smoke test.
  const tenantHint = await page.locator('body').innerText().catch(() => '');
  log('tenant context contains "Ancient Builders":',
    /Ancient Builders/i.test(tenantHint));

  // Login
  log('login as manish.gaikwad');
  await page.fill('input[name="username"], input[placeholder*="sername" i], input[type="text"]', 'manish.gaikwad');
  await page.fill('input[type="password"]', 'hr@2026');
  await shot(page, '02-login-filled');
  await page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")');
  await page.waitForTimeout(2500);
  await shot(page, '03-after-login');

  // Navigate to Org Chart
  const link = page.locator('a:has-text("Org Chart"), a:has-text("Organization")').first();
  if (await link.count()) await link.click();
  else await page.goto(BASE + '/org-chart', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shot(page, '04-org-chart');

  await page.click('button:has-text("By Project")');
  await page.waitForTimeout(700);
  await shot(page, '05-by-project');

  await page.click('button:has-text("Tree")');
  await page.waitForTimeout(1500);
  await shot(page, '06-tree-default');

  // Read the status pill BEFORE any interaction — tells us whether a saved
  // layout already exists for the default-selected project.
  const initialPill = await page.locator('.bg-white\\/90, [class*="backdrop-blur"]').allTextContents();
  log('initial pill texts:', initialPill);

  const grips = page.locator('[data-grip]');
  const gripCount = await grips.count();
  log('grip handles:', gripCount);
  if (!gripCount) throw new Error('no grip handles — tree did not render');

  const targetGrip = grips.nth(Math.min(2, gripCount - 1));
  const box0 = await targetGrip.boundingBox();
  if (!box0) throw new Error('grip has no bbox');

  const beforeStyle = await targetGrip.evaluate(el => {
    const card = el.parentElement;
    return { left: card.style.left, top: card.style.top };
  });
  log('card style BEFORE drag:', beforeStyle);

  const cx = box0.x + box0.width / 2;
  const cy = box0.y + box0.height / 2;
  log('drag from', cx, cy, '→', cx + 220, cy + 130);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx + 22 * i, cy + 13 * i, { steps: 1 });
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  await shot(page, '07-after-drag');

  const afterDragStyle = await targetGrip.evaluate(el => {
    const card = el.parentElement;
    return { left: card.style.left, top: card.style.top };
  });
  log('card style AFTER drag:', afterDragStyle);

  // Wait for debounce + save
  log('waiting for save…');
  await page.waitForTimeout(2000);
  await shot(page, '08-after-save');
  const afterSavePill = await page.locator('.bg-white\\/90, [class*="backdrop-blur"]').allTextContents();
  log('pill after save:', afterSavePill);

  log('reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.click('button:has-text("By Project")').catch(() => {});
  await page.waitForTimeout(500);
  await page.click('button:has-text("Tree")').catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, '09-after-reload');

  const reloadPill = await page.locator('.bg-white\\/90, [class*="backdrop-blur"]').allTextContents();
  log('pill after reload:', reloadPill);

  const grips2 = page.locator('[data-grip]');
  const targetGrip2 = grips2.nth(Math.min(2, (await grips2.count()) - 1));
  const reloadedStyle = await targetGrip2.evaluate(el => {
    const card = el.parentElement;
    return { left: card.style.left, top: card.style.top };
  });
  log('card style AFTER reload:', reloadedStyle);

  const persisted =
    reloadedStyle.left === afterDragStyle.left &&
    reloadedStyle.top  === afterDragStyle.top;
  log('PERSISTED ACROSS RELOAD:', persisted);

  // Cleanup
  const resetBtn = page.locator('button:has-text("Reset saved layout")');
  if (await resetBtn.count()) {
    log('cleanup: click Reset saved layout');
    await resetBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, '10-after-reset');
  }

  console.log('\n=== LIVE VERDICT ===');
  console.log('  url            :', BASE);
  console.log('  before drag    :', beforeStyle);
  console.log('  after drag     :', afterDragStyle);
  console.log('  after reload   :', reloadedStyle);
  console.log('  persisted      :', persisted);
  console.log('  pill on reload :', reloadPill);
} catch (e) {
  console.error('VERIFY ERROR:', e.message);
  await shot(page, '99-error');
  process.exitCode = 1;
} finally {
  await browser.close();
}
