#!/usr/bin/env node
// Teste ponta a ponta do Painel de Vistoria (puppeteer + Chromium local).
// Uso: node ebooks/protocolo-cautelar/build/test-app.mjs
// Gera: 03-materiais/app/screens/*.png e 03-materiais/app/laudo-exemplo.pdf
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(RAIZ, '..', '..');
const require = createRequire(join(REPO, 'package.json'));
const puppeteer = require('puppeteer');

const APP = join(RAIZ, '03-materiais/app/painel-vistoria.html');
const SHOTS = join(RAIZ, '03-materiais/app/screens');
const PDF = join(RAIZ, '03-materiais/app/laudo-exemplo.pdf');
const TMP = join(tmpdir(), 'pv-test-' + process.pid);
mkdirSync(SHOTS, { recursive: true }); mkdirSync(TMP, { recursive: true });

function acharChromium() {
  const base = '/opt/pw-browsers';
  if (existsSync(base)) for (const d of readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const p = join(base, d, 'chrome-linux/chrome'); if (existsSync(p)) return p;
  }
  return undefined; // puppeteer usa o próprio, se houver
}

let falhas = 0, oks = 0;
function check(cond, msg) { if (cond) { oks++; console.log('  ✓ ' + msg); } else { falhas++; console.log('  ✗ ' + msg); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: acharChromium(), headless: true,
  args: ['--no-sandbox', '--allow-file-access-from-files', '--disable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('dialog', d => d.accept());
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
const rede = [];
page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) rede.push(u); });

const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: TMP }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: TMP }));

const shot = async (nome, full = false) => { await page.evaluate(() => document.getElementById('toast').classList.remove('show')); await sleep(260); await page.screenshot({ path: join(SHOTS, nome), fullPage: full }); };
const clickSel = async (sel) => { await page.waitForSelector(sel, { visible: true }); await page.$eval(sel, el => el.scrollIntoView({ block: 'center' })); await page.click(sel); await sleep(60); };
const tab = async (v) => { await page.click(`.tab[data-view="${v}"]`); await sleep(120); };
const typeIn = async (sel, txt) => { await page.$eval(sel, el => el.scrollIntoView({ block: 'center' })); await page.click(sel, { clickCount: 3 }); await page.type(sel, String(txt)); };
const cls = () => page.evaluate(() => window.__painel.classificar(window.__painel.S.cur).id);
const nivel = async (item, v) => {
  await page.evaluate(id => { const g = roteiro(window.__painel.S.cur.tipo).find(x => x.itens.some(i => i.id === id)); window.__painel.S.sys = g.id; }, item);
  await tab('roteiro');
  await clickSel(`#it-${item} .lvb[data-v="${v}"]`);
};
async function imagemTeste(nome, cor, texto, w = 1600, h = 1200) {
  const data = await page.evaluate((cor, texto, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, cor); g.addColorStop(1, '#0F1318'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 8; for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(w / 2, h / 2, 60 + i * 60, 0, 6.28); x.stroke(); }
    x.fillStyle = '#fff'; x.font = 'bold 120px sans-serif'; x.textAlign = 'center'; x.fillText(texto, w / 2, h / 2 + 40);
    return c.toDataURL('image/jpeg', 0.9);
  }, cor, texto, w, h);
  const p = join(TMP, nome); writeFileSync(p, Buffer.from(data.split(',')[1], 'base64')); return p;
}
async function logoTeste() {
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 300; const x = c.getContext('2d');
    x.fillStyle = '#0F1318'; x.beginPath(); x.roundRect(10, 40, 220, 220, 40); x.fill();
    x.strokeStyle = '#F2A900'; x.lineWidth = 26; x.lineCap = 'round'; x.beginPath(); x.moveTo(60, 155); x.lineTo(110, 205); x.lineTo(185, 100); x.stroke();
    x.fillStyle = '#0F1318'; x.font = 'bold 86px sans-serif'; x.fillText('VISTORIA', 260, 150); x.fillStyle = '#B87F00'; x.font = 'bold 60px sans-serif'; x.fillText('EXEMPLO', 262, 230);
    return c.toDataURL('image/png');
  });
  const p = join(TMP, 'logo.png'); writeFileSync(p, Buffer.from(data.split(',')[1], 'base64')); return p;
}
async function anexarFoto(item, arquivo) {
  await page.evaluate(id => { const g = roteiro(window.__painel.S.cur.tipo).find(x => x.itens.some(i => i.id === id)); window.__painel.S.sys = g.id; }, item);
  await tab('roteiro');
  const sel = `#it-${item} [data-action="foto"][data-src="galeria"]`;
  await page.$eval(sel, el => el.scrollIntoView({ block: 'center' }));
  const [fc] = await Promise.all([page.waitForFileChooser(), page.click(sel)]);
  await fc.accept([arquivo]);
  await page.waitForFunction(id => document.querySelectorAll(`#it-${id} .thumb`).length > 0, {}, item);
}

