// Verify the Appearance page: division override roundtrips, persists,
// and the org chart picks up the new color.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'http://localhost:5180';
const SHOTS = './verify-shots-appearance';

async function shot(page, name) {
  await fs.mkdir(SHOTS, { recursive: true });
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log('shot:', p);
}
const log = (...a) => console.log('[ap]', ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', e.message));

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.fill('input[placeholder*="username" i]', 'manish.gaikwad');
  await page.fill('input[type="password"]', 'hr@2026');
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(2500);

  // Navigate to Appearance via direct URL
  await page.goto(BASE + '/appearance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shot(page, '01-appearance');

  // The page should show three sections
  const heads = await page.locator('h2').allTextContents();
  log('section headings:', heads);

  // Find the CIVIL row's color input and change to red.
  // The label and the color input are siblings in a ColorRow.
  const civilRow = page.locator('div', { has: page.locator('p:text-is("CIVIL")') }).first();
  const civilColorInput = civilRow.locator('input[type="color"]').first();
  log('civil row found:', await civilColorInput.count());

  // Read current color
  const before = await civilColorInput.inputValue();
  log('CIVIL color before:', before);

  // Set to a distinctive red — fill() on color inputs works in Playwright.
  await civilColorInput.fill('#ff0000');
  await page.waitForTimeout(1500); // give it time to dispatch and write
  await shot(page, '02-civil-red');

  const after = await civilColorInput.inputValue();
  log('CIVIL color after fill:', after);

  // Reset button should now be enabled (was disabled before). Try to find a
  // reset button in the CIVIL row.
  const civilReset = civilRow.locator('button[title="Reset to default"]');
  const resetCount = await civilReset.count();
  log('CIVIL reset visible:', resetCount);

  // Navigate to org chart to confirm color changed there too
  await page.goto(BASE + '/org-chart', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shot(page, '03-org-chart-with-red');

  // Look at the rendered DIV color via an emp with CIVIL division
  const civilBadges = await page.locator('span:text-is("CIVIL")').evaluateAll(els =>
    els.map(el => window.getComputedStyle(el).backgroundColor).slice(0, 3),
  );
  log('CIVIL badge bg colors:', civilBadges);
  const isRed = civilBadges.some(c => c.includes('rgb(255, 0, 0)'));
  log('CIVIL is red on the org chart:', isRed);

  // Go back and reset
  await page.goto(BASE + '/appearance', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const civilRow2 = page.locator('div', { has: page.locator('p:text-is("CIVIL")') }).first();
  const reset2 = civilRow2.locator('button[title="Reset to default"]');
  if (await reset2.count()) {
    await reset2.click();
    await page.waitForTimeout(1200);
    const colorAfterReset = await civilRow2.locator('input[type="color"]').first().inputValue();
    log('CIVIL after reset:', colorAfterReset);
  }
  await shot(page, '04-after-reset');

  console.log('\n=== APPEARANCE VERDICT ===');
  console.log('  sections          :', heads);
  console.log('  CIVIL before/after:', before, '/', after);
  console.log('  CIVIL red on chart:', isRed);
} catch (e) {
  console.error('VERIFY ERROR:', e.message);
  await shot(page, '99-error');
  process.exitCode = 1;
} finally {
  await browser.close();
}
