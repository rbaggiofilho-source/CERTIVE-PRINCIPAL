// MODULE: Configurações
// ==========================================
// CONFIGURAÇÕES & CADASTROS
// ==========================================
let currentConfigTab = 'precos';

function switchConfigTab(tab, btn) {
    currentConfigTab = tab;
    document.querySelectorAll('#panel-config .tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('tab-cfg-precos').style.display = tab === 'precos' ? 'block' : 'none';
    document.getElementById('tab-cfg-parceiros').style.display = tab === 'parceiros' ? 'block' : 'none';
    document.getElementById('tab-cfg-operadores').style.display = tab === 'operadores' ? 'block' : 'none';

    if (tab === 'precos') renderConfigPrecos();
    if (tab === 'parceiros') renderConfigParceiros();
    if (tab === 'operadores') renderConfigOperadores();
}

function renderConfigPage() {
    renderConfigPrecos();
}

// Config: Tabela de Preços e Taxas
function renderConfigPrecos() {
    const precosContainer = document.getElementById('config-precos-inputs');
    const taxasContainer = document.getElementById('config-taxas-inputs');

    precosContainer.innerHTML = db.servicos.map(s => `
        <div class="form-group">
            <label>${s.nome}</label>
            <input type="number" step="0.01" name="cfg-svc-${s.id}" value="${s.precoBalcao.toFixed(2)}" required>
        </div>
    `).join('');

    taxasContainer.innerHTML = db.servicos.map(s => {
        const tax = db.taxas_referencia.find(t => t.servicoId === s.id)?.taxa || 0;
        return `
            <div class="form-group">
                <label>Taxa Órgão — ${s.nome.split(' — ')[0]}</label>
                <input type="number" step="0.01" name="cfg-tax-${s.id}" value="${tax.toFixed(2)}" required>
            </div>
        `;
    }).join('');
}

async function submitConfigPrecos(event) {
    event.preventDefault();
    try {
        for (const s of db.servicos) {
            const val = parseFloat(document.querySelector(`input[name="cfg-svc-${s.id}"]`).value);
            await sbUpdate('servicos', s.id, { precoBalcao: val });
            cacheUpdate('servicos', s.id, { precoBalcao: val });
        }
        showToast("Tabela de preços de balcão atualizada com sucesso!", "success");
        logAudit("Ajuste Preço", "Alterou valores da tabela de balcão.");
    } catch (e) {
        console.error('[Certive] submitConfigPrecos error:', e);
        showToast("Erro ao salvar preços.", "error");
    }
}

async function submitConfigTaxas(event) {
    event.preventDefault();
    try {
        for (const s of db.servicos) {
            const val = parseFloat(document.querySelector(`input[name="cfg-tax-${s.id}"]`).value);
            const refTax = db.taxas_referencia.find(t => t.servicoId === s.id);
            if (refTax) {
                await sbUpdate('taxas_referencia', refTax.id, { taxa: val });
                cacheUpdate('taxas_referencia', refTax.id, { taxa: val });
            }
        }
        showToast("Tabela de taxas de concessão do órgão atualizada!", "success");
        logAudit("Ajuste Taxa", "Alterou taxas de referência do DETRAN.");
    } catch (e) {
        console.error('[Certive] submitConfigTaxas error:', e);
        showToast("Erro ao salvar taxas.", "error");
    }
}

// Config: Parceiros Conveniados
function renderConfigParceiros() {
    const matrixContainer = document.getElementById('config-partner-matrix');
    
    // Draw pricing matrix inputs for partner form (excluding Exotic Cars ID 6)
    matrixContainer.innerHTML = db.servicos.filter(s => s.id !== 6).map(s => `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
            <span style="color: var(--text-secondary);">${s.nome.split(' — ')[0]}</span>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 11px; color: var(--text-muted);">Acordado: R$</span>
                <input type="number" step="0.01" name="matrix-price-${s.id}" placeholder="${s.precoBalcao}" style="width: 100px; padding: 4px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary);" required>
            </div>
        </div>
    `).join('');

    const tbody = document.getElementById('cfg-partners-tbody');
    if (tbody) {
        tbody.innerHTML = db.parceiros.map(p => `
            <tr>
                <td><strong>${p.nome}</strong></td>
                <td>${p.cnpj}</td>
                <td>
                    <strong>${p.responsavel || '—'}</strong><br>
                    <small style="color: var(--text-secondary); font-weight: 500;">TEL: ${p.telefone}</small>
                </td>
                <td>${p.usaFaturamento ? '🟢 Sim (Mensal)' : '🔴 Não (Balcão)'}</td>
                <td style="text-align: right; padding-right: 20px;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end;">
                        <button class="btn btn-secondary btn-sm" onclick="editPartnerDetails(${p.id})" title="Editar Dados"><i class="ri-edit-line"></i> Dados</button>
                        <button class="btn btn-secondary btn-sm" onclick="openEditPartnerMatrix(${p.id})" title="Editar Preços"><i class="ri-money-dollar-circle-line"></i> Preços</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

async function submitConfigPartner(event) {
    event.preventDefault();
    const nome = document.getElementById('cfg-part-nome').value.trim();
    if (!nome) { showToast("Informe o nome do parceiro.", "error"); return; }
    const cnpj = document.getElementById('cfg-part-cnpj').value.trim();
    const responsavel = document.getElementById('cfg-part-responsavel').value.trim();
    const tel = document.getElementById('cfg-part-tel').value.trim();
    const fat = document.getElementById('cfg-part-faturamento').checked;
    const obs = document.getElementById('cfg-part-obs').value.trim();

    // Build Price table map (excluding Exotic Cars ID 6)
    let customPrecos = {};
    db.servicos.filter(s => s.id !== 6).forEach(s => {
        const val = parseFloat(document.querySelector(`input[name="matrix-price-${s.id}"]`).value);
        customPrecos[s.id] = val;
    });

    if (window.editingPartnerId) {
        const updates = {
            nome: nome,
            cnpj: cnpj,
            responsavel: responsavel,
            telefone: tel,
            usaFaturamento: fat,
            observacoes: obs,
            tabelaPrecos: customPrecos
        };

        try {
            await sbUpdate('parceiros', window.editingPartnerId, updates);
            cacheUpdate('parceiros', window.editingPartnerId, updates);

            showToast("Cadastro de parceiro atualizado com sucesso!", "success");
            logAudit("Edição Parceiro", `Atualizou os dados do parceiro ${nome}.`);
            cancelEditPartner();
        } catch (e) {
            console.error('[Certive] submitConfigPartner (edit) error:', e);
            showToast("Erro ao atualizar parceiro.", "error");
        }
    } else {
        const newPartner = {
            nome: nome,
            cnpj: cnpj,
            responsavel: responsavel,
            telefone: tel,
            usaFaturamento: fat,
            observacoes: obs,
            tabelaPrecos: customPrecos
        };

        try {
            const inserted = await sbInsert('parceiros', newPartner);
            cacheInsert('parceiros', inserted);

            showToast("Parceiro conveniado adicionado com sucesso!", "success");
            logAudit("Cadastro Parceiro", `Cadastrou parceiro ${nome}.`);

            document.getElementById('config-partner-form').reset();
            renderConfigParceiros();
        } catch (e) {
            console.error('[Certive] submitConfigPartner (new) error:', e);
            showToast("Erro ao cadastrar parceiro.", "error");
        }
    }
}

function editPartnerDetails(id) {
    const partner = db.parceiros.find(p => p.id === id);
    if (!partner) return;

    window.editingPartnerId = id;

    document.getElementById('cfg-part-nome').value = partner.nome;
    document.getElementById('cfg-part-cnpj').value = partner.cnpj;
    document.getElementById('cfg-part-responsavel').value = partner.responsavel || '';
    document.getElementById('cfg-part-tel').value = partner.telefone;
    document.getElementById('cfg-part-faturamento').checked = partner.usaFaturamento;
    document.getElementById('cfg-part-obs').value = partner.observacoes || '';

    // Populate prices matrix (excluding Exotic Cars ID 6)
    db.servicos.filter(s => s.id !== 6).forEach(s => {
        const input = document.querySelector(`input[name="matrix-price-${s.id}"]`);
        if (input) {
            const price = partner.tabelaPrecos[s.id] || s.precoBalcao;
            input.value = price.toFixed(2);
        }
    });

    // Update UI elements
    document.getElementById('cfg-partner-form-header-title').innerHTML = '<i class="ri-edit-line"></i> Editar Parceiro';
    document.getElementById('cfg-partner-submit-btn').innerHTML = '<i class="ri-save-line"></i> Salvar Alterações';
    document.getElementById('cfg-partner-cancel-edit').style.display = 'inline-block';

    document.getElementById('config-partner-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditPartner() {
    window.editingPartnerId = null;

    document.getElementById('config-partner-form').reset();

    // Reset UI elements
    document.getElementById('cfg-partner-form-header-title').innerHTML = '<i class="ri-user-add-line"></i> Adicionar Novo Parceiro';
    document.getElementById('cfg-partner-submit-btn').innerHTML = '<i class="ri-user-follow-line"></i> Cadastrar Parceiro';
    document.getElementById('cfg-partner-cancel-edit').style.display = 'none';

    renderConfigParceiros();
}

function openEditPartnerMatrix(partnerId) {
    const partner = db.parceiros.find(p => p.id === partnerId);
    if (!partner) return;

    let tableRows = db.servicos.filter(s => s.id !== 6).map(s => {
        const currentPrice = partner.tabelaPrecos[s.id] || s.precoBalcao;
        return `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 8px 0;">${s.nome}</td>
                <td style="text-align: right; padding: 8px 0;">
                    <input type="number" step="0.01" id="edit-matrix-price-${s.id}" value="${currentPrice.toFixed(2)}" style="width: 100px; padding: 4px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); text-align: right;">
                </td>
            </tr>
        `;
    }).join('');

    const bodyHtml = `
        <div class="form-group">
            <label>Parceiro Conveniado</label>
            <strong>${partner.nome}</strong>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="border-bottom: 2px solid var(--border); text-align: left;">
                    <th style="padding-bottom: 8px;">Serviço</th>
                    <th style="text-align: right; padding-bottom: 8px;">Preço Customizado (R$)</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;

    const footerHtml = `
        <button class="btn btn-secondary btn-sm" onclick="closeOSModal()">Cancelar</button>
        <button class="btn btn-success btn-sm" onclick="savePartnerMatrix(${partner.id})">Salvar Alterações</button>
    `;

    // Re-use OS modal wrapper for quick interface load
    const modal = document.getElementById('modal-os-detalhes');
    document.getElementById('detalhes-os-title').textContent = `Tabela Acordada — ${partner.nome}`;
    document.getElementById('detalhes-os-body').innerHTML = bodyHtml;
    document.getElementById('detalhes-os-footer').innerHTML = footerHtml;
    modal.classList.add('active');
}

async function savePartnerMatrix(partnerId) {
    const partner = db.parceiros.find(p => p.id === partnerId);
    if (!partner) return;

    let newPrecos = { ...partner.tabelaPrecos };
    db.servicos.filter(s => s.id !== 6).forEach(s => {
        const val = parseFloat(document.getElementById(`edit-matrix-price-${s.id}`).value);
        newPrecos[s.id] = val;
    });

    try {
        await sbUpdate('parceiros', partnerId, { tabelaPrecos: newPrecos });
        cacheUpdate('parceiros', partnerId, { tabelaPrecos: newPrecos });

        showToast("Tabela acordada do parceiro atualizada!", "success");
        logAudit("Ajuste Tabela Parceiro", `Atualizou a tabela de preços do parceiro ${partner.nome}.`);
        closeOSModal();
        renderConfigParceiros();
    } catch (e) {
        console.error('[Certive] savePartnerMatrix error:', e);
        showToast("Erro ao salvar tabela do parceiro.", "error");
    }
}

// Config: Operadores & Unidades
function renderConfigOperadores() {
    // Fill Unit Selector inside Operator Form
    const opUnitSelect = document.getElementById('cfg-op-unidade');
    opUnitSelect.innerHTML = db.unidades.map(u => `<option value="${u.id}">${u.nome.split(' — ')[1]}</option>`).join('');

    // Operators list
    const tbodyOps = document.getElementById('cfg-operators-tbody');
    tbodyOps.innerHTML = db.operadores.map(o => {
        const unit = db.unidades.find(u => u.id === o.unidadeId);
        return `
            <tr>
                <td><strong>${o.login}</strong></td>
                <td>${o.nome}</td>
                <td>${unit ? unit.nome.split(' — ')[1] : '—'}</td>
                <td>${o.ativo ? '🟢 Ativo' : '🔴 Inativo'}</td>
            </tr>
        `;
    }).join('');

    // Units list
    const tbodyUnits = document.getElementById('cfg-units-tbody');
    tbodyUnits.innerHTML = db.unidades.map(u => `
        <tr>
            <td><strong>${u.nome}</strong></td>
            <td>${u.endereco}</td>
        </tr>
    `).join('');
}

async function submitConfigOperator(event) {
    event.preventDefault();
    const nome = document.getElementById('cfg-op-nome').value.trim();
    const login = document.getElementById('cfg-op-login').value.trim();
    const senha = document.getElementById('cfg-op-senha').value.trim();
    const unitId = parseInt(document.getElementById('cfg-op-unidade').value);

    if (!nome) { showToast("Informe o nome do operador.", "error"); return; }
    if (!login) { showToast("Informe o login do operador.", "error"); return; }
    if (!senha) { showToast("Informe a senha do operador.", "error"); return; }
    
    // Read selected permissions
    const checkedPerms = Array.from(document.querySelectorAll('#tab-cfg-operadores input[type="checkbox"]:checked')).map(el => el.value);

    const checkDuplicate = db.operadores.find(o => o.login === login);
    if (checkDuplicate) {
        showToast("Erro: Este login de acesso já está em uso.", "error");
        return;
    }

    const newOp = {
        nome: nome,
        login: login,
        senha: senha,
        funcao: checkedPerms.includes("bi") ? "Gerente" : "Operador",
        unidadeId: unitId,
        permissoes: checkedPerms,
        ativo: true
    };

    try {
        const inserted = await sbInsert('operadores', newOp);
        cacheInsert('operadores', inserted);

        showToast("Novo operador cadastrado!", "success");
        logAudit("Cadastro Operador", `Adicionou operador ${login}.`);

        document.getElementById('config-op-form').reset();
        renderConfigOperadores();
    } catch (e) {
        console.error('[Certive] submitConfigOperator error:', e);
        showToast("Erro ao cadastrar operador.", "error");
    }
}

async function submitConfigUnit(event) {
    event.preventDefault();
    const nome = document.getElementById('cfg-unit-nome').value.trim();
    const end = document.getElementById('cfg-unit-endereco').value.trim();

    const newUnit = {
        nome: nome,
        endereco: end
    };

    try {
        const inserted = await sbInsert('unidades', newUnit);
        cacheInsert('unidades', inserted);

        showToast("Nova filial cadastrada com sucesso!", "success");
        logAudit("Cadastro Filial", `Adicionou filial: ${nome}.`);

        document.getElementById('config-unit-form').reset();

        // Refresh selections & layout
        renderUnitSelectorOptions();
        renderConfigOperadores();
    } catch (e) {
        console.error('[Certive] submitConfigUnit error:', e);
        showToast("Erro ao cadastrar filial.", "error");
    }
}

// Formatting helpers
function maskPlaca(v) {
    v = v.replace(/[^A-Za-z0-9]/g, '').slice(0, 7);
    return v.length > 3 ? v.slice(0, 3) + '-' + v.slice(3) : v;
}

function maskCpfCnpj(v) {
    v = v.replace(/\D/g, '').slice(0, 14);
    if (v.length <= 11) {
        // CPF: 999.999.999-99
        v = v.replace(/(\d{3})(\d)/, '$1.$2');
        v = v.replace(/(\d{3})(\d)/, '$1.$2');
        v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
        // CNPJ: 99.999.999/9999-99
        v = v.replace(/^(\d{2})(\d)/, '$1.$2');
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
        v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
    }
    return v;
}

function maskCelular(v) {
    v = v.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) {
        v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
        v = v.replace(/(\d{5})(\d)/, '$1-$2');
    } else if (v.length > 5) {
        v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
    } else if (v.length > 2) {
        v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
    } else if (v.length > 0) {
        v = v.replace(/^(\d)/g, '($1');
    }
    return v;
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize DB from Supabase
    await initDatabase();
    
    // 2. Validate current session and display screens
    checkSession();

    // 3. Setup form input formatters / masks
    const inputCpf = document.getElementById('os-cpf-cliente');
    if (inputCpf) {
        inputCpf.addEventListener('input', function() {
            this.value = maskCpfCnpj(this.value);
        });
    }

    const inputCel = document.getElementById('os-celular-cliente');
    if (inputCel) {
        inputCel.addEventListener('input', function() {
            this.value = maskCelular(this.value);
        });
    }

    const inputPlaca = document.getElementById('os-placa');
    if (inputPlaca) {
        inputPlaca.addEventListener('input', function() {
            this.value = maskPlaca(this.value);
        });
    }

    const inputRenavam = document.getElementById('os-renavam');
    if (inputRenavam) {
        inputRenavam.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 11);
        });
    }

    // Config partner masks
    const partnerCnpj = document.getElementById('cfg-part-cnpj');
    if (partnerCnpj) {
        partnerCnpj.addEventListener('input', function() {
            this.value = maskCpfCnpj(this.value);
        });
    }

    const partnerTel = document.getElementById('cfg-part-tel');
    if (partnerTel) {
        partnerTel.addEventListener('input', function() {
            this.value = maskCelular(this.value);
        });
    }

    // Edit OS Modal masks
    const editCpf = document.getElementById('edit-os-cpf');
    if (editCpf) {
        editCpf.addEventListener('input', function() {
            this.value = maskCpfCnpj(this.value);
        });
    }

    const editCel = document.getElementById('edit-os-celular');
    if (editCel) {
        editCel.addEventListener('input', function() {
            this.value = maskCelular(this.value);
        });
    }

    const editPlaca = document.getElementById('edit-os-placa');
    if (editPlaca) {
        editPlaca.addEventListener('input', function() {
            this.value = maskPlaca(this.value);
        });
    }

    const editRenavam = document.getElementById('edit-os-renavam');
    if (editRenavam) {
        editRenavam.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 11);
        });
    }

    // 4. Force CapsLock / Global Uppercase typing (except password fields)
    document.addEventListener('input', function(e) {
        const t = e.target;
        if (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'search') && t.id !== 'login-password' && t.id !== 'login-username' && t.id !== 'cfg-op-senha') {
            const start = t.selectionStart;
            const end = t.selectionEnd;
            t.value = t.value.toUpperCase();
            t.setSelectionRange(start, end);
        }
        if (t.tagName === 'TEXTAREA') {
            const start = t.selectionStart;
            const end = t.selectionEnd;
            t.value = t.value.toUpperCase();
            t.setSelectionRange(start, end);
        }
    });
});
