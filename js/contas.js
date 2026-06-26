// MODULE: Contas a Pagar
// ==========================================
// CONTAS A PAGAR
// ==========================================
let currentContasTab = 'despesas';
let editingExpenseId = null;

function switchContasTab(tab, btn) {
    currentContasTab = tab;
    document.querySelectorAll('#panel-contas .tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('tab-contas-despesas').style.display = tab === 'despesas' ? 'block' : 'none';
    document.getElementById('tab-contas-variaveis').style.display = tab === 'variaveis' ? 'block' : 'none';
    const assessorTab = document.getElementById('tab-contas-assessor');
    if(assessorTab) assessorTab.style.display = tab === 'assessor' ? 'block' : 'none';

    if (tab === 'despesas') renderContasGerais();
    if (tab === 'variaveis') calcularCustosDetran();
    if (tab === 'assessor') renderAssessorTab();
}

function renderContasPage() {
    renderContasGears();
}

function renderContasGears() {
    renderContasGerais();
}

function renderContasGerais() {
    const tbody = document.getElementById('contas-tbody');
    const list = db.contas_pagar
        .filter(c => c.unidadeId === activeUnitId)
        .sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhuma conta a pagar registrada.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(c => {
        const statusBadge = c.pago 
            ? `<span class="badge badge-done">Paga</span>` 
            : `<span class="badge badge-waiting">Pendente</span>`;

        const obsHtml = c.observacoes 
            ? `<br><small style="color: var(--text-secondary); font-weight: 500; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
                <i class="ri-barcode-line" style="font-size: 12px;"></i> ${c.observacoes}
                <button onclick="copyToClipboard('${c.observacoes}')" title="Copiar código de barras" style="background: none; border: none; padding: 2px; color: var(--accent); cursor: pointer; display: inline-flex; align-items: center; font-size: 11px;">
                    <i class="ri-file-copy-line"></i>
                </button>
               </small>`
            : '';

        const anexoHtml = c.anexo
            ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="previewExpenseAttachment(${c.id})" title="Visualizar Fatura" style="padding: 4px; display: inline-flex; align-items: center; justify-content: center;"><i class="ri-eye-line" style="font-size: 14px;"></i></button>`
            : '<span style="color: var(--text-muted); font-size: 12px;">—</span>';

        const recBadge = c.recorrente
            ? `<span class="badge-recorrente" title="Conta recorrente (${c.frequencia})"><i class="ri-loop-left-line"></i> ${c.frequencia}</span><br>`
            : '';

        return `
            <tr>
                <td><strong>${formatDateBr(c.vencimento)}</strong></td>
                <td>
                    ${recBadge}
                    <strong>${c.descricao}</strong>
                    ${obsHtml}
                </td>
                <td><span class="badge badge-progress">${c.tipo.toUpperCase()}</span></td>
                <td style="text-align: right; color: var(--danger); font-weight: 600;">${formatCurrency(c.valor)}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center;">${anexoHtml}</td>
                <td>
                    <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                        ${!c.pago ? `<button class="btn btn-primary btn-sm" onclick="payExpense(${c.id})"><i class="ri-check-line"></i> Pagar</button>` : `<small style="color:var(--text-muted)">Paga em ${formatDateBr(c.pagoEm)}</small>`}
                        ${!c.pago ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="editExpense(${c.id})" title="Editar"><i class="ri-pencil-line"></i></button>` : ''}
                        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteExpense(${c.id})" title="Excluir"><i class="ri-delete-bin-line"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Toggle recurrence options visibility
function toggleRecorrenciaOptions(value) {
    document.getElementById('desp-qtd-recorrencias-wrapper').style.display = value ? 'block' : 'none';
}

// Calculate next due date based on frequency
function calcularProximoVencimento(dataBase, frequencia, multiplicador) {
    const [y, m, d] = dataBase.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    switch (frequencia) {
        case 'semanal': date.setDate(date.getDate() + (7 * multiplicador)); break;
        case 'mensal': date.setMonth(date.getMonth() + multiplicador); break;
        case 'anual': date.setFullYear(date.getFullYear() + multiplicador); break;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function submitDespesaForm(event) {
    event.preventDefault();
    const desc = document.getElementById('desp-desc').value.trim();
    const venc = document.getElementById('desp-vencimento').value;
    const val = parseFloat(document.getElementById('desp-valor').value);
    const fileInput = document.getElementById('desp-anexo');
    const obs = document.getElementById('desp-obs').value.trim();
    const file = fileInput.files[0];
    const frequencia = document.getElementById('desp-recorrencia').value;
    const qtdRecorrencias = parseInt(document.getElementById('desp-qtd-recorrencias').value) || 12;

    if (!desc) { showToast("Informe a descrição da conta.", "error"); return; }
    if (!venc) { showToast("Informe a data de vencimento.", "error"); return; }
    if (isNaN(val) || val <= 0) { showToast("Informe um valor válido.", "error"); return; }

    const saveExpense = async (anexoData = null) => {
        // UPDATE MODE: editing existing expense
        if (editingExpenseId) {
            const updates = {
                descricao: desc,
                vencimento: venc,
                valor: val,
                observacoes: obs
            };
            if (anexoData) updates.anexo = anexoData;

            try {
                await sbUpdate('contas_pagar', editingExpenseId, updates);
                cacheUpdate('contas_pagar', editingExpenseId, updates);

                showToast("Despesa atualizada com sucesso!", "success");
                logAudit("Edição Despesa", `Editou despesa: ${desc} (Venc: ${formatDateBr(venc)})`);

                editingExpenseId = null;
                document.getElementById('despesa-form').reset();
                document.getElementById('desp-qtd-recorrencias-wrapper').style.display = 'none';
                // Reset button
                const submitBtn = document.querySelector('#despesa-form button[type="submit"]');
                submitBtn.innerHTML = '<i class="ri-check-line"></i> Salvar Despesa';
                submitBtn.classList.remove('btn-warning');
                submitBtn.classList.add('btn-primary');
                renderContasGerais();
            } catch (e) {
                console.error('[Certive] updateExpense error:', e);
                showToast("Erro ao atualizar despesa.", "error");
            }
            return;
        }

        // CREATE MODE: new expense
        const newExpense = {
            unidadeId: activeUnitId,
            descricao: desc,
            tipo: "fixo",
            vencimento: venc,
            valor: val,
            observacoes: obs,
            anexo: anexoData,
            pago: false,
            pagoEm: null,
            recorrente: !!frequencia,
            frequencia: frequencia || null,
            recorrenciaGrupoId: null
        };

        try {
            // Insert the first expense
            const primeira = await sbInsert('contas_pagar', newExpense);
            cacheInsert('contas_pagar', primeira);

            // If recurring, set grupo ID and generate future occurrences
            if (frequencia) {
                // Update the first record with its own ID as the group ID
                await sbUpdate('contas_pagar', primeira.id, { recorrenciaGrupoId: primeira.id });
                cacheUpdate('contas_pagar', primeira.id, { recorrenciaGrupoId: primeira.id });

                // Generate future occurrences (N-1 more)
                const futuras = [];
                for (let i = 1; i < qtdRecorrencias; i++) {
                    futuras.push({
                        unidadeId: activeUnitId,
                        descricao: desc,
                        tipo: "fixo",
                        vencimento: calcularProximoVencimento(venc, frequencia, i),
                        valor: val,
                        observacoes: obs,
                        anexo: null, // Don't duplicate attachments
                        pago: false,
                        pagoEm: null,
                        recorrente: true,
                        frequencia: frequencia,
                        recorrenciaGrupoId: primeira.id
                    });
                }

                const insertedFuturas = await sbInsertMany('contas_pagar', futuras);
                insertedFuturas.forEach(r => cacheInsert('contas_pagar', r));

                showToast(`Conta recorrente criada com ${qtdRecorrencias} ocorrências (${frequencia})!`, "success");
                logAudit("Cadastro Despesa Recorrente", `Criou ${qtdRecorrencias} ocorrências de: ${desc} (${frequencia}, a partir de ${formatDateBr(venc)})`);
            } else {
                showToast("Despesa cadastrada com sucesso!", "success");
                logAudit("Cadastro Despesa", `Adicionou despesa a pagar: ${desc} (Venc: ${formatDateBr(venc)})`);
            }

            document.getElementById('despesa-form').reset();
            document.getElementById('desp-qtd-recorrencias-wrapper').style.display = 'none';
            renderContasGerais();
        } catch (e) {
            console.error('[Certive] saveExpense error:', e);
            showToast("Erro ao cadastrar despesa.", "error");
        }
    };

    if (file) {
        if (file.size > 1024 * 1024) {
            showToast("Erro: O tamanho do anexo não pode exceder 1MB.", "error");
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            saveExpense(e.target.result);
        };
        reader.onerror = function() {
            showToast("Erro ao ler o arquivo de anexo.", "error");
        };
        reader.readAsDataURL(file);
    } else {
        saveExpense();
    }
}

async function payExpense(id) {
    const expense = db.contas_pagar.find(c => c.id === id);
    if (!expense) return;

    const confirmed = await showConfirm({
        title: 'Confirmar Pagamento',
        message: `Confirmar pagamento da despesa <strong>"${expense.descricao}"</strong> no valor de <strong>${formatCurrency(expense.valor)}</strong>?`,
        icon: '💳',
        confirmText: 'Pagar',
        confirmClass: 'btn-success'
    });
    if (confirmed) {
        const updates = {
            pago: true,
            pagoEm: getLocalToday()
        };

        try {
            await sbUpdate('contas_pagar', id, updates);
            cacheUpdate('contas_pagar', id, updates);

            showToast("Despesa marcada como paga!", "success");
            logAudit("Pagamento Despesa", `Marcou despesa como paga: ${expense.descricao}.`);
            renderContasGerais();
        } catch (e) {
            console.error('[Certive] payExpense error:', e);
            showToast("Erro ao pagar despesa.", "error");
        }
    }
}

function editExpense(id) {
    const exp = db.contas_pagar.find(c => c.id === id);
    if (!exp) return;

    editingExpenseId = id;

    document.getElementById('desp-desc').value = exp.descricao;
    document.getElementById('desp-vencimento').value = exp.vencimento;
    document.getElementById('desp-valor').value = exp.valor;
    document.getElementById('desp-obs').value = exp.observacoes || '';
    document.getElementById('desp-recorrencia').value = exp.frequencia || '';
    toggleRecorrenciaOptions(exp.frequencia || '');

    // Change button to update mode
    const submitBtn = document.querySelector('#despesa-form button[type="submit"]');
    submitBtn.innerHTML = '<i class="ri-save-line"></i> Atualizar Despesa';
    submitBtn.classList.remove('btn-primary');
    submitBtn.classList.add('btn-warning');

    // Scroll to form
    document.getElementById('despesa-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Editando despesa. Altere os campos e clique em Atualizar.', 'info');
}

async function deleteExpense(id) {
    const exp = db.contas_pagar.find(c => c.id === id);
    if (!exp) return;

    const confirmed = await showConfirm({
        title: 'Excluir Despesa',
        message: `Excluir a despesa <strong>"${exp.descricao}"</strong> (${formatCurrency(exp.valor)})?`,
        icon: '🗑️',
        confirmText: 'Excluir',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    try {
        await sbDelete('contas_pagar', id);
        cacheDelete('contas_pagar', id);
        showToast('Despesa excluída com sucesso.', 'success');
        logAudit('Exclusão Despesa', `Excluiu despesa: ${exp.descricao} (Venc: ${formatDateBr(exp.vencimento)})`);
        renderContasGerais();
    } catch (e) {
        console.error('[Certive] deleteExpense error:', e);
        showToast('Erro ao excluir despesa.', 'error');
    }
}

function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast("Código de barras copiado!", "success");
    }).catch(err => {
        console.error("Erro ao copiar: ", err);
        showToast("Erro ao copiar automaticamente. Copie manualmente.", "error");
    });
}

function previewExpenseAttachment(id) {
    const expense = db.contas_pagar.find(c => c.id === id);
    if (!expense || !expense.anexo) {
        showToast("Anexo não localizado.", "error");
        return;
    }

    const modal = document.getElementById('modal-os-detalhes');
    document.getElementById('detalhes-os-title').textContent = `Anexo de Fatura — ${expense.descricao}`;
    
    let contentHtml = "";
    if (expense.anexo.startsWith("data:application/pdf")) {
        contentHtml = `
            <div style="height: 500px; width: 100%;">
                <iframe src="${expense.anexo}" style="width: 100%; height: 100%; border: none;" type="application/pdf"></iframe>
            </div>
        `;
    } else {
        contentHtml = `
            <div style="text-align: center; max-height: 500px; overflow-y: auto; padding: 10px;">
                <img src="${expense.anexo}" alt="Anexo Fatura" style="max-width: 100%; height: auto; border-radius: var(--radius-sm); box-shadow: var(--shadow-sm);">
            </div>
        `;
    }

    document.getElementById('detalhes-os-body').innerHTML = contentHtml;
    
    document.getElementById('detalhes-os-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeOSModal()">Fechar</button>
        <a href="${expense.anexo}" download="fatura_despesa_${expense.id}.${expense.anexo.includes('pdf') ? 'pdf' : 'jpg'}" class="btn btn-primary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
            <i class="ri-download-line"></i> Download do Anexo
        </a>
    `;
    
    modal.classList.add('active');
}

// Calculate Detran variable tax due
function calcularCustosDetran() {
    const month = document.getElementById('detran-calculo-mes').value;
    const year = "2026"; // Lock to mock database year
    const tbody = document.getElementById('detran-calculo-tbody');
    const launchBtn = document.getElementById('btn-lancar-detran');

    // Fetch all completed OSs for that month & unit
    const monthlyOSs = db.ordens_servico.filter(o => 
        o.unidadeId === activeUnitId && 
        o.status.startsWith('concluida') && 
        o.criadoEm.startsWith(`${year}-${month}`)
    );

    // Group count by Service type
    let totals = [];
    let grandTotal = 0;

    db.servicos.forEach(s => {
        const count = monthlyOSs.filter(o => o.servicoId === s.id && o.valor > 0).length; // ignore rechecks which are free
        const taxRate = db.taxas_referencia.find(t => t.servicoId === s.id)?.taxa || 0;
        const subtotal = count * taxRate;
        grandTotal += subtotal;

        totals.push({
            name: s.nome.split(' — ')[0],
            count: count,
            rate: taxRate,
            subtotal: subtotal
        });
    });

    tbody.innerHTML = totals.map(t => `
        <tr>
            <td>${t.name}</td>
            <td style="text-align: center; font-weight: 600;">${t.count}</td>
            <td style="text-align: right;">${formatCurrency(t.rate)}</td>
            <td style="text-align: right; color: var(--danger); font-weight: 600;">${formatCurrency(t.subtotal)}</td>
        </tr>
    `).join('') + `
        <tr style="background: rgba(255,255,255,0.01); border-top: 2px solid var(--border);">
            <td><strong>TOTAL TAXAS DE CONCESSÃO</strong></td>
            <td colspan="2"></td>
            <td style="text-align: right; color: var(--danger); font-weight: 800; font-size: 14px;">${formatCurrency(grandTotal)}</td>
        </tr>
    `;

    // Disable launch button if bill is already generated
    const monthLabel = month === '05' ? 'Maio' : (month === '06' ? 'Junho' : 'Julho');
    const checkDuplicate = db.contas_pagar.find(c => 
        c.unidadeId === activeUnitId && 
        c.descricao.includes(`Taxas DETRAN-SC — Consolidação ${monthLabel}/${year}`)
    );

    if (checkDuplicate) {
        launchBtn.disabled = true;
        launchBtn.innerHTML = '<i class="ri-check-line"></i> Guia Já Consolidada';
        launchBtn.classList.add('btn-secondary');
        launchBtn.classList.remove('btn-primary');
    } else {
        launchBtn.disabled = false;
        launchBtn.innerHTML = '<i class="ri-bill-line"></i> Lançar Contas a Pagar DETRAN';
        launchBtn.classList.remove('btn-secondary');
        launchBtn.classList.add('btn-primary');
        window.activeDetranConsolidationVal = grandTotal;
        window.activeDetranMonthLabel = monthLabel;
        window.activeDetranYear = year;
    }
}

async function lancarFaturaDetran() {
    const val = window.activeDetranConsolidationVal;
    const monthLabel = window.activeDetranMonthLabel;
    const year = window.activeDetranYear;

    if (!val || val <= 0) {
        showToast("Nenhum custo encontrado para consolidar neste mês.", "error");
        return;
    }

    const newPayable = {
        unidadeId: activeUnitId,
        descricao: `Taxas DETRAN-SC — Consolidação ${monthLabel}/${year}`,
        tipo: "variavel",
        vencimento: `${year}-${document.getElementById('detran-calculo-mes').value}-28`,
        valor: val,
        pago: false,
        pagoEm: null
    };

    try {
        const inserted = await sbInsert('contas_pagar', newPayable);
        cacheInsert('contas_pagar', inserted);

        showToast("Guia consolidada enviada para o Financeiro com sucesso!", "success");
        logAudit("Consolidação DETRAN", `Gerou taxa DETRAN do mês de ${monthLabel}/${year} consolidada no valor de ${formatCurrency(val)}.`);

        calcularCustosDetran();
    } catch (e) {
        console.error('[Certive] lancarFaturaDetran error:', e);
        showToast("Erro ao lançar guia DETRAN.", "error");
    }
}

const CATEGORIAS_DESPESAS = [
    "Aluguel",
    "Água / Luz / Internet",
    "Impostos / Taxas",
    "Material de Escritório",
    "Serviços de Terceiros",
    "Outros"
];

function renderAssessorTab() {
    const grid = document.getElementById('metas-inputs-grid');
    const activeUnit = db.unidades.find(u => u.id === activeUnitId);
    const unitMetas = activeUnit?.metasFinanceiras || {};

    grid.innerHTML = CATEGORIAS_DESPESAS.map(cat => {
        const metaVal = unitMetas[cat] || 0;
        return `
            <div class="form-group" style="margin: 0;">
                <label style="font-size: 11px; margin-bottom: 4px;">${cat}</label>
                <div style="position: relative;">
                    <span style="position: absolute; left: 10px; top: 9px; font-size: 13px; color: var(--text-muted);">R$</span>
                    <input type="number" step="0.01" class="meta-input-field" data-categoria="${cat}" value="${metaVal.toFixed(2)}" style="padding-left: 32px; font-size: 13px;">
                </div>
            </div>
        `;
    }).join('');

    // 1. Render Category comparison
    const tbodyCat = document.getElementById('assessor-categorias-tbody');
    const unitExpenses = db.contas_pagar.filter(c => c.unidadeId === activeUnitId);
    const currentMonthStr = "2026-06";
    const prevMonthStr = "2026-05";
    
    tbodyCat.innerHTML = CATEGORIAS_DESPESAS.map(cat => {
        const gastoAtual = unitExpenses.filter(c => (c.categoria || 'Outros') === cat && c.vencimento.startsWith(currentMonthStr)).reduce((sum, c) => sum + c.valor, 0);
        const gastoAnterior = unitExpenses.filter(c => (c.categoria || 'Outros') === cat && c.vencimento.startsWith(prevMonthStr)).reduce((sum, c) => sum + c.valor, 0);
        const meta = unitMetas[cat] || 0;
        
        // Historical average including all months in the DB for this unit
        const allMonths = [...new Set(unitExpenses.filter(c => (c.categoria || 'Outros') === cat).map(c => c.vencimento.substring(0, 7)))];
        const numMonths = allMonths.length || 1;
        const totalCatGastos = unitExpenses.filter(c => (c.categoria || 'Outros') === cat).reduce((sum, c) => sum + c.valor, 0);
        const mediaHistorica = totalCatGastos / numMonths;
        
        let statusMetaBadge = '';
        if (meta === 0) {
            statusMetaBadge = `<span class="badge" style="background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border);">Sem Meta</span>`;
        } else if (gastoAtual > meta) {
            statusMetaBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2);"><i class="ri-alert-line"></i> Excedido</span>`;
        } else {
            statusMetaBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2);"><i class="ri-checkbox-circle-line"></i> No Limite</span>`;
        }
        
        let varAntText = '—';
        let varAntStyle = '';
        if (gastoAnterior > 0) {
            const diffPct = ((gastoAtual - gastoAnterior) / gastoAnterior) * 100;
            if (diffPct > 0) {
                varAntText = `+${diffPct.toFixed(1)}% <i class="ri-arrow-up-line"></i>`;
                varAntStyle = 'color: var(--danger); font-weight: 600;';
            } else if (diffPct < 0) {
                varAntText = `${diffPct.toFixed(1)}% <i class="ri-arrow-down-line"></i>`;
                varAntStyle = 'color: var(--success); font-weight: 600;';
            } else {
                varAntText = '0.0%';
                varAntStyle = 'color: var(--text-secondary);';
            }
        } else if (gastoAtual > 0) {
            varAntText = `+100.0% <i class="ri-arrow-up-line"></i>`;
            varAntStyle = 'color: var(--danger); font-weight: 600;';
        }
        
        let varMediaText = '—';
        let varMediaStyle = '';
        if (mediaHistorica > 0) {
            const diffPct = ((gastoAtual - mediaHistorica) / mediaHistorica) * 100;
            if (diffPct > 0) {
                varMediaText = `+${diffPct.toFixed(1)}% <i class="ri-arrow-up-line"></i>`;
                varMediaStyle = 'color: var(--danger); font-weight: 600;';
            } else if (diffPct < 0) {
                varMediaText = `${diffPct.toFixed(1)}% <i class="ri-arrow-down-line"></i>`;
                varMediaStyle = 'color: var(--success); font-weight: 600;';
            } else {
                varMediaText = '0.0%';
                varMediaStyle = 'color: var(--text-secondary);';
            }
        } else if (gastoAtual > 0) {
            varMediaText = `+100.0% <i class="ri-arrow-up-line"></i>`;
            varMediaStyle = 'color: var(--danger); font-weight: 600;';
        }
        
        return `
            <tr>
                <td><strong>${cat}</strong></td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(gastoAtual)}</td>
                <td style="text-align: right; color: var(--text-secondary); font-weight: 500;">${meta > 0 ? formatCurrency(meta) : '—'}</td>
                <td>${statusMetaBadge}</td>
                <td style="text-align: right; color: var(--text-secondary);">${formatCurrency(gastoAnterior)}</td>
                <td style="text-align: right; ${varAntStyle}">${varAntText}</td>
                <td style="text-align: right; color: var(--text-secondary);">${formatCurrency(mediaHistorica)}</td>
                <td style="text-align: right; ${varMediaStyle}">${varMediaText}</td>
            </tr>
        `;
    }).join('');

    // 2. Render Largest Month Variations per provider/category (Camada A Details)
    const currentExpenses = unitExpenses.filter(c => c.vencimento.startsWith(currentMonthStr));
    const prevExpenses = unitExpenses.filter(c => c.vencimento.startsWith(prevMonthStr));
    
    const groupExpenses = (expensesList) => {
        const groups = {};
        expensesList.forEach(e => {
            const key = `${e.fornecedor || 'Outros'}||${e.categoria || 'Outros'}`;
            groups[key] = (groups[key] || 0) + e.valor;
        });
        return groups;
    };
    
    const currentGroups = groupExpenses(currentExpenses);
    const prevGroups = groupExpenses(prevExpenses);
    
    const allKeys = [...new Set([...Object.keys(currentGroups), ...Object.keys(prevGroups)])];
    
    const variations = allKeys.map(key => {
        const [fornecedor, categoria] = key.split('||');
        const gastoAtual = currentGroups[key] || 0;
        const gastoAnterior = prevGroups[key] || 0;
        const diffNominal = gastoAtual - gastoAnterior;
        const diffPct = gastoAnterior > 0 ? (diffNominal / gastoAnterior) * 100 : (gastoAtual > 0 ? 100 : 0);
        
        return {
            fornecedor,
            categoria,
            gastoAtual,
            gastoAnterior,
            diffNominal,
            diffPct
        };
    });
    
    const topVariations = variations
        .filter(v => v.diffNominal !== 0)
        .sort((a, b) => b.diffNominal - a.diffNominal)
        .slice(0, 5);

    const tbodyVar = document.getElementById('assessor-variacoes-tbody');
    if (topVariations.length === 0) {
        tbodyVar.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 12px;">Nenhuma variação identificada.</td></tr>`;
    } else {
        tbodyVar.innerHTML = topVariations.map(v => {
            let varSign = v.diffNominal > 0 ? '+' : '';
            let varStyle = v.diffNominal > 0 ? 'color: var(--danger); font-weight:600;' : 'color: var(--success); font-weight:600;';
            let pctText = v.gastoAnterior > 0 || v.gastoAtual > 0 ? ` (${varSign}${v.diffPct.toFixed(1)}%)` : '';
            
            return `
                <tr>
                    <td><strong>${v.fornecedor}</strong></td>
                    <td><span class="badge badge-secondary" style="font-size: 11px; background: var(--bg-secondary); color: var(--text-secondary);">${v.categoria}</span></td>
                    <td style="text-align: right; font-weight: 600;">${formatCurrency(v.gastoAtual)}</td>
                    <td style="text-align: right; ${varStyle}">${varSign}${formatCurrency(v.diffNominal)}${pctText}</td>
                </tr>
            `;
        }).join('');
    }

    // 3. Render AI insights if switch is checked
    const aiToggle = document.getElementById('ai-toggle-switch');
    const label = document.getElementById('ai-toggle-label');
    const block = document.getElementById('ai-insights-block');
    
    if (aiToggle.checked) {
        label.textContent = "ATIVADO";
        label.style.color = "var(--accent)";
        block.style.display = "block";
        renderAiInsights();
    } else {
        label.textContent = "DESATIVADO";
        label.style.color = "var(--text-secondary)";
        block.style.display = "none";
    }
}

async function submitMetasDespesas(event) {
    event.preventDefault();
    const activeUnit = db.unidades.find(u => u.id === activeUnitId);
    if (!activeUnit) return;
    
    const metasObj = {};
    const inputs = document.querySelectorAll('.meta-input-field');
    inputs.forEach(input => {
        const cat = input.getAttribute('data-categoria');
        const val = parseFloat(input.value) || 0;
        metasObj[cat] = val;
    });
    
    try {
        await sbUpdate('unidades', activeUnitId, { metasFinanceiras: metasObj });
        cacheUpdate('unidades', activeUnitId, { metasFinanceiras: metasObj });
        
        showToast("Metas financeiras salvas com sucesso!", "success");
        logAudit("Alteração Metas", `Atualizou as metas de despesas para a unidade ${activeUnitId}.`);
        renderAssessorTab();
    } catch (e) {
        console.error('[Certive] submitMetasDespesas error:', e);
        showToast("Erro ao salvar metas.", "error");
    }
}

function toggleAiAdvisor(active) {
    const label = document.getElementById('ai-toggle-label');
    const block = document.getElementById('ai-insights-block');
    const checkbox = document.getElementById('ai-toggle-switch');
    
    checkbox.checked = active;
    if (active) {
        label.textContent = "ATIVADO";
        label.style.color = "var(--accent)";
        block.style.display = "block";
        renderAiInsights();
    } else {
        label.textContent = "DESATIVADO";
        label.style.color = "var(--text-secondary)";
        block.style.display = "none";
    }
}

function renderAiInsights() {
    const contentDiv = document.getElementById('ai-insights-content');
    const unitExpenses = db.contas_pagar.filter(c => c.unidadeId === activeUnitId);
    const currentMonthStr = "2026-06";
    const prevMonthStr = "2026-05";
    
    const currentExpenses = unitExpenses.filter(c => c.vencimento.startsWith(currentMonthStr));
    const prevExpenses = unitExpenses.filter(c => c.vencimento.startsWith(prevMonthStr));
    
    const exceededCategories = [];
    const increasedCategories = [];
    let totalCurrent = 0;
    let totalPrev = 0;
    
    const activeUnit = db.unidades.find(u => u.id === activeUnitId);
    const unitMetas = activeUnit?.metasFinanceiras || {};
    
    CATEGORIAS_DESPESAS.forEach(cat => {
        const gastoAtual = currentExpenses.filter(c => (c.categoria || 'Outros') === cat).reduce((sum, c) => sum + c.valor, 0);
        const gastoAnterior = prevExpenses.filter(c => (c.categoria || 'Outros') === cat).reduce((sum, c) => sum + c.valor, 0);
        const meta = unitMetas[cat] || 0;
        
        totalCurrent += gastoAtual;
        totalPrev += gastoAnterior;
        
        if (meta > 0 && gastoAtual > meta) {
            exceededCategories.push({
                categoria: cat,
                gasto: gastoAtual,
                meta: meta,
                excesso: gastoAtual - meta
            });
        }
        
        if (gastoAnterior > 0) {
            const increase = gastoAtual - gastoAnterior;
            const pct = (increase / gastoAnterior) * 100;
            if (pct > 5) {
                increasedCategories.push({
                    categoria: cat,
                    atual: gastoAtual,
                    anterior: gastoAnterior,
                    aumentoPct: pct,
                    aumentoNominal: increase
                });
            }
        }
    });
    
    let insightsHtml = `
        <div style="color: var(--text-primary); font-size: 13px;">
            <p style="margin-bottom: 12px; font-weight: 500;">
                <i class="ri-user-smile-line" style="color: var(--accent); font-size: 16px; margin-right: 6px; vertical-align: middle;"></i> 
                Olá! Analisei os lançamentos de contas a pagar da unidade <strong>${db.unidades.find(u => u.id === activeUnitId)?.nome || 'Unidade'}</strong> e aqui estão as minhas observações inteligentes:
            </p>
            <ul style="list-style-type: none; padding-left: 0; display: flex; flex-direction: column; gap: 10px;">
    `;
    
    let hasInsights = false;
    
    if (exceededCategories.length > 0) {
        hasInsights = true;
        exceededCategories.forEach(item => {
            insightsHtml += `
                <li style="background: rgba(239, 68, 68, 0.05); border-left: 4px solid var(--danger); padding: 10px 14px; border-radius: 0 6px 6px 0;">
                    <strong style="color: var(--danger);"><i class="ri-error-warning-fill"></i> ALERTA DE ORÇAMENTO ESTOURADO:</strong> 
                    A categoria <strong>${item.categoria}</strong> atingiu <strong>${formatCurrency(item.gasto)}</strong>, superando a meta definida de <strong>${formatCurrency(item.meta)}</strong> em <strong>${formatCurrency(item.excesso)}</strong> (+${((item.excesso/item.meta)*100).toFixed(1)}%). 
                    <div style="margin-top: 4px; font-size: 12px; color: var(--text-secondary);">Recomendação: Revise os contratos de fornecedores ativos nessa categoria e verifique se houve lançamentos duplicados ou pontuais não planejados neste mês.</div>
                </li>
            `;
        });
    }
    
    if (increasedCategories.length > 0) {
        hasInsights = true;
        increasedCategories.forEach(item => {
            insightsHtml += `
                <li style="background: rgba(212, 160, 23, 0.05); border-left: 4px solid var(--accent); padding: 10px 14px; border-radius: 0 6px 6px 0;">
                    <strong style="color: var(--accent);"><i class="ri-pulse-line"></i> AUMENTO DE CUSTOS:</strong> 
                    Os gastos na categoria <strong>${item.categoria}</strong> subiram <strong>${item.aumentoPct.toFixed(1)}%</strong> em relação ao mês anterior (de <strong>${formatCurrency(item.anterior)}</strong> para <strong>${formatCurrency(item.atual)}</strong>, uma alta de <strong>${formatCurrency(item.aumentoNominal)}</strong>).
                    <div style="margin-top: 4px; font-size: 12px; color: var(--text-secondary);">Recomendação: Negocie prazos ou tarifas com fornecedores para mitigar essa escalada. Priorize auditoria de consumo caso envolva serviços de utilidades públicas (Água/Luz/Internet).</div>
                </li>
            `;
        });
    }
    
    if (totalCurrent < totalPrev && totalCurrent > 0) {
        hasInsights = true;
        const economizado = totalPrev - totalCurrent;
        const pctEco = (economizado / totalPrev) * 100;
        insightsHtml += `
            <li style="background: rgba(16, 185, 129, 0.05); border-left: 4px solid var(--success); padding: 10px 14px; border-radius: 0 6px 6px 0;">
                <strong style="color: var(--success);"><i class="ri-checkbox-circle-fill"></i> DESEMPENHO POSITIVO:</strong> 
                Parabéns! O custo operacional total da unidade neste mês é de <strong>${formatCurrency(totalCurrent)}</strong>, representando uma redução de <strong>${pctEco.toFixed(1)}%</strong> (economia de <strong>${formatCurrency(economizado)}</strong>) em comparação com o mês anterior (<strong>${formatCurrency(totalPrev)}</strong>).
            </li>
        `;
    }
    
    const detranExpense = currentExpenses.find(e => e.fornecedor === "DETRAN-SC");
    if (detranExpense) {
        hasInsights = true;
        insightsHtml += `
            <li style="background: rgba(59, 130, 246, 0.05); border-left: 4px solid #3b82f6; padding: 10px 14px; border-radius: 0 6px 6px 0;">
                <strong style="color: #3b82f6;"><i class="ri-information-fill"></i> DETRAN-SC CONSOLIDAÇÃO:</strong> 
                Identifiquei o lançamento de despesa variável <strong>${detranExpense.descricao}</strong> no valor de <strong>${formatCurrency(detranExpense.valor)}</strong>.
                <div style="margin-top: 4px; font-size: 12px; color: var(--text-secondary);">Nota: Esta despesa reflete as taxas cobradas pelo portal DETRAN-SC. Certifique-se de que os valores foram devidamente auditados contra o faturamento total antes do pagamento final.</div>
            </li>
        `;
    }
    
    if (!hasInsights) {
        insightsHtml += `
            <li style="background: var(--bg-secondary); border-left: 4px solid var(--text-secondary); padding: 10px 14px; border-radius: 0 6px 6px 0;">
                <strong><i class="ri-information-line"></i> INFORMAÇÃO:</strong> 
                Os dados atuais são insuficientes para detectar desvios de orçamento ou variações elevadas. Continue cadastrando despesas normais e metas para receber recomendações direcionadas.
            </li>
        `;
    }
    
    insightsHtml += `
            </ul>
            <p style="margin-top: 14px; font-size: 11px; color: var(--text-muted); font-style: italic; text-align: right;">
                * As sugestões acima são geradas dinamicamente com base nas metas financeiras e no fluxo de caixa cadastrado no sistema.
            </p>
        </div>
    `;
    
    contentDiv.innerHTML = insightsHtml;
}
