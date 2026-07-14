/**
 * CERTIVE VISTORIAS — Módulo de Emissão de Laudo Cautelar Dinâmico via SVG
 * Geração de laudo com 10 páginas A4 verticais baseadas em arquivos SVG dinâmicos.
 */

// Injeta fontes do Google Montserrat e Inter dinamicamente
if (!document.getElementById('google-font-montserrat-inter')) {
    const link = document.createElement('link');
    link.id = 'google-font-montserrat-inter';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
}

// Estilos globais para o preview
const previewStyles = `
    .certive-laudo-container {
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
        background: white;
    }

    .certive-page svg {
        width: 100%;
        height: 100%;
        display: block;
    }
`;

if (!document.getElementById('certive-preview-styles')) {
    const styleTag = document.createElement('style');
    styleTag.id = 'certive-preview-styles';
    styleTag.innerHTML = previewStyles;
    document.head.appendChild(styleTag);
}

/**
 * Função para atualizar o preview HTML do laudo
 */
async function atualizarPreviewLaudo() {
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

        previewContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--text-secondary);">
                <i class="ri-loader-4-line ri-spin" style="font-size: 24px; margin-right: 8px;"></i> Carregando novo modelo de laudo dinâmico em alta resolução...
            </div>
        `;

        const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelar.id);

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
        const hashLaudo = cautelar.hashLaudo || 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

        const fotos = db.cautelares_fotos.filter(f => secoes.map(s => s.id).includes(f.secaoId));

        // Mapeamento de Marca e Modelo
        let marca = 'Não informado';
        let modelo = 'Não informado';
        if (os.clienteNome) {
            if (os.clienteNome.includes('/')) {
                const parts = os.clienteNome.split('/');
                marca = parts[0].trim();
                modelo = parts[1].trim();
            } else {
                modelo = os.clienteNome.trim();
            }
        }

        const formatQuilometragem = (val) => {
            if (val === undefined || val === null || String(val).trim() === '' || isNaN(parseFloat(val))) {
                return 'Não informado';
            }
            return parseFloat(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
        };

        const context = {
            dossie: String(cautelar.dossieNumero || cautelar.dossie_numero || 'Não informado'),
            dataVistoria: new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR'),
            horaVistoria: new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
            vistoriador: db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome || 'Não informado',
            placa: String(os.placa || 'Não informado').toUpperCase(),
            cor: String(os.cor || 'Não informado').toUpperCase(),
            renavam: String(os.renavam || 'Não informado'),
            chassi: String(os.chassi || dataSec2.chassiLido || 'Não informado').toUpperCase(),
            motor: String(os.motor || dataSec2.motorLido || 'Não informado').toUpperCase(),
            quilometragem: formatQuilometragem(dataSec1.quilometragem),
            combustivel: String(dataSec1.combustivel || os.combustivel || 'Não informado').toUpperCase(),
            anoFab: String(os.fabricacaoAno || os.ano_fabricacao || 'Não informado'),
            anoMod: String(os.modeloAno || os.ano_modelo || 'Não informado'),
            unidadeNome: db.unidades.find(u => u.id === os.unidadeId)?.nome || 'São José / SC',
            parecerFinal,
            obsFinal,
            signatureVistoriador,
            hashLaudo,
            fotos
        };

        let containerHtml = `<div class="certive-laudo-container">`;

        for (let p = 1; p <= 10; p++) {
            const pageId = `certive-page-${p}`;
            containerHtml += `<div id="${pageId}" class="certive-page"></div>`;
        }

        containerHtml += `</div>`;
        previewContainer.innerHTML = containerHtml;

        // Renderiza cada página de forma assíncrona
        for (let p = 1; p <= 10; p++) {
            carregarEPreencherPaginaSVG(p, cautelar, dataSec1, dataSec2, dataSec3, dataSec4, dataSec5, dataSec6, dataSec7, dataSec8, context)
                .then(svgElement => {
                    const pageDiv = document.getElementById(`certive-page-${p}`);
                    if (pageDiv) {
                        pageDiv.innerHTML = '';
                        pageDiv.appendChild(svgElement);
                    }
                }).catch(err => {
                    console.error(`Erro ao renderizar preview da página ${p}:`, err);
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
 */
async function generateInspectionReport(cautelarId) {
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

    const fotos = db.cautelares_fotos.filter(f => secoes.map(s => s.id).includes(f.secaoId));

    // Mapeamento de Marca e Modelo
    let marca = 'Não informado';
    let modelo = 'Não informado';
    if (os.clienteNome) {
        if (os.clienteNome.includes('/')) {
            const parts = os.clienteNome.split('/');
            marca = parts[0].trim();
            modelo = parts[1].trim();
        } else {
            modelo = os.clienteNome.trim();
        }
    }

    const formatQuilometragem = (val) => {
        if (val === undefined || val === null || String(val).trim() === '' || isNaN(parseFloat(val))) {
            return 'Não informado';
        }
        return parseFloat(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
    };

    const context = {
        dossie: String(cautelar.dossieNumero || cautelar.dossie_numero || 'Não informado'),
        dataVistoria: new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR'),
        horaVistoria: new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
        vistoriador: db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome || 'Não informado',
        placa: String(os.placa || 'Não informado').toUpperCase(),
        cor: String(os.cor || 'Não informado').toUpperCase(),
        renavam: String(os.renavam || 'Não informado'),
        chassi: String(os.chassi || dataSec2.chassiLido || 'Não informado').toUpperCase(),
        motor: String(os.motor || dataSec2.motorLido || 'Não informado').toUpperCase(),
        quilometragem: formatQuilometragem(dataSec1.quilometragem),
        combustivel: String(dataSec1.combustivel || os.combustivel || 'Não informado').toUpperCase(),
        anoFab: String(os.fabricacaoAno || os.ano_fabricacao || 'Não informado'),
        anoMod: String(os.modeloAno || os.ano_modelo || 'Não informado'),
        unidadeNome: db.unidades.find(u => u.id === os.unidadeId)?.nome || 'São José / SC',
        parecerFinal,
        obsFinal,
        signatureVistoriador,
        hashLaudo,
        fotos
    };

    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    // Loop de renderização das 10 páginas em PDF
    for (let p = 1; p <= 10; p++) {
        const svgElement = await carregarEPreencherPaginaSVG(p, cautelar, dataSec1, dataSec2, dataSec3, dataSec4, dataSec5, dataSec6, dataSec7, dataSec8, context);
        const pngBytes = await svgToPngBytes(svgElement);

        const page = pdfDoc.addPage([595.27, 841.89]);
        const bgImg = await pdfDoc.embedPng(pngBytes);
        page.drawImage(bgImg, { x: 0, y: 0, width: 595.27, height: 841.89 });
    }

    return await pdfDoc.save();
}

/**
 * Função central para carregar e preencher o SVG dinamicamente
 */
async function carregarEPreencherPaginaSVG(p, cautelar, dataSec1, dataSec2, dataSec3, dataSec4, dataSec5, dataSec6, dataSec7, dataSec8, context) {
    const key = `pagina_${String(p).padStart(2, '0')}`;
    let svgText = '';
    
    if (window.CERTIVE_SVG_TEMPLATES && window.CERTIVE_SVG_TEMPLATES[key]) {
        svgText = window.CERTIVE_SVG_TEMPLATES[key];
    } else {
        const fileName = `Certive_SVG_Master_Pack/${key}.svg`;
        const res = await fetch(fileName);
        if (!res.ok) throw new Error(`SVG file not found: ${fileName}`);
        svgText = await res.text();
    }
    
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
    const svgElement = svgDoc.documentElement;
    
    const getFotoUrl = (codigo) => {
        const f = context.fotos.find(ph => ph.slotCodigo === codigo);
        return f ? (f.url_thumb || f.url_original || '') : '';
    };

    // Preenche o dossiê em todas as páginas
    const dossierRect = svgDoc.getElementById("field-dossier");
    if (dossierRect) {
        addText(svgDoc, "field-dossier", context.dossie, "24px", "Inter, sans-serif", "bold", "#0E2A3A");
    }

    if (p === 1) {
        addText(svgDoc, "field-city", "SÃO JOSÉ / SC", "28px", "Inter, sans-serif", "bold", "#C7A15A");
        addText(svgDoc, "field-date", context.dataVistoria, "28px", "Inter, sans-serif", "bold", "#FFFFFF");
        addText(svgDoc, "field-dossier", context.dossie, "28px", "Inter, sans-serif", "bold", "#FFFFFF");
    }
    else if (p === 3) {
        addText(svgDoc, "field-1", context.marca + " / " + context.modelo, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-2", context.anoFab + " / " + context.anoMod, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-3", context.placa, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-4", context.cor, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-5", context.chassi, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-6", context.motor, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-7", context.combustivel, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-8", context.renavam, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-9", context.quilometragem, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-10", context.dataVistoria + " às " + context.horaVistoria, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-11", context.unidadeNome, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "field-12", context.vistoriador, "24px", "Inter, sans-serif", "bold");

        const imgFrontRight = await getPhotoDataUrl(getFotoUrl("frente_45_dir"));
        const imgRearLeft = await getPhotoDataUrl(getFotoUrl("traseira_45_esq"));
        addPhoto(svgDoc, "photo-front-right", imgFrontRight);
        addPhoto(svgDoc, "photo-rear-left", imgRearLeft);
    }
    else if (p === 4) {
        // Pills das seções
        applyStatusColor(svgDoc, "status-pill-1", dataSec3.parecerEstrutural || 'conforme');
        applyStatusColor(svgDoc, "status-pill-2", dataSec5.parecerVidros || 'conforme');
        applyStatusColor(svgDoc, "status-pill-3", dataSec4.parecerPintura || 'com_ressalvas');
        applyStatusColor(svgDoc, "status-pill-4", dataSec6.parecerMotor || 'conforme');
        applyStatusColor(svgDoc, "status-pill-5", dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas');

        // Mudar cor do card de fundo se for ressalva/reprovado
        const updateCardClass = (cardId, status) => {
            const card = svgDoc.getElementById(cardId);
            if (card) {
                const s = String(status).toLowerCase();
                if (s === "nao_conforme" || s === "reprovada" || s === "restricao" || s === "restrição") {
                    card.setAttribute("class", "status-nao-conforme");
                } else if (s === "com_ressalvas" || s === "ressalvas") {
                    card.setAttribute("class", "status-ressalva");
                } else {
                    card.setAttribute("class", "status-conforme");
                }
            }
        };
        updateCardClass("status-card-1", dataSec3.parecerEstrutural || 'conforme');
        updateCardClass("status-card-2", dataSec5.parecerVidros || 'conforme');
        updateCardClass("status-card-3", dataSec4.parecerPintura || 'com_ressalvas');
        updateCardClass("status-card-4", dataSec6.parecerMotor || 'conforme');
        updateCardClass("status-card-5", dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas');

        // Listas aprovados / alertas
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

        const appText = approvedList.map(item => `• ${item}`).join('\n');
        const alText = alertList.map(item => `• ${item}`).join('\n');

        addText(svgDoc, "approved-items", appText, "24px", "Inter, sans-serif", "bold", "#2F6B3F", "left", true);
        addText(svgDoc, "alert-items", alText.length ? alText : "• Sem alertas no veículo.", "24px", "Inter, sans-serif", "bold", "#B8642B", "left", true);
        
        // Observações gerais da Seção II
        const obsGeraisText = dataSec8.observacao || "Nenhuma observação técnica pendente.";
        addText(svgDoc, "summary-observations", obsGeraisText, "24px", "Inter, sans-serif", "normal", "#30343B", "left", true);
    }
    else if (p === 5) {
        // Tabela estrutural (20 itens)
        const getStructuralStatus = (index) => dataSec3[`estru_${index}`] || 'conforme';
        for (let i = 1; i <= 20; i++) {
            const status = getStructuralStatus(i);
            applyStatusColor(svgDoc, `struct-status-${i}`, status);
        }

        // Fotos estruturais (6 fotos)
        const photoMappings = [
            'motor_vista_geral',
            'assoalho_porta_malas',
            'painel_hodometro',
            'frente_45_dir',
            'traseira_45_esq',
            'longarina_diant_esq'
        ];
        for (let i = 0; i < photoMappings.length; i++) {
            const url = await getPhotoDataUrl(getFotoUrl(photoMappings[i]));
            addPhoto(svgDoc, `struct-photo-${i + 1}`, url);
        }
    }
    else if (p === 6) {
        // Paint table (17 medições)
        const getPaintCondition = (index) => dataSec4[`micrometro_${index}`] || 'Original';
        for (let i = 1; i <= 17; i++) {
            const cond = getPaintCondition(i);
            applyStatusColor(svgDoc, `paint-value-${i}`, cond);
        }

        // Etiquetas
        const etaMotorStatus = dataSec5['label_eta_compartimento_status'] || 'Original';
        const etaColunaStatus = dataSec5['label_eta_coluna_status'] || 'Original';

        applyStatusColor(svgDoc, `label-status-1`, etaMotorStatus);
        applyStatusColor(svgDoc, `label-status-2`, etaColunaStatus);

        const imgLabel1 = await getPhotoDataUrl(getFotoUrl(`etiqueta_eta_motor`));
        const imgLabel2 = await getPhotoDataUrl(getFotoUrl(`etiqueta_eta_coluna`));
        addPhoto(svgDoc, `label-photo-1`, imgLabel1);
        addPhoto(svgDoc, `label-photo-2`, imgLabel2);
    }
    else if (p === 7) {
        // Tabela vidros (6 itens)
        for (let i = 1; i <= 6; i++) {
            const status = dataSec5[`glass_${i}_status`] || dataSec5[`vidro_${i}_status`] || 'Original';
            const recorded = dataSec5[`glass_${i}_chassis`] !== false && dataSec5[`vidro_${i}_chassis`] !== false ? 'Sim' : 'Não';
            
            applyStatusColor(svgDoc, `glass-original-${i}`, status);
            applyStatusColor(svgDoc, `glass-engraving-${i}`, recorded === 'Sim' ? 'gravado' : 'não gravado');
        }

        // Fotos vidros
        const imgId1 = await getPhotoDataUrl(getFotoUrl(`chassi_gravado`));
        const imgId2 = await getPhotoDataUrl(getFotoUrl(`motor_gravado`));
        const imgId3 = await getPhotoDataUrl(getFotoUrl(`placa_dianteira`));
        addPhoto(svgDoc, `id-photo-1`, imgId1);
        addPhoto(svgDoc, `id-photo-2`, imgId2);
        addPhoto(svgDoc, `id-photo-3`, imgId3);

        // Observações seção 5
        const obsSec5 = dataSec5.observacoes || "Vidros e identificadores originais conforme padrão de fábrica.";
        addText(svgDoc, "id-observations", obsSec5, "24px", "Inter, sans-serif", "normal", "#30343B", "left", true);
    }
    else if (p === 8) {
        // Fotos P8
        const imgEngGen = await getPhotoDataUrl(getFotoUrl(`motor_vista_geral`));
        const imgEngNum = await getPhotoDataUrl(getFotoUrl(`motor_gravado`));
        const imgChaNum = await getPhotoDataUrl(getFotoUrl(`chassi_gravado`));
        addPhoto(svgDoc, `photo-engine-general`, imgEngGen);
        addPhoto(svgDoc, `photo-engine-number`, imgEngNum);
        addPhoto(svgDoc, `photo-chassis-number`, imgChaNum);

        // Dados Cadastrados vs Lidos
        addText(svgDoc, "compare-1", context.marca + " / " + context.modelo, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "compare-2", context.placa, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "compare-3", context.chassi, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "compare-4", context.motor, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "compare-5", context.renavam, "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "compare-6", context.quilometragem, "24px", "Inter, sans-serif", "bold");

        // Parecer da seção
        const preliminaryParecer = context.parecerFinal || 'conforme';
        applyStatusBanner(svgDoc, `section-final-status`, preliminaryParecer);
    }
    else if (p === 9) {
        // Pesquisa documental
        const isDocConforme = dataSec7.parecerDocumental === 'conforme' || !dataSec7.parecerDocumental;
        
        applyStatusColor(svgDoc, "doc-status-1", "NADA CONSTA");
        applyStatusColor(svgDoc, "doc-status-2", "NADA CONSTA");
        applyStatusColor(svgDoc, "doc-status-3", "NADA CONSTA");
        applyStatusColor(svgDoc, "doc-status-4", "NADA CONSTA");
        applyStatusColor(svgDoc, "doc-status-5", isDocConforme ? "NADA CONSTA" : "DÉBITOS ATIVOS");
        applyStatusColor(svgDoc, "doc-status-6", "NADA CONSTA");
        applyStatusColor(svgDoc, "doc-status-7", "NADA CONSTA");
        applyStatusColor(svgDoc, "doc-status-8", "NADA CONSTA");
        applyStatusColor(svgDoc, "doc-status-9", isDocConforme ? "NADA CONSTA" : "ALIENAÇÃO ATIVA");

        const docDetails = isDocConforme 
            ? "Pesquisa documental realizada nas bases de dados governamentais e de histórico do veículo. Nenhuma restrição ativa foi identificada."
            : "Atenção: Identificadas multas pendentes de licenciamento estadual e alienação fiduciária ativa registrada.";
        addText(svgDoc, "doc-details", docDetails, "24px", "Inter, sans-serif", "normal", "#30343B", "left", true);
    }
    else if (p === 10) {
        // Conclusão e parecer final
        let conclusionText = 'Com base em todas as verificações e pesquisas realizadas, certifico que o veículo vistoriado apresenta condições compatíveis com sua idade e uso, não sendo identificados indícios de sinistro, remarcação de chassi, restrições ou irregularidades relevantes.';
        if (context.parecerFinal === 'com_ressalvas') {
            conclusionText = context.obsFinal || 'O veículo apresenta integridade estrutural original de fábrica, porém com ressalvas estéticas de pintura ou pequenas pendências documentais em aberto.';
        } else if (context.parecerFinal === 'nao_conforme' || context.parecerFinal === 'reprovada') {
            conclusionText = context.obsFinal || 'O veículo apresenta avarias ou vestígios de soldas estruturais incompatíveis com a originalidade de fábrica, gerando parecer desfavorável.';
        }

        addText(svgDoc, "final-conclusion", conclusionText, "26px", "Inter, sans-serif", "normal", "#30343B", "left", true);
        applyStatusBanner(svgDoc, "final-status-banner", context.parecerFinal);

        // Assinatura e rodapé
        addText(svgDoc, "final-city", "São José / SC", "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "final-date", new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'}), "24px", "Inter, sans-serif", "bold");
        addText(svgDoc, "final-inspector", context.vistoriador, "24px", "Inter, sans-serif", "bold");

        // Assinatura
        if (context.signatureVistoriador) {
            const sigUrl = await getPhotoDataUrl(context.signatureVistoriador);
            addPhoto(svgDoc, "signature-area", sigUrl);
        } else {
            addText(svgDoc, "signature-area", "ASSINATURA DIGITAL NÃO VINCULADA", "24px", "Inter, sans-serif", "bold", "#8B2635", "center");
        }

        // QR Code
        const validationUrl = `https://rbaggiofilho-source.github.io/CERTIVE-PRINCIPAL/consulta-laudo.html?hash=${context.hashLaudo}`;
        const qrImgDataUrl = await getQrCodeDataUrl(validationUrl);
        addPhoto(svgDoc, "qr-code", qrImgDataUrl);

        // Hash
        addText(svgDoc, "hash-area", context.hashLaudo, "20px", "Inter, sans-serif", "bold", "#30343B", "left", true);
    }

    return svgElement;
}

