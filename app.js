// ==========================================
// CERTIVE VISTORIAS — CORE ENGINE (app.js)
// ==========================================

// Global state variables
let db = {};
let currentSession = null;
let activeUnitId = 1;
let currentClientType = 'particular'; // 'particular' or 'parceiro'
let currentSelectedServiceId = null;

// Initialize Database from Supabase
async function initDatabase() {
    await loadAllFromSupabase();
    console.log('[Certive] Database loaded from Supabase:', Object.keys(db).map(k => k + '(' + (db[k]?.length || 0) + ')').join(', '));
}

function saveDatabase() {
    // No-op: data is now persisted in Supabase.
    // Kept as empty function to avoid errors from any remaining calls.
}

async function loadDatabase() {
    await loadAllFromSupabase();
}

// Seed 30 Days of realistic business data
function seedHistoricalData() {
    const totalDays = 30;
    const today = new Date();
    
    // Generate dates starting from 30 days ago
    let datePointer = new Date();
    datePointer.setDate(today.getDate() - totalDays);

    let osIdCounter = 1;
    let movIdCounter = 1;
    let fatIdCounter = 1;
    let contaIdCounter = 1;

    // Fixed expense templates
    db.contas_pagar.push(
        { id: contaIdCounter++, unidadeId: 1, descricao: "Aluguel Comercial - Matriz", tipo: "fixo", vencimento: "2026-05-10", valor: 2500.00, pago: true, pagoEm: "2026-05-09" },
        { id: contaIdCounter++, unidadeId: 2, descricao: "Aluguel Comercial - Filial", tipo: "fixo", vencimento: "2026-05-10", valor: 1800.00, pago: true, pagoEm: "2026-05-10" },
        { id: contaIdCounter++, unidadeId: 1, descricao: "Energia Elétrica Celesc - Matriz", tipo: "fixo", vencimento: "2026-05-15", valor: 450.00, pago: true, pagoEm: "2026-05-14" },
        { id: contaIdCounter++, unidadeId: 2, descricao: "Energia Elétrica Celesc - Filial", tipo: "fixo", vencimento: "2026-05-15", valor: 310.00, pago: true, pagoEm: "2026-05-15" },
        { id: contaIdCounter++, unidadeId: 1, descricao: "Aluguel Comercial - Matriz", tipo: "fixo", vencimento: "2026-06-10", valor: 2500.00, pago: true, pagoEm: "2026-06-09" },
        { id: contaIdCounter++, unidadeId: 2, descricao: "Aluguel Comercial - Filial", tipo: "fixo", vencimento: "2026-06-10", valor: 1800.00, pago: false, pagoEm: null },
        { id: contaIdCounter++, unidadeId: 1, descricao: "Energia Elétrica Celesc - Matriz", tipo: "fixo", vencimento: "2026-06-15", valor: 420.00, pago: false, pagoEm: null },
        { id: contaIdCounter++, unidadeId: 2, descricao: "Energia Elétrica Celesc - Filial", tipo: "fixo", vencimento: "2026-06-15", valor: 290.00, pago: false, pagoEm: null }
    );

    // Track unbilled partner OSs for bulk invoicing
    let pendingPartnerOSs = [];

    // Loop through past days to create OSs and Cash Drawer movements
    for (let d = 0; d < totalDays; d++) {
        // Don't seed future data
        if (datePointer > today) break;

        const dateStr = datePointer.toISOString().split('T')[0];
        
        // Skip Sundays (non-working day)
        if (datePointer.getDay() === 0) {
            datePointer.setDate(datePointer.getDate() + 1);
            continue;
        }

        // Daily Cash Drawer structure per unit active on that day
        const units = [1, 2];
        units.forEach(unitId => {
            const caixaId = d * 10 + unitId;
            let cashDrawer = {
                id: caixaId,
                unidadeId: unitId,
                data: dateStr,
                status: "fechado",
                abertoPor: "Ana Atendente",
                fechadoPor: "Carlos Financeiro",
                saldoAbertura: 200.00,
                saldoEspécieInformado: 0,
                fechadoEm: dateStr + "T18:00:00.000Z"
            };

            // Seed 1 to 4 OSs per unit per day
            const osCount = Math.floor(Math.random() * 3) + 1; // 1 to 3 OSs
            let totalEntradas = 0;
            let totalSaidas = 0;
            let cashBalance = 200.00; // Starts with opening float

            for (let i = 0; i < osCount; i++) {
                const osId = osIdCounter++;
                const isParticular = Math.random() < 0.6; // 60% Particular
                const service = db.servicos[Math.floor(Math.random() * db.servicos.length)];
                
                let val = service.precoBalcao;
                let clientNome = "";
                let cpfCnpj = "";
                let cel = "(48) 9" + Math.floor(10000000 + Math.random() * 90000000);
                let partnerId = null;
                let pagamento = "pix";

                if (isParticular) {
                    // Small price negotiation mock for particulars
                    val = val - (Math.random() < 0.3 ? 10.00 : 0);
                    clientNome = ["Marcos Souza", "Juliana Costa", "Renato Abreu", "Fabio Santos", "Carla Dias", "Fernando Lima"][Math.floor(Math.random() * 6)];
                    cpfCnpj = Math.floor(10000000000 + Math.random() * 90000000000).toString();
                    pagamento = ["pix", "debito", "credito", "especie"][Math.floor(Math.random() * 4)];
                } else {
                    // Partner client
                    const partner = db.parceiros[Math.floor(Math.random() * db.parceiros.length)];
                    partnerId = partner.id;
                    val = partner.tabelaPrecos[service.id];
                    clientNome = partner.nome;
                    cpfCnpj = partner.cnpj;
                    pagamento = partner.usaFaturamento && Math.random() < 0.85 ? "faturamento" : "pix";
                }

                // Random status (90% approved, 8% reproved, 2% cancelled)
                let status = "concluida_aprovada";
                const randStatus = Math.random();
                if (randStatus < 0.08) {
                    status = "concluida_reprovada";
                } else if (randStatus < 0.10) {
                    status = "cancelada";
                }

                const createdTime = dateStr + "T" + String(9 + i*2).padStart(2, '0') + ":30:00.000Z";
                
                let os = {
                    id: osId,
                    numero: "OS-" + String(osId).padStart(4, '0'),
                    criadoEm: createdTime,
                    criadoPor: "Ana Atendente",
                    unidadeId: unitId,
                    clienteTipo: isParticular ? "particular" : "parceiro",
                    parceiroId: partnerId,
                    clienteNome: clientNome,
                    clienteCpfCnpj: cpfCnpj,
                    clienteCelular: cel,
                    placa: ["MCG", "OKD", "QJZ", "RAH", "BRA"][Math.floor(Math.random() * 5)] + String(Math.floor(1000 + Math.random() * 9000)),
                    renavam: String(Math.floor(10000000000 + Math.random() * 90000000000)),
                    servicoId: service.id,
                    servicoNome: service.nome,
                    valor: val,
                    observacoes: ["FIAT UNO 2012 BRANCO", "RENAULT SANDERO 2015 PRATA", "VW GOL 2018 VERMELHO", "CHEVROLET ONIX 2021 PRETO", "HYUNDAI HB20 2019 CINZA"][Math.floor(Math.random() * 5)],
                    pago: pagamento !== "faturamento" && status !== "cancelada",
                    formaPagamento: pagamento,
                    detranRegistrado: Math.random() < 0.9,
                    docVeiculoApresentado: true,
                    docIdentificacaoApresentado: true,
                    status: status,
                    finalizadoEm: status.startsWith("concluida") ? createdTime : null,
                    finalizadoPor: status.startsWith("concluida") ? "Ana Atendente" : null,
                    canceladoEm: status === "cancelada" ? createdTime : null,
                    canceladoPor: status === "cancelada" ? "Ana Atendente" : null,
                    reapresentacaoOrigemID: null
                };

                db.ordens_servico.push(os);

                // Financial entry if paid immediately
                if (os.pago && status !== "cancelada") {
                    let mov = {
                        id: movIdCounter++,
                        caixaId: caixaId,
                        tipo: "entrada",
                        valor: val,
                        descricao: `Serviço ${service.nome.split(' — ')[0]} (Placa: ${os.placa})`,
                        formaPagamento: pagamento,
                        data: createdTime,
                        operador: "Ana Atendente",
                        osId: osId,
                        faturaId: null
                    };
                    db.caixa_movimentos.push(mov);
                    totalEntradas += val;
                    if (pagamento === "especie") cashBalance += val;
                }

                // If partner billed, save for billing simulation
                if (pagamento === "faturamento" && status === "concluida_aprovada") {
                    pendingPartnerOSs.push(os);
                }

                // Seed Transferência reproval re-inspection logic (within 30 days)
                if (status === "concluida_reprovada" && service.categoria === "Transferência" && Math.random() < 0.7) {
                    // Re-inspected 3 days later
                    let reInspectDate = new Date(datePointer);
                    reInspectDate.setDate(reInspectDate.getDate() + 3);
                    
                    if (reInspectDate <= today) {
                        const reInspectDateStr = reInspectDate.toISOString().split('T')[0];
                        const reId = osIdCounter++;
                        let reOs = {
                            id: reId,
                            numero: "OS-" + String(reId).padStart(4, '0'),
                            criadoEm: reInspectDateStr + "T14:15:00.000Z",
                            criadoPor: "Ana Atendente",
                            unidadeId: unitId,
                            clienteTipo: os.clienteTipo,
                            parceiroId: os.parceiroId,
                            clienteNome: os.clienteNome,
                            clienteCpfCnpj: os.clienteCpfCnpj,
                            clienteCelular: os.clienteCelular,
                            placa: os.placa,
                            renavam: os.renavam,
                            servicoId: os.servicoId,
                            servicoNome: os.servicoNome,
                            valor: 0.00, // Free
                            pago: true,
                            formaPagamento: "isento",
                            detranRegistrado: true,
                            docVeiculoApresentado: true,
                            docIdentificacaoApresentado: true,
                            status: "concluida_aprovada",
                            finalizadoEm: reInspectDateStr + "T14:45:00.000Z",
                            finalizadoPor: "Ana Atendente",
                            canceladoEm: null,
                            canceladoPor: null,
                            reapresentacaoOrigemID: os.id
                        };
                        db.ordens_servico.push(reOs);
                        
                        // Update original OS status to "reapresentada"
                        os.status = "concluida_reprovada"; // maintains historical reproval indicator
                    }
                }
            }

            // Seed manual daily small cash outflows (e.g. coffee, office cleaning) on some days
            if (Math.random() < 0.25) {
                const outflowVal = Math.floor(15 + Math.random() * 40);
                let mov = {
                    id: movIdCounter++,
                    caixaId: caixaId,
                    tipo: "saida",
                    valor: outflowVal,
                    descricao: "Despesas miúdas de limpeza / copa",
                    formaPagamento: "especie",
                    data: dateStr + "T16:00:00.000Z",
                    operador: "Ana Atendente",
                    osId: null,
                    faturaId: null
                };
                db.caixa_movimentos.push(mov);
                totalSaidas += outflowVal;
                cashBalance -= outflowVal;
            }

            // Finalize daily cash drawer calculations
            cashDrawer.saldoEspécieInformado = Math.round(cashBalance * 100) / 100;
            db.caixa_diario.push(cashDrawer);
        });

        // Advance Date Pointer
        datePointer.setDate(datePointer.getDate() + 1);
    }

    // Seed Billed Invoices (Faturas) for Partner 1 and 2 in late May
    const mayOSsPartner1 = pendingPartnerOSs.filter(o => o.parceiroId === 1 && new Date(o.criadoEm) < new Date("2026-06-01"));
    const mayOSsPartner2 = pendingPartnerOSs.filter(o => o.parceiroId === 2 && new Date(o.criadoEm) < new Date("2026-06-01"));

    if (mayOSsPartner1.length > 0) {
        const fatId = fatIdCounter++;
        const totalVal = mayOSsPartner1.reduce((sum, o) => sum + o.valor, 0);
        let fat = {
            id: fatId,
            codigo: "FAT-" + String(fatId).padStart(4, '0'),
            parceiroId: 1,
            unidadeId: 1,
            periodoInicio: "2026-05-15",
            periodoFim: "2026-05-31",
            valorTotal: totalVal,
            ordensIds: mayOSsPartner1.map(o => o.id),
            pago: true,
            pagoEm: "2026-06-02T10:00:00.000Z",
            criadoEm: "2026-06-01T08:30:00.000Z",
            criadoPor: "Carlos Financeiro"
        };
        db.faturas.push(fat);
        mayOSsPartner1.forEach(o => o.faturaId = fatId);

        // Inject payment of this May invoice as an inflow in June 2nd Cashier
        const june2ndMatrizCaixa = db.caixa_diario.find(c => c.unidadeId === 1 && c.data === "2026-06-02");
        if (june2ndMatrizCaixa) {
            db.caixa_movimentos.push({
                id: movIdCounter++,
                caixaId: june2ndMatrizCaixa.id,
                tipo: "entrada",
                valor: totalVal,
                descricao: `Recebimento Fatura ${fat.codigo} — Autocentro Veículos`,
                formaPagamento: "pix",
                data: "2026-06-02T10:00:00.000Z",
                operador: "Carlos Financeiro",
                osId: null,
                faturaId: fatId
            });
        }
    }

    if (mayOSsPartner2.length > 0) {
        const fatId = fatIdCounter++;
        const totalVal = mayOSsPartner2.reduce((sum, o) => sum + o.valor, 0);
        let fat = {
            id: fatId,
            codigo: "FAT-" + String(fatId).padStart(4, '0'),
            parceiroId: 2,
            unidadeId: 1,
            periodoInicio: "2026-05-15",
            periodoFim: "2026-05-31",
            valorTotal: totalVal,
            ordensIds: mayOSsPartner2.map(o => o.id),
            pago: true,
            pagoEm: "2026-06-03T14:30:00.000Z",
            criadoEm: "2026-06-01T09:00:00.000Z",
            criadoPor: "Carlos Financeiro"
        };
        db.faturas.push(fat);
        mayOSsPartner2.forEach(o => o.faturaId = fatId);

        // Inject payment into June 3rd Cashier
        const june3rdMatrizCaixa = db.caixa_diario.find(c => c.unidadeId === 1 && c.data === "2026-06-03");
        if (june3rdMatrizCaixa) {
            db.caixa_movimentos.push({
                id: movIdCounter++,
                caixaId: june3rdMatrizCaixa.id,
                tipo: "entrada",
                valor: totalVal,
                descricao: `Recebimento Fatura ${fat.codigo} — Despachante Silva`,
                formaPagamento: "pix",
                data: "2026-06-03T14:30:00.000Z",
                operador: "Carlos Financeiro",
                osId: null,
                faturaId: fatId
            });
        }
    }

    // Seed May Variable Accounts Payable (DETRAN consolidated tax)
    const mayOSCountUnit1 = db.ordens_servico.filter(o => o.unidadeId === 1 && new Date(o.criadoEm) < new Date("2026-06-01") && o.status.startsWith("concluida")).length;
    const mayOSCountUnit2 = db.ordens_servico.filter(o => o.unidadeId === 2 && new Date(o.criadoEm) < new Date("2026-06-01") && o.status.startsWith("concluida")).length;

    db.contas_pagar.push(
        { id: contaIdCounter++, unidadeId: 1, descricao: `Taxas DETRAN-SC — Consolidação Maio/2026`, tipo: "variavel", vencimento: "2026-06-10", valor: mayOSCountUnit1 * 27.00, pago: true, pagoEm: "2026-06-08" },
        { id: contaIdCounter++, unidadeId: 2, descricao: `Taxas DETRAN-SC — Consolidação Maio/2026`, tipo: "variavel", vencimento: "2026-06-10", valor: mayOSCountUnit2 * 27.00, pago: true, pagoEm: "2026-06-09" }
    );

    // Auto-open today's cash drawer for testing if it's currently June 11, 2026 (based on meta)
    const todayStr = "2026-06-11";
    [1, 2].forEach(unitId => {
        db.caixa_diario.push({
            id: 1000 + unitId,
            unidadeId: unitId,
            data: todayStr,
            status: "aberto",
            abertoPor: "Ana Atendente",
            fechadoPor: null,
            saldoAbertura: 200.00,
            saldoEspécieInformado: 0,
            fechadoEm: null
        });
    });
}

