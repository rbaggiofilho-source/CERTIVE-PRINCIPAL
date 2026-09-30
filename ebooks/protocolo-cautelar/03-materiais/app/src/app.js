/* Painel de Vistoria — interface. */
const LIMITES_PADRAO = 'Este laudo registra o resultado de exame técnico visual e não destrutivo, realizado sem desmontagem de peças ou componentes, no local, na data e no horário indicados, nas condições de iluminação, limpeza e acesso existentes no momento da vistoria. Reflete exclusivamente o estado observado naquele momento e não constitui garantia sobre o veículo, sua procedência, seu histórico ou seu funcionamento futuro.\n\nEste laudo não substitui a vistoria oficial exigida pelo órgão de trânsito (por exemplo, para transferência), nem perícia oficial ou exame por autoridade competente. Divergências em itens de identificação veicular são registradas como indícios e devem ser encaminhadas à verificação oficial; este laudo não conclui sobre adulteração.\n\nConsultas documentais refletem as informações disponíveis nas fontes consultadas na data indicada. Medições (como espessura de pintura) são orientativas e variam conforme fabricante, modelo e processo produtivo.';

const S = {
  cfg: null, cur: null, fotos: [], view: null, sys: null, selPeca: null,
  fotoItem: null, laudoTodos: false, laudoFotos: true
};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function uid(p) { return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
function agoraLocal() { const d = new Date(); d.setSeconds(0, 0); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function localParaISO(s) { const d = new Date(s); return isNaN(d) ? new Date().toISOString() : d.toISOString(); }
function isoParaLocal(iso) { const d = new Date(iso); if (isNaN(d)) return agoraLocal(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ------------------------------ Persistência ------------------------------ */
function cfgPadrao() {
  return { id: 'cfg', nome: '', doc: '', contato: '', logo: null, limites: LIMITES_PADRAO, rodape: false, seq: 0, tema: 'dark', ultimaVistoria: null };
}
async function salvarCfg() { await DB.put('config', S.cfg); }
let saveT;
function salvarCur(imediato) {
  if (!S.cur) return;
  S.cur.atualizadoEm = new Date().toISOString();
  clearTimeout(saveT);
  const f = () => DB.put('vistorias', S.cur).catch(e => toast(e.message || 'Falha ao salvar'));
  if (imediato) return f();
  saveT = setTimeout(f, 350);
  atualizarTopo();
}

function novaVistoriaObj() {
  S.cfg.seq = (S.cfg.seq || 0) + 1;
  const ano = new Date().getFullYear();
  return {
    id: uid('v'), numero: `${ano}-${String(S.cfg.seq).padStart(4, '0')}`,
    criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
    tipo: 'carro',
    veiculo: { placa: '', marcaModelo: '', anoFab: '', anoMod: '', cor: '', km: '', chassi: '', renavam: '', combustivel: '' },
    solicitante: '', dataHora: new Date().toISOString(), local: '',
    respostas: {}, pintura: { ref: '', pecas: {} }, parecer: '', emitidoEm: null
  };
}

async function abrirVistoria(id, view = 'vistoria') {
  const v = await DB.get('vistorias', id);
  if (!v) { toast('Vistoria não encontrada'); return; }
  S.cur = v; S.fotos = await DB.fotosDa(id); S.sys = null; S.selPeca = null;
  S.cfg.ultimaVistoria = id; salvarCfg();
  go(view);
}

/* ------------------------------ Navegação ------------------------------ */
const VIEWS = ['config', 'lista', 'vistoria', 'roteiro', 'pintura', 'resumo', 'laudo'];
const PRECISA_VISTORIA = ['vistoria', 'roteiro', 'pintura', 'resumo', 'laudo'];
function go(view, opts = {}) {
  if (PRECISA_VISTORIA.includes(view) && !S.cur) view = 'lista';
  S.view = view;
  for (const v of VIEWS) $('#view-' + v).hidden = v !== view;
  $$('.tab').forEach(t => {
    const on = t.dataset.view === view;
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    t.disabled = !S.cur && t.dataset.view !== 'vistoria';
  });
  $$('.top-actions .icon-btn[data-view]').forEach(b => { if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  RENDER[view]();
  ajustarTextareas($('#view-' + view));
  atualizarTopo();
  if (!opts.keepScroll) window.scrollTo(0, 0);
}
function atualizarTopo() {
  const l = $('#cur-label');
  if (!S.cur) { l.textContent = 'Nenhuma vistoria aberta'; return; }
  const c = contagem(S.cur);
  const placa = (S.cur.veiculo.placa || '').toUpperCase() || 'sem placa';
  l.innerHTML = `<b>${esc(placa)}</b> · Nº ${esc(S.cur.numero)} · ${c.total - c.pend}/${c.total}`;
}

/* ------------------------------ Tela: configuração ------------------------------ */
function renderConfig() {
  const c = S.cfg; const primeira = !!S.primeiraVez;
  $('#view-config').innerHTML = `
  <div class="view-head"><div><h1 id="h-config">${primeira ? 'Bem-vindo' : 'Configuração'}</h1>
  <p>${primeira ? 'Configure uma vez os dados que aparecem no cabeçalho do seu laudo.' : 'Dados do vistoriador usados em todos os laudos.'}</p></div></div>
  <div class="card">
    <h2>Vistoriador / empresa</h2>
    <label class="field"><span>Nome ou razão social</span><input type="text" data-cfg="nome" value="${esc(c.nome)}" autocomplete="organization" placeholder="Ex.: Vistorias Exemplo Ltda."></label>
    <label class="field"><span>Documento (CNPJ ou CPF)</span><input type="text" data-cfg="doc" value="${esc(c.doc)}" inputmode="numeric" placeholder="00.000.000/0000-00"></label>
    <label class="field"><span>Contato (telefone, e-mail, cidade)</span><input type="text" data-cfg="contato" value="${esc(c.contato)}" placeholder="(00) 00000-0000 · cidade/UF"></label>
    <div class="field"><span class="lbl">Logo (aparece no laudo)</span>
      <div class="logo-prev"><div class="box">${c.logo ? `<img src="${c.logo}" alt="Logo atual">` : '<small style="color:#66717D">sem logo</small>'}</div>
      <div class="btn-row" style="flex:1"><button class="btn btn-sm" data-action="logo">${c.logo ? 'Trocar' : 'Enviar imagem'}</button>${c.logo ? '<button class="btn btn-sm btn-danger" data-action="logo-del">Remover</button>' : ''}</div></div>
      <span class="hint">A imagem é reduzida e guardada só neste aparelho.</span></div>
  </div>
  <div class="card">
    <h2>Texto de limites do laudo</h2>
    <label class="field"><span class="sr">Texto de limites</span><textarea data-cfg="limites" rows="9">${esc(c.limites)}</textarea></label>
    <div class="btn-row"><button class="btn btn-sm" data-action="limites-padrao">Restaurar texto padrão</button></div>
  </div>
  <div class="card">
    <h2>Preferências</h2>
    <label class="check"><input type="checkbox" data-cfg="rodape" ${c.rodape ? 'checked' : ''}> <span>Mostrar rodapé discreto “${LAUDO_RODAPE_PRODUTO}” no laudo</span></label>
    <label class="check"><input type="checkbox" data-cfg="temaClaro" ${c.tema === 'light' ? 'checked' : ''}> <span>Tema claro (melhor sob sol forte)</span></label>
  </div>
  <div class="card card-note lgpd" role="note">
    <h2>Privacidade e LGPD</h2>
    <p>Os dados (vistorias, fotos, placas, nomes de solicitantes) ficam <b>somente neste aparelho</b>, no armazenamento do navegador. Nada é enviado para a internet: o app não tem servidor.</p>
    <ul>
      <li>Você é o controlador desses dados (LGPD — Lei 13.709/2018): informe o solicitante sobre as fotos e o uso do laudo, e guarde apenas o necessário.</li>
      <li>Faça backups periódicos (exportar). Limpar os dados do navegador, desinstalar o navegador ou trocar de aparelho apaga tudo.</li>
      <li>Proteja o aparelho com senha/biometria; quem tiver acesso ao aparelho terá acesso às vistorias.</li>
    </ul>
  </div>
  <div class="card">
    <h2>Backup</h2>
    <p class="muted" style="font-size:.88rem">Armazenamento: <b>${DB.mode === 'indexeddb' ? 'IndexedDB (recomendado)' : DB.mode === 'localstorage' ? 'localStorage (limitado — poucas fotos)' : 'memória (os dados serão perdidos ao fechar!)'}</b><span id="est"></span></p>
    <div class="btn-row"><button class="btn" data-action="backup">Exportar tudo (.json)</button><button class="btn" data-action="importar">Importar</button></div>
  </div>
  ${primeira ? '<button class="btn btn-primary btn-block" data-action="cfg-ok">Salvar e começar</button>' : '<button class="btn btn-primary btn-block" data-action="go" data-view="lista">Concluído</button>'}
  <p class="muted" style="font-size:.75rem;text-align:center;margin-top:14px">Painel de Vistoria · parte do Protocolo Cautelar · funciona offline</p>`;
  DB.estimate().then(e => { if (e && e.usage != null && $('#est')) $('#est').textContent = ` · em uso: ${(e.usage / 1048576).toFixed(1)} MB`; });
}

/* ------------------------------ Tela: lista ------------------------------ */
async function renderLista() {
  const el = $('#view-lista');
  const vs = (await DB.all('vistorias')).sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
  let h = `<div class="view-head"><div><h1 id="h-lista">Minhas vistorias</h1><p>${vs.length} salva(s) neste aparelho</p></div></div>
  <div class="btn-row" style="margin-bottom:12px"><button class="btn btn-primary" data-action="nova" style="flex:2">+ Nova vistoria</button><button class="btn" data-action="importar" style="flex:1">Importar</button></div>`;
  if (!vs.length) h += `<div class="card empty"><p><b>Nenhuma vistoria ainda.</b></p><p>Toque em “Nova vistoria” para começar. Tudo fica salvo automaticamente neste aparelho.</p></div>`;
  for (const v of vs) {
    const c = contagem(v); const cl = c.pend ? null : classificar(v);
    const placa = (v.veiculo.placa || '').toUpperCase() || 'SEM PLACA';
    h += `<div class="card v-item${S.cur && S.cur.id === v.id ? ' card-note' : ''}">
      <div><div class="placa">${esc(placa)}</div><div class="meta">${esc(v.veiculo.marcaModelo || TIPOS[v.tipo])} · Nº ${esc(v.numero)}<br>${fmtDataHora(v.dataHora)} · ${c.total - c.pend}/${c.total} itens</div></div>
      <div>${cl ? `<span class="badge cls-${cl.css}">${cl.id === 'APROVADO COM APONTAMENTOS' ? 'Aprov. c/ apont.' : cl.id}</span>` : '<span class="badge cls-PEND">Em andamento</span>'}</div>
      <div class="btn-row"><button class="btn btn-sm btn-primary" data-action="abrir" data-id="${v.id}">Abrir</button><button class="btn btn-sm" data-action="duplicar" data-id="${v.id}">Duplicar</button><button class="btn btn-sm" data-action="exportar" data-id="${v.id}">Exportar</button><button class="btn btn-sm btn-danger" data-action="excluir" data-id="${v.id}" aria-label="Excluir vistoria ${esc(placa)}">Excluir</button></div>
    </div>`;
  }
  el.innerHTML = h;
}

/* ------------------------------ Tela: dados da vistoria ------------------------------ */
function renderVistoria() {
  const v = S.cur; const ve = v.veiculo;
  const comb = ['', 'Flex', 'Gasolina', 'Etanol', 'Diesel', 'GNV + outro', 'Elétrico', 'Híbrido', 'Outro'];
  $('#view-vistoria').innerHTML = `
  <div class="view-head"><div><h1 id="h-vistoria">Vistoria nº ${esc(v.numero)}</h1><p>Salvo automaticamente neste aparelho.</p></div></div>
  <div class="card">
    <h2 id="lbl-tipo">Tipo de veículo</h2>
    <div class="seg" role="radiogroup" aria-labelledby="lbl-tipo">
      ${Object.entries(TIPOS).map(([k, t]) => `<button role="radio" aria-checked="${v.tipo === k}" data-action="tipo" data-tipo="${k}">${k === 'utl' ? 'Utilitário' : t}</button>`).join('')}
    </div>
    <p class="muted" style="font-size:.8rem;margin:8px 0 0">${v.tipo === 'moto' ? 'Moto: DOC, IDV, anexo MOTO e itens complementares.' : v.tipo === 'utl' ? 'Utilitário: 10 sistemas + anexo UTL (chassi e carga).' : 'Carro: 10 sistemas do roteiro.'}</p>
  </div>
  <div class="card">
    <h2>Veículo</h2>
    <div class="grid2">
      <label class="field"><span>Placa</span><input type="text" class="upper" data-bind="veiculo.placa" value="${esc(ve.placa)}" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="ABC1D23"></label>
      <label class="field"><span>Hodômetro (km)</span><input type="text" data-bind="veiculo.km" value="${esc(ve.km)}" inputmode="numeric" autocomplete="off"></label>
    </div>
    <label class="field"><span>Marca / modelo / versão</span><input type="text" data-bind="veiculo.marcaModelo" value="${esc(ve.marcaModelo)}" autocomplete="off"></label>
    <div class="grid2">
      <label class="field"><span>Ano de fabricação</span><input type="text" data-bind="veiculo.anoFab" value="${esc(ve.anoFab)}" inputmode="numeric" maxlength="4" autocomplete="off"></label>
      <label class="field"><span>Ano do modelo</span><input type="text" data-bind="veiculo.anoMod" value="${esc(ve.anoMod)}" inputmode="numeric" maxlength="4" autocomplete="off"></label>
      <label class="field"><span>Cor</span><input type="text" data-bind="veiculo.cor" value="${esc(ve.cor)}" autocomplete="off"></label>
      <label class="field"><span>Combustível</span><select data-bind="veiculo.combustivel">${comb.map(o => `<option ${ve.combustivel === o ? 'selected' : ''} value="${o}">${o || 'Selecione'}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Chassi (VIN)</span><input type="text" class="upper" data-bind="veiculo.chassi" value="${esc(ve.chassi)}" maxlength="17" autocapitalize="characters" autocomplete="off"><span class="hint" id="vin-hint">${vinHint(ve.chassi)}</span></label>
    <label class="field"><span>RENAVAM</span><input type="text" data-bind="veiculo.renavam" value="${esc(ve.renavam)}" inputmode="numeric" maxlength="11" autocomplete="off"></label>
  </div>
  <div class="card">
    <h2>Solicitação</h2>
    <label class="field"><span>Solicitante</span><input type="text" data-bind="solicitante" value="${esc(v.solicitante)}" autocomplete="off"></label>
    <label class="field"><span>Data e hora da vistoria</span><input type="datetime-local" data-bind="dataHora" value="${isoParaLocal(v.dataHora)}"><span class="hint">Preenchida automaticamente ao criar.</span></label>
    <label class="field"><span>Local</span><input type="text" data-bind="local" value="${esc(v.local)}" placeholder="Endereço ou pátio" autocomplete="off"></label>
  </div>
  <button class="btn btn-primary btn-block" data-action="go" data-view="roteiro">Ir para o roteiro →</button>`;
}
function vinHint(vin) {
  const s = (vin || '').toUpperCase();
  if (!s) return '17 caracteres. Confira com o documento no item IDV.';
  if (/[IOQ]/.test(s)) return 'Atenção: VIN não usa as letras I, O e Q — confira a digitação.';
  return s.length === 17 ? '17 caracteres ✓' : `${s.length}/17 caracteres`;
}

/* ------------------------------ Tela: roteiro ------------------------------ */
function progressoGrupo(g) { const r = g.itens.filter(i => nivelDe(S.cur, i.id)).length; return { r, t: g.itens.length }; }
function flagGrupo(g) {
  let pior = null; const ordem = ['N2', 'N3', 'NV', 'N4'];
  for (const i of g.itens) { const n = nivelDe(S.cur, i.id); if (ordem.indexOf(n) > ordem.indexOf(pior)) pior = n; }
  return pior;
}
function renderRoteiro() {
  const gs = roteiro(S.cur.tipo);
  if (!S.sys || !gs.find(g => g.id === S.sys)) S.sys = (gs.find(g => progressoGrupo(g).r < g.itens.length) || gs[0]).id;
  const g = gs.find(x => x.id === S.sys);
  const idx = gs.indexOf(g);
  const c = contagem(S.cur);
  let h = `<div class="view-head"><div><h1 id="h-roteiro">Roteiro</h1><p>${c.total - c.pend} de ${c.total} itens respondidos</p></div></div>`;
  h += `<div class="sys-strip" role="tablist" aria-label="Sistemas">`;
  for (const x of gs) {
    const p = progressoGrupo(x); const f = flagGrupo(x);
    h += `<button class="sys-chip${p.r === p.t ? ' done' : ''}" role="tab" aria-selected="${x.id === S.sys}" aria-current="${x.id === S.sys}" data-action="sys" data-sys="${x.id}" aria-label="${esc(x.nome)}: ${p.r} de ${p.t}">
      ${f ? `<span class="flag" style="background:${COR[f]}"></span>` : ''}${esc(x.id)}<small>${p.r}/${p.t}</small><span class="mini"><i style="width:${Math.round(100 * p.r / p.t)}%"></i></span></button>`;
  }
  h += `</div><div id="sys-body">${sysBody(g, idx, gs.length)}</div>`;
  $('#view-roteiro').innerHTML = h;
  const chip = $(`.sys-chip[data-sys="${S.sys}"]`);
  if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function sysBody(g, idx, total) {
  const p = progressoGrupo(g);
  let h = `<div class="sys-head"><h2>${typeof g.n === 'number' ? g.n + '. ' : ''}${esc(g.id)} — ${esc(g.nome)}</h2><p class="obj">${esc(g.objetivo)}</p>
    <div class="progress${p.r === p.t ? ' done' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${p.t}" aria-valuenow="${p.r}" aria-label="Progresso do sistema"><i style="width:${Math.round(100 * p.r / p.t)}%"></i></div>
    <div class="progress-lbl"><span>${p.r} de ${p.t} respondidos</span>${p.r < p.t ? `<button class="btn btn-sm" style="min-height:36px;padding:4px 10px" data-action="restante-n0" data-sys="${g.id}">Restantes = N0</button>` : '<span>Completo ✓</span>'}</div></div>`;
  if (g.id === 'IDV' || g.id === 'MOTO') h += `<div class="card card-note" style="font-size:.85rem"><b>Identificação:</b> registre divergência como <b>N4</b> e oriente a verificação oficial — o vistoriador cautelar não conclui adulteração. Item crítico que não pôde ser conferido → <b>Não verificável</b> (resultado INCONCLUSIVO).</div>`;
  h += g.itens.map(itemCard).join('');
  h += `<div class="btn-row" style="margin-top:4px">`;
  if (idx > 0) h += `<button class="btn" data-action="sys-nav" data-d="-1">← Anterior</button>`;
  h += idx < total - 1 ? `<button class="btn btn-primary" data-action="sys-nav" data-d="1">Próximo sistema →</button>` : `<button class="btn btn-primary" data-action="go" data-view="${S.cur.tipo === 'moto' ? 'resumo' : 'pintura'}">${S.cur.tipo === 'moto' ? 'Ver resumo →' : 'Mapa de pintura →'}</button>`;
  h += `</div>`;
  return h;
}
function itemCard(it) {
  const r = S.cur.respostas[it.id] || {};
  const n = r.nivel;
  const fotos = S.fotos.filter(f => f.itemId === it.id);
  const showObs = r.showObs || (r.obs && r.obs.length) || ['N2', 'N3', 'N4', 'NV'].includes(n);
  const lb = (val, txt, cls) => `<button class="lvb ${cls || ''}" role="radio" aria-checked="${n === val}" data-action="nivel" data-item="${it.id}" data-v="${val}" style="--c:${COR[val]}" aria-label="${esc(NIVEL_NOME[val])}${val.startsWith('N') && val.length === 2 ? ' (' + val + ')' : ''}">${txt}</button>`;
  let h = `<div class="card item${n ? ' answered' : ''}" id="it-${it.id}" style="${n ? `--lvl:${COR[n]}` : ''}">
    <div class="item-top"><span class="item-id">${esc(it.id)}</span><span class="item-name" id="nm-${it.id}">${esc(it.item)}${it.critico ? '<span class="tag tag-crit">crítico</span>' : ''}${it.foto ? '<span class="tag tag-foto">foto</span>' : ''}</span></div>
    <div class="item-ver">${esc(it.verificar)}</div>
    <div class="lv" role="radiogroup" aria-labelledby="nm-${it.id}">${NIVEIS.map(v => lb(v, v)).join('')}</div>
    <div class="lv2" role="radiogroup" aria-label="Outras opções para ${esc(it.id)}">${lb('NA', 'N/A — não se aplica', 'na')}${permiteNV(it) ? lb('NV', 'Não verificável', 'nv') : ''}</div>`;
  if (n) h += `<div class="lvl-hint"><b>${esc(n === 'NA' ? 'N/A' : n)} · ${esc(NIVEL_NOME[n])}</b>${NIVEL_DEF[n] ? ' — ' + esc(NIVEL_DEF[n]) : ''}${n === 'NV' ? ' — descreva o motivo na observação; resultado INCONCLUSIVO.' : ''}${n === 'N4' && (it.id.startsWith('IDV') || it.id === 'MOTO-01') ? ' Registre a divergência e oriente perícia oficial/autoridade.' : ''}</div>`;
  h += `<div class="item-tools">
      <button class="btn btn-sm" data-action="foto" data-src="camera" data-item="${it.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Câmera</button>
      <button class="btn btn-sm" data-action="foto" data-src="galeria" data-item="${it.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 16l5-5 4 4 3-3 5 5"/></svg>Galeria${fotos.length ? ` <span class="cnt" aria-label="${fotos.length} foto(s)">${fotos.length}</span>` : ''}</button>
      <button class="btn btn-sm" data-action="obs" data-item="${it.id}" aria-expanded="${!!showObs}">Obs.</button>
    </div>`;
  if (showObs) h += `<div class="item-obs"><label class="sr" for="obs-${it.id}">Observação ${esc(it.id)}</label><textarea id="obs-${it.id}" data-obs="${it.id}" rows="3" placeholder="Descreva o que foi constatado (local, extensão). Linguagem descritiva: “constatado”, “indício de”.">${esc(r.obs || '')}</textarea></div>`;
  if (fotos.length) h += `<div class="thumbs">${fotos.map(f => `<div class="thumb"><img src="${f.data}" alt="Foto do item ${esc(it.id)}"><button data-action="foto-del" data-foto="${f.id}" aria-label="Excluir foto"><span aria-hidden="true">×</span></button></div>`).join('')}</div>`;
  h += `</div>`;
  return h;
}
function refreshItem(id) {
  const it = ITEM_INDEX[id]; const el = $('#it-' + id);
  if (el) { el.outerHTML = itemCard(it); ajustarTextareas($('#it-' + id)); }
  // atualiza cabeçalho do sistema e chips sem redesenhar os itens
  const gs = roteiro(S.cur.tipo); const g = gs.find(x => x.id === S.sys);
  if (g) {
    const p = progressoGrupo(g);
    const bar = $('#sys-body .progress'); if (bar) { bar.classList.toggle('done', p.r === p.t); bar.firstElementChild.style.width = Math.round(100 * p.r / p.t) + '%'; bar.setAttribute('aria-valuenow', p.r); }
    const lbl = $('#sys-body .progress-lbl'); if (lbl) lbl.innerHTML = `<span>${p.r} de ${p.t} respondidos</span>${p.r < p.t ? `<button class="btn btn-sm" style="min-height:36px;padding:4px 10px" data-action="restante-n0" data-sys="${g.id}">Restantes = N0</button>` : '<span>Completo ✓</span>'}`;
  }
  for (const x of gs) {
    const chip = $(`.sys-chip[data-sys="${x.id}"]`); if (!chip) continue;
    const p = progressoGrupo(x); const f = flagGrupo(x);
    chip.classList.toggle('done', p.r === p.t);
    chip.querySelector('small').textContent = `${p.r}/${p.t}`;
    chip.querySelector('.mini i').style.width = Math.round(100 * p.r / p.t) + '%';
    let fl = chip.querySelector('.flag');
    if (f) { if (!fl) { fl = document.createElement('span'); fl.className = 'flag'; chip.prepend(fl); } fl.style.background = COR[f]; } else if (fl) fl.remove();
  }
  const c = contagem(S.cur);
  const sub = $('#view-roteiro .view-head p'); if (sub) sub.textContent = `${c.total - c.pend} de ${c.total} itens respondidos`;
}

/* ------------------------------ Fotos ------------------------------ */
function carregarImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem inválida')); i.src = src; }); }
async function comprimir(file, max = 1280, q = 0.7, tipo = 'image/jpeg') {
  const url = URL.createObjectURL(file);
  try {
    const img = await carregarImg(url);
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    if (tipo === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    return cv.toDataURL(tipo, q);
  } finally { URL.revokeObjectURL(url); }
}
async function adicionarFotos(files) {
  const itemId = S.fotoItem; if (!itemId || !S.cur) return;
  let n = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    try {
      const data = await comprimir(f);
      const foto = { id: uid('f'), vistoriaId: S.cur.id, itemId, data, criadoEm: new Date().toISOString() };
      await DB.put('fotos', foto); S.fotos.push(foto); n++;
    } catch (e) { toast(e.message || 'Não foi possível ler a imagem'); }
  }
  if (n) { toast(`${n} foto(s) adicionada(s)`); salvarCur(); if (S.view === 'roteiro') refreshItem(itemId); }
}

/* ------------------------------ Tela: pintura ------------------------------ */
function renderPintura() {
  const el = $('#view-pintura');
  if (S.cur.tipo === 'moto') {
    el.innerHTML = `<div class="view-head"><div><h1 id="h-pintura">Mapa de pintura</h1></div></div>
    <div class="card card-note"><p><b>O mapa de pintura é para carros e utilitários.</b></p><p style="margin:0">Em motocicletas, registre repintura de tanque, carenagens e quadro nos itens MOTO-02 e MOTO-08, com as leituras na observação.</p></div>
    <button class="btn btn-primary btn-block" data-action="go" data-view="resumo">Ver resumo →</button>`;
    return;
  }
  const pz = S.cur.pintura.pecas;
  const pc = calcPintura(S.cur.pintura);
  let h = `<div class="view-head"><div><h1 id="h-pintura">Mapa de pintura</h1><p>Até 5 leituras por peça, em µm. Toque numa peça do desenho para ir até ela.</p></div></div>
  <div class="card card-warn" role="note" style="font-size:.85rem"><b>Orientativo.</b> A espessura de fábrica varia por fabricante, modelo, cor e processo. O semáforo compara as peças do próprio veículo; a conclusão sobre repintura é sua, confirmada pela inspeção visual (CAR-03 a CAR-07).</div>
  <div class="pnt-wrap"><div class="pnt-map card" id="pnt-map">${svgCarro(S.cur.pintura, { tema: 'app', prefixo: 'a', sel: S.selPeca })}
    <div class="pnt-legend"><span><i class="sw" style="background:#2E9E5B"></i>Compatível (≤ 1,3×)</span><span><i class="sw" style="background:#E0A100"></i>Provável repintura (≤ 2×)</span><span><i class="sw" style="background:#C62828"></i>Massa/reparo (&gt; 2×)</span><span><i class="sw" style="background:#3A4655"></i>sem leitura</span></div>
    <p class="muted" style="font-size:.75rem;text-align:center;margin:6px 0 0">Vista superior · frente para cima · E/D = lado do motorista/passageiro</p></div>
  <div>
  <div class="card"><div class="ref-box">
    <div><span class="lbl">Referência usada</span><div class="kpi" id="ref-kpi">${pc.ref ? Math.round(pc.ref) : '—'} <small>µm</small></div><small id="ref-orig">${pc.manual ? 'definida por você' : pc.refAuto ? `mediana de ${pc.nMedidas} peça(s)` : 'meça ao menos 3 peças'}</small></div>
    <label class="field" style="margin:0"><span>Definir referência (µm)</span><input type="number" inputmode="numeric" min="0" data-ref value="${esc(S.cur.pintura.ref || '')}" placeholder="auto"></label>
  </div>${pc.nMedidas > 0 && pc.nMedidas < 5 && !pc.manual ? '<p class="muted" style="font-size:.78rem;margin:8px 0 0">Com poucas peças medidas a mediana é pouco confiável; meça o veículo todo.</p>' : ''}</div>`;
  for (const p of PECAS) {
    const l = pz[p.id] || [];
    if (p.plastico) {
      h += `<div class="card peca plastico" id="pc-${p.id}"><div class="peca-head"><strong>${esc(p.nome)}</strong><span class="peca-res vazio">Plástico — não medir</span></div><div class="peca-foot"><span>Medidor de camada para substrato metálico não lê plástico. Avalie visualmente (CAR-08).</span></div></div>`;
      continue;
    }
    h += `<div class="card peca" id="pc-${p.id}"><div class="peca-head"><strong id="pn-${p.id}">${esc(p.nome)}</strong>${pecaBadge(p.id, pc)}</div>
      <div class="leituras" role="group" aria-labelledby="pn-${p.id}">${[0, 1, 2, 3, 4].map(i => `<input type="number" inputmode="numeric" min="0" max="5000" step="1" data-leit="${p.id}:${i}" value="${l[i] != null && l[i] !== '' ? esc(l[i]) : ''}" aria-label="${esc(p.nome)}: leitura ${i + 1}" placeholder="${i + 1}">`).join('')}</div>
      <div class="peca-foot" id="pf-${p.id}">${pecaFoot(p.id, pc)}</div></div>`;
  }
  h += `<button class="btn btn-primary btn-block" data-action="go" data-view="resumo">Ver resumo →</button></div></div>`;
  el.innerHTML = h;
}
function pecaBadge(id, pc) { const st = pc.status[id]; return `<span class="peca-res ${st}" id="pb-${id}">${SEMAFORO[st].txt}</span>`; }
function pecaFoot(id, pc) {
  const m = pc.medias[id];
  if (m == null) return '<span>Média: —</span>';
  return `<span>Média: <b class="mono">${Math.round(m)} µm</b></span><span>${pc.ref ? (m / pc.ref).toFixed(2).replace('.', ',') + '× ref.' : ''}</span>`;
}
function refreshPintura() {
  const pc = calcPintura(S.cur.pintura);
  for (const p of PECAS) {
    if (p.plastico) continue;
    const b = $('#pb-' + p.id); if (b) b.outerHTML = pecaBadge(p.id, pc);
    const f = $('#pf-' + p.id); if (f) f.innerHTML = pecaFoot(p.id, pc);
  }
  const k = $('#ref-kpi'); if (k) k.innerHTML = `${pc.ref ? Math.round(pc.ref) : '—'} <small>µm</small>`;
  const o = $('#ref-orig'); if (o) o.textContent = pc.manual ? 'definida por você' : pc.refAuto ? `mediana de ${pc.nMedidas} peça(s)` : 'meça ao menos 3 peças';
  const map = $('#pnt-map svg'); if (map) map.outerHTML = svgCarro(S.cur.pintura, { tema: 'app', prefixo: 'a', sel: S.selPeca });
}

/* ------------------------------ Tela: resumo ------------------------------ */
function renderResumo() {
  const v = S.cur; const c = contagem(v); const pend = pendentes(v); const cls = classificar(v);
  let h = `<div class="view-head"><div><h1 id="h-resumo">Resumo</h1><p>${c.total - c.pend} de ${c.total} itens respondidos</p></div></div>`;
  h += `<div class="cls-box ${cls.css}" role="status"><div class="cls-lbl">${pend.length ? 'Classificação parcial' : 'Classificação automática'}</div><div class="cls-val" id="cls-val">${cls.id}</div><p class="cls-why">${esc(cls.motivo)}</p></div>`;
  h += `<div class="card"><div class="counts">`;
  for (const n of ['N0', 'N1', 'N2', 'N3', 'N4']) h += `<div class="count" style="--c:${COR[n]}"><b>${c[n]}</b><span>${n}</span></div>`;
  h += `<div class="count" style="--c:${COR.NV}"><b>${c.NV}</b><span>Não verif.</span></div><div class="count" style="--c:${COR.NA}"><b>${c.NA}</b><span>N/A</span></div><div class="count" style="--c:${c.pend ? '#E0661B' : COR.N0}"><b>${c.pend}</b><span>Pendentes</span></div>`;
  h += `</div><p class="muted" style="font-size:.78rem;margin:10px 0 0">Matriz: não verificável → INCONCLUSIVO; N4 → REPROVADO; N2/N3 → APROVADO COM APONTAMENTOS; só N0/N1 → APROVADO. “Aprovado” classifica o exame visual naquele momento; não aprova a compra nem garante o veículo.</p></div>`;

  if (pend.length) {
    h += `<div class="card card-warn"><h2>Faltam ${pend.length} item(ns)</h2><p style="font-size:.88rem">O laudo só pode ser emitido com todos os itens respondidos (use N/A quando não se aplicar).</p><ul class="pend-list">`;
    for (const i of pend.slice(0, 40)) h += `<li><button data-action="ir-item" data-item="${i.id}">${esc(i.id)} — ${esc(i.item)}</button></li>`;
    if (pend.length > 40) h += `<li>… e mais ${pend.length - 40}</li>`;
    h += `</ul></div>`;
  }
  const achados = itensDo(v.tipo).filter(i => ['N4', 'NV', 'N3', 'N2'].includes(nivelDe(v, i.id)))
    .sort((a, b) => ['NV', 'N4', 'N3', 'N2'].indexOf(nivelDe(v, a.id)) - ['NV', 'N4', 'N3', 'N2'].indexOf(nivelDe(v, b.id)));
  h += `<div class="card"><h2>Achados N2, N3, N4${c.NV ? ' e não verificáveis' : ''}</h2>`;
  if (!achados.length) h += `<p class="muted" style="margin:0">Nenhum apontamento até aqui.</p>`;
  const semObs = [];
  for (const i of achados) {
    const r = v.respostas[i.id]; if (!(r.obs || '').trim()) semObs.push(i.id);
    h += `<div class="find"><span class="lvl ${r.nivel}" style="--c:${COR[r.nivel]}">${r.nivel === 'NV' ? 'N/V' : r.nivel}</span><button class="t" style="background:none;border:0;color:inherit;text-align:left;padding:0;cursor:pointer;font:inherit;font-weight:600" data-action="ir-item" data-item="${i.id}">${esc(i.id)} — ${esc(i.item)}</button><span class="o">${r.obs ? esc(r.obs) : '<i>sem observação</i>'}</span></div>`;
  }
  if (semObs.length) h += `<p style="font-size:.82rem;color:var(--danger-text);margin:8px 0 0">Recomendado descrever o achado em: ${semObs.join(', ')}.</p>`;
  h += `</div>`;
  const pc = calcPintura(v.pintura);
  if (v.tipo !== 'moto' && pc.nMedidas) {
    const alt = PECAS.filter(p => ['amarelo', 'vermelho'].includes(pc.status[p.id]));
    h += `<div class="card"><h2>Pintura (orientativo)</h2><p style="font-size:.88rem;margin:0">${pc.nMedidas} peça(s) medida(s), referência ${Math.round(pc.ref)} µm. ${alt.length ? `Acima da referência: ${alt.map(p => `${esc(p.nome)} (${SEMAFORO[pc.status[p.id]].txt.toLowerCase()})`).join('; ')}. Confira se estão refletidas no sistema CAR.` : 'Nenhuma peça acima de 1,3× a referência.'}</p></div>`;
  }
  h += `<div class="card"><h2><label for="parecer">Parecer do vistoriador (opcional)</label></h2><textarea id="parecer" data-bind="parecer" rows="5" placeholder="Considerações finais, recomendações (ex.: orientar verificação oficial, revisão de freios)…">${esc(v.parecer || '')}</textarea></div>`;
  h += `<button class="btn btn-primary btn-block" data-action="go" data-view="laudo" ${pend.length ? 'aria-describedby="h-resumo"' : ''}>${pend.length ? 'Ver o que falta para o laudo' : 'Emitir laudo →'}</button>`;
  $('#view-resumo').innerHTML = h;
}

/* ------------------------------ Tela: laudo ------------------------------ */
function bloqueiosLaudo() {
  const b = [];
  const pend = pendentes(S.cur);
  if (pend.length) b.push(`${pend.length} item(ns) do roteiro sem resposta: ${pend.slice(0, 12).map(i => i.id).join(', ')}${pend.length > 12 ? '…' : ''}`);
  if (!S.cur.veiculo.placa && !S.cur.veiculo.chassi) b.push('Informe a placa ou o chassi do veículo.');
  if (!S.cfg.nome) b.push('Preencha o nome do vistoriador/empresa na configuração.');
  return b;
}
function renderLaudo() {
  const el = $('#view-laudo');
  const b = bloqueiosLaudo();
  if (b.length) {
    el.innerHTML = `<div class="view-head"><div><h1 id="h-laudo">Laudo</h1><p>Emissão bloqueada até completar a vistoria.</p></div></div>
    <div class="card card-danger" role="alert"><h2>Falta completar</h2><ul class="pend-list">${b.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="btn-row"><button class="btn btn-primary" data-action="go" data-view="resumo">Ver pendências no resumo</button>${!S.cfg.nome ? '<button class="btn" data-action="go" data-view="config">Configuração</button>' : ''}</div>`;
    return;
  }
  el.innerHTML = `<div class="view-head"><div><h1 id="h-laudo">Laudo nº ${esc(S.cur.numero)}</h1><p>Confira a prévia. Para gerar o PDF: Imprimir → “Salvar como PDF”.</p></div></div>
  <div class="card laudo-tools">
    <label class="check"><input type="checkbox" data-lopt="todos" ${S.laudoTodos ? 'checked' : ''}> <span>Listar todos os itens (inclusive N0)</span></label>
    <label class="check"><input type="checkbox" data-lopt="fotos" ${S.laudoFotos ? 'checked' : ''}> <span>Incluir fotos (${S.fotos.length})</span></label>
    <button class="btn btn-primary btn-block" data-action="imprimir" style="margin-top:6px"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/></svg>Imprimir / Salvar PDF</button>
    <p class="muted" style="font-size:.78rem;margin:8px 0 0">Android (Chrome): menu ⋮ → Compartilhar → Imprimir, ou o botão acima. iPhone: botão acima → nas opções de impressão, afaste dois dedos sobre a prévia e compartilhe/salve como PDF.</p>
  </div>
  <div class="paper-scroll"><div class="paper" id="paper">${laudoHTML(S.cur, S.cfg, S.fotos, { listarTodos: S.laudoTodos, fotos: S.laudoFotos })}</div></div>`;
}
async function imprimir() {
  S.cur.emitidoEm = new Date().toISOString();
  await salvarCur(true);
  $('#paper').innerHTML = laudoHTML(S.cur, S.cfg, S.fotos, { listarTodos: S.laudoTodos, fotos: S.laudoFotos });
  const t = document.title;
  document.title = `Laudo ${S.cur.numero} ${(S.cur.veiculo.placa || '').toUpperCase()}`.trim();
  const imgs = $$('#paper img');
  await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
  setTimeout(() => { window.print(); setTimeout(() => { document.title = t; }, 500); }, 60);
}

const RENDER = { config: renderConfig, lista: renderLista, vistoria: renderVistoria, roteiro: renderRoteiro, pintura: renderPintura, resumo: renderResumo, laudo: renderLaudo };

/* ------------------------------ Exportar / importar ------------------------------ */
function baixar(nome, texto) {
  const blob = new Blob([texto], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportar(id) {
  const v = await DB.get('vistorias', id); const fotos = await DB.fotosDa(id);
  const pkg = { formato: 'painel-vistoria', versao: 1, exportadoEm: new Date().toISOString(), vistorias: [v], fotos };
  baixar(`vistoria-${(v.veiculo.placa || 'sem-placa').toUpperCase()}-${v.numero}.json`, JSON.stringify(pkg));
  toast('Arquivo exportado');
}
async function backupTudo() {
  const vistorias = await DB.all('vistorias'); const fotos = await DB.all('fotos');
  const pkg = { formato: 'painel-vistoria', versao: 1, exportadoEm: new Date().toISOString(), config: S.cfg, vistorias, fotos };
  baixar(`backup-painel-vistoria-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(pkg));
  toast(`Backup: ${vistorias.length} vistoria(s), ${fotos.length} foto(s)`);
}
async function importarArquivo(file) {
  let pkg;
  try { pkg = JSON.parse(await file.text()); } catch (e) { toast('Arquivo inválido'); return; }
  if (!pkg || pkg.formato !== 'painel-vistoria' || !Array.isArray(pkg.vistorias)) { toast('Este arquivo não é uma exportação do Painel de Vistoria'); return; }
  let n = 0;
  for (const v of pkg.vistorias) {
    if (!v || !v.id || !v.respostas) continue;
    const existe = await DB.get('vistorias', v.id);
    if (existe && !confirm(`A vistoria ${v.numero} (${v.veiculo && v.veiculo.placa || 'sem placa'}) já existe neste aparelho. Substituir pela versão do arquivo?`)) continue;
    if (existe) await DB.delFotosDa(v.id);
    await DB.put('vistorias', v);
    for (const f of (pkg.fotos || []).filter(f => f.vistoriaId === v.id && typeof f.data === 'string' && f.data.startsWith('data:image/'))) await DB.put('fotos', f);
    n++;
  }
  if (pkg.config && confirm('O arquivo contém a configuração do vistoriador (nome, logo, textos). Substituir a configuração atual?')) {
    const seq = Math.max(S.cfg.seq || 0, pkg.config.seq || 0);
    S.cfg = { ...cfgPadrao(), ...pkg.config, id: 'cfg', seq }; await salvarCfg(); aplicarTema();
  }
  toast(`${n} vistoria(s) importada(s)`);
  if (S.cur) { const a = await DB.get('vistorias', S.cur.id); if (a) { S.cur = a; S.fotos = await DB.fotosDa(a.id); } }
  go('lista');
}

function autoAltura(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 360) + 'px'; }
function ajustarTextareas(root = document) { $$('textarea[data-obs], textarea#parecer', root).forEach(t => { if (t.value) autoAltura(t); }); }

/* ------------------------------ Tema ------------------------------ */
function aplicarTema() {
  const t = S.cfg && S.cfg.tema === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = '#0F1318';
}

/* ------------------------------ Eventos ------------------------------ */
function setPath(obj, path, value) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {}; o[ks[ks.length - 1]] = value; }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  const pc = e.target.closest('.pnt-map [data-peca]');
  if (pc && !b) {
    S.selPeca = pc.dataset.peca;
    const card = $('#pc-' + S.selPeca);
    refreshPintura();
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); const inp = card.querySelector('input'); if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 350); }
    return;
  }
  if (!b) return;
  const a = b.dataset.action;
  switch (a) {
    case 'go': go(b.dataset.view); break;
    case 'theme': S.cfg.tema = S.cfg.tema === 'light' ? 'dark' : 'light'; aplicarTema(); salvarCfg(); if (S.view === 'config') renderConfig(); break;
    case 'nova': {
      S.cur = novaVistoriaObj(); S.fotos = []; S.sys = null; S.selPeca = null;
      S.cfg.ultimaVistoria = S.cur.id; await salvarCfg(); await salvarCur(true);
      go('vistoria'); toast(`Vistoria nº ${S.cur.numero} criada`);
      const pl = $('[data-bind="veiculo.placa"]'); if (pl) pl.focus();
      break;
    }
    case 'abrir': await abrirVistoria(b.dataset.id); break;
    case 'duplicar': {
      const o = await DB.get('vistorias', b.dataset.id); if (!o) break;
      const n = novaVistoriaObj();
      const copia = { ...JSON.parse(JSON.stringify(o)), id: n.id, numero: n.numero, criadoEm: n.criadoEm, atualizadoEm: n.atualizadoEm, dataHora: n.dataHora, emitidoEm: null };
      await salvarCfg(); await DB.put('vistorias', copia);
      toast(`Cópia criada: nº ${n.numero} (sem fotos)`); renderLista(); break;
    }
    case 'excluir': {
      const o = await DB.get('vistorias', b.dataset.id); if (!o) break;
      if (!confirm(`Excluir a vistoria nº ${o.numero} (${(o.veiculo.placa || 'sem placa').toUpperCase()}) e todas as suas fotos? Esta ação não pode ser desfeita.`)) break;
      await DB.delFotosDa(o.id); await DB.del('vistorias', o.id);
      if (S.cur && S.cur.id === o.id) { S.cur = null; S.fotos = []; }
      toast('Vistoria excluída'); go('lista'); break;
    }
    case 'exportar': await exportar(b.dataset.id); break;
    case 'backup': await backupTudo(); break;
    case 'importar': $('#file-import').click(); break;
    case 'logo': $('#file-logo').click(); break;
    case 'logo-del': S.cfg.logo = null; await salvarCfg(); renderConfig(); break;
    case 'limites-padrao': if (confirm('Substituir o texto atual pelo texto padrão?')) { S.cfg.limites = LIMITES_PADRAO; await salvarCfg(); renderConfig(); } break;
    case 'cfg-ok':
      if (!S.cfg.nome.trim()) { toast('Informe ao menos o nome'); $('[data-cfg="nome"]').focus(); break; }
      S.primeiraVez = false; await salvarCfg(); go('lista'); break;
    case 'tipo': S.cur.tipo = b.dataset.tipo; S.sys = null; salvarCur(); renderVistoria(); break;
    case 'sys': S.sys = b.dataset.sys; renderRoteiro(); window.scrollTo(0, 0); break;
    case 'sys-nav': {
      const gs = roteiro(S.cur.tipo); const i = gs.findIndex(g => g.id === S.sys) + Number(b.dataset.d);
      if (gs[i]) { S.sys = gs[i].id; renderRoteiro(); window.scrollTo(0, 0); }
      break;
    }
    case 'nivel': {
      const id = b.dataset.item; const v = b.dataset.v;
      const r = S.cur.respostas[id] = S.cur.respostas[id] || {};
      r.nivel = r.nivel === v ? null : v;
      if (!r.nivel) delete r.nivel;
      salvarCur(); refreshItem(id);
      const nb = $(`#it-${id} .lvb[data-v="${v}"]`); if (nb) nb.focus({ preventScroll: true });
      break;
    }
    case 'restante-n0': {
      const g = roteiro(S.cur.tipo).find(x => x.id === b.dataset.sys);
      const falt = g.itens.filter(i => !nivelDe(S.cur, i.id));
      if (!confirm(`Marcar ${falt.length} item(ns) restante(s) de ${g.id} como N0 (conforme)? Faça isso só se você realmente verificou cada um.`)) break;
      for (const i of falt) (S.cur.respostas[i.id] = S.cur.respostas[i.id] || {}).nivel = 'N0';
      salvarCur(); renderRoteiro(); break;
    }
    case 'obs': {
      const id = b.dataset.item; const r = S.cur.respostas[id] = S.cur.respostas[id] || {};
      r.showObs = !r.showObs || false; refreshItem(id);
      const t = $('#obs-' + id); if (t) t.focus();
      break;
    }
    case 'foto': S.fotoItem = b.dataset.item; $(b.dataset.src === 'camera' ? '#file-camera' : '#file-galeria').click(); break;
    case 'foto-del': {
      if (!confirm('Excluir esta foto?')) break;
      const f = S.fotos.find(x => x.id === b.dataset.foto); if (!f) break;
      await DB.del('fotos', f.id); S.fotos = S.fotos.filter(x => x.id !== f.id); refreshItem(f.itemId); break;
    }
    case 'ir-item': {
      const it = ITEM_INDEX[b.dataset.item];
      const g = roteiro(S.cur.tipo).find(x => x.itens.some(i => i.id === it.id));
      S.sys = g.id; go('roteiro');
      const el = $('#it-' + it.id); if (el) { el.scrollIntoView({ block: 'center' }); const f = el.querySelector('.lvb'); if (f) f.focus({ preventScroll: true }); }
      break;
    }
    case 'imprimir': await imprimir(); break;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.cfg) {
    const k = t.dataset.cfg;
    if (k === 'temaClaro') { S.cfg.tema = t.checked ? 'light' : 'dark'; aplicarTema(); }
    else S.cfg[k] = t.type === 'checkbox' ? t.checked : t.value;
    clearTimeout(t._t); t._t = setTimeout(salvarCfg, 300); return;
  }
  if (!S.cur) return;
  if (t.dataset.bind) {
    let val = t.value;
    if (t.dataset.bind === 'dataHora') val = localParaISO(val);
    if (t.dataset.bind === 'veiculo.placa' || t.dataset.bind === 'veiculo.chassi') { val = val.toUpperCase().replace(/[^A-Z0-9-]/g, ''); }
    if (t.dataset.bind === 'veiculo.chassi') { const hnt = $('#vin-hint'); if (hnt) hnt.textContent = vinHint(val); }
    setPath(S.cur, t.dataset.bind, val); salvarCur(); return;
  }
  if (t.tagName === 'TEXTAREA') autoAltura(t);
  if (t.dataset.obs) { const r = S.cur.respostas[t.dataset.obs] = S.cur.respostas[t.dataset.obs] || {}; r.obs = t.value; salvarCur(); return; }
  if (t.dataset.leit) {
    const [pid, i] = t.dataset.leit.split(':');
    const arr = S.cur.pintura.pecas[pid] = S.cur.pintura.pecas[pid] || ['', '', '', '', ''];
    arr[Number(i)] = t.value === '' ? '' : Number(t.value);
    S.selPeca = pid; salvarCur(); refreshPintura(); return;
  }
  if (t.hasAttribute('data-ref')) { S.cur.pintura.ref = t.value === '' ? '' : Number(t.value); salvarCur(); refreshPintura(); return; }
  if (t.dataset.lopt) {
    if (t.dataset.lopt === 'todos') S.laudoTodos = t.checked; else S.laudoFotos = t.checked;
    $('#paper').innerHTML = laudoHTML(S.cur, S.cfg, S.fotos, { listarTodos: S.laudoTodos, fotos: S.laudoFotos });
  }
});
document.addEventListener('change', (e) => { if (e.target.type === 'checkbox') e.target.dispatchEvent(new Event('input', { bubbles: true })); }, true);

