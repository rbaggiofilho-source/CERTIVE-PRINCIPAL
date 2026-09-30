// Base visual compartilhada dos criativos (PNG) da linha.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browser } from './pdf.mjs';
const PC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fontes = readFileSync(join(PC, '02-design/fonts/fonts.css'), 'utf8').replace(/url\((\S+?\.woff2)\)/g, (m, f) => `url(${pathToFileURL(join(PC, '02-design/fonts', f)).href})`);
const tema = readFileSync(join(PC, '02-design/tema.css'), 'utf8');
export const baseCss = `${fontes}${tema}
*{box-sizing:border-box;margin:0;padding:0} html,body{width:var(--w);height:var(--h);overflow:hidden}
body{font-family:var(--f-texto);color:#fff;background:radial-gradient(110% 70% at 75% 0%,#27354a 0%,#0F1318 55%,#07090c 100%);position:relative}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(242,169,0,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(242,169,0,.06) 1px,transparent 1px);background-size:54px 54px;mask-image:radial-gradient(80% 60% at 60% 40%,#000 30%,transparent 80%)}
.faixa{position:absolute;left:0;right:0;bottom:0;height:18px;background:repeating-linear-gradient(-45deg,#F2A900 0 22px,#0F1318 22px 44px)}
.k{font:700 22px var(--f-mono);letter-spacing:.28em;color:var(--ambar);text-transform:uppercase}
h1{font:900 var(--hs,78px)/1.0 var(--f-titulo);letter-spacing:-.01em}
h1 em{font-style:normal;color:var(--ambar)}
.sub{font:500 30px/1.35 var(--f-texto);color:#C9D1DA}
.cta{display:inline-flex;align-items:center;gap:14px;background:var(--ambar);color:#0F1318;font:900 28px var(--f-titulo);padding:22px 34px;border-radius:14px;letter-spacing:.01em}
.nv{display:inline-block;font:800 26px/1 var(--f-mono);padding:10px 14px;border-radius:10px;color:#fff;min-width:78px;text-align:center}
.N0{background:var(--n0)}.N1{background:var(--n1)}.N2{background:var(--n2);color:#1a1f26}.N3{background:var(--n3)}.N4{background:var(--n4)}
.aviso{font:500 17px var(--f-texto);color:#7A8591}
.phone{position:absolute;border-radius:54px;background:#050608;padding:14px;box-shadow:0 40px 80px rgba(0,0,0,.6),0 0 0 2px #2A3440}
.phone img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:42px;display:block}
.sheet{position:absolute;background:#fff;box-shadow:0 30px 60px rgba(0,0,0,.55);border-radius:6px;overflow:hidden}
.sheet img{width:100%;display:block}
.book{position:absolute;transform-style:preserve-3d}
.book .f{position:absolute;inset:0;border-radius:3px 8px 8px 3px;overflow:hidden;box-shadow:0 40px 70px rgba(0,0,0,.6)}
.book .f img{width:100%;height:100%;object-fit:cover}
.book .f::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.18),rgba(255,255,255,0) 8%,rgba(0,0,0,0) 90%,rgba(0,0,0,.25))}
.book .l{position:absolute;top:0;bottom:0;left:0;width:34px;transform:rotateY(-90deg);transform-origin:left;background:linear-gradient(90deg,#F2A900,#B87F00);}
`;
export function pagina(w, h, corpo, extra = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{--w:${w}px;--h:${h}px}${baseCss}${extra}</style></head><body>${corpo}</body></html>`;
}
export async function png(dirSaida, dirTmp, nome, w, h, html, transparente = false) {
  mkdirSync(dirTmp, { recursive: true }); const f = join(dirTmp, nome + '.html'); writeFileSync(f, html);
  const b = await browser(); const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' }); await p.evaluateHandle('document.fonts.ready');
  await p.screenshot({ path: join(dirSaida, nome + '.png'), omitBackground: transparente }); await p.close();
}
