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
        const p = PARECER[D.parecerFinal].texto;
        const { alerta } = listasResumo(D);
        let t = `Com base nas verificações realizadas no veículo ${D.marcaModelo !== 'Não informado' ? D.marcaModelo + ', ' : ''}placa ${D.os.placa}, ` +
            `o parecer técnico desta vistoria cautelar é ${p}.`;
        if (alerta.length) t += ` Foram registrados os seguintes pontos de atenção: ${alerta.slice(0, 8).join('; ')}.`;
        else t += ' Não foram constatados indícios de sinistro estrutural, remarcação de chassi ou irregularidades de identificação.';
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
    function svgLogo(tam = 44, fundo = COR.navy) {
        const id = `lgOuro${++seqSvg}`;
        return `<svg width="${tam}" height="${Math.round(tam * 1.1)}" viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4E1A6"/><stop offset=".42" stop-color="#D4B46A"/><stop offset=".7" stop-color="#B8934A"/><stop offset="1" stop-color="#8A6A2C"/></linearGradient></defs>
<path d="M50 5 L89 18 V49 C89 76 72 95 50 104 C28 95 11 76 11 49 V18 Z" fill="none" stroke="url(#${id})" stroke-width="5.5" stroke-linejoin="round"/>
<path d="M50 14 L80 24 V49 C80 70 67 85 50 93 C33 85 20 70 20 49 V24 Z" fill="none" stroke="url(#${id})" stroke-width="2" stroke-linejoin="round"/>
<g fill="none" stroke="url(#${id})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M33 46 L37.5 37.5 C38.6 35.4 40.4 34.3 42.8 34.3 H57.2 C59.6 34.3 61.4 35.4 62.5 37.5 L67 46"/>
<path d="M29 58 V50.5 C29 47.8 30.8 46 33.5 46 H66.5 C69.2 46 71 47.8 71 50.5 V58 C71 59.7 69.7 61 68 61 H32 C30.3 61 29 59.7 29 58 Z"/>
<path d="M33.5 51.5 H40 M60 51.5 H66.5 M44 55.5 H56"/>
<path d="M32 61 V65.5 H38.5 V61 M61.5 61 V65.5 H68 V61"/>
</g>
<path d="M38.5 71 L49 81.5 L95 26" fill="none" stroke="${fundo}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M38.5 71 L49 81.5 L95 26" fill="none" stroke="url(#${id})" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    }

    function logoHtml(escala = 1) {
        return `<div class="logo" style="--e:${escala}">${svgLogo(38 * escala)}
<div class="logo-txt"><div class="logo-nome">CERTIVE</div><div class="logo-sub">VISTORIAS</div></div></div>`;
    }

    const ICONES = {
        escudo: '<path d="M12 2.6l7.6 2.9v5.9c0 4.9-3.2 8.6-7.6 10-4.4-1.4-7.6-5.1-7.6-10V5.5z"/><path d="M8.4 12.1l2.5 2.5 4.8-5"/>',
        lupa: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.2 5.2"/><path d="M8 10.5h5M10.5 8v5"/>',
        identificacao: '<path d="M5.5 2.8h8.7L18.5 7v14.2h-13z"/><path d="M14 2.8V7h4.5"/><circle cx="11" cy="13.3" r="3"/><path d="M13.2 15.5l3 3"/>',
        rolo: '<rect x="3.5" y="3.5" width="13.5" height="5.5" rx="1.2"/><path d="M17 6.2h2.8v5.6h-8.4v3"/><rect x="10" y="14.8" width="2.8" height="6.4" rx="1"/>',
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
    function svgSelo(cidade, data, tam = 190) {
        const id = `lgSelo${++seqSvg}`;
        const topo = 'CERTIVE VISTORIAS • CAUTELAR';
        const base = `${String(cidade || '').toUpperCase()} • ${data}`;
        return `<svg width="${tam}" height="${tam}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4E1A6"/><stop offset=".45" stop-color="#D4B46A"/><stop offset="1" stop-color="#8A6A2C"/></linearGradient>
<path id="${id}t" d="M 100 176 A 76 76 0 1 1 100.01 176"/>
<path id="${id}b" d="M 14 100 A 86 86 0 0 0 186 100"/>
</defs>
<circle cx="100" cy="100" r="97" fill="#0B2143" stroke="url(#${id})" stroke-width="3"/>
<circle cx="100" cy="100" r="90" fill="none" stroke="url(#${id})" stroke-width="1"/>
<circle cx="100" cy="100" r="69" fill="none" stroke="url(#${id})" stroke-width="1.6"/>
<text font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10.5" letter-spacing="1.3" fill="#E4C87F"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${esc(topo)}</textPath></text>
<text font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10" letter-spacing="1.2" fill="#E4C87F"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(base)}</textPath></text>
<g transform="translate(62 56) scale(.76)">${svgLogo(100, '#0B2143').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
</svg>`;
    }

    // Desenho de carro premium em traço dourado, com linha de base ("sublinhado")
    function svgCarroTraco(largura = 560) {
        const id = `lgCarro${++seqSvg}`;
        return `<svg width="${largura}" height="${Math.round(largura * .36)}" viewBox="0 0 1000 360" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9A961" stop-opacity=".35"/><stop offset=".35" stop-color="#E9D08F"/><stop offset=".7" stop-color="#C9A961"/><stop offset="1" stop-color="#C9A961" stop-opacity=".4"/></linearGradient>
<linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0"><stop offset="0" stop-color="#C9A961" stop-opacity="0"/><stop offset=".2" stop-color="#C9A961" stop-opacity=".9"/><stop offset=".8" stop-color="#E9D08F" stop-opacity=".9"/><stop offset="1" stop-color="#C9A961" stop-opacity="0"/></linearGradient>
</defs>
<g fill="none" stroke="url(#${id})" stroke-linecap="round" stroke-linejoin="round">
<path stroke-width="3.51" d="M 58 262 C 50 236 62 214 104 205 C 190 190 300 176 392 164 C 448 124 520 92 604 86 C 690 81 772 94 836 134 C 884 144 934 154 958 176 C 972 198 968 234 952 258 L 910 262 C 904 196 752 196 746 262 L 288 262 C 282 196 130 196 124 262 Z"/>
<path stroke-width="2.43" d="M 424 164 C 478 128 540 104 604 100 C 672 97 742 106 792 138 L 782 152 C 690 154 520 160 424 164 Z"/>
<path stroke-width="2.16" d="M 622 99 L 628 156"/>
<path stroke-width="1.89" d="M 110 222 C 330 206 640 196 958 196"/>
<path stroke-width="1.76" d="M 404 172 L 396 256 M 646 160 L 650 256"/>
<path stroke-width="2.7" d="M 104 214 C 140 206 182 199 226 194"/>
<path stroke-width="2.7" d="M 930 172 C 944 180 952 190 956 202"/>
<path stroke-width="1.62" d="M 470 214 H 500 M 700 208 H 730"/>
<circle stroke-width="3.24" cx="206" cy="262" r="58"/><circle stroke-width="1.89" cx="206" cy="262" r="38"/><circle stroke-width="1.89" cx="206" cy="262" r="9"/>
<circle stroke-width="3.24" cx="828" cy="262" r="58"/><circle stroke-width="1.89" cx="828" cy="262" r="38"/><circle stroke-width="1.89" cx="828" cy="262" r="9"/>
${[0, 72, 144, 216, 288].map(g => { const r = g * Math.PI / 180; return `<path stroke-width="1.62" d="M ${(206 + 11 * Math.cos(r)).toFixed(1)} ${(262 + 11 * Math.sin(r)).toFixed(1)} L ${(206 + 36 * Math.cos(r)).toFixed(1)} ${(262 + 36 * Math.sin(r)).toFixed(1)} M ${(828 + 11 * Math.cos(r)).toFixed(1)} ${(262 + 11 * Math.sin(r)).toFixed(1)} L ${(828 + 36 * Math.cos(r)).toFixed(1)} ${(262 + 36 * Math.sin(r)).toFixed(1)}"/>`; }).join('')}
</g>
<path d="M 0 322 H 1000" stroke="url(#${id}l)" stroke-width="4.05"/>
<path d="M 120 338 H 880" stroke="url(#${id}l)" stroke-width="1.62" opacity=".55"/>
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
.fotos.c2{grid-template-columns:1fr 1fr}.fotos.c3{grid-template-columns:1fr 1fr 1fr}
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
.destaque .leg{font-size:10px}.destaque .leg small{font-size:8.6px;color:#5b6270}

/* Capa */
.capa{background:radial-gradient(ellipse at 72% 70%,#15335e 0%,#0c2447 40%,#081a36 72%,#050f20 100%)}
.capa .moldura{position:absolute;left:16px;top:16px;right:16px;bottom:16px;border:1px solid rgba(201,169,97,.55)}
.capa .moldura2{position:absolute;left:22px;top:22px;right:22px;bottom:22px;border:1px solid rgba(201,169,97,.16)}
.capa .lema{position:absolute;left:52px;top:52px;font-size:8.5px;letter-spacing:3.6px;color:#c9d0db;line-height:1.9;font-weight:500}
.capa .num-laudo{position:absolute;right:52px;top:52px;text-align:right}
.capa .num-laudo .r{font-size:8px;letter-spacing:2.4px;color:#C9A961;font-weight:600}
.capa .num-laudo .v{font-size:13px;letter-spacing:1px;color:#fff;font-weight:700;margin-top:4px}
.capa .marca{position:absolute;left:52px;top:112px;width:310px;display:flex;flex-direction:column;align-items:center}
.capa .marca .n{font-size:40px;font-weight:800;color:#fff;letter-spacing:5px;margin-top:14px;line-height:1}
.capa .marca .s{font-size:12px;font-weight:600;color:#C9A961;letter-spacing:10px;margin-top:8px;padding-left:10px}
.capa h1{position:absolute;left:52px;top:348px;font-size:66px;font-weight:800;color:#fff;line-height:1;letter-spacing:1px}
.capa .h2{position:absolute;left:54px;top:488px;font-size:22px;font-weight:700;color:#D9BD74;letter-spacing:1.4px}
.capa .desc{position:absolute;left:54px;top:534px;width:330px;font-size:9.5px;letter-spacing:2.6px;color:#d6dce6;line-height:1.75;font-weight:500}
.capa .itens{position:absolute;left:54px;top:600px;display:flex;flex-direction:column;gap:11px}
.capa .item{display:flex;align-items:center;gap:14px;font-size:8.6px;letter-spacing:2.2px;color:#cfd6e1;font-weight:600;line-height:1.35}
.capa .item .ic{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(201,169,97,.45);border-radius:50%}
.capa .local{position:absolute;left:54px;top:1036px;font-size:9px;letter-spacing:1.8px;color:#d6dce6;font-weight:600;line-height:1.7}
.capa .selo{position:absolute;right:58px;top:452px}
.capa .carro{position:absolute;right:40px;top:846px}

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

    function fotoHtml(F, slot, legenda, opcoes = {}) {
        const f = F[slot];
        const leitura = SLOTS_LEITURA.test(slot) || opcoes.leitura;
        const extra = opcoes.info ? `<small>${esc(opcoes.info)}</small>` : '';
        const num = opcoes.numero ? `<span class="num">${opcoes.numero}</span>` : '';
        const alt = opcoes.altura ? `--fh:${opcoes.altura}px;` : '';
        const img = f
            ? `<div class="img${leitura ? ' leitura' : ''}" style="${alt}background-image:url('${f.url}')">${num}</div>`
            : `<div class="img vazia" style="${alt}">FOTO NÃO REGISTRADA${num}</div>`;
        return `<div class="foto">${img}${legenda ? `<div class="leg">${esc(legenda)}${extra}</div>` : ''}</div>`;
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
    function paginaCapa(D) {
        const itens = [
            ['escudo', 'ANÁLISE<br>ESTRUTURAL'], ['lupa', 'IDENTIFICAÇÃO<br>VEICULAR'], ['rolo', 'PINTURA E<br>ACABAMENTO'],
            ['motor', 'MOTOR E<br>CHASSI'], ['vidro', 'VIDROS E<br>GRAVAÇÕES'], ['banco', 'INTERIOR E<br>QUADROS DE PORTA']
        ];
        return `<section class="pg capa">
<div class="moldura"></div><div class="moldura2"></div>
<div class="lema">SEGURANÇA<br>INFORMAÇÃO<br>PROCEDÊNCIA</div>
<div class="num-laudo"><div class="r">LAUDO Nº</div><div class="v">${esc(D.cautelar.dossieNumero || '—')}</div>
  <div class="r" style="margin-top:14px">PLACA</div><div class="v">${esc(D.os.placa)}</div>
  ${D.marcaModelo !== 'Não informado' ? `<div class="r" style="margin-top:14px">VEÍCULO</div><div class="v" style="font-size:11px">${esc(D.marcaModelo)}</div>` : ''}</div>
<div class="marca">${svgLogo(120, '#0a1f3f')}<div class="n">CERTIVE</div><div class="s">VISTORIAS</div></div>
<h1>LAUDO<br>CAUTELAR</h1>
<div class="h2">DE AQUISIÇÃO VEICULAR</div>
<div class="desc">ANÁLISE FÍSICO-ESTRUTURAL E DE IDENTIFICAÇÃO VEICULAR</div>
<div class="itens">${itens.map(([ic, t]) => `<div class="item"><span class="ic">${icone(ic, '#C9A961', 17, 1.6)}</span><span>${t}</span></div>`).join('')}</div>
<div class="selo">${svgSelo(D.cidade, dataBR(D.dataEmissao))}</div>
<div class="carro">${svgCarroTraco(540)}</div>
<div class="local">${esc(D.cidade.toUpperCase())}<br>${esc(dataExtenso(D.dataEmissao).toUpperCase())}</div>
</section>`;
    }

    function paginaIdentificacao(D, F) {
        const veiculo = kv([
            ['Marca / modelo', D.marcaModelo],
            ['Tipo', D.tipo],
            ['Ano fab. / modelo', D.os.veiculoAno || D.campos['vehicle.year']],
            D.campos['vehicle.color'] ? ['Cor', D.campos['vehicle.color']] : null,
            ['Placa', D.os.placa],
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
            ['PINTURA', D.status.pintura, 'rolo'], ['MOTOR', D.status.motor, 'engrenagem'], ['CHASSI', D.status.chassi, 'carro']
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
        if (sim(D.d3.indicioBatida)) analise += sim(D.d3.deformacaoEstrutural) ? ' Há indícios de batida com deformação estrutural.' : ' Há indícios de batida, sem deformação estrutural.';
        const colunas = D.itensPintura.filter(i => i.reparo === 'sim');
        if (colunas.length) analise += ` Colunas com indícios de reparo estrutural: ${colunas.map(i => i.nome.toLowerCase()).join(', ')}.`;
        const obs = [D.d3.obsEnchente, D.d3.obsBatida, D.d3.observacao].filter(Boolean).map(textoVistoriador).join(' ');
        if (obs) analise += ` Observações do vistoriador: ${obs}`;
        const comFoto = D.estrutura.filter(e => F[e.codigo]);
        const prioridade = e => (e.status === 'original' || e.status === 'nao_aplicavel' ? 1 : 0);
        const fotos = (comFoto.length ? comFoto : D.estrutura).slice().sort((a, b) => prioridade(a) - prioridade(b)).slice(0, 6);
        return pagina(D, 'III', 'ANÁLISE ESTRUTURAL', 'Carroceria e região do chassi', `
<div class="indic">${indic.map(([ic, r, ruim]) => `<div class="card"><div class="circ ${ruim ? 'nc' : 'ok'}">${icone(ic, ruim ? COR.vermelho : COR.verde, 24, 1.8)}</div><div><div class="r">${r}</div><div class="v ${ruim ? 'tx-nc' : 'tx-ok'}">${ruim ? 'CONSTATADO' : 'NÃO CONSTATADO'}</div></div></div>`).join('')}</div>
<div>${rotulo('Pontos estruturais avaliados')}
<table class="tab" style="--pt:5.4px;--ft:9.6px"><thead><tr><th>Item</th><th>Região</th><th style="width:150px">Status</th><th>Observações</th></tr></thead><tbody>${linhas}</tbody></table></div>
<div class="card analise"><div class="circ">${icone('relatorio', '#fff', 24, 1.8)}</div><div class="t"><b>ANÁLISE TÉCNICA ${statusSpan(D.status.estrutura)}</b>${esc(analise)}</div></div>
<div>${rotulo('Registro fotográfico — estrutura')}
<div class="fotos c3" style="--fh:128px">${fotos.map(e => fotoHtml(F, e.codigo, nomeEst(e))).join('')}</div></div>`);
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
        const etiquetas = D.etiquetas.map(e => `<tr><td>${esc(e.nome)}</td><td>${chipEtiqueta(e.status)}</td></tr>`).join('');
        const notas = [];
        if (D.itensPintura.some(i => i.reparo === 'sim')) notas.push('<b>*</b> Coluna com indícios de reparo estrutural.');
        if (D.d4.observacao) notas.push(`Observação: ${esc(textoVistoriador(D.d4.observacao))}`);
        if (D.d2.observacao) notas.push(`Etiquetas: ${esc(textoVistoriador(D.d2.observacao))}`);
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
  <div style="flex:1.1">${rotulo('Etiquetas e acabamentos')}<table class="tab"><thead><tr><th>Item</th><th style="width:112px">Status</th></tr></thead><tbody>${etiquetas}</tbody></table></div>
  <div class="fotos c2" style="flex:1;--fh:112px">${fotoHtml(F, 'etiqueta_eta', 'Etiqueta ETA — motor')}${fotoHtml(F, 'medidor_pintura_uso', 'Medidor de espessura em uso')}</div>
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
<div>${rotulo('Etiquetas de identificação')}<div class="card" style="overflow:hidden">${ident}</div></div>
<div>${rotulo('Registro fotográfico')}
<div class="fotos c3" style="--fh:150px">${D.vidros.map(v => fotoHtml(F, v.codigo, nomeCurto(v.nome), { info: v.lida ? `Gravação: ${v.lida}` : '' })).join('')}</div></div>`);
    }

    function paginaMotorChassi(D, F) {
        const conf = D.chassiConfere === null ? esc(D.chassiCadastro ? 'Leitura não informada' : 'Chassi não informado no cadastro da O.S.')
            : (D.chassiConfere ? '<span class="st ok">Confere com o cadastro</span>' : `<span class="st nc">Diverge do cadastro</span> &nbsp;<span class="mono">${esc(D.chassiCadastro)}</span>`);
        const orig = v => v === false ? '<span class="st nc">Não original</span>' : '<span class="st ok">Original</span>';
        const tabela = kv([
            ['Chassi lido', `<span class="mono">${esc(D.chassiLido)}</span>`, true],
            ['Conferência cadastral', conf, true],
            ['Gravação do chassi', orig(D.d2.chassiOriginal), true],
            ['Motor lido', `<span class="mono">${esc(D.motorLido)}</span>`, true],
            ['Gravação do motor', orig(D.d2.motorOriginal), true],
            ['Compartimento do motor', D.d6.reparoMotor === 'sim' ? '<span class="st ress">Sinais de reparo</span>' : '<span class="st ok">Sem sinais de reparo</span>', true],
            ['Cor original do compartimento', D.d6.corMotorOk === 'nao' ? '<span class="st ress">Não preservada</span>' : '<span class="st ok">Preservada</span>', true]
        ]);
        const st = [D.status.motor, D.status.chassi];
        const pior = st.includes('nao_conforme') ? 'nao_conforme' : (st.includes('com_ressalvas') ? 'com_ressalvas' : 'conforme');
        const partes = [
            `Chassi lido no veículo: ${D.chassiLido}; gravação com características ${D.d2.chassiOriginal === false ? 'NÃO originais' : 'originais'}.`,
            `Motor lido: ${D.motorLido}; gravação com características ${D.d2.motorOriginal === false ? 'NÃO originais' : 'originais'}.`,
            D.d6.reparoMotor === 'sim' ? 'O compartimento do motor apresenta sinais de reparo ou troca de estruturas.' : 'O compartimento do motor não apresenta sinais de reparo estrutural.',
            D.d6.corMotorOk === 'nao' ? 'A cor original do compartimento não está preservada.' : ''
        ];
        const texto = D.campos['technical.observation'] || [partes.filter(Boolean).join(' '), textoVistoriador(D.d6.observacao)].filter(Boolean).join(' ');
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
  <div><div class="r">PARECER TÉCNICO</div><div class="p">${pf.texto}</div><div class="d">${esc(resumoParecer(D.parecerFinal))}</div></div>
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
            add(v.codigo, `Vidro ${nomeCurto(v.nome).toLowerCase()}`, !v.original ? 'Gravação divergente (vidro trocado)' : `Desbaste / polimento na gravação${v.lida ? ' — lido: ' + v.lida : ''}`, !v.original ? 'nc' : 'ress'));
        if (D.d7.intervencaoQuadros === 'sim') ((global.CAUTELAR_SLOTS || {})[7] || []).forEach(q => add(q.codigo, capitalizar(q.nome), 'Intervenção / soldas no quadro de porta', 'nc'));
        return lista;
    }

    function blocoDestaques(F, itens) {
        return `<div class="fotos c2" style="--fh:250px;row-gap:16px">${itens.map(d =>
            `<div class="foto destaque ${d.cls}"><div class="img${SLOTS_LEITURA.test(d.slot) ? ' leitura' : ''}" style="background-image:url('${F[d.slot].url}')"><span class="tag">${d.cls === 'nc' ? 'NÃO CONFORME' : 'PONTO DE ATENÇÃO'}</span></div>
<div class="leg">${esc(d.titulo)}<small>${esc(d.motivo)}</small></div></div>`).join('')}</div>`;
    }

    function paginasRegistro(D, F) {
        const saida = [];
        const destaques = destaquesFotograficos(D, F);
        const todos = Object.keys(global.CAUTELAR_SLOTS || {}).flatMap(n => global.CAUTELAR_SLOTS[n]).filter(sl => F[sl.codigo]);
        const galeria = (lote, inicio, altura) => `<div class="fotos c3" style="--fh:${altura}px;row-gap:16px">${lote.map((sl, i) => {
            const m = D.meta(sl.codigo);
            const info = [m.timestamp ? dataBR(m.timestamp, true) : '', m.gps && m.gps.latitude ? `GPS ${Number(m.gps.latitude).toFixed(5)}, ${Number(m.gps.longitude).toFixed(5)}` : ''].filter(Boolean).join('  ·  ');
            return fotoHtml(F, sl.codigo, nomeCurto(sl.nome), { numero: inicio + i + 1, info });
        }).join('')}</div>`;
        const rotAcervo = '<div class="rot"><i></i>Acervo completo</div>';
        let usadas = 0;
        // Destaques (até 4 por página); a primeira página completa o espaço com o início do acervo
        for (let p = 0; p * 4 < destaques.length; p++) {
            const lote = destaques.slice(p * 4, (p + 1) * 4);
            let html = `${p === 0 ? '<div class="rot"><i></i>Pontos com constatação em destaque</div>' : ''}${blocoDestaques(F, lote)}`;
            const ultima = (p + 1) * 4 >= destaques.length;
            if (ultima) {
                const linhas = Math.ceil(lote.length / 2) <= 1 ? 2 : 1;
                const extra = todos.slice(0, linhas * 3);
                if (extra.length) { html += rotAcervo + galeria(extra, 0, 180); usadas = extra.length; }
            }
            saida.push(saida.length === 0 ? pagina(D, 'IX', 'REGISTRO FOTOGRÁFICO', 'Destaques e acervo completo da vistoria', html) : pagina(D, '', '', '', html));
        }
        const porPagina = 9;
        for (let inicio = usadas; inicio < todos.length; inicio += porPagina) {
            const primeira = saida.length === 0;
            const html = `${inicio === 0 ? rotAcervo : ''}${galeria(todos.slice(inicio, inicio + porPagina), inicio, primeira ? 196 : 222)}`;
            saida.push(primeira ? pagina(D, 'IX', 'REGISTRO FOTOGRÁFICO', 'Acervo completo da vistoria', html) : pagina(D, '', '', '', html));
        }
        return saida;
    }

    function montarHtml(D, F, extras = {}) {
        const paginas = [
            paginaCapa(D), paginaIdentificacao(D, F), paginaResumo(D), paginaEstrutura(D, F),
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
        const [F, qr] = await Promise.all([
            carregarFotos(D),
            D.hash ? gerarQrDataUrl(urlConsulta(D.hash)) : Promise.resolve(null)
        ]);
        return { D, F, qr, html: montarHtml(D, F, { qr, modo: opcoes.modo }) };
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
    global._laudoCertiveInterno = { montarDados, listasResumo, textoParecerFinal, limpar, montarHtml, prepararLaudo, silhueta, ajustarPaginas };
})(window);
