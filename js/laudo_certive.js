/**
 * LAUDO CAUTELAR CERTIVE — gerador do PDF oficial.
 *
 * O laudo é desenhado inteiramente pelo sistema (pdf-lib), página por página, com a
 * identidade visual Certive (azul-marinho, dourado, numeração romana). Não depende
 * de um PDF modelo: o modelo antigo era a imagem de um laudo de exemplo já
 * preenchido e os dados reais ficavam por cima dele.
 *
 * Fontes do conteúdo, nesta ordem:
 *   1. constatações do vistoriador (seções 1 a 8 da captura) e as fotos por slot;
 *   2. textos redigidos pelo agente de laudo no servidor (cautelar.dadosIaConfeccionado,
 *      quando existir): listas do resumo, parecer técnico e texto do parecer final;
 *   3. textos padrão montados aqui a partir das constatações.
 *
 * Tamanho A4 (595 × 842 pt). As funções usam coordenadas a partir do TOPO da página.
 */
(function (global) {
    'use strict';

    const A4 = { w: 595.28, h: 841.89 };
    const MARGEM = 40;
    const COR = {
        navy: [10, 31, 61],
        navy2: [16, 42, 79],
        gold: [201, 169, 97],
        goldEscuro: [168, 134, 64],
        creme: [250, 248, 243],
        cremeEscuro: [242, 238, 229],
        tinta: [15, 24, 36],
        cinza: [107, 114, 128],
        linha: [226, 222, 215],
        branco: [255, 255, 255],
        verde: [47, 107, 63],
        ambar: [184, 100, 43],
        vermelho: [139, 38, 53],
        repintura: [201, 169, 97],
        neutro: [150, 142, 128]
    };

    const PARECER = {
        conforme: { texto: 'CONFORME', cor: COR.verde },
        com_ressalvas: { texto: 'CONFORME COM RESSALVA', cor: COR.ambar },
        nao_conforme: { texto: 'NÃO CONFORME', cor: COR.vermelho }
    };

    const CORES_PINTURA = {
        'ORIGINAL': COR.verde,
        'REPINTURA': COR.repintura,
        'REPINTURA COM MASSA': COR.ambar,
        'AVARIADO': COR.vermelho,
        'NÃO SE APLICA': COR.neutro,
        'NÃO APLICÁVEL': COR.neutro,
        'NÃO AVALIADO': COR.neutro
    };

    const ROTULO_ESTRUTURA = {
        original: { t: 'Original', cor: COR.verde },
        reparo_aparente: { t: 'Indícios de reparo', cor: COR.ambar },
        substituicao: { t: 'Indícios de substituição', cor: COR.vermelho },
        indicio_avaria: { t: 'Indício de avaria', cor: COR.ambar },
        nao_aplicavel: { t: 'Não se aplica', cor: COR.neutro }
    };

    const ROTULO_ETIQUETA = {
        preservada: { t: 'Preservada', cor: COR.verde },
        danificada: { t: 'Danificada', cor: COR.ambar },
        ausente: { t: 'Ausente', cor: COR.vermelho }
    };

    // Caracteres fora do WinAnsi (fontes padrão do PDF) quebram o pdf-lib
    const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
    function limpar(texto) {
        return String(texto ?? '')
            .replace(/[→⇒]/g, '->')
            .replace(/[✓✔]/g, '')
            .replace(/\t/g, ' ')
            .split('')
            .filter(ch => ch === '\n' || (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 255) || WINANSI_EXTRA.includes(ch))
            .join('');
    }

    function rgb(c) { return PDFLib.rgb(c[0] / 255, c[1] / 255, c[2] / 255); }

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
        return isNaN(n) || n <= 0 ? 'Não informado' : `${n.toLocaleString('pt-BR')} km`;
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

        const d1 = sec(1), d2 = sec(2), d3 = sec(3), d4 = sec(4), d6 = sec(6), d7 = sec(7), d8 = sec(8);

        const marcaModelo = String(os.veiculoMarcaModelo || '').trim();
        const tipos = { hatch: 'Hatch', sedan: 'Sedan', suv: 'SUV', pickup: 'Pick-up', van: 'Van / Utilitário', minivan: 'Minivan', cupe: 'Cupê', outro: 'Outro' };
        const tipo = d1.tipoVeiculo || os.veiculoTipo || '';
        const normalizar = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const chassiLido = String(d2.chassiLido || '').toUpperCase();
        const chassiCadastro = String(os.veiculoChassi || '').toUpperCase();
        const chassiConfere = !chassiCadastro ? null : normalizar(chassiLido) === normalizar(chassiCadastro);

        const parecerFinal = cautelar.parecerFinal || cautelar.parecerConsolidado || d8.parecerFinal || d8.parecerPreliminar || 'conforme';

        // Pintura (19 peças na ordem da vistoria)
        const itensPintura = (global.CAUTELAR_PINTURA_ITENS || []).map((it, i) => {
            let classe = String(d4[`pint_${it.codigo}_classe`] || '').toUpperCase() || 'NÃO AVALIADO';
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

        // Status por área (constatação do vistoriador; o agente pode ter refinado)
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
            etiquetas.some(e => e.status === 'ausente') ? 'com_ressalvas' : 'conforme',
            etiquetas.some(e => e.status === 'danificada') ? 'com_ressalvas' : 'conforme',
            vidros.some(v => !v.original || v.desbaste) ? 'com_ressalvas' : 'conforme'
        ]);
        const stPintura = deCampo(campos['paint.status']) || (
            itensPintura.some(i => i.classe === 'AVARIADO' || i.classe === 'REPINTURA COM MASSA' || i.classe === 'REPINTURA') ? 'com_ressalvas' : 'conforme');
        const stMotor = deCampo(campos['engine.status']) || (d6.reparoMotor === 'sim' || d6.corMotorOk === 'nao' ? 'com_ressalvas' : 'conforme');
        const stChassi = deCampo(campos['chassis.status']) || pior([
            d2.chassiOriginal === false || d2.motorOriginal === false ? 'nao_conforme' : 'conforme',
            chassiConfere === false ? 'com_ressalvas' : 'conforme'
        ]);

        return {
            cautelar, os, unidade, vistoriador, ia, campos, fotos, foto, meta,
            d1, d2, d3, d4, d6, d7, d8,
            marca: marcaModelo.includes('/') ? marcaModelo.split('/')[0].trim() : '',
            modelo: marcaModelo.includes('/') ? marcaModelo.split('/').slice(1).join('/').trim() : marcaModelo,
            marcaModelo: marcaModelo || 'Não informado',
            tipo: tipos[tipo] || 'Não informado', tipoCodigo: tipo || 'sedan',
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

    // Listas e textos padrão (usados quando o agente não redigiu)
    function listasResumo(D) {
        const ok = [], alerta = [];
        const linhas = t => String(t || '').split('\n').map(l => l.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean);
        if (D.campos['summary.approved_items'] || D.campos['summary.alert_items']) {
            return { ok: linhas(D.campos['summary.approved_items']), alerta: linhas(D.campos['summary.alert_items']) };
        }
        if (D.d2.chassiOriginal !== false) ok.push('Gravação do chassi com características originais');
        else alerta.push('Gravação do chassi com características NÃO originais');
        if (D.d2.motorOriginal !== false) ok.push('Gravação do motor com características originais');
        else alerta.push('Gravação do motor com características NÃO originais');
        if (D.chassiConfere === false) alerta.push(`Chassi lido diverge do cadastro da O.S. (${D.chassiCadastro})`);
        D.etiquetas.forEach(e => {
            if (e.status === 'preservada') ok.push(`${e.nome}: preservada`);
            else if (e.status) alerta.push(`${e.nome}: ${ROTULO_ETIQUETA[e.status]?.t.toLowerCase() || e.status}`);
        });
        if (D.d3.indicioEnchente === 'sim') alerta.push('Indícios de enchente constatados');
        else ok.push('Sem indícios de enchente');
        if (D.d3.indicioBatida === 'sim') {
            alerta.push(D.d3.deformacaoEstrutural === 'sim' ? 'Indícios de batida COM deformação estrutural' : 'Indícios de batida sem deformação estrutural');
        } else ok.push('Sem indícios de batida');
        D.estrutura.filter(e => e.status !== 'original' && e.status !== 'nao_aplicavel')
            .forEach(e => alerta.push(`${e.nome}: ${ROTULO_ESTRUTURA[e.status]?.t.toLowerCase()}`));
        D.itensPintura.filter(i => i.reparo === 'sim').forEach(i => alerta.push(`${i.nome}: indícios de reparo estrutural`));
        const pintadas = D.itensPintura.filter(i => ['REPINTURA', 'REPINTURA COM MASSA', 'AVARIADO'].includes(i.classe));
        if (pintadas.length) alerta.push(`Pintura: ${pintadas.length} peça(s) com repintura/avaria`);
        else ok.push('Pintura original nas peças avaliadas');
        const vidrosProblema = D.vidros.filter(v => !v.original || v.desbaste);
        if (vidrosProblema.length) vidrosProblema.forEach(v => alerta.push(`${v.nome.replace('GRAVAÇÃO ', '')}: ${!v.original ? 'gravação não original' : 'desbaste/polimento'}`));
        else ok.push('Gravações dos vidros originais');
        if (D.d6.reparoMotor === 'sim') alerta.push('Sinais de reparo no compartimento do motor');
        else ok.push('Compartimento do motor sem sinais de reparo estrutural');
        if (D.d7.intervencaoQuadros === 'sim') alerta.push('Intervenção/soldas nos quadros de porta');
        else ok.push('Quadros de porta sem sinais de intervenção');
        return { ok, alerta };
    }

    function textoParecerFinal(D) {
        if (D.campos['final.opinion_text']) return D.campos['final.opinion_text'];
        const p = PARECER[D.parecerFinal].texto;
        const { alerta } = listasResumo(D);
        let t = `Com base nas verificações realizadas no veículo ${D.marcaModelo !== 'Não informado' ? D.marcaModelo + ', ' : ''}placa ${D.os.placa}, ` +
            `o parecer técnico desta vistoria cautelar é ${p}.`;
        if (alerta.length) t += ` Foram registrados os seguintes pontos de atenção: ${alerta.slice(0, 6).join('; ')}.`;
        else t += ' Não foram constatados indícios de sinistro estrutural, remarcação de chassi ou irregularidades de identificação.';
        const obs = D.d8.observacaoFinal || D.d8.observacao;
        if (obs) t += ` Observações do vistoriador: ${obs}.`;
        return t;
    }

    // ------------------------------------------------------------------
    // Imagens
    // ------------------------------------------------------------------
    async function carregarFotoJpg(url, maxLado = 1100) {
        if (!url) return null;
        try {
            const resp = await fetch(url, { cache: 'force-cache' });
            if (!resp.ok) return null;
            const blob = await resp.blob();
            const bmp = await createImageBitmap(blob);
            const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bmp.width * escala);
            canvas.height = Math.round(bmp.height * escala);
            canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
            if (bmp.close) bmp.close();
            const saida = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
            canvas.width = 0; canvas.height = 0;
            return saida ? new Uint8Array(await saida.arrayBuffer()) : null;
        } catch (e) {
            console.warn('Foto indisponível para o laudo:', url, e);
            return null;
        }
    }

    function dataUrlParaBytes(dataUrl) {
        const b64 = String(dataUrl).split(',')[1] || '';
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    // ------------------------------------------------------------------
    // Motor de desenho
    // ------------------------------------------------------------------
    class Pagina {
        constructor(L, page) { this.L = L; this.p = page; }
        Y(top, altura = 0) { return A4.h - top - altura; }
        ret(x, top, w, h, cor, borda, espessura = 0.6) {
            this.p.drawRectangle({ x, y: this.Y(top, h), width: w, height: h, color: cor ? rgb(cor) : undefined, borderColor: borda ? rgb(borda) : undefined, borderWidth: borda ? espessura : 0 });
        }
        linha(x1, t1, x2, t2, cor = COR.linha, esp = 0.6) {
            this.p.drawLine({ start: { x: x1, y: this.Y(t1) }, end: { x: x2, y: this.Y(t2) }, thickness: esp, color: rgb(cor) });
        }
        texto(t, x, top, { tam = 9, fonte = 'reg', cor = COR.tinta, alinhar = 'esq', larg = null } = {}) {
            const f = this.L.f[fonte];
            const s = limpar(t);
            let px = x;
            if (alinhar !== 'esq') {
                const w = f.widthOfTextAtSize(s, tam);
                px = alinhar === 'dir' ? x - w : x + ((larg || 0) - w) / 2;
            }
            this.p.drawText(s, { x: px, y: this.Y(top) - tam * 0.8, size: tam, font: f, color: rgb(cor) });
        }
        quebrar(t, largura, tam, fonte = 'reg') {
            const f = this.L.f[fonte];
            const saida = [];
            limpar(t).split('\n').forEach(par => {
                const palavras = par.split(/\s+/).filter(Boolean);
                let atual = '';
                palavras.forEach(p => {
                    const tent = atual ? atual + ' ' + p : p;
                    if (f.widthOfTextAtSize(tent, tam) <= largura) atual = tent;
                    else {
                        if (atual) saida.push(atual);
                        // palavra maior que a linha: corta
                        let resto = p;
                        while (f.widthOfTextAtSize(resto, tam) > largura && resto.length > 1) {
                            let n = resto.length;
                            while (n > 1 && f.widthOfTextAtSize(resto.slice(0, n), tam) > largura) n--;
                            saida.push(resto.slice(0, n));
                            resto = resto.slice(n);
                        }
                        atual = resto;
                    }
                });
                if (atual) saida.push(atual);
                if (!palavras.length) saida.push('');
            });
            return saida;
        }
        // Corta o texto com reticências para caber na largura
        caber(t, largura, tam, fonte = 'reg') {
            const f = this.L.f[fonte];
            let s = limpar(t);
            if (f.widthOfTextAtSize(s, tam) <= largura) return s;
            while (s.length > 1 && f.widthOfTextAtSize(s + '...', tam) > largura) s = s.slice(0, -1);
            return s.trimEnd() + '...';
        }
        paragrafo(t, x, top, largura, { tam = 9, fonte = 'reg', cor = COR.tinta, entre = 1.35, maxLinhas = 999 } = {}) {
            const linhas = this.quebrar(t, largura, tam, fonte);
            const usar = linhas.slice(0, maxLinhas);
            if (linhas.length > maxLinhas && usar.length) usar[usar.length - 1] = usar[usar.length - 1].replace(/.{0,3}$/, '...');
            usar.forEach((l, i) => this.texto(l, x, top + i * tam * entre, { tam, fonte, cor }));
            return top + usar.length * tam * entre;
        }
        pill(t, x, top, { cor = COR.verde, tam = 7.5, alinhar = 'esq', solido = true } = {}) {
            const f = this.L.f.bold;
            const s = limpar(t);
            const w = f.widthOfTextAtSize(s, tam) + 12;
            const h = tam + 7;
            const px = alinhar === 'dir' ? x - w : (alinhar === 'centro' ? x - w / 2 : x);
            this.p.drawRectangle({ x: px, y: this.Y(top, h), width: w, height: h, color: solido ? rgb(cor) : rgb(COR.branco), borderColor: rgb(cor), borderWidth: 0.8 });
            this.p.drawText(s, { x: px + 6, y: this.Y(top, h) + (h - tam * 0.72) / 2, size: tam, font: f, color: solido ? rgb(COR.branco) : rgb(cor) });
            return w;
        }
        async foto(slot, x, top, w, h, legenda) {
            this.ret(x, top, w, h, [22, 28, 38]);
            const f = this.L.D.foto(slot);
            const bytes = f ? await this.L.imagem(f.url_original || f.url_thumb) : null;
            if (bytes) {
                try {
                    const img = await this.L.doc.embedJpg(bytes);
                    // "contain": mostra a foto inteira (números de chassi/etiquetas não podem ser cortados)
                    const esc = Math.min(w / img.width, h / img.height);
                    const iw = img.width * esc, ih = img.height * esc;
                    this.p.drawImage(img, { x: x + (w - iw) / 2, y: this.Y(top, h) + (h - ih) / 2, width: iw, height: ih });
                } catch (e) {
                    console.warn('Falha ao embutir foto', slot, e);
                }
            } else {
                this.texto('Foto não registrada', x, top + h / 2 - 4, { tam: 7, cor: [170, 176, 186], alinhar: 'centro', larg: w });
            }
            if (legenda) {
                this.ret(x, top + h, w, 13, COR.cremeEscuro);
                this.texto(this.caber(legenda, w - 8, 6.2, 'bold'), x + 4, top + h + 3.5, { tam: 6.2, fonte: 'bold', cor: COR.navy });
            }
        }
    }

    class Laudo {
        constructor(doc, fontes, D) {
            this.doc = doc; this.f = fontes; this.D = D; this.paginas = [];
            this.cacheImg = new Map();
        }
        async imagem(url) {
            if (!url) return null;
            if (!this.cacheImg.has(url)) this.cacheImg.set(url, await carregarFotoJpg(url));
            return this.cacheImg.get(url);
        }
        nova(fundo = COR.creme) {
            const page = this.doc.addPage([A4.w, A4.h]);
            const P = new Pagina(this, page);
            P.ret(0, 0, A4.w, A4.h, fundo);
            this.paginas.push(P);
            return P;
        }
        logo(P, x, top, escala = 1, claro = false) {
            // Escudo com marca de verificação (vetor)
            const escudo = 'M 12 0 L 24 5 L 24 14 C 24 22 18 28 12 31 C 6 28 0 22 0 14 L 0 5 Z';
            P.p.drawSvgPath(escudo, { x, y: P.Y(top), scale: escala, color: rgb(COR.gold) });
            P.p.drawSvgPath('M 6 15 L 10.5 19.5 L 18.5 10.5', { x, y: P.Y(top), scale: escala, borderColor: rgb(claro ? COR.navy : COR.branco), borderWidth: 2.4 * escala });
            P.texto('CERTIVE', x + 30 * escala, top + 3 * escala, { tam: 15 * escala, fonte: 'bold', cor: claro ? COR.branco : COR.navy });
            P.texto('V I S T O R I A S', x + 30.5 * escala, top + 20 * escala, { tam: 6.5 * escala, fonte: 'bold', cor: COR.gold });
        }
        cabecalho(P, numeral, titulo, subtitulo) {
            this.logo(P, MARGEM, 30, 0.95);
            P.texto('DOSSIÊ', A4.w - MARGEM, 30, { tam: 7, fonte: 'bold', cor: COR.cinza, alinhar: 'dir' });
            P.texto(this.D.cautelar.dossieNumero || '', A4.w - MARGEM, 40, { tam: 11, fonte: 'bold', cor: COR.navy, alinhar: 'dir' });
            P.texto(`Placa ${this.D.os.placa}`, A4.w - MARGEM, 54, { tam: 7.5, cor: COR.cinza, alinhar: 'dir' });
            P.linha(MARGEM, 72, A4.w - MARGEM, 72, COR.gold, 1);
            if (numeral) {
                P.texto(numeral, MARGEM, 86, { tam: 34, fonte: 'serifItalico', cor: COR.gold });
                const xTitulo = MARGEM + this.f.serifItalico.widthOfTextAtSize(numeral, 34) + 12;
                P.texto(titulo, xTitulo, 94, { tam: 16, fonte: 'bold', cor: COR.navy });
                if (subtitulo) P.texto(subtitulo, xTitulo, 113, { tam: 8, cor: COR.cinza });
            }
            return 135;
        }
        rodapes() {
            const total = this.paginas.length;
            this.paginas.forEach((P, i) => {
                if (i === 0) return;
                P.linha(MARGEM, A4.h - 34, A4.w - MARGEM, A4.h - 34, COR.linha, 0.6);
                P.texto('CERTIVE VISTORIAS  ·  LAUDO CAUTELAR', MARGEM, A4.h - 27, { tam: 6.5, fonte: 'bold', cor: COR.cinza });
                if (this.D.hash) P.texto(`Autenticação: ${String(this.D.hash).slice(0, 28)}`, A4.w / 2, A4.h - 27, { tam: 6, cor: COR.cinza, alinhar: 'centro', larg: 0 });
                P.texto(`PÁG. ${String(i + 1).padStart(2, '0')} DE ${String(total).padStart(2, '0')}`, A4.w - MARGEM, A4.h - 27, { tam: 6.5, fonte: 'bold', cor: COR.cinza, alinhar: 'dir' });
            });
        }
        // Linha de rótulo/valor
        kv(P, x, top, w, rotulo, valor, { tamValor = 10, fonteValor = 'bold' } = {}) {
            P.texto(rotulo.toUpperCase(), x, top, { tam: 6.5, fonte: 'bold', cor: COR.cinza });
            const fim = P.paragrafo(valor || 'Não informado', x, top + 10, w, { tam: tamValor, fonte: fonteValor, cor: COR.tinta, maxLinhas: 2 });
            P.linha(x, fim + 4, x + w, fim + 4);
            return fim + 12;
        }
        caixaTitulo(P, x, top, w, titulo, cor = COR.navy) {
            P.ret(x, top, w, 18, cor);
            P.texto(titulo.toUpperCase(), x + 8, top + 5.5, { tam: 7.5, fonte: 'bold', cor: COR.branco });
            return top + 18;
        }
        lista(P, x, top, w, itens, marcador, corMarcador, maxAltura) {
            let y = top;
            for (const item of itens) {
                const linhas = P.quebrar(item, w - 14, 8.2);
                if (maxAltura && y + linhas.length * 11 > top + maxAltura) {
                    P.texto('(demais itens no registro do sistema)', x + 12, y, { tam: 7, cor: COR.cinza });
                    break;
                }
                P.p.drawCircle({ x: x + 4, y: P.Y(y + 4), size: 2.2, color: rgb(corMarcador) });
                linhas.forEach((l, i) => P.texto(l, x + 12, y + i * 11, { tam: 8.2 }));
                y += linhas.length * 11 + 3;
            }
            return y;
        }
    }

    // ------------------------------------------------------------------
    // Páginas
    // ------------------------------------------------------------------
    async function paginaCapa(L) {
        const D = L.D;
        const P = L.nova(COR.navy);
        P.ret(18, 18, A4.w - 36, A4.h - 36, null, COR.gold, 0.8);
        L.logo(P, 56, 64, 1.6, true);
        P.texto('LAUDO', 56, 250, { tam: 46, fonte: 'bold', cor: COR.branco });
        P.texto('CAUTELAR', 56, 300, { tam: 46, fonte: 'bold', cor: COR.branco });
        P.texto('DE AQUISIÇÃO VEICULAR', 58, 356, { tam: 15, fonte: 'bold', cor: COR.gold });
        P.linha(58, 382, 200, 382, COR.gold, 1.2);
        P.texto('Análise físico-estrutural e de identificação veicular', 58, 392, { tam: 10, cor: [205, 212, 224] });

        // Selo "aprovado" só quando o parecer não é "não conforme"
        if (D.parecerFinal !== 'nao_conforme') {
            try {
                const resp = await fetch('icons/selo_procedencia.png');
                if (resp.ok) {
                    const selo = await L.doc.embedPng(new Uint8Array(await resp.arrayBuffer()));
                    P.p.drawImage(selo, { x: A4.w - 56 - 150, y: P.Y(470, 150), width: 150, height: 150 });
                }
            } catch (e) { /* selo é opcional */ }
        }

        const top = 640;
        P.linha(56, top - 14, A4.w - 56, top - 14, [60, 80, 110], 0.6);
        const col = (x, rotulo, valor, w) => {
            P.texto(rotulo, x, top, { tam: 6.5, fonte: 'bold', cor: COR.gold });
            P.paragrafo(valor, x, top + 11, w, { tam: 10, fonte: 'bold', cor: COR.branco, maxLinhas: 2 });
        };
        col(56, 'VEÍCULO', D.marcaModelo, 170);
        col(236, 'PLACA', D.os.placa, 90);
        col(336, 'DOSSIÊ', D.cautelar.dossieNumero || '', 100);
        col(446, 'VISTORIA', dataBR(D.dataVistoria), 100);
        P.texto('PARECER TÉCNICO', 56, top + 52, { tam: 6.5, fonte: 'bold', cor: COR.gold });
        P.pill(PARECER[D.parecerFinal].texto, 56, top + 64, { cor: PARECER[D.parecerFinal].cor, tam: 9 });
        P.texto(`${D.cidade}  ·  ${dataExtenso(D.dataEmissao)}`, 56, A4.h - 60, { tam: 8, cor: [205, 212, 224] });
        P.texto(limpar(D.unidade.razao_social || 'Certive Vistorias'), A4.w - 56, A4.h - 60, { tam: 8, cor: [205, 212, 224], alinhar: 'dir' });
    }

    async function paginaIdentificacao(L) {
        const D = L.D;
        const P = L.nova();
        let top = L.cabecalho(P, 'I', 'IDENTIFICAÇÃO DO VEÍCULO', 'Dados constatados no veículo e no cadastro da ordem de serviço');
        const xE = MARGEM, wE = 235, xD = MARGEM + wE + 20, wD = A4.w - MARGEM - xD;
        let y = top;
        y = L.kv(P, xE, y, wE, 'Marca / modelo', D.marcaModelo);
        y = L.kv(P, xE, y, wE, 'Tipo de carroceria', D.tipo);
        y = L.kv(P, xE, y, wE, 'Ano fabricação / modelo', D.os.veiculoAno || 'Não informado');
        y = L.kv(P, xE, y, wE, 'Placa', D.os.placa);
        y = L.kv(P, xE, y, wE, 'Chassi (lido no veículo)', D.chassiLido, { tamValor: 9.5 });
        y = L.kv(P, xE, y, wE, 'Motor (lido no veículo)', D.motorLido, { tamValor: 9.5 });
        y = L.kv(P, xE, y, wE, 'Renavam', D.os.renavam || 'Não informado');
        y = L.kv(P, xE, y, wE, 'Quilometragem (painel)', formatarKm(D.d1.quilometragem));
        const conserva = { excelente: 'Excelente', bom: 'Bom', regular: 'Regular', mau: 'Mau' };
        y = L.kv(P, xE, y, wE, 'Estado geral de conservação', conserva[D.d1.estadoConservacao] || 'Não informado');
        L.kv(P, xE, y, wE, 'Placa confere com o documento', D.d1.placaConfere === 'nao' ? 'NÃO' : 'Sim');

        await P.foto('frente_45_dir', xD, top, wD, 150, 'FRENTE 45° — LADO DIREITO');
        await P.foto('traseira_45_esq', xD, top + 172, wD, 150, 'TRASEIRA 45° — LADO ESQUERDO');

        const boxTop = 560;
        L.caixaTitulo(P, MARGEM, boxTop, A4.w - 2 * MARGEM, 'Dados da vistoria');
        P.ret(MARGEM, boxTop + 18, A4.w - 2 * MARGEM, 58, COR.branco, COR.linha);
        const c = (x, r, v) => { P.texto(r, x, boxTop + 28, { tam: 6.5, fonte: 'bold', cor: COR.cinza }); P.paragrafo(v, x, boxTop + 39, 120, { tam: 8.5, fonte: 'bold', maxLinhas: 3 }); };
        c(MARGEM + 10, 'DATA / HORA', dataBR(D.dataVistoria, true));
        c(MARGEM + 140, 'LOCAL', D.unidade.nome || D.cidade);
        c(MARGEM + 270, 'VISTORIADOR', D.vistoriador.nome || 'Não informado');
        c(MARGEM + 400, 'CREDENCIAMENTO', D.unidade.credenciamento || 'Não informado');

        const fTop = 655, fw = (A4.w - 2 * MARGEM - 20) / 3;
        await P.foto('placa_dianteira', MARGEM, fTop, fw, 95, 'PLACA DIANTEIRA');
        await P.foto('painel_hodometro', MARGEM + fw + 10, fTop, fw, 95, 'PAINEL / HODÔMETRO');
        await P.foto('crlv_documento', MARGEM + 2 * (fw + 10), fTop, fw, 95, 'DOCUMENTO DO VEÍCULO');
    }

    function paginaResumo(L) {
        const D = L.D;
        const P = L.nova();
        const top = L.cabecalho(P, 'II', 'RESUMO DA ANÁLISE', 'Situação de cada área avaliada e principais constatações');
        const areas = [
            ['ESTRUTURA', D.status.estrutura], ['IDENTIFICAÇÃO', D.status.identificacao],
            ['PINTURA', D.status.pintura], ['MOTOR', D.status.motor], ['CHASSI', D.status.chassi]
        ];
        const gap = 8, w = (A4.w - 2 * MARGEM - gap * 4) / 5;
        areas.forEach(([nome, st], i) => {
            const x = MARGEM + i * (w + gap);
            const p = PARECER[st] || PARECER.conforme;
            P.ret(x, top, w, 62, COR.branco, COR.linha);
            P.ret(x, top, w, 4, p.cor);
            P.texto(nome, x, top + 14, { tam: 7.5, fonte: 'bold', cor: COR.navy, alinhar: 'centro', larg: w });
            const txt = st === 'com_ressalvas' ? 'COM RESSALVA' : p.texto;
            P.texto(txt, x, top + 36, { tam: 7.5, fonte: 'bold', cor: p.cor, alinhar: 'centro', larg: w });
        });

        const { ok, alerta } = listasResumo(D);
        let y = top + 82;
        y = L.caixaTitulo(P, MARGEM, y, A4.w - 2 * MARGEM, 'Itens conformes', COR.verde);
        y = L.lista(P, MARGEM + 8, y + 10, A4.w - 2 * MARGEM - 16, ok.length ? ok : ['Nenhum item registrado'], '•', COR.verde, 230);
        y += 12;
        y = L.caixaTitulo(P, MARGEM, y, A4.w - 2 * MARGEM, 'Pontos de atenção', COR.ambar);
        y = L.lista(P, MARGEM + 8, y + 10, A4.w - 2 * MARGEM - 16, alerta.length ? alerta : ['Nenhum ponto de atenção registrado'], '•', COR.ambar, A4.h - 130 - y);

        const pf = PARECER[D.parecerFinal];
        P.ret(MARGEM, A4.h - 110, A4.w - 2 * MARGEM, 56, COR.navy);
        P.texto('PARECER TÉCNICO FINAL', MARGEM + 14, A4.h - 99, { tam: 7, fonte: 'bold', cor: COR.gold });
        P.texto(pf.texto, MARGEM + 14, A4.h - 84, { tam: 17, fonte: 'bold', cor: COR.branco });
        P.pill(pf.texto, A4.w - MARGEM - 14, A4.h - 92, { cor: pf.cor, tam: 8, alinhar: 'dir' });
    }

    async function paginaEstrutura(L) {
        const D = L.D;
        const P = L.nova();
        const top = L.cabecalho(P, 'III', 'ANÁLISE ESTRUTURAL', 'Longarinas, torres de amortecedor, painel corta-fogo e assoalho');
        const perg = [
            ['Indícios de enchente', D.d3.indicioEnchente === 'sim' ? 'SIM' : 'NÃO', D.d3.indicioEnchente === 'sim'],
            ['Indícios de batida', D.d3.indicioBatida === 'sim' ? 'SIM' : 'NÃO', D.d3.indicioBatida === 'sim'],
            ['Deformação estrutural', D.d3.indicioBatida === 'sim' ? (D.d3.deformacaoEstrutural === 'sim' ? 'SIM' : 'NÃO') : 'NÃO', D.d3.deformacaoEstrutural === 'sim']
        ];
        const w3 = (A4.w - 2 * MARGEM - 16) / 3;
        perg.forEach(([r, v, ruim], i) => {
            const x = MARGEM + i * (w3 + 8);
            P.ret(x, top, w3, 34, COR.branco, COR.linha);
            P.texto(r.toUpperCase(), x + 8, top + 7, { tam: 6.5, fonte: 'bold', cor: COR.cinza });
            P.texto(v, x + 8, top + 18, { tam: 11, fonte: 'bold', cor: ruim ? COR.vermelho : COR.verde });
        });
        let y = top + 46;
        y = L.caixaTitulo(P, MARGEM, y, A4.w - 2 * MARGEM, 'Avaliação por ponto estrutural');
        D.estrutura.forEach((e, i) => {
            const st = ROTULO_ESTRUTURA[e.status] || ROTULO_ESTRUTURA.original;
            P.ret(MARGEM, y, A4.w - 2 * MARGEM, 17, i % 2 ? COR.creme : COR.branco);
            P.texto(e.nome, MARGEM + 8, y + 5, { tam: 7.6 });
            if (e.obs) P.texto(e.obs, MARGEM + 260, y + 5, { tam: 7, cor: COR.cinza });
            P.texto(st.t, A4.w - MARGEM - 8, y + 5, { tam: 7.6, fonte: 'bold', cor: st.cor, alinhar: 'dir' });
            y += 17;
        });
        const obs = [D.d3.obsEnchente, D.d3.obsBatida, D.d3.observacao].filter(Boolean).join(' ');
        y += 8;
        if (obs) { P.texto('OBSERVAÇÕES', MARGEM, y, { tam: 6.5, fonte: 'bold', cor: COR.cinza }); y = P.paragrafo(obs, MARGEM, y + 10, A4.w - 2 * MARGEM, { tam: 8, maxLinhas: 3 }) + 6; }
        P.texto('PARECER ESTRUTURAL', MARGEM, y, { tam: 6.5, fonte: 'bold', cor: COR.cinza });
        P.pill((PARECER[D.status.estrutura] || PARECER.conforme).texto, MARGEM + 90, y - 3, { cor: (PARECER[D.status.estrutura] || PARECER.conforme).cor });
        y += 22;
        const cols = 5, gap = 6, fw = (A4.w - 2 * MARGEM - gap * (cols - 1)) / cols, fh = 70;
        for (let i = 0; i < D.estrutura.length; i++) {
            const e = D.estrutura[i];
            const x = MARGEM + (i % cols) * (fw + gap);
            const t = y + Math.floor(i / cols) * (fh + 20);
            if (t + fh + 13 > A4.h - 45) break;
            await P.foto(e.codigo, x, t, fw, fh, e.nome.replace('TORRE DO AMORTECEDOR', 'TORRE AMORT.').replace(' (ESTRUTURA)', ''));
        }
    }

    async function paginaPintura(L) {
        const D = L.D;
        const P = L.nova();
        const top = L.cabecalho(P, 'IV', 'PINTURA E ACABAMENTO', 'Medição de espessura (µm) e classificação feita pelo vistoriador');
        // Diagrama do veículo (vista superior) com os marcadores 1–19
        const dx = MARGEM + 10, dw = 170, dy = top + 20, dh = 330;
        await desenharDiagrama(L, P, dx, dy, dw, dh);

        // Tabela
        const tx = MARGEM + 210, tw = A4.w - MARGEM - tx;
        let y = top;
        P.ret(tx, y, tw, 16, COR.navy);
        P.texto('Nº', tx + 6, y + 5, { tam: 7, fonte: 'bold', cor: COR.branco });
        P.texto('PEÇA', tx + 26, y + 5, { tam: 7, fonte: 'bold', cor: COR.branco });
        P.texto('µm', tx + tw - 112, y + 5, { tam: 7, fonte: 'bold', cor: COR.branco, alinhar: 'dir' });
        P.texto('CONDIÇÃO', tx + tw - 6, y + 5, { tam: 7, fonte: 'bold', cor: COR.branco, alinhar: 'dir' });
        y += 16;
        D.itensPintura.forEach((it, i) => {
            const cor = CORES_PINTURA[it.classe] || COR.neutro;
            P.ret(tx, y, tw, 17, i % 2 ? COR.creme : COR.branco);
            P.p.drawCircle({ x: tx + 11, y: P.Y(y + 8.5), size: 6, color: rgb(cor) });
            P.texto(String(it.numero), tx + 11, y + 5.3, { tam: 6, fonte: 'bold', cor: COR.branco, alinhar: 'centro', larg: 0 });
            P.texto(it.nome + (it.reparo === 'sim' ? ' *' : ''), tx + 26, y + 5, { tam: 7.6, cor: it.reparo === 'sim' ? COR.vermelho : COR.tinta, fonte: it.reparo === 'sim' ? 'bold' : 'reg' });
            P.texto(it.tipo === 'plastico' ? '—' : (it.um || '—'), tx + tw - 112, y + 5, { tam: 7.6, alinhar: 'dir', cor: COR.cinza });
            const rot = it.classe === 'REPINTURA COM MASSA' ? 'Repintura c/ massa' : it.classe.charAt(0) + it.classe.slice(1).toLowerCase();
            P.texto(rot, tx + tw - 6, y + 5, { tam: 7.6, fonte: 'bold', cor, alinhar: 'dir' });
            y += 17;
        });
        // Legenda
        y += 8;
        let lx = tx;
        [['Original', COR.verde], ['Repintura', COR.repintura], ['Repint. c/ massa', COR.ambar], ['Avariado', COR.vermelho], ['Não se aplica', COR.neutro]].forEach(([t, c]) => {
            P.p.drawCircle({ x: lx + 4, y: P.Y(y + 4), size: 3.5, color: rgb(c) });
            P.texto(t, lx + 11, y + 1, { tam: 6.8, cor: COR.cinza });
            lx += L.f.reg.widthOfTextAtSize(t, 6.8) + 22;
        });
        if (D.itensPintura.some(i => i.reparo === 'sim')) {
            y += 14;
            P.texto('* Coluna com indícios de reparo estrutural', tx, y, { tam: 7, fonte: 'bold', cor: COR.vermelho });
        }
        if (D.d4.observacao) {
            y += 18;
            P.texto('OBSERVAÇÕES', tx, y, { tam: 6.5, fonte: 'bold', cor: COR.cinza });
            P.paragrafo(D.d4.observacao, tx, y + 10, tw, { tam: 8, maxLinhas: 3 });
        }

        // Etiquetas ETA
        let ey = 560;
        ey = L.caixaTitulo(P, MARGEM, ey, A4.w - 2 * MARGEM, 'Etiquetas ETA');
        D.etiquetas.forEach((e, i) => {
            const st = ROTULO_ETIQUETA[e.status] || { t: 'Não avaliada', cor: COR.neutro };
            P.ret(MARGEM, ey, A4.w - 2 * MARGEM, 18, i % 2 ? COR.creme : COR.branco);
            P.texto(e.nome, MARGEM + 8, ey + 5.5, { tam: 8 });
            P.texto(st.t.toUpperCase(), A4.w - MARGEM - 8, ey + 5.5, { tam: 8, fonte: 'bold', cor: st.cor, alinhar: 'dir' });
            ey += 18;
        });
        if (D.d2.observacao) { ey += 4; ey = P.paragrafo(`Observação: ${D.d2.observacao}`, MARGEM, ey, A4.w - 2 * MARGEM, { tam: 7.8, cor: COR.cinza, maxLinhas: 2 }); }
        const fw = (A4.w - 2 * MARGEM - 10) / 2;
        await P.foto('etiqueta_eta', MARGEM, ey + 8, fw, 110, 'ETIQUETA ETA — COMPARTIMENTO DO MOTOR');
        await P.foto('medidor_pintura_uso', MARGEM + fw + 10, ey + 8, fw, 110, 'MEDIDOR DE ESPESSURA EM USO');
    }

    // Posições (% da caixa do veículo) dos marcadores 1–19 na vista superior
    const POS_MARCADORES = {
        1: [50, 2], 2: [50, 17], 3: [8, 20], 4: [8, 33], 5: [8, 43], 6: [8, 53], 7: [8, 62], 8: [8, 72], 9: [8, 84],
        10: [50, 90], 11: [50, 98.5], 12: [92, 84], 13: [92, 72], 14: [92, 62], 15: [92, 53], 16: [92, 43], 17: [92, 33],
        18: [92, 20], 19: [50, 55]
    };

    async function desenharDiagrama(L, P, x, top, w, h) {
        const D = L.D;
        const porNumero = Object.fromEntries(((D.ia && D.ia.pintura_marcadores) || []).map(m => [Number(m.numero), String(m.classificacao || '').toUpperCase()]));
        let posicoes = POS_MARCADORES;
        let desenhou = false;
        // Silhueta específica do tipo de veículo, quando existir (assets/silhuetas/<tipo>.png)
        try {
            const [img, mapa] = await Promise.all([
                fetch(`assets/silhuetas/${D.tipoCodigo}.png`),
                fetch('assets/silhuetas/marcadores.json')
            ]);
            if (img.ok && mapa.ok) {
                const png = await L.doc.embedPng(new Uint8Array(await img.arrayBuffer()));
                const esc = Math.min(w / png.width, h / png.height);
                P.p.drawImage(png, { x: x + (w - png.width * esc) / 2, y: P.Y(top, h) + (h - png.height * esc) / 2, width: png.width * esc, height: png.height * esc });
                const coords = (await mapa.json())[D.tipoCodigo] || {};
                if (Object.keys(coords).length) posicoes = Object.fromEntries(Object.entries(coords).map(([k, v]) => [k, [Number(v.x), Number(v.y)]]));
                desenhou = true;
            }
        } catch (e) { /* usa o desenho vetorial */ }

        if (!desenhou) {
            // Vista superior genérica em vetor
            const cx = x + w / 2, bw = w * 0.62, bx = cx - bw / 2;
            const corCarro = rgb([214, 218, 224]), borda = rgb([120, 128, 140]);
            const T = pct => top + h * pct / 100;
            P.p.drawRectangle({ x: bx, y: P.Y(T(96)), width: bw, height: T(96) - T(4), color: corCarro, borderColor: borda, borderWidth: 1 });
            // para-choques
            P.p.drawRectangle({ x: bx + 6, y: P.Y(T(5)), width: bw - 12, height: T(5) - T(1), color: rgb([190, 196, 205]), borderColor: borda, borderWidth: 0.6 });
            P.p.drawRectangle({ x: bx + 6, y: P.Y(T(99)), width: bw - 12, height: T(99) - T(95), color: rgb([190, 196, 205]), borderColor: borda, borderWidth: 0.6 });
            // para-brisa, teto, vigia
            P.p.drawRectangle({ x: bx + 8, y: P.Y(T(38)), width: bw - 16, height: T(38) - T(30), color: rgb([70, 84, 104]) });
            P.p.drawRectangle({ x: bx + 10, y: P.Y(T(70)), width: bw - 20, height: T(70) - T(38), color: rgb([228, 231, 236]), borderColor: borda, borderWidth: 0.5 });
            P.p.drawRectangle({ x: bx + 8, y: P.Y(T(78)), width: bw - 16, height: T(78) - T(70), color: rgb([70, 84, 104]) });
            // linhas das portas
            [[38, 49], [49, 62], [62, 72]].forEach(([a]) => {
                P.linha(bx, T(a), bx + 8, T(a), [120, 128, 140], 0.6);
                P.linha(bx + bw - 8, T(a), bx + bw, T(a), [120, 128, 140], 0.6);
            });
            P.linha(bx + 4, T(28), bx + bw - 4, T(28), [150, 158, 170], 0.5);
            P.linha(bx + 4, T(82), bx + bw - 4, T(82), [150, 158, 170], 0.5);
            P.texto('FRENTE', x, top - 12, { tam: 6.5, fonte: 'bold', cor: COR.cinza, alinhar: 'centro', larg: w });
            P.texto('TRASEIRA', x, top + h + 6, { tam: 6.5, fonte: 'bold', cor: COR.cinza, alinhar: 'centro', larg: w });
            P.texto('Vista superior  ·  esquerda = lado do motorista', x, top + h + 16, { tam: 6, cor: COR.cinza, alinhar: 'centro', larg: w });
        }

        D.itensPintura.forEach(it => {
            const pos = posicoes[it.numero] || posicoes[String(it.numero)];
            if (!pos) return;
            const classe = porNumero[it.numero] || it.classe;
            const cor = CORES_PINTURA[classe] || COR.neutro;
            const mx = x + w * pos[0] / 100, my = top + h * pos[1] / 100;
            P.p.drawCircle({ x: mx, y: P.Y(my), size: 7.5, color: rgb(cor), borderColor: rgb(COR.branco), borderWidth: 1 });
            P.texto(String(it.numero), mx, my - 3.2, { tam: 6.5, fonte: 'bold', cor: COR.branco, alinhar: 'centro', larg: 0 });
        });
    }

    async function paginaVidros(L) {
        const D = L.D;
        const P = L.nova();
        const top = L.cabecalho(P, 'V', 'IDENTIFICAÇÃO E VIDROS', 'Gravação do número do chassi nos vidros');
        let y = top;
        const tw = A4.w - 2 * MARGEM;
        P.ret(MARGEM, y, tw, 16, COR.navy);
        [['VIDRO', 8, 'esq'], ['GRAVAÇÃO', 250, 'esq'], ['NÚMERO LIDO', 330, 'esq'], ['DESBASTE / POLIMENTO', tw - 8, 'dir']].forEach(([t, dx, al]) =>
            P.texto(t, MARGEM + dx, y + 5, { tam: 7, fonte: 'bold', cor: COR.branco, alinhar: al }));
        y += 16;
        D.vidros.forEach((v, i) => {
            P.ret(MARGEM, y, tw, 18, i % 2 ? COR.creme : COR.branco);
            P.texto(v.nome.replace('GRAVAÇÃO VIDRO ', '').replace('GRAVAÇÃO ', ''), MARGEM + 8, y + 5.5, { tam: 7.8 });
            P.texto(v.original ? 'Original' : 'Não original', MARGEM + 250, y + 5.5, { tam: 7.8, fonte: 'bold', cor: v.original ? COR.verde : COR.vermelho });
            P.texto(v.lida || '—', MARGEM + 330, y + 5.5, { tam: 7.8, cor: COR.tinta });
            P.texto(v.desbaste ? 'SIM' : 'Não', MARGEM + tw - 8, y + 5.5, { tam: 7.8, fonte: 'bold', cor: v.desbaste ? COR.vermelho : COR.verde, alinhar: 'dir' });
            y += 18;
        });
        const leituras = [...new Set(D.vidros.map(v => (v.lida || '').replace(/\s/g, '')).filter(Boolean))];
        if (leituras.length > 1) {
            y += 6;
            P.ret(MARGEM, y, tw, 20, [252, 243, 232], COR.ambar);
            P.texto('Atenção: há gravações com números diferentes entre os vidros.', MARGEM + 8, y + 6, { tam: 8, fonte: 'bold', cor: COR.ambar });
            y += 20;
        }
        if (D.d5 && D.d5.observacao) { y += 8; y = P.paragrafo(`Observação: ${D.d5.observacao}`, MARGEM, y, tw, { tam: 8, cor: COR.cinza, maxLinhas: 2 }); }
        y += 16;
        const cols = 3, gap = 8, fw = (tw - gap * 2) / cols, fh = 150;
        for (let i = 0; i < D.vidros.length; i++) {
            const v = D.vidros[i];
            await P.foto(v.codigo, MARGEM + (i % cols) * (fw + gap), y + Math.floor(i / cols) * (fh + 22), fw, fh,
                v.nome.replace('GRAVAÇÃO VIDRO ', '').replace('GRAVAÇÃO ', '').replace(' (MOTORISTA)', '').slice(0, 34));
        }
    }

    async function paginaMotorChassi(L) {
        const D = L.D;
        const P = L.nova();
        const top = L.cabecalho(P, 'VI', 'MOTOR E CHASSI', 'Numeração de identificação e compartimento do motor');
        const tw = A4.w - 2 * MARGEM, w2 = (tw - 12) / 2;
        let yE = top, yD = top;
        yE = L.kv(P, MARGEM, yE, w2, 'Chassi lido no veículo', D.chassiLido, { tamValor: 9.5 });
        const conferencia = D.chassiConfere === null ? 'Chassi não informado no cadastro da O.S.' : (D.chassiConfere ? 'Confere com o cadastro da O.S.' : `DIVERGENTE do cadastro (${D.chassiCadastro})`);
        yE = L.kv(P, MARGEM, yE, w2, 'Conferência com o cadastro', conferencia, { tamValor: 8.5 });
        yE = L.kv(P, MARGEM, yE, w2, 'Gravação do chassi', D.d2.chassiOriginal === false ? 'NÃO ORIGINAL' : 'Original');
        yD = L.kv(P, MARGEM + w2 + 12, yD, w2, 'Motor lido no veículo', D.motorLido, { tamValor: 9.5 });
        yD = L.kv(P, MARGEM + w2 + 12, yD, w2, 'Gravação do motor', D.d2.motorOriginal === false ? 'NÃO ORIGINAL' : 'Original');
        yD = L.kv(P, MARGEM + w2 + 12, yD, w2, 'Compartimento do motor',
            `${D.d6.reparoMotor === 'sim' ? 'Com sinais de reparo/troca de estruturas' : 'Sem sinais de reparo estrutural'}; cor original ${D.d6.corMotorOk === 'nao' ? 'NÃO preservada' : 'preservada'}`, { tamValor: 8.5 });
        let y = Math.max(yE, yD) + 4;
        const cols = 3, gap = 8, fw = (tw - gap * 2) / cols, fh = 118;
        const fotos = [
            ['chassi_gravado', 'CHASSI GRAVADO'], ['chassi_secundario', 'CHASSI — PLAQUETA/SECUNDÁRIO'], ['motor_gravado', 'NÚMERO DO MOTOR'],
            ['motor_vista_geral', 'COMPARTIMENTO DO MOTOR'], ['motor_painel_corta_fogo', 'PAINEL CORTA-FOGO'], ['motor_batentes_dobradicas', 'BATENTES DO CAPÔ']
        ];
        for (let i = 0; i < fotos.length; i++) {
            await P.foto(fotos[i][0], MARGEM + (i % cols) * (fw + gap), y + Math.floor(i / cols) * (fh + 22), fw, fh, fotos[i][1]);
        }
        y += 2 * (fh + 22) + 6;
        const st = PARECER[pior2(D.status.motor, D.status.chassi)];
        L.caixaTitulo(P, MARGEM, y, tw, 'Parecer técnico — motor e chassi');
        const obs = D.campos['technical.observation'] || [D.d2.observacao, D.d6.observacao].filter(Boolean).join(' ') || 'Sem observações técnicas adicionais.';
        const maxL = Math.max(2, Math.floor((A4.h - 70 - (y + 50)) / 11));
        const nL = Math.min(maxL, P.quebrar(obs, tw - 20, 8.2).length);
        P.ret(MARGEM, y + 18, tw, 44 + nL * 11, COR.branco, COR.linha);
        P.pill(st.texto, MARGEM + 10, y + 28, { cor: st.cor });
        P.paragrafo(obs, MARGEM + 10, y + 50, tw - 20, { tam: 8.2, maxLinhas: maxL });
    }
    function pior2(a, b) { return [a, b].includes('nao_conforme') ? 'nao_conforme' : ([a, b].includes('com_ressalvas') ? 'com_ressalvas' : 'conforme'); }

    async function paginaQuadros(L) {
        const D = L.D;
        const P = L.nova();
        const top = L.cabecalho(P, 'VII', 'QUADROS DE PORTA E INTERIOR', 'Avaliação do quadro de porta por inteiro e conservação interna');
        const tw = A4.w - 2 * MARGEM, w2 = (tw - 12) / 2;
        L.kv(P, MARGEM, top, w2, 'Intervenção / soldas nos quadros de porta', D.d7.intervencaoQuadros === 'sim' ? 'SIM — ver observações' : 'Não constatada');
        const conserva = { excelente: 'Excelente', bom: 'Bom', regular: 'Regular', mau: 'Mau' };
        L.kv(P, MARGEM + w2 + 12, top, w2, 'Conservação do interior', conserva[D.d7.conservacaoInterior] || 'Não informado');
        let y = top + 42;
        if (D.d7.observacao) y = P.paragrafo(`Observação: ${D.d7.observacao}`, MARGEM, y, tw, { tam: 8, cor: COR.cinza, maxLinhas: 3 }) + 6;
        const fw = (tw - 10) / 2, fh = 240;
        const q = (global.CAUTELAR_SLOTS && global.CAUTELAR_SLOTS[7]) || [];
        for (let i = 0; i < q.length; i++) {
            await P.foto(q[i].codigo, MARGEM + (i % 2) * (fw + 10), y + Math.floor(i / 2) * (fh + 22), fw, fh, q[i].nome);
        }
    }

    async function paginaParecer(L) {
        const D = L.D;
        const P = L.nova();
        const top = L.cabecalho(P, 'VIII', 'PARECER FINAL', 'Conclusão técnica da vistoria cautelar');
        const pf = PARECER[D.parecerFinal];
        const tw = A4.w - 2 * MARGEM;
        const texto = textoParecerFinal(D);
        const nLinhas = Math.min(18, P.quebrar(texto, tw - 44, 9.2).length);
        const hCaixa = Math.max(170, 100 + nLinhas * 9.2 * 1.45);
        P.ret(MARGEM, top, tw, hCaixa, COR.navy);
        P.ret(MARGEM, top, 6, hCaixa, pf.cor);
        P.texto('PARECER TÉCNICO', MARGEM + 22, top + 20, { tam: 7.5, fonte: 'bold', cor: COR.gold });
        P.texto(pf.texto, MARGEM + 22, top + 34, { tam: 22, fonte: 'bold', cor: COR.branco });
        P.linha(MARGEM + 22, top + 70, MARGEM + 140, top + 70, COR.gold, 1);
        P.paragrafo(texto, MARGEM + 22, top + 84, tw - 44, { tam: 9.2, cor: [226, 231, 239], entre: 1.45, maxLinhas: 18 });

        let y = top + hCaixa + 22;
        const obs = D.d8.observacaoFinal || D.d8.observacao;
        if (obs) {
            P.texto('OBSERVAÇÕES DO VISTORIADOR', MARGEM, y, { tam: 6.5, fonte: 'bold', cor: COR.cinza });
            y = P.paragrafo(obs, MARGEM, y + 10, tw, { tam: 8.5, maxLinhas: 4 }) + 12;
        }
        P.texto(`${D.cidade}, ${dataExtenso(D.dataEmissao)}.`, MARGEM, y, { tam: 9, fonte: 'bold', cor: COR.navy });
        y += 26;

        // Assinatura do vistoriador
        const assinatura = D.d8.signatureBase64;
        if (assinatura && String(assinatura).startsWith('data:image/png')) {
            try {
                const png = await L.doc.embedPng(dataUrlParaBytes(assinatura));
                const esc = Math.min(200 / png.width, 70 / png.height);
                P.p.drawImage(png, { x: MARGEM, y: P.Y(y, png.height * esc), width: png.width * esc, height: png.height * esc });
            } catch (e) { console.warn('Assinatura inválida', e); }
        }
        P.linha(MARGEM, y + 74, MARGEM + 220, y + 74, COR.tinta, 0.6);
        P.texto(D.vistoriador.nome || 'Vistoriador', MARGEM, y + 80, { tam: 9, fonte: 'bold' });
        P.texto(`Vistoriador responsável${D.unidade.credenciamento ? '  ·  ' + D.unidade.credenciamento : ''}`, MARGEM, y + 92, { tam: 7.5, cor: COR.cinza });

        // Autenticidade
        const ax = A4.w - MARGEM - 170;
        P.ret(ax, y, 170, 110, COR.branco, COR.linha);
        P.texto('AUTENTICIDADE', ax + 10, y + 10, { tam: 6.5, fonte: 'bold', cor: COR.cinza });
        if (D.hash && typeof getQrCodeDataUrl === 'function') {
            try {
                const url = `https://rbaggiofilho-source.github.io/CERTIVE-PRINCIPAL/consulta-laudo.html?hash=${D.hash}`;
                const qr = await getQrCodeDataUrl(url);
                if (qr) {
                    const png = await L.doc.embedPng(dataUrlParaBytes(qr));
                    P.p.drawImage(png, { x: ax + 10, y: P.Y(y + 24, 72), width: 72, height: 72 });
                }
            } catch (e) { /* QR opcional */ }
        }
        P.paragrafo('Confira a autenticidade deste laudo pelo QR Code ou pelo código abaixo.', ax + 90, y + 26, 72, { tam: 6.5, cor: COR.cinza, maxLinhas: 6 });
        P.paragrafo(D.hash || '', ax + 10, y + 98, 150, { tam: 5.5, cor: COR.cinza, maxLinhas: 2 });

        // Nota de alcance
        const nota = 'Este laudo atesta as condições constatadas no veículo na data e hora da vistoria, pelo método visual e de medição descrito, ' +
            'não abrangendo vícios ocultos, avaliação mecânica ou eventos posteriores à inspeção. ' +
            (D.campos['document.approved_items'] ? '' : 'Esta vistoria não inclui pesquisa documental em bases externas.');
        P.paragrafo(nota, MARGEM, A4.h - 92, tw, { tam: 6.8, cor: COR.cinza, maxLinhas: 4 });
    }

    async function paginasRegistroFotografico(L) {
        const D = L.D;
        const todos = Object.keys(global.CAUTELAR_SLOTS || {}).flatMap(n => global.CAUTELAR_SLOTS[n]).filter(sl => D.foto(sl.codigo));
        const porPagina = 12, cols = 3;
        for (let p = 0; p * porPagina < todos.length; p++) {
            const P = L.nova();
            const top = L.cabecalho(P, p === 0 ? 'IX' : '', p === 0 ? 'REGISTRO FOTOGRÁFICO' : '', p === 0 ? 'Fotos da vistoria com data, hora e localização' : '');
            const y0 = p === 0 ? top : 90;
            const tw = A4.w - 2 * MARGEM, gap = 8, fw = (tw - gap * (cols - 1)) / cols;
            const fh = (A4.h - 60 - y0) / 4 - 32;
            const lote = todos.slice(p * porPagina, (p + 1) * porPagina);
            for (let i = 0; i < lote.length; i++) {
                const sl = lote[i];
                const x = MARGEM + (i % cols) * (fw + gap);
                const t = y0 + Math.floor(i / cols) * (fh + 32);
                await P.foto(sl.codigo, x, t, fw, fh, sl.nome.slice(0, 40));
                const m = D.meta(sl.codigo);
                const info = [m.timestamp ? dataBR(m.timestamp, true) : '', m.gps ? `${Number(m.gps.latitude).toFixed(5)}, ${Number(m.gps.longitude).toFixed(5)}` : ''].filter(Boolean).join('  ·  ');
                if (info) P.texto(info, x + 4, t + fh + 15, { tam: 5.8, cor: COR.cinza });
            }
        }
    }

    // ------------------------------------------------------------------
    // Entrada pública
    // ------------------------------------------------------------------
    async function gerarLaudoCertive(cautelarId, opcoes = {}) {
        if (typeof PDFLib === 'undefined') throw new Error('Biblioteca de PDF não carregada. Verifique a conexão e recarregue.');
        if (typeof garantirDetalhesCautelar === 'function') await garantirDetalhesCautelar(cautelarId);
        const cautelar = db.cautelares.find(c => c.id === cautelarId);
        // Conteúdo gerado no servidor, quando o navegador atual não tem (outro aparelho)
        if (cautelar && !cautelar.dadosIaConfeccionado && global.useSupabase && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data } = await supabaseClient.from('laudos_gerados').select('id, resposta')
                    .eq('cautelarId', cautelarId).order('criadoEm', { ascending: false }).limit(1);
                if (data && data[0] && data[0].resposta) cautelar.dadosIaConfeccionado = data[0].resposta;
            } catch (e) { console.warn('Laudo gerado no servidor indisponível:', e); }
        }
        const D = montarDados(cautelarId);
        // Pré-visualização: parecer e observação ainda não gravados, vindos da tela da mesa
        if (opcoes.parecerFinal && PARECER[opcoes.parecerFinal]) D.parecerFinal = opcoes.parecerFinal;
        if (opcoes.obsFinal !== undefined) D.d8 = Object.assign({}, D.d8, { observacaoFinal: opcoes.obsFinal });
        D.d5 = (db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === 5)?.dadosJson) || {};

        const doc = await PDFLib.PDFDocument.create();
        doc.setTitle(`Laudo Cautelar ${D.os.placa} — ${D.cautelar.dossieNumero || ''}`);
        doc.setAuthor('Certive Vistorias');
        doc.setCreator('Sistema Certive');
        const fontes = {
            reg: await doc.embedFont(PDFLib.StandardFonts.Helvetica),
            bold: await doc.embedFont(PDFLib.StandardFonts.HelveticaBold),
            serifItalico: await doc.embedFont(PDFLib.StandardFonts.TimesRomanBoldItalic)
        };
        const L = new Laudo(doc, fontes, D);
        await paginaCapa(L);
        await paginaIdentificacao(L);
        paginaResumo(L);
        await paginaEstrutura(L);
        await paginaPintura(L);
        await paginaVidros(L);
        await paginaMotorChassi(L);
        await paginaQuadros(L);
        await paginaParecer(L);
        await paginasRegistroFotografico(L);
        L.rodapes();
        return await doc.save();
    }

    global.gerarLaudoCertive = gerarLaudoCertive;

    // ------------------------------------------------------------------
    // Pré-visualização na tela de finalização: mostra o próprio PDF oficial
    // (substitui a prévia antiga, montada sobre as imagens do modelo de exemplo)
    // ------------------------------------------------------------------
    let previewTimer = null, previewUrl = null, previewSeq = 0;
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
                const bytes = await gerarLaudoCertive(cautelarId, {
                    parecerFinal: parecer ? parecer.value : undefined,
                    obsFinal: obs ? obs.value : undefined
                });
                if (seq !== previewSeq) return; // chegou uma atualização mais nova
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
                container.innerHTML = `<iframe title="Pré-visualização do laudo" src="${previewUrl}#view=FitH" style="width:100%;height:calc(100vh - 140px);min-height:600px;border:1px solid #d1d5db;border-radius:6px;background:#fff;"></iframe>`;
            } catch (e) {
                console.error('Falha na pré-visualização do laudo:', e);
                container.innerHTML = `<div style="padding:20px;color:#991b1b;font-family:sans-serif;">Não foi possível montar a pré-visualização: ${limpar(e.message || e)}</div>`;
            }
        }, 900);
    }
    global.atualizarPreviewLaudo = atualizarPreviewLaudoCertive;
    global._laudoCertiveInterno = { montarDados, listasResumo, textoParecerFinal, limpar };
})(window);
