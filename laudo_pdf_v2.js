/**
 * CERTIVE VISTORIAS — Módulo de Emissão de Laudo Cautelar
 * Geração de PDF com 10 páginas A4 verticais baseadas em BACKGROUND PNG FIXO e COORDENADAS ABSOLUTAS.
 * Preenchimento via pdf-lib no template PDF editável original.
 */

// Injeta fontes do Google Montserrat dinamicamente
if (!document.getElementById('google-font-montserrat')) {
    const link = document.createElement('link');
    link.id = 'google-font-montserrat';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap';
    document.head.appendChild(link);
}

function atualizarPreviewLaudo() {
    const previewContainer = document.getElementById('laudo-preview-container');
    if (!previewContainer) return;

    try {
        const cautelar = db.cautelares.find(c => c.id === window.activeFinalizacaoCautelarId);
        if (!cautelar) {
            previewContainer.innerHTML = `
                <div style="background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; padding: 20px; border-radius: 6px; margin: 20px auto; max-width: 600px; text-align: left; font-family: sans-serif;">
                    <h3 style="margin-top:0;">Erro de Preview</h3>
                    <p>A vistoria ativa com ID <strong>${window.activeFinalizacaoCautelarId}</strong> não foi encontrada em <code>db.cautelares</code>.</p>
                </div>
            `;
            return;
        }

        const os = db.ordens_servico.find(o => o.id === cautelar.osId);
        if (!os) {
            previewContainer.innerHTML = `
                <div style="background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; padding: 20px; border-radius: 6px; margin: 20px auto; max-width: 600px; text-align: left; font-family: sans-serif;">
                    <h3 style="margin-top:0;">Erro de OS</h3>
                    <p>A Ordem de Serviço com ID <strong>${cautelar.osId}</strong> associada a esta vistoria não foi encontrada.</p>
                </div>
            `;
            return;
        }

        const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelar.id);

        // Resgata os dados JSON de cada seção
        const dataSec1 = (secoes.find(s => s.numeroSecao === 1)?.dadosJson) || {};
        const dataSec2 = (secoes.find(s => s.numeroSecao === 2)?.dadosJson) || {};
        const dataSec3 = (secoes.find(s => s.numeroSecao === 3)?.dadosJson) || {};
        const dataSec4 = (secoes.find(s => s.numeroSecao === 4)?.dadosJson) || {};
        const dataSec5 = (secoes.find(s => s.numeroSecao === 5)?.dadosJson) || {};
        const dataSec6 = (secoes.find(s => s.numeroSecao === 6)?.dadosJson) || {};
        const dataSec7 = (secoes.find(s => s.numeroSecao === 7)?.dadosJson) || {};
        const dataSec8 = (secoes.find(s => s.numeroSecao === 8)?.dadosJson) || {};

        const parecerFinal = document.getElementById('caut-final-parecer') ? document.getElementById('caut-final-parecer').value : (cautelar.parecerFinal || 'conforme');
        const obsFinal = document.getElementById('caut-final-obs') ? document.getElementById('caut-final-obs').value : (dataSec8.observacaoFinal || '');

        const signatureVistoriador = dataSec8.signatureBase64 || '';

        // Coleta fotos do banco local
        const fotos = db.cautelares_fotos.filter(f => secoes.map(s => s.id).includes(f.secaoId));

        const getFotoUrl = (codigo) => {
            const f = fotos.find(ph => ph.slotCodigo === codigo);
            return f ? (f.url_thumb || f.url_original || '') : '';
        };

        // Helper padrão de renderização de foto com placeholder neutro rígido e inalterável
        const renderFoto = (codigo) => {
            const url = getFotoUrl(codigo);
            if (url) {
                return `<img src="${url}" style="width: 100%; height: 100%; object-fit: cover; display: block;">`;
            }
            return `
                <div class="no-photo" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; background: #FAF9F6; color: #5A544A; text-align: center; box-sizing: border-box; border: 1px dashed #D8CFBE; padding: 10px;">
                    <i class="ri-image-line" style="font-size: 16px; color: #D8CFBE; margin-bottom: 2px;"></i>
                    <span style="font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">Imagem não informada</span>
                </div>
            `;
        };

        const hashLaudo = cautelar.hashLaudo || 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
        
        // Fallbacks para campos não informados
        const valOrFallback = (val) => {
            if (val === undefined || val === null || String(val).trim() === '') {
                return 'Não informado';
            }
            return val;
        };

        // Variáveis de texto
        const dossie = valOrFallback(cautelar.dossieNumero || cautelar.dossie_numero);
        const dataVistoria = valOrFallback(new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR'));
        const horaVistoria = valOrFallback(new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}));
        const vistoriador = valOrFallback(db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome);
        const placa = valOrFallback(os.placa);
        const cor = valOrFallback(os.cor);
        const combustivel = valOrFallback(dataSec1.combustivel || os.combustivel);
        const renavam = valOrFallback(os.renavam);
        const chassi = valOrFallback(os.chassi || dataSec2.chassiLido);
        const motor = valOrFallback(os.motor || dataSec2.motorLido);
        const quilometragem = valOrFallback(dataSec1.quilometragem);
        const anoFab = valOrFallback(os.fabricacaoAno || os.ano_fabricacao);
        const anoMod = valOrFallback(os.modeloAno || os.ano_modelo);

        // Mapeamento inteligente de Marca e Modelo
        let marca = 'Não informado';
        let modelo = 'Não informado';
        if (os.clienteNome) {
            if (os.clienteNome.includes('/')) {
                const parts = os.clienteNome.split('/');
                marca = valOrFallback(parts[0]);
                modelo = valOrFallback(parts[1]);
            } else {
                modelo = valOrFallback(os.clienteNome);
            }
        }

        // Definição das variáveis de estilo do laudo baseadas em coordenadas absolutas
        let html = `
        <style>
            .certive-laudo-container {
                --navy-deep: #061428;
                --navy: #0A1F3D;
                --navy-soft: #102A4F;
                --gold: #C9A961;
                --gold-soft: #E4CE99;
                --paper: #F7F4EE;
                --paper-warm: #EFEAE0;
                --ink: #1C1C1C;
                --ink-muted: #5A544A;
                --rule: #D8CFBE;
                --green: #2F6B3F;
                --amber: #B8642B;
                --bordeaux: #8B2635;
                
                font-family: 'Montserrat', Arial, sans-serif;
                background: #e2e8f0;
                padding: 20px 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 30px;
            }

            .certive-page {
                width: 794px;
                height: 1122px;
                box-sizing: border-box;
                position: relative;
                overflow: hidden;
                page-break-after: always;
                box-shadow: 0 4px 15px rgba(0,0,0,0.12);
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
            }

            /* Elementos absolutos */
            .absolute-field {
                position: absolute;
                font-family: 'Montserrat', sans-serif;
                box-sizing: border-box;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .absolute-multiline {
                position: absolute;
                font-family: 'Montserrat', sans-serif;
                box-sizing: border-box;
                word-wrap: break-word;
                overflow: hidden;
                display: -webkit-box;
                -webkit-box-orient: vertical;
            }

            .absolute-photo {
                position: absolute;
                box-sizing: border-box;
                border-radius: 4px;
                overflow: hidden;
            }
        </style>
        <div class="certive-laudo-container">
        `;

        // =========================================================================
        // PAGINA 01: CAPA DO LAUDO (BACKGROUND pagina_01.png)
        // =========================================================================
        html += `
            <div id="certive-page-1" class="certive-page" style="background-image: url('pagina_01.png');">
                <!-- Rodapé Capa -->
                <div class="absolute-field" style="top: 960px; left: 70px; font-size: 11px; font-weight: 700; color: #FFFFFF; width: 300px;">
                    SÃO JOSÉ / SC<br>
                    <span style="font-size: 9px; font-weight: 500; color: rgba(255,255,255,0.7);">${dataVistoria}</span>
                </div>
                <div class="absolute-field" style="top: 960px; right: 70px; font-size: 11px; font-weight: 700; color: #FFFFFF; text-align: right; width: 300px;">
                    DOSSIÊ: <span style="font-family: monospace; font-size: 9.5px;">${dossie}</span>
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 02: SUMÁRIO (BACKGROUND pagina_02.png)
        // =========================================================================
        html += `
            <div id="certive-page-2" class="certive-page" style="background-image: url('pagina_02.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 03: 01 IDENTIFICAÇÃO DO VEÍCULO (BACKGROUND pagina_03.png)
        // =========================================================================
        html += `
            <div id="certive-page-3" class="certive-page" style="background-image: url('pagina_03.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>

                <!-- Ficha técnica valores -->
                <div class="absolute-field" style="top: 290px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C;">
                    ${marca} / ${modelo}
                </div>
                <div class="absolute-field" style="top: 350px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C;">
                    ${anoFab} / ${anoMod}
                </div>
                <div class="absolute-field" style="top: 410px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C;">
                    ${cor}
                </div>
                <div class="absolute-field" style="top: 472px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C; font-family: monospace;">
                    ${placa}
                </div>
                <div class="absolute-field" style="top: 532px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C; font-family: monospace;">
                    ${chassi}
                </div>
                <div class="absolute-field" style="top: 592px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C; font-family: monospace;">
                    ${motor}
                </div>
                <div class="absolute-field" style="top: 655px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C;">
                    ${combustivel}
                </div>
                <div class="absolute-field" style="top: 715px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C; font-family: monospace;">
                    ${renavam}
                </div>
                <div class="absolute-field" style="top: 775px; left: 55px; width: 280px; font-size: 11px; font-weight: 700; color: #1C1C1C;">
                    ${quilometragem} km
                </div>

                <!-- Fotos à direita -->
                <div class="absolute-photo" style="top: 255px; left: 388px; width: 350px; height: 215px;">
                    ${renderFoto('frente_45_dir')}
                </div>
                <div class="absolute-photo" style="top: 492px; left: 388px; width: 350px; height: 215px;">
                    ${renderFoto('traseira_45_esq')}
                </div>

                <!-- Dados da Vistoria -->
                <div class="absolute-field" style="top: 832px; left: 202px; font-size: 11px; font-weight: 700; color: #1C1C1C;">
                    ${dataVistoria} às ${horaVistoria}
                </div>
                <div class="absolute-field" style="top: 865px; left: 202px; font-size: 11px; font-weight: 700; color: #1C1C1C; width: 500px;">
                    ${db.unidades.find(u => u.id === os.unidadeId)?.nome || 'São José / SC'}
                </div>
                <div class="absolute-field" style="top: 900px; left: 202px; font-size: 11px; font-weight: 700; color: #1C1C1C; width: 500px; text-transform: uppercase;">
                    ${vistoriador}
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 04: 02 RESUMO DA ANÁLISE (BACKGROUND pagina_04.png)
        // =========================================================================
        const getPillText = (status) => {
            if (status === 'RESTRIÇÃO' || status === 'nao_conforme' || status === 'reprovada') {
                return 'RESTRIÇÃO';
            } else if (status === 'COM RESSALVAS' || status === 'com_ressalvas') {
                return 'RESSALVAS';
            }
            return 'CONFORME';
        };

        const getPillColor = (status) => {
            if (status === 'RESTRIÇÃO' || status === 'nao_conforme' || status === 'reprovada') {
                return 'var(--bordeaux)';
            } else if (status === 'COM RESSALVAS' || status === 'com_ressalvas') {
                return 'var(--amber)';
            }
            return 'var(--green)';
        };

        // Coleta aprovados e alertas dinâmicos baseados no parecer das seções
        const approvedList = [];
        const alertList = [];
        if (dataSec3.parecerEstrutural === 'conforme' || !dataSec3.parecerEstrutural) {
            approvedList.push("Não foram encontradas remarcações no chassi");
            approvedList.push("Não verificamos indícios de sinistro");
        } else {
            alertList.push("Identificados reparos ou ressalvas em painéis estruturais.");
        }
        approvedList.push("Não consta como roubado");
        approvedList.push("Não possui histórico de roubo e/ou furto");
        approvedList.push("O veículo está indicado como \"em circulação\"");

        if (dataSec7.parecerDocumental === 'conforme' || !dataSec7.parecerDocumental) {
            approvedList.push("Não possui débitos estaduais");
            approvedList.push("DPVAT e IPVA atuais estão quitados");
            approvedList.push("Não possui registro de leilões");
            approvedList.push("Não possui comunicado de venda");
            approvedList.push("Não consta parecer técnico");
        } else {
            alertList.push("Há registro de restrições: alienação ativa em andamento");
            alertList.push("Possui débitos de licenciamento");
            alertList.push("Possui débitos de multas");
        }

        html += `
            <div id="certive-page-4" class="certive-page" style="background-image: url('pagina_04.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>

                <!-- Pills dos status das seções -->
                <div class="absolute-field" style="top: 380px; left: 88px; width: 110px; text-align: center; font-size: 9.5px; font-weight: 800; color: ${getPillColor(dataSec3.parecerEstrutural || 'conforme')}; letter-spacing: 0.5px; text-transform: uppercase;">
                    ${getPillText(dataSec3.parecerEstrutural || 'conforme')}
                </div>
                <div class="absolute-field" style="top: 380px; left: 220px; width: 110px; text-align: center; font-size: 9.5px; font-weight: 800; color: ${getPillColor(dataSec5.parecerVidros || 'conforme')}; letter-spacing: 0.5px; text-transform: uppercase;">
                    ${getPillText(dataSec5.parecerVidros || 'conforme')}
                </div>
                <div class="absolute-field" style="top: 380px; left: 355px; width: 110px; text-align: center; font-size: 9.5px; font-weight: 800; color: ${getPillColor(dataSec4.parecerPintura || 'com_ressalvas')}; letter-spacing: 0.5px; text-transform: uppercase;">
                    ${getPillText(dataSec4.parecerPintura || 'com_ressalvas')}
                </div>
                <div class="absolute-field" style="top: 380px; left: 490px; width: 110px; text-align: center; font-size: 9.5px; font-weight: 800; color: ${getPillColor(dataSec6.parecerMotor || 'conforme')}; letter-spacing: 0.5px; text-transform: uppercase;">
                    ${getPillText(dataSec6.parecerMotor || 'conforme')}
                </div>
                <div class="absolute-field" style="top: 380px; left: 622px; width: 110px; text-align: center; font-size: 9.5px; font-weight: 800; color: ${getPillColor(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas')}; letter-spacing: 0.5px; text-transform: uppercase;">
                    ${getPillText(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas')}
                </div>

                <!-- Itens Aprovados (Lista) -->
                <div class="absolute-multiline" style="top: 505px; left: 140px; width: 510px; height: 260px; font-size: 9px; line-height: 1.55; color: var(--green); font-weight: 700; -webkit-line-clamp: 15;">
                    ${approvedList.map(item => `• ${item}`).join('<br>')}
                </div>

                <!-- Itens com Alerta (Lista) -->
                <div class="absolute-multiline" style="top: 830px; left: 140px; width: 550px; height: 180px; font-size: 9px; line-height: 1.55; color: var(--amber); font-weight: 700; -webkit-line-clamp: 10;">
                    ${alertList.length ? alertList.map(item => `• ${item}`).join('<br>') : '• Sem alertas no veículo.'}
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 05: 03 ANÁLISE ESTRUTURAL (BACKGROUND pagina_05.png)
        // =========================================================================
        const getStructuralStatus = (index) => {
            return dataSec3[`estru_${index}`] || 'conforme';
        };

        let estruTableLeft = '';
        let estruTableRight = '';

        for (let i = 1; i <= 21; i++) {
            const status = getStructuralStatus(i);
            const lineHtml = `
                <div style="height: 24.5px; display: flex; align-items: center; justify-content: flex-end; font-size: 9px; font-weight: 800; color: ${getPillColor(status)}; text-transform: uppercase; letter-spacing: 0.3px;">
                    ${getPillText(status)}
                </div>
            `;
            if (i <= 11) {
                estruTableLeft += lineHtml;
            } else {
                estruTableRight += lineHtml;
            }
        }

        html += `
            <div id="certive-page-5" class="certive-page" style="background-image: url('pagina_05.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>

                <!-- Tabela de Pareceres Estruturais -->
                <div class="absolute-field" style="top: 290px; left: 310px; width: 60px; height: 275px;">
                    ${estruTableLeft}
                </div>
                <div class="absolute-field" style="top: 290px; left: 690px; width: 60px; height: 245px;">
                    ${estruTableRight}
                </div>

                <!-- Fotos da Análise Estrutural -->
                <div class="absolute-photo" style="top: 642px; left: 52px; width: 215px; height: 110px;">
                    ${renderFoto('motor_vista_geral')}
                </div>
                <div class="absolute-photo" style="top: 642px; left: 288px; width: 215px; height: 110px;">
                    ${renderFoto('assoalho_porta_malas')}
                </div>
                <div class="absolute-photo" style="top: 642px; left: 525px; width: 215px; height: 110px;">
                    ${renderFoto('painel_hodometro')}
                </div>
                <div class="absolute-photo" style="top: 805px; left: 52px; width: 215px; height: 110px;">
                    ${renderFoto('frente_45_dir')}
                </div>
                <div class="absolute-photo" style="top: 805px; left: 288px; width: 215px; height: 110px;">
                    ${renderFoto('traseira_45_esq')}
                </div>
                <div class="absolute-photo" style="top: 805px; left: 525px; width: 215px; height: 110px;">
                    ${renderFoto('longarina_diant_esq')}
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 06: 04 PINTURA E ACABAMENTO (BACKGROUND pagina_06.png)
        // =========================================================================
        const paintItemsList = [
            "Capô", "Teto", "Tampa do porta-malas",
            "Paralama dianteiro esq.", "Porta dianteira esq.", "Porta traseira esq.",
            "Paralama traseiro esq.", "Traseira esquerda", "Paralama traseiro dir.",
            "Traseira direita", "Porta traseira dir.", "Porta dianteira dir.",
            "Paralama dianteiro dir.", "Para-choque dianteiro", "Para-choque traseiro"
        ];
        const getPaintCondition = (index) => {
            return dataSec4[`micrometro_${index}`] || 'Original';
        };
        const getPaintColor = (cond) => {
            if (cond === 'Repintura') return '#C9A961';
            if (cond === 'Repintura com massa' || cond === 'Massa') return '#B8642B';
            if (cond === 'Avariado' || cond === 'Pequenos riscos / amassado') return '#8B2635';
            if (cond === 'Não aplicável') return '#D8CFBE';
            return '#2F6B3F'; // Original
        };

        let paintTableHtml = '';
        paintItemsList.forEach((name, i) => {
            const cond = getPaintCondition(i + 1);
            paintTableHtml += `
                <div style="height: 20.2px; display: flex; align-items: center; justify-content: flex-end; font-size: 8.5px; font-weight: 800; color: ${getPaintColor(cond)}; text-transform: uppercase;">
                    ${cond}
                </div>
            `;
        });

        const etaMotorStatus = dataSec5['label_eta_compartimento_status'] || 'Original';
        const etaColunaStatus = dataSec5['label_eta_coluna_status'] || 'Original';

        html += `
            <div id="certive-page-6" class="certive-page" style="background-image: url('pagina_06.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>

                <!-- Tabela Micrometro -->
                <div class="absolute-field" style="top: 260px; left: 695px; width: 85px; height: 310px;">
                    ${paintTableHtml}
                </div>

                <!-- Etiquetas Compartimento e Coluna -->
                <div class="absolute-field" style="top: 825px; right: 80px; font-size: 9px; font-weight: 800; color: ${getPaintColor(etaMotorStatus)}; text-transform: uppercase;">
                    ${etaMotorStatus}
                </div>
                <div class="absolute-field" style="top: 848px; right: 80px; font-size: 9px; font-weight: 800; color: ${getPaintColor(etaColunaStatus)}; text-transform: uppercase;">
                    ${etaColunaStatus}
                </div>

                <!-- Fotos Etiquetas -->
                <div class="absolute-photo" style="top: 885px; left: 52px; width: 335px; height: 110px;">
                    ${renderFoto('etiqueta_eta_motor')}
                </div>
                <div class="absolute-photo" style="top: 885px; left: 405px; width: 335px; height: 110px;">
                    ${renderFoto('etiqueta_eta_coluna')}
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 07: 05 IDENTIFICAÇÃO E VIDROS (BACKGROUND pagina_07.png)
        // =========================================================================
        let glassTableHtml = '';
        for (let i = 1; i <= 6; i++) {
            const status = dataSec5[`vidro_${i}_status`] || 'Original';
            const recorded = dataSec5[`vidro_${i}_chassis`] !== false ? 'Sim' : 'Não';
            glassTableHtml += `
                <div style="height: 21px; display: flex; font-size: 8.5px; font-weight: 800; text-transform: uppercase; align-items: center;">
                    <div style="width: 150px; color: ${getPaintColor(status)}; text-align: center;">${status}</div>
                    <div style="width: 120px; color: ${recorded === 'Sim' ? 'var(--green)' : 'var(--bordeaux)'}; text-align: center;">
                        ${recorded === 'Sim' ? 'GRAVADO' : 'NÃO GRAVADO'}
                    </div>
                </div>
            `;
        }

        const idMotorStatus = dataSec6.parecerMotor || 'conforme';
        const idChassiStatus = dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas';

        html += `
            <div id="certive-page-7" class="certive-page" style="background-image: url('pagina_07.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>

                <!-- Tabela Vidros -->
                <div class="absolute-field" style="top: 262px; left: 450px; width: 280px; height: 130px;">
                    ${glassTableHtml}
                </div>

                <!-- Parecer Motor e Chassi -->
                <div class="absolute-field" style="top: 523px; left: 470px; width: 120px; text-align: center; font-size: 9px; font-weight: 800; color: ${getPillColor(idMotorStatus)}; text-transform: uppercase; letter-spacing: 0.3px;">
                    ${getPillText(idMotorStatus)}
                </div>
                <div class="absolute-field" style="top: 554px; left: 470px; width: 120px; text-align: center; font-size: 9px; font-weight: 800; color: ${getPillColor(idChassiStatus)}; text-transform: uppercase; letter-spacing: 0.3px;">
                    ${getPillText(idChassiStatus)}
                </div>

                <!-- Fotos Gravados e Placas -->
                <div class="absolute-photo" style="top: 605px; left: 52px; width: 215px; height: 165px;">
                    ${renderFoto('chassi_gravado')}
                </div>
                <div class="absolute-photo" style="top: 605px; left: 288px; width: 215px; height: 165px;">
                    ${renderFoto('motor_gravado')}
                </div>
                <div class="absolute-photo" style="top: 605px; left: 525px; width: 215px; height: 165px;">
                    ${renderFoto('placa_dianteira')}
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 08: 06 MOTOR E CHASSI (BACKGROUND pagina_08.png)
        // =========================================================================
        html += `
            <div id="certive-page-8" class="certive-page" style="background-image: url('pagina_08.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>

                <!-- Fotos Vistoria motor p8 -->
                <div class="absolute-photo" style="top: 195px; left: 52px; width: 688px; height: 190px;">
                    ${renderFoto('motor_vista_geral')}
                </div>
                <div class="absolute-photo" style="top: 398px; left: 52px; width: 335px; height: 140px;">
                    ${renderFoto('motor_gravado')}
                </div>
                <div class="absolute-photo" style="top: 398px; left: 405px; width: 335px; height: 140px;">
                    ${renderFoto('chassi_gravado')}
                </div>

                <!-- Dados Cadastrados / Lidos -->
                <div class="absolute-field" style="top: 642px; left: 300px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 130px; font-family: monospace;">
                    ${marca} / ${modelo}
                </div>
                <div class="absolute-field" style="top: 666px; left: 300px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 130px; font-family: monospace;">
                    FIAT
                </div>
                <div class="absolute-field" style="top: 702px; left: 300px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 130px; font-family: monospace;">
                    ${anoFab} / ${anoMod}
                </div>
                <div class="absolute-field" style="top: 736px; left: 300px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 130px; font-family: monospace;">
                    ${combustivel}
                </div>
                <div class="absolute-field" style="top: 770px; left: 300px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 130px; font-family: monospace;">
                    ${cor}
                </div>

                <div class="absolute-field" style="top: 642px; left: 630px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 100px; font-family: monospace;">
                    ${placa}
                </div>
                <div class="absolute-field" style="top: 666px; left: 630px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 100px; font-family: monospace;">
                    ${chassi}
                </div>
                <div class="absolute-field" style="top: 702px; left: 630px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 100px; font-family: monospace;">
                    ${motor}
                </div>
                <div class="absolute-field" style="top: 736px; left: 630px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 100px; font-family: monospace;">
                    ${renavam}
                </div>
                <div class="absolute-field" style="top: 770px; left: 630px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-align: right; width: 100px; font-family: monospace;">
                    ${quilometragem} km
                </div>

                <!-- Parecer Final p8 -->
                <div class="absolute-field" style="top: 835px; right: 80px; font-size: 16px; font-weight: 900; color: ${getPillColor(parecerFinal)}; text-transform: uppercase;">
                    ${parecerFinal === 'nao_conforme' ? 'NÃO CONFORME' : (parecerFinal === 'com_ressalvas' ? 'CONFORME COM RESSALVA' : 'CONFORME')}
                </div>

                <!-- Observação Técnica rodapé -->
                <div class="absolute-field" style="top: 878px; left: 80px; width: 620px; font-size: 9px; font-weight: 500; color: #5A544A; line-height: 1.45;">
                    Observação: Não são analisados itens que necessitem de equipamentos especializados como freios ABS, air bags, parte mecânica, hodômetro e elétrica.
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 09: 07 PESQUISA DOCUMENTAL (BACKGROUND pagina_09.png)
        // =========================================================================
        html += `
            <div id="certive-page-9" class="certive-page" style="background-image: url('pagina_09.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>

                <!-- Informações da Consulta -->
                <div class="absolute-field" style="top: 252px; left: 215px; font-size: 9px; font-weight: 700; color: #1C1C1C; font-family: monospace;">
                    ${placa}
                </div>
                <div class="absolute-field" style="top: 285px; left: 215px; font-size: 9px; font-weight: 700; color: #1C1C1C; font-family: monospace;">
                    ${dataVistoria} às ${horaVistoria}
                </div>
                <div class="absolute-field" style="top: 318px; left: 215px; font-size: 9px; font-weight: 700; color: #1C1C1C; text-transform: uppercase;">
                    ${vistoriador}
                </div>

                <div class="absolute-field" style="top: 252px; left: 605px; font-size: 9px; font-weight: 700; color: #1C1C1C;">
                    Certive Vistorias
                </div>
                <div class="absolute-field" style="top: 285px; left: 605px; font-size: 9px; font-weight: 700; color: #1C1C1C; font-family: monospace;">
                    4386109
                </div>
                <div class="absolute-field" style="top: 318px; left: 605px; font-size: 7.5px; font-weight: 700; color: #1C1C1C; font-family: monospace; width: 140px;">
                    4348c105-afa0-4df6-b800-fcf6f3d1b38
                </div>
                <div class="absolute-field" style="top: 350px; left: 605px; font-size: 9px; font-weight: 700; color: #1C1C1C;">
                    Curitiba / PR
                </div>

                <!-- Tabelas Aprovados, Alerta e Restrições -->
                <div class="absolute-multiline" style="top: 440px; left: 280px; width: 120px; height: 100px; font-size: 8.5px; font-weight: 800; color: var(--green); line-height: 1.75; text-align: right;">
                    NADA CONSTA<br>NADA CONSTA<br>NADA CONSTA<br>NADA CONSTA
                </div>
                <div class="absolute-multiline" style="top: 440px; left: 615px; width: 120px; height: 100px; font-size: 8.5px; font-weight: 800; color: var(--green); line-height: 1.75; text-align: right;">
                    NADA CONSTA<br>NADA CONSTA<br>NADA CONSTA
                </div>

                <div class="absolute-multiline" style="top: 612px; left: 440px; width: 280px; height: 50px; font-size: 8.5px; font-weight: 800; color: ${dataSec7.parecerDocumental !== 'conforme' ? 'var(--amber)' : 'var(--green)'}; line-height: 1.75; text-align: right; text-transform: uppercase;">
                    ${dataSec7.parecerDocumental !== 'conforme' ? 'MULTAS EM ABERTO LOCALIZADAS<br>DÉBITO DE LICENCIAMENTO ATIVO' : 'NADA CONSTA'}
                </div>

                <div class="absolute-multiline" style="top: 728px; left: 440px; width: 280px; height: 50px; font-size: 8.5px; font-weight: 800; color: ${dataSec7.parecerDocumental !== 'conforme' ? 'var(--bordeaux)' : 'var(--green)'}; line-height: 1.75; text-align: right; text-transform: uppercase;">
                    ${dataSec7.parecerDocumental !== 'conforme' ? 'ALIENAÇÃO ATIVA EM ANDAMENTO' : 'NADA CONSTA'}
                </div>
            </div>
        `;

        // =========================================================================
        // PAGINA 10: 08 PARECER FINAL E ENCERRAMENTO (BACKGROUND pagina_10.png)
        // =========================================================================
        let finalHeadline = 'CONFORME';
        let finalColor = 'var(--green)';
        let finalSub = 'PARA AQUISIÇÃO';
        let finalBody = 'Com base em todas as verificações e pesquisas realizadas, certifico que o veículo vistoriado apresenta condições compatíveis com sua idade e uso, não sendo identificados indícios de sinistro, remarcação de chassi, restrições ou irregularidades relevantes.';

        if (parecerFinal === 'com_ressalvas') {
            finalHeadline = 'CONFORME COM RESSALVA';
            finalColor = 'var(--amber)';
            finalSub = 'VERIFICAR APONTAMENTOS';
            finalBody = obsFinal || 'O veículo apresenta integridade estrutural original de fábrica, porém com ressalvas estéticas de pintura ou pequenas pendências documentais em aberto.';
        } else if (parecerFinal === 'nao_conforme' || parecerFinal === 'reprovada') {
            finalHeadline = 'NÃO CONFORME';
            finalColor = 'var(--bordeaux)';
            finalSub = 'NÃO RECOMENDADO PARA AQUISIÇÃO';
            finalBody = obsFinal || 'O veículo apresenta avarias ou vestígios de soldas estruturais incompatíveis com a originalidade de fábrica, gerando parecer desfavorável.';
        }

        html += `
            <div id="certive-page-10" class="certive-page" style="background-image: url('pagina_10.png');">
                <!-- Dossiê topo direito -->
                <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                    ${dossie}
                </div>

                <!-- Box de Parecer Final Central -->
                <div class="absolute-multiline" style="top: 375px; left: 140px; width: 510px; height: 140px; font-size: 10.5px; line-height: 1.65; text-align: center; color: white; -webkit-line-clamp: 4;">
                    ${finalBody}
                </div>
                <div class="absolute-field" style="top: 550px; left: 140px; width: 510px; text-align: center; font-size: 24px; font-weight: 800; color: ${finalColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${finalHeadline}
                </div>
                <div class="absolute-field" style="top: 590px; left: 140px; width: 510px; text-align: center; font-size: 8.5px; font-weight: 800; color: var(--gold); letter-spacing: 1px; text-transform: uppercase;">
                    ${finalSub}
                </div>

                <!-- Localidade e Data -->
                <div class="absolute-field" style="top: 692px; left: 140px; width: 510px; text-align: center; font-size: 11px; font-weight: 700; color: #0A1F3D;">
                    São José/SC, ${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'})}.
                </div>

                <!-- Assinatura Vistoriador -->
                <div class="absolute-photo" style="top: 760px; left: 288px; width: 220px; height: 50px; background: transparent; border-radius: 0; overflow: hidden; border: none;">
                    ${signatureVistoriador ? `<img src="${signatureVistoriador}" style="max-height: 100%; max-width: 100%; object-fit: contain; display: block; margin: 0 auto;">` : ''}
                </div>
                <div class="absolute-field" style="top: 825px; left: 288px; width: 220px; text-align: center; font-size: 10px; font-weight: 800; color: #0A1F3D; text-transform: uppercase;">
                    ${vistoriador}
                </div>

                <!-- Hash Criptográfico no rodapé -->
                <div class="absolute-field" style="top: 928px; left: 60px; width: 480px; font-size: 7.5px; font-family: monospace; color: #5A544A; word-break: break-all; font-weight: 500;">
                    ${hashLaudo}
                </div>

                <!-- QR Code do Laudo -->
                <div class="absolute-photo" id="laudo-preview-qrcode" style="top: 895px; right: 52px; width: 60px; height: 60px; border-radius: 0; overflow: hidden; border: none; background: white; padding: 4px; box-sizing: border-box;"></div>
            </div>
        `;

        html += `</div>`;
        previewContainer.innerHTML = html;

        // Gerar o QR Code dinâmico no local apropriado
        setTimeout(() => {
            const qrDiv = document.getElementById('laudo-preview-qrcode');
            if (qrDiv) {
                qrDiv.innerHTML = '';
                const validationUrl = `https://rbaggiofilho-source.github.io/CERTIVE-PRINCIPAL/consulta-laudo.html?hash=${hashLaudo}`;
                new QRCode(qrDiv, {
                    text: validationUrl,
                    width: 52,
                    height: 52,
                    colorDark: '#0A1F3D',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        }, 200);

        // Fatiamento dinâmico automático dos backgrounds se as imagens individuais não existirem
        for (let p = 1; p <= 10; p++) {
            const pageId = `certive-page-${p}`;
            slicePageFromGrid(p).then(bytes => {
                const blob = new Blob([bytes], { type: 'image/png' });
                const url = URL.createObjectURL(blob);
                const el = document.getElementById(pageId);
                if (el) el.style.backgroundImage = `url('${url}')`;
            }).catch(err => {
                console.warn(`Background individual ou fatiamento da página ${p} pendente/indisponível.`);
            });
        }
        
    } catch (err) {
        console.error("Erro no preview do laudo:", err);
        previewContainer.innerHTML = `
            <div style="background: #fee2e2; border: 1px solid #fca5a5; color: #991b1b; padding: 20px; border-radius: 6px; margin: 20px auto; max-width: 600px; text-align: left; font-family: sans-serif;">
                <h3 style="margin-top:0;">Erro de Execução no Preview</h3>
                <p>Ocorreu um erro ao renderizar o laudo:</p>
                <pre style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px; color:#991b1b;">${err.stack || err.message}</pre>
            </div>
        `;
    }
}

/**
 * GERAÇÃO DE PDF OFICIAL DO LAUDO CAUTELAR
 * Preenchimento direto do PDF editável (Certive_Template_Editavel.pdf) via pdf-lib.
 */
// Helpers para fatiamento dinâmico no browser a partir das grades
async function getPageBackgroundBytes(pageIndex) {
    const fileName = `pagina_${String(pageIndex).padStart(2, '0')}.png`;
    try {
        const res = await fetch(fileName);
        if (!res.ok) throw new Error("File not found on server");
        return await res.arrayBuffer();
    } catch (err) {
        console.warn(`Background individual "${fileName}" não encontrado. Utilizando fatiamento dinâmico de laudo_grade...`);
        return await slicePageFromGrid(pageIndex);
    }
}

async function slicePageFromGrid(pageIndex) {
    const isPage10 = pageIndex === 10;
    const gridImgUrl = isPage10 ? 'laudo_grade_2.png' : 'laudo_grade_1.png';
    const gridIndex = isPage10 ? 8 : (pageIndex - 1); // Página 10 é a 9ª subdivisão (índice 8) da grade 2

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const targetW = 800;
            const targetH = 1130;
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');

            const isLandscape = img.naturalWidth > img.naturalHeight;
            const sw = img.naturalWidth / 3;
            const sh = img.naturalHeight / 3;
            const col = gridIndex % 3;
            const row = Math.floor(gridIndex / 3);
            const sx = col * sw;
            const sy = row * sh;

            if (isLandscape) {
                // Rotaciona 90 graus no sentido horário (esquerda para cima)
                ctx.save();
                ctx.translate(targetW / 2, targetH / 2);
                ctx.rotate(90 * Math.PI / 180);
                ctx.drawImage(img, sx, sy, sw, sh, -targetH / 2, -targetW / 2, targetH, targetW);
                ctx.restore();
            } else {
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
            }

            canvas.toBlob((blob) => {
                if (blob) {
                    blob.arrayBuffer().then(resolve).catch(reject);
                } else {
                    reject(new Error("Erro ao gerar Blob da imagem de fundo"));
                }
            }, 'image/png');
        };
        img.onerror = (err) => reject(err);
        img.src = gridImgUrl;
    });
}