console.log('Painel de Vistoria — teste\n');
await page.goto(pathToFileURL(APP).href, { waitUntil: 'load' });
await page.waitForFunction(() => window.__painel && window.__painel.S.cfg);

/* 1. Configuração */
console.log('1. Configuração');
check(await page.$eval('#view-config', el => !el.hidden), 'primeira abertura mostra a configuração');
check((await page.$eval('[data-cfg="limites"]', el => el.value)).includes('não destrutivo'), 'texto de limites pré-preenchido');
check(await page.$eval('#view-config', el => /LGPD/.test(el.textContent)), 'aviso LGPD presente');
await typeIn('[data-cfg="nome"]', 'Vistorias Exemplo Ltda.');
await typeIn('[data-cfg="doc"]', 'CNPJ 00.000.000/0001-00');
await typeIn('[data-cfg="contato"]', '(11) 90000-0000 · São Paulo/SP');
{
  const logo = await logoTeste();
  const [fc] = await Promise.all([page.waitForFileChooser(), page.click('[data-action="logo"]')]);
  await fc.accept([logo]);
  await page.waitForSelector('.logo-prev img');
  const tamLogo = await page.evaluate(() => window.__painel.S.cfg.logo.length);
  check(tamLogo > 1000 && tamLogo < 200000, `logo redimensionado e guardado (${Math.round(tamLogo / 1024)} KB)`);
}
await page.evaluate(() => window.scrollTo(0, 0));
await shot('01-configuracao.png');
await clickSel('[data-action="cfg-ok"]');
check(await page.$eval('#view-lista', el => !el.hidden), 'após salvar, vai para a lista');

/* 2. Nova vistoria */
console.log('2. Nova vistoria');
await clickSel('[data-action="nova"]');
check(await page.$eval('#view-vistoria', el => !el.hidden), 'nova vistoria abre a aba Vistoria');
const numero = await page.evaluate(() => window.__painel.S.cur.numero);
check(/^\d{4}-0001$/.test(numero), `número sequencial do laudo (${numero})`);
check(await page.$eval('[data-bind="dataHora"]', el => !!el.value), 'data/hora preenchida automaticamente');
await typeIn('[data-bind="veiculo.placa"]', 'abc1d23');
await typeIn('[data-bind="veiculo.marcaModelo"]', 'Hatch Exemplo 1.0 Flex');
await typeIn('[data-bind="veiculo.anoFab"]', '2019');
await typeIn('[data-bind="veiculo.anoMod"]', '2020');
await typeIn('[data-bind="veiculo.cor"]', 'Prata');
await typeIn('[data-bind="veiculo.km"]', '68450');
await page.select('[data-bind="veiculo.combustivel"]', 'Flex');
await typeIn('[data-bind="veiculo.chassi"]', '9XX0XX000XX000000');
await typeIn('[data-bind="veiculo.renavam"]', '00000000000');
await typeIn('[data-bind="solicitante"]', 'Cliente Exemplo');
await typeIn('[data-bind="local"]', 'Pátio de exemplo — São Paulo/SP');
check(await page.evaluate(() => window.__painel.S.cur.veiculo.placa) === 'ABC1D23', 'placa convertida para maiúsculas');
await page.evaluate(() => window.scrollTo(0, 0));
await shot('02-vistoria.png');

