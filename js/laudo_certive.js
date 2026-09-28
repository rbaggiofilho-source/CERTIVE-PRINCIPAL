/**
 * Laudo Cautelar Certive — modelo oficial.
 *
 * O laudo é montado em HTML/CSS (páginas A4 de 794 x 1123 px), seguindo o layout
 * padrão aprovado (capa escura + seções I a IX com faixa azul, numerais dourados,
 * cartões de status, tabelas e registro fotográfico). Cada clique em "gerar laudo"
 * monta um laudo novo com os dados atuais da vistoria, as fotos e os textos
 * redigidos pelo agente no servidor (laudos_gerados.resposta).
 *
 * - Pré-visualização: o próprio HTML, na tela de finalização.
 * - PDF oficial: cada página é rasterizada em alta resolução (html2canvas) e
 *   gravada em um PDF A4 (pdf-lib). API mantida: gerarLaudoCertive(id) -> bytes.
 */
(function (global) {
    'use strict';

    const PAG = { w: 794, h: 1123 };
    const MODELO = 'LCAV v1.0'; // versão do modelo de laudo: mudar ao alterar o layout
    const A4_PT = { w: 595.28, h: 841.89 };

    const COR = {
        navy: '#0A1F3D', gold: '#C9A961', creme: '#FAF8F3',
        verde: '#2F6B3F', ambar: '#B8642B', vermelho: '#8B2635', neutro: '#9A9284'
    };

    const PARECER = {
        conforme: { texto: 'CONFORME', curto: 'CONFORME', cls: 'ok' },
        com_ressalvas: { texto: 'CONFORME COM RESSALVA', curto: 'COM RESSALVA', cls: 'ress' },
        nao_conforme: { texto: 'NÃO CONFORME', curto: 'NÃO CONFORME', cls: 'nc' }
    };

    const CORES_PINTURA = {
        'ORIGINAL': COR.verde,
        'REPINTURA': COR.gold,
        'REPINTURA COM MASSA': COR.ambar,
        'AVARIADO': COR.vermelho,
        'NÃO SE APLICA': COR.neutro,
        'NÃO APLICÁVEL': COR.neutro,
        'NÃO AVALIADO': COR.neutro
    };
    const ROTULO_PINTURA = {
        'ORIGINAL': 'Original', 'REPINTURA': 'Repintura', 'REPINTURA COM MASSA': 'Repintura c/ massa',
        'AVARIADO': 'Avariado', 'NÃO SE APLICA': 'Não se aplica', 'NÃO AVALIADO': 'Não avaliado'
    };

    const ROTULO_ESTRUTURA = {
        original: { t: 'Original', cls: 'ok' },
        reparo_aparente: { t: 'Indícios de reparo', cls: 'ress' },
        substituicao: { t: 'Indícios de substituição', cls: 'nc' },
        indicio_avaria: { t: 'Indício de avaria', cls: 'ress' },
        nao_aplicavel: { t: 'Não se aplica', cls: 'na' }
    };

    const ROTULO_ETIQUETA = {
        preservada: { t: 'Preservada', cls: 'ok' },
        danificada: { t: 'Danificada', cls: 'ress' },
        ausente: { t: 'Ausente', cls: 'nc' }
    };

    const CONSERVACAO = { excelente: 'Excelente', bom: 'Bom', regular: 'Regular', mau: 'Mau' };

    // Fotos em que a leitura importa: mostradas inteiras (sem corte)
    const SLOTS_LEITURA = /^(chassi_|motor_gravado|etiqueta_|vidro_|placa_|painel_hodometro|crlv_)/;

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------
    function esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }
    function limpar(v) { return String(v ?? '').trim(); }

    function dataBR(iso, comHora) {
        if (!iso) return 'Não informado';
        const d = new Date(iso);
        if (isNaN(d)) return 'Não informado';
        const data = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        if (!comHora) return data;
        return `${data} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`;
    }

    function dataExtenso(iso) {
        const d = iso ? new Date(iso) : new Date();
        return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
    }

    function formatarKm(v) {
        const n = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.'));
        return isNaN(n) || n <= 0 ? '' : `${n.toLocaleString('pt-BR')} km`;
    }

    // Textos digitados todo em maiúsculas viram frase normal ("INDÍCIOS DE SOLDA" -> "Indícios de solda")
    function textoVistoriador(t) {
        const s = String(t || '').trim();
        const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
        if (!letras) return s;
        const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
        if (maiusculas / letras.length < 0.7) return s;
        return s.toLowerCase().replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
    }

    function capitalizar(t) {
        const s = String(t || '').toLowerCase();
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    // Nome do slot sem prefixos técnicos, em caixa normal
    function nomeCurto(nome) {
        return capitalizar(String(nome || '')
            .replace('GRAVAÇÃO VIDRO ', '').replace('GRAVAÇÃO ', '')
            .replace(' (MOTORISTA)', '').replace(' (ESTRUTURA)', '')
            .replace('FOTO DO MEDIDOR MINIPA EM USO (EVIDÊNCIA)', 'MEDIDOR DE ESPESSURA EM USO')
            .replace('PAINEL DE INSTRUMENTOS COM HODÔMETRO', 'PAINEL / HODÔMETRO'));
    }

    // ------------------------------------------------------------------
    // Coleta de dados
    // ------------------------------------------------------------------
    function montarDados(cautelarId) {
        const cautelar = db.cautelares.find(c => c.id === cautelarId);
        if (!cautelar) throw new Error('Vistoria não encontrada');
        const os = db.ordens_servico.find(o => o.id === cautelar.osId);
        if (!os) throw new Error('Ordem de serviço não encontrada');
        const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelar.id);
        const sec = n => (secoes.find(s => s.numeroSecao === n)?.dadosJson) || {};
        const secaoIds = secoes.map(s => s.id);
        const fotos = (db.cautelares_fotos || []).filter(f => secaoIds.includes(f.secaoId));
        const foto = slot => fotos.find(f => f.slotCodigo === slot) || null;
        const meta = slot => { const f = foto(slot); return (f && (f.metadados_json || f.metadados)) || {}; };
        const unidade = (db.unidades || []).find(u => u.id === os.unidadeId) || {};
        const vistoriador = (db.operadores || []).find(o => o.id === cautelar.vistoriadorId) || {};
        const ia = cautelar.dadosIaConfeccionado || {};
        const campos = ia.campos || ia.fields || {};

        const d1 = sec(1), d2 = sec(2), d3 = sec(3), d4 = sec(4), d5 = sec(5), d6 = sec(6), d7 = sec(7), d8 = sec(8);

        const marcaModelo = String(os.veiculoMarcaModelo || campos['vehicle.brand_model'] || '').trim();
        const tipos = { hatch: 'Hatch', sedan: 'Sedan', suv: 'SUV', pickup: 'Pick-up', van: 'Van / Utilitário', minivan: 'Minivan', cupe: 'Cupê', outro: 'Outro' };
        const tipo = String(d1.tipoVeiculo || os.veiculoTipo || ia.silhueta || '').toLowerCase();
        const normalizar = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const chassiLido = String(d2.chassiLido || '').toUpperCase();
        const chassiCadastro = String(os.veiculoChassi || '').toUpperCase();
        const chassiConfere = !chassiCadastro || !chassiLido ? null : normalizar(chassiLido) === normalizar(chassiCadastro);

        const parecerFinal = cautelar.parecerFinal || cautelar.parecerConsolidado || d8.parecerFinal || d8.parecerPreliminar || 'conforme';

        const porNumeroIa = Object.fromEntries((ia.pintura_marcadores || []).map(m => [Number(m.numero), String(m.classificacao || '').toUpperCase()]));
        const itensPintura = (global.CAUTELAR_PINTURA_ITENS || []).map((it, i) => {
            let classe = String(d4[`pint_${it.codigo}_classe`] || '').toUpperCase() || porNumeroIa[i + 1] || 'NÃO AVALIADO';
            if (classe === 'NÃO APLICÁVEL') classe = 'NÃO SE APLICA';
            return {
                numero: i + 1, codigo: it.codigo, nome: it.nome, tipo: it.tipo,
                um: d4[`pint_${it.codigo}_um`] || '', classe,
                reparo: d4[`pint_${it.codigo}_reparo`] || ''
            };
        });

        const slots = n => (global.CAUTELAR_SLOTS && global.CAUTELAR_SLOTS[n]) || [];
        const estrutura = slots(3).map(sl => {
            const m = meta(sl.codigo);
            return { ...sl, status: m.status_estrutural || 'original', obs: m.observacao_peca || '', temFoto: !!foto(sl.codigo) };
        });
        const vidros = slots(5).map(sl => {
            const m = meta(sl.codigo);
            return {
                ...sl, original: m.vidro_original !== false, lida: m.gravacao_lida || '',
                desbaste: m.desbaste === true, temFoto: !!foto(sl.codigo)
            };
        });
        const etiquetas = [
            { nome: 'Etiqueta ETA do compartimento do motor', status: d2.eta_motor || '' },
            { nome: 'Etiqueta ETA da coluna / batente da porta', status: d2.eta_coluna || '' }
        ];

        const pior = lista => lista.includes('nao_conforme') ? 'nao_conforme' : (lista.includes('com_ressalvas') ? 'com_ressalvas' : 'conforme');
        const deCampo = v => {
            const t = String(v || '').toUpperCase();
            if (t.startsWith('NÃO') || t.startsWith('NAO')) return 'nao_conforme';
            if (t.includes('RESSALVA')) return 'com_ressalvas';
            if (t.startsWith('CONFORME')) return 'conforme';
            return null;
        };
        const stEstrutura = deCampo(campos['structure.status']) || pior([
            d3.parecerEstrutural || 'conforme',
            d3.deformacaoEstrutural === 'sim' ? 'nao_conforme' : 'conforme',
            estrutura.some(e => e.status === 'substituicao') ? 'nao_conforme' : 'conforme',
            estrutura.some(e => e.status === 'reparo_aparente' || e.status === 'indicio_avaria') ? 'com_ressalvas' : 'conforme',
            itensPintura.some(i => i.reparo === 'sim') ? 'com_ressalvas' : 'conforme'
        ]);
        const stIdent = deCampo(campos['identification.status']) || pior([
            etiquetas.some(e => e.status === 'ausente' || e.status === 'danificada') ? 'com_ressalvas' : 'conforme',
            vidros.some(v => !v.original || v.desbaste) ? 'com_ressalvas' : 'conforme'
        ]);
        const stPintura = deCampo(campos['paint.status']) || (
            itensPintura.some(i => ['AVARIADO', 'REPINTURA COM MASSA', 'REPINTURA'].includes(i.classe)) ? 'com_ressalvas' : 'conforme');
        const stMotor = deCampo(campos['engine.status']) || (
            d2.motorOriginal === false ? 'nao_conforme' : (d6.reparoMotor === 'sim' || d6.corMotorOk === 'nao' ? 'com_ressalvas' : 'conforme'));
        const stChassi = deCampo(campos['chassis.status']) || pior([
            d2.chassiOriginal === false ? 'nao_conforme' : 'conforme',
            chassiConfere === false ? 'com_ressalvas' : 'conforme'
        ]);

        return {
            cautelar, os, unidade, vistoriador, ia, campos, fotos, foto, meta,
            d1, d2, d3, d4, d5, d6, d7, d8,
            marcaModelo: marcaModelo || 'Não informado',
            tipo: tipos[tipo] || 'Não informado', tipoCodigo: tipos[tipo] ? tipo : 'sedan',
            chassiLido: chassiLido || 'Não informado', chassiCadastro, chassiConfere,
            motorLido: String(d2.motorLido || '').toUpperCase() || 'Não informado',
            parecerFinal: PARECER[parecerFinal] ? parecerFinal : 'conforme',
            itensPintura, estrutura, vidros, etiquetas,
            status: { estrutura: stEstrutura, identificacao: stIdent, pintura: stPintura, motor: stMotor, chassi: stChassi },
            cidade: unidade.cidade ? `${unidade.cidade}/${unidade.uf || ''}` : 'São José/SC',
            dataVistoria: cautelar.dataHoraInicio || cautelar.criadoEm,
            dataEmissao: cautelar.finalizadoEm || cautelar.dataHoraFinalizacao || new Date().toISOString(),
            hash: cautelar.hashLaudo || cautelar.pdfHash || ''
        };
    }

    // Constatações que tornam o item "não conforme" (e não apenas ponto de atenção)
    const RX_NAO_CONFORME = /((chassi|motor)[^;]*n[ãa]o originais?)|com deforma|ind[íi]cios de substitui|remarca|adultera/i;

    function listasResumo(D) {
        const ok = [], alerta = [];
        const linhas = t => String(t || '').split('\n').map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
        if (D.campos['summary.approved_items'] || D.campos['summary.alert_items']) {
            ok.push(...linhas(D.campos['summary.approved_items']));
            alerta.push(...linhas(D.campos['summary.alert_items']));
        } else {
            if (D.d2.chassiOriginal !== false) ok.push('Gravação do chassi com características originais');
            else alerta.push('Gravação do chassi com características não originais');
            if (D.d2.motorOriginal !== false) ok.push('Gravação do motor com características originais');
            else alerta.push('Gravação do motor com características não originais');
            if (D.chassiConfere === false) alerta.push(`Chassi lido diverge do cadastro da O.S. (${D.chassiCadastro})`);
            D.etiquetas.forEach(e => {
                if (e.status === 'preservada') ok.push(`${e.nome}: preservada`);
                else if (e.status) alerta.push(`${e.nome}: ${(ROTULO_ETIQUETA[e.status]?.t || e.status).toLowerCase()}`);
            });
            if (D.d3.indicioEnchente === 'sim') alerta.push('Indícios de enchente constatados');
            else ok.push('Sem indícios de enchente');
            if (D.d3.indicioBatida === 'sim') {
                alerta.push(D.d3.deformacaoEstrutural === 'sim' ? 'Indícios de batida com deformação estrutural' : 'Indícios de batida sem deformação estrutural');
            } else ok.push('Sem indícios de batida');
            const estruturais = D.estrutura.filter(e => e.status !== 'original' && e.status !== 'nao_aplicavel');
            estruturais.forEach(e => alerta.push(`${capitalizar(e.nome.replace(' (ESTRUTURA)', ''))}: ${ROTULO_ESTRUTURA[e.status]?.t.toLowerCase()}`));
            if (!estruturais.length) ok.push('Pontos estruturais avaliados sem indícios de reparo');
            D.itensPintura.filter(i => i.reparo === 'sim').forEach(i => alerta.push(`${i.nome}: indícios de reparo estrutural`));
            const pintadas = D.itensPintura.filter(i => ['REPINTURA', 'REPINTURA COM MASSA', 'AVARIADO'].includes(i.classe));
            if (pintadas.length) alerta.push(`Pintura: ${pintadas.length} peça(s) com repintura ou avaria`);
            else ok.push('Pintura original nas peças avaliadas');
            const vidrosProblema = D.vidros.filter(v => !v.original || v.desbaste);
            if (vidrosProblema.length) vidrosProblema.forEach(v => alerta.push(`Vidro ${nomeCurto(v.nome).toLowerCase()}: ${!v.original ? 'gravação divergente (vidro trocado)' : 'desbaste/polimento na gravação'}`));
            else ok.push('Gravações dos vidros originais');
            if (D.d6.reparoMotor === 'sim') alerta.push('Sinais de reparo no compartimento do motor');
            else ok.push('Compartimento do motor sem sinais de reparo estrutural');
            if (D.d7.intervencaoQuadros === 'sim') alerta.push('Intervenção ou soldas nos quadros de porta');
            else ok.push('Quadros de porta sem sinais de intervenção');
        }
        const naoConformes = alerta.filter(t => RX_NAO_CONFORME.test(t));
        const atencao = alerta.filter(t => !RX_NAO_CONFORME.test(t));
        return { ok, alerta, atencao, naoConformes };
    }

    function textoParecerFinal(D) {
        if (D.campos['final.opinion_text']) return D.campos['final.opinion_text'];
        const { atencao, naoConformes } = listasResumo(D);
        const veiculo = D.marcaModelo !== 'Não informado' ? `${D.marcaModelo}, placa ${D.os.placa}` : `placa ${D.os.placa}`;
        let t = `A vistoria cautelar do veículo ${veiculo}, realizada em ${dataBR(D.dataVistoria, true)}, resultou no parecer ${PARECER[D.parecerFinal].texto}.`;
        if (naoConformes.length || atencao.length) {
            const partes = [];
            if (naoConformes.length) partes.push(`${naoConformes.length} não conformidade(s)`);
            if (atencao.length) partes.push(`${atencao.length} ponto(s) de atenção`);
            t += ` Foram registrados ${partes.join(' e ')}, relacionados no resumo da análise (seção II) e detalhados nas seções técnicas III a VII.`;
        } else {
            t += ' Não foram constatados indícios de sinistro estrutural, remarcação de numeração ou irregularidades de identificação.';
        }
        return t;
    }

    // Recomendações objetivas ao comprador, a partir das constatações registradas
    function recomendacoes(D) {
        const r = [];
        const chassiMotor = D.d2.chassiOriginal === false || D.d2.motorOriginal === false;
        if (chassiMotor) r.push('Não prosseguir com a aquisição antes de consulta ao DETRAN e perícia oficial da numeração de identificação.');
        if (D.d3.indicioBatida === 'sim' && D.d3.deformacaoEstrutural === 'sim') r.push('Realizar avaliação estrutural especializada antes da aquisição, em razão da deformação constatada.');
        const estrutura = D.estrutura.some(e => e.status !== 'original' && e.status !== 'nao_aplicavel') || D.itensPintura.some(i => i.reparo === 'sim');
        if (estrutura) r.push('Solicitar ao vendedor a documentação dos reparos estruturais realizados (notas fiscais e oficina responsável).');
        if (D.d3.indicioBatida === 'sim') r.push('Realizar alinhamento, balanceamento e inspeção da suspensão em oficina de confiança, em razão dos indícios de batida.');
        if (D.d3.indicioEnchente === 'sim') r.push('Avaliar a parte elétrica, os módulos eletrônicos e os pontos de corrosão, em razão dos indícios de enchente.');
        if (D.itensPintura.some(i => ['REPINTURA', 'REPINTURA COM MASSA', 'AVARIADO'].includes(i.classe))) r.push('Considerar as peças repintadas na negociação e solicitar o histórico de funilaria e pintura.');
        if (D.etiquetas.some(e => e.status === 'danificada' || e.status === 'ausente')) r.push('Confirmar com o vendedor a origem das avarias nas etiquetas de identificação.');
        if (D.vidros.some(v => !v.original || v.desbaste)) r.push('Solicitar comprovação da troca ou do reparo dos vidros com divergência na gravação.');
        if (D.d6.reparoMotor === 'sim') r.push('Solicitar o histórico de manutenção e reparos do compartimento do motor.');
        if (D.d7.intervencaoQuadros === 'sim') r.push('Solicitar a documentação dos reparos nos quadros de porta.');
        if (!D.campos['document.approved_items']) r.push('Confirmar a situação documental do veículo (débitos, restrições e gravames) nos órgãos oficiais.');
        return r;
    }

    function resumoParecer(parecer) {
        if (parecer === 'nao_conforme') return 'Com base nas verificações realizadas, foram constatadas não conformidades que comprometem a segurança da aquisição do veículo.';
        if (parecer === 'com_ressalvas') return 'Com base nas verificações realizadas, o veículo apresenta pontos de atenção que devem ser considerados na decisão de aquisição.';
        return 'Com base nas verificações realizadas, o veículo apresenta as condições descritas neste laudo para sua utilização e aquisição.';
    }

    // ------------------------------------------------------------------
    // Imagens (convertidas em data URL: sem bloqueio de origem na captura)
    // ------------------------------------------------------------------
    const cacheFotos = new Map();
    async function carregarFotoDataUrl(url, maxLado = 1400) {
        if (!url) return null;
        const chave = `${url}|${maxLado}`;
        if (cacheFotos.has(chave)) return cacheFotos.get(chave);
        const tarefa = (async () => {
            try {
                const resp = await fetch(url, { cache: 'force-cache' });
                if (!resp.ok) return null;
                const bmp = await createImageBitmap(await resp.blob());
                const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
                const w = Math.max(1, Math.round(bmp.width * escala)), h = Math.max(1, Math.round(bmp.height * escala));
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
                if (bmp.close) bmp.close();
                const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
                canvas.width = 0; canvas.height = 0;
                return { url: dataUrl, w, h };
            } catch (e) {
                console.warn('Foto indisponível para o laudo:', url, e);
                return null;
            }
        })();
        cacheFotos.set(chave, tarefa);
        const r = await tarefa;
        if (!r) cacheFotos.delete(chave);
        return r;
    }

    async function carregarFotos(D) {
        const mapa = {};
        const fila = D.fotos.filter(f => f.url_original || f.url_thumb);
        let i = 0;
        const trabalhador = async () => {
            while (i < fila.length) {
                const f = fila[i++];
                const r = await carregarFotoDataUrl(f.url_original || f.url_thumb) ||
                    (f.url_thumb ? await carregarFotoDataUrl(f.url_thumb) : null);
                if (r) mapa[f.slotCodigo] = r;
            }
        };
        await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
        return mapa;
    }

    function gerarQrDataUrl(texto) {
        return new Promise(resolve => {
            if (typeof QRCode === 'undefined') return resolve(null);
            try {
                const div = document.createElement('div');
                div.style.cssText = 'position:fixed;left:-9999px;top:0';
                document.body.appendChild(div);
                new QRCode(div, { text: texto, width: 256, height: 256, colorDark: COR.navy, colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
                setTimeout(() => {
                    const canvas = div.querySelector('canvas');
                    const img = div.querySelector('img');
                    const url = canvas ? canvas.toDataURL('image/png') : (img && img.src) || null;
                    div.remove();
                    resolve(url);
                }, 60);
            } catch (e) { resolve(null); }
        });
    }

    function urlConsulta(hash) {
        const origem = (global.location && /^https?:/.test(global.location.protocol)) ? global.location.origin : 'https://certive.com.br';
        return `${origem}/consulta-laudo.html?hash=${encodeURIComponent(hash)}`;
    }

    // ------------------------------------------------------------------
    // Vetores (logo, ícones, selo, silhueta)
    // ------------------------------------------------------------------
    // Emblema oficial: escudo dourado com a frente do carro e o "visto" cruzando o escudo
    let seqSvg = 0;
    // Dourado metálico: faixas alternadas de brilho e sombra, como metal polido
    function gradOuro(id, x2 = 1, y2 = 1) {
        return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">
<stop offset="0" stop-color="#8A6420"/><stop offset=".14" stop-color="#E9C66E"/><stop offset=".26" stop-color="#FFF3C2"/>
<stop offset=".38" stop-color="#D6A443"/><stop offset=".52" stop-color="#9C7224"/><stop offset=".64" stop-color="#E8C263"/>
<stop offset=".76" stop-color="#FFEBA8"/><stop offset=".88" stop-color="#C4912F"/><stop offset="1" stop-color="#7A561A"/></linearGradient>`;
    }

    // Textura escovada: riscos finos de metal polido aplicados sobre o dourado
    function filtroEscovado(id, freq = '0.004 0.55') {
        return `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="11" result="ruido"/>
<feColorMatrix in="ruido" type="saturate" values="0" result="cinza"/>
<feComponentTransfer in="cinza" result="riscos"><feFuncR type="linear" slope="1.4" intercept="-.2"/><feFuncG type="linear" slope="1.4" intercept="-.2"/><feFuncB type="linear" slope="1.4" intercept="-.2"/></feComponentTransfer>
<feBlend in="SourceGraphic" in2="riscos" mode="overlay" result="escovado"/>
<feComposite in="escovado" in2="SourceGraphic" operator="arithmetic" k1="0" k2=".42" k3=".58" k4="0" result="mistura"/>
<feComposite in="mistura" in2="SourceGraphic" operator="in"/>
</filter>`;
    }

    // Brasão Certive: vetorizado a partir do selo de procedência (icons/selo_procedencia.png),
    // coincidência de 98,9% com o original. Escudo, cobertura, frente do carro e visto.
    const BRASAO_PATH = 'M 159.6 10.8 C 146.6 10.9,140.4 11.1,138.6 11.3 C 137.3 11.5,134.9 11.7,133.4 11.7 C 131.9 11.8,129.8 11.9,128.6 12.1 C 127.5 12.3,125.9 12.5,125.1 12.5 C 124.2 12.5,122.4 12.7,121 13 C 119.5 13.2,117.5 13.5,116.4 13.6 C 115.3 13.7,113.6 14,112.8 14.1 C 111.9 14.3,110.7 14.5,110.1 14.5 C 109.6 14.5,108.2 14.7,107.1 15 C 106 15.3,104.5 15.5,103.7 15.5 C 103 15.5,102 15.6,101.5 15.8 C 101 15.9,98.9 16.3,96.9 16.8 C 91.8 17.8,88.5 18.4,86.1 19 C 85 19.3,83.1 19.7,81.8 19.9 C 79.5 20.3,78.2 20.6,75.1 21.4 C 74.4 21.6,72.8 22,71.5 22.3 C 70.2 22.5,67.3 23.3,65.1 23.9 C 62.9 24.5,59.6 25.4,57.8 25.9 C 55.9 26.4,54.2 26.9,54 27 C 53.8 27.1,52.7 27.4,51.5 27.7 C 50.3 28,46.2 29.3,42.4 30.6 C 38.5 32,34.3 33.4,33.1 33.8 C 31.8 34.1,30.5 34.6,30.2 34.8 C 29.9 34.9,28.6 35.4,27.4 35.9 C 20.9 38.2,15.8 40.3,14.5 41.3 C 12.9 42.4,13 38.5,13 91.7 C 13 140,13.1 145.8,13.9 149.1 C 14.1 149.9,14.2 151.4,14.3 152.4 C 14.3 153.3,14.4 154.9,14.5 155.9 C 14.6 156.8,14.9 159,15 160.6 C 15.1 162.3,15.4 164.8,15.7 166.3 C 16 167.7,16.4 170.4,16.6 172.3 C 16.8 174.1,17.2 176.5,17.4 177.6 C 17.7 179.5,17.9 180.5,18.7 186 C 18.9 187,19.3 189.1,19.6 190.6 C 19.9 192.1,20.4 194.3,20.6 195.4 C 20.8 196.5,21.3 198.3,21.6 199.4 C 22 200.5,22.5 202.3,22.7 203.5 C 23 204.7,23.4 206,23.6 206.5 C 23.8 207,24.2 208.6,24.6 210.1 C 25 211.6,25.6 213.8,26 215 C 26.4 216.2,27.2 218.9,27.9 221 C 28.5 223.1,29.5 226,30 227.4 C 30.6 228.8,31 230,31 230.1 C 31 230.2,31.4 231.3,32 232.5 C 32.5 233.7,33.4 235.6,33.9 236.8 C 35.3 239.9,37.2 244.1,38.1 246.2 C 38.6 247.2,39 248.1,39 248.1 C 39 248.2,41.4 252.8,44.6 258.8 C 45.7 260.7,47.1 263.2,47.7 264.3 C 48.4 265.3,49.5 267.1,50.2 268.3 C 52.9 272.9,53.6 274,55.8 277.1 C 57 278.9,58.3 280.8,58.7 281.4 C 59.7 282.8,61.4 285.2,62.8 286.8 C 63.5 287.6,64.6 289,65.2 289.9 C 67.8 293.4,69.4 295.5,71.1 297.2 C 72 298.2,73.5 300,74.4 301.1 C 76.4 303.5,91.5 319,94.5 321.7 C 95.7 322.8,98.8 325.4,101.4 327.5 C 104 329.6,106.6 331.8,107.2 332.4 C 107.9 332.9,109.6 334.2,111 335.3 C 112.4 336.3,114.3 337.7,115.2 338.3 C 116.1 339,117.6 340,118.6 340.7 C 119.6 341.3,120.8 342.2,121.4 342.6 C 121.9 343.1,123.9 344.3,125.8 345.5 C 127.6 346.6,130.5 348.4,132.1 349.4 C 133.8 350.4,136.4 352,138 353 C 139.6 353.9,141.2 355,141.6 355.3 L 142.3 356 167.9 356 L 193.5 356 194.3 355.2 C 195.3 354.3,202.3 349.7,204.7 348.3 C 205.6 347.9,207.7 346.5,209.3 345.4 C 210.8 344.3,212.8 342.9,213.6 342.4 C 214.4 341.9,216 340.7,217.1 339.8 C 218.2 338.9,219.7 337.8,220.5 337.3 C 221.3 336.8,222.4 335.9,223.2 335.4 C 225.4 333.6,228.3 331.2,230 329.8 C 230.9 329,232.6 327.6,233.8 326.8 C 241.8 320.6,253.4 309.2,260.6 300.3 C 261.1 299.7,262.5 298,263.6 296.6 C 269 290.2,275.2 281.4,280.2 273.1 C 281.2 271.3,283.1 268.2,284.3 266.3 C 288.2 259.7,297.6 240.3,299.8 234.4 C 300 233.7,300.7 231.7,301.4 230 C 303 225.8,304.8 220,305.4 217.8 C 305.6 216.7,306.1 215.1,306.4 214.1 C 307.4 210.9,308.7 206.1,309 204.5 C 309.1 203.6,309.5 201.8,309.9 200.4 C 310.8 196.9,311.5 193.6,311.9 190.5 C 312 189.9,312.2 188.5,312.5 187.5 C 312.8 186.5,313.1 184.3,313.4 182.8 C 313.6 181.2,314 178.1,314.3 176 C 315.9 164.5,314.7 159.5,311.4 163.9 C 311.1 164.3,309.2 166.6,307.1 169 C 305.1 171.3,302.1 174.7,300.6 176.5 C 299.1 178.2,297.2 180.5,296.3 181.5 C 294 184.2,293.6 184.9,292.9 187.9 C 292.5 189.4,292 191.5,291.7 192.5 C 291.5 193.5,291 195.7,290.7 197.4 C 290.4 199,290 201.2,289.7 202.1 C 289.5 203.1,289 205,288.6 206.4 C 287.6 210.7,285 219.1,283.1 224.6 C 280.4 232.2,280 233.3,278.3 236.9 C 272 250,266.6 259.5,260.4 268.3 C 259.4 269.6,258.1 271.6,257.4 272.7 C 256.7 273.8,255.6 275.3,254.9 276.1 C 254.2 277,252.9 278.6,252 279.8 C 251.1 280.9,249.6 282.8,248.5 284 C 245.3 287.6,242.7 290.7,239.6 294.4 C 238 296.3,235.4 298.9,234 300.2 C 232.6 301.5,230 303.8,228.4 305.4 C 225.3 308.3,221.2 311.8,218.3 314.2 C 217.4 314.9,216.1 315.9,215.5 316.5 C 214.9 317,213.3 318.2,212 319.1 C 210.7 320.1,208.9 321.4,208 322 C 204.3 324.9,201.7 326.7,199.4 328.2 C 193.7 331.9,192.6 332.6,190.6 333.8 C 189.5 334.5,187.7 335.6,186.5 336.3 C 185.3 337,183.9 337.9,183.3 338.4 C 182.2 339.1,180.2 340.3,177.4 341.8 C 176.7 342.1,175.3 342.9,174.4 343.4 C 173.4 344,172.1 344.8,171.4 345.1 C 168.8 346.6,167.2 346.1,160.9 342.4 C 159.4 341.5,156.7 340,154.9 339.1 C 153.1 338.2,151.3 337.2,150.8 336.8 C 150.3 336.5,148.7 335.4,147.2 334.5 C 145.6 333.6,143.9 332.6,143.4 332.2 C 142.8 331.8,140.9 330.5,139.1 329.3 C 132.9 325.2,129.6 322.9,127.1 321 C 125.8 320,123.9 318.6,123 318 C 122.1 317.4,120.2 316,118.9 314.9 C 117.6 313.8,115.8 312.3,114.9 311.7 C 114.1 311,112.5 309.7,111.5 308.8 C 110.5 307.8,109 306.5,108.1 305.9 C 107.3 305.2,106 304,105.1 303.3 C 104.3 302.5,102.2 300.6,100.5 299.2 C 98.8 297.7,96.2 295.2,94.7 293.6 C 93.3 292,90.9 289.4,89.5 287.9 C 88 286.4,86.2 284.3,85.4 283.3 C 84.6 282.2,83.4 280.8,82.7 280.1 C 81.3 278.6,75.4 270.7,72.5 266.5 C 69.5 262.2,67.8 259.5,62.1 249.8 C 60.5 247,57.4 241.2,56 238.1 C 55.1 236.3,53.9 233.8,53.3 232.4 C 52.2 230.1,51.5 228.4,48.6 221 C 48.1 219.8,47.3 217.4,46.7 215.5 C 45.6 212.3,45.1 210.6,42.8 203.1 C 42.2 201.3,41.5 198.6,41.1 197.1 C 40.8 195.6,40.4 194.1,40.2 193.8 C 40.1 193.5,39.7 191.7,39.4 189.9 C 39 188.1,38.5 185.6,38.2 184.3 C 37.3 179.8,36.8 176.8,36.8 176.2 C 36.8 175.9,36.5 174.8,36.3 173.7 C 36 172.7,35.7 171,35.5 169.9 C 35.4 168.8,35.1 166.9,35 165.8 C 34.8 164.6,34.5 162.4,34.2 161 C 34 159.5,33.8 157.4,33.8 156.2 C 33.8 155,33.6 152.5,33.4 150.7 C 32.9 146.4,32.8 121.9,33.2 102.3 C 33.4 94.6,33.5 82,33.5 74.2 C 33.5 59.4,33.6 57.8,34.6 56.8 C 35.9 55.5,41.1 53.2,49.4 50.3 C 60.6 46.4,65 45,75.1 42.3 C 77.1 41.7,79.2 41.1,79.9 40.9 C 80.6 40.7,82.3 40.3,83.6 40 C 85 39.7,86.6 39.3,87.3 39.1 C 87.9 38.9,90.3 38.3,92.8 37.8 C 95.2 37.2,98.3 36.5,99.8 36.1 C 101.2 35.8,102.7 35.5,103 35.5 C 103.4 35.5,104.1 35.3,104.7 35.2 C 105.2 35,106.4 34.7,107.3 34.6 C 108.1 34.5,109.5 34.3,110.3 34.1 C 111 33.9,112.2 33.7,112.9 33.6 C 113.6 33.5,114.7 33.3,115.5 33.1 C 117.1 32.7,121.8 32.1,125.6 31.7 C 127.1 31.6,129 31.3,129.8 31.1 C 130.5 30.9,133.2 30.6,135.6 30.5 C 138.1 30.4,141.2 30.1,142.5 29.9 C 144 29.7,146.7 29.5,149.5 29.5 C 153.5 29.5,154.4 29.4,156.3 28.9 C 159.5 28.1,176.8 28.1,183.6 29 C 186.1 29.3,190.4 29.6,193.1 29.7 C 198.7 30,204.3 30.5,208.4 31.2 C 209.9 31.5,212 31.8,213.1 31.9 C 214.2 32,216.1 32.2,217.3 32.4 C 218.4 32.6,220.1 32.8,220.9 32.9 C 221.7 33,223.1 33.2,223.9 33.4 C 224.7 33.6,226.2 33.9,227.3 34 C 229.8 34.3,233.4 34.9,235.9 35.5 C 237 35.8,238.2 36,238.7 36 C 239.5 36,241 36.3,244.8 37.4 C 245.9 37.7,248.4 38.3,250.3 38.7 C 261.1 41.2,272.4 44.6,282.1 48.3 C 283.9 49,286.7 50,288.3 50.6 C 293.2 52.3,297.5 54.3,298.1 55.1 C 298.6 55.8,298.6 55.9,298.7 78 C 298.7 101.2,298.7 101.6,299.5 102 C 300.6 102.6,304.3 99.8,308.9 94.8 C 317.2 86.1,318 85.2,318.6 83.9 L 319.2 82.6 319.3 62.9 C 319.3 41.7,319.4 42.4,318 41.1 C 317.1 40.3,312.8 38.1,310.9 37.5 C 310.3 37.3,309.5 37,309.1 36.8 C 308.7 36.6,307.4 36.1,306.1 35.6 C 303.9 34.8,301.9 34,299.2 32.8 C 298.4 32.5,297.1 32.1,296.4 31.9 C 295.6 31.7,294.5 31.2,293.8 30.9 C 293.2 30.6,291.7 30.1,290.6 29.8 C 289.5 29.4,288.2 29,287.8 28.8 C 287.3 28.5,285.9 28.1,284.6 27.8 C 283.4 27.5,281.9 27,281.3 26.7 C 280.6 26.5,279.2 26,278 25.6 C 276.8 25.3,275.2 24.8,274.4 24.5 C 272.1 23.8,268.7 22.8,265.6 22 C 264.1 21.6,262.1 21,261.3 20.8 C 260.4 20.5,258.4 20,257 19.8 C 255.6 19.5,253.7 19,252.9 18.7 C 252.1 18.5,250 18,248.4 17.7 C 246.7 17.5,244.6 17,243.6 16.7 C 242.7 16.5,241.1 16.1,240.1 16 C 236.6 15.5,234.8 15.2,232.8 14.7 C 231.6 14.5,229.7 14.1,228.6 14 C 223 13.3,220.7 13,219 12.6 C 218 12.4,215.2 12.2,212.9 12 C 210.5 11.9,208.5 11.7,208.3 11.6 C 208.1 11.5,205.6 11.4,202.7 11.3 C 199.8 11.1,196.5 10.9,195.5 10.8 C 193.4 10.5,186.3 10.5,159.6 10.8 M 150.1 52.4 C 148.5 52.6,144.8 52.8,141.9 52.9 C 139 53,135.4 53.2,133.8 53.4 C 132.2 53.6,130.3 53.8,129.4 53.8 C 127.8 53.8,123.2 54.3,118.4 55.1 C 117.1 55.3,115.2 55.6,114.1 55.7 C 111.7 56,109.8 56.4,107 57 C 105.8 57.3,104.3 57.5,103.6 57.6 C 102.3 57.8,98.1 58.6,95.5 59.1 C 94.6 59.3,92.4 59.7,90.6 60 C 88.8 60.3,86.4 60.8,85.1 61.1 C 83.9 61.5,81.9 62,80.8 62.2 C 77.7 62.9,72.6 64.3,67.1 65.8 C 64.5 66.6,61.5 67.4,60.4 67.6 C 55.8 68.7,56.2 66.1,56.3 95.1 L 56.4 119.5 56.9 120.1 C 57.6 120.7,70.4 120.9,72.3 120.3 C 74.1 119.7,74.1 120,74.2 107.4 C 74.3 88.1,74.5 84.1,75.6 83 C 76.3 82.4,79 81.3,82.8 80.4 C 84.1 80,85.9 79.5,86.9 79.3 C 87.8 79,89.8 78.5,91.1 78.2 C 94.7 77.5,98.6 76.5,100.5 76 C 102.9 75.3,105.4 74.8,107.5 74.5 C 110.4 74.2,112.9 73.8,115.3 73.2 C 116.4 73,118.2 72.7,119.1 72.6 C 120.1 72.5,121.7 72.3,122.6 72.1 C 123.6 71.9,125.1 71.7,126.1 71.6 C 127 71.6,128.8 71.3,130.1 71 C 131.5 70.7,133.4 70.5,135 70.5 C 136.4 70.5,138.4 70.3,139.3 70.1 C 140.3 69.8,143.1 69.6,147.8 69.5 C 151.5 69.4,157.2 69.2,160.4 69 C 164.8 68.8,167.5 68.8,172.1 69 C 175.4 69.1,181.4 69.4,185.4 69.5 C 192.6 69.7,194.1 69.8,197.3 70.3 C 198.1 70.4,200.5 70.6,202.4 70.7 C 204.3 70.9,206.7 71.1,207.8 71.3 C 208.8 71.5,211.5 72,213.8 72.3 C 216 72.5,218.9 73,220.3 73.3 C 221.6 73.5,223.5 73.9,224.6 74 C 226.5 74.3,228.5 74.6,233.4 75.6 C 237.6 76.5,239.2 76.8,241.1 77.4 C 242.2 77.7,244 78.1,245.1 78.4 C 246.2 78.6,247.6 79,248.3 79.3 C 248.9 79.5,250.5 80,251.8 80.2 C 259.1 81.9,258.5 79.8,258.6 101.7 L 258.7 118.8 259.3 119.4 C 260.1 120.2,261.2 120.3,271.4 120.6 C 276.1 120.8,276.8 120.7,277.4 119.5 C 278 118.3,277.9 72.1,277.3 70.8 C 276.8 69.8,275.7 69,274.2 68.4 C 271.7 67.5,267.9 66.4,265.7 65.8 C 264.4 65.5,262.8 65.1,262.3 64.9 C 261.8 64.6,260 64.1,258.3 63.7 C 256.6 63.3,255 62.9,254.7 62.7 C 254.5 62.6,252.9 62.2,251.2 61.9 C 249.5 61.5,247.5 61,246.8 60.8 C 246 60.5,244 60.1,242.4 59.8 C 240.7 59.4,238.6 59,237.6 58.7 C 235.8 58.3,234.5 58,231 57.4 C 229.9 57.2,228.6 56.9,228.1 56.8 C 227.3 56.5,223.6 55.9,219.9 55.4 C 218.5 55.2,216.6 54.9,215.8 54.7 C 214.9 54.4,213.5 54.2,212.6 54.2 C 211.8 54.2,210.6 54.1,209.9 54 C 209.2 53.9,206.8 53.6,204.6 53.5 C 202.4 53.4,199.8 53.2,198.9 53 C 193.6 52.2,156.7 51.8,150.1 52.4 M 325.8 96.1 C 325.6 96.3,324.2 97.8,322.7 99.4 C 321.3 101,319.2 103.4,318 104.6 C 316.9 105.9,315.3 107.7,314.6 108.6 C 313.9 109.6,312.1 111.8,310.6 113.5 C 306.1 118.8,301.4 124.5,300.1 126.3 C 299.4 127.2,297.8 129.3,296.4 131 C 295 132.7,293.1 135,292.3 136.1 C 288.7 140.7,288.1 141.4,286.6 143.1 C 284.6 145.5,276.2 155.9,274.4 158.4 C 273.5 159.5,272 161.3,271 162.5 C 270 163.7,267.7 166.5,266 168.7 C 264.3 171,262.3 173.5,261.6 174.3 C 260.9 175.2,259.8 176.6,259.1 177.5 C 258.4 178.5,257.1 180.1,256.1 181.2 C 255.2 182.3,253.6 184.1,252.7 185.3 C 249.4 189.3,248.4 190.6,246.4 192.8 C 245.3 194,243.4 196.3,242.2 197.8 C 241 199.4,239.4 201.2,238.8 201.9 C 238.1 202.6,237.3 203.6,236.9 204.1 C 236.5 204.7,235.6 205.8,234.8 206.6 C 234.1 207.5,232.7 209.2,231.7 210.4 C 229.1 213.6,223.9 219.8,223.1 220.5 C 222.8 220.8,222.1 221.6,221.7 222.3 C 220.7 223.6,218.3 226.7,216.8 228.3 C 216.3 228.9,214.8 230.7,213.7 232.3 C 211.3 235.4,209.9 237.1,207.9 239.4 C 206.5 241,203.4 245,201.4 247.9 C 200.7 248.8,199.6 250.2,198.9 251 C 198.2 251.8,196.1 254.2,194.4 256.4 C 192.6 258.6,190.2 261.4,189.1 262.6 C 187.9 263.8,186.8 265.2,186.5 265.8 C 186.2 266.4,184.5 268.3,182.8 270.1 C 181 271.9,179.2 273.9,178.8 274.5 C 176.9 277.2,175 278.5,173.7 277.9 C 172.4 277.3,159.6 264.4,157.2 261.2 C 156.7 260.5,153.4 256.9,149.9 253.3 C 146.4 249.7,143 246.1,142.3 245.3 C 141.7 244.5,140.4 243,139.4 242 C 137.8 240.3,136.2 238.5,133.8 235.5 C 131 232,128.9 232.8,123.5 239.3 C 122.2 240.8,120.1 243.2,118.8 244.5 C 116.4 247.1,115.9 248.1,116.6 249.1 C 117.3 250.2,122.3 255.8,127.2 261 C 129.9 263.8,133.6 267.8,135.4 269.9 C 137.3 271.9,140 275,141.5 276.6 C 143 278.3,144.6 280.1,145 280.6 C 145.5 281.2,147 282.9,148.5 284.4 C 150 285.9,153 289.2,155.2 291.7 C 157.5 294.2,159.4 296.3,159.5 296.3 C 159.6 296.3,162.5 299.1,165.9 302.5 C 175.1 311.7,174.4 311.5,179.5 305.3 C 185.1 298.5,186.2 297.2,186.6 296.9 C 186.8 296.8,187.6 295.9,188.4 294.8 C 189.1 293.7,189.9 292.7,190.2 292.4 C 191.9 290.5,194.1 287.9,196.4 285 C 197.8 283.1,199.7 280.8,200.6 279.8 C 201.4 278.8,202.5 277.4,203 276.8 C 203.5 276.1,204.8 274.4,205.9 273.1 C 207 271.7,209.1 269.2,210.5 267.4 C 211.9 265.6,213.9 263.2,214.9 262 C 216.9 259.6,220 255.8,222.5 252.6 C 223.4 251.5,225.1 249.3,226.2 247.8 C 227.4 246.3,228.9 244.6,229.5 243.9 C 230.7 242.4,233.4 239.1,235.5 236.4 C 236.2 235.4,237.6 233.7,238.6 232.5 C 239.6 231.3,241.1 229.4,241.9 228.3 C 244.2 225.6,246.4 222.8,248.7 220 C 251.5 216.8,255.6 211.5,257 209.7 C 259.5 206.2,263.4 201.5,267.4 196.8 C 269.8 194.2,271.5 192,274.4 188.3 C 275.5 186.9,278.1 183.6,280.3 180.9 C 282.5 178.3,284.9 175.3,285.8 174.3 C 286.6 173.2,288.9 170.4,290.9 168 C 292.9 165.6,295.2 162.8,296 161.8 C 296.8 160.7,298.6 158.5,299.9 156.9 C 301.3 155.3,303.2 152.9,304.1 151.7 C 305.1 150.5,307.1 148.1,308.6 146.3 C 310.1 144.4,312.6 141.5,314 139.8 C 315.4 138,317.2 135.9,318 135 C 321.4 131.1,323.4 128.7,326.6 124.7 C 328.6 122.4,330.8 119.7,331.6 118.8 C 332.5 117.9,333.8 116.2,334.7 115.1 C 335.6 113.9,336.9 112.4,337.6 111.6 C 340.5 108.4,340.5 107.5,337.6 105 C 337.1 104.5,334.9 102.5,332.8 100.4 C 327.8 95.6,327.1 95.2,325.8 96.1 M 142.9 102.5 C 135.9 102.7,131.7 102.9,126.9 103.2 C 125.1 103.4,121.9 103.5,119.9 103.6 C 117.8 103.7,115.6 103.9,115 104 C 114.4 104.2,112.8 104.4,111.5 104.5 C 106.3 104.9,105 106.2,93.2 121.5 C 91.8 123.2,90 125.5,89.2 126.6 C 88.3 127.7,87 129.4,86.3 130.3 C 82.4 135.5,83.3 135.3,70.6 135.3 C 57.2 135.3,58.3 134.7,58.3 141.8 C 58.3 147.8,58.2 147.7,62.8 147.7 C 64.3 147.8,66 147.9,66.8 148.1 C 67.5 148.3,68.6 148.5,69.2 148.5 C 71.4 148.5,70.9 149.7,67.5 152.6 C 62.7 156.6,59 160.3,58.6 161.3 C 58.2 162.3,58.1 186.8,58.5 208.1 C 58.6 217.5,57.7 216.5,66.2 216.5 C 74.9 216.5,90 216.1,90.9 215.8 C 92.4 215.4,92.6 214.7,92.8 209.7 C 92.9 206.4,93.1 205.1,93.3 204.6 C 94 203.6,89 203.8,141.3 203.2 C 155.5 203.1,170.1 202.9,173.6 202.8 C 181.9 202.6,197.4 202.6,198.5 202.8 C 199.8 203.1,218.2 203.4,219.3 203.2 C 220.5 202.9,221.5 202,223.9 198.7 C 225 197.3,226.3 195.6,226.9 194.9 C 228.2 193.3,231.4 189.2,232.2 188 C 232.6 187.5,233.6 186.3,234.5 185.4 C 236 183.7,239.8 178.6,240.5 177.3 C 241.6 175.2,240.2 174.3,235.7 174.3 C 230.9 174.2,229.2 173.6,226.8 170.7 C 224.1 167.6,224.1 167.5,237.6 163 C 240.8 161.9,244.7 160.5,246.4 159.8 C 248.1 159.1,250.3 158.3,251.3 158 C 256.4 156.5,262.6 152.1,265.2 148.2 C 265.8 147.2,267 145.6,267.8 144.6 C 268.6 143.6,269.8 141.7,270.6 140.5 C 273.8 135.4,274.1 135.6,261.3 135.4 C 250.7 135.2,251.3 135.5,247.9 130.6 C 247.3 129.8,245.6 127.6,244.1 125.8 C 242.7 123.9,240.6 121.2,239.5 119.8 C 235.8 114.6,229.7 107.7,228.2 106.8 C 225.3 105,219.8 103.8,213.1 103.5 C 210.5 103.4,207.8 103.2,207 103 C 204 102.5,158.2 102.1,142.9 102.5 M 158.1 111 C 155.8 111.1,149.9 111.3,145.1 111.5 C 140.3 111.6,134.5 111.9,132.1 112.1 C 129.8 112.4,125.4 112.6,122.4 112.7 C 112.9 113.1,112.2 113.4,108.2 118.2 C 107.3 119.2,106 120.9,105.1 121.8 C 103.5 123.7,102 125.7,98.9 130 C 97.8 131.5,96.1 133.7,95.2 134.7 C 94.3 135.8,93.1 137.4,92.4 138.3 C 91.7 139.1,90.5 140.6,89.8 141.5 C 86.1 145.7,85.3 147.3,86.2 148.2 C 87 149,92.6 151.5,93.5 151.5 C 93.7 151.5,94.9 151.9,96.3 152.5 C 102 154.7,107.3 155.9,114.5 156.9 C 119.3 157.5,119.6 157.5,131.6 157.6 C 137.8 157.7,145 157.9,147.6 158 C 156.9 158.5,193.7 158,207.3 157.3 C 215.9 156.8,224 155.7,228 154.5 C 229.3 154.1,231 153.6,231.9 153.5 C 232.7 153.3,234.6 152.8,236 152.4 C 247.2 148.9,247.5 148.8,248.3 147.8 C 249 147.1,248.8 146.4,247.6 144.9 C 245.1 141.9,243.2 139.6,241.5 137.4 C 238.2 133.1,232.7 126.1,231.1 124.1 C 230.4 123.3,229.1 121.6,228.1 120.4 C 222.6 113.2,222.8 113.2,209.5 112.7 C 206.1 112.6,202.1 112.3,200.5 112.1 C 198.9 111.9,194 111.6,189.6 111.5 C 185.2 111.4,178.9 111.1,175.5 111 C 168.5 110.7,164.2 110.7,158.1 111 M 74.7 157 C 72.4 158.5,69.8 162.5,69.1 165.6 C 68.9 166.6,68.6 167.9,68.4 168.5 C 66.9 172.7,68.3 173.4,79.5 174 C 82 174.1,85.9 174.5,88.1 174.8 C 98.5 176.1,106.7 174.6,110 170.9 C 111.9 168.6,111.4 168.2,104.5 166.1 C 99.9 164.8,93.4 162.4,81.8 157.8 C 77.4 156,76.4 155.9,74.7 157 M 199.6 171.6 C 195.1 172.1,190.3 172.4,188.1 172.4 C 187.2 172.3,182 172.2,176.8 172.1 C 165.6 171.9,160.7 171.9,147.5 172.1 C 140.2 172.3,136.5 172.2,132.1 171.9 C 126.1 171.5,123.7 171.6,122.4 172.3 C 121 173.1,109.3 183.1,107.9 184.8 C 106.1 186.9,108.1 188,113.9 188.2 C 123.8 188.4,136.2 188.8,141 189 C 150.8 189.4,152.3 189.5,166.8 189.6 C 180.3 189.8,189.8 189.6,199.3 189 C 201.2 188.9,205.7 188.7,209.3 188.6 C 223.6 188.3,224.9 188.1,224.4 185.7 C 223.9 183.7,213.5 173,211 171.9 C 209.7 171.4,203.7 171.2,199.6 171.6 M 68 184.5 C 67.5 184.7,67.5 184.7,67.6 189.4 C 67.8 194.6,67.9 195,68.9 195.7 C 70 196.4,92.8 196.5,95.7 195.8 C 99.7 194.8,99.4 193.9,94.6 192.1 C 88.3 189.8,83 188,82 187.9 C 81.4 187.8,80.6 187.5,80.1 187.4 C 79.7 187.2,78.6 186.9,77.7 186.7 C 76.8 186.4,75.2 186,74.1 185.6 C 71.6 184.8,68.7 184.3,68 184.5';

    function svgLogo(tam = 44) {
        const id = `lgOuro${++seqSvg}`;
        return `<svg width="${tam}" height="${Math.round(tam * 356 / 348)}" viewBox="0 0 348 356" xmlns="http://www.w3.org/2000/svg">
<defs>${gradOuro(id)}${filtroEscovado(`${id}e`)}
<clipPath id="${id}c"><path d="${BRASAO_PATH}" fill-rule="evenodd"/></clipPath>
<radialGradient id="${id}b" cx=".3" cy=".22" r=".75"><stop offset="0" stop-color="#FFF8DC" stop-opacity=".55"/><stop offset=".45" stop-color="#FFF8DC" stop-opacity=".08"/><stop offset="1" stop-color="#FFF8DC" stop-opacity="0"/></radialGradient></defs>
<path d="${BRASAO_PATH}" fill="#3a2607" fill-opacity=".85" fill-rule="evenodd" transform="translate(2 3)"/>
<path d="${BRASAO_PATH}" fill="url(#${id})" fill-rule="evenodd" filter="url(#${id}e)"/>
<path d="${BRASAO_PATH}" fill="url(#${id}b)" fill-rule="evenodd"/>
<path d="${BRASAO_PATH}" fill="none" stroke="#FFF1C4" stroke-opacity=".45" stroke-width="2.2" clip-path="url(#${id}c)"/>
</svg>`;
    }

    function logoHtml(escala = 1) {
        return `<div class="logo" style="--e:${escala}">${svgLogo(46 * escala)}
<div class="logo-txt"><div class="logo-nome">CERTIVE</div><div class="logo-sub">VISTORIAS</div></div></div>`;
    }

    const ICONES = {
        escudo: '<path d="M12 2.6l7.6 2.9v5.9c0 4.9-3.2 8.6-7.6 10-4.4-1.4-7.6-5.1-7.6-10V5.5z"/><path d="M8.4 12.1l2.5 2.5 4.8-5"/>',
        lupa: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.2 5.2"/><path d="M8 10.5h5M10.5 8v5"/>',
        documento: '<path d="M6 2.8h8.2L18.4 7v14.2H6z"/><path d="M14 2.8V7h4.4"/><path d="M8.8 11.2h6.8M8.8 14.3h6.8M8.8 17.4h4"/>',
        identificacao: '<path d="M5.5 2.8h8.7L18.5 7v14.2h-13z"/><path d="M14 2.8V7h4.5"/><circle cx="11" cy="13.3" r="3"/><path d="M13.2 15.5l3 3"/>',
        // pistola de pintura automotiva (caneca por gravidade, bico à esquerda, cabo e gatilho)
        pistola: '<path d="M6.2 9.2H16a2.4 2.4 0 0 1 0 4.8H6.2z"/><path d="M3.2 9.9h3v3.4h-3z"/><path d="M1.2 10.3l-.6-.7M1.2 12.9l-.6.7M1 11.6H.3"/><path d="M10.2 9.2V7.4"/><path d="M8.2 7.4h4l-.8-4.4H9z"/><path d="M14.4 14l2.3 7.2h3l-1.9-7.4"/><path d="M12.3 14c-.5 2.2-.2 3.7.9 4.9"/>',
        motor: '<path d="M3 10.5h2.2V8.2h3.2V6.3h6.3v1.9h2.1l2.3 2.3H21v6.1h-1.9l-2.3 2.3H8.1l-2.1-2.1H3z"/><path d="M10 11.5l-1.2 2.6h2.6l-1.2 2.6"/>',
        engrenagem: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/><circle cx="12" cy="12" r="6.4"/>',
        carro: '<path d="M3.2 15.2l1.9-4.9c.4-1.1 1.3-1.7 2.4-1.7h9c1.1 0 2 .6 2.4 1.7l1.9 4.9v3.3H3.2z"/><path d="M3.2 15.2h17.6"/><circle cx="7.3" cy="18.5" r="1.9"/><circle cx="16.7" cy="18.5" r="1.9"/><path d="M7 8.6l1.4-3.2h7.2L17 8.6"/>',
        vidro: '<path d="M4 19.5L6.8 5.2h10.4L20 19.5z"/><path d="M9 9.5l3.5-2.3M9.6 13.2l6-4"/>',
        banco: '<path d="M8.2 2.8h4.6c1 0 1.6.8 1.4 1.8L13 11.6h4c1 0 1.7.9 1.5 1.9l-.7 3.7H7.6z"/><path d="M9.2 17.2v4M16.2 17.2v4"/>',
        gota: '<path d="M12 2.8s6.3 6.9 6.3 11.4a6.3 6.3 0 0 1-12.6 0C5.7 9.7 12 2.8 12 2.8z"/><path d="M8.8 14.6c.3 1.6 1.5 2.7 3.1 2.9"/>',
        colisao: '<path d="M2.8 16.8l1.6-4.2c.4-1 1.2-1.5 2.2-1.5h5.6c1 0 1.8.5 2.2 1.5l1.6 4.2v2.7H2.8z"/><circle cx="6.4" cy="19.5" r="1.4"/><circle cx="12.4" cy="19.5" r="1.4"/><path d="M18.6 3.2l.6 2.6 2.4-1-1.3 2.3 2.4 1-2.6.6.9 2.5-2.2-1.5-1.3 2.2-.5-2.6"/>',
        alerta: '<path d="M12 3.2l9.6 16.6H2.4z"/><path d="M12 9.6v5M12 17.4v.4"/>',
        relatorio: '<path d="M6 2.8h8.2L18.4 7v14.2H6z"/><path d="M14 2.8V7h4.4"/><path d="M8.8 13.6l2.1 2.1 4.1-4.3"/>'
    };

    function icone(nome, cor = '#fff', tam = 24, espessura = 1.7) {
        return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="${espessura}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${ICONES[nome] || ''}</svg>`;
    }

    function marcaStatus(cls, tam = 16) {
        const cor = cls === 'ok' ? COR.verde : (cls === 'nc' ? COR.vermelho : COR.ambar);
        if (cls === 'ok') return `<svg width="${tam}" height="${tam}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7.5" fill="${cor}"/><path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        if (cls === 'nc') return `<svg width="${tam}" height="${tam}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7.5" fill="${cor}"/><path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
        return `<svg width="${tam}" height="${tam}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.2l7.2 13H.8z" fill="${cor}" stroke="${cor}" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 5.8v4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="12" r=".95" fill="#fff"/></svg>`;
    }

    // Escudo grande do parecer: visto (conforme), exclamação (ressalva) ou X (não conforme)
    function svgEscudoParecer(parecer, tam = 96) {
        const cor = parecer === 'nao_conforme' ? '#D0606F' : (parecer === 'com_ressalvas' ? '#E6A95C' : '#E9CF8C');
        const dentro = parecer === 'nao_conforme'
            ? `<path d="M24 25l16 16M40 25L24 41" stroke="${cor}" stroke-width="5" stroke-linecap="round"/>`
            : (parecer === 'com_ressalvas'
                ? `<path d="M32 20v15" stroke="${cor}" stroke-width="5.4" stroke-linecap="round"/><circle cx="32" cy="44" r="3.2" fill="${cor}"/>`
                : `<path d="M21.5 33.5l7.2 7.2 14-14.5" fill="none" stroke="${cor}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>`);
        return `<svg width="${tam}" height="${Math.round(tam * 1.12)}" viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="lgEsc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DFA4"/><stop offset=".5" stop-color="#C9A961"/><stop offset="1" stop-color="#8C6C2B"/></linearGradient></defs>
<path d="M32 3 L59 12.5 V34 C59 52 46.5 64.5 32 70 C17.5 64.5 5 52 5 34 V12.5 Z" fill="#0f2a52" stroke="url(#lgEsc)" stroke-width="3.6" stroke-linejoin="round"/>
<path d="M32 10 L52.5 17.2 V34 C52.5 48 43 58 32 62.6 C21 58 11.5 48 11.5 34 V17.2 Z" fill="none" stroke="url(#lgEsc)" stroke-width="1.2" opacity=".7"/>
${dentro}</svg>`;
    }

    // Selo circular: "CERTIVE VISTORIAS • CAUTELAR" em cima, cidade e data embaixo, emblema no centro
    // Selo (desenho do selo de procedência): anel dourado, "LAUDO CAUTELAR" no alto,
    // semicírculo interno com dois traços curtos de cada lado, brasão, nome e estrelas.
    function svgSelo(cidade, ano, tam = 200, aprovado = false) {
        const id = `lgSelo${++seqSvg}`;
        const C = 200, cy = 212;
        const pt = (r, g) => [(C + r * Math.cos(g * Math.PI / 180)).toFixed(1), (cy - r * Math.sin(g * Math.PI / 180)).toFixed(1)];
        const arco = (r, g1, g2) => { const [x1, y1] = pt(r, g1), [x2, y2] = pt(r, g2); return `M ${x1} ${y1} A ${r} ${r} 0 ${Math.abs(g1 - g2) > 180 ? 1 : 0} 1 ${x2} ${y2}`; };
        const estrela = (x, y, r) => {
            const p = [];
            for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .42 : r, g = -90 + i * 36; p.push(`${(x + rr * Math.cos(g * Math.PI / 180)).toFixed(1)},${(y + rr * Math.sin(g * Math.PI / 180)).toFixed(1)}`); }
            return `<polygon points="${p.join(' ')}" fill="url(#${id})"/>`;
        };
        const base = `${String(cidade || '').toUpperCase()} • ${ano}`;
        return `<svg width="${tam}" height="${tam}" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
<defs>
${gradOuro(id)}${filtroEscovado(`${id}e`, '0.003 0.45')}
<radialGradient id="${id}r" cx=".5" cy=".4" r=".62"><stop offset="0" stop-color="#17325b"/><stop offset="1" stop-color="#081326"/></radialGradient>
<path id="${id}t" d="M 54 200 A 146 146 0 0 1 346 200"/>
<path id="${id}b" d="M 38 200 A 162 162 0 0 0 362 200"/>
</defs>
<circle cx="200" cy="200" r="193" fill="url(#${id}r)"/>
<circle cx="200" cy="200" r="190" fill="none" stroke="#4a320b" stroke-width="12" transform="translate(1.5 2)"/>
<g filter="url(#${id}e)">
<circle cx="200" cy="200" r="190" fill="none" stroke="url(#${id})" stroke-width="11"/>
<circle cx="200" cy="200" r="176" fill="none" stroke="url(#${id})" stroke-width="2.4"/>
<text font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="29" letter-spacing="1.6" fill="url(#${id})"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">LAUDO CAUTELAR</textPath></text>
<path d="${arco(130, 196, -16)}" fill="none" stroke="url(#${id})" stroke-width="8" stroke-linecap="round"/>
<path d="${arco(149, 196, 172)} ${arco(149, 8, -16)}" fill="none" stroke="url(#${id})" stroke-width="6" stroke-linecap="round"/>
<path d="${arco(162, 196, 176)} ${arco(162, 4, -16)}" fill="none" stroke="url(#${id})" stroke-width="6" stroke-linecap="round"/>
</g>
<g transform="translate(126 94) scale(.425)">${svgLogo(348).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
<g filter="url(#${id}e)">
${[-2, -1, 0, 1, 2].map(i => estrela(200 + i * 30, 309, 10.5)).join('')}
${aprovado
            ? `<text font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="27" letter-spacing="2" fill="url(#${id})"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">APROVADO</textPath></text>`
            : `<text font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="17" letter-spacing="2" fill="url(#${id})"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(base)}</textPath></text>`}
</g>
</svg>`;
    }

    // Fundo da capa: painéis diagonais em azul, textura de linhas e filetes dourados
    function svgFundoCapa() {
        const id = `fc${++seqSvg}`;
        return `<svg width="${PAG.w}" height="${PAG.h}" viewBox="0 0 ${PAG.w} ${PAG.h}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e1f3b"/><stop offset=".5" stop-color="#0a172d"/><stop offset="1" stop-color="#070f1f"/></linearGradient>
<linearGradient id="${id}o" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${PAG.w}" y2="0"><stop offset="0" stop-color="#E8B650" stop-opacity="0"/><stop offset=".5" stop-color="#F3CD72"/><stop offset="1" stop-color="#E8B650" stop-opacity=".2"/></linearGradient>
<pattern id="${id}p" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M 3.5 0 V 7" stroke="#ffffff" stroke-opacity=".045" stroke-width="1"/></pattern>
</defs>
<rect width="${PAG.w}" height="${PAG.h}" fill="url(#${id}g)"/>
<polygon points="0,0 470,0 0,470" fill="#16305a" fill-opacity=".45"/>
<polygon points="0,0 300,0 0,300" fill="url(#${id}p)"/>
<polygon points="470,0 ${PAG.w},0 ${PAG.w},330" fill="#1a3866" fill-opacity=".35"/>
<polygon points="0,470 330,${PAG.h} 0,${PAG.h}" fill="#05101f" fill-opacity=".55"/>
<polygon points="${PAG.w},560 ${PAG.w},${PAG.h} 420,${PAG.h}" fill="#10264a" fill-opacity=".35"/>
<path d="M 790 0 L 530 200" stroke="url(#${id}o)" stroke-width="1.4"/>
<path d="M ${PAG.w} 150 L 470 420" stroke="url(#${id}o)" stroke-width="1.1"/>
<path d="M ${PAG.w} 205 L 560 400" stroke="url(#${id}o)" stroke-width=".7" opacity=".7"/>
<path d="M 0 900 L 260 ${PAG.h}" stroke="url(#${id}o)" stroke-width=".9" opacity=".6"/>
<rect x="7" y="7" width="${PAG.w - 14}" height="${PAG.h - 14}" fill="none" stroke="#E8B650" stroke-opacity=".75" stroke-width="1.2"/>
</svg>`;
    }

    // Proporções da vista superior por tipo de carroceria (frações do comprimento)
    const CARROCERIAS = {
        hatch: { L: 430, W: 150, capo: .27, para: .38, teto: .80, vigia: .88 },
        sedan: { L: 470, W: 150, capo: .28, para: .37, teto: .66, vigia: .76 },
        suv: { L: 462, W: 160, capo: .26, para: .35, teto: .84, vigia: .90 },
        pickup: { L: 486, W: 162, capo: .25, para: .33, teto: .56, vigia: .59, cacamba: true },
        van: { L: 480, W: 158, capo: .12, para: .21, teto: .94, vigia: .96 },
        minivan: { L: 470, W: 156, capo: .19, para: .29, teto: .87, vigia: .92 },
        cupe: { L: 450, W: 150, capo: .31, para: .41, teto: .66, vigia: .77, duasPortas: true },
        outro: { L: 470, W: 150, capo: .28, para: .37, teto: .66, vigia: .76 }
    };

    /**
     * Vista superior do veículo (frente para cima; lado esquerdo do desenho =
     * lado do motorista). Retorna o SVG e a posição (%) de cada marcador 1–19.
     */
    function silhueta(tipo) {
        const c = CARROCERIAS[tipo] || CARROCERIAS.sedan;
        const VW = 240, VH = 520, cx = VW / 2;
        const y0 = (VH - c.L) / 2, y1 = y0 + c.L, L = c.L;
        const x0 = cx - c.W / 2, x1 = cx + c.W / 2;
        const Y = f => y0 + L * f;
        const yCapo = Y(c.capo), yPara = Y(c.para), yTeto = Y(c.teto), yVigia = Y(c.vigia);
        const yParaChoqueD = Y(.045), yParaChoqueT = Y(.955);
        const eixoD = Y(.17), eixoT = Y(.80);
        const rF = c.W * .30, rT = c.W * .20;
        const yA = yCapo + (yPara - yCapo) * .45;
        const yB = c.duasPortas ? yTeto - (yTeto - yPara) * .15 : yPara + (yTeto - yPara) * .52;
        const yC = yTeto;
        const roda = (x, y) => `<rect x="${x - 7}" y="${y - 27}" width="14" height="54" rx="5" fill="#1d232b"/>`;

        let corpo = `
<defs>
<linearGradient id="svLat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9ba3ad"/><stop offset=".13" stop-color="#e2e6ea"/><stop offset=".5" stop-color="#fbfcfd"/><stop offset=".87" stop-color="#e2e6ea"/><stop offset="1" stop-color="#9ba3ad"/></linearGradient>
<linearGradient id="svVidro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2533"/><stop offset="1" stop-color="#3f5068"/></linearGradient>
<linearGradient id="svVidro2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1a2533"/><stop offset="1" stop-color="#3f5068"/></linearGradient>
<linearGradient id="svTeto" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfd5dc"/><stop offset=".5" stop-color="#f4f6f8"/><stop offset="1" stop-color="#cfd5dc"/></linearGradient>
<filter id="svSombra" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
<rect x="${x0 - 2}" y="${y0 + 8}" width="${c.W + 4}" height="${L - 8}" rx="${rT}" fill="#0A1F3D" opacity=".22" filter="url(#svSombra)"/>
${roda(x0 + 3, eixoD)}${roda(x1 - 3, eixoD)}${roda(x0 + 3, eixoT)}${roda(x1 - 3, eixoT)}
<path d="M ${x0 + rF} ${y0} L ${x1 - rF} ${y0} Q ${x1} ${y0} ${x1} ${y0 + rF} L ${x1} ${y1 - rT} Q ${x1} ${y1} ${x1 - rT} ${y1} L ${x0 + rT} ${y1} Q ${x0} ${y1} ${x0} ${y1 - rT} L ${x0} ${y0 + rF} Q ${x0} ${y0} ${x0 + rF} ${y0} Z" fill="url(#svLat)" stroke="#7d8793" stroke-width="1.3"/>
<path d="M ${x0 + 16} ${yParaChoqueD} Q ${cx} ${yParaChoqueD - 7} ${x1 - 16} ${yParaChoqueD}" fill="none" stroke="#9aa3ae" stroke-width="1"/>
<path d="M ${x0 + 14} ${yParaChoqueT} Q ${cx} ${yParaChoqueT + 6} ${x1 - 14} ${yParaChoqueT}" fill="none" stroke="#9aa3ae" stroke-width="1"/>
<path d="M ${x0 + 9} ${y0 + 14} Q ${x0 + 14} ${y0 + 5} ${x0 + 30} ${y0 + 4} L ${x0 + 34} ${y0 + 12} Q ${x0 + 18} ${y0 + 14} ${x0 + 9} ${y0 + 14} Z" fill="#f4f1e2" stroke="#8d96a1" stroke-width=".8"/>
<path d="M ${x1 - 9} ${y0 + 14} Q ${x1 - 14} ${y0 + 5} ${x1 - 30} ${y0 + 4} L ${x1 - 34} ${y0 + 12} Q ${x1 - 18} ${y0 + 14} ${x1 - 9} ${y0 + 14} Z" fill="#f4f1e2" stroke="#8d96a1" stroke-width=".8"/>
<path d="M ${x0 + 6} ${y1 - 13} L ${x0 + 30} ${y1 - 4} L ${x0 + 16} ${y1 - 3} Q ${x0 + 7} ${y1 - 5} ${x0 + 6} ${y1 - 13} Z" fill="#a3242f"/>
<path d="M ${x1 - 6} ${y1 - 13} L ${x1 - 30} ${y1 - 4} L ${x1 - 16} ${y1 - 3} Q ${x1 - 7} ${y1 - 5} ${x1 - 6} ${y1 - 13} Z" fill="#a3242f"/>
<path d="M ${cx - c.W * .2} ${Y(.07)} Q ${cx - c.W * .22} ${(Y(.07) + yCapo) / 2} ${cx - c.W * .24} ${yCapo - 4}" fill="none" stroke="#b8c0c9" stroke-width="1.1"/>
<path d="M ${cx + c.W * .2} ${Y(.07)} Q ${cx + c.W * .22} ${(Y(.07) + yCapo) / 2} ${cx + c.W * .24} ${yCapo - 4}" fill="none" stroke="#b8c0c9" stroke-width="1.1"/>
<path d="M ${x0 + 11} ${yCapo + 2} Q ${cx} ${yCapo - 12} ${x1 - 11} ${yCapo + 2} L ${x1 - 19} ${yPara} Q ${cx} ${yPara - 7} ${x0 + 19} ${yPara} Z" fill="url(#svVidro)" stroke="#5c6878" stroke-width=".8"/>
<rect x="${x0 + 19}" y="${yPara - 1}" width="${c.W - 38}" height="${yTeto - yPara + 2}" rx="12" fill="url(#svTeto)" stroke="#a4adb8" stroke-width=".9"/>
<path d="M ${x0 + 8} ${yA + 8} L ${x0 + 15} ${yPara + 2} L ${x0 + 15} ${yTeto - 4} L ${x0 + 8} ${yTeto + 6} Z" fill="url(#svVidro)" opacity=".92"/>
<path d="M ${x1 - 8} ${yA + 8} L ${x1 - 15} ${yPara + 2} L ${x1 - 15} ${yTeto - 4} L ${x1 - 8} ${yTeto + 6} Z" fill="url(#svVidro)" opacity=".92"/>
<ellipse cx="${x0 - 7}" cy="${yA + 4}" rx="9" ry="5.5" fill="url(#svLat)" stroke="#7d8793" stroke-width="1"/>
<ellipse cx="${x1 + 7}" cy="${yA + 4}" rx="9" ry="5.5" fill="url(#svLat)" stroke="#7d8793" stroke-width="1"/>
<path d="M ${x0} ${yA} L ${x0 + 9} ${yA + 2} M ${x1} ${yA} L ${x1 - 9} ${yA + 2}" stroke="#8a939e" stroke-width="1"/>
<path d="M ${x0} ${yB} L ${x0 + 12} ${yB} M ${x1} ${yB} L ${x1 - 12} ${yB}" stroke="#8a939e" stroke-width="1.2"/>
<path d="M ${x0} ${yC + 7} L ${x0 + 10} ${yC + 5} M ${x1} ${yC + 7} L ${x1 - 10} ${yC + 5}" stroke="#8a939e" stroke-width="1"/>
<rect x="${x0 + 3}" y="${(yA + yB) / 2 - 1}" width="7" height="2.2" rx="1" fill="#8a939e"/><rect x="${x1 - 10}" y="${(yA + yB) / 2 - 1}" width="7" height="2.2" rx="1" fill="#8a939e"/>`;
        if (!c.duasPortas) corpo += `<rect x="${x0 + 3}" y="${(yB + yC) / 2 - 1}" width="7" height="2.2" rx="1" fill="#8a939e"/><rect x="${x1 - 10}" y="${(yB + yC) / 2 - 1}" width="7" height="2.2" rx="1" fill="#8a939e"/>`;

        if (c.cacamba) {
            const yCab = yVigia + 4, yFim = Y(.93);
            corpo += `
<path d="M ${x0 + 19} ${yTeto} L ${x1 - 19} ${yTeto} L ${x1 - 17} ${yVigia} L ${x0 + 17} ${yVigia} Z" fill="url(#svVidro2)"/>
<rect x="${x0 + 8}" y="${yCab + 4}" width="${c.W - 16}" height="${yFim - yCab - 4}" rx="4" fill="#d3d8de" stroke="#8a939e" stroke-width="1.1"/>
<rect x="${x0 + 14}" y="${yCab + 10}" width="${c.W - 28}" height="${yFim - yCab - 16}" rx="3" fill="#c3c9d0"/>
${[.2, .4, .6, .8].map(f => `<path d="M ${x0 + 18 + (c.W - 36) * f} ${yCab + 14} V ${yFim - 10}" stroke="#aab2bc" stroke-width="2"/>`).join('')}
<path d="M ${x0 + 8} ${yFim + 3} H ${x1 - 8}" stroke="#8a939e" stroke-width="1.2"/>`;
        } else {
            corpo += `
<path d="M ${x0 + 19} ${yTeto} L ${x1 - 19} ${yTeto} L ${x1 - 15} ${yVigia} Q ${cx} ${yVigia + 6} ${x0 + 15} ${yVigia} Z" fill="url(#svVidro2)" stroke="#5c6878" stroke-width=".8"/>
<path d="M ${x0 + 12} ${yVigia + 8} Q ${cx} ${yVigia + 14} ${x1 - 12} ${yVigia + 8}" fill="none" stroke="#a4adb8" stroke-width="1"/>`;
        }

        // Marcadores (percentual do quadro)
        const P = (x, y) => [+(x / VW * 100).toFixed(2), +(y / VH * 100).toFixed(2)];
        const xp = x0 + 16, xc = x0 + 24, xpD = x1 - 16, xcD = x1 - 24;
        const yPortaD = (yA + yB) / 2, yPortaT = (yB + yC) / 2;
        const yParalamaD = (Y(.06) + yA) / 2 + 8;
        const traseiraReta = ['hatch', 'suv', 'van', 'minivan'].includes(tipo);
        const yParalamaT = c.cacamba ? Y(.78) : (yC + Y(.95)) / 2 + (traseiraReta ? 0 : 6);
        const yTampa = c.cacamba ? Y(.905) : (traseiraReta ? Y(.925) : (yVigia + Y(.955)) / 2 + 4);
        const pos = {
            1: P(cx, y0 + 12), 2: P(cx, (Y(.07) + yCapo) / 2 + 4),
            3: P(xp, yParalamaD), 4: P(xc, yA + 11), 5: P(xp, yPortaD + 10), 6: P(xc, yB),
            7: P(xp, yPortaT + (c.duasPortas ? -2 : 4)), 8: P(xc, yC + 4), 9: P(xp, yParalamaT),
            10: P(cx, yTampa), 11: P(cx, y1 - 11),
            12: P(xpD, yParalamaT), 13: P(xcD, yC + 4), 14: P(xpD, yPortaT + (c.duasPortas ? -2 : 4)), 15: P(xcD, yB),
            16: P(xpD, yPortaD + 10), 17: P(xcD, yA + 11), 18: P(xpD, yParalamaD),
            19: P(cx, (yPara + yTeto) / 2)
        };
        return { svg: `<svg viewBox="0 0 ${VW} ${VH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${corpo}</svg>`, pos };
    }

    // ------------------------------------------------------------------
    // Estilos
    // ------------------------------------------------------------------
    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#d9d4c9}
body{font-family:'Montserrat',Arial,Helvetica,sans-serif;color:#18233a;-webkit-font-smoothing:antialiased}
body.tela{padding:1px 0}
body.tela .pg{margin:18px auto;box-shadow:0 6px 24px rgba(10,31,61,.18)}
body.captura{background:transparent}
body.captura .pg{margin:0}
.pg{width:${PAG.w}px;height:${PAG.h}px;position:relative;overflow:hidden;background:${COR.creme};page-break-after:always;break-after:page}
@page{size:A4;margin:0}
@media print{html,body{background:none}body.tela .pg{margin:0;box-shadow:none}}

/* Cabeçalho */
.topo{position:absolute;left:0;top:0;right:0;height:66px;background:linear-gradient(90deg,#081a34 0%,#0A1F3D 55%,#10294f 100%);display:flex;align-items:center;justify-content:space-between;padding:0 34px}
.topo-ouro{position:absolute;left:0;right:0;top:66px;height:3px;background:linear-gradient(90deg,#8E6F2E,#C9A961 30%,#EBD59A 50%,#C9A961 70%,#8E6F2E)}
.topo-dir{display:flex;align-items:center;gap:22px}
.topo-bloco{display:flex;flex-direction:column;gap:3px}
.topo-bloco .r{font-size:7.5px;letter-spacing:1.6px;color:#C9A961;font-weight:600}
.topo-bloco .v{font-size:12.5px;letter-spacing:.6px;color:#fff;font-weight:700}
.topo-sep{width:1px;height:30px;background:rgba(201,169,97,.5)}
.logo{display:flex;align-items:center;gap:calc(9px * var(--e))}
.logo-nome{font-weight:800;font-size:calc(17px * var(--e));letter-spacing:calc(2.2px * var(--e));line-height:1;color:#fff}
.logo-sub{font-weight:600;font-size:calc(7px * var(--e));letter-spacing:calc(4.2px * var(--e));color:#C9A961;margin-top:calc(4px * var(--e))}

/* Título da seção */
.titulo{position:absolute;left:34px;right:34px;top:90px;display:flex;align-items:center;gap:18px}
.numeral{font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;font-size:62px;line-height:1;color:#C9A961;min-width:44px;text-align:center}
.titulo h1{font-size:21px;font-weight:800;color:${COR.navy};letter-spacing:.6px;line-height:1.1}
.titulo .sub{font-size:9.5px;color:#6b7280;letter-spacing:2px;font-weight:500;margin-top:5px;text-transform:uppercase}
.corpo{position:absolute;left:34px;right:34px;top:176px;bottom:58px;display:flex;flex-direction:column;gap:16px;overflow:hidden}
.corpo.cont{top:96px}
.rodape{position:absolute;left:34px;right:34px;bottom:22px;border-top:1px solid #E3DDD0;padding-top:9px;display:flex;justify-content:space-between;align-items:center;font-size:7.5px;letter-spacing:1.5px;color:#8a8f98;font-weight:600}
.rodape .hash{letter-spacing:.4px;font-weight:500;color:#a0a4ab}

/* Blocos */
.rot{font-size:10px;font-weight:800;color:${COR.navy};letter-spacing:1.3px;text-transform:uppercase;display:flex;align-items:center;gap:8px;margin-bottom:9px}
.rot i{display:block;width:3px;height:12px;background:#C9A961;border-radius:1px}
.card{background:#fff;border:1px solid #E6E0D4;border-radius:8px;box-shadow:0 1px 3px rgba(10,31,61,.05)}
.lin{display:flex;gap:16px}
.col{display:flex;flex-direction:column;gap:14px}

/* Tabelas */
table{border-collapse:collapse;width:100%}
.kv td{padding:6.5px 12px;border-bottom:1px solid #EEE8DC;font-size:10.5px;vertical-align:middle}
.kv tr:last-child td{border-bottom:0}
.kv td.r{font-size:8.2px;letter-spacing:1px;color:#6b7280;font-weight:700;width:38%;text-transform:uppercase;background:#FBFAF6}
.kv-largo .kv td.r{width:52%}
.kv td.v{font-weight:600;color:${COR.navy};letter-spacing:.2px}
.tab{border-radius:8px;overflow:hidden;border:1px solid #E6E0D4;background:#fff}
.tab th{background:${COR.navy};color:#fff;font-size:8px;letter-spacing:1.2px;font-weight:700;text-transform:uppercase;padding:8px 10px;text-align:left}
.tab td{font-size:var(--ft,10px);padding:var(--pt,6.5px) 10px;border-top:1px solid #EFE9DE;color:#1f2a3d;vertical-align:middle}
.tab tr:nth-child(even) td{background:#FAF8F3}
.tab td.c,.tab th.c{text-align:center}
.tab td.b{font-weight:700;color:${COR.navy}}
.tab td.mono,.mono{font-family:'Roboto Mono','Courier New',monospace;letter-spacing:.5px}

/* Status */
.st{display:inline-block;font-size:8px;font-weight:800;letter-spacing:1px;padding:4px 9px;border-radius:20px;text-transform:uppercase;white-space:nowrap;line-height:1.2}
.st.ok{background:#E5F0E8;color:${COR.verde}}
.st.ress{background:#F7EADF;color:${COR.ambar}}
.st.nc{background:#F4E2E6;color:${COR.vermelho}}
.st.na{background:#EFEDE8;color:#7c7568}
.tx-ok{color:${COR.verde}}.tx-ress{color:${COR.ambar}}.tx-nc{color:${COR.vermelho}}

/* Fotos */
.fotos{display:grid;gap:12px}
.fotos.c2{grid-template-columns:1fr 1fr}.fotos.c3{grid-template-columns:1fr 1fr 1fr}.fotos.c5{grid-template-columns:repeat(5,1fr)}.fotos.c5 .leg{font-size:8px}.fotos.c5 .leg small{font-size:6.6px}
.foto{display:flex;flex-direction:column;gap:6px;min-width:0}
.foto .img{height:var(--fh,130px);border-radius:6px;background-color:#121821;background-position:center;background-repeat:no-repeat;background-size:cover;border:1px solid #d9d3c6;position:relative}
.foto .img.leitura{background-size:contain}
.foto .img.vazia{background:#EFEBE2;display:flex;align-items:center;justify-content:center;font-size:8.5px;color:#9a9284;letter-spacing:1px;font-weight:600}
.foto .leg{font-size:8.8px;color:#2b3547;font-weight:600;letter-spacing:.2px;line-height:1.25}
.foto .leg small{display:block;font-weight:500;color:#8a8f98;font-size:7.6px;margin-top:2px}
.foto .num{position:absolute;left:0;top:0;background:${COR.navy};color:#fff;font-size:10px;font-weight:800;padding:4px 8px;border-radius:5px 0 6px 0}

.destaque .img{border-width:2px}
.destaque.nc .img{border-color:${COR.vermelho}}.destaque.ress .img{border-color:${COR.ambar}}
.destaque .tag{position:absolute;left:10px;top:10px;font-size:8px;font-weight:800;letter-spacing:1.2px;color:#fff;padding:5px 10px;border-radius:20px}
.destaque.nc .tag{background:${COR.vermelho}}.destaque.ress .tag{background:${COR.ambar}}
.foto .leg small.motivo{font-weight:700;font-size:8px}

/* Capa */
.capa{background:#0a172d}
.capa .fundo{position:absolute;left:0;top:0}
.capa .carro{position:absolute;right:8px;top:500px;width:412px;height:468px;background-size:100% 100%}
.capa .lema{position:absolute;left:58px;top:46px;font-size:9.5px;letter-spacing:3.4px;color:#c8d0dd;line-height:1.95;font-weight:600;border-left:1.5px solid rgba(232,182,80,.8);padding-left:14px}
.capa .num-laudo{position:absolute;right:50px;top:50px;text-align:right}
.capa .num-laudo .r{font-size:8px;letter-spacing:2px;color:#d8dde6;font-weight:600}
.capa .num-laudo .v{font-size:13px;letter-spacing:.8px;color:#fff;font-weight:700;margin-top:3px}
.capa .marca{position:absolute;left:0;right:0;top:92px;display:flex;flex-direction:column;align-items:center}
.capa .marca .n{font-size:50px;font-weight:700;color:#fff;letter-spacing:2.5px;margin-top:10px;line-height:1}
.capa .marca .s{font-size:19px;font-weight:600;color:#dfe4ec;letter-spacing:5px;margin-top:8px;padding-left:5px}
.capa h1{position:absolute;left:88px;top:358px;font-size:72px;font-weight:800;color:#fff;line-height:.98;letter-spacing:.5px}
.capa .h2{position:absolute;left:90px;top:508px;font-size:31px;font-weight:700;color:#EBB445;letter-spacing:.6px}
.capa .desc{position:absolute;left:92px;top:560px;font-size:13px;letter-spacing:2.2px;color:#e3e7ee;line-height:1.6;font-weight:600}
.capa .itens{position:absolute;left:92px;top:630px;display:flex;flex-direction:column;gap:17px}
.capa .item{display:flex;align-items:center;gap:22px;font-size:11px;letter-spacing:1.6px;color:#cdd4df;font-weight:600;line-height:1.4}
.capa .item .ic{width:34px;display:flex;justify-content:center}
.capa .selo{position:absolute;left:514px;top:872px;width:212px;height:212px}
.capa .selo-nome{position:absolute;left:0;right:0;top:139px;text-align:center;font-family:'Montserrat',Arial,sans-serif;font-weight:700;font-size:11px;letter-spacing:.7px;line-height:1;color:#EBC263;text-shadow:0 1px 1px rgba(40,26,5,.9),0 0 3px rgba(255,236,170,.25)}
.capa .local{position:absolute;left:56px;top:1044px;font-size:10.5px;letter-spacing:1.2px;color:#e3e7ee;font-weight:700;line-height:1.6}

/* Resumo */
.areas{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.area{padding:16px 6px 13px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
.area .circ{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(10,31,61,.22)}
.area .circ.ok{background:radial-gradient(circle at 35% 30%,#4f9a62,#2F6B3F 60%,#224f2e)}
.area .circ.ress{background:radial-gradient(circle at 35% 30%,#e3a15a,#C9782E 60%,#9c5520)}
.area .circ.nc{background:radial-gradient(circle at 35% 30%,#c4505f,#8B2635 60%,#6a1a27)}
.area .n{font-size:9.5px;font-weight:800;color:${COR.navy};letter-spacing:.8px}
.lista{padding:14px 16px;display:flex;flex-direction:column;gap:7px}
.lista .cab{font-size:9px;font-weight:800;letter-spacing:1.1px;display:flex;align-items:center;gap:8px;margin-bottom:4px;text-transform:uppercase}
.lista .li{display:flex;gap:9px;align-items:flex-start;font-size:var(--fl,9.6px);line-height:1.4;color:#243047}
.lista .li svg{flex:0 0 auto;margin-top:1px}
.lista .vazio{font-size:9.3px;color:#8a8f98;font-style:italic}
.caixa-parecer{background:linear-gradient(135deg,#0c2447,#0A1F3D 60%,#081a34);border:1.5px solid #C9A961;border-radius:10px;padding:22px 26px;display:flex;align-items:center;gap:24px}
.caixa-parecer .r{font-size:9px;letter-spacing:2.2px;color:#C9A961;font-weight:700}
.caixa-parecer .p{font-size:29px;font-weight:800;color:#E6CB86;letter-spacing:.8px;margin-top:6px;line-height:1.1}
.caixa-parecer .d{font-size:10px;color:#d3d9e3;line-height:1.6;margin-top:9px;max-width:470px}

.criterios{padding:14px 18px;display:flex;flex-direction:column;gap:9px}
.criterios .rot{margin-bottom:2px}
.crit{display:flex;gap:14px;align-items:center;font-size:9.4px;color:#3a4558;line-height:1.45}
.crit .st{min-width:112px;text-align:center}

/* Estrutura */
.indic{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.indic .card{display:flex;align-items:center;gap:13px;padding:13px 14px}
.indic .circ{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.indic .circ.ok{background:#E5F0E8}.indic .circ.nc{background:#F4E2E6}
.indic .r{font-size:8.4px;font-weight:800;letter-spacing:1px;color:${COR.navy};line-height:1.3}
.indic .v{font-size:10px;font-weight:700;margin-top:4px;letter-spacing:.4px}
.analise{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;background:#FBF7EC;border:1px solid #EADFC4}
.analise .circ{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#dcc07c,#C9A961 55%,#a4843f);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.analise .t{font-size:9.8px;line-height:1.6;color:#243047}
.analise .t b{display:flex;align-items:center;gap:10px;font-size:9.5px;letter-spacing:1.2px;color:${COR.navy};margin-bottom:5px}

/* Pintura */
.diagrama{position:relative;width:250px;height:540px;flex:0 0 auto}
.diagrama .sil{position:absolute;left:0;top:10px;width:250px;height:520px}
.diagrama .dir{position:absolute;left:0;right:0;text-align:center;font-size:8px;letter-spacing:2.4px;color:#8a8f98;font-weight:700}
.mk{position:absolute;width:21px;height:21px;margin:-10.5px 0 0 -10.5px;border-radius:50%;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.bola{display:inline-flex;width:18px;height:18px;border-radius:50%;color:#fff;font-size:8.5px;font-weight:800;align-items:center;justify-content:center}
.legenda{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;padding:11px 14px}
.legenda div{display:flex;align-items:center;gap:8px;font-size:9px;color:#2b3547;font-weight:500}
.legenda i{display:block;width:11px;height:11px;border-radius:50%}
.nota{font-size:8.8px;color:#5b6270;line-height:1.5}
.nota b{color:${COR.vermelho}}

/* Parecer final */
.pf{padding:26px 28px}
.pf .p{font-size:34px}
.fund{padding:14px 18px}
.fund .t{font-size:10.2px;line-height:1.7;color:#243047;text-align:justify}
.assin{display:flex;gap:16px;align-items:stretch}
.assin .card{padding:14px 18px}
.assin .ass{flex:1;display:flex;flex-direction:column;justify-content:flex-end}
.assin .ass .img{height:78px;background-size:contain;background-repeat:no-repeat;background-position:left bottom;border-bottom:1px solid #1f2a3d;margin-bottom:8px}
.assin .ass .n{font-size:11px;font-weight:800;color:${COR.navy}}
.assin .ass .c{font-size:8.6px;color:#6b7280;letter-spacing:.8px;margin-top:3px}
.assin .qr{width:262px;display:flex;gap:12px;align-items:center}
.assin .qr .q{width:96px;height:96px;background-size:contain;background-repeat:no-repeat;flex:0 0 auto}
.assin .qr .t{font-size:7.8px;color:#6b7280;line-height:1.5;letter-spacing:.3px;word-break:break-all}
.assin .qr .t .url{display:block;margin-top:8px;word-break:normal}
.assin .qr .t b{display:block;color:${COR.navy};font-size:8.4px;letter-spacing:1px;margin-bottom:4px;word-break:normal}
.alcance{font-size:8.4px;line-height:1.6;color:#5b6270;padding:12px 16px;background:#F3EFE6;border-radius:8px}
.alcance b{color:${COR.navy};letter-spacing:1px;font-size:8.6px;display:block;margin-bottom:3px}

/* Compactação automática quando o conteúdo não cabe na página */
.pg.compacto .corpo{gap:11px}
.pg.compacto{--ft:9.2px;--pt:5px;--fl:9px}
.pg.compacto .fotos{gap:9px}
.pg.compacto2{--ft:8.6px;--pt:3.8px;--fl:8.4px}
`;

    // ------------------------------------------------------------------
    // Blocos de HTML
    // ------------------------------------------------------------------
    function statusSpan(parecer) {
        const p = PARECER[parecer] || PARECER.conforme;
        return `<span class="st ${p.cls}">${p.curto}</span>`;
    }

    function rotulo(t) { return `<div class="rot"><i></i>${esc(t)}</div>`; }

    // Contexto da montagem: fotos já exibidas (o registro final mostra só as que faltam),
    // metadados (data/GPS) e constatações de cada foto (destacadas no próprio lugar)
    let ctxFotos = { exibidas: new Set(), meta: () => ({}), alertas: {} };

    function infoFoto(slot) {
        const m = ctxFotos.meta(slot) || {};
        return [m.timestamp ? dataBR(m.timestamp, true) : '', m.gps && m.gps.latitude ? `GPS ${Number(m.gps.latitude).toFixed(5)}, ${Number(m.gps.longitude).toFixed(5)}` : ''].filter(Boolean).join('  ·  ');
    }

    function fotoHtml(F, slot, legenda, opcoes = {}) {
        const f = F[slot];
        if (f) ctxFotos.exibidas.add(slot);
        const alerta = ctxFotos.alertas[slot];
        const leitura = SLOTS_LEITURA.test(slot) || opcoes.leitura;
        const linhas = [alerta ? `<small class="motivo tx-${alerta.cls}">${esc(alerta.motivo)}</small>` : '', f ? `<small>${esc(infoFoto(slot))}</small>` : ''].join('');
        const num = opcoes.numero ? `<span class="num">${opcoes.numero}</span>` : '';
        const tag = alerta ? `<span class="tag">${alerta.cls === 'nc' ? 'NÃO CONFORME' : 'PONTO DE ATENÇÃO'}</span>` : '';
        const alt = opcoes.altura ? `--fh:${opcoes.altura}px;` : '';
        const img = f
            ? `<div class="img${leitura ? ' leitura' : ''}" style="${alt}background-image:url('${f.url}')">${num}${tag}</div>`
            : `<div class="img vazia" style="${alt}">FOTO NÃO REGISTRADA${num}</div>`;
        return `<div class="foto${alerta ? ` destaque ${alerta.cls}` : ''}">${img}${legenda ? `<div class="leg">${esc(legenda)}${linhas}</div>` : ''}</div>`;
    }

    function cabecalho(D, numeral, titulo, subtitulo) {
        return `<div class="topo">${logoHtml(1)}
<div class="topo-dir"><div class="topo-bloco"><span class="r">DOSSIÊ</span><span class="v">${esc(D.cautelar.dossieNumero || '—')}</span></div>
<div class="topo-sep"></div><div class="topo-bloco"><span class="r">PLACA</span><span class="v">${esc(D.os.placa || '—')}</span></div></div></div><div class="topo-ouro"></div>
${numeral ? `<div class="titulo"><div class="numeral">${numeral}</div><div><h1>${esc(titulo)}</h1><div class="sub">${esc(subtitulo)}</div></div></div>` : ''}`;
    }

    function pagina(D, numeral, titulo, subtitulo, corpo) {
        return `<section class="pg">${cabecalho(D, numeral, titulo, subtitulo)}
<div class="corpo${numeral ? '' : ' cont'}">${corpo}</div>
<div class="rodape"><span>CERTIVE VISTORIAS &nbsp;·&nbsp; LAUDO CAUTELAR &nbsp;·&nbsp; ${MODELO}</span>${D.hash ? `<span class="hash">Autenticação ${esc(String(D.hash).slice(0, 32))}</span>` : ''}<span class="pagnum">PÁG. 00 DE 00</span></div></section>`;
    }

    // Linhas [rótulo, valor, html?]: valor em HTML só quando o terceiro item é true
    function kv(linhas) {
        return `<table class="kv">${linhas.filter(Boolean).map(([r, v, html]) =>
            `<tr><td class="r">${esc(r)}</td><td class="v">${html ? v : esc(v || 'Não informado')}</td></tr>`).join('')}</table>`;
    }

    function chipEtiqueta(status) {
        const st = ROTULO_ETIQUETA[status] || { t: 'Não avaliada', cls: 'na' };
        return `<span class="st ${st.cls}">${st.t}</span>`;
    }

    // ------------------------------------------------------------------
    // Páginas
    // ------------------------------------------------------------------
    function paginaCapa(D, extras = {}) {
        const itens = [
            ['escudo', 'ANÁLISE<br>ESTRUTURAL'], ['lupa', 'IDENTIFICAÇÃO<br>E PROCEDÊNCIA'], ['pistola', 'PINTURA E<br>ACABAMENTO'],
            ['motor', 'MOTOR E<br>COMPONENTES'], ['documento', 'VIDROS E<br>GRAVAÇÕES'], ['carro', 'INTERIOR E<br>QUADROS DE PORTA']
        ];
        const ano = new Date(D.dataEmissao || Date.now()).getFullYear();
        return `<section class="pg capa">
<div class="fundo">${svgFundoCapa()}</div>
${extras.carroCapa ? `<div class="carro" style="background-image:url('${extras.carroCapa}')"></div>` : ''}
<div class="lema">SEGURANÇA<br>INFORMAÇÃO<br>PROCEDÊNCIA</div>
<div class="num-laudo"><div class="r">LAUDO Nº</div><div class="v">${esc(D.cautelar.dossieNumero || '—')}</div>
  <div class="r" style="margin-top:10px">PLACA</div><div class="v">${esc(D.os.placa)}</div></div>
<div class="marca">${svgLogo(134)}<div class="n">CERTIVE</div><div class="s">VISTORIAS</div></div>
<h1>LAUDO<br>CAUTELAR</h1>
<div class="h2">DE AQUISIÇÃO VEICULAR</div>
<div class="desc">ANÁLISE FÍSICO-ESTRUTURAL<br>E DE IDENTIFICAÇÃO VEICULAR</div>
<div class="itens">${itens.map(([ic, t]) => `<div class="item"><span class="ic">${icone(ic, '#E8B650', 30, 1.5)}</span><span>${t}</span></div>`).join('')}</div>
<div class="selo">${svgSelo(D.cidade, ano, 212, D.parecerFinal === 'conforme')}<div class="selo-nome">CERTIVE VISTORIAS</div></div>
<div class="local">${esc(D.cidade.toUpperCase())}<br>${esc(dataExtenso(D.dataEmissao).toUpperCase())}</div>
</section>`;
    }

    function paginaIdentificacao(D, F) {
        const veiculo = kv([
            ['Marca / modelo', D.marcaModelo],
            ['Tipo', D.tipo],
            ['Ano fab. / modelo', D.os.veiculoAno || D.campos['vehicle.year']],
            D.campos['vehicle.color'] ? ['Cor', D.campos['vehicle.color']] : null,
            ['Chassi', `<span class="mono">${esc(D.chassiLido)}</span>`, true],
            ['Motor', `<span class="mono">${esc(D.motorLido)}</span>`, true],
            ['Renavam', D.os.renavam || D.campos['vehicle.renavam']],
            D.campos['vehicle.fuel'] ? ['Combustível', D.campos['vehicle.fuel']] : null,
            ['Km informado', formatarKm(D.d1.quilometragem)],
            ['Conservação', CONSERVACAO[D.d1.estadoConservacao]],
            D.d1.placaConfere === 'nao' ? ['Placa x documento', '<span class="st nc">Não confere</span>', true] : null
        ]);
        const vistoria = kv([
            ['Data / hora', dataBR(D.dataVistoria, true)],
            ['Local', [D.unidade.nome, D.unidade.endereco].filter(Boolean).join(' — ') || D.cidade],
            ['Vistoriador', D.vistoriador.nome],
            ['Credenciamento', D.unidade.credenciamento]
        ]);
        return pagina(D, 'I', 'IDENTIFICAÇÃO DO VEÍCULO', 'Dados cadastrais e da vistoria', `
<div class="lin">
  <div class="col" style="flex:1.12">
    <div class="card" style="overflow:hidden">${veiculo}</div>
    <div>${rotulo('Dados da vistoria')}<div class="card" style="overflow:hidden">${vistoria}</div></div>
  </div>
  <div class="col" style="flex:1">
    ${fotoHtml(F, 'frente_45_dir', 'Vista frontal 45° — lado direito', { altura: 196 })}
    ${fotoHtml(F, 'traseira_45_esq', 'Vista traseira 45° — lado esquerdo', { altura: 196 })}
  </div>
</div>
<div>${rotulo('Registro de identificação')}<div class="fotos c3" style="--fh:250px">
  ${fotoHtml(F, 'placa_dianteira', 'Placa dianteira')}
  ${fotoHtml(F, 'painel_hodometro', 'Painel / hodômetro')}
  ${fotoHtml(F, 'crlv_documento', 'Documento do veículo')}
</div></div>`);
    }

    function listaHtml(itens, cls, vazio, max) {
        if (!itens.length) return `<div class="vazio">${esc(vazio)}</div>`;
        let h = itens.slice(0, max).map(t => `<div class="li">${marcaStatus(cls, 15)}<span>${esc(t)}</span></div>`).join('');
        if (itens.length > max) h += `<div class="vazio">+ ${itens.length - max} ponto(s) detalhado(s) nas seções seguintes</div>`;
        return h;
    }

    function paginaResumo(D) {
        const areas = [
            ['ESTRUTURA', D.status.estrutura, 'escudo'], ['IDENTIFICAÇÃO', D.status.identificacao, 'identificacao'],
            ['PINTURA', D.status.pintura, 'pistola'], ['MOTOR', D.status.motor, 'engrenagem'], ['CHASSI', D.status.chassi, 'carro']
        ];
        const L = listasResumo(D);
        const pf = PARECER[D.parecerFinal];
        return pagina(D, 'II', 'RESUMO DA ANÁLISE', 'Visão geral do laudo', `
<div class="areas">${areas.map(([n, st, ic]) => {
            const p = PARECER[st] || PARECER.conforme;
            return `<div class="card area"><div class="circ ${p.cls}">${icone(ic, '#fff', 30, 1.7)}</div><div class="n">${n}</div>${statusSpan(st)}</div>`;
        }).join('')}</div>
<div class="lin" style="align-items:flex-start">
  <div class="col" style="flex:1">
    <div class="card lista"><div class="cab tx-ok">${marcaStatus('ok', 16)} Pontos conformes</div>${listaHtml(L.ok, 'ok', 'Nenhum item registrado.', 10)}</div>
    <div class="card lista"><div class="cab tx-nc">${marcaStatus('nc', 16)} Pontos não conformes</div>${listaHtml(L.naoConformes, 'nc', 'Nenhuma não conformidade constatada.', 6)}</div>
  </div>
  <div class="col" style="flex:1">
    <div class="card lista"><div class="cab tx-ress">${marcaStatus('ress', 16)} Pontos de atenção / ressalvas</div>${listaHtml(L.atencao, 'ress', 'Nenhum ponto de atenção registrado.', 12)}</div>
  </div>
</div>
<div class="caixa-parecer">${svgEscudoParecer(D.parecerFinal, 88)}
  <div><div class="r">PARECER TÉCNICO</div><div class="p">${pf.texto}</div><div class="d">${esc(resumoParecer(D.parecerFinal))}</div></div>
</div>
<div class="card criterios" style="margin-top:auto">
  <div class="rot"><i></i>Critérios de classificação</div>
  <div class="crit"><span class="st ok">Conforme</span><span>Nenhuma irregularidade constatada no item avaliado.</span></div>
  <div class="crit"><span class="st ress">Com ressalva</span><span>Constatações que não impedem a aquisição, mas devem ser consideradas na negociação e na manutenção.</span></div>
  <div class="crit"><span class="st nc">Não conforme</span><span>Constatações que comprometem a segurança, a identificação ou a procedência do veículo.</span></div>
</div>`);
    }

    function regiaoEstrutural(codigo) {
        if (/painel_corta_fogo/.test(codigo)) return 'Compartimento do motor';
        if (/assoalho/.test(codigo)) return 'Porta-malas';
        if (/_diant_/.test(codigo)) return 'Compartimento dianteiro';
        if (/_tras_/.test(codigo)) return 'Compartimento traseiro';
        return '—';
    }

    function paginaEstrutura(D, F) {
        const sim = v => v === 'sim';
        const indic = [
            ['gota', 'INDÍCIOS DE<br>ENCHENTE', sim(D.d3.indicioEnchente)],
            ['colisao', 'INDÍCIOS DE<br>BATIDA', sim(D.d3.indicioBatida)],
            ['alerta', 'DEFORMAÇÃO<br>ESTRUTURAL', sim(D.d3.deformacaoEstrutural) && sim(D.d3.indicioBatida)]
        ];
        const nomeEst = e => capitalizar(e.nome.replace(' (ESTRUTURA)', ''));
        const linhas = D.estrutura.map(e => {
            const st = ROTULO_ESTRUTURA[e.status] || ROTULO_ESTRUTURA.original;
            return `<tr><td class="b">${esc(nomeEst(e))}</td><td>${regiaoEstrutural(e.codigo)}</td><td><span class="st ${st.cls}">${st.t}</span></td><td>${esc(e.obs || '—')}</td></tr>`;
        }).join('');
        const originais = D.estrutura.filter(e => e.status === 'original').length;
        const outros = D.estrutura.filter(e => e.status !== 'original' && e.status !== 'nao_aplicavel');
        let analise = `Foram avaliados ${D.estrutura.length} pontos estruturais: ${originais} sem indícios de reparo` +
            (outros.length ? ` e ${outros.length} com constatações (${outros.map(e => nomeEst(e).toLowerCase() + ' — ' + ROTULO_ESTRUTURA[e.status].t.toLowerCase()).join('; ')}).` : '.');
        const colunas = D.itensPintura.filter(i => i.reparo === 'sim');
        if (colunas.length) analise += ` Colunas com indícios de reparo estrutural: ${colunas.map(i => i.nome.toLowerCase()).join(', ')}.`;
        const obs = [D.d3.obsEnchente, D.d3.obsBatida, D.d3.observacao].filter(Boolean).map(textoVistoriador).join(' ');
        if (obs) analise += ` Observações do vistoriador: ${obs}`;
        const comFoto = D.estrutura.filter(e => F[e.codigo]);
        const prioridade = e => (e.status === 'original' || e.status === 'nao_aplicavel' ? 1 : 0);
        const fotos = (comFoto.length ? comFoto : D.estrutura).slice().sort((a, b) => prioridade(a) - prioridade(b));
        return pagina(D, 'III', 'ANÁLISE ESTRUTURAL', 'Carroceria e região do chassi', `
<div class="indic">${indic.map(([ic, r, ruim]) => `<div class="card"><div class="circ ${ruim ? 'nc' : 'ok'}">${icone(ic, ruim ? COR.vermelho : COR.verde, 24, 1.8)}</div><div><div class="r">${r}</div><div class="v ${ruim ? 'tx-nc' : 'tx-ok'}">${ruim ? 'CONSTATADO' : 'NÃO CONSTATADO'}</div></div></div>`).join('')}</div>
<div>${rotulo('Pontos estruturais avaliados')}
<table class="tab" style="--pt:5.4px;--ft:9.6px"><thead><tr><th>Item</th><th>Região</th><th style="width:150px">Status</th><th>Observações</th></tr></thead><tbody>${linhas}</tbody></table></div>
<div class="card analise"><div class="circ">${icone('relatorio', '#fff', 24, 1.8)}</div><div class="t"><b>ANÁLISE TÉCNICA ${statusSpan(D.status.estrutura)}</b>${esc(analise)}</div></div>
<div>${rotulo('Registro fotográfico — estrutura')}
<div class="fotos c5" style="--fh:100px;gap:9px">${fotos.map(e => fotoHtml(F, e.codigo, nomeEst(e).replace('Torre do amortecedor', 'Torre amort.'))).join('')}</div></div>`);
    }

    function paginaPintura(D, F) {
        const sil = silhueta(D.tipoCodigo);
        const marcadores = D.itensPintura.map(it => {
            const p = sil.pos[it.numero];
            if (!p) return '';
            // posição relativa ao quadro da silhueta (250 x 520, deslocado 10px)
            return `<div class="mk" style="left:${(p[0] * 2.5).toFixed(1)}px;top:${(10 + p[1] * 5.2).toFixed(1)}px;background:${CORES_PINTURA[it.classe] || COR.neutro}">${it.numero}</div>`;
        }).join('');
        const linhas = D.itensPintura.map(it => {
            const cor = CORES_PINTURA[it.classe] || COR.neutro;
            const um = it.tipo === 'plastico' ? '—' : (it.um || '—');
            return `<tr><td class="c"><span class="bola" style="background:${cor}">${it.numero}</span></td><td${it.reparo === 'sim' ? ' class="b tx-nc"' : ''}>${esc(it.nome)}${it.reparo === 'sim' ? ' *' : ''}</td><td class="c">${esc(um)}</td><td style="color:${cor};font-weight:700">${ROTULO_PINTURA[it.classe] || capitalizar(it.classe)}</td></tr>`;
        }).join('');
        const legenda = [['Original de fábrica', COR.verde], ['Repintura', COR.gold], ['Repintura com massa', COR.ambar], ['Avariado', COR.vermelho], ['Plástico / não se aplica', COR.neutro]];
        const notas = [];
        if (D.itensPintura.some(i => i.reparo === 'sim')) notas.push('<b>*</b> Indícios de reparo estrutural na coluna (ver seção III).');
        if (D.d4.observacao) notas.push(`Observação: ${esc(textoVistoriador(D.d4.observacao))}`);
        return pagina(D, 'IV', 'PINTURA E ACABAMENTO', 'Medição de espessura e classificação por peça', `
<div class="lin" style="gap:18px">
  <div class="diagrama"><div class="dir" style="top:-2px">FRENTE</div><div class="sil">${sil.svg}</div>${marcadores}<div class="dir" style="bottom:-4px">TRASEIRA</div></div>
  <div class="col" style="flex:1;gap:12px">
    <table class="tab" style="--pt:3.5px;--ft:9.4px"><thead><tr><th class="c" style="width:40px">Nº</th><th>Peça</th><th class="c" style="width:74px">Espessura <span style="text-transform:none">(µm)</span></th><th style="width:118px">Condição</th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="card legenda">${legenda.map(([t, c]) => `<div><i style="background:${c}"></i>${t}</div>`).join('')}</div>
    ${notas.length ? `<div class="nota">${notas.join('<br>')}</div>` : ''}
  </div>
</div>
<div class="lin" style="gap:16px;align-items:flex-start">
  <div style="flex:1.1">${rotulo('Medição')}<div class="nota">Espessura da camada de tinta medida com medidor de espessura em cada peça metálica; peças plásticas são avaliadas visualmente. A classificação de cada peça é feita pelo vistoriador com base na medição e na inspeção visual.</div></div>
  <div class="fotos" style="flex:1;--fh:150px">${fotoHtml(F, 'medidor_pintura_uso', 'Medidor de espessura em uso')}</div>
</div>`);
    }

    function paginaVidros(D, F) {
        const linhas = D.vidros.map(v => {
            const cls = !v.original ? 'nc' : (v.desbaste ? 'ress' : 'ok');
            const st = !v.original ? 'Divergente' : (v.desbaste ? 'Com ressalva' : 'Conforme');
            return `<tr><td class="b">${esc(nomeCurto(v.nome))}</td><td class="${v.original ? 'tx-ok' : 'tx-nc'}" style="font-weight:700">${v.original ? 'Original' : 'Não original'}</td><td class="mono">${esc(v.lida || '—')}</td><td class="c ${v.desbaste ? 'tx-nc' : ''}" style="font-weight:700">${v.desbaste ? 'Sim' : 'Não'}</td><td><span class="st ${cls}">${st}</span></td></tr>`;
        }).join('');
        const leituras = [...new Set(D.vidros.map(v => (v.lida || '').replace(/\s/g, '').toUpperCase()).filter(Boolean))];
        const alerta = leituras.length > 1 ? `<div class="card" style="padding:10px 14px;background:#FBF1E8;border-color:#E9C9A8;font-size:9.6px;color:${COR.ambar};font-weight:700;display:flex;gap:10px;align-items:center">${marcaStatus('ress', 16)} Há gravações com números diferentes entre os vidros.</div>` : '';
        const obs = D.d5.observacao ? `<div class="nota">Observação: ${esc(textoVistoriador(D.d5.observacao))}</div>` : '';
        const ident = kv([
            ['Etiqueta ETA — motor', chipEtiqueta(D.d2.eta_motor), true],
            ['Etiqueta ETA — coluna', chipEtiqueta(D.d2.eta_coluna), true]
        ]);
        return pagina(D, 'V', 'IDENTIFICAÇÃO E VIDROS', 'Gravações e componentes', `
<div>${rotulo('Vidros')}
<table class="tab"><thead><tr><th>Vidro</th><th>Gravação</th><th>Número lido</th><th class="c">Desbaste</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table></div>
${alerta}${obs}
<div>${rotulo('Etiquetas de identificação')}<div class="lin" style="align-items:flex-start">
  <div class="col" style="flex:1.3;gap:8px"><div class="card" style="overflow:hidden">${ident}</div>${D.d2.observacao ? `<div class="nota">Observação: ${esc(textoVistoriador(D.d2.observacao))}</div>` : ''}</div>
  <div class="fotos" style="flex:1;--fh:96px">${fotoHtml(F, 'etiqueta_eta', 'Etiqueta ETA — motor')}</div></div></div>
<div>${rotulo('Registro fotográfico')}
<div class="fotos c3" style="--fh:150px">${D.vidros.map(v => fotoHtml(F, v.codigo, nomeCurto(v.nome))).join('')}</div></div>`);
    }

    function paginaMotorChassi(D, F) {
        const conf = D.chassiConfere === null ? esc(D.chassiCadastro ? 'Leitura não informada' : 'Chassi não informado no cadastro da O.S.')
            : (D.chassiConfere ? '<span class="st ok">Confere com o cadastro</span>' : `<span class="st nc">Diverge do cadastro</span> &nbsp;<span class="mono">${esc(D.chassiCadastro)}</span>`);
        const orig = v => v === false ? '<span class="st nc">Não original</span>' : '<span class="st ok">Original</span>';
        const tabela = kv([
            ['Conferência cadastral', conf, true],
            ['Gravação do chassi', orig(D.d2.chassiOriginal), true],
            ['Gravação do motor', orig(D.d2.motorOriginal), true],
            ['Compartimento do motor', D.d6.reparoMotor === 'sim' ? '<span class="st ress">Sinais de reparo</span>' : '<span class="st ok">Sem sinais de reparo</span>', true],
            ['Cor original do compartimento', D.d6.corMotorOk === 'nao' ? '<span class="st ress">Não preservada</span>' : '<span class="st ok">Preservada</span>', true]
        ]);
        const st = [D.status.motor, D.status.chassi];
        const pior = st.includes('nao_conforme') ? 'nao_conforme' : (st.includes('com_ressalvas') ? 'com_ressalvas' : 'conforme');
        const texto = D.campos['technical.observation'] || textoVistoriador(D.d6.observacao) ||
            'Sem observações adicionais além das constatações registradas acima.';
        const fotos = [
            ['chassi_gravado', 'Gravação do chassi'], ['chassi_secundario', 'Chassi — plaquetas / secundário'], ['motor_gravado', 'Gravação do motor'],
            ['motor_vista_geral', 'Compartimento do motor'], ['motor_painel_corta_fogo', 'Painel corta-fogo'], ['motor_batentes_dobradicas', 'Batentes do capô']
        ];
        return pagina(D, 'VI', 'MOTOR E CHASSI', 'Identificação e conferência', `
<div class="card" style="overflow:hidden">${tabela}</div>
<div>${rotulo('Parecer técnico')}
<div class="card analise"><div class="circ">${icone('relatorio', '#fff', 24, 1.8)}</div><div class="t"><b>MOTOR E CHASSI ${statusSpan(pior)}</b>${esc(texto)}</div></div></div>
<div>${rotulo('Registro fotográfico')}
<div class="fotos c3" style="--fh:196px">${fotos.map(([s, t]) => fotoHtml(F, s, t)).join('')}</div></div>`);
    }

    function paginaQuadros(D, F) {
        const q = (global.CAUTELAR_SLOTS && global.CAUTELAR_SLOTS[7]) || [];
        const interv = D.d7.intervencaoQuadros === 'sim';
        const bloco = (titulo, linhas) => `<div class="tab kv-largo" style="flex:1"><table><thead><tr><th colspan="2">${titulo}</th></tr></thead></table>${kv(linhas)}</div>`;
        return pagina(D, 'VII', 'QUADROS DE PORTA E INTERIOR', 'Acabamentos e conservação', `
<div class="lin">
  ${bloco('Quadros de porta', [['Intervenção identificada', interv ? '<span class="st nc">Sim — soldas / intervenção</span>' : '<span class="st ok">Não constatada</span>', true]])}
  ${bloco('Interior', [['Conservação geral', CONSERVACAO[D.d7.conservacaoInterior] || 'Não informado']])}
</div>
${D.d7.observacao ? `<div class="nota">Observação: ${esc(textoVistoriador(D.d7.observacao))}</div>` : ''}
<div>${rotulo('Registro fotográfico')}
<div class="fotos c2" style="--fh:322px">${q.map(s => fotoHtml(F, s.codigo, capitalizar(s.nome))).join('')}</div></div>`);
    }

    function paginaParecer(D, extras) {
        const pf = PARECER[D.parecerFinal];
        const texto = textoParecerFinal(D);
        const obs = textoVistoriador(D.d8.observacaoFinal || D.d8.observacao);
        const assinatura = D.d8.signatureBase64 && String(D.d8.signatureBase64).startsWith('data:image') ? D.d8.signatureBase64 : null;
        return pagina(D, 'VIII', 'PARECER FINAL', 'Conclusão técnica', `
<div class="caixa-parecer pf">${svgEscudoParecer(D.parecerFinal, 100)}
  <div><div class="r">PARECER TÉCNICO FINAL</div><div class="p">${pf.texto}</div></div>
</div>
<div>${rotulo('Fundamentação')}<div class="card fund"><div class="t">${esc(texto)}</div></div></div>
${obs ? `<div>${rotulo('Observações do vistoriador')}<div class="card fund"><div class="t">${esc(obs)}</div></div></div>` : ''}
${(() => { const rec = recomendacoes(D); return rec.length ? `<div>${rotulo('Recomendações ao comprador')}<div class="card lista">${rec.map((t, i) => `<div class="li"><span class="bola" style="background:${COR.navy};flex:0 0 auto">${i + 1}</span><span>${esc(t)}</span></div>`).join('')}</div></div>` : ''; })()}
<div style="font-size:10.5px;font-weight:700;color:${COR.navy}">${esc(D.cidade)}, ${esc(dataExtenso(D.dataEmissao))}.</div>
<div class="assin">
  <div class="card ass"><div class="img"${assinatura ? ` style="background-image:url('${assinatura}')"` : ''}></div>
    <div class="n">${esc(D.vistoriador.nome || 'Vistoriador responsável')}</div>
    <div class="c">VISTORIADOR TÉCNICO${D.unidade.credenciamento ? ' &nbsp;·&nbsp; ' + esc(D.unidade.credenciamento) : ''}</div>
    ${D.unidade.razao_social ? `<div class="c">${esc(D.unidade.razao_social)}${D.unidade.cnpj ? ' — CNPJ ' + esc(D.unidade.cnpj) : ''}</div>` : ''}</div>
  <div class="card qr">${extras.qr ? `<div class="q" style="background-image:url('${extras.qr}')"></div>` : ''}
    <div class="t"><b>CÓDIGO DE AUTENTICAÇÃO</b>${esc(D.hash || 'Gerado na emissão do laudo')}<span class="url">Confira a autenticidade em<br>certive.com.br/consulta-laudo</span></div></div>
</div>
<div class="alcance" style="margin-top:auto"><b>ALCANCE DO LAUDO</b>Este laudo tem caráter técnico e informativo e retrata as condições constatadas no veículo na data e hora da vistoria, pelo método visual e de medição descrito. Não substitui avaliações mecânicas especializadas, não abrange vícios ocultos nem eventos posteriores à inspeção${D.campos['document.approved_items'] ? '' : ' e não inclui pesquisa documental em bases externas'}.</div>`);
    }

    // Fotos dos pontos com constatação, em tamanho grande, com o motivo do destaque
    function destaquesFotograficos(D, F) {
        const lista = [];
        const add = (slot, titulo, motivo, cls) => { if (F[slot] && !lista.some(d => d.slot === slot)) lista.push({ slot, titulo, motivo, cls }); };
        if (D.d2.chassiOriginal === false) add('chassi_gravado', 'Gravação do chassi', 'Características não originais', 'nc');
        if (D.d2.motorOriginal === false) add('motor_gravado', 'Gravação do motor', 'Características não originais', 'nc');
        D.estrutura.filter(e => e.status !== 'original' && e.status !== 'nao_aplicavel').forEach(e =>
            add(e.codigo, capitalizar(e.nome.replace(' (ESTRUTURA)', '')), ROTULO_ESTRUTURA[e.status].t + (e.obs ? ` — ${textoVistoriador(e.obs)}` : ''), ROTULO_ESTRUTURA[e.status].cls));
        if (D.d6.reparoMotor === 'sim') add('motor_vista_geral', 'Compartimento do motor', 'Sinais de reparo ou troca de estruturas', 'ress');
        if (D.d2.eta_motor === 'danificada' || D.d2.eta_motor === 'ausente') add('etiqueta_eta', 'Etiqueta ETA do motor', D.d2.eta_motor === 'ausente' ? 'Etiqueta ausente' : 'Etiqueta danificada', D.d2.eta_motor === 'ausente' ? 'nc' : 'ress');
        D.vidros.filter(v => !v.original || v.desbaste).forEach(v =>
            add(v.codigo, `Vidro ${nomeCurto(v.nome).toLowerCase()}`, !v.original ? 'Gravação divergente (vidro trocado)' : 'Desbaste / polimento na gravação', !v.original ? 'nc' : 'ress'));
        if (D.d7.intervencaoQuadros === 'sim') ((global.CAUTELAR_SLOTS || {})[7] || []).forEach(q => add(q.codigo, capitalizar(q.nome), 'Intervenção / soldas no quadro de porta', 'nc'));
        return lista;
    }

    function paginasRegistro(D, F) {
        const saida = [];
        const restantes = Object.keys(global.CAUTELAR_SLOTS || {}).flatMap(n => global.CAUTELAR_SLOTS[n])
            .filter(sl => F[sl.codigo] && !ctxFotos.exibidas.has(sl.codigo));
        const porPagina = 9;
        for (let inicio = 0; inicio < restantes.length; inicio += porPagina) {
            const primeira = saida.length === 0;
            const html = `${primeira ? '<div class="nota" style="margin-bottom:-4px">Fotografias da vistoria que não constam nas seções anteriores. Todas as fotos do laudo trazem data, hora e localização da captura.</div>' : ''}
<div class="fotos c3" style="--fh:${primeira ? 196 : 222}px;row-gap:16px">${restantes.slice(inicio, inicio + porPagina).map(sl => fotoHtml(F, sl.codigo, nomeCurto(sl.nome))).join('')}</div>`;
            saida.push(primeira ? pagina(D, 'IX', 'REGISTRO FOTOGRÁFICO', 'Registros complementares', html) : pagina(D, '', '', '', html));
        }
        return saida;
    }

    function montarHtml(D, F, extras = {}) {
        ctxFotos = {
            exibidas: new Set(), meta: D.meta,
            alertas: Object.fromEntries(destaquesFotograficos(D, F).map(d => [d.slot, { cls: d.cls, motivo: d.motivo }]))
        };
        const paginas = [
            paginaCapa(D, extras), paginaIdentificacao(D, F), paginaResumo(D), paginaEstrutura(D, F),
            paginaPintura(D, F), paginaVidros(D, F), paginaMotorChassi(D, F), paginaQuadros(D, F),
            paginaParecer(D, extras), ...paginasRegistro(D, F)
        ];
        return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Laudo Cautelar ${esc(D.os.placa)} — ${esc(D.cautelar.dossieNumero || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@1,700&family=Roboto+Mono:wght@500&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body class="${extras.modo || 'tela'}">${paginas.join('\n')}</body></html>`;
    }

    // Numera as páginas e compacta as que passaram do limite
    function ajustarPaginas(doc) {
        const pgs = [...doc.querySelectorAll('.pg')];
        pgs.forEach((pg, i) => {
            const n = pg.querySelector('.pagnum');
            if (n) n.textContent = `PÁG. ${String(i + 1).padStart(2, '0')} DE ${String(pgs.length).padStart(2, '0')}`;
            const corpo = pg.querySelector('.corpo');
            if (!corpo) return;
            const estourou = () => corpo.scrollHeight > corpo.clientHeight + 1;
            if (estourou()) pg.classList.add('compacto');
            if (estourou()) pg.classList.add('compacto2');
            // Último recurso: reduz as fotos da página até caber
            let guarda = 0;
            while (estourou() && guarda++ < 12) {
                corpo.querySelectorAll('.fotos, .foto .img').forEach(g => {
                    const atual = parseFloat(getComputedStyle(g).getPropertyValue('--fh')) || 130;
                    g.style.setProperty('--fh', `${Math.max(64, atual - 12)}px`);
                });
            }
        });
    }

    // ------------------------------------------------------------------
    // Montagem
    // ------------------------------------------------------------------
    let arteCapa = null;
    function carregarArteCapa() {
        if (!arteCapa) {
            arteCapa = fetch('assets/laudo/capa_carro.png', { cache: 'force-cache' })
                .then(r => r.ok ? r.blob() : null)
                .then(b => b ? new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); }) : null)
                .catch(() => null);
            arteCapa.then(v => { if (!v) arteCapa = null; });
        }
        return arteCapa;
    }

    async function prepararLaudo(cautelarId, opcoes = {}) {
        if (typeof garantirDetalhesCautelar === 'function') await garantirDetalhesCautelar(cautelarId);
        const cautelar = db.cautelares.find(c => c.id === cautelarId);
        // Texto redigido no servidor, quando este aparelho ainda não o tem
        if (cautelar && !cautelar.dadosIaConfeccionado && global.useSupabase && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data } = await supabaseClient.from('laudos_gerados').select('id, resposta')
                    .eq('cautelarId', cautelarId).order('criadoEm', { ascending: false }).limit(1);
                if (data && data[0] && data[0].resposta) cautelar.dadosIaConfeccionado = data[0].resposta;
            } catch (e) { console.warn('Laudo gerado no servidor indisponível:', e); }
        }
        const D = montarDados(cautelarId);
        if (opcoes.parecerFinal && PARECER[opcoes.parecerFinal]) D.parecerFinal = opcoes.parecerFinal;
        if (opcoes.obsFinal !== undefined) D.d8 = Object.assign({}, D.d8, { observacaoFinal: opcoes.obsFinal });
        const [F, qr, carroCapa] = await Promise.all([
            carregarFotos(D),
            D.hash ? gerarQrDataUrl(urlConsulta(D.hash)) : Promise.resolve(null),
            carregarArteCapa()
        ]);
        return { D, F, qr, html: montarHtml(D, F, { qr, carroCapa, modo: opcoes.modo }) };
    }

    function carregarIframe(iframe, html) {
        return new Promise((resolve, reject) => {
            const tempo = setTimeout(() => reject(new Error('Tempo esgotado ao montar o laudo.')), 30000);
            iframe.onload = async () => {
                clearTimeout(tempo);
                const doc = iframe.contentDocument;
                try { if (doc.fonts && doc.fonts.ready) await Promise.race([doc.fonts.ready, new Promise(r => setTimeout(r, 6000))]); } catch (_) { /* segue com a fonte padrão */ }
                ajustarPaginas(doc);
                resolve(doc);
            };
            iframe.srcdoc = html;
        });
    }

    function carregarScriptNoIframe(iframe, src) {
        return new Promise((resolve, reject) => {
            const doc = iframe.contentDocument;
            const s = doc.createElement('script');
            s.src = new URL(src, global.location.href).href;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Não foi possível carregar o gerador de páginas do laudo.'));
            doc.head.appendChild(s);
        });
    }

    function dataUrlParaBytes(dataUrl) {
        const bin = atob(String(dataUrl).split(',')[1] || '');
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    /**
     * Gera o PDF oficial do laudo. Devolve os bytes do PDF (Uint8Array).
     * opcoes: { parecerFinal, obsFinal, escala, progresso(feitas, total) }
     */
    async function gerarLaudoCertive(cautelarId, opcoes = {}) {
        if (typeof PDFLib === 'undefined') throw new Error('Biblioteca de PDF não carregada. Verifique a conexão e recarregue.');
        const { D, html } = await prepararLaudo(cautelarId, Object.assign({}, opcoes, { modo: 'captura' }));

        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = `position:fixed;left:-12000px;top:0;width:${PAG.w}px;height:${PAG.h}px;border:0`;
        document.body.appendChild(iframe);
        try {
            const doc = await carregarIframe(iframe, html);
            await carregarScriptNoIframe(iframe, 'js/vendor/html2canvas.min.js');
            const win = iframe.contentWindow;
            const movel = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
            const escala = opcoes.escala || (movel ? 2.2 : 2.8);

            const pdf = await PDFLib.PDFDocument.create();
            pdf.setTitle(`Laudo Cautelar ${D.os.placa} — ${D.cautelar.dossieNumero || ''}`);
            pdf.setAuthor('Certive Vistorias');
            pdf.setCreator('Sistema Certive');
            pdf.setSubject('Laudo cautelar de aquisição veicular');

            const pgs = [...doc.querySelectorAll('.pg')];
            for (let i = 0; i < pgs.length; i++) {
                const canvas = await win.html2canvas(pgs[i], {
                    scale: escala, backgroundColor: COR.creme, useCORS: true, logging: false,
                    width: PAG.w, height: PAG.h, windowWidth: PAG.w, windowHeight: PAG.h, scrollX: 0, scrollY: 0,
                    onclone: clone => {
                        // Só a página capturada fica no clone (mais rápido e com menos memória)
                        clone.querySelectorAll('.pg').forEach((p, j) => { if (j !== i) p.remove(); });
                    }
                });
                const jpg = canvas.toDataURL('image/jpeg', 0.9);
                canvas.width = 0; canvas.height = 0;
                const img = await pdf.embedJpg(dataUrlParaBytes(jpg));
                const pagina = pdf.addPage([A4_PT.w, A4_PT.h]);
                pagina.drawImage(img, { x: 0, y: 0, width: A4_PT.w, height: A4_PT.h });
                if (typeof opcoes.progresso === 'function') opcoes.progresso(i + 1, pgs.length);
            }
            return await pdf.save();
        } finally {
            iframe.remove();
        }
    }

    global.gerarLaudoCertive = gerarLaudoCertive;

    // ------------------------------------------------------------------
    // Pré-visualização na tela de finalização (o próprio HTML do laudo)
    // ------------------------------------------------------------------
    let previewTimer = null, previewSeq = 0;
    function atualizarPreviewLaudoCertive() {
        const container = document.getElementById('laudo-preview-container');
        if (!container) return;
        clearTimeout(previewTimer);
        previewTimer = setTimeout(async () => {
            const seq = ++previewSeq;
            const cautelarId = global.activeFinalizacaoCautelarId;
            if (!cautelarId) return;
            if (!container.querySelector('iframe')) {
                container.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;font-family:sans-serif;">Montando a pré-visualização do laudo...</div>';
            }
            try {
                const parecer = document.getElementById('caut-final-parecer');
                const obs = document.getElementById('caut-final-obs');
                const { html } = await prepararLaudo(cautelarId, {
                    parecerFinal: parecer ? parecer.value : undefined,
                    obsFinal: obs ? obs.value : undefined,
                    modo: 'tela'
                });
                if (seq !== previewSeq) return;
                const larguraTotal = PAG.w + 40;
                const escala = Math.min(1, Math.max(280, (container.clientWidth || larguraTotal) - 2) / larguraTotal);
                container.innerHTML = `<div class="laudo-preview-moldura" style="width:100%;overflow:hidden;border:1px solid #d1d5db;border-radius:6px;background:#d9d4c9"><iframe title="Pré-visualização do laudo" style="width:${larguraTotal}px;border:0;transform:scale(${escala});transform-origin:0 0;display:block"></iframe></div>`;
                const iframe = container.querySelector('iframe');
                const doc = await carregarIframe(iframe, html);
                const altura = doc.documentElement.scrollHeight;
                iframe.style.height = `${altura}px`;
                container.querySelector('.laudo-preview-moldura').style.height = `${Math.ceil(altura * escala)}px`;
            } catch (e) {
                console.error('Falha na pré-visualização do laudo:', e);
                container.innerHTML = `<div style="padding:20px;color:#991b1b;font-family:sans-serif;">Não foi possível montar a pré-visualização: ${esc(e.message || e)}</div>`;
            }
        }, 700);
    }
    global.atualizarPreviewLaudo = atualizarPreviewLaudoCertive;
    global._laudoCertiveInterno = { svgLogo, svgSelo, montarDados, listasResumo, textoParecerFinal, limpar, montarHtml, prepararLaudo, silhueta, ajustarPaginas };
})(window);
