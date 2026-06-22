// MODULE: Faturamento
// ==========================================
// FATURAMENTO DE PARCEIROS
// ==========================================
let currentFatTab = 'pendentes';

function switchFatTab(tab, btn) {
    currentFatTab = tab;
    document.querySelectorAll('#panel-faturamento .tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('tab-fat-pendentes').style.display = tab === 'pendentes' ? 'block' : 'none';
    document.getElementById('tab-fat-faturas').style.display = tab === 'faturas' ? 'block' : 'none';

    if (tab === 'pendentes') renderFatPendentes();
    if (tab === 'faturas') renderFatFaturas();
}

function renderFaturamentoPage() {
    loadFatPartnersFilter();
    renderFatPendentes();
}

function loadFatPartnersFilter() {
    const select = document.getElementById('fat-parceiro-filter');
    select.innerHTML = '<option value="">Todos os parceiros...</option>' + 
        db.parceiros.filter(p => p.usaFaturamento).map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
}

function getUnbilledOSs() {
    return db.ordens_servico.filter(o => 
        o.unidadeId === activeUnitId && 
        o.formaPagamento === 'faturamento' && 
        !o.faturaId && 
        o.status === 'concluida_aprovada'
    );
}

function renderFatPendentes() {
    const tbody = document.getElementById('fat-pendentes-tbody');
    const partnerId = parseInt(document.getElementById('fat-parceiro-filter').value);
    
    let list = getUnbilledOSs();
    if (partnerId) {
        list = list.filter(o => o.parceiroId === partnerId);
    }

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhuma vistoria pendente de faturamento no momento.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(o => {
        const partner = db.parceiros.find(p => p.id === o.parceiroId);
        return `
            <tr>
                <td><input type="checkbox" name="fat-select-os" value="${o.id}" onchange="updateFatSelectedSummary()"></td>
                <td><strong>${o.numero}</strong></td>
                <td>${formatDateTimeBr(o.criadoEm)}</td>
                <td>${partner ? partner.nome : '—'}</td>
                <td>
                    <strong>${o.placa}</strong><br>
                    <small style="color: var(--text-secondary); font-weight: 500;">${o.observacoes || '—'}</small>
                </td>
                <td>${o.servicoNome.split(' — ')[0]}</td>
                <td style="text-align: right; color: var(--success); font-weight: 600;">${formatCurrency(o.valor)}</td>
                <td>${o.criadoPor}</td>
            </tr>
        `;
    }).join('');
    
    updateFatSelectedSummary();
}

function toggleSelectAllOS(masterCheckbox) {
    document.querySelectorAll('input[name="fat-select-os"]').forEach(el => {
        el.checked = masterCheckbox.checked;
    });
    updateFatSelectedSummary();
}

function updateFatSelectedSummary() {
    // Check if we need to do anything (visual warning)
}

function openGirarFaturaModal() {
    const checkboxes = document.querySelectorAll('input[name="fat-select-os"]:checked');
    if (checkboxes.length === 0) {
        showToast("Por favor, selecione pelo menos uma OS para faturar.", "error");
        return;
    }

    const selectedIds = Array.from(checkboxes).map(el => parseInt(el.value));
    const selectedOSs = db.ordens_servico.filter(o => selectedIds.includes(o.id));
    
    // Ensure all belong to the SAME partner
    const partnerIds = [...new Set(selectedOSs.map(o => o.parceiroId))];
    if (partnerIds.length > 1) {
        showToast("Erro: Selecione vistorias de apenas UM parceiro para gerar a fatura.", "error");
        return;
    }

    const partner = db.parceiros.find(p => p.id === partnerIds[0]);
    const totalVal = selectedOSs.reduce((sum, o) => sum + o.valor, 0);

    // Populate modal
    document.getElementById('fat-modal-parceiro').value = partner.nome;
    document.getElementById('fat-modal-parceiro-id').value = partner.id;
    document.getElementById('fat-modal-qtd').textContent = selectedOSs.length;
    document.getElementById('fat-modal-total').textContent = formatCurrency(totalVal);
    
    // Autofill dates (oldest and newest of selected OSs)
    const dates = selectedOSs.map(o => new Date(o.criadoEm));
    const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
    const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];
    document.getElementById('fat-modal-inicio').value = minDate;
    document.getElementById('fat-modal-fim').value = maxDate;

    // Save ids inside global window to fetch on submit
    window.selectedFatOSIds = selectedIds;

    document.getElementById('modal-faturamento-fechar').classList.add('active');
}

function closeFatModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-faturamento-fechar').classList.remove('active');
}