/* Tipos: moto e utilitário */
console.log('3. Tipos de veículo');
await clickSel('[data-action="tipo"][data-tipo="moto"]');
{
  const g = await page.evaluate(() => roteiro('moto').map(x => x.id));
  check(g.join(',') === 'DOC,IDV,MOTO,CMP', `moto usa DOC, IDV, MOTO + complementares (${g.join(',')})`);
  check(await page.evaluate(() => !itensDo('moto').some(i => i.id === 'IDV-04')), 'moto sem item de gravação nos vidros');
  await tab('roteiro');
  await clickSel('.sys-chip[data-sys="MOTO"]');
  check(!!(await page.$('#it-MOTO-01 .lvb[data-v="NV"]')), 'MOTO-01 oferece "Não verificável"');
  check(!(await page.$('#it-MOTO-03 .lvb[data-v="NV"]')), 'MOTO-03 não oferece "Não verificável"');
  await tab('pintura');
  check(await page.$eval('#view-pintura', el => /carros e utilitários/.test(el.textContent)), 'pintura em moto mostra orientação');
}
await tab('vistoria');
await clickSel('[data-action="tipo"][data-tipo="utl"]');
check(await page.evaluate(() => roteiro('utl').some(g => g.id === 'UTL') && !roteiro('utl').some(g => g.id === 'MOTO')), 'utilitário inclui anexo UTL');
await clickSel('[data-action="tipo"][data-tipo="carro"]');
check(await page.evaluate(() => roteiro('carro').length === 10), 'carro: 10 sistemas');

/* 4. Roteiro e bloqueio */
console.log('4. Roteiro, bloqueio e matriz');
await tab('roteiro');
await clickSel('.sys-chip[data-sys="DOC"]');
await clickSel('#it-DOC-01 .lvb[data-v="N0"]');
check(await page.$eval('#it-DOC-01 .lvb[data-v="N0"]', el => el.getAttribute('aria-checked') === 'true'), 'clique marca o nível (aria-checked)');
check(await page.$eval('.sys-chip[data-sys="DOC"] small', el => el.textContent === '1/10'), 'progresso do sistema atualiza (1/10)');
check(!(await page.$('#it-DOC-01 .lvb[data-v="NV"]')), 'DOC-01 não oferece "Não verificável"');
await tab('laudo');
check(await page.$eval('#view-laudo', el => !!el.querySelector('[role="alert"]') && /sem resposta/.test(el.textContent)), 'laudo bloqueado com itens pendentes (lista o que falta)');
await tab('resumo');
check(await page.$eval('#view-resumo', el => /Faltam \d+ item/.test(el.textContent)), 'resumo lista itens pendentes');

// Marca DOC-05 como N/A e o resto como N0 (botão "Restantes = N0" em cada sistema)
await nivel('DOC-05', 'NA');
for (const s of ['DOC', 'IDV', 'EST', 'CAR', 'VID', 'RSP', 'MOT', 'TRF', 'ELE', 'INT']) {
  await page.evaluate(s => { window.__painel.S.sys = s; }, s);
  await tab('roteiro');
  const b = await page.$(`[data-action="restante-n0"][data-sys="${s}"]`);
  if (b) { await b.click(); await sleep(80); }
}
check(await page.evaluate(() => window.__painel.pendentes(window.__painel.S.cur).length === 0), 'todos os itens respondidos');
check(await cls() === 'APROVADO', 'matriz: só N0/N1 → APROVADO');
await nivel('RSP-01', 'N1');
check(await cls() === 'APROVADO', 'matriz: N1 mantém APROVADO');
await nivel('CAR-03', 'N2');
check(await cls() === 'APROVADO COM APONTAMENTOS', 'matriz: N2 → APROVADO COM APONTAMENTOS');
await nivel('EST-02', 'N3');
check(await cls() === 'APROVADO COM APONTAMENTOS', 'matriz: N3 → APROVADO COM APONTAMENTOS');
await nivel('EST-01', 'N4');
check(await cls() === 'REPROVADO', 'matriz: N4 → REPROVADO');
await nivel('IDV-02', 'NV');
check(await cls() === 'INCONCLUSIVO', 'matriz: IDV não verificável → INCONCLUSIVO (prevalece sobre N4)');
await tab('resumo');
check(await page.$eval('#cls-val', el => el.textContent) === 'INCONCLUSIVO', 'resumo exibe INCONCLUSIVO');
await nivel('IDV-02', 'NV'); // clicar de novo desmarca
check(await page.evaluate(() => window.__painel.pendentes(window.__painel.S.cur).map(i => i.id).join()) === 'IDV-02', 'clicar no nível marcado desmarca (volta a pendente)');
await nivel('IDV-02', 'N0');
check(await cls() === 'REPROVADO', 'sem NV volta a REPROVADO');
await nivel('EST-01', 'N0');
check(await cls() === 'APROVADO COM APONTAMENTOS', 'sem N4 volta a APROVADO COM APONTAMENTOS');

