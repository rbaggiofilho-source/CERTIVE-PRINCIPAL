// Gera os cadernos imprimíveis: Fichas de Ponto Crítico, Fichas de Teste e Checklists.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapaLocal, ZONAS_VALIDAS } from './lib/locais.mjs';
import { carroLateral, marca } from './lib/arte.mjs';
import { htmlToPdf, close } from './lib/pdf.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = join(RAIZ, '01-conteudo/dados');
const TMP = join(RAIZ, 'build/.tmp'); mkdirSync(TMP, { recursive: true });
const OUT = join(RAIZ, 'FINAL'); mkdirSync(OUT, { recursive: true });
const MAT = join(RAIZ, '03-materiais');
const EDICAO = 'Edição 1.0 · 2026';

const SIS = JSON.parse(readFileSync(join(D, 'sistemas.json'), 'utf8'));
const NOME_SIS = Object.fromEntries([...SIS.sistemas, ...SIS.anexos].map(s => [s.id, s.nome]));
const FICHAS = readdirSync(D).filter(f => f.startsWith('fichas-')).flatMap(f => JSON.parse(readFileSync(join(D, f), 'utf8')));
const ORDEM = ['DOC', 'IDV', 'EST', 'CAR', 'VID', 'RSP', 'MOT', 'TRF', 'ELE', 'INT', 'MOTO', 'UTL'];
FICHAS.sort((a, b) => ORDEM.indexOf(a.sistema) - ORDEM.indexOf(b.sistema) || a.codigo.localeCompare(b.codigo));
const TESTES = JSON.parse(readFileSync(join(D, 'testes.json'), 'utf8'));

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = s => esc(s).replace(/\[VERIFICAR[^\]]*\]/g, m => `<b style="color:#C62828">${m}</b>`);
const css = rodape => ['02-design/fonts/fonts.css', '02-design/tema.css', '02-design/materiais.css']
  .map(p => readFileSync(join(RAIZ, p), 'utf8').replace(/url\((\S+?\.woff2)\)/g, (m, f) => `url(${join(RAIZ, '02-design/fonts', f)})`)).join('\n')
  .replace('var(--rodape, "PROTOCOLO CAUTELAR")', `"${rodape}"`);
