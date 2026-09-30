// Gera o mockup 3D do produto e os criativos PNG (1080x1080, 1080x1350, 1080x1920).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marca, carroLateral } from './lib/arte.mjs';
import { browser, close } from './lib/pdf.mjs';
import { pathToFileURL } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(RAIZ, '05-criativos/assets');
const OUT = join(RAIZ, '05-criativos'); const TMP = join(RAIZ, 'build/.tmp'); mkdirSync(TMP, { recursive: true });
const img = f => pathToFileURL(join(A, f)).href;
const fontes = readFileSync(join(RAIZ, '02-design/fonts/fonts.css'), 'utf8').replace(/url\((\S+?\.woff2)\)/g, (m, f) => `url(${pathToFileURL(join(RAIZ, '02-design/fonts', f)).href})`);
const tema = readFileSync(join(RAIZ, '02-design/tema.css'), 'utf8');

const baseCss = `${fontes}${tema}
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

function pagina(w, h, corpo, extra = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{--w:${w}px;--h:${h}px}${baseCss}${extra}</style></head><body>${corpo}</body></html>`;
}

async function png(nome, w, h, html, transparente = false) {
  const f = join(TMP, nome + '.html'); writeFileSync(f, html);
  const b = await browser(); const p = await b.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' }); await p.evaluateHandle('document.fonts.ready');
  await p.screenshot({ path: join(OUT, nome + '.png'), omitBackground: transparente });
  await p.close();
}

// ---------- Mockup 3D do kit ----------
function cenaKit(w, h, s = 1, fundo = true) {
  const x = v => v * s;
  return `${fundo ? '<div class="grid"></div>' : ''}
  <div style="position:absolute;inset:0;perspective:${x(2200)}px">
    <div class="book" style="left:${x(470)}px;top:${x(150)}px;width:${x(380)}px;height:${x(537)}px;transform:rotateY(24deg) rotateZ(-2deg) translateZ(-${x(160)}px)"><div class="f"><img src="${img('capa-checklists.png')}"></div><div class="l"></div></div>
    <div class="book" style="left:${x(360)}px;top:${x(190)}px;width:${x(380)}px;height:${x(537)}px;transform:rotateY(24deg) rotateZ(-1deg) translateZ(-${x(80)}px)"><div class="f"><img src="${img('capa-fichas.png')}"></div><div class="l"></div></div>
    <div class="book" style="left:${x(230)}px;top:${x(230)}px;width:${x(420)}px;height:${x(594)}px;transform:rotateY(24deg)"><div class="f"><img src="${img('capa-manual.png')}"></div><div class="l"></div></div>
  </div>
  <div class="sheet" style="left:${x(30)}px;top:${x(585)}px;width:${x(290)}px;transform:rotate(-8deg)"><img src="${img('ficha-est02.png')}"></div>
  <div class="sheet" style="left:${x(640)}px;top:${x(560)}px;width:${x(290)}px;transform:rotate(6deg)"><img src="${img('checklist-patio.png')}"></div>
  <div class="phone" style="left:${x(880)}px;top:${x(170)}px;width:${x(300)}px;height:${x(620)}px;transform:rotate(4deg)"><img src="${img('03-roteiro.png')}"></div>`;
}

const kit = pagina(1400, 1000, cenaKit(1400, 1000, 1));
await png('mockup-kit-3d', 1400, 1000, kit);
await png('mockup-kit-3d-transparente', 1400, 1000, pagina(1400, 1000, cenaKit(1400, 1000, 1, false), 'body{background:transparent}'), true);

// ---------- Criativos ----------
const FORMATOS = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1080x1920': [1080, 1920] };
const logo = `<div style="transform-origin:left top">${marca({ tamanho: 1.15 })}</div>`;

function C1(w, h) { // Dois vistoriadores, dois laudos
  const st = h > 1400; const top = st ? 260 : 80;
  return `<div class="grid"></div>
  <div style="position:absolute;left:80px;right:80px;top:${top}px">${logo}
    <h1 style="--hs:${st ? 92 : 76}px;margin-top:${st ? 70 : 44}px">Dois vistoriadores.<br>O mesmo carro.<br><em>Dois laudos diferentes.</em></h1></div>
  <div style="position:absolute;left:80px;right:80px;top:${st ? 900 : h > 1100 ? 600 : 520}px;display:grid;grid-template-columns:1fr 1fr;gap:26px">
    ${[['VISTORIADOR A', 'APROVADO', 'var(--n0)', '"Tem uns detalhes de pintura."'], ['VISTORIADOR B', 'REPROVADO', 'var(--n4)', '"Emenda no assoalho do porta-malas."']].map(([a, b, c, d]) => `
    <div style="background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.12);border-radius:22px;padding:30px">
      <div class="k" style="font-size:18px;color:#9aa3ae">${a}</div>
      <div style="margin-top:18px;background:${c};border-radius:12px;padding:16px;font:900 34px var(--f-titulo);text-align:center">${b}</div>
      <div style="margin-top:18px;font:500 24px/1.35 var(--f-texto);color:#C9D1DA;font-style:italic">${d}</div></div>`).join('')}
  </div>
  <div style="position:absolute;left:80px;right:80px;bottom:${st ? 380 : h > 1100 ? 120 : 90}px">
    <div class="sub" style="font-size:${st ? 38 : 32}px;color:#fff;font-weight:700">O que muda é o <span style="color:var(--ambar)">critério</span>.</div>
    <div class="sub" style="margin-top:10px;font-size:${st ? 30 : 26}px">Escala N0–N4, matriz de classificação e laudo que se sustenta.</div>
    <div style="margin-top:${st ? 40 : 28}px"><span class="cta">Conheça o Protocolo Cautelar →</span></div>
  </div><div class="faixa"></div>`;
}

