// MODULE: BI (Painel de Gestão)
// ==========================================
// PAINEL DE GESTÃO (BI)
// ==========================================
function renderBIPage() {
    // Populate unit dropdown filter
    const select = document.getElementById('bi-filtro-unidade');
    select.innerHTML = '<option value="todas">Todas as Unidades</option>' + 
        db.unidades.map(u => `<option value="${u.id}">${u.nome.split(' — ')[1]}</option>`).join('');

    renderBI();
}

function renderBI() {
    const period = document.getElementById('bi-filtro-periodo').value;
    const unitFilter = document.getElementById('bi-filtro-unidade').value;

    const today = new Date();
    let startDate = new Date();

    if (period === 'mes') {
        // Lock to current mock month (June 2026)
        startDate = new Date("2026-06-01");
    } else if (period === '30') {
        startDate.setDate(today.getDate() - 30);
    } else {
        startDate = new Date("2026-05-01"); // beginning of logs
    }

    // Filter OSs
    let OSs = db.ordens_servico.filter(o => new Date(o.criadoEm) >= startDate);
    
    // Filter Expenses
    let Expenses = db.contas_pagar;

    if (unitFilter !== 'todas') {
        const uId = parseInt(unitFilter);
        OSs = OSs.filter(o => o.unidadeId === uId);
        Expenses = Expenses.filter(c => c.unidadeId === uId);
    }

    const nonCancelledOSs = OSs.filter(o => o.status !== 'cancelada');

    // Revenue calculations: immediate payments + invoiced receipts + faturado pending (counted as revenue on accrual basis)
    const OSRevenue = nonCancelledOSs.reduce((sum, o) => sum + o.valor, 0);
    
    // Total expenses (Fixed + variables in that range)
    // For range filter, match expenses due date
    let rangeExpenses = Expenses.filter(c => new Date(c.vencimento) >= startDate);
    const fixedExpensesVal = rangeExpenses.filter(c => c.tipo === 'fixo').reduce((sum, c) => sum + c.valor, 0);
    
    // Variable DETRAN taxes for the selected OS list (count * tax references)
    const variableTaxesVal = nonCancelledOSs.reduce((sum, o) => {
        const tax = db.taxas_referencia.find(t => t.servicoId === o.servicoId)?.taxa || 0;
        return sum + (o.valor > 0 ? tax : 0); // Ignore free rechecks
    }, 0);

    const totalRevenue = OSRevenue;
    const totalExpenses = fixedExpensesVal + variableTaxesVal;
    const netProfit = totalRevenue - totalExpenses;

    const osCount = nonCancelledOSs.length;
    const ticketMedio = osCount ? OSRevenue / osCount : 0;
    const avgCostPerOS = osCount ? totalExpenses / osCount : 0;
    const avgSalePerOS = ticketMedio; // same as ticket medio

    // Render KPIs
    const kpiGrid = document.getElementById('bi-kpis');
    kpiGrid.innerHTML = `
        <div class="kpi-card kpi-green">
            <div class="kpi-icon"><i class="ri-line-chart-line"></i></div>
            <div class="kpi-value">${formatCurrency(totalRevenue)}</div>
            <div class="kpi-label">Faturamento Geral (Competência)</div>
        </div>
        <div class="kpi-card kpi-red">
            <div class="kpi-icon"><i class="ri-wallet-3-line"></i></div>
            <div class="kpi-value">${formatCurrency(totalExpenses)}</div>
            <div class="kpi-label">Custos Totais (Fixo + Taxas DETRAN)</div>
        </div>
        <div class="kpi-card kpi-blue">
            <div class="kpi-icon"><i class="ri-funds-line"></i></div>
            <div class="kpi-value" style="color: ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(netProfit)}</div>
            <div class="kpi-label">Lucro Líquido Estimado</div>
        </div>
        <div class="kpi-card kpi-purple">
            <div class="kpi-icon"><i class="ri-coupon-2-line"></i></div>
            <div class="kpi-value">${formatCurrency(ticketMedio)}</div>
            <div class="kpi-label">Ticket Médio por OS</div>
        </div>
    `;

    // Render Charts
    renderBIWeeklyChart(nonCancelledOSs);
    renderBIShareChart(nonCancelledOSs, totalRevenue);
    renderBIServicesRanking(nonCancelledOSs);
    renderBITopPartners(nonCancelledOSs);
}