const doc = (titulo, rodape, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title><style>${css(rodape)}</style></head><body>${corpo}</body></html>`;

const capa = (sobre, t1, t2, sub, rod) => `<section class="capa"><div class="faixa"></div><div class="topo">${marca()}</div>
  <div class="t"><div class="sobre">${sobre}</div><h1>${t1}<span>${t2}</span></h1><div class="sub">${sub}</div></div>
  <div class="arte">${carroLateral({ cotas: false })}</div><div class="rod"><span>${rod}</span><span>${EDICAO}</span></div></section>`;

const nivelMax = f => (f.sinais || []).map(s => s.nivel).sort().pop();

// ---------------- Fichas de Ponto Crítico ----------------
function fichaHtml(f) {
  const zonasOk = (f.zonas || []).filter(z => (ZONAS_VALIDAS[f.vista] || []).includes(z));
  if (zonasOk.length !== (f.zonas || []).length) console.warn('Zona inválida em', f.codigo, f.zonas);
  return `<section class="pagina" id="${f.codigo}">
  <div class="cab"><div><span class="cod">${f.codigo}</span><span class="sis">${f.sistema} · ${esc(NOME_SIS[f.sistema] || '')}</span>
    <h1>${esc(f.titulo)}</h1><div class="st">${esc(f.subtitulo)}</div></div>
    <div class="dir">Itens <b>${(f.itens || []).join(' · ')}</b><br>Manual <b>cap. ${f.capitulo}</b><br>Nível máx. <span class="nv ${nivelMax(f)}">${nivelMax(f)}</span></div></div>
  <div class="grade g-mapa">
    <div class="card mapa-card">${mapaLocal(f.vista, zonasOk)}</div>
    <div class="card"><h3>Onde fica</h3><p>${fmt(f.onde_fica)}</p><h3 style="margin-top:2mm">Por que importa</h3><p>${fmt(f.por_que_importa)}</p></div>
  </div>
  <div class="grade g2">
    <div class="card verde"><h3>Como é de fábrica</h3><ul>${f.de_fabrica.map(x => `<li>${fmt(x)}</li>`).join('')}</ul></div>
    <div class="card laranja"><h3>Sinais de intervenção · nível sugerido</h3><table class="sinais">${f.sinais.map(s => `<tr><td><span class="nv ${s.nivel}">${s.nivel}</span></td><td>${fmt(s.sinal)}</td></tr>`).join('')}</table></div>
  </div>
  <div class="grade" style="grid-template-columns:1.45fr 1fr">
    <div class="card"><h3>Como verificar</h3><ol class="passos">${f.como_verificar.map(x => `<li><span>${fmt(x)}</span></li>`).join('')}</ol></div>
    <div class="card"><h3>Ferramentas</h3><div class="chips">${f.ferramentas.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div>
      <h3 style="margin-top:2.4mm">Foto obrigatória</h3><p>${fmt(f.foto)}</p></div>
  </div>
  <div class="grade g2">
    <div class="card laranja"><h3>Armadilhas</h3><ul>${f.armadilhas.map(x => `<li>${fmt(x)}</li>`).join('')}</ul></div>
    <div class="card cinza"><h3>Limite da vistoria cautelar</h3><p>${fmt(f.limite)}</p></div>
  </div>
  <div class="grade g2">
    <div class="card escuro"><h3>Frase-modelo · conforme</h3><div class="fr">${fmt(f.frase_conforme)}</div></div>
    <div class="card escuro"><h3>Frase-modelo · com achado</h3><div class="fr">${fmt(f.frase_achado)}</div></div>
  </div></section>`;
}

function indiceFichas() {
  let h = '', g = '';
  for (const f of FICHAS) {
    if (f.sistema !== g) { g = f.sistema; h += `<div class="grupo">${g} · ${esc(NOME_SIS[g])}</div>`; }
    h += `<a href="#${f.codigo}"><b>${f.codigo}</b><span>${esc(f.titulo)}</span><span class="nv ${nivelMax(f)}">${nivelMax(f)}</span></a>`;
  }
  return `<section class="pagina indice"><h2>Índice de <span>fichas</span></h2>
  <div class="intro-box"><b>Como usar.</b> Cada ficha cobre um ponto crítico do roteiro e usa a mesma numeração do checklist, da planilha e do app. O nível indicado ao lado de cada sinal é o <b>sugerido</b> pelo critério do Protocolo (N0 a N4); a classificação final segue a matriz do capítulo 3 do Manual. As frases-modelo trazem campos entre colchetes para você completar. O nível à direita no índice é o maior nível possível na ficha.</div>
  <div class="cols">${h}</div></section>`;
}

// ---------------- Fichas de Teste ----------------
function testeHtml(t) {
  return `<section class="pagina" id="${t.codigo}">
  <div class="cab"><div><span class="cod">${t.codigo}</span><span class="sis">Ficha de teste · Manual cap. ${t.capitulo}</span><h1>${esc(t.titulo)}</h1><div class="st">${fmt(t.objetivo)}</div></div>
    <div class="dir">Placa ______________<br>Data ____/____/______<br>Vistoriador __________</div></div>
  <div class="grade g2">
    <div class="card"><h3>Quando</h3><p>${fmt(t.quando)}</p><h3 style="margin-top:2mm">Equipamento</h3><div class="chips">${t.equipamento.map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>
    <div class="card"><h3>Preparação</h3><ul>${t.preparacao.map(x => `<li>${fmt(x)}</li>`).join('')}</ul></div>
  </div>
  <div class="grade"><div class="card"><h3>Passo a passo</h3><ol class="passos">${t.passos.map(x => `<li><span>${fmt(x)}</span></li>`).join('')}</ol></div></div>
  <div class="grade"><div class="card"><h3>Interpretação (valores orientativos)</h3>
    <table class="ref"><tr><th style="width:36%">Leitura / faixa</th><th>O que indica</th><th style="width:14mm">Nível</th></tr>
    ${t.referencias.map(r => `<tr><td>${fmt(r.faixa)}</td><td>${fmt(r.leitura)}</td><td>${/^N\d$/.test(r.nivel) ? `<span class="nv ${r.nivel}">${r.nivel}</span>` : '—'}</td></tr>`).join('')}</table></div></div>
  <div class="grade"><div class="card" style="--k:var(--carbono)"><h3>Registro de campo</h3><div class="campos">${t.registro.map(r => `<div class="campo">${esc(r.campo)}</div>`).join('')}<div class="campo">Nível atribuído</div><div class="campo">Foto nº</div></div></div></div>
  <div class="grade g2">
    <div class="card laranja"><h3>Erros comuns</h3><ul>${t.erros_comuns.map(x => `<li>${fmt(x)}</li>`).join('')}</ul></div>
    <div class="card cinza" style="--k:var(--n4)"><h3>Segurança</h3><p>${fmt(t.seguranca)}</p></div>
  </div></section>`;
}

// ---------------- Checklists ----------------
const CAM = '<svg class="cam" viewBox="0 0 24 24"><path d="M4 7h3l2-3h6l2 3h3v13H4z" fill="#B87F00"/><circle cx="12" cy="13" r="4" fill="#fff"/></svg>';
const NIVEIS = ['N0', 'N1', 'N2', 'N3', 'N4'];
const cabDados = `<div class="dados"><div class="campo">Placa</div><div class="campo">Marca / modelo / ano</div><div class="campo">Data e hora</div><div class="campo">Laudo nº</div></div>`;
function linhasCk(itens, det) {
  return itens.map(i => `<tr><td class="cod${i.critico ? ' crit' : ''}">${i.id}${i.foto ? ' ' + CAM : ''}</td><td>${esc(i.item)}${det ? `<span class="ver">${esc(i.verificar)}${i.ficha ? ` · <b>${i.ficha}</b>` : ''}</span>` : ''}</td>${NIVEIS.map(() => '<td class="bx"><span></span></td>').join('')}<td class="bx"><span></span></td>${(i.id.startsWith('IDV') || i.id === 'MOTO-01') ? '<td class="bx"><span></span></td>' : '<td class="bx"></td>'}<td class="ob"></td></tr>`).join('');
}
const thCk = `<tr><th style="width:15mm">Código</th><th class="e">Item</th>${NIVEIS.map(n => `<th class="${n.toLowerCase()}">${n}</th>`).join('')}<th>N/A</th><th>NV</th><th class="e">Observação / foto nº</th></tr>`;
const matriz = `<div class="card"><h3>Matriz de classificação (nesta ordem)</h3><div class="matriz">
  <div><span class="cl" style="background:var(--inc)">INCONCLUSIVO</span>Algum item IDV marcado NV (não verificável)</div>
  <div><span class="cl" style="background:var(--n4)">REPROVADO</span>Pelo menos um N4</div>
  <div><span class="cl" style="background:var(--n2);color:#1a1f26">APROVADO C/ APONTAMENTOS</span>Pelo menos um N2 ou N3 (N3 em destaque)</div>
  <div><span class="cl" style="background:var(--n0)">APROVADO</span>Somente N0 ou N1</div></div></div>`;
const contagem = `<div class="card"><h3>Contagem</h3><div class="cont">${[...NIVEIS, 'NV'].map(n => `<div>${n}</div>`).join('')}</div><div class="leg">Classificação: ______________________________</div></div>`;
const legenda = `<div class="leg">${CAM} = foto obrigatória · código em vermelho = item crítico · NV = não verificável (só identificação) · N0 Conforme · N1 Observação · N2 Apontamento · N3 Apontamento relevante · N4 Crítico</div>`;

function checklistPatio() {
  const sis = SIS.sistemas;
  const pag = (lista, n) => `<section class="pagina patio-pg"><div class="ck-cab"><div><h1><small>CHECKLIST DE PÁTIO · FOLHA ${n}/2</small>Roteiro completo · ${n === 1 ? 'sistemas 1 a 5' : 'sistemas 6 a 10'}</h1></div>${marca({ cor: '#B87F00', texto: '#0F1318', tamanho: .7 })}</div>
    ${n === 1 ? cabDados : ''}<table class="ck patio">${thCk}${lista.map(s => `<tr class="sis"><td colspan="10">${s.n}. ${esc(s.nome)} (${s.id})</td></tr>${linhasCk(s.itens, false)}`).join('')}</table>
    ${n === 2 ? `<div class="rodape-ck">${matriz}${contagem}</div>` : ''}${legenda}</section>`;
  return pag(sis.slice(0, 5), 1) + pag(sis.slice(5), 2);
}
function checklistDetalhado(s) {
  return `<section class="pagina"><div class="ck-cab"><div><h1><small>CHECKLIST DETALHADO · ${s.id}</small>${s.n ? s.n + '. ' : 'Anexo · '}${esc(s.nome)}</h1><div class="obj">${esc(s.objetivo)}</div></div>${marca({ cor: '#B87F00', texto: '#0F1318', tamanho: .7 })}</div>
    ${cabDados}<table class="ck det">${thCk}${linhasCk(s.itens, true)}</table>${legenda}</section>`;
}

// ---------------- Montagem ----------------
async function gerar(nome, titulo, rodape, corpo) {
  const html = join(TMP, nome + '.html'); writeFileSync(html, doc(titulo, rodape, corpo));
  const pdf = join(OUT, nome + '.pdf'); await htmlToPdf(html, pdf); return pdf;
}

const p1 = await gerar('Protocolo-Cautelar_Fichas-de-Ponto-Critico', 'Fichas de Ponto Crítico', 'PROTOCOLO CAUTELAR  ·  Fichas de Ponto Crítico',
  capa('FICHAS DE PONTO CRÍTICO', `${FICHAS.length} pontos`, 'que decidem o laudo', 'Onde fica, como é de fábrica, os sinais de intervenção com nível sugerido, o passo a passo de verificação e a frase-modelo para o laudo, ponto a ponto.', 'Imprima, plastifique ou consulte no celular') + indiceFichas() + FICHAS.map(fichaHtml).join(''));
const p2 = await gerar('Protocolo-Cautelar_Fichas-de-Teste', 'Fichas de Teste', 'PROTOCOLO CAUTELAR  ·  Fichas de Teste',
  capa('FICHAS DE TESTE', `${TESTES.length} testes`, 'de pátio', 'Procedimento, valores de referência orientativos, interpretação e campos de registro para preencher à mão durante a vistoria.', 'Uma ficha por teste, pronta para imprimir') + TESTES.map(testeHtml).join(''));
const p3 = await gerar('Protocolo-Cautelar_Checklists', 'Checklists', 'PROTOCOLO CAUTELAR  ·  Checklists',
  capa('CHECKLISTS', 'Checklist de pátio', 'e 12 detalhados', 'A folha de pátio (frente e verso) cobre o roteiro inteiro. Os detalhados trazem o que verificar em cada item e a ficha de referência. Mesma numeração do app e das planilhas.', '10 sistemas + motos + utilitários') +
  checklistPatio() + [...SIS.sistemas, ...SIS.anexos].map(checklistDetalhado).join(''));
await close();
console.log('Gerados:\n' + [p1, p2, p3].join('\n'));
