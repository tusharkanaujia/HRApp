// Drives the persisted project org-chart layout feature end-to-end.
// Run: node verify-layout.mjs
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'http://localhost:5180';
const SHOTS = './verify-shots';

async function shot(page, name) {
  await fs.mkdir(SHOTS, { recursive: true });
  const p = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: p, fullPage: false });
  console.log('shot:', p);
  return p;
}

const log = (...a) => console.log('[verify]', ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('console', m => console.log('  [page]', m.type(), m.text()));
page.on('pageerror', e => console.log('  [pageerror]', e.message));

try {
  log('GET', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot(page, '01-loaded');

  // Login
  log('login as obaid.syed');
  await page.fill('input[name="username"], input[placeholder*="sername" i], input[type="text"]', 'manish.gaikwad').catch(()=>{});
  await page.fill('input[type="password"]', 'hr@2026').catch(()=>{});
  await shot(page, '02-login-filled');
  await page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await shot(page, '03-after-login');

  // Navigate to Org Chart
  log('navigate to Org Chart');
  // Try sidebar link
  const link = page.locator('a:has-text("Org Chart"), a:has-text("Organization")').first();
  if (await link.count()) await link.click();
  else await page.goto(BASE + '/org-chart');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);
  await shot(page, '04-org-chart');

  // Switch to By Project view
  log('switch to By Project');
  await page.click('button:has-text("By Project")');
  await page.waitForTimeout(500);
  await shot(page, '05-by-project');

  // Pick the project at the top of the list (most direct staff)
  log('pick first project in list');
  const projBtns = page.locator('aside, .w-72').first().locator('button').filter({ hasText: /./ });
  const count = await projBtns.count();
  log('  projects visible:', count);

  // Switch to Tree view
  log('switch right pane to Tree');
  await page.click('button:has-text("Tree")');
  await page.waitForTimeout(800);
  await shot(page, '06-tree-default');

  // Find a grip handle to drag
  const grips = page.locator('[data-grip]');
  const gripCount = await grips.count();
  log('  grip handles found:', gripCount);
  if (!gripCount) throw new Error('no grip handles — tree did not render');

  // Pick a non-focal grip (skip first which is often focal/root)
  const targetGrip = grips.nth(Math.min(2, gripCount - 1));
  const box0 = await targetGrip.boundingBox();
  log('  grip box before drag:', box0);
  if (!box0) throw new Error('grip has no bbox');

  // Record the parent card's position for a stable before/after compare.
  // The grip lives inside a positioned absolute div — its parent has the
  // left/top we want to observe.
  const cardSel = '[data-grip] >> xpath=..';
  const beforeStyle = await targetGrip.evaluate(el => {
    const card = el.parentElement;
    const r = card.getBoundingClientRect();
    return { left: card.style.left, top: card.style.top, rect: { x: r.x, y: r.y } };
  });
  log('  card style before:', beforeStyle);

  // Perform manual drag with raw mouse events — the tree uses custom mousedown/move/up handlers
  const cx = box0.x + box0.width / 2;
  const cy = box0.y + box0.height / 2;
  log('  drag from', cx, cy, '→', cx + 200, cy + 120);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // Many small moves to look like a real drag and let React update
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx + 20 * i, cy + 12 * i, { steps: 1 });
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  await shot(page, '07-after-drag');

  const afterStyle = await targetGrip.evaluate(el => {
    const card = el.parentElement;
    const r = card.getBoundingClientRect();
    return { left: card.style.left, top: card.style.top, rect: { x: r.x, y: r.y } };
  });
  log('  card style after:', afterStyle);

  // Wait long enough for debounce (500ms) + flash (250ms) + write
  log('  waiting for save…');
  await page.waitForTimeout(1500);
  await shot(page, '08-after-save');

  // Look for the 'Saved' indicator or 'Layout saved for this project'
  const savedPill = page.locator('text=/Saved|Layout saved/i').first();
  const sawSaved = await savedPill.count();
  log('  save pill present:', sawSaved);

  // Snapshot the moved card's left/top — these come from the inline style on
  // the card's parent div and reflect the persisted offset. We'll compare
  // them after reload.
  const cardLeftTopBefore = await targetGrip.evaluate(el => {
    const card = el.parentElement;
    return { left: card.style.left, top: card.style.top };
  });
  log('  card inline style after drag:', cardLeftTopBefore);

  // Now reload — should restore the layout
  log('reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  // Re-navigate to same view
  await page.click('button:has-text("By Project")').catch(() => {});
  await page.waitForTimeout(400);
  await page.click('button:has-text("Tree")').catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, '09-after-reload');

  const pillTexts = await page.locator('.bg-white\\/90, [class*="backdrop-blur"]').allTextContents();
  log('  pill texts on reload:', pillTexts);
  const hasSavedHint = pillTexts.some(t => /Layout saved/i.test(t));
  log('  "Layout saved" pill on reload:', hasSavedHint);

  // Re-locate the same grip (assuming render order is stable for the same
  // focal). Compare inline style.
  const grips2 = page.locator('[data-grip]');
  const gripCount2 = await grips2.count();
  log('  grips after reload:', gripCount2);
  const targetGrip2 = grips2.nth(Math.min(2, gripCount2 - 1));
  const cardLeftTopAfterReload = await targetGrip2.evaluate(el => {
    const card = el.parentElement;
    return { left: card.style.left, top: card.style.top };
  });
  log('  card inline style after reload:', cardLeftTopAfterReload);

  const persisted =
    cardLeftTopAfterReload.left === cardLeftTopBefore.left &&
    cardLeftTopAfterReload.top  === cardLeftTopBefore.top;
  log('  layout persisted across reload:', persisted);

  // Cleanup — click Reset saved layout if present
  const resetBtn = page.locator('button:has-text("Reset saved layout")');
  if (await resetBtn.count()) {
    log('cleanup: click Reset saved layout');
    await resetBtn.click();
    await page.waitForTimeout(800);
    await shot(page, '10-after-reset');
  } else {
    log('cleanup: no reset button found');
  }

  console.log('\nVERDICT: drag→save→reload→restore');
  console.log('  before drag:', beforeStyle.rect);
  console.log('  after drag :', afterStyle.rect);
  console.log('  inline left/top after drag :', cardLeftTopBefore);
  console.log('  inline left/top after reload:', cardLeftTopAfterReload);
  console.log('  layout persisted:', persisted);
  console.log('  "Layout saved" pill on reload:', hasSavedHint);
} catch (e) {
  console.error('VERIFY ERROR:', e.message);
  await shot(page, '99-error');
  process.exitCode = 1;
} finally {
  await browser.close();
}