function C2(w, h) { // Matriz
  const st = h > 1400; const top = st ? 260 : 80;
  const linhas = [['Para-choque repintado', 'N2'], ['Painel frontal substituído', 'N3'], ['Luz do airbag não acende', 'N3'], ['Emenda no corpo da longarina', 'N4'], ['Lodo seco sob o carpete', 'N4']];
  return `<div class="grid"></div>
  <div style="position:absolute;left:80px;right:80px;top:${top}px">${logo}
    <h1 style="--hs:${st ? 84 : 70}px;margin-top:${st ? 70 : 40}px">Cada achado tem um nível.<br><em>Cada laudo, uma regra.</em></h1></div>
  <div style="position:absolute;left:80px;right:80px;top:${st ? 760 : h > 1100 ? 470 : 390}px;background:rgba(255,255,255,.04);border:2px solid rgba(255,255,255,.1);border-radius:24px;padding:${st ? 34 : 22}px 34px">
    ${linhas.map(([t, n]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:${st ? 22 : h > 1100 ? 18 : 12}px 0;border-bottom:1px solid rgba(255,255,255,.08)"><span style="font:600 ${st ? 32 : 28}px var(--f-texto)">${t}</span><span class="nv ${n}">${n}</span></div>`).join('')}
    <div style="padding-top:18px;font:600 ${st ? 24 : 21}px var(--f-texto);color:#9aa3ae">Algum N4 → <b style="color:#fff">REPROVADO</b> · N2/N3 → <b style="color:#fff">COM APONTAMENTOS</b></div>
  </div>
  <div style="position:absolute;left:80px;right:80px;bottom:${st ? 380 : h > 1100 ? 110 : 70}px;display:flex;justify-content:space-between;align-items:center;gap:20px">
    <div class="sub" style="font-size:${st ? 30 : 25}px;max-width:560px">O critério escrito, do pátio ao laudo.</div><span class="cta" style="font-size:${st ? 28 : 24}px">Ver o Protocolo →</span></div><div class="faixa"></div>`;
}

function C3(w, h) { // Produto
  const st = h > 1400; const s = st ? .78 : h > 1100 ? .7 : .5;
  return `<div class="grid"></div>
  <div style="position:absolute;left:80px;right:80px;top:${st ? 250 : 70}px">${logo}
    <h1 style="--hs:${st ? 80 : 64}px;margin-top:${st ? 50 : 30}px">O sistema completo do <em>vistoriador cautelar.</em></h1></div>
  <div style="position:absolute;left:${st ? -10 : h > 1100 ? 20 : 150}px;top:${st ? 560 : h > 1100 ? 360 : 250}px;width:${1400 * s}px;height:${1000 * s}px">${cenaKit(1400, 1000, s, false)}</div>
  <div style="position:absolute;left:80px;right:80px;bottom:${st ? 360 : h > 1100 ? 90 : 60}px">
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:26px">${['Manual 66 p.', '60 fichas', '15 testes', 'Checklists', 'App offline', 'Planilhas'].map(t => `<span style="font:700 ${st ? 24 : 21}px var(--f-texto);border:2px solid rgba(242,169,0,.6);color:#fff;border-radius:40px;padding:8px 18px">${t}</span>`).join('')}</div>
    <span class="cta">Quero o Protocolo →</span></div><div class="faixa"></div>`;
}

function C4(w, h) { // App
  const st = h > 1400;
  const ph = st ? { w: 330, h: 690, t: 760 } : h > 1100 ? { w: 290, h: 600, t: 520 } : { w: 220, h: 460, t: 440 };
  return `<div class="grid"></div>
  <div style="position:absolute;left:80px;right:80px;top:${st ? 250 : 70}px">${logo}
    <h1 style="--hs:${st ? 86 : 70}px;margin-top:${st ? 50 : 34}px">Do pátio ao laudo.<br><em>No seu celular.</em></h1>
    <div class="sub" style="margin-top:22px;font-size:${st ? 32 : 27}px">Offline, com a sua logo, classificação automática e PDF pronto para enviar.</div></div>
  <div class="phone" style="left:${w / 2 - ph.w - 20}px;top:${ph.t}px;width:${ph.w}px;height:${ph.h}px;transform:rotate(-4deg)"><img src="${img('03-roteiro.png')}"></div>
  <div class="phone" style="left:${w / 2 + 20}px;top:${ph.t + 40}px;width:${ph.w}px;height:${ph.h}px;transform:rotate(4deg)"><img src="${img('05-resumo.png')}"></div>
  <div class="faixa"></div>`;
}

for (const [nome, fn] of Object.entries({ 'C1-dois-laudos': C1, 'C2-matriz': C2, 'C3-produto': C3, 'C4-app': C4 })) {
  for (const [f, [w, h]] of Object.entries(FORMATOS)) await png(`${nome}_${f}`, w, h, pagina(w, h, fn(w, h)));
}
await close();
console.log('ok');