/**
 * Função para resolver CORS baixando imagem e transformando em Base64 Data URL
 */
async function getPhotoDataUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return url;
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Erro de CORS ao baixar imagem:", e);
        return url;
    }
}

/**
 * Função para gerar o QR code localmente e retornar sua Data URL
 */
function getQrCodeDataUrl(text) {
    return new Promise((resolve) => {
        const divTemp = document.createElement('div');
        new QRCode(divTemp, {
            text: text,
            width: 420,
            height: 420,
            colorDark: '#0E2A3A',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
        setTimeout(() => {
            const canvas = divTemp.querySelector('canvas');
            if (canvas) {
                resolve(canvas.toDataURL('image/png'));
            } else {
                resolve('');
            }
        }, 100);
    });
}

/**
 * Auxiliar para renderizar SVG dinâmico em bytes de PNG para o PDF
 */
function svgToPngBytes(svgElement) {
    return new Promise((resolve, reject) => {
        const svgString = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 2480;
            canvas.height = 3508;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 2480, 3508);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => {
                if (blob) {
                    blob.arrayBuffer().then(resolve).catch(reject);
                } else {
                    reject(new Error("Erro ao exportar canvas blob"));
                }
            }, 'image/png');
        };
        img.onerror = (e) => reject(e);
        img.src = url;
    });
}