/**
 * GERAÇÃO DE PDF OFICIAL DO LAUDO CAUTELAR
 * Geração dinâmica de PDF de 10 páginas desenhando diretamente sobre os backgrounds de imagem fatiados.
 */
async function generateInspectionReport(cautelarId) {
    // 1. Carrega dados do banco local
    const cautelar = db.cautelares.find(c => c.id === cautelarId);
    if (!cautelar) throw new Error("Vistoria não encontrada");

    const os = db.ordens_servico.find(o => o.id === cautelar.osId);
    if (!os) throw new Error("Ordem de serviço não encontrada");

    const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelar.id);
    const dataSec1 = (secoes.find(s => s.numeroSecao === 1)?.dadosJson) || {};
    const dataSec2 = (secoes.find(s => s.numeroSecao === 2)?.dadosJson) || {};
    const dataSec3 = (secoes.find(s => s.numeroSecao === 3)?.dadosJson) || {};
    const dataSec4 = (secoes.find(s => s.numeroSecao === 4)?.dadosJson) || {};
    const dataSec5 = (secoes.find(s => s.numeroSecao === 5)?.dadosJson) || {};
    const dataSec6 = (secoes.find(s => s.numeroSecao === 6)?.dadosJson) || {};
    const dataSec7 = (secoes.find(s => s.numeroSecao === 7)?.dadosJson) || {};
    const dataSec8 = (secoes.find(s => s.numeroSecao === 8)?.dadosJson) || {};

    const parecerFinal = cautelar.parecerFinal || 'conforme';
    const obsFinal = dataSec8.observacaoFinal || '';
    const signatureVistoriador = dataSec8.signatureBase64 || '';
    
    const hashLaudo = cautelar.hashLaudo || 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

    // 2. Inicializa o PDF com pdf-lib
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    // Carrega as fontes padrão
    const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

    // 3. Prepara os dados textuais mapeados
    const valOrFallback = (val) => {
        if (val === undefined || val === null || String(val).trim() === '') {
            return 'Não informado';
        }
        return String(val);
    };

    const dossie = valOrFallback(cautelar.dossieNumero || cautelar.dossie_numero);
    const dataVistoria = valOrFallback(new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR'));
    const horaVistoria = valOrFallback(new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}));
    const vistoriador = valOrFallback(db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome);
    const placa = valOrFallback(os.placa);
    const cor = valOrFallback(os.cor);
    const renavam = valOrFallback(os.renavam);
    const chassi = valOrFallback(os.chassi || dataSec2.chassiLido);
    const motor = valOrFallback(os.motor || dataSec2.motorLido);
    const quilometragem = valOrFallback(dataSec1.quilometragem);
    const combustivel = valOrFallback(dataSec1.combustivel || os.combustivel);
    const anoFab = valOrFallback(os.fabricacaoAno || os.ano_fabricacao);
    const anoMod = valOrFallback(os.modeloAno || os.ano_modelo);
    const unidadeNome = valOrFallback(db.unidades.find(u => u.id === os.unidadeId)?.nome);

    let marca = 'Não informado';
    let modelo = 'Não informado';
    if (os.clienteNome) {
        if (os.clienteNome.includes('/')) {
            const parts = os.clienteNome.split('/');
            marca = valOrFallback(parts[0]);
            modelo = valOrFallback(parts[1]);
        } else {
            modelo = valOrFallback(os.clienteNome);
        }
    }

    const fotosVistoria = db.cautelares_fotos.filter(f => secoes.map(s => s.id).includes(f.secaoId));

    // Fator de escala de pixels HTML (794x1122) para pontos PDF (595.27x841.89)
    const scaleX = 595.27 / 794;
    const scaleY = 841.89 / 1122;

    // Loop para gerar cada uma das 10 páginas
    for (let p = 1; p <= 10; p++) {
        const bgBytes = await getPageBackgroundBytes(p);
        const page = pdfDoc.addPage([595.27, 841.89]);
        
        // Insere o background
        const bgImg = await pdfDoc.embedPng(bgBytes);
        page.drawImage(bgImg, { x: 0, y: 0, width: 595.27, height: 841.89 });

        // Helpers de desenho absoluto locais para essa página
        const drawTextAbs = (text, left, top, size, isBold = false, colorHex = '#1C1C1C', align = 'left') => {
            const font = isBold ? fontBold : fontRegular;
            const pdfSize = size * 0.90;
            
            let r = 0x1C / 255, g = 0x1C / 255, b = 0x1C / 255;
            if (colorHex.startsWith('#')) {
                r = parseInt(colorHex.substring(1, 3), 16) / 255;
                g = parseInt(colorHex.substring(3, 5), 16) / 255;
                b = parseInt(colorHex.substring(5, 7), 16) / 255;
            } else if (colorHex === 'var(--green)') {
                r = 0x2F / 255; g = 0x6B / 255; b = 0x3F / 255;
            } else if (colorHex === 'var(--amber)') {
                r = 0xB8 / 255; g = 0x64 / 255; b = 0x2B / 255;
            } else if (colorHex === 'var(--bordeaux)') {
                r = 0x8B / 255; g = 0x26 / 255; b = 0x35 / 255;
            } else if (colorHex === 'var(--gold)') {
                r = 0xC9 / 255; g = 0xA9 / 255; b = 0x61 / 255;
            }

            let x = left * scaleX;
            let y = 841.89 - (top * scaleY) - (pdfSize * 0.85);

            if (align === 'right') {
                const textWidth = font.widthOfTextAtSize(text, pdfSize);
                x = (left * scaleX) - textWidth;
            } else if (align === 'center') {
                // left funciona como centro do eixo X se alinhado ao centro
                const textWidth = font.widthOfTextAtSize(text, pdfSize);
                x = (left * scaleX) - (textWidth / 2);
            }

            page.drawText(text, {
                x: x,
                y: y,
                size: pdfSize,
                font: font,
                color: PDFLib.rgb(r, g, b)
            });
        };

        const drawMultilineTextAbs = (linesText, left, top, size, isBold, colorHex, align = 'left', lineSpacing = 13.5) => {
            const lines = String(linesText).split('\n');
            lines.forEach((line, idx) => {
                drawTextAbs(line, left, top + (idx * lineSpacing), size, isBold, colorHex, align);
            });
        };

        const drawPhotoAbs = async (slotCodigo, left, top, width, height) => {
            const photo = fotosVistoria.find(f => f.slotCodigo === slotCodigo);
            const photoUrl = photo ? (photo.url_thumb || photo.url_original || '') : '';
            
            const wReal = width * scaleX;
            const hReal = height * scaleY;
            const xReal = left * scaleX;
            const yReal = 841.89 - (top * scaleY) - hReal;

            if (photoUrl) {
                try {
                    const croppedBytes = await cropImageToFit(photoUrl, wReal, hReal);
                    let pdfImg;
                    try {
                        pdfImg = await pdfDoc.embedJpg(croppedBytes);
                    } catch (e) {
                        pdfImg = await pdfDoc.embedPng(croppedBytes);
                    }
                    page.drawImage(pdfImg, {
                        x: xReal,
                        y: yReal,
                        width: wReal,
                        height: hReal
                    });
                } catch (err) {
                    console.error(`Erro ao processar imagem ${slotCodigo}:`, err);
                    drawPhotoPlaceholderAbs(xReal, yReal, wReal, hReal);
                }
            } else {
                drawPhotoPlaceholderAbs(xReal, yReal, wReal, hReal);
            }
        };

        const drawPhotoPlaceholderAbs = (x, y, w, h) => {
            page.drawRectangle({
                x: x,
                y: y,
                width: w,
                height: h,
                color: PDFLib.rgb(0.98, 0.98, 0.96),
                borderColor: PDFLib.rgb(0.85, 0.81, 0.75),
                borderWidth: 1
            });
            const fontSize = 6.5 * scaleX;
            const text = "Imagem nao informada";
            const textWidth = fontBold.widthOfTextAtSize(text, fontSize);
            const textHeight = fontBold.heightAtSize(fontSize);
            page.drawText(text, {
                x: x + (w - textWidth) / 2,
                y: y + (h - textHeight) / 2,
                size: fontSize,
                font: fontBold,
                color: PDFLib.rgb(0.35, 0.33, 0.29)
            });
        };

        const getPillText = (status) => {
            if (status === 'RESTRIÇÃO' || status === 'nao_conforme' || status === 'reprovada') return 'RESTRIÇÃO';
            if (status === 'COM RESSALVAS' || status === 'com_ressalvas') return 'RESSALVAS';
            return 'CONFORME';
        };

        const getPillColor = (status) => {
            if (status === 'RESTRIÇÃO' || status === 'nao_conforme' || status === 'reprovada') return 'var(--bordeaux)';
            if (status === 'COM RESSALVAS' || status === 'com_ressalvas') return 'var(--amber)';
            return 'var(--green)';
        };

        // RENDERIZA OS DADOS DA PÁGINA ESPECÍFICA
        if (p === 1) {
            drawTextAbs("SÃO JOSÉ / SC", 70, 960, 11, true, "#FFFFFF");
            drawTextAbs(dataVistoria, 70, 978, 9, false, "rgba(255,255,255,0.7)");
            drawTextAbs("DOSSIÊ: " + dossie, 724, 960, 11, true, "#FFFFFF", "right");
        } 
        else if (p === 2) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");
        } 
        else if (p === 3) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");
            drawTextAbs(marca + " / " + modelo, 55, 290, 11, true);
            drawTextAbs(anoFab + " / " + anoMod, 55, 350, 11, true);
            drawTextAbs(cor, 55, 410, 11, true);
            drawTextAbs(placa, 55, 472, 11, true);
            drawTextAbs(chassi, 55, 532, 11, true);
            drawTextAbs(motor, 55, 592, 11, true);
            drawTextAbs(combustivel, 55, 655, 11, true);
            drawTextAbs(renavam, 55, 715, 11, true);
            drawTextAbs(quilometragem + " km", 55, 775, 11, true);

            await drawPhotoAbs('frente_45_dir', 388, 255, 350, 215);
            await drawPhotoAbs('traseira_45_esq', 388, 492, 350, 215);

            drawTextAbs(dataVistoria + " às " + horaVistoria, 202, 832, 11, true);
            drawTextAbs(unidadeNome, 202, 865, 11, true);
            drawTextAbs(vistoriador, 202, 900, 11, true);
        } 
        else if (p === 4) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");
            
            drawTextAbs(getPillText(dataSec3.parecerEstrutural || 'conforme'), 88 + 55, 380, 11, true, getPillColor(dataSec3.parecerEstrutural || 'conforme'), "center");
            drawTextAbs(getPillText(dataSec5.parecerVidros || 'conforme'), 220 + 55, 380, 11, true, getPillColor(dataSec5.parecerVidros || 'conforme'), "center");
            drawTextAbs(getPillText(dataSec4.parecerPintura || 'com_ressalvas'), 355 + 55, 380, 11, true, getPillColor(dataSec4.parecerPintura || 'com_ressalvas'), "center");
            drawTextAbs(getPillText(dataSec6.parecerMotor || 'conforme'), 490 + 55, 380, 11, true, getPillColor(dataSec6.parecerMotor || 'conforme'), "center");
            drawTextAbs(getPillText(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas'), 622 + 55, 380, 11, true, getPillColor(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas'), "center");

            const approvedList = [];
            const alertList = [];
            if (dataSec3.parecerEstrutural === 'conforme' || !dataSec3.parecerEstrutural) {
                approvedList.push("Não foram encontradas remarcações no chassi");
                approvedList.push("Não verificamos indícios de sinistro");
            } else {
                alertList.push("Identificados reparos ou ressalvas em painéis estruturais.");
            }
            approvedList.push("Não consta como roubado");
            approvedList.push("Não possui histórico de roubo e/ou furto");
            approvedList.push("O veículo está indicado como \"em circulação\"");

            if (dataSec7.parecerDocumental === 'conforme' || !dataSec7.parecerDocumental) {
                approvedList.push("Não possui débitos estaduais");
                approvedList.push("DPVAT e IPVA atuais estão quitados");
                approvedList.push("Não possui registro de leilões");
                approvedList.push("Não possui comunicado de venda");
                approvedList.push("Não consta parecer técnico");
            } else {
                alertList.push("Há registro de restrições: alienação ativa em andamento");
                alertList.push("Possui débitos de licenciamento");
                alertList.push("Possui débitos de multas");
            }

            drawMultilineTextAbs(approvedList.join('\n'), 140, 505, 9, true, "var(--green)", "left", 14);
            drawMultilineTextAbs(alertList.join('\n'), 140, 830, 9, true, "var(--amber)", "left", 14);
        } 
        else if (p === 5) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");

            const getStructuralStatus = (index) => dataSec3[`estru_${index}`] || 'conforme';
            for (let i = 1; i <= 21; i++) {
                const status = getStructuralStatus(i);
                const text = getPillText(status);
                const color = getPillColor(status);
                
                if (i <= 11) {
                    const topOffset = 290 + ((i - 1) * 24.5);
                    drawTextAbs(text, 310 + 30, topOffset, 9, true, color, "center");
                } else {
                    const topOffset = 290 + ((i - 12) * 24.5);
                    drawTextAbs(text, 690 + 30, topOffset, 9, true, color, "center");
                }
            }

            await drawPhotoAbs('motor_vista_geral', 52, 642, 215, 110);
            await drawPhotoAbs('assoalho_porta_malas', 288, 642, 215, 110);
            await drawPhotoAbs('painel_hodometro', 525, 642, 215, 110);
            await drawPhotoAbs('frente_45_dir', 52, 805, 215, 110);
            await drawPhotoAbs('traseira_45_esq', 288, 805, 215, 110);
            await drawPhotoAbs('longarina_diant_esq', 525, 805, 215, 110);
        } 
        else if (p === 6) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");

            const paintItemsList = [
                "Capô", "Teto", "Tampa do porta-malas",
                "Paralama dianteiro esq.", "Porta dianteira esq.", "Porta traseira esq.",
                "Paralama traseiro esq.", "Traseira esquerda", "Paralama traseiro dir.",
                "Traseira direita", "Porta traseira dir.", "Porta dianteira dir.",
                "Paralama dianteiro dir.", "Para-choque dianteiro", "Para-choque traseiro"
            ];
            const getPaintCondition = (index) => dataSec4[`micrometro_${index}`] || 'Original';
            const getPaintColor = (cond) => {
                if (cond === 'Repintura') return '#C9A961';
                if (cond === 'Repintura com massa' || cond === 'Massa') return '#B8642B';
                if (cond === 'Avariado' || cond === 'Pequenos riscos / amassado') return '#8B2635';
                if (cond === 'Não aplicável') return '#D8CFBE';
                return '#2F6B3F';
            };

            paintItemsList.forEach((name, i) => {
                const cond = getPaintCondition(i + 1);
                const color = getPaintColor(cond);
                const topOffset = 260 + (i * 20.2);
                drawTextAbs(cond, 695, topOffset, 8.5, true, color);
            });

            const etaMotorStatus = dataSec5['label_eta_compartimento_status'] || 'Original';
            const etaColunaStatus = dataSec5['label_eta_coluna_status'] || 'Original';

            drawTextAbs(etaMotorStatus, 714, 825, 9, true, getPaintColor(etaMotorStatus), "right");
            drawTextAbs(etaColunaStatus, 714, 848, 9, true, getPaintColor(etaColunaStatus), "right");

            await drawPhotoAbs('etiqueta_eta_motor', 52, 885, 335, 110);
            await drawPhotoAbs('etiqueta_eta_coluna', 405, 885, 335, 110);
        } 
        else if (p === 7) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");

            const getPaintColor = (cond) => {
                if (cond === 'Repintura') return '#C9A961';
                if (cond === 'Repintura com massa' || cond === 'Massa') return '#B8642B';
                if (cond === 'Avariado' || cond === 'Pequenos riscos / amassado') return '#8B2635';
                if (cond === 'Não aplicável') return '#D8CFBE';
                return '#2F6B3F';
            };

            for (let i = 1; i <= 6; i++) {
                const status = dataSec5[`vidro_${i}_status`] || 'Original';
                const recorded = dataSec5[`vidro_${i}_chassis`] !== false ? 'Sim' : 'Não';
                const topOffset = 262 + ((i - 1) * 21);
                
                drawTextAbs(status, 450 + 50, topOffset, 8.5, true, getPaintColor(status), "center");
                drawTextAbs(recorded === 'Sim' ? 'GRAVADO' : 'NÃO GRAVADO', 590 + 50, topOffset, 8.5, true, recorded === 'Sim' ? 'var(--green)' : 'var(--bordeaux)', "center");
            }

            const idMotorStatus = dataSec6.parecerMotor || 'conforme';
            const idChassiStatus = dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas';

            drawTextAbs(getPillText(idMotorStatus), 470 + 60, 523, 9, true, getPillColor(idMotorStatus), "center");
            drawTextAbs(getPillText(idChassiStatus), 470 + 60, 554, 9, true, getPillColor(idChassiStatus), "center");

            await drawPhotoAbs('chassi_gravado', 52, 605, 215, 165);
            await drawPhotoAbs('motor_gravado', 288, 605, 215, 165);
            await drawPhotoAbs('placa_dianteira', 525, 605, 215, 165);
        } 
        else if (p === 8) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");

            await drawPhotoAbs('motor_vista_geral', 52, 195, 688, 190);
            await drawPhotoAbs('motor_gravado', 52, 398, 335, 140);
            await drawPhotoAbs('chassi_gravado', 405, 398, 335, 140);

            // Dados Complementares Coluna 1
            drawTextAbs(marca + " / " + modelo, 430, 642, 9, true, "#1C1C1C", "right");
            drawTextAbs("FIAT", 430, 666, 9, true, "#1C1C1C", "right");
            drawTextAbs(anoFab + " / " + anoMod, 430, 702, 9, true, "#1C1C1C", "right");
            drawTextAbs(combustivel, 430, 736, 9, true, "#1C1C1C", "right");
            drawTextAbs(cor, 430, 770, 9, true, "#1C1C1C", "right");

            // Dados Complementares Coluna 2
            drawTextAbs(placa, 730, 642, 9, true, "#1C1C1C", "right");
            drawTextAbs(chassi, 730, 666, 9, true, "#1C1C1C", "right");
            drawTextAbs(motor, 730, 702, 9, true, "#1C1C1C", "right");
            drawTextAbs(renavam, 730, 736, 9, true, "#1C1C1C", "right");
            drawTextAbs(quilometragem + " km", 730, 770, 9, true, "#1C1C1C", "right");

            drawTextAbs(parecerFinal === 'nao_conforme' ? 'NÃO CONFORME' : (parecerFinal === 'com_ressalvas' ? 'CONFORME COM RESSALVA' : 'CONFORME'), 714, 835, 16, true, getPillColor(parecerFinal), "right");
            drawTextAbs("Observação: Não são analisados itens que necessitem de equipamentos especializados como freios ABS, air bags, parte mecânica, hodômetro e elétrica.", 80, 878, 9, false, "#5A544A");
        } 
        else if (p === 9) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");

            // Dados Consulta
            drawTextAbs(placa, 215, 252, 9, true);
            drawTextAbs(dataVistoria + " às " + horaVistoria, 215, 285, 9, true);
            drawTextAbs(vistoriador, 215, 318, 9, true);
            
            drawTextAbs("Certive Vistorias", 605, 252, 9, true);
            drawTextAbs("4386109", 605, 285, 9, true);
            drawTextAbs("4348c105-afa0-4df6-b800-fcf6f3d1b38", 605, 318, 7.5, true);
            drawTextAbs("Curitiba / PR", 605, 350, 9, true);

            // Aprovados, Alerta e Restrição
            drawMultilineTextAbs("Nada consta\nNada consta\nNada consta\nNada consta", 400, 440, 8.5, true, "var(--green)", "right");
            drawMultilineTextAbs("Nada consta\nNada consta\nNada consta", 735, 440, 8.5, true, "var(--green)", "right");

            const docAlert = dataSec7.parecerDocumental !== 'conforme' ? "Multas em aberto localizadas\nDébito de licenciamento ativo" : "Nada consta";
            const docRestr = dataSec7.parecerDocumental !== 'conforme' ? "Alienação ativa em andamento" : "Nada consta";

            drawMultilineTextAbs(docAlert, 720, 612, 8.5, true, "var(--amber)", "right", 15);
            drawMultilineTextAbs(docRestr, 720, 728, 8.5, true, "var(--bordeaux)", "right", 15);
        } 
        else if (p === 10) {
            drawTextAbs(dossie, 714, 95, 10, true, "#0A1F3D", "right");

            let finalHeadline = 'CONFORME';
            let finalColor = 'var(--green)';
            let finalSub = 'PARA AQUISIÇÃO';
            let finalBody = 'Com base em todas as verificações e pesquisas realizadas, certifico que o veículo vistoriado apresenta condições compatíveis com sua idade e uso, não sendo identificados indícios de sinistro, remarcação de chassi, restrições ou irregularidades relevantes.';

            if (parecerFinal === 'com_ressalvas') {
                finalHeadline = 'CONFORME COM RESSALVA';
                finalColor = 'var(--amber)';
                finalSub = 'VERIFICAR APONTAMENTOS';
                finalBody = obsFinal || 'O veículo apresenta integridade estrutural original de fábrica, porém com ressalvas estéticas de pintura ou pequenas pendências documentais em aberto.';
            } else if (parecerFinal === 'nao_conforme' || parecerFinal === 'reprovada') {
                finalHeadline = 'NÃO CONFORME';
                finalColor = 'var(--bordeaux)';
                finalSub = 'NÃO RECOMENDADO PARA AQUISIÇÃO';
                finalBody = obsFinal || 'O veículo apresenta avarias ou vestígios de soldas estruturais incompatíveis com a originalidade de fábrica, gerando parecer desfavorável.';
            }

            // Word wrap inteligente para o Parecer Final
            const words = finalBody.split(' ');
            let currentLine = '';
            const lines = [];
            words.forEach(word => {
                if ((currentLine + ' ' + word).length > 70) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = currentLine ? currentLine + ' ' + word : word;
                }
            });
            if (currentLine) lines.push(currentLine);
            
            lines.forEach((line, idx) => {
                drawTextAbs(line, 140 + 255, 375 + (idx * 16.5), 10.5, false, "#FFFFFF", "center");
            });

            drawTextAbs(finalHeadline, 140 + 255, 550, 24, true, finalColor, "center");
            drawTextAbs(finalSub, 140 + 255, 590, 8.5, true, "var(--gold)", "center");

            const dataLonga = `São José/SC, ${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'})}.`;
            drawTextAbs(dataLonga, 140 + 255, 692, 11, true, "#0A1F3D", "center");

            // Assinatura Vistoriador
            if (signatureVistoriador) {
                try {
                    const sigBytes = await fetch(signatureVistoriador).then(res => res.arrayBuffer());
                    let sigImg;
                    try {
                        sigImg = await pdfDoc.embedPng(sigBytes);
                    } catch (e) {
                        sigImg = await pdfDoc.embedJpg(sigBytes);
                    }
                    const wReal = 220 * scaleX;
                    const hReal = 50 * scaleY;
                    const xReal = 288 * scaleX;
                    const yReal = 841.89 - (760 * scaleY) - hReal;
                    page.drawImage(sigImg, {
                        x: xReal + (wReal - wReal * 0.8) / 2,
                        y: yReal + (hReal - hReal * 0.8) / 2,
                        width: wReal * 0.8,
                        height: hReal * 0.8
                    });
                } catch (errSig) {
                    console.error("Erro ao desenhar assinatura no PDF:", errSig);
                }
            }

            drawTextAbs(vistoriador, 288 + 110, 825, 10, true, "#0A1F3D", "center");
            drawTextAbs(hashLaudo, 60, 928, 7.5, false, "#5A544A");

            // Desenhar o QR Code
            const qrCanvas = document.querySelector('#laudo-preview-qrcode canvas');
            if (qrCanvas) {
                try {
                    const qrDataUrl = qrCanvas.toDataURL('image/png');
                    const qrBytes = await fetch(qrDataUrl).then(res => res.arrayBuffer());
                    const qrImg = await pdfDoc.embedPng(qrBytes);
                    const qrW = 60 * scaleX;
                    const qrH = 60 * scaleY;
                    const qrX = (794 - 52 - 60) * scaleX;
                    const qrY = 841.89 - (895 * scaleY) - qrH;
                    page.drawImage(qrImg, {
                        x: qrX,
                        y: qrY,
                        width: qrW,
                        height: qrH
                    });
                } catch (errQr) {
                    console.error("Erro ao processar QR code:", errQr);
                }
            }
        }
    }

    // 5. Salva o PDF finalizado
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
}