function renderBIWeeklyChart(OSs) {
    const chart = document.getElementById('bi-chart-semanal');
    
    // Group OS revenues by week number
    // Let's divide the month of June/26 into 4 weeks
    let weekRevenues = { "Semana 1": 0, "Semana 2": 0, "Semana 3": 0, "Semana 4": 0 };
    
    OSs.forEach(o => {
        const day = new Date(o.criadoEm).getDate();
        if (day <= 7) weekRevenues["Semana 1"] += o.valor;
        else if (day <= 14) weekRevenues["Semana 2"] += o.valor;
        else if (day <= 21) weekRevenues["Semana 3"] += o.valor;
        else weekRevenues["Semana 4"] += o.valor;
    });

    const maxRev = Math.max(...Object.values(weekRevenues), 1);

    chart.innerHTML = Object.entries(weekRevenues).map(([week, val]) => {
        const heightPercent = (val / maxRev) * 100;
        return `
            <div class="week-column">
                <div class="week-bar" style="height: ${Math.max(heightPercent, 5)}%">
                    <div class="week-bar-tooltip">${formatCurrency(val)}</div>
                </div>
                <span class="week-label">${week}</span>
            </div>
        `;
    }).join('');
}

function renderBIShareChart(OSs, totalRevenue) {
    const chart = document.getElementById('bi-chart-share');
    if (totalRevenue === 0) {
        chart.innerHTML = '<div class="empty-state">Sem dados no período</div>';
        return;
    }

    const particularRev = OSs.filter(o => o.clienteTipo === 'particular').reduce((sum, o) => sum + o.valor, 0);
    const partnerRev = OSs.filter(o => o.clienteTipo === 'parceiro').reduce((sum, o) => sum + o.valor, 0);

    const particularPercent = (particularRev / totalRevenue) * 100;
    const partnerPercent = (partnerRev / totalRevenue) * 100;

    chart.innerHTML = `
        <div class="bar-row">
            <div class="bar-header">
                <span class="bar-label"><i class="ri-user-line"></i> Particulares (Balcão)</span>
                <span class="bar-value">${particularPercent.toFixed(1)}% (${formatCurrency(particularRev)})</span>
            </div>
            <div class="bar-container">
                <div class="bar-fill" style="width: ${particularPercent}%;"></div>
            </div>
        </div>
        <div class="bar-row">
            <div class="bar-header">
                <span class="bar-label"><i class="ri-briefcase-line"></i> Parceiros Conveniados</span>
                <span class="bar-value">${partnerPercent.toFixed(1)}% (${formatCurrency(partnerRev)})</span>
            </div>
            <div class="bar-container">
                <div class="bar-fill" style="width: ${partnerPercent}%; background: linear-gradient(90deg, var(--accent-light), var(--accent));"></div>
            </div>
        </div>
    `;
}

function renderBIServicesRanking(OSs) {
    const container = document.getElementById('bi-chart-servicos');
    
    // Count OSs by Service
    let servicesCount = {};
    db.servicos.forEach(s => {
        servicesCount[s.nome.split(' — ')[0]] = 0;
    });

    OSs.forEach(o => {
        const shortName = o.servicoNome.split(' — ')[0];
        if (servicesCount[shortName] !== undefined) {
            servicesCount[shortName]++;
        }
    });

    const maxCount = Math.max(...Object.values(servicesCount), 1);
    const sorted = Object.entries(servicesCount).sort((a, b) => b[1] - a[1]);

    container.innerHTML = sorted.map(([name, count]) => {
        const pct = (count / maxCount) * 100;
        return `
            <div class="bar-row">
                <div class="bar-header">
                    <span class="bar-label">${name}</span>
                    <span class="bar-value">${count} OS</span>
                </div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderBITopPartners(OSs) {
    const tbody = document.getElementById('bi-partners-tbody');
    
    // Group spend by partner
    let partnerStats = {};
    db.parceiros.forEach(p => {
        partnerStats[p.id] = { name: p.nome, count: 0, total: 0 };
    });

    OSs.forEach(o => {
        if (o.parceiroId && partnerStats[o.parceiroId]) {
            partnerStats[o.parceiroId].count++;
            partnerStats[o.parceiroId].total += o.valor;
        }
    });

    const sorted = Object.values(partnerStats)
        .filter(p => p.count > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Nenhum parceiro registrou OS neste período.</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(p => {
        const ticket = p.total / p.count;
        return `
            <tr>
                <td><strong>${p.name}</strong></td>
                <td style="text-align: center; font-weight: 600;">${p.count}</td>
                <td style="text-align: right; color: var(--success); font-weight: 700;">${formatCurrency(p.total)}</td>
                <td style="text-align: right;">${formatCurrency(ticket)}</td>
            </tr>
        `;
    }).join('');
}
