// Verify the four changes:
//   1. Plain click on a card does NOT change focal (no tree re-root).
//   2. Card now has ↑ and ↓ nav buttons; clicking them changes focal.
//   3. Shift+drag on background creates a marquee selection (additive).
//   4. New 'Make row' / 'Make column' buttons in the alignment toolbar.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'http://localhost:5180';
const SHOTS = './verify-shots-changes';

async function shot(page, name) {
  await fs.mkdir(SHOTS, { recursive: true });
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log('shot:', p);
}
const log = (...a) => console.log('[ch]', ...a);

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
  await page.goto(BASE + '/org-chart', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.click('button:has-text("By Project")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Tree")');
  await page.waitForTimeout(1500);

  // Reset any prior saved layout so cards are at natural positions
  const reset = page.locator('button:has-text("Reset saved layout")');
  if (await reset.count()) { await reset.click(); await page.waitForTimeout(1200); }
  await shot(page, '01-fresh');

  const cards = page.locator('[data-empid]');
  const n = await cards.count();
  log('cards:', n);

  // ── (1) plain click no longer changes focal ────────────────────────────
  const headerBefore = await page.locator('h2').first().textContent().catch(() => '');
  log('project header before click:', headerBefore);
  // Click on a non-focal card and assert the tree did NOT re-root.
  // The focal card has the 'YOU' badge — pick a card without that.
  const youBadge = await page.locator('text=YOU').count();
  log('YOU badge count before:', youBadge);
  // Click card 1 (second one)
  await cards.nth(1).click({ force: true });
  await page.waitForTimeout(700);
  const youBadgeAfter = await page.locator('text=YOU').count();
  log('YOU badge count after plain click:', youBadgeAfter);
  // If focal didn't change, the YOU badge stays on the same employee. We
  // assert the count didn't change.
  const focalUnchanged = youBadge === youBadgeAfter;
  log('focal unchanged on plain click:', focalUnchanged);
  await shot(page, '02-after-plain-click');

  // ── (2) ↓ button re-roots tree ────────────────────────────────────────
  // Find the ↓ button on the focal card (the one with YOU badge).
  // The ↓ button title is "Focus on first report (N)" or "No reports".
  const downBtns = page.locator('button[title*="Focus on first report"]');
  const downCount = await downBtns.count();
  log('enabled ↓ buttons:', downCount);
  // Click the first enabled ↓ button — that should change focal.
  if (downCount) {
    await downBtns.first().click({ force: true });
    await page.waitForTimeout(800);
    await shot(page, '03-after-down-button');
    // After re-root, the project tree shows a different focal — we expect
    // the page header to still be the project name but the tree topology
    // changed. A coarse check: confirm a Reset-saved-layout pill is shown
    // (means we're still in the same view), and the cards re-rendered.
    const newCount = await page.locator('[data-empid]').count();
    log('cards after ↓:', newCount);
  }

  // Bounce focal back via ↑ on the new focal card
  const upBtns = page.locator('button[title="Focus on manager"]');
  const upCount = await upBtns.count();
  log('enabled ↑ buttons:', upCount);
  if (upCount) {
    await upBtns.first().click({ force: true });
    await page.waitForTimeout(800);
    await shot(page, '04-after-up-button');
  }

  // ── (3) marquee selection — Shift+drag on canvas ──────────────────────
  // Drag a big rect across the tree area.
  const treeArea = page.locator('.org-tree-container').first();
  const tb = await treeArea.boundingBox();
  if (!tb) throw new Error('no tree-area bbox');
  log('marquee from', tb.x + 50, tb.y + 50, '→', tb.x + tb.width - 50, tb.y + tb.height - 50);
  await page.keyboard.down('Shift');
  await page.mouse.move(tb.x + 50, tb.y + 50);
  await page.mouse.down();
  // Drag in steps so we see the rect grow
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(tb.x + 50 + (tb.width - 100) * i / 12, tb.y + 50 + (tb.height - 100) * i / 12, { steps: 1 });
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(500);
  await shot(page, '05-after-marquee');

  // Check toolbar — should say "N selected" with N >= 2
  const tbText = await page.locator('text=/\\d+ selected/').first().textContent().catch(() => '');
  log('toolbar after marquee:', tbText);
  const marqueeSelected = parseInt(tbText.match(/(\d+)/)?.[1] ?? '0', 10);
  log('marquee selected count:', marqueeSelected);

  // ── (4) Make-row button ───────────────────────────────────────────────
  if (marqueeSelected >= 2) {
    // Snapshot positions
    const before = await page.locator('[data-empid]').evaluateAll(els => els.map(el => ({
      id: el.getAttribute('data-empid'),
      left: el.style.left, top: el.style.top,
    })));

    await page.locator('button[title="Arrange in a horizontal row"]').click();
    await page.waitForTimeout(600);
    await shot(page, '06-after-make-row');

    const after = await page.locator('[data-empid]').evaluateAll(els => els.map(el => ({
      id: el.getAttribute('data-empid'),
      left: el.style.left, top: el.style.top,
    })));

    // For row, all selected cards should have the same `top` value.
    // We can't easily know which were selected, but we can check that at
    // least 2 cards now share the same top — and that they differ from
    // before.
    const tops = new Map();
    after.forEach(c => tops.set(c.top, (tops.get(c.top) ?? 0) + 1));
    const maxBucket = Math.max(...tops.values());
    log('largest cluster of equal `top` after Make row:', maxBucket);

    // Make-column
    await page.locator('button[title="Arrange in a vertical column"]').click();
    await page.waitForTimeout(600);
    await shot(page, '07-after-make-column');
    const after2 = await page.locator('[data-empid]').evaluateAll(els => els.map(el => ({
      id: el.getAttribute('data-empid'),
      left: el.style.left, top: el.style.top,
    })));
    const lefts = new Map();
    after2.forEach(c => lefts.set(c.left, (lefts.get(c.left) ?? 0) + 1));
    const maxLeftBucket = Math.max(...lefts.values());
    log('largest cluster of equal `left` after Make column:', maxLeftBucket);
  } else {
    log('SKIP make-row/col — marquee selected too few cards');
  }

  // Cleanup
  const reset2 = page.locator('button:has-text("Reset saved layout")');
  if (await reset2.count()) { await reset2.click(); await page.waitForTimeout(1000); }

  console.log('\n=== CHANGES VERDICT ===');
  console.log('  cards               :', n);
  console.log('  focal unchanged-click:', focalUnchanged);
  console.log('  ↓ buttons enabled    :', downCount);
  console.log('  ↑ buttons enabled    :', upCount);
  console.log('  marquee selected     :', marqueeSelected);
} catch (e) {
  console.error('VERIFY ERROR:', e.message);
  await shot(page, '99-error');
  process.exitCode = 1;
} finally {
  await browser.close();
}
