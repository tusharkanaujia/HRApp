// Verify html2canvas renders the connector SVG that sits at z-index:-1 behind
// the cards (the way CorporateOrgChart draws connectors). Renders a minimal
// reproduction, runs html2canvas, and samples pixels where a connector line is.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const h2cPath = path.join(__dirname, '..', 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin:0; padding:0; }
  .page { position: relative; z-index: 0; background:#f4f6fa; width:600px; height:320px; overflow:hidden; }
  .corp-edges { position:absolute; inset:0; width:100%; height:100%; z-index:-1; pointer-events:none; overflow:visible; }
  .row { display:flex; justify-content:space-between; padding:24px 60px; }
  .card { width:120px; height:48px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; }
  .hidden-orig { width:200px; height:2px; background:#e07030; visibility:hidden; }
</style></head><body>
  <div class="page" id="page">
    <svg class="corp-edges" width="600" height="320" viewBox="0 0 600 320">
      <path data-edge="t" d="M 120 72 L 120 200 L 480 200 L 480 248" stroke="#64748b" stroke-width="2.5" fill="none"/>
      <path data-edge="s" d="M 240 96 L 360 96" stroke="#b080d0" stroke-width="2.5" stroke-dasharray="4 3" fill="none"/>
    </svg>
    <div class="row"><div class="card"></div><div class="card"></div></div>
    <div class="hidden-orig"></div>
    <div class="row"><div class="card"></div><div class="card"></div></div>
  </div>
</body></html>`;

const SAMPLES = [
  { name: 'normal elbow (mid)', x: 300, y: 200, want: [100, 116, 139] }, // #64748b
  { name: 'side dashed',        x: 300, y: 96,  want: [176, 128, 208] }, // #b080d0
];

function near(a, b, tol = 60) { return Math.abs(a[0]-b[0])<tol && Math.abs(a[1]-b[1])<tol && Math.abs(a[2]-b[2])<tol; }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 420 } });
await page.setContent(html, { waitUntil: 'load' });
await page.addScriptTag({ path: h2cPath });

const dataUrl = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const canvas = await html2canvas(document.getElementById('page'), { backgroundColor: '#f4f6fa', scale: 1, logging: false });
  return canvas.toDataURL('image/png');
});

// Decode the produced PNG in a fresh canvas and read pixels.
const result = await page.evaluate(async ({ dataUrl, samples }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  // Scan a small window around each sample point for the wanted color.
  return samples.map(s => {
    let best = null;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
      const p = ctx.getImageData(s.x + dx, s.y + dy, 1, 1).data;
      if (!best) best = [p[0], p[1], p[2]];
    }
    // also collect the closest match in window
    let found = false; let sample = best;
    for (let dx = -4; dx <= 4 && !found; dx++) for (let dy = -4; dy <= 4 && !found; dy++) {
      const p = ctx.getImageData(s.x + dx, s.y + dy, 1, 1).data;
      sample = [p[0], p[1], p[2]];
      const w = s.want;
      if (Math.abs(p[0]-w[0])<60 && Math.abs(p[1]-w[1])<60 && Math.abs(p[2]-w[2])<60) found = true;
    }
    return { name: s.name, found, sample };
  });
}, { dataUrl, samples: SAMPLES });

await browser.close();

let ok = true;
for (const r of result) {
  console.log(`${r.found ? 'PASS' : 'FAIL'}  ${r.name.padEnd(20)} sample rgb(${r.sample.join(',')})`);
  if (!r.found) ok = false;
}
console.log(ok ? '\n✅ Connectors render in the html2canvas export.' : '\n❌ Connectors MISSING in the export.');
process.exit(ok ? 0 : 1);
