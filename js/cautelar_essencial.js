/* ============================================================================
   CAUTELAR ESSENCIAL — Laudo cautelar próprio da Certive Vistorias
   ----------------------------------------------------------------------------
   Nível ESSENCIAL. Arquitetura já preparada para os níveis AVANÇADO e ABSOLUTO:
   todo dado carrega o campo `nivel` e ramifica a partir dele; novos blocos/pontos
   podem ser habilitados por nível sem tocar no código do Essencial.

   Este arquivo é AUTOCONTIDO e OFFLINE (sem dependência de banco). Ele reúne:
     - as constantes de todos os pontos de inspeção (fonte única de verdade);
     - o diagrama SVG da pintura (4 vistas, marcadores que recolorem por status);
     - o formulário por blocos e o painel semafórico (5 indicadores);
     - captura de foto por câmera nativa + GPS + timestamp (mesmo padrão do app).

   NÃO altera o módulo de produção existente (app_v8.js). A integração à aba
   "Registro de Cautelar" e a persistência no Supabase acontecem numa fase
   posterior, quando o schema estiver criado e validado.
   ============================================================================ */
(function (global) {
  'use strict';

  /* ==========================================================================
     1. NÍVEIS E ESCALAS DE STATUS
     ========================================================================== */

  const CE_NIVEIS = [
    { codigo: 'ESSENCIAL', nome: 'Essencial', disponivel: true },
    { codigo: 'AVANCADO',  nome: 'Avançado',  disponivel: false },
    { codigo: 'ABSOLUTO',  nome: 'Absoluto',  disponivel: false },
  ];

  // Escalas — a ordem define a apresentação nos seletores.
  const CE_ESCALA_ESTRUTURA = ['OK', 'Amassado', 'Reparado', 'Substituído', 'Soldado', 'Não Aplicável'];
  const CE_ESCALA_PINTURA   = ['Pintura original', 'Pequenos riscos/Amassado', 'Repintura', 'Repintura com massa', 'Avariado', 'Não aplicável'];
  const CE_ESCALA_ETIQUETA  = ['Original', 'Adulterada', 'Ausente'];
  const CE_ESCALA_VIDRO     = ['Original', 'Substituído', 'Sem gravação'];
  const CE_ESCALA_IDENT     = ['OK', 'Divergente', 'Ilegível', 'Remarcado'];
  const CE_PARECERES        = ['CONFORME', 'CONFORME COM APONTAMENTO', 'NÃO CONFORME'];

  /* ==========================================================================
     2. PONTOS DE INSPEÇÃO
     ========================================================================== */

  // Bloco 3 — Estrutura (21 pontos), agrupados.
  const CE_ESTRUTURA = [
    // Dianteira (5)
    { codigo: 'long_diant_esq',       nome: 'Longarina dianteira esquerda',              grupo: 'Dianteira' },
    { codigo: 'long_diant_dir',       nome: 'Longarina dianteira direita',               grupo: 'Dianteira' },
    { codigo: 'painel_corta_fogo',    nome: 'Painel corta-fogo',                         grupo: 'Dianteira' },
    { codigo: 'torre_amort_diant_esq',nome: 'Torre do amortecedor dianteiro esquerdo',   grupo: 'Dianteira' },
    { codigo: 'torre_amort_diant_dir',nome: 'Torre do amortecedor dianteiro direito',    grupo: 'Dianteira' },
    // Colunas (6)
    { codigo: 'coluna_diant_esq',     nome: 'Coluna dianteira esquerda',                 grupo: 'Colunas' },
    { codigo: 'coluna_diant_dir',     nome: 'Coluna dianteira direita',                  grupo: 'Colunas' },
    { codigo: 'coluna_central_esq',   nome: 'Coluna central esquerda',                   grupo: 'Colunas' },
    { codigo: 'coluna_central_dir',   nome: 'Coluna central direita',                    grupo: 'Colunas' },
    { codigo: 'coluna_tras_esq',      nome: 'Coluna traseira esquerda',                  grupo: 'Colunas' },
    { codigo: 'coluna_tras_dir',      nome: 'Coluna traseira direita',                   grupo: 'Colunas' },
    // Laterais (2)
    { codigo: 'caixa_ar_esq',         nome: 'Caixa de ar lado esquerdo',                 grupo: 'Laterais' },
    { codigo: 'caixa_ar_dir',         nome: 'Caixa de ar lado direito',                  grupo: 'Laterais' },
    // Traseira (7)
    { codigo: 'long_tras_esq',        nome: 'Longarina traseira esquerda',               grupo: 'Traseira' },
    { codigo: 'long_tras_dir',        nome: 'Longarina traseira direita',                grupo: 'Traseira' },
    { codigo: 'painel_traseiro',      nome: 'Painel traseiro',                           grupo: 'Traseira' },
    { codigo: 'torre_amort_tras_esq', nome: 'Torre do amortecedor traseiro esquerdo',    grupo: 'Traseira' },
    { codigo: 'torre_amort_tras_dir', nome: 'Torre do amortecedor traseiro direito',     grupo: 'Traseira' },
    { codigo: 'painel_tras_assoalho', nome: 'Painel traseiro com assoalho do porta-malas',grupo: 'Traseira' },
    { codigo: 'caixa_estepe',         nome: 'Caixa de estepe',                           grupo: 'Traseira' },
    // Superior (1)
    { codigo: 'estrutura_teto',       nome: 'Estrutura do teto',                         grupo: 'Superior' },
  ];

  // Bloco 4 — Pintura (15 pontos numerados). `vista` liga o ponto ao diagrama SVG.
  const CE_PINTURA = [
    { numero: 1,  codigo: 'capo',                nome: 'Capô',                         vista: 'superior' },
    { numero: 2,  codigo: 'teto',                nome: 'Teto',                         vista: 'superior' },
    { numero: 3,  codigo: 'tampa_pm',            nome: 'Tampa do porta-malas',         vista: 'superior' },
    { numero: 4,  codigo: 'paralama_diant_esq',  nome: 'Paralama dianteiro esquerdo',  vista: 'lateral_esq' },
    { numero: 5,  codigo: 'porta_diant_esq',     nome: 'Porta dianteira esquerda',     vista: 'lateral_esq' },
    { numero: 6,  codigo: 'porta_tras_esq',      nome: 'Porta traseira esquerda',      vista: 'lateral_esq' },
    { numero: 7,  codigo: 'paralama_tras_esq',   nome: 'Paralama traseiro esquerdo',   vista: 'lateral_esq' },
    { numero: 8,  codigo: 'traseira_esq',        nome: 'Traseira esquerda',            vista: 'frontal_tras' },
    { numero: 9,  codigo: 'paralama_tras_dir',   nome: 'Paralama traseiro direito',    vista: 'lateral_dir' },
    { numero: 10, codigo: 'traseira_dir',        nome: 'Traseira direita',             vista: 'frontal_tras' },
    { numero: 11, codigo: 'porta_tras_dir',      nome: 'Porta traseira direita',       vista: 'lateral_dir' },
    { numero: 12, codigo: 'porta_diant_dir',     nome: 'Porta dianteira direita',      vista: 'lateral_dir' },
    { numero: 13, codigo: 'paralama_diant_dir',  nome: 'Paralama dianteiro direito',   vista: 'lateral_dir' },
    { numero: 14, codigo: 'parachoque_diant',    nome: 'Para-choque dianteiro',        vista: 'frontal_tras' },
    { numero: 15, codigo: 'parachoque_tras',     nome: 'Para-choque traseiro',         vista: 'frontal_tras' },
  ];

  // Bloco 5 — Etiquetas (2)
  const CE_ETIQUETAS = [
    { codigo: 'etiq_motor',      nome: 'Etiqueta do compartimento do motor' },
    { codigo: 'etiq_coluna_dir', nome: 'Etiqueta da coluna lado direito' },
  ];

  // Bloco 6 — Vidros (6). Dois atributos por ponto: condição + chassi gravado (bool).
  const CE_VIDROS = [
    { codigo: 'parabrisa',             nome: 'Para-brisa' },
    { codigo: 'vidro_porta_diant_esq', nome: 'Porta dianteira esquerda' },
    { codigo: 'vidro_porta_tras_esq',  nome: 'Porta traseira esquerda' },
    { codigo: 'vidro_porta_diant_dir', nome: 'Porta dianteira direita' },
    { codigo: 'vidro_porta_tras_dir',  nome: 'Porta traseira direita' },
    { codigo: 'vidro_traseiro',        nome: 'Vidro traseiro' },
  ];

  // Bloco 7 — Identificação veicular (2 itens)
  const CE_IDENTIFICACAO = [
    { codigo: 'MOTOR',  nome: 'Número do motor' },
    { codigo: 'CHASSI', nome: 'Número do chassi' },
  ];

  // Bloco 8 — Fotos obrigatórias (20). Bloqueiam a finalização quando ausentes.
  const CE_FOTOS = [
    { codigo: 'frente_45_dir',        nome: 'Frente 45º direito' },
    { codigo: 'traseira_45_esq',      nome: 'Traseira 45º esquerdo' },
    { codigo: 'comp_motor',           nome: 'Compartimento do motor' },
    { codigo: 'hodometro',            nome: 'Hodômetro' },
    { codigo: 'assoalho_pm',          nome: 'Assoalho do porta-malas' },
    { codigo: 'long_diant_painel_dir',nome: 'Longarina dianteira c/ painel direito' },
    { codigo: 'long_diant_painel_esq',nome: 'Longarina dianteira c/ painel esquerdo' },
    { codigo: 'long_tras_painel_dir', nome: 'Longarina traseira c/ painel direito' },
    { codigo: 'long_tras_painel_esq', nome: 'Longarina traseira c/ painel esquerdo' },
    { codigo: 'quadro_porta_diant_dir',nome: 'Quadro porta dianteira direita' },
    { codigo: 'quadro_porta_diant_esq',nome: 'Quadro porta dianteira esquerda' },
    { codigo: 'quadro_porta_tras_dir',nome: 'Quadro porta traseira direita' },
    { codigo: 'quadro_porta_tras_esq',nome: 'Quadro porta traseira esquerda' },
    { codigo: 'etiq_comp_motor',      nome: 'Etiqueta compartimento do motor' },
    { codigo: 'etiq_coluna_dir_foto', nome: 'Etiqueta coluna lado direito' },
    { codigo: 'num_motor',            nome: 'Número do motor' },
    { codigo: 'num_chassi',           nome: 'Número do chassi' },
    { codigo: 'num_chassi_diant',     nome: 'Número do chassi dianteiro' },
    { codigo: 'placa_traseira',       nome: 'Placa traseira' },
    { codigo: 'doc_crlv',             nome: 'Documento do veículo (CRLV)' },
  ];

  // Bloco de consulta — 11 rubricas de débito (origem CONSULTA). O total soma as 11.
  const CE_DEBITOS_RUBRICAS = [
    'CETESB', 'DER', 'DERSA', 'DETRAN', 'IPVA', 'Municipais',
    'PRF', 'RENAINF', 'Licenciamento', 'Multas', 'DPVAT',
  ];

  /* Textos obrigatórios (Essencial), sempre em destaque. */
  const CE_TEXTO_LIMITACAO =
    'Não são analisados itens que necessitem de equipamentos especializados como ' +
    'freios ABS, air bags, parte mecânica, hodômetro e elétrica.';
  const CE_TEXTO_VALIDADE =
    'As informações atestadas nesta vistoria são válidas exclusivamente para o ' +
    'momento de sua realização, não constituindo garantia sobre o estado futuro do veículo.';

  /* ==========================================================================
     3. CORES POR STATUS
     ========================================================================== */

  // Cor do marcador de pintura no diagrama, conforme o status do ponto.
  const CE_COR_PINTURA = {
    'Pintura original':          '#1f9d55', // verde — original
    'Pequenos riscos/Amassado':  '#c9a227', // âmbar — desgaste leve
    'Repintura':                 '#dd8c1a', // laranja — repintura
    'Repintura com massa':       '#d1552b', // laranja-vermelho — massa
    'Avariado':                  '#c0392b', // vermelho — avaria
    'Não aplicável':             '#8a97a6', // cinza — N/A
  };
  const CE_COR_PINTURA_VAZIO = '#c7ced6'; // ponto ainda não avaliado

  function cePinturaCor(status) {
    return CE_COR_PINTURA[status] || CE_COR_PINTURA_VAZIO;
  }

  /* ==========================================================================
     4. DIAGRAMA SVG DA PINTURA (4 vistas, inline, sem dependência externa)
     --------------------------------------------------------------------------
     Cada ponto tem uma posição (x,y) dentro de uma das quatro vistas. Os
     marcadores são círculos numerados que recolorem conforme o status do ponto.
     ========================================================================== */

  // Posições dos marcadores por número de ponto (coordenadas no viewBox 0..400 x 0..300).
  const CE_SVG_POS = {
    1:  { x: 105, y: 70 },   // capô (superior)
    2:  { x: 105, y: 118 },  // teto (superior)
    3:  { x: 105, y: 166 },  // tampa porta-malas (superior)
    4:  { x: 235, y: 235 },  // paralama diant esq (lateral esq)
    5:  { x: 285, y: 235 },  // porta diant esq (lateral esq)
    6:  { x: 330, y: 235 },  // porta tras esq (lateral esq)
    7:  { x: 375, y: 235 },  // paralama tras esq (lateral esq)
    8:  { x: 45,  y: 250 },  // traseira esq (frontal/traseira)
    9:  { x: 375, y: 118 },  // paralama tras dir (lateral dir)
    10: { x: 95,  y: 250 },  // traseira dir (frontal/traseira)
    11: { x: 330, y: 118 },  // porta tras dir (lateral dir)
    12: { x: 285, y: 118 },  // porta diant dir (lateral dir)
    13: { x: 235, y: 118 },  // paralama diant dir (lateral dir)
    14: { x: 45,  y: 210 },  // para-choque dianteiro (frontal/traseira)
    15: { x: 95,  y: 210 },  // para-choque traseiro (frontal/traseira)
  };

  function ceMarcador(numero, status) {
    const p = CE_SVG_POS[numero];
    if (!p) return '';
    const cor = cePinturaCor(status);
    const txt = (status === 'Não aplicável' || !status) ? '#3a4653' : '#ffffff';
    return (
      '<g class="ce-mk" data-ponto="' + numero + '">' +
      '<circle cx="' + p.x + '" cy="' + p.y + '" r="11" fill="' + cor + '" ' +
      'stroke="#ffffff" stroke-width="1.5"></circle>' +
      '<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle" ' +
      'font-size="11" font-weight="700" fill="' + txt + '">' + numero + '</text>' +
      '</g>'
    );
  }

  // Silhuetas simples (retângulos arredondados) para as quatro vistas.
  function ceSilhuetas() {
    return (
      // Superior (topo) — carroceria vista de cima
      '<rect x="60" y="40" width="90" height="150" rx="26" fill="#eef2f6" stroke="#b9c4d0" stroke-width="2"></rect>' +
      '<text x="105" y="30" text-anchor="middle" font-size="10" fill="#6b7684">SUPERIOR</text>' +
      // Lateral esquerda
      '<path d="M205 250 q6 -34 40 -34 h150 q22 0 22 22 v12 h-212 z" fill="#eef2f6" stroke="#b9c4d0" stroke-width="2"></path>' +
      '<text x="300" y="278" text-anchor="middle" font-size="10" fill="#6b7684">LATERAL ESQ.</text>' +
      // Lateral direita
      '<path d="M205 133 q6 -34 40 -34 h150 q22 0 22 22 v12 h-212 z" fill="#eef2f6" stroke="#b9c4d0" stroke-width="2"></path>' +
      '<text x="300" y="160" text-anchor="middle" font-size="10" fill="#6b7684">LATERAL DIR.</text>' +
      // Frontal / traseira (esquema compacto)
      '<rect x="25" y="195" width="90" height="70" rx="12" fill="#eef2f6" stroke="#b9c4d0" stroke-width="2"></rect>' +
      '<text x="70" y="285" text-anchor="middle" font-size="10" fill="#6b7684">FRONTAL / TRASEIRA</text>'
    );
  }

  /**
   * Monta o SVG completo do diagrama de pintura a partir do estado atual.
   * @param {Object} pinturaState  mapa { codigoDoPonto: status }
   * @returns {string} markup SVG inline
   */
  function ceDiagramaPinturaSVG(pinturaState) {
    pinturaState = pinturaState || {};
    let marcadores = '';
    CE_PINTURA.forEach(function (pt) {
      marcadores += ceMarcador(pt.numero, pinturaState[pt.codigo]);
    });
    return (
      '<svg viewBox="0 0 400 300" width="100%" style="max-width:520px" ' +
      'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Diagrama de pintura">' +
      ceSilhuetas() + marcadores +
      '</svg>'
    );
  }

  /* ==========================================================================
     5. ESTADO EM MEMÓRIA (offline)
     --------------------------------------------------------------------------
     Fonte única de verdade da tela. O painel semafórico e o diagrama SVG
     derivam SEMPRE deste mesmo objeto (regra 2 do spec — nunca de consulta
     separada). A persistência (Supabase) será plugada numa fase posterior.
     ========================================================================== */

  function ceEstadoInicial() {
    return {
      nivel: 'ESSENCIAL',
      abertura: { osId: '', tipoCliente: '', vistoriadorId: '' },
      veiculo: {
        placa: '', chassi: '', renavam: '', fabricante: '', modelo: '', cor: '',
        anoFabricacao: '', anoModelo: '', combustivel: '', numeroMotor: '', quilometragem: '',
      },
      estrutura: {},        // { codigo: status }
      estruturaObs: '',
      pintura: {},          // { codigo: status }
      etiquetas: {},        // { codigo: condicao }
      vidros: {},           // { codigo: { condicao, chassiGravado } }
      identificacao: {},    // { MOTOR|CHASSI: status }
      fotos: {},            // { codigo: { thumb, latitude, longitude, capturedAt } }
      parecer: '',
    };
  }

  /* ==========================================================================
     6. PAINEL SEMAFÓRICO (5 indicadores — mesma fonte dos blocos)
     ========================================================================== */

  // Ordem de severidade para "pior status vence".
  const CE_SEV = { verde: 0, ambar: 1, vermelho: 2 };
  function cePior(a, b) { return CE_SEV[b] > CE_SEV[a] ? b : a; }

  function ceStatusIdent(valor) {
    if (valor === 'Divergente' || valor === 'Remarcado') return 'vermelho';
    if (valor === 'Ilegível') return 'ambar';
    return 'verde'; // OK ou não avaliado
  }

  /**
   * Calcula os 5 indicadores a partir EXCLUSIVAMENTE do estado renderizado.
   * @returns {{estrutura,identificacao,pintura,motor,chassi:string}}
   */
  function ceSemaforo(state) {
    // ESTRUTURA: âmbar se qualquer ponto ≠ OK ou houver observação.
    let estrutura = 'verde';
    CE_ESTRUTURA.forEach(function (pt) {
      const v = state.estrutura[pt.codigo];
      if (v && v !== 'OK' && v !== 'Não Aplicável') estrutura = 'ambar';
    });
    if ((state.estruturaObs || '').trim()) estrutura = cePior(estrutura, 'ambar');

    // PINTURA: âmbar se houver Repintura, Repintura com massa ou Avariado.
    let pintura = 'verde';
    CE_PINTURA.forEach(function (pt) {
      const v = state.pintura[pt.codigo];
      if (v === 'Repintura' || v === 'Repintura com massa' || v === 'Avariado') pintura = 'ambar';
    });

    // MOTOR / CHASSI: pela escala de identificação.
    const motor  = ceStatusIdent(state.identificacao.MOTOR);
    const chassi = ceStatusIdent(state.identificacao.CHASSI);

    // IDENTIFICAÇÃO: consolidado da integridade de identificação (pior de motor/chassi).
    const identificacao = cePior(motor, chassi);

    return { estrutura: estrutura, identificacao: identificacao, pintura: pintura, motor: motor, chassi: chassi };
  }

  /* ==========================================================================
     7. FOTOS PENDENTES / VALIDAÇÃO
     ========================================================================== */

  function ceFotosPendentes(state) {
    return CE_FOTOS.filter(function (f) { return !state.fotos[f.codigo]; });
  }

  function cePodeFinalizar(state) {
    return ceFotosPendentes(state).length === 0 && !!state.parecer;
  }

  /* ==========================================================================
     8. RENDERIZAÇÃO DO FORMULÁRIO POR BLOCOS + PAINEL SEMAFÓRICO
     --------------------------------------------------------------------------
     Otimizado para uso em celular no pátio. Fonte única de verdade = `_state`.
     O painel semafórico e o diagrama SVG derivam SEMPRE de `_state`.
     ========================================================================== */

  let _state = null;   // estado corrente da tela
  let _root  = null;   // elemento container

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Seletor em "chips" (botões) — ergonômico no celular, melhor que <select>.
  function ceChips(grupo, valorAtual, opcoes, onclickTpl) {
    let h = '<div class="ce-chips">';
    opcoes.forEach(function (op) {
      const ativo = (valorAtual === op) ? ' ce-chip--on' : '';
      h += '<button type="button" class="ce-chip' + ativo + '" ' +
           'onclick="' + onclickTpl.replace('%V%', esc(op)) + '">' + esc(op) + '</button>';
    });
    return h + '</div>';
  }

  function ceCampo(label, inner) {
    return '<label class="ce-campo"><span class="ce-campo__lbl">' + esc(label) + '</span>' + inner + '</label>';
  }

  /* ---- Bloco 1 — Abertura ---- */
  function ceBlocoAbertura(state) {
    let niveis = '<div class="ce-chips">';
    CE_NIVEIS.forEach(function (n) {
      const on = state.nivel === n.codigo ? ' ce-chip--on' : '';
      const dis = n.disponivel ? '' : ' disabled';
      const badge = n.disponivel ? '' : ' <small>(em breve)</small>';
      const oc = n.disponivel ? ' onclick="CautelarEssencial.setNivel(\'' + n.codigo + '\')"' : '';
      niveis += '<button type="button" class="ce-chip' + on + '"' + dis + oc + '>' + esc(n.nome) + badge + '</button>';
    });
    niveis += '</div>';
    return ceBloco('1', 'Abertura',
      ceCampo('Nível do laudo', niveis) +
      ceCampo('OS vinculada', '<input class="ce-in" value="' + esc(state.abertura.osId) + '" ' +
        'oninput="CautelarEssencial.setAbertura(\'osId\', this.value)" placeholder="Nº da OS existente">') +
      ceCampo('Tipo de cliente', '<input class="ce-in" value="' + esc(state.abertura.tipoCliente) + '" ' +
        'oninput="CautelarEssencial.setAbertura(\'tipoCliente\', this.value)" placeholder="Ex.: Pessoa física / Loja">') +
      ceCampo('Vistoriador responsável', '<input class="ce-in" value="' + esc(state.abertura.vistoriadorId) + '" ' +
        'oninput="CautelarEssencial.setAbertura(\'vistoriadorId\', this.value)" placeholder="Nome/ID do vistoriador">')
    );
  }

  /* ---- Bloco 2 — Dados do veículo ---- */
  function ceBlocoVeiculo(state) {
    const v = state.veiculo;
    function inp(campo, label, ph) {
      return ceCampo(label, '<input class="ce-in" value="' + esc(v[campo]) + '" ' +
        'oninput="CautelarEssencial.setVeiculo(\'' + campo + '\', this.value)" placeholder="' + esc(ph || '') + '">');
    }
    return ceBloco('2', 'Dados do veículo',
      '<p class="ce-hint">Pré-preenchidos pela consulta quando disponível; todos editáveis pelo vistoriador.</p>' +
      '<div class="ce-grid2">' +
      inp('placa', 'Placa') + inp('chassi', 'Chassi') +
      inp('renavam', 'Renavam') + inp('fabricante', 'Fabricante') +
      inp('modelo', 'Modelo') + inp('cor', 'Cor') +
      inp('anoFabricacao', 'Ano de fabricação') + inp('anoModelo', 'Ano do modelo') +
      inp('combustivel', 'Combustível') + inp('numeroMotor', 'Número do motor') +
      inp('quilometragem', 'Quilometragem') +
      '</div>'
    );
  }

  /* ---- Bloco 3 — Estrutura (21 pontos, agrupados) ---- */
  function ceBlocoEstrutura(state) {
    const grupos = ['Dianteira', 'Colunas', 'Laterais', 'Traseira', 'Superior'];
    let corpo = '';
    grupos.forEach(function (g) {
      corpo += '<h4 class="ce-grupo">' + esc(g) + '</h4>';
      CE_ESTRUTURA.filter(function (p) { return p.grupo === g; }).forEach(function (p) {
        corpo += '<div class="ce-ponto"><span class="ce-ponto__nome">' + esc(p.nome) + '</span>' +
          ceChips('estr_' + p.codigo, state.estrutura[p.codigo], CE_ESCALA_ESTRUTURA,
            'CautelarEssencial.setEstrutura(\'' + p.codigo + '\', \'%V%\')') + '</div>';
      });
    });
    corpo += ceCampo('Observação do vistoriador',
      '<textarea class="ce-in" rows="3" oninput="CautelarEssencial.setEstruturaObs(this.value)" ' +
      'placeholder="Observações sobre a estrutura...">' + esc(state.estruturaObs) + '</textarea>');
    return ceBloco('3', 'Estrutura · 21 pontos', corpo);
  }

  /* ---- Bloco 4 — Pintura (15 pontos + diagrama SVG) ---- */
  function ceBlocoPintura(state) {
    let lista = '';
    CE_PINTURA.forEach(function (p) {
      lista += '<div class="ce-ponto"><span class="ce-ponto__nome"><b>' + p.numero + '.</b> ' + esc(p.nome) + '</span>' +
        ceChips('pint_' + p.codigo, state.pintura[p.codigo], CE_ESCALA_PINTURA,
          'CautelarEssencial.setPintura(\'' + p.codigo + '\', \'%V%\')') + '</div>';
    });
    return ceBloco('4', 'Pintura · 15 pontos',
      '<div id="ce-diagrama" class="ce-diagrama">' + ceDiagramaPinturaSVG(state.pintura) + '</div>' +
      '<div class="ce-legenda">' + CE_ESCALA_PINTURA.map(function (s) {
        return '<span><i style="background:' + cePinturaCor(s) + '"></i>' + esc(s) + '</span>';
      }).join('') + '</div>' + lista
    );
  }

  /* ---- Bloco 5 — Etiquetas ---- */
  function ceBlocoEtiquetas(state) {
    let corpo = '';
    CE_ETIQUETAS.forEach(function (e) {
      corpo += '<div class="ce-ponto"><span class="ce-ponto__nome">' + esc(e.nome) + '</span>' +
        ceChips('etq_' + e.codigo, state.etiquetas[e.codigo], CE_ESCALA_ETIQUETA,
          'CautelarEssencial.setEtiqueta(\'' + e.codigo + '\', \'%V%\')') + '</div>';
    });
    return ceBloco('5', 'Etiquetas', corpo);
  }

  /* ---- Bloco 6 — Vidros (6 pontos: condição + chassi gravado) ---- */
  function ceBlocoVidros(state) {
    let corpo = '';
    CE_VIDROS.forEach(function (vd) {
      const cur = state.vidros[vd.codigo] || {};
      corpo += '<div class="ce-ponto ce-ponto--col"><span class="ce-ponto__nome">' + esc(vd.nome) + '</span>' +
        ceChips('vd_' + vd.codigo, cur.condicao, CE_ESCALA_VIDRO,
          'CautelarEssencial.setVidroCond(\'' + vd.codigo + '\', \'%V%\')') +
        '<label class="ce-check"><input type="checkbox"' + (cur.chassiGravado ? ' checked' : '') +
        ' onchange="CautelarEssencial.setVidroChassi(\'' + vd.codigo + '\', this.checked)"> Chassi gravado</label>' +
        '</div>';
    });
    return ceBloco('6', 'Vidros · 6 pontos', corpo);
  }

  /* ---- Bloco 7 — Identificação veicular ---- */
  function ceBlocoIdentificacao(state) {
    let corpo = '';
    CE_IDENTIFICACAO.forEach(function (it) {
      corpo += '<div class="ce-ponto"><span class="ce-ponto__nome">' + esc(it.nome) + '</span>' +
        ceChips('id_' + it.codigo, state.identificacao[it.codigo], CE_ESCALA_IDENT,
          'CautelarEssencial.setIdent(\'' + it.codigo + '\', \'%V%\')') + '</div>';
    });
    return ceBloco('7', 'Identificação veicular', corpo);
  }

  /* ---- Bloco 8 — Fotos obrigatórias (câmera nativa + GPS + timestamp) ---- */
  function ceBlocoFotos(state) {
    let cards = '';
    CE_FOTOS.forEach(function (f) {
      const foto = state.fotos[f.codigo];
      const inputId = 'ce-cam-' + f.codigo;
      if (foto) {
        cards += '<div class="ce-foto ce-foto--ok">' +
          '<img src="' + foto.thumb + '" alt="' + esc(f.nome) + '">' +
          '<span class="ce-foto__lbl">' + esc(f.nome) + '</span>' +
          '<button type="button" class="ce-foto__x" onclick="CautelarEssencial.removerFoto(\'' + f.codigo + '\')">Refazer</button>' +
          (foto.latitude ? '<span class="ce-foto__gps">📍 ' + foto.latitude.toFixed(5) + ', ' + foto.longitude.toFixed(5) + '</span>' : '') +
          '</div>';
      } else {
        cards += '<div class="ce-foto ce-foto--pend" onclick="document.getElementById(\'' + inputId + '\').click()">' +
          '<i class="ri-camera-line"></i><span class="ce-foto__lbl">' + esc(f.nome) + '</span>' +
          '<input type="file" id="' + inputId + '" accept="image/*" capture="environment" style="display:none" ' +
          'onchange="CautelarEssencial.capturarFoto(\'' + f.codigo + '\', event)">' +
          '</div>';
      }
    });
    const pend = ceFotosPendentes(state).length;
    return ceBloco('8', 'Fotos obrigatórias',
      '<p class="ce-hint" id="ce-fotos-status">' +
      (pend === 0 ? '✅ Todas as fotos capturadas.' : '⚠️ ' + pend + ' de ' + CE_FOTOS.length + ' foto(s) pendente(s). A finalização fica bloqueada até completar.') +
      '</p><div class="ce-fotos-grid">' + cards + '</div>'
    );
  }

  /* ---- Bloco 9 — Parecer técnico ---- */
  function ceBlocoParecer(state) {
    return ceBloco('9', 'Parecer técnico',
      ceChips('parecer', state.parecer, CE_PARECERES, 'CautelarEssencial.setParecer(\'%V%\')') +
      '<div class="ce-avisos">' +
      '<p class="ce-aviso"><b>Limitação de escopo.</b> ' + esc(CE_TEXTO_LIMITACAO) + '</p>' +
      '<p class="ce-aviso"><b>Validade no momento.</b> ' + esc(CE_TEXTO_VALIDADE) + '</p>' +
      '</div>'
    );
  }

  function ceBloco(num, titulo, corpo) {
    return '<section class="ce-bloco"><header class="ce-bloco__h">' +
      '<span class="ce-bloco__n">' + esc(num) + '</span>' + esc(titulo) +
      '</header><div class="ce-bloco__b">' + corpo + '</div></section>';
  }

  /* ---- Painel semafórico ---- */
  const CE_SEM_LABEL = { estrutura: 'ESTRUTURA', identificacao: 'IDENTIFICAÇÃO', pintura: 'PINTURA', motor: 'MOTOR', chassi: 'CHASSI' };
  const CE_SEM_COR = { verde: '#1f9d55', ambar: '#d69e2e', vermelho: '#c0392b' };

  function ceRenderSemaforo(state) {
    const s = ceSemaforo(state);
    let h = '';
    ['estrutura', 'identificacao', 'pintura', 'motor', 'chassi'].forEach(function (k) {
      h += '<div class="ce-sem"><span class="ce-sem__dot" style="background:' + CE_SEM_COR[s[k]] + '"></span>' +
        '<span class="ce-sem__lbl">' + CE_SEM_LABEL[k] + '</span></div>';
    });
    return h;
  }

  /* ---- Render principal ---- */
  function ceRenderForm(container, state) {
    _root = (typeof container === 'string') ? document.getElementById(container) : container;
    _state = state || _state || ceEstadoInicial();
    if (!_root) return;
    _root.innerHTML =
      '<div class="ce-painel"><div class="ce-painel__t">Resumo</div>' +
        '<div id="ce-semaforo" class="ce-semaforo">' + ceRenderSemaforo(_state) + '</div></div>' +
      '<div class="ce-form">' +
        ceBlocoAbertura(_state) + ceBlocoVeiculo(_state) + ceBlocoEstrutura(_state) +
        ceBlocoPintura(_state) + ceBlocoEtiquetas(_state) + ceBlocoVidros(_state) +
        ceBlocoIdentificacao(_state) + ceBlocoFotos(_state) + ceBlocoParecer(_state) +
      '</div>' +
      '<div class="ce-rodape">' +
        '<button type="button" id="ce-btn-laudo" class="ce-btn-laudo" onclick="CautelarEssencial.emitirLaudo()">' +
        'Gerar laudo e emitir PDF</button></div>';
    ceAtualizarBotaoLaudo();
  }

  /* ---- Atualizações parciais (sem re-render total) ---- */
  function ceRefreshSemaforo() {
    const el = document.getElementById('ce-semaforo');
    if (el) el.innerHTML = ceRenderSemaforo(_state);
  }
  function ceRefreshDiagrama() {
    const el = document.getElementById('ce-diagrama');
    if (el) el.innerHTML = ceDiagramaPinturaSVG(_state.pintura);
  }
  function ceRefreshFotosStatus() {
    const el = document.getElementById('ce-fotos-status');
    const pend = ceFotosPendentes(_state).length;
    if (el) el.textContent = pend === 0
      ? '✅ Todas as fotos capturadas.'
      : '⚠️ ' + pend + ' de ' + CE_FOTOS.length + ' foto(s) pendente(s). A finalização fica bloqueada até completar.';
    ceAtualizarBotaoLaudo();
  }
  function ceAtualizarBotaoLaudo() {
    const b = document.getElementById('ce-btn-laudo');
    if (!b) return;
    const ok = cePodeFinalizar(_state);
    b.disabled = !ok;
    b.title = ok ? '' : 'Complete todas as fotos e selecione o parecer para emitir o laudo.';
  }
  // Recolore só o marcador alterado, sem reconstruir o SVG inteiro.
  function ceMarcarPonto(codigo) {
    const pt = CE_PINTURA.find(function (p) { return p.codigo === codigo; });
    if (!pt) return;
    const g = _root && _root.querySelector('#ce-diagrama .ce-mk[data-ponto="' + pt.numero + '"] circle');
    if (g) { g.setAttribute('fill', cePinturaCor(_state.pintura[codigo])); }
    else { ceRefreshDiagrama(); }
  }

  // Alterna chips visualmente dentro do container do controle acionado.
  function ceToggleChip(btn, valorSel) {
    const wrap = btn.parentElement;
    if (!wrap) return;
    wrap.querySelectorAll('.ce-chip').forEach(function (c) {
      c.classList.toggle('ce-chip--on', c === btn);
    });
  }

  /* ---- Handlers (atualizam _state e refazem só o necessário) ---- */
  function bindChipEvent(fn) {
    return function (codigo, valor) {
      // acha o botão clicado via event global (chips chamam com string)
      const ev = global.event;
      const btn = ev && ev.target ? ev.target.closest('.ce-chip') : null;
      if (btn) ceToggleChip(btn, valor);
      fn(codigo, valor);
    };
  }

  const setNivel = function (n) { _state.nivel = n; ceRenderForm(_root, _state); };
  const setAbertura = function (campo, val) { _state.abertura[campo] = val; };
  const setVeiculo = function (campo, val) { _state.veiculo[campo] = val; };
  const setEstrutura = bindChipEvent(function (codigo, val) { _state.estrutura[codigo] = val; ceRefreshSemaforo(); });
  const setEstruturaObs = function (val) { _state.estruturaObs = val; ceRefreshSemaforo(); };
  const setPintura = bindChipEvent(function (codigo, val) { _state.pintura[codigo] = val; ceMarcarPonto(codigo); ceRefreshSemaforo(); });
  const setEtiqueta = bindChipEvent(function (codigo, val) { _state.etiquetas[codigo] = val; });
  const setVidroCond = bindChipEvent(function (codigo, val) {
    _state.vidros[codigo] = _state.vidros[codigo] || {}; _state.vidros[codigo].condicao = val;
  });
  const setVidroChassi = function (codigo, checked) {
    _state.vidros[codigo] = _state.vidros[codigo] || {}; _state.vidros[codigo].chassiGravado = checked;
  };
  const setIdent = bindChipEvent(function (codigo, val) { _state.identificacao[codigo] = val; ceRefreshSemaforo(); });
  const setParecer = bindChipEvent(function (val) { _state.parecer = val; ceAtualizarBotaoLaudo(); });

  /* ---- Captura de foto (câmera nativa + GPS + timestamp) ----
     Mesmo padrão do módulo de produção: <input capture="environment">, compressão
     no cliente e coleta de GPS best-effort com timeout de 3s. No preview offline a
     miniatura fica em memória; na integração ao app a persistência delega ao
     handleFotoUpload/CautelarOfflineDB/Storage já existentes. */
  function ceComprimir(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        const escala = Math.min(1, maxSide / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * escala);
        cv.height = Math.round(img.height * escala);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function capturarFoto(codigo, event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    let thumb;
    try { thumb = await ceComprimir(file, 640, 0.7); }
    catch (e) { thumb = ''; }
    const foto = { thumb: thumb, capturedAt: new Date().toISOString(), latitude: null, longitude: null };
    if (navigator.geolocation) {
      try {
        const pos = await new Promise(function (resolve, reject) {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
        foto.latitude = pos.coords.latitude;
        foto.longitude = pos.coords.longitude;
        foto.accuracy = pos.coords.accuracy;
      } catch (gpsErr) { /* best-effort: segue sem GPS */ }
    }
    _state.fotos[codigo] = foto;
    // re-render só do bloco de fotos
    ceRerenderFotos();
  }
  function removerFoto(codigo) {
    delete _state.fotos[codigo];
    ceRerenderFotos();
  }
  function ceRerenderFotos() {
    // substitui apenas a seção de fotos (bloco 8) preservando o resto do form
    const blocos = _root ? _root.querySelectorAll('.ce-form .ce-bloco') : [];
    if (blocos && blocos[7]) {
      const tmp = document.createElement('div');
      tmp.innerHTML = ceBlocoFotos(_state);
      blocos[7].replaceWith(tmp.firstChild);
    } else {
      ceRenderForm(_root, _state);
    }
    ceRefreshFotosStatus();
  }

  function emitirLaudo() {
    if (!cePodeFinalizar(_state)) return;
    // Geração do PDF (identidade Certive + QR + validação pública) é a próxima fase.
    if (typeof global.alert === 'function') {
      global.alert('Laudo pronto para emissão. A geração do PDF (identidade Certive, QR de validação e link público) será conectada na fase de saída do laudo.');
    }
  }

  /* ==========================================================================
     9. API PÚBLICA (para o preview e para a futura integração)
     ========================================================================== */

  const CE = {
    // constantes
    NIVEIS: CE_NIVEIS,
    ESCALA_ESTRUTURA: CE_ESCALA_ESTRUTURA,
    ESCALA_PINTURA: CE_ESCALA_PINTURA,
    ESCALA_ETIQUETA: CE_ESCALA_ETIQUETA,
    ESCALA_VIDRO: CE_ESCALA_VIDRO,
    ESCALA_IDENT: CE_ESCALA_IDENT,
    PARECERES: CE_PARECERES,
    ESTRUTURA: CE_ESTRUTURA,
    PINTURA: CE_PINTURA,
    ETIQUETAS: CE_ETIQUETAS,
    VIDROS: CE_VIDROS,
    IDENTIFICACAO: CE_IDENTIFICACAO,
    FOTOS: CE_FOTOS,
    DEBITOS_RUBRICAS: CE_DEBITOS_RUBRICAS,
    TEXTO_LIMITACAO: CE_TEXTO_LIMITACAO,
    TEXTO_VALIDADE: CE_TEXTO_VALIDADE,
    // cores / diagrama
    corPintura: cePinturaCor,
    diagramaPinturaSVG: ceDiagramaPinturaSVG,
    // estado / regras
    estadoInicial: ceEstadoInicial,
    semaforo: ceSemaforo,
    fotosPendentes: ceFotosPendentes,
    podeFinalizar: cePodeFinalizar,
    // render / UI
    renderForm: ceRenderForm,
    get state() { return _state; },
    // handlers de formulário
    setNivel: setNivel,
    setAbertura: setAbertura,
    setVeiculo: setVeiculo,
    setEstrutura: setEstrutura,
    setEstruturaObs: setEstruturaObs,
    setPintura: setPintura,
    setEtiqueta: setEtiqueta,
    setVidroCond: setVidroCond,
    setVidroChassi: setVidroChassi,
    setIdent: setIdent,
    setParecer: setParecer,
    capturarFoto: capturarFoto,
    removerFoto: removerFoto,
    emitirLaudo: emitirLaudo,
  };

  global.CautelarEssencial = CE;

})(typeof window !== 'undefined' ? window : this);
