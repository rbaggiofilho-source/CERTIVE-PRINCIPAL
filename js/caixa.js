// MODULE: Caixa Diário
// ==========================================
// CONTROLE DE CAIXA DIÁRIO
// ==========================================
let currentCaixaTab = 'movimentos';

function switchCaixaTab(tab, btn) {
    currentCaixaTab = tab;
    document.querySelectorAll('#panel-caixa .tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    
    document.getElementById('tab-caixa-movimentos').style.display = tab === 'movimentos' ? 'block' : 'none';
    document.getElementById('tab-caixa-historico').style.display = tab === 'historico' ? 'block' : 'none';
    
    if (tab === 'historico') renderCaixaHistorico();
}



function renderCaixaPage() {
    const activeCaixa = getTodayOpenCaixa();
    const statusBadgeContainer = document.getElementById('caixa-status-badge');
    const movForm = document.getElementById('caixa-mov-form');
    const fecharForm = document.getElementById('caixa-fechar-form');

    // Populate Partner Dropdown in Cash Inflow
    const partnerSelect = document.getElementById('mov-parceiro-select');
    partnerSelect.innerHTML = '<option value="">Selecione...</option>' + 
        db.parceiros.filter(p => p.usaFaturamento).map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

    if (activeCaixa) {
        statusBadgeContainer.innerHTML = `<span class="badge badge-done"><span class="badge-dot"></span> Caixa Aberto</span>`;
        // Enable forms
        movForm.querySelectorAll('input, select, button').forEach(el => el.disabled = false);
        fecharForm.querySelectorAll('input, button').forEach(el => el.disabled = false);
        document.getElementById('btn-fechar-caixa').style.display = 'block';
    } else {
        // Cash drawer closed, check if we need an option to OPEN it
        statusBadgeContainer.innerHTML = `<span class="badge badge-cancelled"><span class="badge-dot"></span> Caixa Fechado</span>`;
        
        // Disable forms
        movForm.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
        fecharForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
        document.getElementById('btn-fechar-caixa').style.display = 'none';

        // Check if there is NO drawer opened/closed today at all, display OPEN DRAWER form
        const today = getLocalToday();
        const todayDrawer = db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.data === today);
        if (!todayDrawer) {
            statusBadgeContainer.innerHTML += `
                <button class="btn btn-warning btn-sm" style="margin-left: 10px;" onclick="openTodayCaixaDrawer()">
                    <i class="ri-play-line"></i> Abrir Caixa de Hoje
                </button>
            `;
        }
    }

    renderCaixaKPIs(activeCaixa);
    renderCaixaMovimentos(activeCaixa);
}

async function openTodayCaixaDrawer() {
    const today = getLocalToday();
    const newDrawer = {
        unidadeId: activeUnitId,
        data: today,
        status: "aberto",
        abertoPor: currentSession.nome,
        fechadoPor: null,
        saldoAbertura: 200.00,
        "saldoEspécieInformado": 0,
        fechadoEm: null
    };

    try {
        const inserted = await sbInsert('caixa_diario', newDrawer);
        cacheInsert('caixa_diario', inserted);
        showToast("Caixa diário aberto com fundo inicial de R$ 200,00.", "success");
        logAudit("Abertura Caixa", "Abriu o caixa diário da filial.");
        renderCaixaPage();
    } catch (e) {
        console.error('[Certive] openTodayCaixaDrawer error:', e);
        showToast("Erro ao abrir caixa.", "error");
    }
}