// Observações (dados fictícios) — N2/N3 abrem o campo automaticamente
const irPara = async (item) => { await page.evaluate(id => { const g = roteiro(window.__painel.S.cur.tipo).find(x => x.itens.some(i => i.id === id)); window.__painel.S.sys = g.id; }, item); await tab('roteiro'); };
await irPara('EST-02');
await typeIn('#obs-EST-02', 'Constatada substituição do painel frontal: fixação por parafusos em local de solda ponto de fábrica e selador aplicado manualmente.');
await irPara('CAR-03');
await typeIn('#obs-CAR-03', 'Espessura acima da referência na porta dianteira esquerda e no paralama dianteiro direito (ver mapa de pintura). Indício de repintura.');
await irPara('RSP-01');
await clickSel('#it-RSP-01 [data-action="obs"]');
await typeIn('#obs-RSP-01', 'Sulco entre 3 e 4 mm nos quatro pneus; acima do TWI.');
check(await page.evaluate(() => window.__painel.S.cur.respostas['RSP-01'].nivel === 'N1' && /TWI/.test(window.__painel.S.cur.respostas['RSP-01'].obs)), 'observação gravada no item');

/* 5. Fotos */
console.log('5. Fotos');
await anexarFoto('EST-02', await imagemTeste('f1.jpg', '#E0661B', 'EST-02'));
await anexarFoto('CAR-03', await imagemTeste('f2.jpg', '#E0A100', 'CAR-03'));
await anexarFoto('DOC-01', await imagemTeste('f3.jpg', '#4F7FB0', 'DOC-01', 1200, 1600));
await anexarFoto('IDV-01', await imagemTeste('f4.jpg', '#2E9E5B', 'IDV-01'));
{
  const fs = await page.evaluate(() => window.__painel.S.fotos.map(f => { const i = new Image(); i.src = f.data; return { len: f.data.length, jpeg: f.data.startsWith('data:image/jpeg'), w: i.naturalWidth, h: i.naturalHeight, item: f.itemId }; }));
  await sleep(200);
  const dims = await page.evaluate(() => Promise.all(window.__painel.S.fotos.map(f => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = f.data; }))));
  check(fs.length === 4 && fs.every(f => f.jpeg), '4 fotos guardadas como JPEG');
  check(dims.every(([w, h]) => Math.max(w, h) === 1280), `fotos redimensionadas para 1280 px no lado maior (${dims.map(d => d.join('x')).join(', ')})`);
  const stored = await page.evaluate(async () => (await window.__painel.DB.all('fotos')).length);
  check(stored === 4, 'fotos persistidas no IndexedDB');
}
check(await page.evaluate(() => window.__painel.DB.mode) === 'indexeddb', 'armazenamento IndexedDB ativo');

// Screenshot do roteiro (sistema EST com N3 e foto)
await page.evaluate(() => { window.__painel.S.sys = 'EST'; });
await tab('roteiro');
await page.$eval('#it-EST-02', el => el.scrollIntoView({ block: 'start' }));
await page.evaluate(() => window.scrollBy(0, -128));
await shot('03-roteiro.png');
await page.evaluate(() => { window.__painel.S.sys = 'IDV'; });
await tab('roteiro');
await shot('03b-roteiro-idv.png');

