/* Painel de Vistoria — regras (roteiro, classificação, pintura). Sem acesso a DOM. */
const DADOS = JSON.parse(document.getElementById('dados-sistemas').textContent);

const NIVEIS = DADOS.niveis.map(n => n.id);                  // N0..N4
const NIVEL_NOME = Object.fromEntries(DADOS.niveis.map(n => [n.id, n.nome]));
NIVEL_NOME.NA = 'Não se aplica';
NIVEL_NOME.NV = 'Não verificável';
const NIVEL_DEF = Object.fromEntries(DADOS.niveis.map(n => [n.id, n.definicao]));
const COR = { N0: '#2E9E5B', N1: '#4F7FB0', N2: '#E0A100', N3: '#E0661B', N4: '#C62828', NA: '#7A8591', NV: '#5A6472' };

const TIPOS = {
  carro: 'Carro',
  moto: 'Moto',
  utl: 'Utilitário / picape'
};

/* Itens de outros sistemas que também se aplicam a motocicletas */
const MOTO_EXTRAS = ['ELE-03', 'INT-03', 'INT-07'];
/* Itens do IDV que não se aplicam a motocicletas */
const MOTO_SEM = ['IDV-04'];

const ITEM_INDEX = {};
for (const s of [...DADOS.sistemas, ...DADOS.anexos]) for (const it of s.itens) ITEM_INDEX[it.id] = { ...it, sistema: s.id };

/** Roteiro (lista de grupos) conforme o tipo de veículo. */
function roteiro(tipo) {
  const S = Object.fromEntries(DADOS.sistemas.map(s => [s.id, s]));
  const A = Object.fromEntries(DADOS.anexos.map(s => [s.id, s]));
  const g = s => ({ id: s.id, n: s.n, nome: s.nome, objetivo: s.objetivo, itens: s.itens });
  if (tipo === 'moto') {
    return [
      g(S.DOC),
      { ...g(S.IDV), itens: S.IDV.itens.filter(i => !MOTO_SEM.includes(i.id)) },
      { ...g(A.MOTO), n: 'M' },
      { id: 'CMP', n: '+', nome: 'Itens complementares', objetivo: 'Itens dos demais sistemas que também se aplicam a motocicletas.', itens: MOTO_EXTRAS.map(id => ITEM_INDEX[id]) }
    ];
  }
  const base = DADOS.sistemas.map(g);
  if (tipo === 'utl') base.push({ ...g(A.UTL), n: 'U' });
  return base;
}
function itensDo(tipo) { return roteiro(tipo).flatMap(s => s.itens.map(i => ({ ...i, grupo: s.id }))); }

/** Itens em que "Não verificável" é permitido: críticos de identificação (IDV) e o nº do quadro/motor da moto. */
function permiteNV(item) { return !!item.critico && (item.id.startsWith('IDV-') || item.id === 'MOTO-01'); }

function nivelDe(v, id) { const r = v.respostas && v.respostas[id]; return r && r.nivel ? r.nivel : null; }

function pendentes(v) { return itensDo(v.tipo).filter(i => !nivelDe(v, i.id)); }

function contagem(v) {
  const c = { N0: 0, N1: 0, N2: 0, N3: 0, N4: 0, NA: 0, NV: 0, pend: 0, total: 0 };
  for (const i of itensDo(v.tipo)) { c.total++; const n = nivelDe(v, i.id); if (n) c[n]++; else c.pend++; }
  return c;
}

/** Matriz de classificação: INCONCLUSIVO > REPROVADO > APROVADO COM APONTAMENTOS > APROVADO. */
function classificar(v) {
  const itens = itensDo(v.tipo);
  const com = nv => itens.filter(i => nivelDe(v, i.id) === nv);
  const nv = com('NV'), n4 = com('N4'), n3 = com('N3'), n2 = com('N2');
  if (nv.length) return { id: 'INCONCLUSIVO', css: 'INCONCLUSIVO', motivo: `Item(ns) de identificação não verificável(is): ${nv.map(i => i.id).join(', ')}. O laudo não conclui; o motivo está descrito no item.`, itens: nv };
  if (n4.length) return { id: 'REPROVADO', css: 'REPROVADO', motivo: `${n4.length} achado(s) crítico(s) N4: ${n4.map(i => i.id).join(', ')}.`, itens: n4 };
  if (n2.length || n3.length) {
    const partes = [];
    if (n3.length) partes.push(`${n3.length} apontamento(s) relevante(s) N3 — atenção`);
    if (n2.length) partes.push(`${n2.length} apontamento(s) N2`);
    return { id: 'APROVADO COM APONTAMENTOS', css: 'APONT', motivo: partes.join('; ') + '.', itens: [...n3, ...n2], atencao: n3.length > 0 };
  }
  return { id: 'APROVADO', css: 'APROVADO', motivo: 'Somente achados N0/N1 no exame técnico visual.', itens: [] };
}

