// Gera o material complementar (order bump): Test Drive Técnico + Checklist de Moto.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdParaHtml } from '../../protocolo-cautelar/build/lib/md.mjs';
import { marca } from '../../protocolo-cautelar/build/lib/arte.mjs';
import { htmlToPdf, close } from '../../protocolo-cautelar/build/lib/pdf.mjs';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..'); const PC = join(RAIZ, '../protocolo-cautelar');
const TMP = join(RAIZ, 'build/.tmp'); mkdirSync(TMP, { recursive: true });
const css = ['02-design/fonts/fonts.css', '02-design/tema.css', '02-design/manual.css'].map(p => readFileSync(join(PC, p), 'utf8')
  .replace(/url\((\S+?\.woff2)\)/g, (m, f) => `url(${join(PC, '02-design/fonts', f)})`)).join('\n')
  .replace('"PROTOCOLO CAUTELAR  ·  Manual do Vistoriador"', '"ANTES DE FECHAR NEGÓCIO  ·  Test Drive Técnico"')
  + `\nh1.sem-numero{border-top:0;padding-top:0;break-before:avoid}\n.quebra{break-before:page}\n.topo-b{display:flex;justify-content:space-between;align-items:center;background:#0F1318;border-radius:8px;padding:5mm 6mm;margin-bottom:6mm;border-bottom:4px solid #F2A900}\n.topo-b span{font:700 8pt var(--f-mono);letter-spacing:.2em;color:#F2A900}\ntable{font-size:8pt}`;
const corpo = mdParaHtml(readFileSync(join(RAIZ, '01-conteudo/bump-test-drive.md'), 'utf8'));
const topo = `<div class="topo-b">${marca({ tamanho: .8 })}<span>MATERIAL COMPLEMENTAR</span></div>`;
writeFileSync(join(TMP, 'bump.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Test Drive Técnico e Checklist de Moto</title><style>${css}</style></head><body>${topo}${corpo.replace('<h1 id="moto"', '<div class="quebra"></div>' + topo + '<h1 id="moto"')}</body></html>`);
const out = join(RAIZ, 'FINAL/Test-Drive-Tecnico-e-Checklist-de-Moto.pdf');
await htmlToPdf(join(TMP, 'bump.html'), out); await close(); console.log(out);