/* 6. Pintura */
console.log('6. Mapa de pintura');
await tab('pintura');
const leituras = {
  capo: [112, 118, 109, 121, 115], teto: [120, 117, 119, 122, 116], tampa: [110, 114, 118, 113, 111],
  paralama_de: [116, 119, 112, 120, 118], paralama_dd: [310, 345, 290, 330, 325],
  porta_de: [180, 195, 188, 176, 190], porta_dd: [118, 121, 115, 117, 119],
  porta_te: [114, 116, 119, 121, 113], porta_td: [117, 115, 122, 118, 116],
  lateral_te: [119, 121, 117, 115, 120], lateral_td: [116, 118, 120, 114, 119],
  coluna_e: [118, 120, 116], coluna_d: [117, 119, 121]
};
for (const [p, ls] of Object.entries(leituras)) for (let i = 0; i < ls.length; i++) await typeIn(`[data-leit="${p}:${i}"]`, ls[i]);
await sleep(200);
{
  const st = id => page.$eval('#pb-' + id, el => el.className.replace('peca-res', '').trim());
  const ref = await page.evaluate(() => window.__painel.calcPintura(window.__painel.S.cur.pintura).ref);
  check(Math.abs(ref - 117.6) < 1.5, `referência = mediana das médias (${ref.toFixed(1)} µm)`);
  check(await st('capo') === 'verde', 'capô ≈ ref → verde (compatível)');
  check(await st('porta_de') === 'amarelo', 'porta DE ≈ 1,6× → amarelo (provável repintura)');
  check(await st('paralama_dd') === 'vermelho', 'paralama DD ≈ 2,7× → vermelho (massa/reparo)');
  check(await page.$eval('#pc-parachoque_d', el => /Plástico — não medir/.test(el.textContent)), 'para-choque marcado como plástico — não medir');
  check(await page.$eval('#view-pintura', el => /Orientativo/.test(el.textContent)), 'aviso de caráter orientativo');
  check(await page.$eval('#pnt-map rect[data-peca="porta_de"]', el => el.getAttribute('fill')) === '#E0A100', 'SVG colore a peça (porta DE amarela)');
  await typeIn('[data-ref]', '90');
  await sleep(100);
  check(await st('porta_de') === 'vermelho', 'referência manual 90 µm recalcula o semáforo (porta DE → vermelho)');
  await page.$eval('[data-ref]', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(100);
  check(await st('porta_de') === 'amarelo', 'limpar a referência volta à mediana automática');
}
await page.evaluate(() => window.scrollTo(0, 0));
await shot('04-pintura.png');
await page.$eval('#pc-paralama_dd', el => el.scrollIntoView({ block: 'start' })); await page.evaluate(() => window.scrollBy(0, -70));
await shot('04b-pintura-leituras.png');

/* 7. Resumo */
console.log('7. Resumo');
await tab('resumo');
await typeIn('#parecer', 'Veículo com substituição do painel frontal (EST-02, N3) e indícios de repintura em duas peças. Recomenda-se considerar os apontamentos na negociação e verificar o histórico de sinistro junto às fontes oficiais.');
check(await page.$eval('#cls-val', el => el.textContent) === 'APROVADO COM APONTAMENTOS', 'resumo: APROVADO COM APONTAMENTOS');
check(await page.$eval('#view-resumo', el => /EST-02/.test(el.textContent) && /CAR-03/.test(el.textContent)), 'resumo lista os N2/N3');
await page.evaluate(() => window.scrollTo(0, 0));
await shot('05-resumo.png');

/* 8. Laudo */
console.log('8. Laudo');
await tab('laudo');
check(!!(await page.$('#paper .laudo')), 'laudo liberado com todos os itens respondidos');
const txt = await page.$eval('#paper', el => el.textContent);
check(txt.includes('ABC1D23') && txt.includes('Vistorias Exemplo Ltda.') && txt.includes(numero), 'laudo tem placa, vistoriador e número');
check(txt.includes('APROVADO COM APONTAMENTOS'), 'laudo mostra a classificação');
check(!/Protocolo Cautelar/i.test(txt), 'marca do produto ausente no laudo (rodapé desligado)');
check(await page.$$eval('#paper .l-fotos figure', f => f.length) === 4, 'laudo com grade de 4 fotos legendadas');
check(!!(await page.$('#paper .l-pnt svg')), 'laudo com mapa de pintura');
check(txt.includes('não destrutivo'), 'laudo com texto de limites');
await page.evaluate(() => window.scrollTo(0, 0));
await shot('06-laudo.png');
await shot('06b-laudo-completo.png', true);

// PDF do laudo (A4)
await page.evaluate(() => { window.__painel.S.cur.emitidoEm = new Date().toISOString(); });
await page.pdf({ path: PDF, format: 'A4', printBackground: true, preferCSSPageSize: true });
check(statSync(PDF).size > 50000, `PDF gerado (${Math.round(statSync(PDF).size / 1024)} KB)`);

/* 9. Lista, duplicar, exportar, excluir, importar */
console.log('9. Persistência');
await page.click('.top-actions [data-view="lista"]'); await sleep(250);
await shot('00-lista.png');
await clickSel('[data-action="duplicar"]'); await sleep(300);
check(await page.$$eval('.v-item', l => l.length) === 2, 'duplicar cria uma segunda vistoria');
check(await page.evaluate(async () => (await window.__painel.DB.all('vistorias')).some(v => v.numero.endsWith('-0002'))), 'cópia recebe o número seguinte (-0002)');
const idOrig = await page.evaluate(() => window.__painel.S.cur.id);
for (const f of readdirSync(TMP).filter(f => f.startsWith('vistoria-'))) rmSync(join(TMP, f));
await clickSel(`[data-action="exportar"][data-id="${idOrig}"]`);
let exp = null;
for (let i = 0; i < 50 && !exp; i++) { await sleep(100); exp = readdirSync(TMP).find(f => f.startsWith('vistoria-') && f.endsWith('.json')); }
check(!!exp, `exportação gerou arquivo (${exp})`);
if (exp) {
  const pkg = JSON.parse(readFileSync(join(TMP, exp), 'utf8'));
  check(pkg.vistorias.length === 1 && pkg.fotos.length === 4 && pkg.fotos[0].data.startsWith('data:image/jpeg;base64,'), 'JSON exportado contém a vistoria e 4 fotos em base64');
  await clickSel(`[data-action="excluir"][data-id="${idOrig}"]`); await sleep(300);
  check(await page.evaluate(async id => !(await window.__painel.DB.get('vistorias', id)) && (await window.__painel.DB.all('fotos')).length === 0, idOrig), 'excluir (com confirmação) remove vistoria e fotos');
  const [fc] = await Promise.all([page.waitForFileChooser(), page.click('#view-lista [data-action="importar"]')]);
  await fc.accept([join(TMP, exp)]);
  await sleep(600);
  check(await page.evaluate(async id => !!(await window.__painel.DB.get('vistorias', id)) && (await window.__painel.DB.fotosDa(id)).length === 4, idOrig), 'importar restaura a vistoria com as 4 fotos');
}
// Recarregar: dados persistem
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__painel && window.__painel.S.cfg);
await sleep(300);
check(await page.evaluate(async () => (await window.__painel.DB.all('vistorias')).length === 2), 'após recarregar, as vistorias continuam salvas');
check(await page.evaluate(id => window.__painel.S.cur && window.__painel.S.cur.id === id, idOrig), 'reabre a última vistoria usada');
await page.click('.top-actions [data-view="lista"]'); await sleep(250);
await clickSel(`[data-action="abrir"][data-id="${idOrig}"]`);
await tab('laudo');
await page.evaluate(() => window.scrollTo(0, 0));