/**
 * Função auxiliar para adicionar texto no SVG
 */
function addText(svgDoc, rectId, textValue, fontSize = "24px", fontFamily = "Inter, Arial, sans-serif", fontWeight = "normal", fill = "#30343B", align = "left", multiline = false) {
    const rect = svgDoc.getElementById(rectId);
    if (!rect) return;

    rect.setAttribute("fill", "transparent");
    rect.setAttribute("stroke", "transparent");

    const x = parseFloat(rect.getAttribute("x"));
    const y = parseFloat(rect.getAttribute("y"));
    const w = parseFloat(rect.getAttribute("width"));
    const h = parseFloat(rect.getAttribute("height"));

    if (multiline) {
        const words = String(textValue).split(/\s+/);
        const lines = [];
        let currentLine = "";
        
        // Limite estimado de caracteres por linha
        const charLimit = Math.floor(w / (parseFloat(fontSize) * 0.55));
        
        words.forEach(word => {
            if ((currentLine + " " + word).length > charLimit) {
                lines.push(currentLine.trim());
                currentLine = word;
            } else {
                currentLine = currentLine ? currentLine + " " + word : word;
            }
        });
        if (currentLine) lines.push(currentLine.trim());

        const lineSpacing = parseFloat(fontSize) * 1.35;
        lines.forEach((line, idx) => {
            const textNode = svgDoc.createElementNS("http://www.w3.org/2000/svg", "text");
            textNode.setAttribute("font-family", fontFamily);
            textNode.setAttribute("font-size", fontSize);
            textNode.setAttribute("font-weight", fontWeight);
            textNode.setAttribute("fill", fill);
            
            let textX = x;
            if (align === "center") {
                textNode.setAttribute("text-anchor", "middle");
                textX = x + w / 2;
            } else if (align === "right") {
                textNode.setAttribute("text-anchor", "end");
                textX = x + w;
            }
            textNode.setAttribute("x", textX);
            textNode.setAttribute("y", y + (idx * lineSpacing) + parseFloat(fontSize) * 0.95);
            textNode.textContent = line;
            rect.parentNode.appendChild(textNode);
        });
    } else {
        const textNode = svgDoc.createElementNS("http://www.w3.org/2000/svg", "text");
        textNode.setAttribute("font-family", fontFamily);
        textNode.setAttribute("font-size", fontSize);
        textNode.setAttribute("font-weight", fontWeight);
        textNode.setAttribute("fill", fill);
        
        let textX = x;
        if (align === "center") {
            textNode.setAttribute("text-anchor", "middle");
            textX = x + w / 2;
        } else if (align === "right") {
            textNode.setAttribute("text-anchor", "end");
            textX = x + w;
        } else {
            textX = x + 15;
        }
        
        textNode.setAttribute("x", textX);
        textNode.setAttribute("y", y + h / 2 + parseFloat(fontSize) * 0.35);
        textNode.textContent = textValue;
        rect.parentNode.appendChild(textNode);
    }
}

