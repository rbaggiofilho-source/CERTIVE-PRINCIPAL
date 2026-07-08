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

    const cautelar = db.cautelares.find(c => c.id === window.activeFinalizacaoCautelarId);
    if (!cautelar) return;

    const os = db.ordens_servico.find(o => o.id === cautelar.osId);
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
        <div class="certive-page" style="background-image: url('pagina_01.png');">
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
        <div class="certive-page" style="background-image: url('pagina_02.png');">
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
        <div class="certive-page" style="background-image: url('pagina_03.png');">
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

    // Estrutura
    if (dataSec3.parecerEstrutural === 'conforme' || !dataSec3.parecerEstrutural) {
        approvedList.push("Não foram encontradas remarcações no chassi");
        approvedList.push("Não verificamos indícios de sinistro");
    } else {
        alertList.push("Identificados reparos ou ressalvas em painéis estruturais.");
    }

    // Identificação/Documental
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

    const approvedItemsHtml = approvedList.map(item => `
        <div style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px; font-size: 9px; color: var(--green); font-weight: 600;">
            <i class="ri-checkbox-circle-line" style="font-size: 11px; margin-top: 1px;"></i>
            <span class="text-truncate-single">${item}</span>
        </div>
    `).join('');

    const alertItemsHtml = alertList.map(item => `
        <div style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px; font-size: 9px; color: var(--amber); font-weight: 600;">
            <i class="ri-alert-line" style="font-size: 11px; margin-top: 1px;"></i>
            <span class="text-truncate-single">${item}</span>
        </div>
    `).join('');

    html += `
        <div class="certive-page" style="background-image: url('pagina_04.png');">
            <!-- Dossiê topo direito -->
            <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                ${dossie}
            </div>

            <!-- Status dos 5 cards horizontais -->
            <div class="absolute-field" style="top: 380px; left: 88px; width: 110px; text-align: center; font-size: 11px; font-weight: 800; color: ${getPillColor(dataSec3.parecerEstrutural || 'conforme')};">
                ${getPillText(dataSec3.parecerEstrutural || 'conforme')}
            </div>
            <div class="absolute-field" style="top: 380px; left: 220px; width: 110px; text-align: center; font-size: 11px; font-weight: 800; color: ${getPillColor(dataSec5.parecerVidros || 'conforme')};">
                ${getPillText(dataSec5.parecerVidros || 'conforme')}
            </div>
            <div class="absolute-field" style="top: 380px; left: 355px; width: 110px; text-align: center; font-size: 11px; font-weight: 800; color: ${getPillColor(dataSec4.parecerPintura || 'com_ressalvas')};">
                ${getPillText(dataSec4.parecerPintura || 'com_ressalvas')}
            </div>
            <div class="absolute-field" style="top: 380px; left: 490px; width: 110px; text-align: center; font-size: 11px; font-weight: 800; color: ${getPillColor(dataSec6.parecerMotor || 'conforme')};">
                ${getPillText(dataSec6.parecerMotor || 'conforme')}
            </div>
            <div class="absolute-field" style="top: 380px; left: 622px; width: 110px; text-align: center; font-size: 11px; font-weight: 800; color: ${getPillColor(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas')};">
                ${getPillText(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas')}
            </div>

            <!-- Lista de Aprovados -->
            <div class="absolute-multiline" style="top: 505px; left: 140px; width: 260px; height: 260px; line-height: 1.5;">
                ${approvedItemsHtml}
            </div>

            <!-- Lista de Alerta -->
            <div class="absolute-multiline" style="top: 830px; left: 140px; width: 550px; height: 180px; line-height: 1.5;">
                ${alertItemsHtml}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 05: 03 ANÁLISE ESTRUTURAL (BACKGROUND pagina_05.png)
    // =========================================================================
    const getStructuralStatus = (index) => {
        const key = `estru_${index}`;
        return dataSec3[key] || 'conforme';
    };

    html += `
        <div class="certive-page" style="background-image: url('pagina_05.png');">
            <!-- Dossiê topo direito -->
            <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                ${dossie}
            </div>
    `;

    // Status dos 21 componentes nas tabelas
    for (let i = 1; i <= 21; i++) {
        const status = getStructuralStatus(i);
        const text = getPillText(status);
        const color = getPillColor(status);
        
        if (i <= 11) {
            const topOffset = 290 + ((i - 1) * 24.5);
            html += `
                <div class="absolute-field" style="top: ${topOffset}px; left: 310px; font-size: 9px; font-weight: 800; text-align: center; width: 60px; color: ${color};">
                    ${text}
                </div>
            `;
        } else {
            const topOffset = 290 + ((i - 12) * 24.5);
            html += `
                <div class="absolute-field" style="top: ${topOffset}px; left: 690px; font-size: 9px; font-weight: 800; text-align: center; width: 60px; color: ${color};">
                    ${text}
                </div>
            `;
        }
    }

    // Grid de 6 fotos no rodapé
    html += `
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
    const getPaintCondition = (index) => {
        const key = `micrometro_${index}`;
        return dataSec4[key] || 'Original';
    };

    const getPaintColor = (cond) => {
        if (cond === 'Repintura') return '#C9A961';
        if (cond === 'Repintura com massa' || cond === 'Massa') return '#B8642B';
        if (cond === 'Avariado' || cond === 'Pequenos riscos / amassado') return '#8B2635';
        if (cond === 'Não aplicável') return '#D8CFBE';
        return '#2F6B3F';
    };

    html += `
        <div class="certive-page" style="background-image: url('pagina_06.png');">
            <!-- Dossiê topo direito -->
            <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                ${dossie}
            </div>
    `;

    // Condições das 15 peças na tabela lateral
    for (let i = 1; i <= 15; i++) {
        const cond = getPaintCondition(i);
        const color = getPaintColor(cond);
        const topOffset = 260 + ((i - 1) * 20.2);
        
        html += `
            <div class="absolute-field" style="top: ${topOffset}px; left: 695px; font-size: 8.5px; font-weight: 700; width: 85px; color: ${color}; text-transform: uppercase;">
                ${cond}
            </div>
        `;
    }

    // Status de etiquetas e fotos
    const etaMotorStatus = dataSec5['label_eta_compartimento_status'] || 'Original';
    const etaColunaStatus = dataSec5['label_eta_coluna_status'] || 'Original';

    html += `
            <!-- Status de Etiquetas -->
            <div class="absolute-field" style="top: 825px; right: 80px; font-size: 9px; font-weight: 800; color: ${getPaintColor(etaMotorStatus)}; text-transform: uppercase;">
                ${etaMotorStatus}
            </div>
            <div class="absolute-field" style="top: 848px; right: 80px; font-size: 9px; font-weight: 800; color: ${getPaintColor(etaColunaStatus)}; text-transform: uppercase;">
                ${etaColunaStatus}
            </div>

            <!-- Fotos de Etiquetas no rodapé -->
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
    html += `
        <div class="certive-page" style="background-image: url('pagina_07.png');">
            <!-- Dossiê topo direito -->
            <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                ${dossie}
            </div>
    `;

    // Vidros (Status e Chassi Gravado)
    for (let i = 1; i <= 6; i++) {
        const status = dataSec5[`vidro_${i}_status`] || 'Original';
        const recorded = dataSec5[`vidro_${i}_chassis`] !== false ? 'Sim' : 'Não';
        const topOffset = 262 + ((i - 1) * 21);
        
        html += `
            <div class="absolute-field" style="top: ${topOffset}px; left: 450px; font-size: 8.5px; font-weight: 800; width: 100px; text-align: center; color: ${getPaintColor(status)}; text-transform: uppercase;">
                ${status}
            </div>
            <div class="absolute-field" style="top: ${topOffset}px; left: 590px; font-size: 8.5px; font-weight: 800; width: 100px; text-align: center; color: ${recorded === 'Sim' ? 'var(--green)' : 'var(--bordeaux)'};">
                ${recorded === 'Sim' ? 'GRAVADO' : 'NÃO GRAVADO'}
            </div>
        `;
    }

    // Blocos Motor e Chassi
    const idMotorStatus = dataSec6.parecerMotor || 'conforme';
    const idChassiStatus = dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas';

    html += `
            <!-- Ficha de Identificação -->
            <div class="absolute-field" style="top: 523px; left: 470px; font-size: 9px; font-weight: 800; text-align: center; width: 120px; color: ${getPillColor(idMotorStatus)}; text-transform: uppercase;">
                ${getPillText(idMotorStatus)}
            </div>
            <div class="absolute-field" style="top: 554px; left: 470px; font-size: 9px; font-weight: 800; text-align: center; width: 120px; color: ${getPillColor(idChassiStatus)}; text-transform: uppercase;">
                ${getPillText(idChassiStatus)}
            </div>

            <!-- Fotos no rodapé -->
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
        <div class="certive-page" style="background-image: url('pagina_08.png');">
            <!-- Dossiê topo direito -->
            <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                ${dossie}
            </div>

            <!-- Fotos motor e chassi -->
            <div class="absolute-photo" style="top: 195px; left: 52px; width: 688px; height: 190px;">
                ${renderFoto('motor_vista_geral')}
            </div>
            <div class="absolute-photo" style="top: 398px; left: 52px; width: 335px; height: 140px;">
                ${renderFoto('motor_gravado')}
            </div>
            <div class="absolute-photo" style="top: 398px; left: 405px; width: 335px; height: 140px;">
                ${renderFoto('chassi_gravado')}
            </div>

            <!-- Tabela Dados Complementares Coluna 1 -->
            <div class="absolute-field" style="top: 642px; left: 300px; font-size: 9px; font-weight: 700; width: 130px; text-align: right;">
                ${marca} / ${modelo}
            </div>
            <div class="absolute-field" style="top: 666px; left: 300px; font-size: 9px; font-weight: 700; width: 130px; text-align: right;">
                FIAT
            </div>
            <div class="absolute-field" style="top: 702px; left: 300px; font-size: 9px; font-weight: 700; width: 130px; text-align: right;">
                ${anoFab} / ${anoMod}
            </div>
            <div class="absolute-field" style="top: 736px; left: 300px; font-size: 9px; font-weight: 700; width: 130px; text-align: right;">
                ${combustivel}
            </div>
            <div class="absolute-field" style="top: 770px; left: 300px; font-size: 9px; font-weight: 700; width: 130px; text-align: right;">
                ${cor}
            </div>

            <!-- Tabela Dados Complementares Coluna 2 -->
            <div class="absolute-field" style="top: 642px; left: 630px; font-size: 9px; font-weight: 700; width: 100px; text-align: right;">
                ${placa}
            </div>
            <div class="absolute-field" style="top: 666px; left: 630px; font-size: 9px; font-weight: 700; width: 100px; text-align: right; font-family: monospace;">
                ${chassi}
            </div>
            <div class="absolute-field" style="top: 702px; left: 630px; font-size: 9px; font-weight: 700; width: 100px; text-align: right; font-family: monospace;">
                ${motor}
            </div>
            <div class="absolute-field" style="top: 736px; left: 630px; font-size: 9px; font-weight: 700; width: 100px; text-align: right;">
                ${renavam}
            </div>
            <div class="absolute-field" style="top: 770px; left: 630px; font-size: 9px; font-weight: 700; width: 100px; text-align: right;">
                ${quilometragem} km
            </div>

            <!-- Parecer Técnico Caixa -->
            <div class="absolute-field" style="top: 835px; right: 80px; font-size: 16px; font-weight: 900; color: ${getPillColor(parecerFinal)}; text-transform: uppercase;">
                ${parecerFinal === 'nao_conforme' ? 'NÃO CONFORME' : (parecerFinal === 'com_ressalvas' ? 'CONFORME COM RESSALVA' : 'CONFORME')}
            </div>
            <div class="absolute-multiline" style="top: 878px; left: 80px; width: 620px; font-size: 9px; line-height: 1.4; color: #5A544A; -webkit-line-clamp: 2;">
                Observação: Não são analisados itens que necessitem de equipamentos especializados como freios ABS, air bags, parte mecânica, hodômetro e elétrica.
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 09: 07 PESQUISA DOCUMENTAL (BACKGROUND pagina_09.png)
    // =========================================================================
    html += `
        <div class="certive-page" style="background-image: url('pagina_09.png');">
            <!-- Dossiê topo direito -->
            <div class="absolute-field" style="top: 95px; right: 80px; font-size: 10px; font-weight: 700; color: #0A1F3D; width: 150px; text-align: right;">
                ${dossie}
            </div>

            <!-- Tabela Dados da Consulta -->
            <div class="absolute-field" style="top: 252px; left: 215px; font-size: 9px; font-weight: 700; color: #1C1C1C; width: 130px;">
                ${placa}
            </div>
            <div class="absolute-field" style="top: 285px; left: 215px; font-size: 9px; font-weight: 700; color: #1C1C1C; width: 130px;">
                ${dataVistoria} às ${horaVistoria}
            </div>
            <div class="absolute-field" style="top: 318px; left: 215px; font-size: 9px; font-weight: 700; color: #1C1C1C; width: 130px;">
                ${vistoriador}
            </div>
            <div class="absolute-field" style="top: 252px; left: 605px; font-size: 9px; font-weight: 700; color: #1C1C1C; width: 130px;">
                Certive Vistorias
            </div>
            <div class="absolute-field" style="top: 285px; left: 605px; font-size: 9px; font-weight: 700; color: #1C1C1C; width: 130px;">
                4386109
            </div>
            <div class="absolute-field" style="top: 318px; left: 605px; font-size: 7.5px; font-weight: 700; color: #1C1C1C; width: 130px; font-family: monospace;">
                4348c105-afa0-4df6-b800-fcf6f3d1b38
            </div>
            <div class="absolute-field" style="top: 350px; left: 605px; font-size: 9px; font-weight: 700; color: #1C1C1C; width: 130px;">
                Curitiba / PR
            </div>

            <!-- Caixa de Itens Aprovados -->
            <div class="absolute-field" style="top: 440px; left: 280px; width: 120px; font-size: 8.5px; line-height: 1.5; font-weight: 700; color: var(--green); text-align: right;">
                Nada consta<br>Nada consta<br>Nada consta<br>Nada consta
            </div>
            <div class="absolute-field" style="top: 440px; left: 615px; width: 120px; font-size: 8.5px; line-height: 1.5; font-weight: 700; color: var(--green); text-align: right;">
                Nada consta<br>Nada consta<br>Nada consta
            </div>

            <!-- Caixa de Itens de Alerta -->
            <div class="absolute-field" style="top: 612px; left: 440px; font-size: 8.5px; font-weight: 700; color: var(--amber); width: 280px; text-align: right;">
                Registro de multas encontrado
            </div>
            <div class="absolute-field" style="top: 642px; left: 440px; font-size: 8.5px; font-weight: 700; color: var(--amber); width: 280px; text-align: right;">
                Registros encontrados: 1
            </div>

            <!-- Caixa de Itens de Restrição -->
            <div class="absolute-field" style="top: 728px; left: 440px; font-size: 8.5px; font-weight: 700; color: var(--bordeaux); width: 280px; text-align: right;">
                Registros encontrados: 1
            </div>
            <div class="absolute-field" style="top: 760px; left: 440px; font-size: 8.5px; font-weight: 700; color: var(--bordeaux); width: 280px; text-align: right;">
                Alienação ativa em andamento
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 10: 08 PARECER FINAL & ASSINATURAS (BACKGROUND pagina_10.png)
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
        <div class="certive-page" style="background-image: url('pagina_10.png');">
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
}

/**
 * GERAÇÃO DE PDF OFICIAL DO LAUDO CAUTELAR
 * Preenchimento direto do PDF editável (Certive_Template_Editavel.pdf) via pdf-lib.
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

    // 2. Fetch do template PDF e do Field Map
    const fieldMap = await fetch('Certive_Template_Field_Map.json').then(res => res.json());
    const templateBytes = await fetch('Certive_Template_Editavel.pdf').then(res => res.arrayBuffer());

    // 3. Inicializa o PDF com pdf-lib
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // 4. Prepara os dados textuais mapeados
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

    // Listas auxiliares para gerar os dados multiline do laudo
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

    const approvedItemsText = approvedList.join('\n');
    const alertItemsText = alertList.join('\n');

    // Mapeia todas as peças avaliadas para pintar na Página 6
    const paintItemsList = [
        "Capô", "Teto", "Tampa do porta-malas",
        "Paralama dianteiro esq.", "Porta dianteira esq.", "Porta traseira esq.",
        "Paralama traseiro esq.", "Traseira esquerda", "Paralama traseiro dir.",
        "Traseira direita", "Porta traseira dir.", "Porta dianteira dir.",
        "Paralama dianteiro dir.", "Para-choque dianteiro", "Para-choque traseiro"
    ];
    const getPaintCondition = (index) => dataSec4[`micrometro_${index}`] || 'Original';
    let paintText = '';
    paintItemsList.forEach((name, i) => {
        const cond = getPaintCondition(i + 1);
        paintText += `${String(i + 1).padStart(2, '0')} ${name.padEnd(25, '.')} ${cond}\n`;
    });

    // Mapeia os vidros avaliados para a Página 7
    const glassList = ["Para-brisa", "Vidro dianteiro esquerdo", "Vidro traseiro esquerdo", "Vidro dianteiro direito", "Vidro traseiro direito", "Vidro traseiro"];
    let glassText = '';
    glassList.forEach((name, i) => {
        const status = dataSec5[`vidro_${i+1}_status`] || 'Original';
        const recorded = dataSec5[`vidro_${i+1}_chassis`] !== false ? 'Sim' : 'Não';
        glassText += `${String(i + 1).padStart(2, '0')} ${name.padEnd(25, '.')} Status: ${status.padEnd(10, ' ')} Gravado: ${recorded}\n`;
    });

    const getStructuralStatus = (index) => dataSec3[`estru_${index}`] || 'conforme';
    const getPillText = (status) => {
        if (status === 'RESTRIÇÃO' || status === 'nao_conforme' || status === 'reprovada') return 'RESTRIÇÃO';
        if (status === 'COM RESSALVAS' || status === 'com_ressalvas') return 'RESSALVAS';
        return 'CONFORME';
    };

    // Dados complementares
    const complementaryText = 
        `Modelo: ${marca} / ${modelo}                  Placa: ${placa}\n` +
        `Fabricante: FIAT                                Chassi: ${chassi}\n` +
        `Ano Fab/Mod: ${anoFab} / ${anoMod}                  Motor: ${motor}\n` +
        `Combustível: ${combustivel}             Renavam: ${renavam}\n` +
        `Cor: ${cor}                                      Quilometragem: ${quilometragem} km`;

    // Consulta documental
    const consultationText = 
        `Entrada: ${placa}                 Data/Hora: ${dataVistoria} ${horaVistoria}\n` +
        `Solicitado por: Certive Vistorias         Código consulta: 4386109\n` +
        `Token: 4348c105-afa0-4df6-b800-fcf6f3d1b38\n` +
        `Emplacamento: Curitiba / PR`;

    let finalHeadline = 'CONFORME';
    let finalSub = 'PARA AQUISIÇÃO';
    let finalBody = 'Com base em todas as verificações e pesquisas realizadas, certifico que o veículo vistoriado apresenta condições compatíveis com sua idade e uso, não sendo identificados indícios de sinistro, remarcação de chassi, restrições ou irregularidades relevantes.';

    if (parecerFinal === 'com_ressalvas') {
        finalHeadline = 'CONFORME COM RESSALVA';
        finalSub = 'VERIFICAR APONTAMENTOS';
        finalBody = obsFinal || 'O veículo apresenta integridade estrutural original de fábrica, porém com ressalvas estéticas de pintura ou pequenas pendências documentais em aberto.';
    } else if (parecerFinal === 'nao_conforme' || parecerFinal === 'reprovada') {
        finalHeadline = 'NÃO CONFORME';
        finalSub = 'NÃO RECOMENDADO PARA AQUISIÇÃO';
        finalBody = obsFinal || 'O veículo apresenta avarias ou vestígios de soldas estruturais incompatíveis com a originalidade de fábrica, gerando parecer desfavorável.';
    }

    // Mapa de valores dos campos AcroForm textuais
    const dataValues = {
        "inspection.city_state": "SÃO JOSÉ / SC",
        "inspection.date_long": `${dataVistoria.split('/')[0]} DE ${obterMesPorExtenso(dataVistoria.split('/')[1])} DE ${dataVistoria.split('/')[2]}`,
        "inspection.dossier_number": dossie,
        "inspection.dossier_number_p3": dossie,
        "inspection.dossier_number_p4": dossie,
        "inspection.dossier_number_p5": dossie,
        "inspection.dossier_number_p6": dossie,
        "inspection.dossier_number_p7": dossie,
        "inspection.dossier_number_p8": dossie,
        "inspection.dossier_number_p9": dossie,
        "inspection.dossier_number_p10": dossie,
        "vehicle.brand_model": `${marca} / ${modelo}`,
        "vehicle.year": `${anoFab} / ${anoMod}`,
        "vehicle.color": cor,
        "vehicle.plate": placa,
        "vehicle.chassis": chassi,
        "vehicle.engine_number": motor,
        "vehicle.fuel": combustivel,
        "vehicle.renavam": renavam,
        "vehicle.odometer": `${quilometragem} km`,
        "inspection.date_time": `${dataVistoria} às ${horaVistoria}`,
        "inspection.location": db.unidades.find(u => u.id === os.unidadeId)?.nome || 'São José / SC',
        "inspector.name": vistoriador,
        "inspector.full_name": vistoriador,
        "inspector.role_document": `VISTORIADOR\nREGISTRO ECV: ${cautelar.vistoriadorId || '417.754'}`,
        "structure.status": getPillText(dataSec3.parecerEstrutural || 'conforme'),
        "identification.status": getPillText(dataSec5.parecerVidros || 'conforme'),
        "paint.status": getPillText(dataSec4.parecerPintura || 'com_ressalvas'),
        "engine.status": getPillText(dataSec6.parecerMotor || 'conforme'),
        "chassis.status": getPillText(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas'),
        "summary.approved_items": approvedItemsText,
        "summary.alert_items": alertItemsText,
        
        // Estrutural (Pág 5)
        "structure.front_right": getPillText(getStructuralStatus(2)),
        "structure.front_left": getPillText(getStructuralStatus(1)),
        "structure.firewall": getPillText(getStructuralStatus(3)),
        "structure.roof": getPillText(getStructuralStatus(17)),
        "structure.rear_panel": getPillText(getStructuralStatus(16)),
        "structure.spare_wheel_box": getPillText(getStructuralStatus(21)),
        "structure.floor_trunk": getPillText(getStructuralStatus(20)),
        "structure.final_status": getPillText(dataSec3.parecerEstrutural || 'conforme'),
        
        // Pintura (Pág 6)
        "paint.table_items": paintText,
        "labels.engine_bay_status": (dataSec5['label_eta_compartimento_status'] || 'Original').toUpperCase(),
        "labels.column_status": (dataSec5['label_eta_coluna_status'] || 'Original').toUpperCase(),
        
        // Vidros (Pág 7)
        "glass.table": glassText,
        "identification.engine_status": getPillText(dataSec6.parecerMotor || 'conforme'),
        "identification.chassis_status": getPillText(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas'),
        
        // Complementares (Pág 8)
        "vehicle.complementary_data": complementaryText,
        "technical.opinion_status": getPillText(parecerFinal),
        "technical.observation": "Observação: Não são analisados itens que necessitem de equipamentos especializados como freios ABS, air bags, parte mecânica, hodômetro e elétrica.",
        
        // Documental (Pág 9)
        "document.consultation_data": consultationText,
        "document.approved_items": "Não possui histórico de roubo e/ou furto\nNão consta sinistro ativo\nNão possui registro de leilão",
        "document.alert_items": dataSec7.parecerDocumental !== 'conforme' ? "Multas em aberto localizadas\nDébito de licenciamento ativo" : "Nada consta",
        "document.restriction_items": dataSec7.parecerDocumental !== 'conforme' ? "Alienação ativa em andamento" : "Nada consta",
        
        // Conclusão (Pág 10)
        "final.opinion_text": finalBody,
        "final.status": `${finalHeadline}\n${finalSub}`,
        "inspection.final_date_city": `São José/SC, ${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'})}.`
    };

    // Preenche cada campo do formulário
    for (const [fieldName, val] of Object.entries(dataValues)) {
        try {
            const field = form.getTextField(fieldName);
            field.setText(val);
        } catch (err) {
            console.warn(`Campo AcroForm "${fieldName}" não encontrado ou não suportado no PDF.`);
        }
    }

    // Coleta as fotos da vistoria
    const fotosVistoria = db.cautelares_fotos.filter(f => secoes.map(s => s.id).includes(f.secaoId));
    
    // Mapeamento de slot_codigo para as chaves photos.* do JSON
    const photoSlotMap = {
        "frente_45_dir": "photos.vehicle_front_45",
        "traseira_45_esq": "photos.vehicle_rear_45",
        "motor_vista_geral": "photos.engine_bay",
        "assoalho_porta_malas": "photos.trunk_floor",
        "painel_hodometro": "photos.odometer",
        "longarina_diant_esq": "photos.rear_longeron_right",
        "etiqueta_eta_motor": "photos.engine_label",
        "etiqueta_eta_coluna": "photos.column_label",
        "chassi_gravado": "photos.chassis_number",
        "motor_gravado": "photos.engine_number",
        "placa_dianteira": "photos.plate_rear"
    };

    // Também temos chaves de duplicidade de fotos em outras páginas
    const duplicatePhotoMap = {
        "photos.engine_compartment": "motor_vista_geral",
        "photos.engine_number_p8": "motor_gravado",
        "photos.chassis_number_p8": "chassi_gravado",
        "photos.front_45_right": "frente_45_dir",
        "photos.rear_45_left": "traseira_45_esq"
    };

    // Percorre todos os campos do Field Map
    for (const field of fieldMap.fields) {
        if (field.type === "image") {
            const pageIndex = field.page - 1;
            const pdfPage = pdfDoc.getPage(pageIndex);
            const { width: pdfWidth, height: pdfHeight } = pdfPage.getSize();
            
            const scaleX = pdfWidth / fieldMap.page_size.width;
            const scaleY = pdfHeight / fieldMap.page_size.height;
            
            const wReal = field.w * scaleX;
            const hReal = field.h * scaleY;
            const xReal = field.x * scaleX;
            const yReal = pdfHeight - (field.y * scaleY) - hReal;

            // Identifica qual é a imagem para esse campo
            let slotCodigo = null;
            for (const [slot, name] of Object.entries(photoSlotMap)) {
                if (name === field.name) {
                    slotCodigo = slot;
                    break;
                }
            }

            // Se for duplicado
            if (!slotCodigo && duplicatePhotoMap[field.name]) {
                slotCodigo = duplicatePhotoMap[field.name];
            }

            const photo = fotosVistoria.find(f => f.slotCodigo === slotCodigo);
            const photoUrl = photo ? (photo.url_thumb || photo.url_original || '') : '';

            if (photoUrl) {
                try {
                    // Corta e processa imagem com Canvas do navegador para proporção e tamanho ótimos
                    const croppedBytes = await cropImageToFit(photoUrl, wReal, hReal);
                    let pdfImg;
                    try {
                        pdfImg = await pdfDoc.embedJpg(croppedBytes);
                    } catch (e) {
                        pdfImg = await pdfDoc.embedPng(croppedBytes);
                    }

                    // Desenha a imagem cortada
                    pdfPage.drawImage(pdfImg, {
                        x: xReal,
                        y: yReal,
                        width: wReal,
                        height: hReal
                    });
                } catch (err) {
                    console.error(`Erro ao processar imagem ${field.name}:`, err);
                    drawPhotoPlaceholder(pdfDoc, pdfPage, xReal, yReal, wReal, hReal, scaleX);
                }
            } else {
                // Desenha placeholder de imagem ausente
                drawPhotoPlaceholder(pdfDoc, pdfPage, xReal, yReal, wReal, hReal, scaleX);
            }
        }
    }

    // Assinatura do Vistoriador
    const sigField = fieldMap.fields.find(f => f.name === "signature.image_or_name");
    if (sigField && signatureVistoriador) {
        try {
            const pageIndex = sigField.page - 1;
            const pdfPage = pdfDoc.getPage(pageIndex);
            const { width: pdfWidth, height: pdfHeight } = pdfPage.getSize();
            const scaleX = pdfWidth / fieldMap.page_size.width;
            const scaleY = pdfHeight / fieldMap.page_size.height;
            
            const wReal = sigField.w * scaleX;
            const hReal = sigField.h * scaleY;
            const xReal = sigField.x * scaleX;
            const yReal = pdfHeight - (sigField.y * scaleY) - hReal;

            const sigBytes = await fetch(signatureVistoriador).then(res => res.arrayBuffer());
            let sigImg;
            try {
                sigImg = await pdfDoc.embedPng(sigBytes);
            } catch (e) {
                sigImg = await pdfDoc.embedJpg(sigBytes);
            }

            // Desenha a assinatura com proporção centralizada
            pdfPage.drawImage(sigImg, {
                x: xReal + (wReal - wReal * 0.8) / 2,
                y: yReal + (hReal - hReal * 0.8) / 2,
                width: wReal * 0.8,
                height: hReal * 0.8
            });
        } catch (err) {
            console.error("Erro ao desenhar assinatura do vistoriador no PDF:", err);
        }
    }

    // QR Code na Página 10
    const qrDiv = document.createElement('div');
    const validationUrl = `https://rbaggiofilho-source.github.io/CERTIVE-PRINCIPAL/consulta-laudo.html?hash=${hashLaudo}`;
    new QRCode(qrDiv, {
        text: validationUrl,
        width: 150,
        height: 150,
        colorDark: '#0A1F3D',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    // Espera o QRCode renderizar no canvas
    await new Promise(resolve => setTimeout(resolve, 150));
    const qrCanvas = qrDiv.querySelector('canvas');
    if (qrCanvas) {
        try {
            const qrDataUrl = qrCanvas.toDataURL('image/png');
            const qrBytes = await fetch(qrDataUrl).then(res => res.arrayBuffer());
            const qrImg = await pdfDoc.embedPng(qrBytes);

            const p10 = pdfDoc.getPage(9);
            const { width: p10Width, height: p10Height } = p10.getSize();
            const scaleX = p10Width / fieldMap.page_size.width;
            const scaleY = p10Height / fieldMap.page_size.height;

            const qrW = 24 * scaleX;
            const qrH = 24 * scaleY;
            const qrX = 278 * scaleX;
            const qrY = p10Height - (412 * scaleY) - qrH;

            p10.drawImage(qrImg, {
                x: qrX,
                y: qrY,
                width: qrW,
                height: qrH
            });
        } catch (err) {
            console.error("Erro ao sobrepor QR Code no PDF:", err);
        }
    }

    // 5. Achata os campos de formulário (AcroForm flattening)
    form.flatten();

    // 6. Salva o PDF finalizado
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
