// MODULE: Atendimento & OS

function renderAtendimentoPage() {
    renderAtendimentoKPIs();
    renderOSFormServices();
    renderOSPipeline();
    loadPartnersDropdown();
}

function renderAtendimentoKPIs() {
    const today = getLocalToday();
    const todayOSs = db.ordens_servico.filter(o => o.unidadeId === activeUnitId && o.criadoEm.startsWith(today));
    
    const countTotal = todayOSs.length;
    const countExec = todayOSs.filter(o => o.status === 'em_execucao' || o.status === 'aberta').length;
    const countConcluidas = todayOSs.filter(o => o.status.startsWith('concluida')).length;
    
    // Revenue generated from immediate payments today
    const totalRev = todayOSs
        .filter(o => o.pago && o.status !== 'cancelada')
        .reduce((sum, o) => sum + o.valor, 0);

    const kpiGrid = document.getElementById('atendimento-kpis');
    kpiGrid.innerHTML = `
        <div class="kpi-card kpi-blue">
            <div class="kpi-icon"><i class="ri-file-list-3-line"></i></div>
            <div class="kpi-value">${countTotal}</div>
            <div class="kpi-label">Fichadas Hoje</div>
        </div>
        <div class="kpi-card kpi-yellow">
            <div class="kpi-icon"><i class="ri-loader-4-line"></i></div>
            <div class="kpi-value">${countExec}</div>
            <div class="kpi-label">Em Execução</div>
        </div>
        <div class="kpi-card kpi-green">
            <div class="kpi-icon"><i class="ri-checkbox-circle-line"></i></div>
            <div class="kpi-value">${countConcluidas}</div>
            <div class="kpi-label">Concluídas Hoje</div>
        </div>
        <div class="kpi-card kpi-purple">
            <div class="kpi-icon"><i class="ri-money-dollar-box-line"></i></div>
            <div class="kpi-value">${formatCurrency(totalRev)}</div>
            <div class="kpi-label">Faturado no Caixa</div>
        </div>
    `;
}

function selectClientType(type) {
    currentClientType = type;
    document.getElementById('btn-cat-particular').classList.toggle('active', type === 'particular');
    document.getElementById('btn-cat-parceiro').classList.toggle('active', type === 'parceiro');
    
    const partnerSelectGroup = document.getElementById('form-group-parceiro');
    const optFaturamento = document.getElementById('opt-pagamento-faturamento');
    const paymentSelect = document.getElementById('os-pagamento');
    const valWarning = document.getElementById('os-valor-warning');
    const priceInput = document.getElementById('os-valor');

    if (type === 'particular') {
        partnerSelectGroup.style.display = 'none';
        optFaturamento.disabled = true;
        if (paymentSelect.value === 'faturamento') paymentSelect.value = 'pix';
        valWarning.textContent = "Tabela de balcão. Valor editável pelo atendente.";
        priceInput.disabled = false;
    } else {
        partnerSelectGroup.style.display = 'block';
        valWarning.textContent = "Preço pré-definido em contrato com parceiro. Não negociável no balcão.";
        priceInput.disabled = true;
    }

    renderOSFormServices();
}

function loadPartnersDropdown() {
    const select = document.getElementById('os-parceiro-select');
    const list = db.parceiros.filter(p => p.usaFaturamento || p.tabelaPrecos);
    select.innerHTML = '<option value="">Selecione o parceiro...</option>' + 
        list.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
}

function loadPartnerServices(partnerId) {
    const optFaturamento = document.getElementById('opt-pagamento-faturamento');
    const paymentSelect = document.getElementById('os-pagamento');
    
    if (!partnerId) {
        optFaturamento.disabled = true;
        paymentSelect.value = 'pix';
        renderOSFormServices();
        return;
    }

    const partner = db.parceiros.find(p => p.id === parseInt(partnerId));
    if (!partner) { showToast("Parceiro não encontrado.", "error"); return; }
    
    // Enable or disable invoice option based on agreement
    if (partner.usaFaturamento) {
        optFaturamento.disabled = false;
        paymentSelect.value = 'faturamento';
    } else {
        optFaturamento.disabled = true;
        paymentSelect.value = 'pix';
    }

    renderOSFormServices();
}

function renderOSFormServices() {
    const container = document.getElementById('service-selector');
    const partnerId = parseInt(document.getElementById('os-parceiro-select').value);
    const partner = partnerId ? db.parceiros.find(p => p.id === partnerId) : null;

    container.innerHTML = db.servicos.map(s => {
        let price = s.precoBalcao;
        if (currentClientType === 'parceiro' && partner) {
            price = partner.tabelaPrecos[s.id] || s.precoBalcao;
        }

        const iconClass = s.categoria === 'Transferência' 
            ? 'ri-car-line' 
            : (s.categoria === 'Cautelar' 
                ? 'ri-shield-check-line' 
                : (s.categoria === 'Exótico' 
                    ? 'ri-vip-crown-line' 
                    : 'ri-search-eye-line'));
        
        const priceLabel = s.id === 6 ? 'A NEGOCIAR' : formatCurrency(price);
        
        return `
            <label class="service-option" id="lbl-svc-${s.id}" onclick="selectService(${s.id}, ${price})">
                <input type="radio" name="os-svc-radio" value="${s.id}">
                <div class="radio-dot"></div>
                <i class="${iconClass}" style="font-size: 18px; color: var(--accent);"></i>
                <div class="service-info">
                    <div class="service-name">${s.nome}</div>
                    <div class="service-price">${priceLabel}</div>
                </div>
            </label>
        `;
    }).join('');

    currentSelectedServiceId = null;
    document.getElementById('os-valor').value = '';
    document.getElementById('os-valor').disabled = (currentClientType === 'parceiro');
}

function selectService(id, price) {
    currentSelectedServiceId = id;
    document.querySelectorAll('.service-option').forEach(el => el.classList.remove('selected'));
    document.getElementById(`lbl-svc-${id}`).classList.add('selected');
    
    const priceInput = document.getElementById('os-valor');
    if (id === 6) {
        priceInput.value = '';
        priceInput.disabled = false;
        priceInput.placeholder = 'Digite o valor acordado';
    } else {
        priceInput.value = price.toFixed(2);
        priceInput.disabled = (currentClientType === 'parceiro');
        priceInput.placeholder = '0,00';
    }
}