function renderCaixaKPIs(activeCaixa) {
    const kpiGrid = document.getElementById('caixa-kpis');
    if (!activeCaixa) {
        kpiGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h4>Caixa Fechado hoje para esta unidade.</h4></div>`;
        return;
    }

    const movs = db.caixa_movimentos.filter(m => m.caixaId === activeCaixa.id);
    
    const totalEntradas = movs.filter(m => m.tipo === 'entrada').reduce((sum, m) => sum + m.valor, 0);
    const totalSaidas = movs.filter(m => m.tipo === 'saida').reduce((sum, m) => sum + m.valor, 0);
    
    // Physical cash balance (Float + cash payments - cash sangrias)
    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const finalCashInDrawer = activeCaixa.saldoAbertura + cashPayments - cashSangrias;

    const totalBalance = totalEntradas - totalSaidas;

    kpiGrid.innerHTML = `
        <div class="kpi-card kpi-blue">
            <div class="kpi-icon"><i class="ri-add-line"></i></div>
            <div class="kpi-value">${formatCurrency(totalEntradas)}</div>
            <div class="kpi-label">Entradas Totais</div>
        </div>
        <div class="kpi-card kpi-red">
            <div class="kpi-icon"><i class="ri-subtract-line"></i></div>
            <div class="kpi-value">${formatCurrency(totalSaidas)}</div>
            <div class="kpi-label">Saídas Totais</div>
        </div>
        <div class="kpi-card kpi-green">
            <div class="kpi-icon"><i class="ri-wallet-3-line"></i></div>
            <div class="kpi-value">${formatCurrency(finalCashInDrawer)}</div>
            <div class="kpi-label">Saldo Físico Estimado (Espécie)</div>
        </div>
        <div class="kpi-card kpi-purple">
            <div class="kpi-icon"><i class="ri-funds-line"></i></div>
            <div class="kpi-value" style="color: ${totalBalance >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(totalBalance)}</div>
            <div class="kpi-label">Resultado do Dia</div>
        </div>
    `;
}

function renderCaixaMovimentos(activeCaixa) {
    const tbody = document.getElementById('caixa-mov-tbody');
    if (!activeCaixa) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Caixa Fechado.</td></tr>';
        return;
    }

    const movs = db.caixa_movimentos.filter(m => m.caixaId === activeCaixa.id);
    
    if (movs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum lançamento realizado hoje.</td></tr>';
        return;
    }

    tbody.innerHTML = movs.map(m => {
        const time = new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const valEntrada = m.tipo === 'entrada' ? formatCurrency(m.valor) : '—';
        const valSaida = m.tipo === 'saida' ? formatCurrency(m.valor) : '—';
        const isSystem = m.osId || m.faturaId;

        return `
            <tr>
                <td>${time}</td>
                <td>
                    <strong>${m.descricao}</strong>
                    ${isSystem ? `<br><small style="color: var(--accent);">Integrado pelo Sistema</small>` : ''}
                </td>
                <td><span style="text-transform: uppercase;">${m.formaPagamento}</span></td>
                <td style="text-align: right; color: var(--success); font-weight: 600;">${valEntrada}</td>
                <td style="text-align: right; color: var(--danger); font-weight: 600;">${valSaida}</td>
                <td>
                    ${!isSystem ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteCaixaMov(${m.id})" title="Excluir Lançamento"><i class="ri-delete-bin-line"></i></button>` : '—'}
                </td>
            </tr>
        `;
    }).join('');
}

function adjustMovForm(type) {
    const pGroup = document.getElementById('group-mov-parceiro');
    const fGroup = document.getElementById('group-mov-pag');
    if (type === 'entrada') {
        pGroup.style.display = 'block';
    } else {
        pGroup.style.display = 'none';
    }
}

async function submitCaixaMov(event) {
    event.preventDefault();
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;

    const tipo = document.getElementById('mov-tipo').value;
    const valor = parseFloat(document.getElementById('mov-valor').value);
    const desc = document.getElementById('mov-desc').value.trim();
    const forma = document.getElementById('mov-forma-pag').value;
    const partnerId = parseInt(document.getElementById('mov-parceiro-select').value);

    if (!desc) { showToast("Informe a descrição do lançamento.", "error"); return; }
    if (isNaN(valor) || valor <= 0) { showToast("Informe um valor válido.", "error"); return; }

    let finalDesc = desc;
    if (tipo === 'entrada' && partnerId) {
        const partner = db.parceiros.find(p => p.id === partnerId);
        finalDesc = `Aporte Faturamento: ${partner.nome} — ${desc}`;
    }

    const movRecord = {
        caixaId: activeCaixa.id,
        tipo: tipo,
        valor: valor,
        descricao: finalDesc,
        formaPagamento: forma,
        data: new Date().toISOString(),
        operador: currentSession.nome,
        osId: null,
        faturaId: null
    };

    try {
        const inserted = await sbInsert('caixa_movimentos', movRecord);
        cacheInsert('caixa_movimentos', inserted);

        showToast("Movimentação manual lançada com sucesso!", "success");
        logAudit("Movimentação Caixa", `Lançou ${tipo.toUpperCase()} de ${formatCurrency(valor)}: ${finalDesc}.`);

        document.getElementById('caixa-mov-form').reset();
        adjustMovForm('saida');
        renderCaixaPage();
    } catch (e) {
        console.error('[Certive] submitCaixaMov error:', e);
        showToast("Erro ao lançar movimentação.", "error");
    }
}

async function deleteCaixaMov(id) {
    const mov = db.caixa_movimentos.find(m => m.id === id);
    if (!mov) return;

    const confirmed = await showConfirm({
        title: 'Excluir Lançamento',
        message: 'Tem certeza que deseja excluir este lançamento do caixa?',
        icon: '🗑️',
        confirmText: 'Excluir',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await sbDelete('caixa_movimentos', id);
        cacheDelete('caixa_movimentos', id);

        showToast("Lançamento manual removido.", "info");
        logAudit("Remoção Movimento", `Removeu lançamento: ${mov.descricao}`);
        renderCaixaPage();
    } catch (e) {
        console.error('[Certive] deleteCaixaMov error:', e);
        showToast("Erro ao remover lançamento.", "error");
    }
}

async function submitFecharCaixa(event) {
    event.preventDefault();
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;

    const saldoFisico = parseFloat(document.getElementById('fechar-saldo-fisico').value);
    const fileInput = document.getElementById('fechar-relatorio-detran');
    const file = fileInput.files[0];

    // Validate DETRAN report
    if (!file) {
        showToast("Obrigatório: Anexe o relatório de fechamento do DETRAN.", "error");
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast("O relatório DETRAN não pode exceder 2MB.", "error");
        return;
    }

    // Calculate estimated cash balance
    const movs = db.caixa_movimentos.filter(m => m.caixaId === activeCaixa.id);
    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const estimatedCash = activeCaixa.saldoAbertura + cashPayments - cashSangrias;
    const diff = saldoFisico - estimatedCash;

    const confirmed = await showConfirm({
        title: 'Fechar Caixa Diário',
        message: `
            <div style="text-align: left; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 16px; margin-top: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Saldo Físico Informado:</span> <strong>${formatCurrency(saldoFisico)}</strong></div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><span>Saldo Estimado (Espécie):</span> <strong>${formatCurrency(estimatedCash)}</strong></div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;"><span>Diferença apurada:</span> <strong style="color: ${diff === 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(diff)}</strong></div>
            </div>`,
        icon: '🔒',
        confirmText: 'Fechar Caixa',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async function(e) {
        const relatorioData = e.target.result;

        const updates = {
            status: "fechado",
            "saldoEspécieInformado": saldoFisico,
            fechadoPor: currentSession.nome,
            fechadoEm: new Date().toISOString(),
            relatorioDetran: relatorioData
        };

        try {
            await sbUpdate('caixa_diario', activeCaixa.id, updates);
            cacheUpdate('caixa_diario', activeCaixa.id, updates);

            showToast("Caixa diário fechado com sucesso!", "success");
            logAudit("Fechamento Caixa", `Fechou caixa com diferença de ${formatCurrency(diff)}. Relatório DETRAN anexado.`);

            document.getElementById('caixa-fechar-form').reset();
            renderCaixaPage();
        } catch (e) {
            console.error('[Certive] submitFecharCaixa error:', e);
            showToast("Erro ao fechar caixa.", "error");
        }
    };
    reader.onerror = function() {
        showToast("Erro ao ler o relatório DETRAN.", "error");
    };
    reader.readAsDataURL(file);
}

function renderCaixaHistorico() {
    const tbody = document.getElementById('caixa-historico-tbody');
    const closedCaixas = db.caixa_diario
        .filter(c => c.unidadeId === activeUnitId && c.status === "fechado")
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    if (closedCaixas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum caixa fechado no histórico desta unidade.</td></tr>';
        return;
    }

    tbody.innerHTML = closedCaixas.map(c => {
        const movs = db.caixa_movimentos.filter(m => m.caixaId === c.id);
        const totalEntradas = movs.filter(m => m.tipo === 'entrada').reduce((sum, m) => sum + m.valor, 0);
        const totalSaidas = movs.filter(m => m.tipo === 'saida').reduce((sum, m) => sum + m.valor, 0);
        
        const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
        const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
        const estimatedCash = c.saldoAbertura + cashPayments - cashSangrias;
        
        const diff = c.saldoEspécieInformado - estimatedCash;
        const diffColor = diff === 0 ? 'var(--success)' : (diff > 0 ? 'var(--info)' : 'var(--danger)');

        const relatorioBtn = c.relatorioDetran
            ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="previewRelatorioDetran(${c.id})" title="Ver Relatório DETRAN"><i class="ri-file-text-line"></i></button>`
            : '<span style="color: var(--text-muted); font-size: 12px;">—</span>';

        return `
            <tr>
                <td><strong>${formatDateBr(c.data)}</strong></td>
                <td>${c.fechadoPor || '—'}</td>
                <td style="text-align: right; color: var(--success);">${formatCurrency(totalEntradas)}</td>
                <td style="text-align: right; color: var(--danger);">${formatCurrency(totalSaidas)}</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(estimatedCash)}</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(c.saldoEspécieInformado)}</td>
                <td style="text-align: right; font-weight: 700; color: ${diffColor};">${formatCurrency(diff)}</td>
                <td><span class="badge badge-done">CONCLUÍDO</span></td>
                <td style="text-align: center;">${relatorioBtn}</td>
                <td>
                    <button class="btn btn-secondary btn-sm btn-icon" onclick="printCaixaById(${c.id})" title="Imprimir Relatório de Caixa"><i class="ri-printer-line"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function previewRelatorioDetran(caixaId) {
    const caixa = db.caixa_diario.find(c => c.id === caixaId);
    if (!caixa || !caixa.relatorioDetran) {
        showToast("Relatório DETRAN não encontrado.", "error");
        return;
    }

    const modal = document.getElementById('modal-os-detalhes');
    const titleEl = modal.querySelector('.modal-header h3');
    const bodyEl = modal.querySelector('.modal-body');

    titleEl.textContent = `Relatório DETRAN — ${formatDateBr(caixa.data)}`;

    const isPdf = caixa.relatorioDetran.startsWith('data:application/pdf');
    if (isPdf) {
        bodyEl.innerHTML = `
            <iframe src="${caixa.relatorioDetran}" style="width: 100%; height: 70vh; border: none; border-radius: var(--radius-sm);"></iframe>
            <div style="text-align: center; margin-top: 12px;">
                <a href="${caixa.relatorioDetran}" download="relatorio-detran-${caixa.data}.pdf" class="btn btn-primary btn-sm">
                    <i class="ri-download-line"></i> Baixar PDF
                </a>
            </div>`;
    } else {
        bodyEl.innerHTML = `
            <img src="${caixa.relatorioDetran}" style="width: 100%; border-radius: var(--radius-sm);" alt="Relatório DETRAN">
            <div style="text-align: center; margin-top: 12px;">
                <a href="${caixa.relatorioDetran}" download="relatorio-detran-${caixa.data}.jpg" class="btn btn-primary btn-sm">
                    <i class="ri-download-line"></i> Baixar Imagem
                </a>
            </div>`;
    }

    modal.classList.add('active');
}

// Print Active Caixa (Today's Drawer)
function printActiveCaixa() {
    // Can print open or closed drawer
    const today = getLocalToday();
    const activeCaixa = db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.data === today);
    if (!activeCaixa) {
        showToast("Não há registro de caixa aberto ou fechado hoje para esta unidade.", "error");
        return;
    }
    printCaixaById(activeCaixa.id);
}

// Print Cash Closure PDF Report
function printCaixaById(caixaId) {
    const c = db.caixa_diario.find(x => x.id === caixaId);
    if (!c) {
        showToast("Caixa não localizado.", "error");
        return;
    }

    const unit = db.unidades.find(u => u.id === c.unidadeId);
    const movs = db.caixa_movimentos.filter(m => m.caixaId === c.id);

    const entries = movs.filter(m => m.tipo === 'entrada');
    const exits = movs.filter(m => m.tipo === 'saida');

    const totalEntradas = entries.reduce((sum, m) => sum + m.valor, 0);
    const totalSaidas = exits.reduce((sum, m) => sum + m.valor, 0);

    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const estimatedCash = c.saldoAbertura + cashPayments - cashSangrias;
    const diff = c.saldoEspécieInformado - estimatedCash;

    // Modalidades de Pagamento
    const totalPix = entries.filter(m => m.formaPagamento === 'pix').reduce((sum, m) => sum + m.valor, 0);
    const totalEspecie = entries.filter(m => m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const totalDebito = entries.filter(m => m.formaPagamento === 'debito').reduce((sum, m) => sum + m.valor, 0);
    const totalCredito = entries.filter(m => m.formaPagamento === 'credito').reduce((sum, m) => sum + m.valor, 0);
    const totalFaturamento = db.ordens_servico
        .filter(o => o.unidadeId === c.unidadeId && o.criadoEm.startsWith(c.data) && o.status !== 'cancelada' && o.formaPagamento === 'faturamento')
        .reduce((sum, o) => sum + o.valor, 0);

    // Entries Rows mapping
    let entryRows = entries.map(m => {
        const os = m.osId ? db.ordens_servico.find(o => o.id === m.osId) : null;
        const plate = os ? os.placa : "—";
        const clientType = os ? os.clienteTipo.toUpperCase() : "FAT. RECEBIDO";
        const time = new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const obsText = os && os.observacoes ? `<br><small style="color: #666; font-size: 9px;">Veículo: ${os.observacoes}</small>` : '';
        return `
            <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
                <td style="padding: 6px;">${time}</td>
                <td style="padding: 6px;">${m.descricao}${obsText}</td>
                <td style="padding: 6px;"><strong>${plate}</strong></td>
                <td style="padding: 6px;">${clientType}</td>
                <td style="padding: 6px; text-transform: uppercase;">${m.formaPagamento}</td>
                <td style="padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(m.valor)}</td>
            </tr>
        `;
    }).join('');

    if (!entryRows) {
        entryRows = `<tr><td colspan="6" style="text-align: center; padding: 12px; color: #666;">Nenhuma entrada financeira registrada.</td></tr>`;
    }

    // Exits Rows mapping
    let exitRows = exits.map(m => {
        const time = new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `
            <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
                <td style="padding: 6px;">${time}</td>
                <td style="padding: 6px;">${m.descricao}</td>
                <td style="padding: 6px; text-transform: uppercase;">${m.formaPagamento}</td>
                <td style="padding: 6px; text-align: right; color: #ef4444; font-weight: 600;">${formatCurrency(m.valor)}</td>
            </tr>
        `;
    }).join('');

    if (!exitRows) {
        exitRows = `<tr><td colspan="4" style="text-align: center; padding: 12px; color: #666;">Nenhuma sangria ou saída registrada.</td></tr>`;
    }

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = `
        <div class="print-header">
            <div>
                <h1 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; color: #000;">CERTIVE VISTORIAS</h1>
                <p style="font-size: 10px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Fechamento de Caixa Diário — Demonstrativo Financeiro</p>
            </div>
            <div class="print-logo-dummy" style="font-size: 16px; padding: 6px 12px;">RELATÓRIO CAIXA</div>
        </div>

        <div style="margin-bottom: 24px; font-size: 12px; line-height: 1.6; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; border-bottom: 1px solid #000; padding-bottom: 16px;">
            <div>
                <strong>Unidade Operacional:</strong> ${unit.nome}<br>
                <strong>Endereço:</strong> ${unit.endereco}<br>
                <strong>Data de Movimentação:</strong> ${formatDateBr(c.data)}
            </div>
            <div>
                <strong>Estado do Caixa:</strong> ${c.status.toUpperCase()}<br>
                <strong>Aberto Por:</strong> ${c.abertoPor || '—'}<br>
                <strong>Responsável Fechamento:</strong> ${c.fechadoPor || '—'} ${c.fechadoEm ? `(${new Date(c.fechadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}
            </div>
        </div>

        <div class="print-section" style="border: 1px solid #000; margin-bottom: 20px; border-radius: 4px; overflow: hidden;">
            <div class="print-section-title" style="font-weight: 800; font-size: 12px; background: #eee; padding: 8px 12px; border-bottom: 1px solid #000;">1. DEMONSTRATIVO DE ENTRADAS (RECEITAS)</div>
            <div style="padding: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; text-align: left; font-size: 10px; color: #333; text-transform: uppercase;">
                            <th style="padding: 6px;">Hora</th>
                            <th style="padding: 6px;">Descrição / Serviço</th>
                            <th style="padding: 6px;">Placa</th>
                            <th style="padding: 6px;">Cliente</th>
                            <th style="padding: 6px;">Forma</th>
                            <th style="padding: 6px; text-align: right;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entryRows}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="print-section" style="border: 1px solid #000; margin-bottom: 20px; border-radius: 4px; overflow: hidden;">
            <div class="print-section-title" style="font-weight: 800; font-size: 12px; background: #eee; padding: 8px 12px; border-bottom: 1px solid #000;">2. DEMONSTRATIVO DE SAÍDAS (SANGRIA / TAXAS / PEQUENAS DESPESAS)</div>
            <div style="padding: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; text-align: left; font-size: 10px; color: #333; text-transform: uppercase;">
                            <th style="padding: 6px;">Hora</th>
                            <th style="padding: 6px;">Histórico / Finalidade</th>
                            <th style="padding: 6px;">Forma</th>
                            <th style="padding: 6px; text-align: right;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${exitRows}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="print-section" style="border: 1px solid #000; border-radius: 4px; overflow: hidden; margin-bottom: 40px;">
            <div class="print-section-title" style="font-weight: 800; font-size: 12px; background: #eee; padding: 8px 12px; border-bottom: 1px solid #000;">3. RESUMO CONSOLIDADO & CONCILIAÇÃO FÍSICA</div>
            <div style="padding: 16px; display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 20px; font-size: 11px; line-height: 1.6;">
                <div>
                    <strong style="text-transform: uppercase;">Receitas por Modalidade:</strong><br>
                    <strong>Total em Pix:</strong> ${formatCurrency(totalPix)}<br>
                    <strong>Total em Espécie:</strong> ${formatCurrency(totalEspecie)}<br>
                    <strong>Total em Débito:</strong> ${formatCurrency(totalDebito)}<br>
                    <strong>Total em Crédito:</strong> ${formatCurrency(totalCredito)}<br>
                    <strong>Total em Faturamento:</strong> ${formatCurrency(totalFaturamento)}
                </div>
                <div style="border-left: 1px solid #ccc; padding-left: 16px;">
                    <strong style="text-transform: uppercase;">Resumo Financeiro:</strong><br>
                    <strong>Fundo Inicial (Abertura):</strong> ${formatCurrency(c.saldoAbertura)}<br>
                    <strong>Total de Entradas (+):</strong> ${formatCurrency(totalEntradas)}<br>
                    <strong>Total de Saídas (-):</strong> ${formatCurrency(totalSaidas)}<br>
                    <hr style="border:0; border-top: 1px solid #ccc; margin: 6px 0;">
                    <strong>Resultado Líquido:</strong> <strong style="color: ${totalEntradas - totalSaidas >= 0 ? '#10b981' : '#ef4444'}">${formatCurrency(totalEntradas - totalSaidas)}</strong>
                </div>
                <div style="border-left: 1px solid #ccc; padding-left: 16px;">
                    <strong style="text-transform: uppercase;">Conciliação (Dinheiro Físico):</strong><br>
                    <strong>Saldo Estimado:</strong> ${formatCurrency(estimatedCash)}<br>
                    <strong>Saldo Apurado:</strong> ${c.status === 'fechado' ? formatCurrency(c.saldoEspécieInformado) : 'AGUARDANDO FECHAMENTO'}<br>
                    <hr style="border:0; border-top: 1px solid #ccc; margin: 6px 0;">
                    <strong>Diferença de Caixa:</strong> <strong style="color: ${diff === 0 ? '#10b981' : '#ef4444'}">${c.status === 'fechado' ? formatCurrency(diff) : 'AGUARDANDO FECHAMENTO'}</strong>
                </div>
            </div>
        </div>

        <div class="print-signatures" style="margin-top: 60px; display: flex; justify-content: space-between;">
            <div class="print-sig-block" style="width: 45%; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 6px;">
                Assinatura do Operador do Caixa
            </div>
            <div class="print-sig-block" style="width: 45%; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 6px;">
                Assinatura do Supervisor Financeiro
            </div>
        </div>
    `;

    logAudit("Exportação PDF", `Exportou fechamento de caixa de ${formatDateBr(c.data)}.`);
    window.print();
}

function downloadConsolidatedPdf(caixaId) {
    const c = db.caixa_diario.find(x => x.id === caixaId);
    if (!c || !c.pdfConsolidado) {
        showToast("PDF consolidado não encontrado para este caixa.", "error");
        return;
    }
    const linkSource = `data:application/pdf;base64,${c.pdfConsolidado}`;
    const downloadLink = document.createElement("a");
    const fileName = `caixa_consolidado_${c.data}_unidade_${c.unidadeId}.pdf`;

    downloadLink.href = linkSource;
    downloadLink.download = fileName;
    downloadLink.click();
    showToast("PDF Consolidado baixado com sucesso!", "success");
    logAudit("Download PDF Consolidado", `Baixou o PDF consolidado do caixa de ${formatDateBr(c.data)}.`);
}

function generateCashierPdfData(c) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const unit = db.unidades.find(u => u.id === c.unidadeId);
    const movs = db.caixa_movimentos.filter(m => m.caixaId === c.id);

    const entries = movs.filter(m => m.tipo === 'entrada');
    const exits = movs.filter(m => m.tipo === 'saida');

    const totalEntradas = entries.reduce((sum, m) => sum + m.valor, 0);
    const totalSaidas = exits.reduce((sum, m) => sum + m.valor, 0);

    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const estimatedCash = c.saldoAbertura + cashPayments - cashSangrias;
    const diff = c.saldoEspécieInformado - estimatedCash;

    const totalPix = entries.filter(m => m.formaPagamento === 'pix').reduce((sum, m) => sum + m.valor, 0);
    const totalEspecie = entries.filter(m => m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const totalDebito = entries.filter(m => m.formaPagamento === 'debito').reduce((sum, m) => sum + m.valor, 0);
    const totalCredito = entries.filter(m => m.formaPagamento === 'credito').reduce((sum, m) => sum + m.valor, 0);
    const totalCreditoParcelado = entries.filter(m => m.formaPagamento === 'credito_parcelado').reduce((sum, m) => sum + m.valor, 0);
    const totalFaturamento = db.ordens_servico
        .filter(o => o.unidadeId === c.unidadeId && o.criadoEm.startsWith(c.data) && o.status !== 'cancelada' && o.formaPagamento === 'faturamento')
        .reduce((sum, o) => sum + o.valor, 0);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text("CERTIVE VISTORIAS", 14, 20);

    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.text("Fechamento de Caixa Diario - Demonstrativo Financeiro", 14, 26);
    doc.line(14, 28, 196, 28);

    doc.setFont("Helvetica", "bold");
    doc.text("Unidade Operacional:", 14, 35);
    doc.setFont("Helvetica", "normal");
    doc.text(unit ? unit.nome : "—", 52, 35);

    doc.setFont("Helvetica", "bold");
    doc.text("Data Movimentacao:", 14, 41);
    doc.setFont("Helvetica", "normal");
    doc.text(formatDateBr(c.data), 52, 41);

    doc.setFont("Helvetica", "bold");
    doc.text("Aberto Por:", 110, 35);
    doc.setFont("Helvetica", "normal");
    doc.text(c.abertoPor || "—", 132, 35);

    doc.setFont("Helvetica", "bold");
    doc.text("Responsavel:", 110, 41);
    doc.setFont("Helvetica", "normal");
    doc.text(c.fechadoPor || "—", 132, 41);

    doc.line(14, 45, 196, 45);

    // Summary section
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.text("1. RESUMO FINANCEIRO E CONCILIACAO", 14, 52);

    doc.setFontSize(9);
    doc.setFont("Helvetica", "normal");
    doc.text(`Fundo Inicial (Abertura): ${formatCurrency(c.saldoAbertura)}`, 14, 60);
    doc.text(`Total de Entradas (+): ${formatCurrency(totalEntradas)}`, 14, 66);
    doc.text(`Total de Saidas (-): ${formatCurrency(totalSaidas)}`, 14, 72);
    doc.text(`Resultado Liquido: ${formatCurrency(totalEntradas - totalSaidas)}`, 14, 78);

    doc.text(`Total Pix: ${formatCurrency(totalPix)}`, 110, 60);
    doc.text(`Total Dinheiro: ${formatCurrency(totalEspecie)}`, 110, 66);
    doc.text(`Total Debito: ${formatCurrency(totalDebito)}`, 110, 72);
    doc.text(`Total Credito Vista: ${formatCurrency(totalCredito)}`, 110, 78);
    doc.text(`Total Credito Parcelado: ${formatCurrency(totalCreditoParcelado)}`, 110, 84);
    doc.text(`Total Faturamento: ${formatCurrency(totalFaturamento)}`, 110, 90);

    doc.setFont("Helvetica", "bold");
    doc.text(`Saldo Fisico Estimado: ${formatCurrency(estimatedCash)}`, 14, 98);
    doc.text(`Saldo Fisico Informado: ${formatCurrency(c.saldoEspécieInformado)}`, 14, 104);
    doc.text(`Diferenca de Caixa: ${formatCurrency(diff)}`, 14, 110);

    doc.line(14, 115, 196, 115);

    // Detail section
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.text("2. DETALHE DOS LANCAMENTOS", 14, 122);

    doc.setFontSize(9);
    doc.text("Hora", 14, 129);
    doc.text("Descricao / Servico", 30, 129);
    doc.text("Forma", 120, 129);
    doc.text("Entrada", 145, 129);
    doc.text("Saida", 172, 129);
    doc.line(14, 131, 196, 131);

    let y = 137;
    doc.setFont("Helvetica", "normal");
    movs.forEach((m) => {
        if (y > 270) {
            doc.addPage();
            y = 20;
            doc.setFont("Helvetica", "bold");
            doc.text("Hora", 14, y);
            doc.text("Descricao / Servico", 30, y);
            doc.text("Forma", 120, y);
            doc.text("Entrada", 145, y);
            doc.text("Saida", 172, y);
            doc.line(14, y + 2, 196, y + 2);
            y += 8;
            doc.setFont("Helvetica", "normal");
        }
        const time = new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        doc.text(time, 14, y);
        let desc = m.descricao;
        if (desc.length > 50) desc = desc.slice(0, 47) + "...";
        doc.text(desc, 30, y);
        doc.text(m.formaPagamento.toUpperCase(), 120, y);
        doc.text(m.tipo === 'entrada' ? formatCurrency(m.valor) : '—', 145, y);
        doc.text(m.tipo === 'saida' ? formatCurrency(m.valor) : '—', 172, y);
        y += 6;
    });

    if (y > 240) {
        doc.addPage();
        y = 30;
    } else {
        y += 20;
    }
    doc.line(14, y, 90, y);
    doc.line(110, y, 186, y);
    doc.text("Assinatura do Operador", 22, y + 5);
    doc.text("Assinatura do Supervisor", 118, y + 5);

    return doc.output('arraybuffer');
}