/* 10. Tema claro (screenshot) e desktop */
await page.click('[data-action="theme"]'); await sleep(150);
await tab('roteiro'); await page.evaluate(() => window.scrollTo(0, 0));
await shot('07-roteiro-tema-claro.png');
await page.click('[data-action="theme"]'); await sleep(100);
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.waitForFunction(() => window.__painel && window.__painel.S.cur); await sleep(200);
await tab('pintura'); await page.evaluate(() => window.scrollTo(0, 0));
await shot('08-desktop-pintura.png');
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.waitForFunction(() => window.__painel && window.__painel.S.cur); await sleep(200);

/* Verificações gerais */
console.log('10. Geral');
{
  const semOverflow = await page.evaluate(async () => {
    const out = [];
    for (const v of ['vistoria', 'roteiro', 'pintura', 'resumo']) { window.__painel.go(v); await new Promise(r => setTimeout(r, 80)); if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(v); }
    return out;
  });
  check(semOverflow.length === 0, `sem rolagem horizontal em 390 px ${semOverflow.length ? '(' + semOverflow.join(',') + ')' : ''}`);
  const pequenos = await page.evaluate(() => { window.__painel.go('roteiro'); return [...document.querySelectorAll('.lvb, .tab, .icon-btn, .item-tools .btn')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).length; });
  check(pequenos === 0, `botões de toque ≥ 44 px (${pequenos} menores)`);
  const semLabel = await page.evaluate(() => { const out = []; for (const v of ['config', 'vistoria', 'pintura', 'resumo']) { window.__painel.go(v); for (const el of document.querySelectorAll(`#view-${v} input:not([type=hidden]), #view-${v} textarea, #view-${v} select`)) { const ok = el.labels && el.labels.length || el.getAttribute('aria-label'); if (!ok) out.push(v + ':' + (el.dataset.bind || el.dataset.cfg || el.id)); } } return out; });
  check(semLabel.length === 0, `campos com rótulo acessível ${semLabel.length ? '(' + semLabel.join(',') + ')' : ''}`);
}
check(rede.length === 0, `nenhuma requisição de rede ${rede.length ? '(' + rede.slice(0, 3).join(', ') + ')' : ''}`);
check(erros.length === 0, `sem erros de JavaScript ${erros.length ? '\n    ' + erros.join('\n    ') : ''}`);

await browser.close();
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${oks} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