/* ------------------------------ Mapa de pintura ------------------------------ */
const PECAS = [
  { id: 'parachoque_d', nome: 'Para-choque dianteiro', sig: 'PC-D', plastico: true, r: [38, 10, 124, 22, 10] },
  { id: 'capo', nome: 'Capô', sig: 'CAPÔ', r: [50, 36, 100, 84, 8] },
  { id: 'paralama_de', nome: 'Paralama dianteiro esquerdo', sig: 'PE', r: [20, 36, 26, 84, 8] },
  { id: 'paralama_dd', nome: 'Paralama dianteiro direito', sig: 'PD', r: [154, 36, 26, 84, 8] },
  { id: 'porta_de', nome: 'Porta dianteira esquerda (DE)', sig: 'DE', r: [20, 124, 18, 84, 4] },
  { id: 'porta_dd', nome: 'Porta dianteira direita (DD)', sig: 'DD', r: [162, 124, 18, 84, 4] },
  { id: 'porta_te', nome: 'Porta traseira esquerda (TE)', sig: 'TE', r: [20, 212, 18, 82, 4] },
  { id: 'porta_td', nome: 'Porta traseira direita (TD)', sig: 'TD', r: [162, 212, 18, 82, 4] },
  { id: 'coluna_e', nome: 'Colunas lado esquerdo (A/B/C)', sig: '', r: [41, 124, 9, 170, 3] },
  { id: 'coluna_d', nome: 'Colunas lado direito (A/B/C)', sig: '', r: [150, 124, 9, 170, 3] },
  { id: 'teto', nome: 'Teto', sig: 'TETO', r: [54, 150, 92, 116, 6] },
  { id: 'lateral_te', nome: 'Lateral traseira esquerda', sig: 'LE', r: [20, 298, 26, 78, 8] },
  { id: 'lateral_td', nome: 'Lateral traseira direita', sig: 'LD', r: [154, 298, 26, 78, 8] },
  { id: 'tampa', nome: 'Tampa traseira / porta-malas', sig: 'TAMPA', r: [50, 298, 100, 78, 8] },
  { id: 'parachoque_t', nome: 'Para-choque traseiro', sig: 'PC-T', plastico: true, r: [38, 380, 124, 24, 10] }
];
const SEMAFORO = {
  verde: { cor: '#2E9E5B', txt: 'Compatível' },
  amarelo: { cor: '#E0A100', txt: 'Provável repintura' },
  vermelho: { cor: '#C62828', txt: 'Provável repintura com massa/reparo' },
  vazio: { cor: null, txt: 'Sem leitura' },
  plastico: { cor: null, txt: 'Plástico — não medir' }
};

function leiturasValidas(arr) { return (arr || []).map(Number).filter(x => Number.isFinite(x) && x > 0); }
function mediaPeca(arr) { const l = leiturasValidas(arr); return l.length ? l.reduce((a, b) => a + b, 0) / l.length : null; }
function mediana(xs) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/** Calcula médias, referência (mediana das médias ou valor manual) e semáforo por peça. */
function calcPintura(pintura) {
  const pz = (pintura && pintura.pecas) || {};
  const medias = {};
  for (const p of PECAS) if (!p.plastico) { const m = mediaPeca(pz[p.id]); if (m != null) medias[p.id] = m; }
  const refAuto = mediana(Object.values(medias));
  const manual = Number(pintura && pintura.ref);
  const ref = Number.isFinite(manual) && manual > 0 ? manual : refAuto;
  const status = {};
  for (const p of PECAS) {
    if (p.plastico) { status[p.id] = 'plastico'; continue; }
    const m = medias[p.id];
    if (m == null || !ref) status[p.id] = 'vazio';
    else if (m <= ref * 1.3) status[p.id] = 'verde';
    else if (m <= ref * 2) status[p.id] = 'amarelo';
    else status[p.id] = 'vermelho';
  }
  return { medias, refAuto, ref, manual: Number.isFinite(manual) && manual > 0, status, nMedidas: Object.keys(medias).length };
}

/** SVG do carro (vista superior, frente para cima). tema: 'app' | 'papel'. */
function svgCarro(pintura, opts = {}) {
  const tema = opts.tema || 'app';
  const pre = opts.prefixo || 'c';
  const calc = calcPintura(pintura);
  const vazio = tema === 'papel' ? '#E3E7EC' : '#3A4655';
  const vazioTxt = tema === 'papel' ? '#4E5864' : '#D6DCE3';
  const vidro = tema === 'papel' ? '#C9D3DE' : '#26303B';
  const corpo = tema === 'papel' ? '#F5F6F8' : '#161C23';
  const traco = tema === 'papel' ? '#FFFFFF' : '#0F1318';
  let s = `<svg viewBox="0 0 200 414" role="img" aria-label="Mapa de pintura, vista superior do veículo, frente para cima">`;
  s += `<defs><pattern id="${pre}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${vazio}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${tema === 'papel' ? '#AEB8C4' : '#56657A'}" stroke-width="2.5"/></pattern></defs>`;
  s += `<rect x="16" y="6" width="168" height="402" rx="34" fill="${corpo}"/>`;
  s += `<rect x="52" y="124" width="96" height="22" rx="4" fill="${vidro}"/><rect x="52" y="270" width="96" height="24" rx="4" fill="${vidro}"/>`;
  for (const p of PECAS) {
    const st = calc.status[p.id];
    const fill = st === 'plastico' ? `url(#${pre}-hatch)` : (SEMAFORO[st].cor || vazio);
    const [x, y, w, h, rx] = p.r;
    const sel = opts.sel === p.id ? ' sel' : '';
    const m = calc.medias[p.id];
    const tit = `${p.nome}: ${SEMAFORO[st].txt}${m != null ? ' — média ' + Math.round(m) + ' µm' : ''}`;
    s += `<rect class="pc${sel}" data-peca="${p.id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${traco}" stroke-width="2"><title>${tit}</title></rect>`;
    if (p.sig) {
      const tc = (st === 'vazio' || st === 'plastico') ? vazioTxt : (st === 'amarelo' ? '#1A1F26' : '#FFFFFF');
      const big = w > 60;
      s += `<text x="${x + w / 2}" y="${y + h / 2 + 3}" style="fill:${tc};font-size:${big ? 10 : 8}px">${p.sig}</text>`;
      if (big && m != null) s += `<text x="${x + w / 2}" y="${y + h / 2 + 15}" style="fill:${tc};font-size:8px;font-weight:600">${Math.round(m)} µm</text>`;
    }
  }
  s += `</svg>`;
  return s;
}