async function submitGirarFatura(event) {
    event.preventDefault();
    const partnerId = parseInt(document.getElementById('fat-modal-parceiro-id').value);
    const dateIni = document.getElementById('fat-modal-inicio').value;
    const dateFim = document.getElementById('fat-modal-fim').value;
    const selectedIds = window.selectedFatOSIds;

    const selectedOSs = db.ordens_servico.filter(o => selectedIds.includes(o.id));
    const totalVal = selectedOSs.reduce((sum, o) => sum + o.valor, 0);

    // Create Invoice (no id, no codigo — Supabase generates id, then we set codigo)
    const newInvoice = {
        codigo: 'TEMP',
        parceiroId: partnerId,
        unidadeId: activeUnitId,
        periodoInicio: dateIni,
        periodoFim: dateFim,
        valorTotal: totalVal,
        ordensIds: selectedIds,
        pago: false,
        pagoEm: null,
        criadoEm: new Date().toISOString(),
        criadoPor: currentSession.nome
    };

    try {
        const insertedFat = await sbInsert('faturas', newInvoice);
        const code = await getNextFaturaCode();
        await sbUpdate('faturas', insertedFat.id, { codigo: code });
        insertedFat.codigo = code;
        cacheInsert('faturas', insertedFat);

        // Link OSs to invoice
        for (const o of selectedOSs) {
            await sbUpdate('ordens_servico', o.id, { faturaId: insertedFat.id });
            cacheUpdate('ordens_servico', o.id, { faturaId: insertedFat.id });
        }

        showToast(`Fatura ${code} gerada com sucesso!`, "success");
        logAudit("Faturamento Lote", `Faturou ${selectedOSs.length} OSs para ${document.getElementById('fat-modal-parceiro').value}.`);

        closeFatModal();
        renderFaturamentoPage();
    } catch (e) {
        console.error('[Certive] submitGirarFatura error:', e);
        showToast("Erro ao gerar fatura.", "error");
    }
}

