// Renderização HTML -> PDF (A4) com o Chromium do ambiente.
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const puppeteer = require('/home/user/CERTIVE-PRINCIPAL/node_modules/puppeteer');

export function chromePath() {
  const base = '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter(d => d.startsWith('chromium-')).sort().reverse()) {
      const p = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  }
  return undefined; // puppeteer padrão
}

let _browser;
export async function browser() {
  if (!_browser) _browser = await puppeteer.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--font-render-hinting=none', '--allow-file-access-from-files'] });
  return _browser;
}
export async function close() { if (_browser) await _browser.close(); _browser = null; }

export async function htmlToPdf(htmlPath, pdfPath, { width, height } = {}) {
  const b = await browser();
  const page = await b.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  const o = { path: pdfPath, printBackground: true, preferCSSPageSize: true };
  if (width) { o.width = width; o.height = height; }
  await page.pdf(o);
  await page.close();
}

export async function htmlToPng(htmlPath, pngPath, w, h) {
  const b = await browser();
  const page = await b.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');
  await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
}
