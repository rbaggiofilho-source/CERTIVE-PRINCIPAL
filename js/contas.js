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

    if (tab === 'despesas') renderContasGerais();
    if (tab === 'variaveis') calcularCustosDetran();
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
