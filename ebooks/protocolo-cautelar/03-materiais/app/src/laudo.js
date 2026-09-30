/* Painel de Vistoria — montagem do laudo (HTML para impressão A4).
 * O laudo é do vistoriador: nenhuma marca do produto aparece, salvo o rodapé opcional (desligado por padrão). */
const LAUDO_RODAPE_PRODUTO = 'Roteiro de vistoria: Protocolo Cautelar';

function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtKm(km) {
  const n = Number(String(km || '').replace(/\D/g, ''));
  return km ? n.toLocaleString('pt-BR') + ' km' : '—';
}
function val(x) { return x ? esc(x) : '—'; }

function laudoHTML(v, cfg, fotos, opts = {}) {
  const listarTodos = !!opts.listarTodos;
  const comFotos = opts.fotos !== false;
  const cls = classificar(v);
  const c = contagem(v);
  const ve = v.veiculo || {};
  const grupos = roteiro(v.tipo);
  let h = `<article class="laudo" aria-label="Laudo de vistoria">`;

  /* Cabeçalho */
  h += `<header class="l-head"><div class="l-emp">`;
  if (cfg.logo) h += `<img src="${cfg.logo}" alt="Logo de ${esc(cfg.nome || 'vistoriador')}">`;
  h += `<div><strong>${val(cfg.nome)}</strong>`;
  if (cfg.doc) h += `<span>${esc(cfg.doc)}</span>`;
  if (cfg.contato) h += `<span>${esc(cfg.contato)}</span>`;
  h += `</div></div><div class="l-num"><div class="t">LAUDO DE VISTORIA CAUTELAR</div>`;
  h += `<div class="n">Nº ${esc(v.numero)}</div><div class="d">Vistoria: ${fmtDataHora(v.dataHora)}</div></div></header>`;

  /* Dados */
  h += `<h2 class="l-sec">Veículo e solicitação</h2><div class="l-grid">`;
  const cel = (k, x, cls2) => `<div${cls2 ? ` class="${cls2}"` : ''}><span class="k">${k}</span><span class="v">${x}</span></div>`;
  h += cel('Placa', `<span class="mono">${val((ve.placa || '').toUpperCase())}</span>`);
  h += cel('Tipo', esc(TIPOS[v.tipo] || v.tipo));
  h += cel('Marca / modelo', val(ve.marcaModelo), 'wide2');
  h += cel('Ano fab. / mod.', `${val(ve.anoFab)} / ${val(ve.anoMod)}`);
  h += cel('Cor', val(ve.cor));
  h += cel('Hodômetro', ve.km ? fmtKm(ve.km) : '—');
  h += cel('Combustível', val(ve.combustivel));
  h += cel('Chassi (VIN)', `<span class="mono">${val((ve.chassi || '').toUpperCase())}</span>`, 'wide2');
  h += cel('RENAVAM', `<span class="mono">${val(ve.renavam)}</span>`, 'wide2');
  h += cel('Solicitante', val(v.solicitante), 'wide2');
  h += cel('Local da vistoria', val(v.local), 'wide2');
  h += `</div>`;

  /* Resultado */
  h += `<section class="l-cls ${cls.css}"><div><div class="lab">Resultado do exame</div><div class="val">${cls.id}</div></div>`;
  h += `<div><div class="why">${esc(cls.motivo)}</div><div class="l-counts" style="margin-top:6px">`;
  for (const n of ['N0', 'N1', 'N2', 'N3', 'N4']) h += `<span>${n}: ${c[n]}</span>`;
  if (c.NV) h += `<span>Não verif.: ${c.NV}</span>`;
  h += `<span>N/A: ${c.NA}</span></div></div></section>`;
  h += `<p class="l-note">A classificação refere-se ao resultado do exame técnico visual no momento da vistoria; não aprova a compra, não garante o veículo e não substitui a vistoria oficial.</p>`;

  if (v.parecer && v.parecer.trim()) {
    h += `<h2 class="l-sec">Parecer do vistoriador</h2><div class="l-parecer">${esc(v.parecer.trim())}</div>`;
  }

  /* Achados por sistema */
  h += `<h2 class="l-sec">Achados por sistema</h2>`;
  h += `<table class="l-tab"><thead><tr><th style="width:62px">Item</th><th>Verificação / observação</th><th style="width:48px">Nível</th></tr></thead><tbody>`;
  for (const g of grupos) {
    const cont = { N0: 0, N1: 0, N2: 0, N3: 0, N4: 0, NA: 0, NV: 0 };
    for (const it of g.itens) { const n = nivelDe(v, it.id); if (n) cont[n]++; }
    const resumo = ['N0', 'N1', 'N2', 'N3', 'N4', 'NV', 'NA'].filter(k => cont[k]).map(k => `${k === 'NA' ? 'N/A' : k === 'NV' ? 'Não verif.' : k}: ${cont[k]}`).join(' · ');
    h += `<tr class="sys-row"><td colspan="3">${esc(g.id)} — ${esc(g.nome)}<span class="sp">${resumo}</span></td></tr>`;
    let mostrados = 0;
    const na = [];
    for (const it of g.itens) {
      const r = (v.respostas || {})[it.id] || {};
      const n = r.nivel;
      if (n === 'NA') { na.push(it.id); if (!listarTodos) continue; }
      if (!listarTodos && n === 'N0' && !(r.obs && r.obs.trim())) continue;
      mostrados++;
      h += `<tr><td class="id">${esc(it.id)}</td><td>${esc(it.item)}${r.obs && r.obs.trim() ? `<span class="obs">${esc(r.obs.trim())}</span>` : ''}</td>`;
      h += `<td><span class="lchip ${n || ''}">${n ? (n === 'NA' ? 'N/A' : n === 'NV' ? 'N/V' : n) : '—'}</span></td></tr>`;
    }
    if (!listarTodos && !mostrados) {
      h += `<tr><td></td><td class="l-empty" colspan="2">${cont.N0 ? 'Itens verificados sem anormalidade observável (N0).' : 'Sem itens aplicáveis.'}${na.length ? ` Não se aplica: ${na.join(', ')}.` : ''}</td></tr>`;
    } else if (!listarTodos && na.length) {
      h += `<tr><td></td><td class="l-empty" colspan="2">Demais itens: N0.${na.length ? ` Não se aplica: ${na.join(', ')}.` : ''}</td></tr>`;
    }
  }
  h += `</tbody></table>`;
  h += `<p class="l-note"><b>Níveis:</b> N0 Conforme · N1 Observação · N2 Apontamento · N3 Apontamento relevante · N4 Crítico · N/V Não verificável · N/A Não se aplica.${listarTodos ? '' : ' Itens N0 sem observação não são listados individualmente.'}</p>`;

  /* Pintura */
  const temLeitura = v.tipo !== 'moto' && v.pintura && PECAS.some(p => leiturasValidas((v.pintura.pecas || {})[p.id]).length);
  if (temLeitura) {
    const pc = calcPintura(v.pintura);
    h += `<h2 class="l-sec">Mapa de espessura de pintura</h2><div class="l-pnt"><div>${svgCarro(v.pintura, { tema: 'papel', prefixo: 'l' })}</div><div>`;
    h += `<table class="l-tab"><thead><tr><th>Peça</th><th>Leituras <span class="nc">(µm)</span></th><th>Média</th><th>Indicação</th></tr></thead><tbody>`;
    for (const p of PECAS) {
      const l = leiturasValidas((v.pintura.pecas || {})[p.id]);
      if (p.plastico) { h += `<tr><td>${esc(p.nome)}</td><td colspan="3" class="l-empty">Plástico — não medido</td></tr>`; continue; }
      if (!l.length) { h += `<tr><td>${esc(p.nome)}</td><td colspan="3" class="l-empty">Sem leitura</td></tr>`; continue; }
      const st = pc.status[p.id];
      h += `<tr><td>${esc(p.nome)}</td><td class="leit">${l.join(', ')}</td><td class="mono">${Math.round(pc.medias[p.id])}</td><td><span class="lchip wrap" style="background:${SEMAFORO[st].cor};${st === 'amarelo' ? 'color:#1A1F26' : ''}">${SEMAFORO[st].txt}</span></td></tr>`;
    }
    h += `</tbody></table>`;
    h += `<p class="l-note">Referência: <b>${pc.ref ? Math.round(pc.ref) + ' µm' : '—'}</b> (${pc.manual ? 'definida pelo vistoriador' : 'mediana das médias das peças medidas'}). Critério: até 1,3× a referência = compatível; até 2× = provável repintura; acima de 2× = provável repintura com massa/reparo. Valores orientativos: a espessura de fábrica varia por fabricante, modelo, cor e processo; a indicação não substitui a inspeção visual da peça.</p>`;
    h += `</div></div>`;
  }

  /* Fotos */
  if (comFotos && fotos && fotos.length) {
    const ordem = itensDo(v.tipo).map(i => i.id);
    const fs = [...fotos].sort((a, b) => (ordem.indexOf(a.itemId) - ordem.indexOf(b.itemId)) || String(a.criadoEm).localeCompare(String(b.criadoEm)));
    h += `<h2 class="l-sec">Registro fotográfico (${fs.length})</h2><div class="l-fotos">`;
    fs.forEach((f, idx) => {
      const it = ITEM_INDEX[f.itemId] || { item: f.itemId };
      const n = nivelDe(v, f.itemId);
      h += `<figure><img src="${f.data}" alt="Foto ${idx + 1}: ${esc(it.item)}"><figcaption><b>${idx + 1}. ${esc(f.itemId)}</b> ${esc(it.item)}${n ? ` (${n === 'NA' ? 'N/A' : n})` : ''}</figcaption></figure>`;
    });
    h += `</div>`;
  }

  /* Limites */
  h += `<h2 class="l-sec">Limites do exame</h2><div class="l-lim">${esc(cfg.limites || '')}</div>`;

  /* Assinaturas */
  h += `<div class="l-sign"><div><b>${val(cfg.nome)}</b><small>${cfg.doc ? esc(cfg.doc) : 'Vistoriador responsável'}</small></div>`;
  h += `<div><b>${val(v.solicitante)}</b><small>Ciência do solicitante</small></div></div>`;

  h += `<footer class="l-foot"><span>Laudo nº ${esc(v.numero)} · emitido em ${fmtDataHora(v.emitidoEm || new Date().toISOString())}</span>`;
  h += `<span>${cfg.rodape ? LAUDO_RODAPE_PRODUTO : ''}</span></footer>`;
  h += `</article>`;
  return h;
}