function clearOSForm() {
    currentSelectedServiceId = null;
    document.querySelectorAll('.service-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('os-valor').value = '';
    document.getElementById('os-placa').value = '';
    document.getElementById('os-renavam').value = '';
    document.getElementById('os-marca').value = '';
    document.getElementById('os-modelo').value = '';
    document.getElementById('os-ano').value = '';
    document.getElementById('os-cor').value = '';
    document.getElementById('os-combustivel').value = '';
    document.getElementById('os-nome-cliente').value = '';
    document.getElementById('os-cpf-cliente').value = '';
    document.getElementById('os-celular-cliente').value = '';
    document.getElementById('os-obs').value = '';
    document.getElementById('os-doc-veiculo').checked = false;
    document.getElementById('os-doc-identificacao').checked = false;
    document.getElementById('os-detran').checked = false;
    document.getElementById('os-parceiro-select').value = '';
    selectClientType('particular');
    window.activeRecheckOrigemId = null;
    checkPlacaLength();
}

function checkPlacaLength() {
    const placaInput = document.getElementById('os-placa');
    const btnConsultar = document.getElementById('btn-consultar-placa');
    if (!placaInput || !btnConsultar) return;
    
    // Validate Mercosul or normal plate formats: 7 alphanumeric chars
    const placaValue = placaInput.value.replace(/[^a-zA-Z0-9]/g, '');
    if (placaValue.length === 7) {
        btnConsultar.disabled = false;
    } else {
        btnConsultar.disabled = true;
    }
}

async function consultarPlacaAPI() {
    const placaInput = document.getElementById('os-placa');
    const btnConsultar = document.getElementById('btn-consultar-placa');
    
    const placa = placaInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length !== 7) return;

    btnConsultar.disabled = true;
    const originalIcon = btnConsultar.innerHTML;
    btnConsultar.innerHTML = '<i class="ri-loader-4-line" style="animation: spin 1s linear infinite;"></i>';

    try {
        const { data: json, error } = await supabaseClient.functions.invoke('consultar-placa', {
            body: { placa }
        });

        if (error) {
            console.error("Erro na Edge Function:", error);
            showToast("Veículo não encontrado ou erro na API.", "error");
            return;
        }

        if (json && json.status === 'ok' && json.dados && json.dados.informacoes_veiculo && json.dados.informacoes_veiculo.dados_veiculo) {
            const data = json.dados.informacoes_veiculo.dados_veiculo;
            document.getElementById('os-marca').value = data.marca || '';
            document.getElementById('os-modelo').value = data.modelo || '';
            document.getElementById('os-ano').value = data.ano_modelo || data.ano_fabricacao || '';
            document.getElementById('os-cor').value = data.cor || '';
            document.getElementById('os-combustivel').value = data.combustivel || '';
            if (data.renavam && !document.getElementById('os-renavam').value) {
                document.getElementById('os-renavam').value = data.renavam;
            }
            showToast("Dados do veículo preenchidos com sucesso!", "success");
        } else {
            showToast(json.mensagem || "Consulta concluída, mas dados incompletos. Preencha manualmente.", "info");
        }
        
    } catch (error) {
        console.error("Erro ao consultar placa:", error);
        showToast("Serviço de consulta instável. Preencha manualmente.", "error");
    } finally {
        btnConsultar.innerHTML = originalIcon;
        btnConsultar.disabled = false;
    }
}

async function submitOSForm() {
    // Check if cash drawer is open for today
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) {
        showToast("Operação bloqueada: O caixa de hoje está fechado ou não foi aberto.", "error");
        return;
    }

    if (!currentSelectedServiceId) {
        showToast("Por favor, selecione um serviço.", "error");
        return;
    }

    const valor = parseFloat(document.getElementById('os-valor').value);
    const placa = document.getElementById('os-placa').value.trim().toUpperCase();
    const renavam = document.getElementById('os-renavam').value.trim();
    const marca = document.getElementById('os-marca').value.trim().toUpperCase();
    const modelo = document.getElementById('os-modelo').value.trim().toUpperCase();
    const ano = document.getElementById('os-ano').value.trim().toUpperCase();
    const cor = document.getElementById('os-cor').value.trim().toUpperCase();
    const combustivel = document.getElementById('os-combustivel').value.trim().toUpperCase();
    const nome = document.getElementById('os-nome-cliente').value.trim();
    const cpf = document.getElementById('os-cpf-cliente').value.trim();
    const cel = document.getElementById('os-celular-cliente').value.trim();
    const obs = document.getElementById('os-obs').value.trim();
    const docVeiculo = document.getElementById('os-doc-veiculo').checked;
    const docIdentidade = document.getElementById('os-doc-identificacao').checked;
    const detran = document.getElementById('os-detran').checked;
    const pagamento = document.getElementById('os-pagamento').value;
    const parcelasEl = document.getElementById('os-parcelas');
    const parcelas = (pagamento === 'credito_parcelado' && parcelasEl) ? parseInt(parcelasEl.value) : null;
    const partnerId = parseInt(document.getElementById('os-parceiro-select').value);

    // New Fields
    const chassi = document.getElementById('os-veiculo-chassi') ? document.getElementById('os-veiculo-chassi').value.trim() : '';
    const finalidade = document.getElementById('os-finalidade') ? document.getElementById('os-finalidade').value : '';
    const endereco = document.getElementById('os-cliente-endereco') ? document.getElementById('os-cliente-endereco').value.trim() : '';
    const numParcelas = document.getElementById('os-parcelas') ? parseInt(document.getElementById('os-parcelas').value) : 1;

    // Form Validations
    if (!placa || !nome || !cpf || !cel) {
        showToast("Preencha todos os campos obrigatórios do solicitante e veículo.", "error");
        return;
    }

    if (currentClientType === 'parceiro' && isNaN(partnerId)) {
        showToast("Selecione um parceiro válido.", "error");
        return;
    }

    if (isNaN(valor) || valor <= 0) {
        showToast("Por favor, preencha o valor do serviço corretamente.", "error");
        return;
    }

    if (!docVeiculo || !docIdentidade) {
        showToast("Erro: É obrigatório apresentar os documentos físicos do solicitante e do veículo.", "error");
        return;
    }

    const service = db.servicos.find(s => s.id === currentSelectedServiceId);

    // Build pending OS
    const newOS = {
        numero: 'TEMP',
        criadoEm: new Date().toISOString(),
        criadoPor: currentSession.nome,
        unidadeId: activeUnitId,
        clienteTipo: currentClientType,
        parceiroId: currentClientType === 'parceiro' ? partnerId : null,
        clienteNome: nome,
        clienteCpfCnpj: cpf,
        clienteCelular: cel,
        clienteEndereco: endereco,
        placa: placa,
        renavam: renavam,
        veiculoChassi: chassi,
        marca: marca,
        modelo: modelo,
        veiculoMarcaModelo: `${marca} / ${modelo}`,
        ano: ano,
        veiculoAno: ano,
        cor: cor,
        combustivel: combustivel,
        servicoId: service.id,
        servicoNome: service.nome,
        osFinalidade: finalidade,
        valor: valor,
        observacoes: obs,
        pago: pagamento !== 'faturamento',
        formaPagamento: pagamento,
            parcelas: parcelas,
        parcelas: numParcelas,
        detranRegistrado: detran,
        docVeiculoApresentado: true,
        docIdentificacaoApresentado: true,
        status: pagamento !== 'faturamento' ? "paga" : "aberta",
        finalizadoEm: null,
        finalizadoPor: null,
        canceladoEm: null,
        canceladoPor: null,
        reapresentacaoOrigemID: null,
        statusNfse: "Pendente"
    };

    // Prepare contract and open modal
    window.pendingOS = newOS;
    window.pendingOS.contratoTexto = generateContractText(newOS);

    const contractHtml = renderMarkdown(window.pendingOS.contratoTexto);
    const contentContainer = document.getElementById('contrato-preview-content');
    if (contentContainer) {
        contentContainer.innerHTML = contractHtml;
    }
    
    document.getElementById('contrato-aceite-check').checked = false;
    document.getElementById('btn-confirmar-contrato').disabled = true;

    const modalEl = document.getElementById('modal-contrato-assinatura');
    if (modalEl) {
        modalEl.style.display = 'flex';
        modalEl.classList.add('active');
    }
}