$('#file-camera').addEventListener('change', async (e) => { const fs = [...e.target.files]; e.target.value = ''; await adicionarFotos(fs); });
$('#file-galeria').addEventListener('change', async (e) => { const fs = [...e.target.files]; e.target.value = ''; await adicionarFotos(fs); });
$('#file-import').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await importarArquivo(f); });
$('#file-logo').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const png = /png|svg|gif|webp/.test(f.type);
    S.cfg.logo = await comprimir(f, 480, 0.85, png ? 'image/png' : 'image/jpeg');
    await salvarCfg(); renderConfig(); toast('Logo atualizado');
  } catch (err) { toast('Não foi possível ler a imagem'); }
});
window.addEventListener('beforeprint', () => { if (S.view !== 'laudo' && S.cur && !bloqueiosLaudo().length) go('laudo'); });

/* ------------------------------ Início ------------------------------ */
(async function init() {
  await DB.init();
  S.cfg = { ...cfgPadrao(), ...((await DB.get('config', 'cfg')) || {}) };
  aplicarTema();
  if (!S.cfg.nome) { S.primeiraVez = true; go('config'); }
  else {
    if (S.cfg.ultimaVistoria) { const v = await DB.get('vistorias', S.cfg.ultimaVistoria); if (v) { S.cur = v; S.fotos = await DB.fotosDa(v.id); } }
    go(S.cur ? 'vistoria' : 'lista');
  }
  if (DB.mode === 'memoria') toast('Atenção: armazenamento indisponível — os dados serão perdidos ao fechar.');
  window.__painel = { S, DB, classificar, calcPintura, contagem, pendentes, go };
})();
