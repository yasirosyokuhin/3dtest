#!/usr/bin/env node
// Headless preview renders of output/anime_head.glb via the WebGL viewer.
// Usage: node scripts/render.js [outDir]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'output', 'previews'));
const TYPES = { '.html': 'text/html', '.glb': 'model/gltf-binary', '.js': 'text/javascript', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  page.on('console', (m) => console.log('[page]', m.text()));
  await page.goto(`http://localhost:${port}/viewer/index.html?src=/output/anime_head.glb`);
  await page.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 120000 });
  await page.evaluate(() => { document.querySelector('.ui').style.display = 'none'; });
  const shots = { front: [0, 0.05, 0], three: [0.65, 0.12, 0], side: [Math.PI / 2, 0.05, 0], back: [Math.PI, 0.15, 0], wire: [0.5, 0.12, 2], wirefront: [0, 0.05, 2], low: [0.3, -0.35, 0], top: [0.2, 0.7, 0] };
  const only = process.env.VIEWS ? process.env.VIEWS.split(',') : Object.keys(shots);
  for (const name of only) {
    const [y, p, m] = shots[name];
    await page.evaluate(([y, p, m]) => window.__setView(y, p, m), [y, p, m]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('saved', name);
  }
  // Contact sheet of all views.
  const imgs = only.map((n) => `<img src="data:image/png;base64,${fs.readFileSync(path.join(OUT, `${n}.png`)).toString('base64')}">`).join('');
  await page.setViewportSize({ width: 450 * only.length, height: 500 });
  await page.setContent(`<body style="margin:0;display:flex">${imgs.replace(/<img /g, '<img style="width:450px;height:500px" ')}</body>`);
  await page.screenshot({ path: path.join(OUT, 'sheet.png') });
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