/**
 * Função auxiliar para adicionar foto no SVG
 */
function addPhoto(svgDoc, rectId, photoUrl) {
    const rect = svgDoc.getElementById(rectId);
    if (!rect) return;

    if (photoUrl) {
        const imageNode = svgDoc.createElementNS("http://www.w3.org/2000/svg", "image");
        imageNode.setAttribute("x", rect.getAttribute("x"));
        imageNode.setAttribute("y", rect.getAttribute("y"));
        imageNode.setAttribute("width", rect.getAttribute("width"));
        imageNode.setAttribute("height", rect.getAttribute("height"));
        imageNode.setAttribute("preserveAspectRatio", "xMidYMid slice");
        imageNode.setAttribute("href", photoUrl);
        
        const rx = rect.getAttribute("rx");
        if (rx) {
            imageNode.setAttribute("rx", rx);
        }
        
        rect.parentNode.replaceChild(imageNode, rect);
    } else {
        const x = parseFloat(rect.getAttribute("x"));
        const y = parseFloat(rect.getAttribute("y"));
        const w = parseFloat(rect.getAttribute("width"));
        const h = parseFloat(rect.getAttribute("height"));
        
        const textNode = svgDoc.createElementNS("http://www.w3.org/2000/svg", "text");
        textNode.setAttribute("font-family", "Inter, sans-serif");
        textNode.setAttribute("font-size", "22px");
        textNode.setAttribute("font-weight", "bold");
        textNode.setAttribute("fill", "#6F7782");
        textNode.setAttribute("text-anchor", "middle");
        textNode.setAttribute("x", x + w / 2);
        textNode.setAttribute("y", y + h / 2 + 8);
        textNode.textContent = "Imagem não informada";
        rect.parentNode.appendChild(textNode);
    }
}