// Helpers para generateInspectionReport
function obterMesPorExtenso(mesNum) {
    const meses = [
        "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
        "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
    ];
    return meses[parseInt(mesNum, 10) - 1] || 'JANEIRO';
}

async function cropImageToFit(imageUrl, wPoints, hPoints, scale = 2) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = wPoints * scale;
            canvas.height = hPoints * scale;
            const ctx = canvas.getContext('2d');
            
            const imgAspect = img.width / img.height;
            const canvasAspect = canvas.width / canvas.height;
            let sx, sy, sWidth, sHeight;
            
            if (imgAspect > canvasAspect) {
                sHeight = img.height;
                sWidth = img.height * canvasAspect;
                sx = (img.width - sWidth) / 2;
                sy = 0;
            } else {
                sWidth = img.width;
                sHeight = img.width / canvasAspect;
                sx = 0;
                sy = (img.height - sHeight) / 2;
            }
            
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob((blob) => {
                if (blob) {
                    blob.arrayBuffer().then(resolve).catch(reject);
                } else {
                    reject(new Error("Erro no canvas Blob"));
                }
            }, "image/jpeg", 0.85);
        };
        img.onerror = (err) => {
            reject(err);
        };
        img.src = imageUrl;
    });
}

async function drawPhotoPlaceholder(pdfDoc, pdfPage, x, y, w, h, scale) {
    pdfPage.drawRectangle({
        x: x,
        y: y,
        width: w,
        height: h,
        color: PDFLib.rgb(0.98, 0.98, 0.96),
        borderColor: PDFLib.rgb(0.85, 0.81, 0.75),
        borderWidth: 1
    });
    
    try {
        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
        const fontSize = 6 * scale;
        const text = "Imagem nao informada";
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);
        
        pdfPage.drawText(text, {
            x: x + (w - textWidth) / 2,
            y: y + (h - textHeight) / 2,
            size: fontSize,
            font: font,
            color: PDFLib.rgb(0.35, 0.33, 0.29)
        });
    } catch (err) {
        console.error("Erro ao desenhar placeholder do PDF:", err);
    }
}