// Helper formatting functions
function formatCurrency(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(isoString) {
    if (!isoString) return "—";
    // For DATE columns (YYYY-MM-DD), split manually to avoid timezone shift
    if (typeof isoString === 'string' && isoString.length === 10 && isoString.includes('-')) {
        const [y, m, d] = isoString.split('-');
        return `${d}/${m}/${y}`;
    }
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function getLocalToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateTimeBr(isoString) {
    if (!isoString) return "—";
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// Audit trail Logger
async function logAudit(acao, descricao) {
    const operator = currentSession ? currentSession.nome : "Sistema";
    const log = {
        operador: operator,
        data: new Date().toISOString(),
        acao: acao,
        descricao: descricao,
        unidadeId: activeUnitId
    };
    try {
        const inserted = await sbInsert('auditoria', log);
        if (!db.auditoria) db.auditoria = [];
        cacheUnshift('auditoria', inserted);
    } catch (e) {
        console.error('[Certive] logAudit error:', e);
        if (!db.auditoria) db.auditoria = [];
        db.auditoria.unshift({ ...log, id: Date.now() });
    }
}

// ==========================================
// AUTHENTICATION & LOGIN FLOW
// ==========================================
function checkSession() {
    const sessionData = sessionStorage.getItem('certive_session');
    const loginOverlay = document.getElementById('login-overlay');
    
    if (sessionData) {
        currentSession = JSON.parse(sessionData);
        loginOverlay.classList.add('hidden');
        
        // Locked to operator's designated branch if not Admin
        const unitSelector = document.getElementById('topbar-unit-select');
        if (!currentSession.permissoes.includes("bi") && !currentSession.permissoes.includes("cadastros")) {
            activeUnitId = currentSession.unidadeId;
            unitSelector.disabled = true;
        } else {
            unitSelector.disabled = false;
        }

        document.getElementById('topbar-username').textContent = currentSession.nome;
        document.getElementById('topbar-userrole').textContent = currentSession.funcao;
        
        renderUnitSelectorOptions();
        unitSelector.value = activeUnitId;

        enforceOperatorPermissions();
        
        // Direct to first permitted page
        if (currentSession.permissoes.includes("abertura_os")) {
            navigateTo('atendimento');
        } else if (currentSession.permissoes.includes("caixa")) {
            navigateTo('caixa');
        } else if (currentSession.permissoes.includes("faturamento")) {
            navigateTo('faturamento');
        } else if (currentSession.permissoes.includes("contas")) {
            navigateTo('contas');
        } else {
            navigateTo('bi');
        }
    } else {
        loginOverlay.classList.remove('hidden');
    }
}

function handleLogin(event) {
    event.preventDefault();
    const loginInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value.trim();
    const errorDiv = document.getElementById('login-error');

    // Find operator (case-insensitive login check)
    const user = db.operadores.find(o => o.login.toLowerCase() === loginInput.toLowerCase() && o.senha === passwordInput && o.ativo);

    if (user) {
        sessionStorage.setItem('certive_session', JSON.stringify(user));
        errorDiv.style.display = 'none';
        
        // Reset login form fields
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        
        showToast(`Bem-vindo, ${user.nome}!`, 'success');
        logAudit("Login", `Efetuou login no terminal.`);
        checkSession();
    } else {
        errorDiv.style.display = 'flex';
        document.getElementById('login-error-text').textContent = "Usuário ou senha inválidos, ou operador inativo.";
    }
}

function handleLogout() {
    logAudit("Logout", `Efetuou logout do sistema.`);
    sessionStorage.removeItem('certive_session');
    currentSession = null;
    checkSession();
}

function enforceOperatorPermissions() {
    const navItems = {
        'nav-atendimento': 'abertura_os',
        'nav-caixa': 'caixa',
        'nav-historico': 'caixa',
        'nav-faturamento': 'faturamento',
        'nav-contas': 'contas',
        'nav-bi': 'bi',
        'nav-config': 'cadastros'
    };

    for (const [navId, permission] of Object.entries(navItems)) {
        const element = document.getElementById(navId);
        if (element) {
            if (currentSession.permissoes.includes(permission)) {
                element.style.display = 'flex';
            } else {
                element.style.display = 'none';
            }
        }
    }
}

function renderUnitSelectorOptions() {
    const select = document.getElementById('topbar-unit-select');
    select.innerHTML = db.unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
}

function changeActiveUnit(unitId) {
    activeUnitId = parseInt(unitId);
    const unitObj = db.unidades.find(u => u.id === activeUnitId);
    showToast(`Unidade alterada para: ${unitObj ? unitObj.nome : 'ID ' + activeUnitId}`, 'info');
    
    // Refresh current active view
    const currentActiveNav = document.querySelector('.nav-item.active');
    if (currentActiveNav) {
        const pageId = currentActiveNav.id.replace('nav-', '');
        navigateTo(pageId);
    }
}

// ==========================================
// TOAST ALERTS & UI DIALOGS
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconClass = type === 'success' ? 'ri-checkbox-circle-line' : (type === 'error' ? 'ri-error-warning-line' : 'ri-information-line');
    toast.innerHTML = `<i class="${iconClass}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Mobile Sidebar Toggle
function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

// Navigation Handler
function navigateTo(pageId) {
    // Close sidebar on mobile
    document.querySelector('.sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
    // Check permission for navigation
    const navPermissions = {
        'atendimento': 'abertura_os',
        'caixa': 'caixa',
        'historico': 'caixa',
        'faturamento': 'faturamento',
        'contas': 'contas',
        'bi': 'bi',
        'config': 'cadastros'
    };

    if (currentSession && !currentSession.permissoes.includes(navPermissions[pageId])) {
        showToast("Acesso Negado: Você não tem permissão para acessar este módulo.", "error");
        return;
    }

    // Toggle nav active links
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${pageId}`);
    if (activeNav) activeNav.classList.add('active');

    // Toggle panels
    document.querySelectorAll('.section-panel').forEach(el => el.classList.remove('active'));
    const targetPanel = document.getElementById(`panel-${pageId}`);
    if (targetPanel) targetPanel.classList.add('active');

    // Load page data
    if (pageId === 'atendimento') {
        renderAtendimentoPage();
    } else if (pageId === 'caixa') {
        renderCaixaPage();
    } else if (pageId === 'historico') {
        renderHistoricoPage();
    } else if (pageId === 'faturamento') {
        renderFaturamentoPage();
    } else if (pageId === 'contas') {
        renderContasPage();
    } else if (pageId === 'bi') {
        renderBIPage();
    } else if (pageId === 'config') {
        renderConfigPage();
    }
}

// ==========================================
// MODULE 1: ATENDIMENTO & OS
// ==========================================
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
    const nome = document.getElementById('os-nome-cliente').value.trim();
    const cpf = document.getElementById('os-cpf-cliente').value.trim();
    const cel = document.getElementById('os-celular-cliente').value.trim();
    const obs = document.getElementById('os-obs').value.trim();
    const docVeiculo = document.getElementById('os-doc-veiculo').checked;
    const docIdentidade = document.getElementById('os-doc-identificacao').checked;
    const detran = document.getElementById('os-detran').checked;
    const pagamento = document.getElementById('os-pagamento').value;
    const partnerId = parseInt(document.getElementById('os-parceiro-select').value);

    // Form Validations
    if (!placa || !renavam || !nome || !cpf || !cel || !obs) {
        showToast("Preencha todos os campos do solicitante, veículo e observações.", "error");
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

    // Build OS (no id, no numero — Supabase generates id, then we set numero)
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
        placa: placa,
        renavam: renavam,
        servicoId: service.id,
        servicoNome: service.nome,
        valor: valor,
        observacoes: obs,
        pago: pagamento !== 'faturamento',
        formaPagamento: pagamento,
        detranRegistrado: detran,
        docVeiculoApresentado: true,
        docIdentificacaoApresentado: true,
        status: pagamento !== 'faturamento' ? "paga" : "aberta",
        finalizadoEm: null,
        finalizadoPor: null,
        canceladoEm: null,
        canceladoPor: null,
        reapresentacaoOrigemID: null
    };

    try {
        // 1. Insert OS into Supabase
        const insertedOS = await sbInsert('ordens_servico', newOS);

        // 2. Generate numero from Supabase-assigned id and update
        const num = await getNextOSNumber();
        const updatedOS = await sbUpdate('ordens_servico', insertedOS.id, { numero: num });
        insertedOS.numero = num;

        // 3. Add to local cache
        cacheUnshift('ordens_servico', insertedOS);

        // 4. If payment is immediate, create cash movement
        if (insertedOS.pago) {
            const movRecord = {
                caixaId: activeCaixa.id,
                tipo: "entrada",
                valor: valor,
                descricao: `Serviço ${service.nome.split(' — ')[0]} (Placa: ${placa})`,
                formaPagamento: pagamento,
                data: new Date().toISOString(),
                operador: currentSession.nome,
                osId: insertedOS.id,
                faturaId: null
            };
            const insertedMov = await sbInsert('caixa_movimentos', movRecord);
            cacheInsert('caixa_movimentos', insertedMov);
        }

        showToast(`O.S. registrada com sucesso! Código: ${num}`, "success");
        logAudit("Abertura OS", `Abriu a ordem ${num} para placa ${placa}.`);

        // Auto trigger print contract
        printContract(insertedOS);

        clearOSForm();
        renderAtendimentoPage();
    } catch (e) {
        console.error('[Certive] submitOSForm error:', e);
        showToast("Erro ao salvar OS no servidor. Tente novamente.", "error");
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
            <div class="detail-item"><label>Renavam</label><span>${os.renavam}</span></div>
            <div class="detail-item"><label>Solicitante</label><span>${os.clienteNome}</span></div>
            <div class="detail-item"><label>CPF / CNPJ</label><span>${os.clienteCpfCnpj}</span></div>
            <div class="detail-item"><label>Celular</label><span>${os.clienteCelular}</span></div>
            <div class="detail-item"><label>Serviço Executado</label><span>${os.servicoNome}</span></div>
            <div class="detail-item"><label>Valor Final</label><strong style="color: var(--success);">${formatCurrency(os.valor)}</strong></div>
            <div class="detail-item"><label>Cobrança</label><span>${os.formaPagamento.toUpperCase()}</span></div>
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
    document.getElementById('edit-os-renavam').value = os.renavam;
    document.getElementById('edit-os-obs').value = os.observacoes || '';
    
    // Populate service dropdown
    const select = document.getElementById('edit-os-servico');
    if (select) {
        select.innerHTML = db.servicos.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
        select.value = os.servicoId;
    }
    
    document.getElementById('edit-os-valor').value = os.valor.toFixed(2);
    document.getElementById('edit-os-pagamento').value = os.formaPagamento;
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
    const obs = document.getElementById('edit-os-obs').value.trim();
    const serviceId = parseInt(document.getElementById('edit-os-servico').value);
    const valor = parseFloat(document.getElementById('edit-os-valor').value);
    const pagamento = document.getElementById('edit-os-pagamento').value;
    const detran = document.getElementById('edit-os-detran').checked;

    if (!nome || !cpf || !cel || !placa || !renavam || !obs || !serviceId || isNaN(valor) || valor <= 0) {
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
        observacoes: obs,
        servicoId: service.id,
        servicoNome: service.nome,
        valor: valor,
        formaPagamento: pagamento,
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
        if (document.getElementById('panel-historico').classList.contains('active')) {
            renderHistorico();
        }
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

    if (confirm(`Tem certeza que deseja excluir permanentemente a OS ${os.numero}? Esta ação não poderá ser desfeita.`)) {
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
            if (document.getElementById('panel-historico').classList.contains('active')) {
                renderHistorico();
            }
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

// ==========================================
// CONTRACT GENERATION & PRINT FLOW
// ==========================================
function printContract(os) {
    const printArea = document.getElementById('print-area');
    const unit = db.unidades.find(u => u.id === os.unidadeId);
    if (!unit) { showToast("Unidade não encontrada.", "error"); return; }
    
    printArea.innerHTML = `
        <div class="print-header">
            <div>
                <h1 style="font-family: Georgia, serif; font-size: 24px;">CERTIVE VISTORIAS</h1>
                <p style="font-size: 11px; margin-top: 4px;">Santa Catarina — Soluções Integradas de Trânsito</p>
            </div>
            <div class="print-logo-dummy">CERTIVE VISTORIAS</div>
        </div>
        
        <div class="print-title">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE VISTORIA VEICULAR</div>
        
        <div class="print-section">
            <div class="print-section-title">1. Identificação do Solicitante</div>
            <div class="print-grid">
                <div class="print-grid-item"><strong>Nome:</strong> ${os.clienteNome}</div>
                <div class="print-grid-item"><strong>Documento CPF/CNPJ:</strong> ${os.clienteCpfCnpj}</div>
                <div class="print-grid-item"><strong>Celular:</strong> ${os.clienteCelular}</div>
                <div class="print-grid-item"><strong>Tipo de Cliente:</strong> ${os.clienteTipo.toUpperCase()}</div>
            </div>
        </div>

        <div class="print-section">
            <div class="print-section-title">2. Dados Fichados do Veículo</div>
            <div class="print-grid">
                <div class="print-grid-item"><strong>Placa:</strong> ${os.placa}</div>
                <div class="print-grid-item"><strong>Renavam:</strong> ${os.renavam}</div>
                <div class="print-grid-item" style="grid-column: span 2;"><strong>Observações / Veículo:</strong> ${os.observacoes || '—'}</div>
            </div>
        </div>

        <div class="print-section">
            <div class="print-section-title">3. Serviço Contratado e Cobrança</div>
            <div class="print-grid">
                <div class="print-grid-item"><strong>Código da OS:</strong> ${os.numero}</div>
                <div class="print-grid-item"><strong>Serviço:</strong> ${os.servicoNome}</div>
                <div class="print-grid-item"><strong>Valor Cobrado:</strong> ${formatCurrency(os.valor)}</div>
                <div class="print-grid-item"><strong>Forma Pagamento:</strong> ${os.formaPagamento.toUpperCase()}</div>
            </div>
        </div>

        <div class="print-terms">
            <strong>DECLARAÇÃO E TERMOS:</strong> Declaro para os devidos fins que sou o proprietário, condutor ou representante legal autorizado do veículo acima descrito e que apresentei os documentos originais obrigatórios exigidos em pátio (CRLV e identificação do condutor). Autorizo a realização da vistoria física/visual. Estou ciente de que, tratando-se de vistoria de transferência, laudo REPROVADO gera uma janela legal de reapresentação sem custo de 30 dias contados da finalização deste laudo na mesma filial. Após o prazo, incidirá nova cobrança. Laudo Cautelar não possui gratuidade de reapresentação.
        </div>

        <div style="font-size: 11px; margin-top: 10px;">
            <strong>Local e Data:</strong> ${unit.nome.split(' — ')[1]}, ${formatDateBr(os.criadoEm)}
        </div>

        <div class="print-signatures">
            <div class="print-sig-block">
                Assinatura do Solicitante
            </div>
            <div class="print-sig-block">
                CERTIVE VISTORIAS<br>Representante Legal do Pátio
            </div>
        </div>
    `;
    
    window.print();
}

function printContractById(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (os) printContract(os);
}

// ==========================================
// MODULE 2: CONTROLE DE CAIXA DIÁRIO
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

function getTodayOpenCaixa() {
    const today = getLocalToday();
    return db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.data === today && c.status === "aberto");
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

    if (!confirm('Tem certeza que deseja excluir este lançamento do caixa?')) return;

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
    
    // Calculate estimated cash balance in box
    const movs = db.caixa_movimentos.filter(m => m.caixaId === activeCaixa.id);
    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
    const estimatedCash = activeCaixa.saldoAbertura + cashPayments - cashSangrias;

    const diff = saldoFisico - estimatedCash;

    // Confirm close
    const confirmMsg = `
        Deseja realmente fechar o caixa de hoje?
        Saldo Físico Informado: ${formatCurrency(saldoFisico)}
        Saldo Estimado (Espécie): ${formatCurrency(estimatedCash)}
        Diferença apurada: ${formatCurrency(diff)}
    `;

    if (confirm(confirmMsg)) {
        const updates = {
            status: "fechado",
            "saldoEspécieInformado": saldoFisico,
            fechadoPor: currentSession.nome,
            fechadoEm: new Date().toISOString()
        };

        try {
            await sbUpdate('caixa_diario', activeCaixa.id, updates);
            cacheUpdate('caixa_diario', activeCaixa.id, updates);

            showToast("Caixa diário fechado com sucesso!", "success");
            logAudit("Fechamento Caixa", `Fechou caixa com diferença de ${formatCurrency(diff)}.`);

            document.getElementById('caixa-fechar-form').reset();
            renderCaixaPage();
        } catch (e) {
            console.error('[Certive] submitFecharCaixa error:', e);
            showToast("Erro ao fechar caixa.", "error");
        }
    }
}

function renderCaixaHistorico() {
    const tbody = document.getElementById('caixa-historico-tbody');
    const closedCaixas = db.caixa_diario
        .filter(c => c.unidadeId === activeUnitId && c.status === "fechado")
        .sort((a, b) => new Date(b.data) - new Date(a.data));

    if (closedCaixas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum caixa fechado no histórico desta unidade.</td></tr>';
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
                <td>
                    <button class="btn btn-secondary btn-sm btn-icon" onclick="printCaixaById(${c.id})" title="Imprimir Relatório de Caixa"><i class="ri-printer-line"></i></button>
                </td>
            </tr>
        `;
    }).join('');
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

// ==========================================
// MODULE 3: FATURAMENTO DE PARCEIROS
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

    if (confirm(`Confirmar recebimento de pagamento para a fatura ${invoice.codigo} no valor de ${formatCurrency(invoice.valorTotal)}?`)) {
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

// ==========================================
// MODULE 4: CONTAS A PAGAR
// ==========================================
let currentContasTab = 'despesas';

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

        return `
            <tr>
                <td><strong>${formatDateBr(c.vencimento)}</strong></td>
                <td>
                    <strong>${c.descricao}</strong>
                    ${obsHtml}
                </td>
                <td><span class="badge badge-progress">${c.tipo.toUpperCase()}</span></td>
                <td style="text-align: right; color: var(--danger); font-weight: 600;">${formatCurrency(c.valor)}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center;">${anexoHtml}</td>
                <td>
                    ${!c.pago ? `<button class="btn btn-primary btn-sm" onclick="payExpense(${c.id})"><i class="ri-check-line"></i> Pagar</button>` : `<small style="color:var(--text-muted)">Paga em ${formatDateBr(c.pagoEm)}</small>`}
                </td>
            </tr>
        `;
    }).join('');
}

function submitDespesaForm(event) {
    event.preventDefault();
    const desc = document.getElementById('desp-desc').value.trim();
    const venc = document.getElementById('desp-vencimento').value;
    const val = parseFloat(document.getElementById('desp-valor').value);
    const fileInput = document.getElementById('desp-anexo');
    const obs = document.getElementById('desp-obs').value.trim();
    const file = fileInput.files[0];

    if (!desc) { showToast("Informe a descrição da conta.", "error"); return; }
    if (!venc) { showToast("Informe a data de vencimento.", "error"); return; }
    if (isNaN(val) || val <= 0) { showToast("Informe um valor válido.", "error"); return; }

    const saveExpense = async (anexoData = null) => {
        const newExpense = {
            unidadeId: activeUnitId,
            descricao: desc,
            tipo: "fixo",
            vencimento: venc,
            valor: val,
            observacoes: obs,
            anexo: anexoData,
            pago: false,
            pagoEm: null
        };

        try {
            const inserted = await sbInsert('contas_pagar', newExpense);
            cacheInsert('contas_pagar', inserted);

            showToast("Despesa cadastrada com sucesso!", "success");
            logAudit("Cadastro Despesa", `Adicionou despesa a pagar: ${desc} (Venc: ${formatDateBr(venc)})`);

            document.getElementById('despesa-form').reset();
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

    if (confirm(`Confirmar pagamento da despesa "${expense.descricao}" no valor de ${formatCurrency(expense.valor)}?`)) {
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

// ==========================================
// MODULE 5: PAINEL DE GESTÃO (BI)
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

// ==========================================
// MODULE 6: CONFIGURAÇÕES & CADASTROS
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