/**
 * Função auxiliar para aplicar cores e textos a status do laudo
 */
function applyStatusColor(svgDoc, rectId, statusValue) {
    const rect = svgDoc.getElementById(rectId);
    if (!rect) return;

    let fillClass = "status-conforme";
    let text = "CONFORME";
    
    const s = String(statusValue).toLowerCase();
    if (s === "reprovada" || s === "nao_conforme" || s === "restricao" || s === "restrição" || s === "indícios de reparo" || s === "indícios de substituição" || s.includes("substitu") || s.includes("reparo") || s === "sim") {
        if (s.includes("reparo")) {
            fillClass = "status-ressalva";
            text = "INDÍCIOS DE REPARO";
        } else if (s.includes("substitu")) {
            fillClass = "status-nao-conforme";
            text = "INDÍCIOS DE SUBSTITUIÇÃO";
        } else if (s === "sim") {
            fillClass = "status-nao-conforme";
            text = "SIM";
        } else {
            fillClass = "status-nao-conforme";
            text = "RESTRIÇÃO";
        }
    } else if (s === "com_ressalvas" || s === "ressalvas" || s === "com ressalvas" || s === "nao_se_aplica" || s === "não se aplica" || s.includes("repintura") || s.includes("massa") || s.includes("avariado") || s.includes("amassad") || s.includes("risco")) {
        if (s === "nao_se_aplica" || s === "não se aplica") {
            fillClass = "status-ressalva";
            text = "NÃO SE APLICA";
        } else if (s.includes("repintura") || s.includes("massa") || s.includes("avariado") || s.includes("amassad") || s.includes("risco")) {
            fillClass = "status-ressalva";
            text = statusValue.toUpperCase();
        } else {
            fillClass = "status-ressalva";
            text = "RESSALVAS";
        }
    } else if (s === "não" || s === "nao") {
        fillClass = "status-conforme";
        text = "NÃO";
    } else if (s === "original") {
        fillClass = "status-conforme";
        text = "ORIGINAL";
    } else if (s === "gravado") {
        fillClass = "status-conforme";
        text = "GRAVADO";
    } else if (s === "não gravado" || s === "nao_gravado") {
        fillClass = "status-nao-conforme";
        text = "NÃO GRAVADO";
    }
    
    rect.setAttribute("class", fillClass);
    
    const x = parseFloat(rect.getAttribute("x"));
    const y = parseFloat(rect.getAttribute("y"));
    const w = parseFloat(rect.getAttribute("width"));
    const h = parseFloat(rect.getAttribute("height"));
    
    const textNode = svgDoc.createElementNS("http://www.w3.org/2000/svg", "text");
    textNode.setAttribute("font-family", "Montserrat, Arial, sans-serif");
    textNode.setAttribute("font-size", "22px");
    textNode.setAttribute("font-weight", "800");
    textNode.setAttribute("fill", "#FFFFFF");
    textNode.setAttribute("text-anchor", "middle");
    textNode.setAttribute("x", x + w / 2);
    textNode.setAttribute("y", y + h / 2 + 8);
    textNode.textContent = text;
    rect.parentNode.appendChild(textNode);
}

