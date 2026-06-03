// Verify multi-select + alignment + group drag in OrgTreeView (project tree).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'https://abc.wehive.co.uk';
const SHOTS = './verify-shots-ms-live';

async function shot(page, name) {
  await fs.mkdir(SHOTS, { recursive: true });
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log('shot:', p);
}
const log = (...a) => console.log('[ms]', ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', e.message));

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  await page.fill('input[placeholder*="username" i]', 'manish.gaikwad');
  await page.fill('input[type="password"]', 'hr@2026');
  await page.click('button:has-text("Sign in")');
  await page.waitForTimeout(3500);

  await page.goto(BASE + '/org-chart', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.click('button:has-text("By Project")');
  await page.waitForTimeout(700);
  await page.click('button:has-text("Tree")');
  await page.waitForTimeout(2500);
  await shot(page, '01-tree-ready');

  // Grab card surfaces — find the inner card div (the one with rounded-xl)
  const cards = page.locator('div.rounded-xl.bg-white.shadow-md');
  const n = await cards.count();
  log('cards:', n);
  if (n < 3) throw new Error('need at least 3 cards to test');

  // If a previous run left cards stacked at the same position, reset the
  // saved layout first so the cards spread out and we can click them
  // individually.
  const resetFirst = page.locator('button:has-text("Reset saved layout")');
  if (await resetFirst.count()) {
    log('clearing prior saved layout before selecting');
    await resetFirst.click();
    await page.waitForTimeout(1500);
  }

  // Shift+click cards 0, 1, 2 to select three. Use page.keyboard to hold
  // Shift across the clicks — guarantees the modifier is applied even with
  // force-click.
  await page.keyboard.down('Shift');
  for (let i = 0; i < 3; i++) {
    const c = cards.nth(i);
    await c.scrollIntoViewIfNeeded().catch(() => {});
    await c.click({ force: true });
    await page.waitForTimeout(120);
  }
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  await shot(page, '02-three-selected');

  // Toolbar should appear and report "3 selected"
  const toolbar = page.locator('text=/\\d+ selected/').first();
  const tbText = await toolbar.textContent().catch(() => '');
  log('toolbar:', tbText);

  // Capture positions of all selected cards before alignment
  const before = await cards.evaluateAll(els => els.slice(0, 3).map(el => {
    const card = el.parentElement; // outer absolute-positioned div
    return { left: card.style.left, top: card.style.top };
  }));
  log('before align:', before);

  // Click "Align top edges"
  await page.locator('button[title="Align top edges"]').click();
  await page.waitForTimeout(500);
  await shot(page, '03-after-align-top');

  const afterAlign = await cards.evaluateAll(els => els.slice(0, 3).map(el => {
    const card = el.parentElement;
    return { left: card.style.left, top: card.style.top };
  }));
  log('after align-top:', afterAlign);

  // Top alignment means same `top` value for all three
  const topsEqual = new Set(afterAlign.map(s => s.top)).size === 1;
  log('all tops equal:', topsEqual);

  // Click "Align horizontal centers" — centers should now share same `left`
  // (only true if cards have same width, which they do: NODE_W)
  await page.locator('button[title="Align horizontal centers"]').click();
  await page.waitForTimeout(500);
  await shot(page, '04-after-align-centerH');

  const afterCenter = await cards.evaluateAll(els => els.slice(0, 3).map(el => {
    const card = el.parentElement;
    return { left: card.style.left, top: card.style.top };
  }));
  log('after centerH:', afterCenter);
  const leftsEqual = new Set(afterCenter.map(s => s.left)).size === 1;
  log('all lefts equal:', leftsEqual);

  // Group drag: grip on a selected card → all three should shift together
  const grips = page.locator('[data-grip]');
  const gripCount = await grips.count();
  log('grips:', gripCount);
  // Find a grip whose parent has a selected ring — pick the first
  // Just use grip 1 (second one) — by now cards 0,1,2 are all selected and
  // overlapping due to center-align; pick the middle.
  const targetGrip = grips.nth(1);
  const box = await targetGrip.boundingBox();
  if (!box) throw new Error('grip lost bbox');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  log('group drag from', cx, cy);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(cx + 12 * i, cy + 8 * i, { steps: 1 });
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  await shot(page, '05-after-group-drag');

  const afterDrag = await cards.evaluateAll(els => els.slice(0, 3).map(el => {
    const card = el.parentElement;
    return { left: card.style.left, top: card.style.top };
  }));
  log('after group drag:', afterDrag);

  // Each card should have moved by the same delta from afterCenter
  const deltas = afterCenter.map((s, i) => ({
    dx: parseFloat(afterDrag[i].left) - parseFloat(s.left),
    dy: parseFloat(afterDrag[i].top) - parseFloat(s.top),
  }));
  log('per-card deltas:', deltas);
  const allSameDx = new Set(deltas.map(d => d.dx)).size === 1;
  const allSameDy = new Set(deltas.map(d => d.dy)).size === 1;
  log('group moved uniformly:', allSameDx && allSameDy);

  // Esc clears selection
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const toolbarGone = await page.locator('text=/\\d+ selected/').count();
  log('toolbar gone after Esc:', toolbarGone === 0);
  await shot(page, '06-after-esc');

  // Cleanup — reset saved layout to discard everything
  const resetBtn = page.locator('button:has-text("Reset saved layout")');
  if (await resetBtn.count()) {
    await resetBtn.click();
    await page.waitForTimeout(800);
  }

  console.log('\n=== MULTISELECT VERDICT ===');
  console.log('  cards:', n);
  console.log('  toolbar text:', tbText);
  console.log('  align-top → equal tops :', topsEqual);
  console.log('  centerH   → equal lefts:', leftsEqual);
  console.log('  group drag uniform     :', allSameDx && allSameDy);
  console.log('  Esc clears toolbar     :', toolbarGone === 0);
} catch (e) {
  console.error('VERIFY ERROR:', e.message);
  await shot(page, '99-error');
  process.exitCode = 1;
} finally {
  await browser.close();
}
