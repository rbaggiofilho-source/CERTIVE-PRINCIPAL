// MODULE: Histórico
// ==========================================
// HISTÓRICO GERAL DE SERVIÇOS
// ==========================================

function renderHistoricoPage() {
    // Populate Service Dropdown Filter
    const select = document.getElementById('hist-filter-servico');
    if (select) {
        select.innerHTML = '<option value="">Todos os Serviços</option>' + 
            db.servicos.map(s => `<option value="${s.id}">${s.nome.split(' — ')[0]}</option>`).join('');
    }
    renderHistorico();
}

function renderHistorico() {
    const placaFilter = document.getElementById('hist-filter-placa') ? document.getElementById('hist-filter-placa').value.trim().toUpperCase() : '';
    const clienteFilter = document.getElementById('hist-filter-cliente') ? document.getElementById('hist-filter-cliente').value.trim().toUpperCase() : '';
    const servicoFilter = document.getElementById('hist-filter-servico') ? document.getElementById('hist-filter-servico').value : '';
    const valorFilter = document.getElementById('hist-filter-valor') ? document.getElementById('hist-filter-valor').value : '';
    const dataIniFilter = document.getElementById('hist-filter-data-ini') ? document.getElementById('hist-filter-data-ini').value : '';
    const dataFimFilter = document.getElementById('hist-filter-data-fim') ? document.getElementById('hist-filter-data-fim').value : '';
    const pagamentoFilter = document.getElementById('hist-filter-pagamento') ? document.getElementById('hist-filter-pagamento').value : '';
    const statusFilter = document.getElementById('hist-filter-status') ? document.getElementById('hist-filter-status').value : '';

    let list = db.ordens_servico.filter(o => {
        if (o.unidadeId !== activeUnitId) return false;
        
        if (placaFilter && !o.placa.toUpperCase().includes(placaFilter)) return false;
        
        if (clienteFilter) {
            const nameMatch = o.clienteNome.toUpperCase().includes(clienteFilter);
            const docMatch = o.clienteCpfCnpj.includes(clienteFilter);
            if (!nameMatch && !docMatch) return false;
        }
        
        if (servicoFilter && o.servicoId !== parseInt(servicoFilter)) return false;
        
        if (valorFilter && Math.abs(o.valor - parseFloat(valorFilter)) > 0.01) return false;
        
        const osDate = o.criadoEm.split('T')[0];
        if (dataIniFilter && osDate < dataIniFilter) return false;
        if (dataFimFilter && osDate > dataFimFilter) return false;
        
        if (pagamentoFilter && o.formaPagamento !== pagamentoFilter) return false;
        
        if (statusFilter && o.status !== statusFilter) return false;
        
        return true;
    });

    const totalLabel = document.getElementById('hist-total-count');
    if (totalLabel) {
        totalLabel.textContent = `${list.length} ${list.length === 1 ? 'Ordem de Serviço' : 'Ordens de Serviço'}`;
    }

    const tbody = document.getElementById('historico-services-list');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--text-muted);">Nenhuma ordem de serviço encontrada.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(os => {
        const time = new Date(os.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const date = formatDateBr(os.criadoEm);
        
        let statusBadge = '';
        if (os.status === 'aberta') statusBadge = '<span class="badge badge-waiting"><span class="badge-dot"></span> Aberta</span>';
        else if (os.status === 'paga') statusBadge = '<span class="badge badge-progress"><span class="badge-dot"></span> Paga</span>';
        else if (os.status === 'em_execucao') statusBadge = '<span class="badge badge-progress"><span class="badge-dot"></span> Em Vistoria</span>';
        else if (os.status === 'concluida_aprovada') statusBadge = '<span class="badge badge-done"><span class="badge-dot"></span> Aprovada</span>';
        else if (os.status === 'concluida_reprovada') statusBadge = '<span class="badge badge-cancelled"><span class="badge-dot"></span> Reprovada</span>';
        else if (os.status === 'cancelada') statusBadge = '<span class="badge badge-cancelled"><span class="badge-dot"></span> Cancelada</span>';

        return `
            <tr>
                <td><strong style="color: var(--accent);">${os.numero}</strong></td>
                <td>${date} ${time}</td>
                <td>
                    <strong>${os.clienteNome}</strong><br>
                    <small style="color: var(--text-secondary); font-weight: 500;">PLACA: ${os.placa}</small>
                </td>
                <td>${os.servicoNome.split(' — ')[0]}</td>
                <td style="font-weight: 600; color: var(--success);">${formatCurrency(os.valor)}</td>
                <td><span style="text-transform: uppercase; font-size: 11px;">${os.formaPagamento}</span></td>
                <td>${statusBadge}</td>
                <td style="text-align: right; padding-right: 20px;">
                    <button class="btn btn-secondary btn-sm btn-icon" onclick="openOSDetailsModal(${os.id})" title="Ver Ficha"><i class="ri-eye-line"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function clearHistoricoFilters() {
    document.getElementById('hist-filter-placa').value = '';
    document.getElementById('hist-filter-cliente').value = '';
    document.getElementById('hist-filter-servico').value = '';
    document.getElementById('hist-filter-valor').value = '';
    document.getElementById('hist-filter-data-ini').value = '';
    document.getElementById('hist-filter-data-fim').value = '';
    document.getElementById('hist-filter-pagamento').value = '';
    document.getElementById('hist-filter-status').value = '';
    renderHistorico();
}