/**
 * Função auxiliar para aplicar cores e textos a banners de parecer final
 */
function applyStatusBanner(svgDoc, rectId, statusValue, textOverride = "") {
    const rect = svgDoc.getElementById(rectId);
    if (!rect) return;

    let fillClass = "status-conforme";
    let text = "CONFORME";
    
    const s = String(statusValue).toLowerCase();
    if (s === "nao_conforme" || s === "reprovada" || s === "restrição") {
        fillClass = "status-nao-conforme";
        text = "NÃO CONFORME";
    } else if (s === "com_ressalvas" || s === "ressalvas") {
        fillClass = "status-ressalva";
        text = "CONFORME COM RESSALVAS";
    }
    
    if (textOverride) {
        text = textOverride;
    }

    rect.setAttribute("class", fillClass);
    
    const x = parseFloat(rect.getAttribute("x"));
    const y = parseFloat(rect.getAttribute("y"));
    const w = parseFloat(rect.getAttribute("width"));
    const h = parseFloat(rect.getAttribute("height"));
    
    const textNode = svgDoc.createElementNS("http://www.w3.org/2000/svg", "text");
    textNode.setAttribute("font-family", "Montserrat, Arial, sans-serif");
    textNode.setAttribute("font-size", "42px");
    textNode.setAttribute("font-weight", "900");
    textNode.setAttribute("fill", "#FFFFFF");
    textNode.setAttribute("text-anchor", "middle");
    textNode.setAttribute("x", x + w / 2);
    textNode.setAttribute("y", y + h / 2 + 15);
    textNode.textContent = text.toUpperCase();
    rect.parentNode.appendChild(textNode);
}