function renderFatFaturas() {
    const tbody = document.getElementById('fat-faturas-tbody');
    const faturas = db.faturas
        .filter(f => f.unidadeId === activeUnitId)
        .sort((a, b) => b.id - a.id);

    if (faturas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhuma fatura emitida nesta unidade.</td></tr>';
        return;
    }

    tbody.innerHTML = faturas.map(f => {
        const partner = db.parceiros.find(p => p.id === f.parceiroId);
        const statusBadge = f.pago 
            ? `<span class="badge badge-done">Paga</span>` 
            : `<span class="badge badge-waiting">Aberto</span>`;

        return `
            <tr>
                <td><strong>${f.codigo}</strong></td>
                <td>${formatDateBr(f.criadoEm)}</td>
                <td>${partner ? partner.nome : '—'}</td>
                <td>${formatDateBr(f.periodoInicio)} a ${formatDateBr(f.periodoFim)}</td>
                <td style="text-align: center; font-weight: 600;">${f.ordensIds.length}</td>
                <td style="text-align: right; color: var(--success); font-weight: 700;">${formatCurrency(f.valorTotal)}</td>
                <td>${statusBadge}</td>
                <td>${formatDateBr(f.pagoEm)}</td>
                <td>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="printInvoiceById(${f.id})" title="Imprimir Fatura"><i class="ri-printer-line"></i></button>
                        ${!f.pago ? `<button class="btn btn-success btn-sm" onclick="liquidateInvoice(${f.id})"><i class="ri-check-line"></i> Baixar</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function liquidateInvoice(invoiceId) {
    // Requires an open cashier drawer to inject faturamento payments
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) {
        showToast("Erro: É necessário que o caixa de hoje esteja ABERTO para dar baixa na fatura.", "error");
        return;
    }

    const invoice = db.faturas.find(f => f.id === invoiceId);
    if (!invoice) return;

    const confirmed = await showConfirm({
        title: 'Liquidar Fatura',
        message: `Confirmar recebimento de pagamento da fatura <strong>${invoice.codigo}</strong> no valor de <strong>${formatCurrency(invoice.valorTotal)}</strong>?`,
        icon: '💰',
        confirmText: 'Confirmar Pagamento',
        confirmClass: 'btn-success'
    });
    if (confirmed) {
        try {
            // Update invoice as paid
            const fatUpdates = { pago: true, pagoEm: new Date().toISOString() };
            await sbUpdate('faturas', invoiceId, fatUpdates);
            cacheUpdate('faturas', invoiceId, fatUpdates);

            // Mark all related OSs as settled/pago
            for (const id of invoice.ordensIds) {
                await sbUpdate('ordens_servico', id, { pago: true });
                cacheUpdate('ordens_servico', id, { pago: true });
            }

            // Insert cash drawer inflow (Pix by default)
            const partner = db.parceiros.find(p => p.id === invoice.parceiroId);
            if (!partner) { showToast("Parceiro da fatura não encontrado.", "error"); return; }
            const movRecord = {
                caixaId: activeCaixa.id,
                tipo: "entrada",
                valor: invoice.valorTotal,
                descricao: `Recebimento Fatura ${invoice.codigo} — ${partner.nome}`,
                formaPagamento: "pix",
                data: new Date().toISOString(),
                operador: currentSession.nome,
                osId: null,
                faturaId: invoice.id
            };
            const insertedMov = await sbInsert('caixa_movimentos', movRecord);
            cacheInsert('caixa_movimentos', insertedMov);

            showToast(`Fatura ${invoice.codigo} liquidada com sucesso! Entrada gerada no caixa.`, "success");
            logAudit("Faturamento Baixa", `Liquidou fatura ${invoice.codigo} no valor de ${formatCurrency(invoice.valorTotal)}.`);

            renderFatFaturas();
        } catch (e) {
            console.error('[Certive] liquidateInvoice error:', e);
            showToast("Erro ao liquidar fatura.", "error");
        }
    }
}

function printInvoiceById(invoiceId) {
    const f = db.faturas.find(x => x.id === invoiceId);
    if (!f) {
        showToast("Fatura não localizada.", "error");
        return;
    }

    const partner = db.parceiros.find(p => p.id === f.parceiroId);
    if (!partner) { showToast("Parceiro não encontrado.", "error"); return; }
    const unit = db.unidades.find(u => u.id === f.unidadeId);
    
    // Fetch all related OSs
    const oss = db.ordens_servico.filter(o => f.ordensIds.includes(o.id));

    let osRows = oss.map(o => `
        <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
            <td style="padding: 6px;"><strong>${o.numero}</strong></td>
            <td style="padding: 6px;">${formatDateBr(o.criadoEm)}</td>
            <td style="padding: 6px;"><strong>${o.placa}</strong></td>
            <td style="padding: 6px;">${o.observacoes || '—'}</td>
            <td style="padding: 6px;">${o.servicoNome.split(' — ')[0]}</td>
            <td style="padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(o.valor)}</td>
        </tr>
    `).join('');

    if (!osRows) {
        osRows = `<tr><td colspan="6" style="text-align: center; padding: 12px; color: #666;">Nenhuma OS vinculada a esta fatura.</td></tr>`;
    }

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = `
        <div class="print-header">
            <div>
                <h1 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; color: #000;">CERTIVE VISTORIAS</h1>
                <p style="font-size: 10px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Faturamento de Parceiros — Demonstrativo de Cobrança</p>
            </div>
            <div class="print-logo-dummy" style="font-size: 16px; padding: 6px 12px;">FATURA ${f.codigo}</div>
        </div>

        <div style="margin-bottom: 24px; font-size: 12px; line-height: 1.6; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; border-bottom: 1px solid #000; padding-bottom: 16px;">
            <div>
                <strong>Prestador:</strong> ${unit.nome}<br>
                <strong>Endereço:</strong> ${unit.endereco}<br>
                <strong>Período de Referência:</strong> ${formatDateBr(f.periodoInicio)} a ${formatDateBr(f.periodoFim)}
            </div>
            <div>
                <strong>Tomador (Parceiro):</strong> ${partner.nome}<br>
                <strong>CPF/CNPJ:</strong> ${partner.cnpj}<br>
                <strong>Responsável:</strong> ${partner.responsavel || '—'}<br>
                <strong>Contato:</strong> ${partner.telefone}
            </div>
        </div>

        <div style="margin-bottom: 20px; font-size: 12px; line-height: 1.6; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <strong>Data de Emissão:</strong> ${formatDateBr(f.criadoEm)} por ${f.criadoPor}<br>
                <strong>Status de Pagamento:</strong> ${f.pago ? `PAGO EM ${formatDateBr(f.pagoEm)}` : 'AGUARDANDO PAGAMENTO'}
            </div>
            <div style="text-align: right;">
                <span style="font-size: 14px; font-weight: 800; color: #000;">VALOR TOTAL: ${formatCurrency(f.valorTotal)}</span>
            </div>
        </div>

        <div class="print-section" style="border: 1px solid #000; margin-bottom: 20px; border-radius: 4px; overflow: hidden;">
            <div class="print-section-title" style="font-weight: 800; font-size: 12px; background: #eee; padding: 8px 12px; border-bottom: 1px solid #000;">DEMONSTRATIVO DE SERVIÇOS PRESTADOS</div>
            <div style="padding: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; text-align: left; font-size: 10px; color: #333; text-transform: uppercase;">
                            <th style="padding: 6px;">OS</th>
                            <th style="padding: 6px;">Data</th>
                            <th style="padding: 6px;">Placa</th>
                            <th style="padding: 6px;">Veículo / Obs</th>
                            <th style="padding: 6px;">Serviço</th>
                            <th style="padding: 6px; text-align: right;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${osRows}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="print-signatures" style="margin-top: 60px; display: flex; justify-content: space-between;">
            <div class="print-sig-block" style="width: 45%; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 6px;">
                Assinatura do Parceiro / Tomador
            </div>
            <div class="print-sig-block" style="width: 45%; border-top: 1px solid #000; text-align: center; font-size: 11px; padding-top: 6px;">
                Assinatura do Responsável Financeiro
            </div>
        </div>
    `;

    logAudit("Exportação Fatura", `Exportou relatório da fatura ${f.codigo} do parceiro ${partner.nome}.`);
    window.print();
}