function renderOSPipeline() {
    const searchVal = document.getElementById('os-search-input') ? document.getElementById('os-search-input').value.trim().toUpperCase() : '';
    let filteredOSs = [];

    if (searchVal) {
        filteredOSs = db.ordens_servico.filter(o => 
            o.unidadeId === activeUnitId && 
            (o.numero.toUpperCase().includes(searchVal) || 
             o.placa.toUpperCase().includes(searchVal) || 
             o.clienteNome.toUpperCase().includes(searchVal))
        );
    } else {
        const today = getLocalToday();
        filteredOSs = db.ordens_servico.filter(o => o.unidadeId === activeUnitId && o.criadoEm.startsWith(today));
    }

    const listContainer = document.getElementById('recent-services-list');
    if (!listContainer) return;

    if (filteredOSs.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--text-muted);">${searchVal ? 'Nenhum serviço encontrado para esta busca.' : 'Nenhum serviço registrado hoje.'}</td></tr>`;
        return;
    }

    listContainer.innerHTML = filteredOSs.map(os => {
        const time = new Date(os.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        let statusBadge = '';
        if (os.status === 'aberta') statusBadge = '<span class="badge badge-waiting"><span class="badge-dot"></span> Aberta</span>';
        else if (os.status === 'paga') statusBadge = '<span class="badge badge-progress"><span class="badge-dot"></span> Paga</span>';
        else if (os.status === 'em_execucao') statusBadge = '<span class="badge badge-progress"><span class="badge-dot"></span> Em Vistoria</span>';
        else if (os.status === 'concluida_aprovada') statusBadge = '<span class="badge badge-done"><span class="badge-dot"></span> Aprovada</span>';
        else if (os.status === 'concluida_reprovada') statusBadge = '<span class="badge badge-cancelled"><span class="badge-dot"></span> Reprovada</span>';
        else if (os.status === 'cancelada') statusBadge = '<span class="badge badge-cancelled"><span class="badge-dot"></span> Cancelada</span>';

        const isPending = os.status === 'aberta' || os.status === 'paga' || os.status === 'em_execucao';

        return `
            <tr>
                <td><strong style="color: var(--accent);">${os.numero}</strong></td>
                <td>${time}</td>
                <td>
                    <strong>${os.clienteNome}</strong><br>
                    <small style="color: var(--text-secondary); font-weight: 500;">PLACA: ${os.placa}</small>
                </td>
                <td>${os.servicoNome.split(' — ')[0]}</td>
                <td style="font-weight: 600; color: var(--success);">${formatCurrency(os.valor)}</td>
                <td><span style="text-transform: uppercase; font-size: 11px;">${os.formaPagamento}</span></td>
                <td>${statusBadge}</td>
                <td style="text-align: right; padding-right: 20px;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="openOSDetailsModal(${os.id})" title="Ver Ficha"><i class="ri-eye-line"></i></button>
                        ${isPending ? `<button class="btn btn-success btn-sm btn-icon" onclick="openConcludeVistoriaModal(${os.id})" title="Concluir Vistoria"><i class="ri-check-line"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Open conclusion validation questionnaire modal
function openConcludeVistoriaModal(osId) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;

    const service = db.servicos.find(s => s.id === os.servicoId);
    let questionHtml = "";

    if (service.categoria === "Transferência") {
        questionHtml = `
            <div class="form-group" style="background: rgba(212,160,23,0.04); border: 1px solid var(--border); padding: 16px; border-radius: var(--radius-sm); margin-bottom: 20px;">
                <label style="font-weight: 700; font-size: 13px; color: var(--accent); display: block; margin-bottom: 8px;">Vistoria cadastrada no DETRAN NET?</label>
                <div style="display: flex; gap: 24px;">
                    <label class="form-check" style="margin-bottom:0;">
                        <input type="radio" name="qst-detran" value="SIM" id="qst-detran-sim">
                        <span>Sim</span>
                    </label>
                    <label class="form-check" style="margin-bottom:0;">
                        <input type="radio" name="qst-detran" value="NAO" id="qst-detran-nao">
                        <span>Não</span>
                    </label>
                </div>
                <div id="qst-error" style="color: var(--danger); font-size: 11px; margin-top: 8px; display: none; font-weight: 600;">
                    * Responda à pergunta para prosseguir com a conclusão.
                </div>
            </div>
        `;
    } else if (service.categoria === "Cautelar") {
        questionHtml = `
            <div class="form-group" style="background: rgba(212,160,23,0.04); border: 1px solid var(--border); padding: 16px; border-radius: var(--radius-sm); margin-bottom: 20px;">
                <label style="font-weight: 700; font-size: 13px; color: var(--accent); display: block; margin-bottom: 8px;">A vistoria necessita de cadastro do shopping?</label>
                <div style="display: flex; gap: 24px;">
                    <label class="form-check" style="margin-bottom:0;">
                        <input type="radio" name="qst-shopping" value="SIM" id="qst-shopping-sim">
                        <span>Sim</span>
                    </label>
                    <label class="form-check" style="margin-bottom:0;">
                        <input type="radio" name="qst-shopping" value="NAO" id="qst-shopping-nao">
                        <span>Não</span>
                    </label>
                </div>
                <div id="qst-error" style="color: var(--danger); font-size: 11px; margin-top: 8px; display: none; font-weight: 600;">
                    * Responda à pergunta para prosseguir com a conclusão.
                </div>
            </div>
        `;
    }

    const modal = document.getElementById('modal-os-detalhes');
    document.getElementById('detalhes-os-title').textContent = `Concluir Vistoria — ${os.numero}`;
    
    document.getElementById('detalhes-os-body').innerHTML = `
        <div style="margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 14px;">
            <h4 style="font-size: 14px; margin-bottom: 6px;">Veículo Placa: <strong>${os.placa}</strong></h4>
            <p style="font-size: 12px; color: var(--text-secondary);">${os.servicoNome}</p>
            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Cliente: ${os.clienteNome}</p>
        </div>
        
        ${questionHtml}
        
        <div class="form-group" style="margin-top: 10px;">
            <label style="font-weight: 700; font-size: 12px; color: var(--text-primary); text-transform: uppercase;">Resultado da Vistoria Física</label>
            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4;">
                Selecione o parecer técnico final obtido no pátio para concluir o fluxo e emitir o laudo de vistoria.
            </p>
        </div>
    `;

    document.getElementById('detalhes-os-footer').innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="closeOSModal()">Cancelar</button>
        <button class="btn btn-danger btn-sm" onclick="submitConcludeVistoria(${os.id}, false)"><i class="ri-close-circle-line"></i> Reprovar Veículo</button>
        <button class="btn btn-success btn-sm" onclick="submitConcludeVistoria(${os.id}, true)"><i class="ri-checkbox-circle-line"></i> Aprovar Veículo</button>
    `;

    modal.classList.add('active');
}

// Submit and validate conclusion answers
async function submitConcludeVistoria(osId, approved) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;

    const service = db.servicos.find(s => s.id === os.servicoId);
    let ans = null;

    if (service.categoria === "Transferência") {
        const sim = document.getElementById('qst-detran-sim').checked;
        const nao = document.getElementById('qst-detran-nao').checked;
        if (!sim && !nao) {
            document.getElementById('qst-error').style.display = 'block';
            return;
        }
        ans = sim ? "SIM" : "NAO";
    } else if (service.categoria === "Cautelar") {
        const sim = document.getElementById('qst-shopping-sim').checked;
        const nao = document.getElementById('qst-shopping-nao').checked;
        if (!sim && !nao) {
            document.getElementById('qst-error').style.display = 'block';
            return;
        }
        ans = sim ? "SIM" : "NAO";
    }

    const updates = {
        status: approved ? "concluida_aprovada" : "concluida_reprovada",
        finalizadoEm: new Date().toISOString(),
        finalizadoPor: currentSession.nome
    };
    if (ans && service.categoria === "Transferência") updates.respostaDetranNet = ans;
    if (ans && service.categoria === "Cautelar") updates.respostaShopping = ans;

    try {
        await sbUpdate('ordens_servico', osId, updates);
        cacheUpdate('ordens_servico', osId, updates);

        showToast(`Vistoria concluída! Laudo ${approved ? 'APROVADO' : 'REPROVADO'} para placa ${os.placa}.`, "info");

        let auditMsg = `Concluiu a OS ${os.numero} (Placa: ${os.placa}) como ${approved ? 'APROVADO' : 'REPROVADO'}.`;
        if (ans) {
            auditMsg += ` Checklist de encerramento respondido: ${ans}.`;
        }
        logAudit("Laudo Emissão", auditMsg);

        closeOSModal();
        renderAtendimentoPage();
    } catch (e) {
        console.error('[Certive] submitConcludeVistoria error:', e);
        showToast("Erro ao concluir vistoria no servidor.", "error");
    }
}

// OS Details Modal
function openOSDetailsModal(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    const modal = document.getElementById('modal-os-detalhes');
    document.getElementById('detalhes-os-title').textContent = `Ficha da Ordem de Serviço ${os.numero}`;
    
    // Status text mapping
    const statusMap = {
        'aberta': '🔵 Aguardando Pagamento',
        'paga': '💳 Paga (Aguardando Vistoriador)',
        'em_execucao': '🚗 Veículo em Vistoria no Pátio',
        'concluida_aprovada': '✅ Aprovada / Concluída',
        'concluida_reprovada': '❌ Reprovada',
        'cancelada': '🚫 Venda Cancelada'
    };

    let timelineHtml = `
        <div class="timeline">
            <div class="timeline-item done">
                <div class="tl-title">Ficha Registrada</div>
                <div class="tl-time">${formatDateTimeBr(os.criadoEm)} por ${os.criadoPor}</div>
            </div>
    `;

    if (os.pago && os.status !== 'cancelada') {
        timelineHtml += `
            <div class="timeline-item done">
                <div class="tl-title">Pagamento Confirmado (${os.formaPagamento.toUpperCase()})</div>
                <div class="tl-time">R$ ${os.valor.toFixed(2)}</div>
            </div>
        `;
    }

    if (os.status === 'em_execucao' || os.status === 'concluida_aprovada' || os.status === 'concluida_reprovada') {
        timelineHtml += `
            <div class="timeline-item done">
                <div class="tl-title">Entrou no Pátio de Vistoria</div>
                <div class="tl-time">Acompanhamento de fluxo</div>
            </div>
        `;
    }

    if (os.status.startsWith('concluida')) {
        timelineHtml += `
            <div class="timeline-item done">
                <div class="tl-title">Laudo emitido: ${os.status === 'concluida_aprovada' ? 'APROVADO' : 'REPROVADO'}</div>
                <div class="tl-time">${formatDateTimeBr(os.finalizadoEm)} por ${os.finalizadoPor}</div>
            </div>
        `;
    }

    if (os.status === 'cancelada') {
        timelineHtml += `
            <div class="timeline-item cancelled">
                <div class="tl-title">O.S. Cancelada</div>
                <div class="tl-time">${formatDateTimeBr(os.canceladoEm)} por ${os.canceladoPor}</div>
            </div>
        `;
    }

    timelineHtml += `</div>`;

    // Recheck / Reapresentação Banner (If Reproved)
    let recheckBannerHtml = "";
    if (os.status === "concluida_reprovada") {
        const service = db.servicos.find(s => s.id === os.servicoId);
        if (service && service.categoria === "Transferência") {
            const daysLeft = getRecheckDaysRemaining(os.finalizadoEm);
            if (daysLeft >= 0) {
                // Check if already rechecked
                const rechecked = db.ordens_servico.find(o => o.reapresentacaoOrigemID === os.id);
                if (rechecked) {
                    recheckBannerHtml = `
                        <div style="background: var(--success-bg); border: 1px solid var(--success); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 16px; color: var(--text-primary); font-size: 13px;">
                            <i class="ri-checkbox-circle-line"></i> Reapresentação já efetuada na ordem <strong>${rechecked.numero}</strong>.
                        </div>
                    `;
                } else {
                    recheckBannerHtml = `
                        <div style="background: var(--warning-bg); border: 1px solid var(--warning); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 16px; color: var(--text-primary); font-size: 13px;">
                            <i class="ri-time-line"></i> Vistoria Reprovada. Prazo de reapresentação gratuita expira em <strong>${daysLeft} dias</strong>.
                        </div>
                    `;
                }
            } else {
                recheckBannerHtml = `
                    <div style="background: var(--danger-bg); border: 1px solid var(--danger); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 16px; color: var(--text-primary); font-size: 13px;">
                        <i class="ri-error-warning-line"></i> Prazo de reapresentação gratuita (30 dias) <strong>EXPIRADO</strong>.
                    </div>
                `;
            }
        }
    }

    document.getElementById('detalhes-os-body').innerHTML = `
        ${recheckBannerHtml}
        <div class="detail-grid">
            <div class="detail-item"><label>Número da OS</label><strong>${os.numero}</strong></div>
            <div class="detail-item"><label>Status Atual</label><span style="font-weight: 700; color: var(--accent);">${statusMap[os.status]}</span></div>
            <div class="detail-item"><label>Tipo de Cliente</label><span>${os.clienteTipo.toUpperCase()}</span></div>
            <div class="detail-item"><label>Placa do Veículo</label><strong>${os.placa}</strong></div>
            <div class="detail-item"><label>Renavam</label><span>${os.renavam || '-'}</span></div>
            <div class="detail-item"><label>Marca / Modelo</label><span>${os.marca || '-'} / ${os.modelo || '-'}</span></div>
            <div class="detail-item"><label>Ano / Cor</label><span>${os.ano || '-'} / ${os.cor || '-'}</span></div>
            <div class="detail-item"><label>Combustível</label><span>${os.combustivel || '-'}</span></div>
            <div class="detail-item"><label>Solicitante</label><span>${os.clienteNome}</span></div>
            <div class="detail-item"><label>CPF / CNPJ</label><span>${os.clienteCpfCnpj}</span></div>
            <div class="detail-item"><label>Celular</label><span>${os.clienteCelular}</span></div>
            <div class="detail-item"><label>Serviço Executado</label><span>${os.servicoNome}</span></div>
            <div class="detail-item"><label>Valor Final</label><strong style="color: var(--success);">${formatCurrency(os.valor)}</strong></div>
            <div class="detail-item"><label>Cobrança</label><span>${os.formaPagamento === 'credito_parcelado' ? `CRÉDITO PARCELADO (${os.parcelas}x)` : os.formaPagamento.toUpperCase()}</span></div>
            <div class="detail-item"><label>DETRAN-SC Registrada</label><span>${os.detranRegistrado ? '🟢 Registrada' : '🔴 Não Registrada'}</span></div>
            <div class="detail-item" style="grid-column: span 2;"><label>Observações do Veículo (Modelo, Ano, Cor)</label><span>${os.observacoes || '—'}</span></div>
        </div>
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--accent);">Histórico de Fluxo:</h4>
        ${timelineHtml}
    `;

    // Footer actions depending on permissions & state
    let footerHtml = `
        <button class="btn btn-secondary" onclick="printContractById(${os.id})"><i class="ri-printer-line"></i> Imprimir Contrato</button>
    `;

    if (currentSession.permissoes.includes("abertura_os")) {
        // Can advance status
        if (os.status === 'aberta') {
            footerHtml += `<button class="btn btn-warning" onclick="openEditOSModal(${os.id})"><i class="ri-edit-line"></i> Editar OS</button>`;
            footerHtml += `<button class="btn btn-danger" onclick="deleteOS(${os.id})"><i class="ri-delete-bin-line"></i> Excluir OS</button>`;
            footerHtml += `<button class="btn btn-primary" onclick="changeOSStatus(${os.id}, 'paga')"><i class="ri-currency-line"></i> Confirmar Pagamento</button>`;
        }
        if (os.status === 'paga') {
            footerHtml += `<button class="btn btn-warning" onclick="changeOSStatus(${os.id}, 'em_execucao')"><i class="ri-play-line"></i> Iniciar Vistoria</button>`;
        }
        if (os.status === 'em_execucao') {
            footerHtml += `
                <button class="btn btn-success" onclick="openConcludeVistoriaModal(${os.id})"><i class="ri-checkbox-circle-line"></i> Concluir Vistoria</button>
            `;
        }
        // Cancel Action (Estorno)
        if (os.status !== 'cancelada' && !os.status.startsWith('concluida')) {
            footerHtml += `<button class="btn btn-danger btn-sm" style="margin-right: auto;" onclick="cancelOS(${os.id})"><i class="ri-close-line"></i> Cancelar OS</button>`;
        }
        // Reapresentar action
        if (os.status === "concluida_reprovada" && db.servicos.find(s => s.id === os.servicoId).categoria === "Transferência") {
            const daysLeft = getRecheckDaysRemaining(os.finalizadoEm);
            const alreadyRechecked = db.ordens_servico.find(o => o.reapresentacaoOrigemID === os.id);
            if (daysLeft >= 0 && !alreadyRechecked) {
                footerHtml += `<button class="btn btn-warning" onclick="triggerRecheckOS(${os.id})"><i class="ri-repeat-line"></i> Reapresentar sem Custo</button>`;
            }
        }
    }

    document.getElementById('detalhes-os-footer').innerHTML = footerHtml;
    modal.classList.add('active');
}

// closeOSModal with optional event parameter (single definition)
// (duplicate removed — see below)

function closeOSModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-os-detalhes').classList.remove('active');
}

async function changeOSStatus(id, newStatus) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    try {
        const updates = { status: newStatus };

        // If transitioned to paga, create financial movement
        if (newStatus === 'paga') {
            updates.pago = true;
            const activeCaixa = getTodayOpenCaixa();
            if (activeCaixa) {
                const movRecord = {
                    caixaId: activeCaixa.id,
                    tipo: "entrada",
                    valor: os.valor,
                    descricao: `Serviço ${os.servicoNome.split(' — ')[0]} (Placa: ${os.placa})`,
                    formaPagamento: os.formaPagamento,
                    data: new Date().toISOString(),
                    operador: currentSession.nome,
                    osId: os.id,
                    faturaId: null
                };
                const insertedMov = await sbInsert('caixa_movimentos', movRecord);
                cacheInsert('caixa_movimentos', insertedMov);
            } else {
                showToast("Erro: Caixa fechado. Abra o caixa antes de confirmar pagamento.", "error");
                return;
            }
        }

        await sbUpdate('ordens_servico', id, updates);
        cacheUpdate('ordens_servico', id, updates);

        showToast(`O.S. ${os.numero} movida para ${newStatus.toUpperCase()}`, "success");
        logAudit("Atualização OS", `Alterou status da ${os.numero} para ${newStatus}.`);
        closeOSModal();
        renderAtendimentoPage();
    } catch (e) {
        console.error('[Certive] changeOSStatus error:', e);
        showToast("Erro ao alterar status da OS.", "error");
    }
}

async function finalizeVistoria(id, approved) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    const updates = {
        status: approved ? "concluida_aprovada" : "concluida_reprovada",
        finalizadoEm: new Date().toISOString(),
        finalizadoPor: currentSession.nome
    };

    try {
        await sbUpdate('ordens_servico', id, updates);
        cacheUpdate('ordens_servico', id, updates);

        showToast(`Vistoria concluída! Laudo ${approved ? 'APROVADO' : 'REPROVADO'} para placa ${os.placa}.`, "info");
        logAudit("Laudo Emissão", `Laudou a OS ${os.numero} como ${approved ? 'APROVADO' : 'REPROVADO'}.`);
        closeOSModal();
        renderAtendimentoPage();
    } catch (e) {
        console.error('[Certive] finalizeVistoria error:', e);
        showToast("Erro ao finalizar vistoria.", "error");
    }
}

async function cancelOS(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    try {
        // Estorno do Caixa if paid
        if (os.pago && os.formaPagamento !== 'faturamento') {
            const activeCaixa = getTodayOpenCaixa();
            if (activeCaixa) {
                const movRecord = {
                    caixaId: activeCaixa.id,
                    tipo: "saida",
                    valor: os.valor,
                    descricao: `Estorno OS ${os.numero} (Venda Cancelada)`,
                    formaPagamento: os.formaPagamento,
                    data: new Date().toISOString(),
                    operador: currentSession.nome,
                    osId: os.id,
                    faturaId: null
                };
                const insertedMov = await sbInsert('caixa_movimentos', movRecord);
                cacheInsert('caixa_movimentos', insertedMov);
            } else {
                showToast("Erro: O caixa está fechado. Abra o caixa para cancelar uma O.S. já paga.", "error");
                return;
            }
        }

        const updates = {
            status: "cancelada",
            canceladoEm: new Date().toISOString(),
            canceladoPor: currentSession.nome
        };
        await sbUpdate('ordens_servico', id, updates);
        cacheUpdate('ordens_servico', id, updates);

        showToast(`O.S. ${os.numero} cancelada. Venda estornada do caixa.`, "error");
        logAudit("Cancelamento OS", `Cancelou a OS ${os.numero} (placa ${os.placa}).`);
        closeOSModal();
        renderAtendimentoPage();
    } catch (e) {
        console.error('[Certive] cancelOS error:', e);
        showToast("Erro ao cancelar OS.", "error");
    }
}

function openEditOSModal(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;
    
    // Only allow editing if status is 'aberta'
    if (os.status !== 'aberta') {
        showToast("Operação bloqueada: Só é permitido editar ordens de serviço em status ABERTA.", "error");
        return;
    }

    document.getElementById('edit-os-id').value = os.id;
    document.getElementById('edit-os-nome').value = os.clienteNome;
    document.getElementById('edit-os-cpf').value = os.clienteCpfCnpj;
    document.getElementById('edit-os-celular').value = os.clienteCelular;
    document.getElementById('edit-os-placa').value = os.placa;
    document.getElementById('edit-os-renavam').value = os.renavam || '';
    document.getElementById('edit-os-marca').value = os.marca || '';
    document.getElementById('edit-os-modelo').value = os.modelo || '';
    document.getElementById('edit-os-ano').value = os.ano || '';
    document.getElementById('edit-os-cor').value = os.cor || '';
    document.getElementById('edit-os-combustivel').value = os.combustivel || '';
    document.getElementById('edit-os-obs').value = os.observacoes || '';
    
    // Populate service dropdown
    const select = document.getElementById('edit-os-servico');
    if (select) {
        select.innerHTML = db.servicos.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
        select.value = os.servicoId;
    }
    
    document.getElementById('edit-os-valor').value = os.valor.toFixed(2);
    document.getElementById('edit-os-pagamento').value = os.formaPagamento;
    if (os.formaPagamento === 'credito_parcelado') {
        document.getElementById('edit-os-parcelas-group').style.display = 'block';
        document.getElementById('edit-os-parcelas').value = os.parcelas || '1';
    } else {
        document.getElementById('edit-os-parcelas-group').style.display = 'none';
    }
    document.getElementById('edit-os-detran').checked = os.detranRegistrado;
    
    const priceInput = document.getElementById('edit-os-valor');
    if (os.servicoId === 6) {
        priceInput.disabled = false;
    } else {
        priceInput.disabled = (os.clienteTipo === 'parceiro');
    }
    
    // Show modal
    document.getElementById('modal-os-editar').classList.add('active');
}

function updateEditOSPrice() {
    const osId = parseInt(document.getElementById('edit-os-id').value);
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;
    
    const serviceId = parseInt(document.getElementById('edit-os-servico').value);
    const service = db.servicos.find(s => s.id === serviceId);
    if (!service) return;
    
    const priceInput = document.getElementById('edit-os-valor');
    if (serviceId === 6) {
        priceInput.disabled = false;
        priceInput.value = '';
        priceInput.placeholder = 'Digite o valor acordado';
        return;
    }
    
    let price = service.precoBalcao;
    if (os.clienteTipo === 'parceiro' && os.parceiroId) {
        const partner = db.parceiros.find(p => p.id === os.parceiroId);
        if (partner && partner.tabelaPrecos) {
            price = partner.tabelaPrecos[serviceId] || service.precoBalcao;
        }
    }
    priceInput.value = price.toFixed(2);
    priceInput.placeholder = '0,00';
    priceInput.disabled = (os.clienteTipo === 'parceiro');
}

async function submitEditOSForm(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('edit-os-id').value);
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;
    
    if (os.status !== 'aberta') {
        showToast("Erro: Esta OS não está mais aberta.", "error");
        return;
    }

    const nome = document.getElementById('edit-os-nome').value.trim();
    const cpf = document.getElementById('edit-os-cpf').value.trim();
    const cel = document.getElementById('edit-os-celular').value.trim();
    const placa = document.getElementById('edit-os-placa').value.trim().toUpperCase();
    const renavam = document.getElementById('edit-os-renavam').value.trim();
    const marca = document.getElementById('edit-os-marca').value.trim().toUpperCase();
    const modelo = document.getElementById('edit-os-modelo').value.trim().toUpperCase();
    const ano = document.getElementById('edit-os-ano').value.trim().toUpperCase();
    const cor = document.getElementById('edit-os-cor').value.trim().toUpperCase();
    const combustivel = document.getElementById('edit-os-combustivel').value.trim().toUpperCase();
    const obs = document.getElementById('edit-os-obs').value.trim();
    const serviceId = parseInt(document.getElementById('edit-os-servico').value);
    const valor = parseFloat(document.getElementById('edit-os-valor').value);
    const pagamento = document.getElementById('edit-os-pagamento').value;
    const parcelas = pagamento === 'credito_parcelado' ? parseInt(document.getElementById('edit-os-parcelas').value) : null;
    const detran = document.getElementById('edit-os-detran').checked;

    if (!nome || !cpf || !cel || !placa || !serviceId || isNaN(valor) || valor <= 0) {
        showToast("Preencha todos os campos obrigatórios e informe um valor válido.", "error");
        return;
    }

    const service = db.servicos.find(s => s.id === serviceId);

    const updates = {
        clienteNome: nome,
        clienteCpfCnpj: cpf,
        clienteCelular: cel,
        placa: placa,
        renavam: renavam,
        marca: marca,
        modelo: modelo,
        ano: ano,
        cor: cor,
        combustivel: combustivel,
        observacoes: obs,
        servicoId: service.id,
        servicoNome: service.nome,
        valor: valor,
        formaPagamento: pagamento,
            parcelas: parcelas,
        detranRegistrado: detran
    };

    try {
        await sbUpdate('ordens_servico', id, updates);
        cacheUpdate('ordens_servico', id, updates);

        showToast("Ordem de Serviço editada com sucesso!", "success");
        logAudit("Edição OS", `Editou os dados da OS ${os.numero} (Placa: ${placa}).`);

        closeEditOSModal();
        closeOSModal();
        renderAtendimentoPage();
    } catch (e) {
        console.error('[Certive] submitEditOSForm error:', e);
        showToast("Erro ao editar OS.", "error");
    }
}

async function deleteOS(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;
    
    if (os.status !== 'aberta') {
        showToast("Operação bloqueada: Só é permitido excluir ordens de serviço em status ABERTA.", "error");
        return;
    }

    // Block deletion if OS is part of an invoice
    if (os.faturaId) {
        showToast("Esta O.S. está vinculada a uma fatura. Não é possível excluir.", "error");
        return;
    }

    const confirmed = await showConfirm({
        title: 'Excluir Ordem de Serviço',
        message: `Tem certeza que deseja excluir permanentemente a <strong>OS ${os.numero}</strong>?<br><br>Esta ação não poderá ser desfeita.`,
        icon: '🗑️',
        confirmText: 'Excluir',
        confirmClass: 'btn-danger'
    });
    if (confirmed) {
        try {
            // Delete related cash movements
            const relatedMovs = db.caixa_movimentos.filter(m => m.osId === id);
            for (const mov of relatedMovs) {
                await sbDelete('caixa_movimentos', mov.id);
                cacheDelete('caixa_movimentos', mov.id);
            }

            await sbDelete('ordens_servico', id);
            cacheDelete('ordens_servico', id);

            showToast(`OS ${os.numero} excluída com sucesso!`, "success");
            logAudit("Exclusão OS", `Excluiu permanentemente a OS ${os.numero} (Placa: ${os.placa}).`);

            closeOSModal();
            renderAtendimentoPage();
        } catch (e) {
            console.error('[Certive] deleteOS error:', e);
            showToast("Erro ao excluir OS.", "error");
        }
    }
}

function closeEditOSModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-os-editar').classList.remove('active');
}


// Free re-inspection handler (reapresentação)
function triggerRecheckOS(parentOsId) {
    const parentOs = db.ordens_servico.find(o => o.id === parentOsId);
    if (!parentOs) return;

    // Prefill form
    currentClientType = parentOs.clienteTipo;
    selectClientType(parentOs.clienteTipo);
    
    if (parentOs.parceiroId) {
        document.getElementById('os-parceiro-select').value = parentOs.parceiroId;
        loadPartnerServices(parentOs.parceiroId);
    }

    currentSelectedServiceId = parentOs.servicoId;
    document.querySelectorAll('.service-option').forEach(el => el.classList.remove('selected'));
    const svcEl = document.getElementById(`lbl-svc-${parentOs.servicoId}`);
    if (svcEl) svcEl.classList.add('selected');

    // Override to R$ 0,00 and lock
    document.getElementById('os-valor').value = "0.00";
    document.getElementById('os-valor').disabled = true;

    document.getElementById('os-placa').value = parentOs.placa;
    document.getElementById('os-renavam').value = parentOs.renavam;
    document.getElementById('os-nome-cliente').value = parentOs.clienteNome;
    document.getElementById('os-cpf-cliente').value = parentOs.clienteCpfCnpj;
    document.getElementById('os-celular-cliente').value = parentOs.clienteCelular;
    document.getElementById('os-obs').value = parentOs.observacoes || 'REAPRESENTAÇÃO';
    
    document.getElementById('os-doc-veiculo').checked = true;
    document.getElementById('os-doc-identificacao').checked = true;
    
    // Set payment to Isento
    const paymentSelect = document.getElementById('os-pagamento');
    // Remove existing isento option if any, then add
    const existingIsento = paymentSelect.querySelector('option[value="isento"]');
    if (!existingIsento) {
        paymentSelect.innerHTML += `<option value="isento" selected>Isento (Reapresentação)</option>`;
    } else {
        existingIsento.selected = true;
    }
    paymentSelect.value = "isento";

    // Show Toast
    showToast("Reapresentação gratuita ativada. Verifique os dados e registre a OS.", "info");
    closeOSModal();
    
    // Link on save: Intercept save behavior for recheck
    // We will save parent OS ID as global to link it on submission
    window.activeRecheckOrigemId = parentOs.id;
}

// Intercept submission to append recheck link
const originalSubmitOSForm = submitOSForm;
submitOSForm = async function() {
    const activeOrigemId = window.activeRecheckOrigemId;
    if (activeOrigemId) {
        // Create OS
        const activeCaixa = getTodayOpenCaixa();
        if (!activeCaixa) {
            showToast("Operação bloqueada: Caixa fechado.", "error");
            return;
        }

        const valor = 0.00;
        const placa = document.getElementById('os-placa').value.trim().toUpperCase();
        const renavam = document.getElementById('os-renavam').value.trim();
        const nome = document.getElementById('os-nome-cliente').value.trim();
        const cpf = document.getElementById('os-cpf-cliente').value.trim();
        const cel = document.getElementById('os-celular-cliente').value.trim();
        const obs = document.getElementById('os-obs').value.trim();
        const service = db.servicos.find(s => s.id === currentSelectedServiceId);

        if (!placa || !renavam || !nome || !cpf || !cel || !obs) {
            showToast("Preencha todos os campos do solicitante, veículo e observações.", "error");
            return;
        }

        const newOS = {
            numero: 'TEMP',
            criadoEm: new Date().toISOString(),
            criadoPor: currentSession.nome,
            unidadeId: activeUnitId,
            clienteTipo: currentClientType,
            parceiroId: currentClientType === 'parceiro' ? parseInt(document.getElementById('os-parceiro-select').value) : null,
            clienteNome: nome,
            clienteCpfCnpj: cpf,
            clienteCelular: cel,
            placa: placa,
            renavam: renavam,
            servicoId: service.id,
            servicoNome: service.nome,
            valor: valor,
            observacoes: obs,
            pago: true,
            formaPagamento: "isento",
            detranRegistrado: document.getElementById('os-detran').checked,
            docVeiculoApresentado: true,
            docIdentificacaoApresentado: true,
            status: "paga", // bypasses payment
            finalizadoEm: null,
            finalizadoPor: null,
            canceladoEm: null,
            canceladoPor: null,
            reapresentacaoOrigemID: activeOrigemId
        };

        try {
            const insertedOS = await sbInsert('ordens_servico', newOS);
            const num = await getNextOSNumber();
            await sbUpdate('ordens_servico', insertedOS.id, { numero: num });
            insertedOS.numero = num;
            cacheUnshift('ordens_servico', insertedOS);

            // Link original OS (mark as reapresentada)
            const originalOS = db.ordens_servico.find(o => o.id === activeOrigemId);
            if (originalOS) {
                const reapData = new Date().toISOString();
                await sbUpdate('ordens_servico', activeOrigemId, { reapresentadaData: reapData });
                cacheUpdate('ordens_servico', activeOrigemId, { reapresentadaData: reapData });
            }

            showToast(`Reapresentação registrada com sucesso! ${num}`, "success");
            logAudit("Reapresentação OS", `Registrou reapresentação gratuita ${num} referente a ${originalOS ? originalOS.numero : activeOrigemId}.`);

            // Print
            printContract(insertedOS);

            // Clean up
            window.activeRecheckOrigemId = null;

            // Restore payment select options
            const paymentSelect = document.getElementById('os-pagamento');
            paymentSelect.innerHTML = `
                <option value="pix">Pix (Transferência Online)</option>
                <option value="debito">Cartão de Débito</option>
                <option value="credito">Cartão de Crédito</option>
                <option value="especie">Dinheiro (Espécie)</option>
                <option value="faturamento" id="opt-pagamento-faturamento" disabled>Faturamento Mensal (Apenas parceiros habilitados)</option>
            `;

            clearOSForm();
            renderAtendimentoPage();
        } catch (e) {
            console.error('[Certive] triggerRecheckOS error:', e);
            showToast("Erro ao registrar reapresentação.", "error");
        }
    } else {
        await originalSubmitOSForm();
    }
};

function getRecheckDaysRemaining(finalizedDateIso) {
    if (!finalizedDateIso) return 0;
    const finalDate = new Date(finalizedDateIso);
    const today = new Date();
    // Normalize both to midnight local time
    finalDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = today - finalDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return 30 - diffDays;
}




function toggleParcelas() {
    const pag = document.getElementById('os-pagamento').value;
    const group = document.getElementById('os-parcelas-group');
    if (pag === 'credito_parcelado') {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
    }
}

function toggleInstallmentsEditOS() {
    const pag = document.getElementById('edit-os-pagamento').value;
    const group = document.getElementById('edit-os-parcelas-group');
    if (pag === 'credito_parcelado') {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
    }
}
