/**
 * CERTIVE VISTORIAS — Módulo de Emissão de Laudo Cautelar
 * Geração de PDF com 10 páginas A4 verticais de altíssima fidelidade ao modelo oficial.
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
    const signatureOperador = sessionStorage.getItem('certive_operator_signature') || '';

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
            <div class="no-photo" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; background: var(--paper-warm); color: var(--ink-muted); text-align: center; box-sizing: border-box; border: 1px dashed var(--rule);">
                <i class="ri-image-line" style="font-size: 16px; color: var(--rule); margin-bottom: 2px;"></i>
                <span style="font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">Imagem não informada</span>
            </div>
        `;
    };

    const hashLaudo = cautelar.hashLaudo || 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

    // Definição das variáveis de estilo do laudo
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
            color: var(--ink);
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
            background: var(--paper);
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            page-break-after: always;
            padding: 40px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-shadow: 0 4px 15px rgba(0,0,0,0.12);
        }

        .certive-page-inner {
            border: 1px solid var(--rule);
            height: 100%;
            width: 100%;
            padding: 24px;
            box-sizing: border-box;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        /* Molduras decorativas douradas finas nos cantos da página interna */
        .corner-decor {
            position: absolute;
            width: 10px;
            height: 10px;
            border: 1.5px solid var(--gold);
            box-sizing: border-box;
        }
        .corner-tl { top: 8px; left: 8px; border-right: none; border-bottom: none; }
        .corner-tr { top: 8px; right: 8px; border-left: none; border-bottom: none; }
        .corner-bl { bottom: 8px; left: 8px; border-right: none; border-top: none; }
        .corner-br { bottom: 8px; right: 8px; border-left: none; border-top: none; }

        /* Header Interno */
        .internal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1.5px solid var(--rule);
            padding-bottom: 12px;
            margin-bottom: 15px;
            height: 35px;
        }
        .internal-header .brand {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .internal-header .brand-logo {
            width: 24px;
            height: 24px;
            border: 1.5px solid var(--gold);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 900;
            color: var(--gold);
            font-size: 13px;
        }
        .internal-header .brand-text {
            font-size: 12px;
            font-weight: 800;
            color: var(--navy);
            text-transform: uppercase;
            letter-spacing: 0.8px;
        }
        .internal-header .brand-sub {
            font-size: 7.5px;
            color: var(--ink-muted);
            font-weight: 600;
            text-transform: uppercase;
            margin-left: 6px;
            letter-spacing: 0.5px;
        }
        .internal-header .dossier-box {
            text-align: right;
        }
        .internal-header .dossier-label {
            font-size: 7.5px;
            color: var(--ink-muted);
            font-weight: 700;
            letter-spacing: 0.5px;
        }
        .internal-header .dossier-code {
            font-size: 10px;
            font-weight: 700;
            color: var(--navy);
            letter-spacing: 0.5px;
        }

        /* Rodapé Interno */
        .internal-footer {
            border-top: 1px solid var(--rule);
            padding-top: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8px;
            color: var(--ink-muted);
            font-weight: 600;
            letter-spacing: 0.5px;
            height: 20px;
        }
        .internal-footer .footer-page {
            color: var(--gold);
            font-weight: 700;
            font-size: 9px;
        }

        /* Seção Título Fichas */
        .section-header {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 20px;
            height: 45px;
        }
        .section-number {
            font-size: 26px;
            font-weight: 900;
            color: var(--gold);
            line-height: 1;
        }
        .section-title {
            font-size: 14px;
            font-weight: 800;
            color: var(--navy);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0;
            line-height: 1.2;
        }

        /* Tabelas Técnicas */
        .tech-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
            margin-bottom: 12px;
            table-layout: fixed;
        }
        .tech-table th {
            text-align: left;
            background: var(--navy);
            color: white;
            padding: 6px 8px;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 8px;
            letter-spacing: 0.5px;
            border: 1px solid var(--navy-soft);
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
        .tech-table td {
            padding: 5px 8px;
            border: 1px solid var(--rule);
            font-weight: 500;
            color: var(--ink);
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
        .tech-table tr:nth-child(even) td {
            background: var(--paper-warm);
        }

        /* Badges de Status de Itens */
        .status-pill {
            font-size: 7.5px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 2px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            display: inline-block;
        }
        .pill-conforme {
            background: rgba(47, 107, 63, 0.1);
            color: var(--green);
            border: 1px solid rgba(47, 107, 63, 0.2);
        }
        .pill-ressalva {
            background: rgba(184, 100, 43, 0.1);
            color: var(--amber);
            border: 1px solid rgba(184, 100, 43, 0.2);
        }
        .pill-restricao {
            background: rgba(139, 38, 53, 0.1);
            color: var(--bordeaux);
            border: 1px solid rgba(139, 38, 53, 0.2);
        }

        /* Cards de Categoria */
        .module-card {
            background: white;
            border: 1px solid var(--rule);
            border-radius: 4px;
            padding: 10px 14px;
            display: flex;
            align-items: center;
            gap: 12px;
            height: 52px;
            box-sizing: border-box;
        }
        .module-indicator {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
        }

        /* Molduras de Fotos */
        .photo-frame {
            border: 1px solid var(--rule);
            border-radius: 4px;
            background: var(--paper-warm);
            overflow: hidden;
            position: relative;
        }
        .photo-frame img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .photo-label {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(6, 20, 40, 0.75);
            color: white;
            font-size: 7px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 3px 6px;
            box-sizing: border-box;
            letter-spacing: 0.3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Classes de Truncagem para Segurar Estabilidade da Ficha */
        .text-truncate-single {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
            max-width: 100%;
        }

        .text-truncate-multi {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            word-wrap: break-word;
        }
    </style>
    <div class="certive-laudo-container">
    `;

    // =========================================================================
    // PAGINA 01: CAPA DO LAUDO (NAVY ESCURO COMPLETO)
    // =========================================================================
    html += `
        <div class="certive-page" style="background: var(--navy-deep); color: white; padding: 40px;">
            <div class="certive-page-inner" style="border-color: rgba(201, 169, 97, 0.3); justify-content: space-between; padding: 35px;">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <!-- Logo & Brand -->
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 36px; height: 36px; border: 2px solid var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; color: var(--gold); font-size: 18px;">C</div>
                        <div>
                            <h2 style="font-size: 16px; font-weight: 900; color: white; letter-spacing: 1.5px; margin: 0; text-transform: uppercase;">CERTIVE</h2>
                            <span style="font-size: 8px; font-weight: 600; color: var(--gold); letter-spacing: 1px; text-transform: uppercase; display: block; margin-top: 1px;">VISTORIAS CAUTELARES</span>
                        </div>
                    </div>
                </div>

                <!-- Título Central -->
                <div style="margin: 30px 0;">
                    <h1 style="font-size: 46px; font-weight: 800; color: white; letter-spacing: 0.5px; margin: 0 0 8px 0; text-transform: uppercase; line-height: 1.15;">LAUDO<br>CAUTELAR</h1>
                    <div style="font-size: 15px; font-weight: 700; color: var(--gold); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 24px;">de aquisição veicular</div>
                    <div style="height: 1.5px; width: 45px; background: var(--gold); margin-bottom: 24px;"></div>
                    <p style="font-size: 10px; color: rgba(255,255,255,0.55); font-weight: 500; text-transform: uppercase; letter-spacing: 1.5px; margin: 0; line-height: 1.6;">Análise físico-estrutural<br>e pesquisa documental</p>
                </div>

                <!-- Selo de Autenticidade Dourado no Centro Inferior -->
                <div style="display: flex; justify-content: center; margin: 20px 0;">
                    <div style="width: 120px; height: 120px; border: 1px dashed rgba(201, 169, 97, 0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <div style="width: 104px; height: 104px; border: 1.5px solid var(--gold); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.02);">
                            <span style="font-size: 20px; font-weight: 900; color: var(--gold); line-height: 1;">C</span>
                            <span style="font-size: 6px; font-weight: 800; color: var(--gold); letter-spacing: 1px; text-transform: uppercase; margin-top: 3px;">CERTIVE</span>
                            <span style="font-size: 5px; font-weight: 600; color: rgba(255,255,255,0.4); letter-spacing: 0.5px; text-transform: uppercase; margin-top: 1px;">OFICIAL</span>
                        </div>
                    </div>
                </div>

                <!-- Rodapé Capa -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 20px; font-size: 10px; color: rgba(255,255,255,0.7);">
                    <div>
                        <strong style="color: var(--gold); text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">São José / SC</strong><br>
                        <span style="font-size: 9px; color: rgba(255,255,255,0.5);">${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div style="text-align: right;">
                        <strong style="color: var(--gold); font-size: 10px; letter-spacing: 0.5px;">DOSSIÊ:</strong> <span style="font-family: monospace; font-size: 9.5px; font-weight: 700;">${cautelar.dossieNumero || cautelar.dossie_numero}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 02: SUMÁRIO
    // =========================================================================
    html += `
        <div class="certive-page">
            <div class="certive-page-inner">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px;">
                        <span class="section-number">02</span>
                        <h3 class="section-title">Sumário<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Conteúdo do Laudo</span></h3>
                    </div>

                    <!-- Lista de Itens do Sumário (Decimal 01 a 08 e Páginas 03 a 10) -->
                    <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 30px; font-size: 11px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-weight: 700; color: var(--navy);">
                            <span>01 IDENTIFICAÇÃO DO VEÍCULO</span>
                            <div style="flex: 1; border-bottom: 1.5px dotted var(--rule); margin: 0 10px; position: relative; bottom: 3px;"></div>
                            <span style="color: var(--gold);">03</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-weight: 700; color: var(--navy);">
                            <span>02 RESUMO DA ANÁLISE</span>
                            <div style="flex: 1; border-bottom: 1.5px dotted var(--rule); margin: 0 10px; position: relative; bottom: 3px;"></div>
                            <span style="color: var(--gold);">04</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-weight: 700; color: var(--navy);">
                            <span>03 ANÁLISE ESTRUTURAL</span>
                            <div style="flex: 1; border-bottom: 1.5px dotted var(--rule); margin: 0 10px; position: relative; bottom: 3px;"></div>
                            <span style="color: var(--gold);">05</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-weight: 700; color: var(--navy);">
                            <span>04 PINTURA E ACABAMENTO</span>
                            <div style="flex: 1; border-bottom: 1.5px dotted var(--rule); margin: 0 10px; position: relative; bottom: 3px;"></div>
                            <span style="color: var(--gold);">06</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-weight: 700; color: var(--navy);">
                            <span>05 IDENTIFICAÇÃO E VIDROS</span>
                            <div style="flex: 1; border-bottom: 1.5px dotted var(--rule); margin: 0 10px; position: relative; bottom: 3px;"></div>
                            <span style="color: var(--gold);">07</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-weight: 700; color: var(--navy);">
                            <span>06 MOTOR E CHASSI</span>
                            <div style="flex: 1; border-bottom: 1.5px dotted var(--rule); margin: 0 10px; position: relative; bottom: 3px;"></div>
                            <span style="color: var(--gold);">08</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-weight: 700; color: var(--navy);">
                            <span>07 PESQUISA DOCUMENTAL</span>
                            <div style="flex: 1; border-bottom: 1.5px dotted var(--rule); margin: 0 10px; position: relative; bottom: 3px;"></div>
                            <span style="color: var(--gold);">09</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; font-weight: 700; color: var(--navy);">
                            <span>08 PARECER FINAL</span>
                            <div style="flex: 1; border-bottom: 1.5px dotted var(--rule); margin: 0 10px; position: relative; bottom: 3px;"></div>
                            <span style="color: var(--gold);">10</span>
                        </div>
                    </div>
                </div>

                ${getFooterStyle(2)}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 03: 01 IDENTIFICAÇÃO DO VEÍCULO (FICHA COM DUAS FOTOS LATERAIS)
    // =========================================================================
    // Garante que o texto de Marca/Modelo e proprietário caibam sem estourar as tabelas
    let veiculoMarcaModelo = os.clienteNome || '';
    if (os.servicoNome && os.servicoNome.includes('—')) {
        // Se a OS tiver serviço e o clienteNome for na verdade o nome do proprietário
        veiculoMarcaModelo = os.observacoes || 'FIAT / TORO FREEDOM AT';
    }

    html += `
        <div class="certive-page">
            <div class="certive-page-inner">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px;">
                        <span class="section-number">03</span>
                        <h3 class="section-title">Identificação do Veículo<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Ficha Técnica de Vistoria</span></h3>
                    </div>

                    <div style="display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; margin-top: 10px;">
                        <!-- Ficha Técnica -->
                        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 10.5px;">
                            <div>
                                <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Marca / Modelo</span>
                                <span class="text-truncate-single" style="font-weight: 800; font-size: 11px; color: var(--navy); text-transform: uppercase;" title="${veiculoMarcaModelo}">${veiculoMarcaModelo || 'FIAT / TORO FREEDOM AT'}</span>
                            </div>
                            <div style="height: 1px; background: var(--rule);"></div>
                            <div>
                                <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Ano Fabricação / Modelo</span>
                                <span class="text-truncate-single" style="font-weight: 700; color: var(--navy);">${os.fabricacaoAno || os.ano_fabricacao || '2016'} / ${os.modeloAno || os.ano_modelo || '2017'}</span>
                            </div>
                            <div style="height: 1px; background: var(--rule);"></div>
                            <div>
                                <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Cor</span>
                                <span class="text-truncate-single" style="font-weight: 700; color: var(--navy); text-transform: uppercase;">${os.cor || 'PRETA'}</span>
                            </div>
                            <div style="height: 1px; background: var(--rule);"></div>
                            <div>
                                <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Placa</span>
                                <span class="text-truncate-single" style="font-weight: 700; color: var(--navy); font-family: monospace; font-size: 11px; text-transform: uppercase;">${os.placa || 'ATO8I28'}</span>
                            </div>
                            <div style="height: 1px; background: var(--rule);"></div>
                            <div>
                                <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Chassi</span>
                                <span class="text-truncate-single" style="font-weight: 700; color: var(--navy); font-family: monospace; text-transform: uppercase;" title="${os.chassi || dataSec2.chassiLido || '988226117HKA63015'}">${os.chassi || dataSec2.chassiLido || '988226117HKA63015'}</span>
                            </div>
                            <div style="height: 1px; background: var(--rule);"></div>
                            <div>
                                <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Motor</span>
                                <span class="text-truncate-single" style="font-weight: 700; color: var(--navy); font-family: monospace; text-transform: uppercase;" title="${os.motor || dataSec2.motorLido || 'SS260S222968795'}">${os.motor || dataSec2.motorLido || 'SS260S222968795'}</span>
                            </div>
                            <div style="height: 1px; background: var(--rule);"></div>
                            <div>
                                <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Combustível</span>
                                <span class="text-truncate-single" style="font-weight: 700; color: var(--navy); text-transform: uppercase;">${dataSec1.combustivel || os.combustivel || 'ALCOOL / GASOLINA'}</span>
                            </div>
                            <div style="height: 1px; background: var(--rule);"></div>
                            <div>
                                <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">KM Informado</span>
                                <span class="text-truncate-single" style="font-weight: 700; color: var(--navy);">${dataSec1.quilometragem || '79.424'} km</span>
                            </div>
                        </div>

                        <!-- Coluna de Imagens e Dados de Vistoria -->
                        <div style="display: flex; flex-direction: column; gap: 14px;">
                            <!-- Foto 1 -->
                            <div class="photo-frame" style="width: 100%; height: 140px;">
                                ${renderFoto('frente_45_dir')}
                                <div class="photo-label">Frente 45° Lado Direito</div>
                            </div>
                            <!-- Foto 2 -->
                            <div class="photo-frame" style="width: 100%; height: 140px;">
                                ${renderFoto('traseira_45_esq')}
                                <div class="photo-label">Traseira 45° Lado Esquerdo</div>
                            </div>

                            <!-- Dados da Vistoria Card -->
                            <div style="background: white; border: 1px solid var(--rule); border-radius: 4px; padding: 12px; display: flex; flex-direction: column; gap: 6px; font-size: 9px;">
                                <h4 style="font-size: 8px; font-weight: 800; color: var(--navy); text-transform: uppercase; margin: 0 0 2px 0; letter-spacing: 0.5px;">Dados da Vistoria</h4>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--ink-muted); font-weight: 600;">DATA/HORA:</span>
                                    <span style="font-weight: 700; color: var(--navy);">${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR')} às ${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--ink-muted); font-weight: 600;">LOCAL:</span>
                                    <span class="text-truncate-single" style="font-weight: 700; color: var(--navy); max-width: 130px; text-align: right;">${db.unidades.find(u => u.id === os.unidadeId)?.nome || 'São José / Santa Catarina'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--ink-muted); font-weight: 600;">VISTORIADOR:</span>
                                    <span class="text-truncate-single" style="font-weight: 700; color: var(--navy); text-transform: uppercase; max-width: 120px; text-align: right;">${db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome || 'Romano Gonzales Mendes'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                ${getFooterStyle(3)}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 04: 02 RESUMO DA ANÁLISE (EVALUATION CARDS COM ESTILOS DO MOCKUP)
    // =========================================================================
    const getStatusPill = (status) => {
        if (status === 'RESTRIÇÃO' || status === 'nao_conforme' || status === 'reprovada') {
            return `<span class="status-pill pill-restricao">Restrição</span>`;
        } else if (status === 'COM RESSALVAS' || status === 'com_ressalvas') {
            return `<span class="status-pill pill-ressalva">Ressalvas</span>`;
        }
        return `<span class="status-pill pill-conforme">Conforme</span>`;
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
        <div class="certive-page">
            <div class="certive-page-inner">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px;">
                        <span class="section-number">04</span>
                        <h3 class="section-title">Resumo da Análise<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Status das Verificações</span></h3>
                    </div>

                    <!-- 5 Cards Horizontais Exatos (Estrutura, Identificação, Pintura, Motor, Chassi) -->
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 10px; margin-bottom: 20px;">
                        <div class="module-card" style="flex-direction: column; height: 75px; padding: 8px; text-align: center; justify-content: space-between;">
                            <div class="module-indicator" style="background: rgba(47, 107, 63, 0.05); color: var(--green); width: 26px; height: 26px; font-size: 14px;"><i class="ri-shield-check-line"></i></div>
                            <div style="font-size: 8px;">
                                <strong style="display: block; color: var(--navy); font-size: 7.5px; font-weight: 800; margin-bottom: 2px;">ESTRUTURA</strong>
                                ${getStatusPill(dataSec3.parecerEstrutural || 'conforme')}
                            </div>
                        </div>
                        <div class="module-card" style="flex-direction: column; height: 75px; padding: 8px; text-align: center; justify-content: space-between;">
                            <div class="module-indicator" style="background: rgba(47, 107, 63, 0.05); color: var(--green); width: 26px; height: 26px; font-size: 14px;"><i class="ri-bank-card-line"></i></div>
                            <div style="font-size: 8px;">
                                <strong style="display: block; color: var(--navy); font-size: 7.5px; font-weight: 800; margin-bottom: 2px;">IDENTIFICAÇÃO</strong>
                                ${getStatusPill(dataSec5.parecerVidros || 'conforme')}
                            </div>
                        </div>
                        <div class="module-card" style="flex-direction: column; height: 75px; padding: 8px; text-align: center; justify-content: space-between;">
                            <div class="module-indicator" style="background: rgba(184, 100, 43, 0.05); color: var(--amber); width: 26px; height: 26px; font-size: 14px;"><i class="ri-brush-line"></i></div>
                            <div style="font-size: 8px;">
                                <strong style="display: block; color: var(--navy); font-size: 7.5px; font-weight: 800; margin-bottom: 2px;">PINTURA</strong>
                                ${getStatusPill(dataSec4.parecerPintura || 'com_ressalvas')}
                            </div>
                        </div>
                        <div class="module-card" style="flex-direction: column; height: 75px; padding: 8px; text-align: center; justify-content: space-between;">
                            <div class="module-indicator" style="background: rgba(47, 107, 63, 0.05); color: var(--green); width: 26px; height: 26px; font-size: 14px;"><i class="ri-dashboard-3-line"></i></div>
                            <div style="font-size: 8px;">
                                <strong style="display: block; color: var(--navy); font-size: 7.5px; font-weight: 800; margin-bottom: 2px;">MOTOR</strong>
                                ${getStatusPill(dataSec6.parecerMotor || 'conforme')}
                            </div>
                        </div>
                        <div class="module-card" style="flex-direction: column; height: 75px; padding: 8px; text-align: center; justify-content: space-between;">
                            <div class="module-indicator" style="background: rgba(47, 107, 63, 0.05); color: var(--green); width: 26px; height: 26px; font-size: 14px;"><i class="ri-git-commit-line"></i></div>
                            <div style="font-size: 8px;">
                                <strong style="display: block; color: var(--navy); font-size: 7.5px; font-weight: 800; margin-bottom: 2px;">CHASSI</strong>
                                ${getStatusPill(dataSec2.chassiOriginal !== false ? 'conforme' : 'com_ressalvas')}
                            </div>
                        </div>
                    </div>

                    <!-- Divisão Aprovados e Alerta -->
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <!-- Caixa de Aprovados -->
                        <div style="background: rgba(47, 107, 63, 0.03); border: 1px solid rgba(47, 107, 63, 0.12); border-radius: 4px; padding: 12px; height: 160px; box-sizing: border-box; overflow: hidden;">
                            <strong style="color: var(--green); text-transform: uppercase; font-size: 9px; display: block; margin-bottom: 8px; letter-spacing: 0.5px;"><i class="ri-checkbox-circle-fill"></i> Itens Aprovados</strong>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px;">
                                ${approvedItemsHtml || '<p style="font-size:8px; color:var(--ink-muted); margin:0;">Nenhum item aprovado cadastrado.</p>'}
                            </div>
                        </div>
                        
                        <!-- Caixa de Alerta -->
                        <div style="background: rgba(184, 100, 43, 0.03); border: 1px solid rgba(184, 100, 43, 0.12); border-radius: 4px; padding: 12px; height: 120px; box-sizing: border-box; overflow: hidden;">
                            <strong style="color: var(--amber); text-transform: uppercase; font-size: 9px; display: block; margin-bottom: 8px; letter-spacing: 0.5px;"><i class="ri-alert-fill"></i> Itens de Alerta</strong>
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                ${alertItemsHtml || '<p style="font-size:8px; color:var(--ink-muted); margin:0;">Nenhum apontamento relevante localizado.</p>'}
                            </div>
                        </div>
                    </div>
                </div>

                ${getFooterStyle(4)}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 05: 03 ANÁLISE ESTRUTURAL (21 PONTOS E GRADE DE 6 FOTOS NO RODAPÉ)
    // =========================================================================
    const structuralList = [
        "Longarina dianteira esquerda", "Longarina dianteira direita", "Painel corta-fogo",
        "Torre do amortecedor dianteiro esquerdo", "Torre do amortecedor dianteiro direito",
        "Coluna dianteira direita", "Coluna central direita", "Coluna traseira direita",
        "Caixa de ar lado direito", "Coluna dianteira lado esquerdo", "Coluna central lado esquerdo",
        "Coluna traseira esquerda", "Caixa de ar lado esquerdo", "Longarina traseira esquerda",
        "Longarina traseira direita", "Painel traseiro", "Estrutura teto",
        "Torre do amortecedor traseiro esquerdo", "Torre do amortecedor traseiro direito",
        "Painel traseiro int. (assoalho)", "Caixa de estepe"
    ];

    const getStructuralStatus = (index) => {
        const key = `estru_${index}`;
        return dataSec3[key] || 'conforme';
    };

    let table1Html = '';
    let table2Html = '';

    structuralList.forEach((name, i) => {
        const idxStr = String(i + 1).padStart(2, '0');
        const status = getStructuralStatus(i + 1);
        const row = `
            <tr>
                <td style="font-weight: 700; width: 25px; color: var(--gold); text-align: center;">${idxStr}</td>
                <td class="text-truncate-single" title="${name}">${name}</td>
                <td style="width: 75px; text-align: center;">${getStatusPill(status)}</td>
            </tr>
        `;
        if (i < 11) table1Html += row;
        else table2Html += row;
    });

    html += `
        <div class="certive-page">
            <div class="certive-page-inner">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px;">
                        <span class="section-number">05</span>
                        <h3 class="section-title">Análise Estrutural<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Avaliação Físico-Estrutural de Longarinas e Colunas</span></h3>
                    </div>

                    <!-- Tabelas Lado a Lado -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px; margin-bottom: 16px;">
                        <table class="tech-table">
                            <thead>
                                <tr>
                                    <th style="text-align: center; width: 25px;">Item</th>
                                    <th>Componente</th>
                                    <th style="text-align: center; width: 75px;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${table1Html}
                            </tbody>
                        </table>
                        <table class="tech-table">
                            <thead>
                                <tr>
                                    <th style="text-align: center; width: 25px;">Item</th>
                                    <th>Componente</th>
                                    <th style="text-align: center; width: 75px;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${table2Html}
                                <tr>
                                    <td style="font-weight: 700; color: var(--gold); text-align: center;">22</td>
                                    <td class="text-truncate-single">Assoalho do porta-malas</td>
                                    <td style="text-align: center;">${getStatusPill(dataSec3['estru_22'] || 'conforme')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Grid de 6 Fotos Técnicas Rígido no Rodapé (2 linhas x 3 colunas) -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 5px;">
                        <div class="photo-frame" style="height: 72px;">
                            ${renderFoto('motor_vista_geral')}
                            <div class="photo-label">Compartimento do motor</div>
                        </div>
                        <div class="photo-frame" style="height: 72px;">
                            ${renderFoto('assoalho_porta_malas')}
                            <div class="photo-label">Assoalho porta-malas</div>
                        </div>
                        <div class="photo-frame" style="height: 72px;">
                            ${renderFoto('painel_hodometro')}
                            <div class="photo-label">Hodômetro</div>
                        </div>
                        <div class="photo-frame" style="height: 72px;">
                            ${renderFoto('frente_45_dir')}
                            <div class="photo-label">Frente 45° lado direito</div>
                        </div>
                        <div class="photo-frame" style="height: 72px;">
                            ${renderFoto('traseira_45_esq')}
                            <div class="photo-label">Traseira 45° lado esquerdo</div>
                        </div>
                        <div class="photo-frame" style="height: 72px;">
                            ${renderFoto('longarina_diant_esq')}
                            <div class="photo-label">Longarina dianteira esq.</div>
                        </div>
                    </div>
                </div>

                ${getFooterStyle(5)}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 06: 04 PINTURA E ACABAMENTO (DIAGRAMA E FOTOS ETA NO FIM)
    // =========================================================================
    const paintItemsList = [
        "Capô", "Teto", "Tampa do porta-malas",
        "Paralama dianteiro esq.", "Porta dianteira esq.", "Porta traseira esq.",
        "Paralama traseiro esq.", "Traseira esquerda", "Paralama traseiro dir.",
        "Traseira direita", "Porta traseira dir.", "Porta dianteira dir.",
        "Paralama dianteiro dir.", "Para-choque dianteiro", "Para-choque traseiro"
    ];

    const getPaintCondition = (index) => {
        const key = `micrometro_${index}`;
        return dataSec4[key] || 'Original';
    };

    const getPaintColor = (cond) => {
        if (cond === 'Repintura') return '#C9A961'; // Gold
        if (cond === 'Repintura com massa' || cond === 'Massa') return '#B8642B'; // Amber
        if (cond === 'Avariado' || cond === 'Pequenos riscos / amassado') return '#8B2635'; // Bordeaux
        if (cond === 'Não aplicável') return '#D8CFBE'; // Rule
        return '#2F6B3F'; // Green (Original)
    };

    let paintRowsHtml = '';
    paintItemsList.forEach((name, i) => {
        const cond = getPaintCondition(i + 1);
        const idxStr = String(i + 1).padStart(2, '0');
        paintRowsHtml += `
            <tr style="font-size: 8px;">
                <td style="font-weight:700; color:var(--gold); text-align:center;">${idxStr}</td>
                <td class="text-truncate-single" title="${name}">${name}</td>
                <td class="text-truncate-single" style="font-weight:700; color:${getPaintColor(cond)};">${cond}</td>
            </tr>
        `;
    });

    // Diagrama Automotivo em SVG Fiel ao laudo modelo
    const c1 = getPaintColor(getPaintCondition(1)); // Capô
    const c2 = getPaintColor(getPaintCondition(2)); // Teto
    const c3 = getPaintColor(getPaintCondition(3)); // Porta-malas
    const c4 = getPaintColor(getPaintCondition(4)); // Paralama D.E
    const c5 = getPaintColor(getPaintCondition(5)); // Porta D.E
    const c6 = getPaintColor(getPaintCondition(6)); // Porta T.E
    const c7 = getPaintColor(getPaintCondition(7)); // Paralama T.E
    const c9 = getPaintColor(getPaintCondition(9)); // Paralama T.D
    const c11 = getPaintColor(getPaintCondition(11)); // Porta T.D
    const c12 = getPaintColor(getPaintCondition(12)); // Porta D.D
    const c13 = getPaintColor(getPaintCondition(13)); // Paralama D.D
    const c14 = getPaintColor(getPaintCondition(14)); // PC Dianteiro
    const c15 = getPaintColor(getPaintCondition(15)); // PC Traseiro

    const carDiagramSvg = `
        <svg viewBox="0 0 200 400" style="width: 100%; height: 260px; background: white; border: 1px solid var(--rule); border-radius: 4px; padding: 10px; box-sizing: border-box;">
            <!-- Estrutura do Carro Geral -->
            <rect x="50" y="30" width="100" height="340" rx="40" fill="none" stroke="#D8CFBE" stroke-width="2" />
            
            <!-- Capô (01) -->
            <path d="M 55 120 L 70 50 Q 100 40 130 50 L 145 120 Z" fill="${c1}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="100" y="85" fill="white" font-size="10" font-weight="800" text-anchor="middle">01</text>
            
            <!-- Teto (02) -->
            <rect x="60" y="170" width="80" height="90" rx="10" fill="${c2}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="100" y="220" fill="white" font-size="10" font-weight="800" text-anchor="middle">02</text>
            
            <!-- Porta-malas (03) -->
            <path d="M 58 320 L 70 365 Q 100 370 130 365 L 142 320 Z" fill="${c3}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="100" y="350" fill="white" font-size="10" font-weight="800" text-anchor="middle">03</text>
            
            <!-- Paralama Dianteiro Esquerdo (04) -->
            <path d="M 25 60 C 25 90 40 120 48 130 L 48 60 Z" fill="${c4}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="35" y="95" fill="white" font-size="8" font-weight="800" text-anchor="middle">04</text>
            
            <!-- Porta Dianteira Esquerda (05) -->
            <rect x="42" y="140" width="15" height="60" fill="${c5}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="50" y="175" fill="white" font-size="8" font-weight="800" text-anchor="middle">05</text>
            
            <!-- Porta Traseira Esquerda (06) -->
            <rect x="42" y="205" width="15" height="60" fill="${c6}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="50" y="240" fill="white" font-size="8" font-weight="800" text-anchor="middle">06</text>
            
            <!-- Paralama Traseiro Esquerdo (07) -->
            <path d="M 25 320 C 25 290 40 270 48 270 L 48 335 Z" fill="${c7}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="35" y="305" fill="white" font-size="8" font-weight="800" text-anchor="middle">07</text>
            
            <!-- Paralama Traseiro Direito (09) -->
            <path d="M 175 320 C 175 290 160 270 152 270 L 152 335 Z" fill="${c9}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="165" y="305" fill="white" font-size="8" font-weight="800" text-anchor="middle">09</text>
            
            <!-- Porta Traseira Direita (11) -->
            <rect x="143" y="205" width="15" height="60" fill="${c11}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="150" y="240" fill="white" font-size="8" font-weight="800" text-anchor="middle">11</text>
            
            <!-- Porta Dianteira Direita (12) -->
            <rect x="143" y="140" width="15" height="60" fill="${c12}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="150" y="175" fill="white" font-size="8" font-weight="800" text-anchor="middle">12</text>
            
            <!-- Paralama Dianteiro Direito (13) -->
            <path d="M 175 60 C 175 90 160 120 152 130 L 152 60 Z" fill="${c13}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="165" y="95" fill="white" font-size="8" font-weight="800" text-anchor="middle">13</text>
            
            <!-- Para-choque Dianteiro (14) -->
            <path d="M 60 25 Q 100 15 140 25 L 135 40 Q 100 30 65 40 Z" fill="${c14}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="100" y="30" fill="white" font-size="7" font-weight="800" text-anchor="middle">14</text>
            
            <!-- Para-choque Traseiro (15) -->
            <path d="M 58 375 Q 100 385 142 375 L 138 390 Q 100 380 62 390 Z" fill="${c15}" opacity="0.85" stroke="white" stroke-width="1.5" />
            <text x="100" y="385" fill="white" font-size="7" font-weight="800" text-anchor="middle">15</text>
        </svg>
    `;

    html += `
        <div class="certive-page">
            <div class="certive-page-inner">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px;">
                        <span class="section-number">06</span>
                        <h3 class="section-title">Pintura e Acabamento<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Mapeamento Micrométrico da Lataria</span></h3>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1.15fr; gap: 16px; margin-top: 5px; margin-bottom: 12px; align-items: center;">
                        <!-- Lado Esquerdo: Diagrama SVG do Veículo -->
                        <div>
                            ${carDiagramSvg}
                            <!-- Legenda Pequena -->
                            <div style="display:flex; justify-content:center; gap:6px; font-size:7px; font-weight:700; margin-top:6px; flex-wrap:wrap;">
                                <span><span style="display:inline-block; width:6px; height:6px; background:#2F6B3F; margin-right:3px; vertical-align:middle; border-radius:1px;"></span>ORIGINAL</span>
                                <span><span style="display:inline-block; width:6px; height:6px; background:#C9A961; margin-right:3px; vertical-align:middle; border-radius:1px;"></span>REPINTURA</span>
                                <span><span style="display:inline-block; width:6px; height:6px; background:#B8642B; margin-right:3px; vertical-align:middle; border-radius:1px;"></span>MASSA</span>
                                <span><span style="display:inline-block; width:6px; height:6px; background:#8B2635; margin-right:3px; vertical-align:middle; border-radius:1px;"></span>AVARIADO</span>
                            </div>
                        </div>

                        <!-- Lado Direito: Tabela de Pintura -->
                        <table class="tech-table" style="margin: 0; font-size: 8px;">
                            <thead>
                                <tr>
                                    <th style="text-align: center; width: 25px;">Item</th>
                                    <th>Peça Avaliada</th>
                                    <th>Condição</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${paintRowsHtml}
                            </tbody>
                        </table>
                    </div>

                    <!-- Rodapé com etiquetas e fotos de segurança -->
                    <div style="background: white; border: 1px solid var(--rule); border-radius: 4px; padding: 8px; margin-bottom: 5px;">
                        <h4 style="font-size: 8px; font-weight: 800; color: var(--navy); text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.5px;">ETIQUETAS</h4>
                        <div style="display: flex; justify-content: space-between; font-size: 8.5px; border-bottom: 1px solid var(--rule); padding-bottom: 3px; margin-bottom: 3px;">
                            <span>Etiqueta (ETA) compartimento do motor</span>
                            <strong style="color: var(--green);">ORIGINAL</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 8.5px; margin-bottom: 6px;">
                            <span>Etiqueta (ETA) coluna lado direito</span>
                            <strong style="color: var(--green);">ORIGINAL</strong>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div class="photo-frame" style="height: 70px;">
                                ${renderFoto('etiqueta_eta_motor')}
                            </div>
                            <div class="photo-frame" style="height: 70px;">
                                ${renderFoto('etiqueta_eta_coluna')}
                            </div>
                        </div>
                    </div>
                </div>

                ${getFooterStyle(6)}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 07: 05 IDENTIFICAÇÃO E VIDROS
    // =========================================================================
    const glassList = ["Para-brisa", "Vidro dianteiro esquerdo", "Vidro traseiro esquerdo", "Vidro dianteiro direito", "Vidro traseiro direito", "Vidro traseiro"];
    let glassRowsHtml = '';

    glassList.forEach((name, i) => {
        const idxStr = String(i + 1).padStart(2, '0');
        const status = dataSec5[`vidro_${i+1}_status`] || 'Original';
        const recorded = dataSec5[`vidro_${i+1}_chassis`] !== false ? 'Sim' : 'Não';
        glassRowsHtml += `
            <tr>
                <td style="font-weight:700; color:var(--gold); text-align:center;">${idxStr}</td>
                <td class="text-truncate-single">${name}</td>
                <td style="text-align:center;">${getStatusPill(status)}</td>
                <td style="text-align:center; font-weight:700; color:${recorded === 'Sim' ? 'var(--green)' : 'var(--bordeaux)'};">${recorded}</td>
            </tr>
        `;
    });

    const labelsList = [
        { name: "Gravação número chassi vidros", key: "chassis_vidros" },
        { name: "Etiqueta (ETA) compartimento motor", key: "eta_compartimento" },
        { name: "Etiqueta (ETA) coluna coluna porta", key: "eta_coluna" }
    ];

    let labelsRowsHtml = '';
    labelsList.forEach((item, i) => {
        const idxStr = String(i + 1).padStart(2, '0');
        const status = dataSec5[`label_${item.key}_status`] || 'Original';
        labelsRowsHtml += `
            <tr>
                <td style="font-weight:700; color:var(--gold); text-align:center;">${idxStr}</td>
                <td class="text-truncate-single">${item.name}</td>
                <td style="text-align:center;">${getStatusPill(status)}</td>
            </tr>
        `;
    });

    html += `
        <div class="certive-page">
            <div class="certive-page-inner">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px;">
                        <span class="section-number">07</span>
                        <h3 class="section-title">Identificação e Vidros<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Vidros e Etiquetas Autoadesivas de Gravação</span></h3>
                    </div>

                    <!-- Vidros Tabela -->
                    <h4 style="font-size: 8px; font-weight: 800; color: var(--navy); text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.5px;">1. Ficha de Vidros</h4>
                    <table class="tech-table" style="margin-bottom: 12px; font-size: 8.5px;">
                        <thead>
                            <tr>
                                <th style="text-align: center; width: 25px;">Item</th>
                                <th>Vidro Avaliado</th>
                                <th style="text-align: center; width: 85px;">Status</th>
                                <th style="text-align: center; width: 85px;">Chassi Gravado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${glassRowsHtml}
                        </tbody>
                    </table>

                    <!-- Etiquetas Tabela -->
                    <h4 style="font-size: 8px; font-weight: 800; color: var(--navy); text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.5px;">2. Etiquetas e Gravações de Segurança</h4>
                    <table class="tech-table" style="margin-bottom: 16px; font-size: 8.5px;">
                        <thead>
                            <tr>
                                <th style="text-align: center; width: 25px;">Item</th>
                                <th>Ponto de Gravação / Etiqueta</th>
                                <th style="text-align: center; width: 85px;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${labelsRowsHtml}
                        </tbody>
                    </table>

                    <!-- Grid de Fotos no Rodapé -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 5px;">
                        <div class="photo-frame" style="height: 75px;">
                            ${renderFoto('chassi_gravado')}
                            <div class="photo-label">Gravação do Chassi</div>
                        </div>
                        <div class="photo-frame" style="height: 75px;">
                            ${renderFoto('motor_gravado')}
                            <div class="photo-label">Número do Motor</div>
                        </div>
                        <div class="photo-frame" style="height: 75px;">
                            ${renderFoto('placa_dianteira')}
                            <div class="photo-label">Placa do Veículo</div>
                        </div>
                    </div>
                </div>

                ${getFooterStyle(7)}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 08: 06 MOTOR E CHASSI (FOTO GRANDE PANORÂMICA E DADOS COMPLEMENTARES)
    // =========================================================================
    html += `
        <div class="certive-page">
            <div class="certive-page-inner">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px;">
                        <span class="section-number">08</span>
                        <h3 class="section-title">Motor e Chassi<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Integridade de Gravação do Motor e Bloco de Chassi</span></h3>
                    </div>

                    <!-- Foto Panorâmica Principal do Cofre -->
                    <div class="photo-frame" style="width: 100%; height: 130px; margin-bottom: 10px;">
                        ${renderFoto('motor_vista_geral')}
                        <div class="photo-label">Compartimento do motor</div>
                    </div>

                    <!-- Duas Fotos Menores de Gravações Lado a Lado -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                        <div class="photo-frame" style="height: 90px;">
                            ${renderFoto('motor_gravado')}
                            <div class="photo-label">Número do motor</div>
                        </div>
                        <div class="photo-frame" style="height: 90px;">
                            ${renderFoto('chassi_gravado')}
                            <div class="photo-label">Número do chassi (longarina)</div>
                        </div>
                    </div>

                    <!-- Dados Complementares (Tabela em 2 Colunas) -->
                    <div style="background: white; border: 1px solid var(--rule); border-radius: 4px; padding: 10px; margin-bottom: 12px; box-sizing: border-box;">
                        <h4 style="font-size: 8px; font-weight: 800; color: var(--navy); text-transform: uppercase; margin: 0 0 6px 0; letter-spacing: 0.5px;">Dados Complementares</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 8.5px;">
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:2px;">
                                <span style="color:var(--ink-muted);">Modelo</span>
                                <strong class="text-truncate-single" style="max-width: 150px;">${veiculoMarcaModelo || 'FIAT / TORO FREEDOM AT'}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:2px;">
                                <span style="color:var(--ink-muted);">Placa</span>
                                <strong class="text-truncate-single" style="max-width: 120px;">${os.placa || 'ATO8I28'}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:2px;">
                                <span style="color:var(--ink-muted);">Fabricante</span>
                                <strong class="text-truncate-single" style="max-width: 150px;">FIAT</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:2px;">
                                <span style="color:var(--ink-muted);">Chassi</span>
                                <strong class="text-truncate-single" style="max-width: 120px; font-family: monospace;">${os.chassi || dataSec2.chassiLido || '988226117HKA63015'}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:2px;">
                                <span style="color:var(--ink-muted);">Ano fab. / modelo</span>
                                <strong class="text-truncate-single">${os.fabricacaoAno || '2016'} / ${os.modeloAno || '2017'}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:2px;">
                                <span style="color:var(--ink-muted);">Motor</span>
                                <strong class="text-truncate-single" style="max-width: 120px; font-family: monospace;">${os.motor || dataSec2.motorLido || 'SS260S222968795'}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:2px;">
                                <span style="color:var(--ink-muted);">Combustível</span>
                                <strong class="text-truncate-single" style="max-width: 150px;">${dataSec1.combustivel || 'ALCOOL / GASOLINA'}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(0,0,0,0.03); padding-bottom:2px;">
                                <span style="color:var(--ink-muted);">Renavam</span>
                                <strong class="text-truncate-single" style="max-width: 120px;">${os.renavam || '01085851483'}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:var(--ink-muted);">Cor</span>
                                <strong class="text-truncate-single">${os.cor || 'PRETA'}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:var(--ink-muted);">Quilometragem</span>
                                <strong class="text-truncate-single">${dataSec1.quilometragem || '79.424'} km</strong>
                            </div>
                        </div>
                    </div>

                    <!-- Caixa de Parecer Técnico Rígida -->
                    <div style="background: white; border: 1px solid var(--rule); border-radius: 4px; padding: 10px; box-sizing: border-box;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <strong style="color: var(--navy); font-size: 8.5px; text-transform: uppercase;">Parecer Técnico</strong>
                            <span style="font-size: 13px; font-weight: 900; color: ${parecerFinal === 'nao_conforme' ? 'var(--bordeaux)' : (parecerFinal === 'com_ressalvas' ? 'var(--amber)' : 'var(--green)')}; text-transform: uppercase;">
                                ${parecerFinal === 'nao_conforme' ? 'NÃO CONFORME' : (parecerFinal === 'com_ressalvas' ? 'CONFORME COM RESSALVA' : 'CONFORME')}
                            </span>
                        </div>
                        <p class="text-truncate-multi" style="margin: 0; font-size: 8.5px; line-height: 1.4; color: var(--ink-muted); -webkit-line-clamp: 2;">
                            Observação: Não são analisados itens que necessitem de equipamentos especializados como freios ABS, air bags, parte mecânica, hodômetro e elétrica.
                        </p>
                    </div>
                </div>

                ${getFooterStyle(8)}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 09: 07 PESQUISA DOCUMENTAL (TABELAS E MÓDULOS DE ALERTAS/RESTRIÇÃO)
    // =========================================================================
    const debtsList = dataSec7.debitos || [
        { name: "Base de leilão 1", value: "Nada consta", status: "ok" },
        { name: "Indício de sinistro 1", value: "Nada consta", status: "ok" },
        { name: "Base de leilão 2", value: "Nada consta", status: "ok" },
        { name: "Indício de sinistro 2", value: "Nada consta", status: "ok" },
        { name: "Comunicação de venda estadual", value: "Nada consta", status: "ok" },
        { name: "Parecer técnico", value: "Nada consta", status: "ok" },
        { name: "Remarketing", value: "Nada consta", status: "ok" }
    ];

    let approvedDebtsHtml = '';
    debtsList.forEach(d => {
        if (d.status === 'ok') {
            approvedDebtsHtml += `
                <div style="display:flex; justify-content:space-between; font-size:8.5px; padding: 2px 0; border-bottom:1px solid rgba(0,0,0,0.02);">
                    <span style="color:var(--ink); font-weight: 500;"><i class="ri-checkbox-circle-fill" style="color:var(--green); font-size:10px; margin-right:3px; vertical-align:middle;"></i> ${d.name}</span>
                    <strong style="color:var(--green);">${d.value}</strong>
                </div>
            `;
        }
    });

    html += `
        <div class="certive-page">
            <div class="certive-page-inner">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px;">
                        <span class="section-number">09</span>
                        <h3 class="section-title">Pesquisa Documental<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Histórico, Restrições e Histórico de Leilão / Sinistro</span></h3>
                    </div>

                    <!-- Tabela Dados da Consulta -->
                    <table class="tech-table" style="margin-bottom: 12px; font-size: 8.5px;">
                        <thead>
                            <tr>
                                <th style="width: 25%;">Dados da Consulta</th>
                                <th style="width: 25%;">Detalhes</th>
                                <th style="width: 25%;">Dados Adicionais</th>
                                <th style="width: 25%;">Detalhes</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="font-weight:700; color:var(--navy);">Entrada</td>
                                <td class="text-truncate-single">${os.placa || 'ATO8I28'}</td>
                                <td style="font-weight:700; color:var(--navy);">Solicitado por</td>
                                <td class="text-truncate-single">Certive Vistorias</td>
                            </tr>
                            <tr>
                                <td style="font-weight:700; color:var(--navy);">Data / Hora</td>
                                <td class="text-truncate-single">${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR')} às ${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</td>
                                <td style="font-weight:700; color:var(--navy);">Código da consulta</td>
                                <td class="text-truncate-single">4386109</td>
                            </tr>
                            <tr>
                                <td style="font-weight:700; color:var(--navy);">Usuário</td>
                                <td class="text-truncate-single">${db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome || 'Romano Gonzales Mendes'}</td>
                                <td style="font-weight:700; color:var(--navy);">Token da consulta</td>
                                <td class="text-truncate-single" style="font-family:monospace; font-size:7px;">4348c105-afa0-4df6-b800-fcf6f3d1b38</td>
                            </tr>
                            <tr>
                                <td style="font-weight:700; color:var(--navy);">Emplacamento</td>
                                <td class="text-truncate-single">Curitiba / PR</td>
                                <td colspan="2"></td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Cards de Itens de Pesquisa Fiel ao Modelo -->
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <!-- Itens Aprovados -->
                        <div style="background: white; border: 1px solid var(--rule); border-radius: 4px; padding: 8px;">
                            <strong style="color: white; background: var(--green); text-transform: uppercase; font-size: 8.5px; display: block; padding: 4px 8px; margin-bottom: 6px; letter-spacing: 0.5px; border-radius: 2px;">ITENS APROVADOS</strong>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px;">
                                ${approvedDebtsHtml}
                            </div>
                        </div>

                        <!-- Itens de Alerta -->
                        <div style="background: white; border: 1px solid var(--rule); border-radius: 4px; padding: 8px;">
                            <strong style="color: white; background: var(--amber); text-transform: uppercase; font-size: 8.5px; display: block; padding: 4px 8px; margin-bottom: 6px; letter-spacing: 0.5px; border-radius: 2px;">ITENS DE ALERTA</strong>
                            <div style="display:flex; justify-content:space-between; font-size:8.5px; border-bottom:1px solid rgba(0,0,0,0.02); padding-bottom: 2px;">
                                <span><i class="ri-alert-fill" style="color:var(--amber); font-size:10px; margin-right:3px;"></i> Multas</span>
                                <strong style="color:var(--amber);">Registro de multas encontrado</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:8.5px; padding-top: 2px;">
                                <span><i class="ri-alert-fill" style="color:var(--amber); font-size:10px; margin-right:3px;"></i> Débitos estaduais</span>
                                <strong style="color:var(--amber);">Registros encontrados: 1</strong>
                            </div>
                        </div>

                        <!-- Itens de Restrição -->
                        <div style="background: white; border: 1px solid var(--rule); border-radius: 4px; padding: 8px;">
                            <strong style="color: white; background: var(--bordeaux); text-transform: uppercase; font-size: 8.5px; display: block; padding: 4px 8px; margin-bottom: 6px; letter-spacing: 0.5px; border-radius: 2px;">ITENS DE RESTRIÇÃO</strong>
                            <div style="display:flex; justify-content:space-between; font-size:8.5px; border-bottom:1px solid rgba(0,0,0,0.02); padding-bottom: 2px;">
                                <span><i class="ri-close-circle-fill" style="color:var(--bordeaux); font-size:10px; margin-right:3px;"></i> Restrições estaduais</span>
                                <strong style="color:var(--bordeaux);">Registros encontrados: 1</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; font-size:8.5px; padding-top: 2px;">
                                <span><i class="ri-close-circle-fill" style="color:var(--bordeaux); font-size:10px; margin-right:3px;"></i> Restrição financeira</span>
                                <strong style="color:var(--bordeaux);">Alienação ativa em andamento</strong>
                            </div>
                        </div>
                    </div>
                </div>

                ${getFooterStyle(9)}
            </div>
        </div>
    `;

    // =========================================================================
    // PAGINA 10: 08 PARECER FINAL & ASSINATURAS (FOTO CERTIFICADO)
    // =========================================================================
    let finalHeadline = 'CONFORME';
    let finalColor = 'var(--green)';
    let finalSub = 'PARA AQUISIÇÃO';
    let finalBody = 'Com base em todas as verificações e pesquisas realizadas, certifico que o veículo vistoriado apresenta condições compatíveis com sua idade e uso, não sendo identificados indícios de sinistro, remarcação de chassi, restrições ou irregularidades relevantes.';

    if (parecerFinal === 'com_ressalvas') {
        finalHeadline = 'CONFORME COM RESSALVAS';
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
        <div class="certive-page" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div class="certive-page-inner" style="justify-content: space-between;">
                <div class="corner-decor corner-tl"></div>
                <div class="corner-decor corner-tr"></div>
                <div class="corner-decor corner-bl"></div>
                <div class="corner-decor corner-br"></div>
                
                <div>
                    ${headerStyle(cautelar.dossieNumero || cautelar.dossie_numero)}
                    
                    <div class="section-header" style="margin-top: 10px; margin-bottom: 20px;">
                        <span class="section-number">10</span>
                        <h3 class="section-title">Parecer Final<br><span style="font-size: 10px; color: var(--ink-muted); font-weight: 600; text-transform: none;">Conclusão e Encerramento da Vistoria</span></h3>
                    </div>

                    <!-- Box de Parecer Final Central Navy com Borda Dourada -->
                    <div style="background: var(--navy-deep); color: white; padding: 24px; border-radius: 6px; border: 1.5px solid var(--gold); text-align: center; margin-bottom: 25px;">
                        <div style="width: 32px; height: 32px; border: 1.5px solid var(--gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px auto;">
                            <span style="color:var(--gold); font-size:14px; font-weight:900;">C</span>
                        </div>
                        
                        <p class="text-truncate-multi" style="font-size: 10px; line-height: 1.65; color: rgba(255,255,255,0.75); max-width: 500px; margin: 0 auto 14px auto; font-weight: 500; -webkit-line-clamp: 4;">
                            ${finalBody}
                        </p>
                        
                        <h2 style="font-size: 22px; font-weight: 800; color: ${finalColor}; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">${finalHeadline}</h2>
                        <span style="font-size: 8px; font-weight: 700; color: var(--gold); letter-spacing: 1px; text-transform: uppercase; display: block; margin-top: 4px;">${finalSub}</span>
                    </div>

                    <div style="text-align: center; font-size: 11px; font-weight: 700; color: var(--navy); margin-bottom: 25px;">
                        São José/SC, ${new Date(cautelar.criadoEm || cautelar.data_hora_inicio).toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'})}.
                    </div>

                    <!-- Assinaturas -->
                    <div style="display: flex; justify-content: center; gap: 30px;">
                        <div style="display: flex; flex-direction: column; align-items: center; text-align: center;">
                            <div style="width: 220px; height: 55px; border-bottom: 1px solid var(--navy); display:flex; align-items:center; justify-content:center; overflow:hidden; background: white; border-radius: 2px;">
                                ${signatureVistoriador ? `<img src="${signatureVistoriador}" style="max-height: 100%; max-width: 100%; object-fit: contain;">` : ''}
                            </div>
                            <span class="text-truncate-single" style="font-size: 10px; font-weight: 800; color: var(--navy); margin-top: 5px; text-transform: uppercase; max-width: 220px;">${db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome || 'Carlos Eduardo Martins'}</span>
                            <span style="font-size: 7.5px; color: var(--ink-muted); font-weight: 700; text-transform: uppercase; margin-top: 1px;">Vistoriador Responsável</span>
                        </div>
                    </div>
                </div>

                <!-- Selo Criptográfico de Encerramento Rodapé -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1.5px solid var(--gold); padding-top: 12px; margin-top: 20px;">
                    <div style="max-width: 480px; font-size: 8.5px; color: var(--ink-muted); font-weight: 500; line-height: 1.45;">
                        <strong style="color: var(--navy); font-size: 9px; text-transform: uppercase; display: block; margin-bottom: 2px;">Validação Criptográfica do Dossiê:</strong>
                        <span style="font-family: monospace; font-size: 7.5px; color: var(--ink-muted); word-break: break-all; font-weight: 400;">${hashLaudo}</span>
                    </div>
                    
                    <!-- Selo Dourado Pequeno no Canto -->
                    <div style="width: 60px; height: 60px; border: 1.5px solid var(--gold); border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: white;">
                        <span style="color:var(--gold); font-size:12px; font-weight:900; line-height: 1;">C</span>
                        <span style="font-size: 4.5px; font-weight: 800; color:var(--gold); text-transform: uppercase; margin-top: 1px;">CERTIVE</span>
                    </div>
                </div>

                ${getFooterStyle(10)}
            </div>
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
                width: 90,
                height: 90,
                colorDark: '#0A1F3D',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }, 200);
}

// Auxiliares internos de estilo para Header/Footer de páginas internas (2 a 10)
function headerStyle(dossieNum) {
    return `
        <div class="internal-header">
            <div class="brand">
                <div class="brand-logo">C</div>
                <div>
                    <span class="brand-text">Certive</span>
                    <span class="brand-sub">ECV Credenciada Detran-SC</span>
                </div>
            </div>
            <div class="dossier-box">
                <span class="dossier-label">DOSSIÊ</span><br>
                <span class="dossier-code">${dossieNum}</span>
            </div>
        </div>
    `;
}

function getFooterStyle(pageNum) {
    const padPage = String(pageNum).padStart(2, '0');
    return `
        <div class="internal-footer">
            <span>CERTIVE VISTORIAS · LAUDO CAUTELAR</span>
            <span class="footer-page">PÁGINA ${padPage} DE 10</span>
        </div>
    `;
}
