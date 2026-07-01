// ==========================================
// CERTIVE VISTORIAS — CORE ENGINE (app.js)
// ==========================================

// Global error catcher to aid local debugging
window.onerror = function(message, source, lineno, colno, error) {
    const errorMsg = `Erro: ${message} em ${source}:${lineno}:${colno}`;
    console.error(errorMsg);
    try {
        showToast(errorMsg, "error");
    } catch(e) {}
    const errDiv = document.createElement('div');
    errDiv.style.position = 'fixed';
    errDiv.style.top = '20px';
    errDiv.style.left = '20px';
    errDiv.style.right = '20px';
    errDiv.style.background = '#ffe5e5';
    errDiv.style.color = '#b30000';
    errDiv.style.border = '2px solid #ff3333';
    errDiv.style.padding = '16px';
    errDiv.style.borderRadius = '8px';
    errDiv.style.zIndex = '999999';
    errDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    errDiv.style.fontFamily = 'monospace';
    errDiv.style.fontSize = '13px';
    errDiv.innerHTML = `<h3 style="margin-top:0; color:#990000;">⚠️ Erro de Script Detectado</h3>` +
                       `<p style="margin: 8px 0;">${errorMsg}</p>` +
                       `<p style="font-size:11px; color:#555;">Tente recarregar a página pressionando <strong>Ctrl + F5</strong> para limpar o cache do navegador.</p>` +
                       `<button onclick="this.parentElement.remove()" style="padding: 6px 12px; background:#ff3333; color:#fff; border:0; border-radius:4px; cursor:pointer; font-weight:700;">Fechar Alerta</button>`;
    document.body.appendChild(errDiv);
    return false;
};

// Global state variables
let db = {};
let currentSession = null;
let activeUnitId = 1;
let currentClientType = 'particular'; // 'particular' or 'parceiro'
let currentSelectedServiceId = null;

// Initialize Database in localStorage
function initDatabase() {
    // One-time simulation of reproved OS for user testing
    if (localStorage.getItem('certive_db') && !localStorage.getItem('certive_simulado_reprovado')) {
        try {
            const tempDb = JSON.parse(localStorage.getItem('certive_db'));
            if (tempDb.ordens_servico) {
                const exists = tempDb.ordens_servico.find(o => o.placa === "REPRO99");
                if (!exists) {
                    const osId = tempDb.ordens_servico.length + 2000;
                    const num = "OS-" + String(osId).padStart(4, '0');
                    const simulatedOS = {
                        id: osId,
                        numero: num,
                        criadoEm: "2026-06-09T14:00:00.000Z",
                        criadoPor: "Ana Atendente",
                        unidadeId: 1, // Matriz São José
                        clienteTipo: "particular",
                        parceiroId: null,
                        clienteNome: "SIMULADO REPROVADO",
                        clienteCpfCnpj: "11122233344",
                        clienteCelular: "48999998888",
                        placa: "REPRO99",
                        renavam: "12345678901",
                        servicoId: 1,
                        servicoNome: "Vistoria de Transferência — Pequeno Porte",
                        valor: 150.00,
                        pago: true,
                        formaPagamento: "pix",
                        detranRegistrado: true,
                        docVeiculoApresentado: true,
                        docIdentificacaoApresentado: true,
                        status: "concluida_reprovada",
                        finalizadoEm: "2026-06-09T14:30:00.000Z",
                        finalizadoPor: "Ana Atendente",
                        canceladoEm: null,
                        canceladoPor: null,
                        reapresentacaoOrigemID: null
                    };
                    tempDb.ordens_servico.unshift(simulatedOS);

                    if (tempDb.caixa_movimentos) {
                        tempDb.caixa_movimentos.push({
                            id: tempDb.caixa_movimentos.length + 2000,
                            caixaId: 91,
                            tipo: "entrada",
                            valor: 150.00,
                            descricao: `Serviço Vistoria de Transferência (Placa: REPRO99)`,
                            formaPagamento: "pix",
                            data: "2026-06-09T14:00:00.000Z",
                            operador: "Ana Atendente",
                            osId: osId,
                            faturaId: null
                        });
                    }
                    localStorage.setItem('certive_db', JSON.stringify(tempDb));
                    localStorage.setItem('certive_simulado_reprovado', 'true');
                }
            }
        } catch (e) {
            console.error("Error seeding simulated OS:", e);
        }
    }
    // One-time correction to reopen today's closed cash drawer for testing
    const tempLocalDate = new Date();
    const tempYear = tempLocalDate.getFullYear();
    const tempMonth = String(tempLocalDate.getMonth() + 1).padStart(2, '0');
    const tempDay = String(tempLocalDate.getDate()).padStart(2, '0');
    const tempTodayStr = `${tempYear}-${tempMonth}-${tempDay}`;

    if (localStorage.getItem('certive_db') && !localStorage.getItem('certive_reopened_v3')) {
        try {
            const tempDb = JSON.parse(localStorage.getItem('certive_db'));
            if (tempDb.caixa_diario) {
                tempDb.caixa_diario.forEach(cd => {
                    if (cd.data === tempTodayStr && cd.status === "fechado") {
                        cd.status = "aberto";
                        cd.fechadoPor = null;
                        cd.fechadoEm = null;
                    }
                });
                localStorage.setItem('certive_db', JSON.stringify(tempDb));
                localStorage.setItem('certive_reopened_v3', 'true');
            }
        } catch (e) {
            console.error("One-time reopen error:", e);
        }
    }

    const isSeeded = localStorage.getItem('certive_db_seeded');
    let dbValid = false;
    if (isSeeded) {
        try {
            loadDatabase();
            if (db && db.operadores && db.operadores.length > 0 && db.unidades && db.unidades.length > 0) {
                dbValid = true;
            }
        } catch (e) {
            dbValid = false;
        }
    }
    
    if (!isSeeded || !dbValid) {
        // 1. Seed Units (Filiais)
        db.unidades = [
            { 
                id: 1, 
                nome: "Certive Matriz — São José", 
                endereco: "Rua das Camélias - Kobrasol SC",
                razao_social: "Certive Vistorias Automotivas Ltda",
                cnpj: "45.890.122/0001-08",
                credenciamento: "ECV-2023-091",
                cidade: "São José",
                uf: "SC",
                canal_ouvidoria: "ouvidoria@certive.com.br"
            },
            { 
                id: 2, 
                nome: "Certive Filial — Palhoça", 
                endereco: "Avenida Atílio Pagani, 850, Palhoça - SC",
                razao_social: "Certive Vistorias Automotivas Ltda",
                cnpj: "45.890.122/0002-99",
                credenciamento: "ECV-2023-142",
                cidade: "Palhoça",
                uf: "SC",
                canal_ouvidoria: "ouvidoria@certive.com.br"
            }
        ];

        // Seed Portarias lookup by UF
        db.portarias_uf = {
            "SC": "Portaria DETRAN-SC nº 465/2023",
            "SP": "Portaria DETRAN-SP nº 123/2023",
            "PR": "Portaria DETRAN-PR nº 789/2023"
        };

        // 2. Seed Services
        db.servicos = [
            { id: 1, categoria: "Transferência", nome: "Vistoria de Transferência — Pequeno Porte", porte: "Pequeno", precoBalcao: 150.00 },
            { id: 2, categoria: "Transferência", nome: "Vistoria de Transferência — Médio Porte", porte: "Médio", precoBalcao: 200.00 },
            { id: 3, categoria: "Transferência", nome: "Vistoria de Transferência — Grande Porte", porte: "Grande", precoBalcao: 280.00 },
            { id: 4, categoria: "Cautelar", nome: "Vistoria Cautelar", porte: "N/A", precoBalcao: 180.00 },
            { id: 5, categoria: "Pesquisa", nome: "Pesquisa Veicular", porte: "N/A", precoBalcao: 120.00 },
            { id: 6, categoria: "Exótico", nome: "Carros exóticos", porte: "N/A", precoBalcao: 0.00 }
        ];

        // 3. Seed Reference Tax / Fees (DETRAN-SC / Custos de Terceiros)
        db.taxas_referencia = [
            { servicoId: 1, taxa: 27.00 }, // Transferência Pequeno
            { servicoId: 2, taxa: 27.00 }, // Transferência Médio
            { servicoId: 3, taxa: 27.00 }, // Transferência Grande
            { servicoId: 4, taxa: 10.00 }, // Cautelar
            { servicoId: 5, taxa: 5.00 },  // Pesquisa
            { servicoId: 6, taxa: 0.00 }   // Exótico
        ];

        // 4. Seed Operators (Operadores e Permissões)
        db.operadores = [
            { id: 1, nome: "Ricardo Administrador", login: "admin", senha: "admin123", funcao: "Gerente Geral", unidadeId: 1, permissoes: ["abertura_os", "caixa", "faturamento", "contas", "cadastros", "bi"], ativo: true },
            { id: 2, nome: "Ana Atendente", login: "atendente", senha: "atendente123", funcao: "Atendente", unidadeId: 1, permissoes: ["abertura_os", "caixa"], ativo: true },
            { id: 3, nome: "Carlos Financeiro", login: "financeiro", senha: "financeiro123", funcao: "Analista Financeiro", unidadeId: 1, permissoes: ["caixa", "faturamento", "contas"], ativo: true },
            { id: 4, nome: "Jonas Kroll", login: "Jkroll", senha: "070142", funcao: "Gerente Geral", unidadeId: 1, permissoes: ["abertura_os", "caixa", "faturamento", "contas", "cadastros", "bi"], ativo: true },
            { id: 5, nome: "Romano Gonzales Mendes", login: "Rgmendes", senha: "135586", funcao: "Gerente Geral", unidadeId: 1, permissoes: ["abertura_os", "caixa", "faturamento", "contas", "cadastros", "bi"], ativo: true }
        ];

        // 5. Seed Partners (Parceiros Conveniados)
        db.parceiros = [
            { 
                id: 1, 
                nome: "Autocentro Veículos", 
                cnpj: "12.345.678/0001-90", 
                responsavel: "Marcos Almeida",
                telefone: "(48) 3222-1111", 
                usaFaturamento: true,
                observacoes: "Parceiro prioritário da região de São José.",
                tabelaPrecos: { 1: 130.00, 2: 180.00, 3: 250.00, 4: 150.00, 5: 100.00 } // Preços especiais
            },
            { 
                id: 2, 
                nome: "Despachante Silva", 
                cnpj: "98.765.432/0001-10", 
                responsavel: "Roberto Silva",
                telefone: "(48) 3333-4444", 
                usaFaturamento: true,
                observacoes: "Pagamento faturado quinzenalmente.",
                tabelaPrecos: { 1: 140.00, 2: 190.00, 3: 260.00, 4: 160.00, 5: 110.00 }
            },
            { 
                id: 3, 
                nome: "Giga Car Multimarcas", 
                cnpj: "11.222.333/0001-44", 
                responsavel: "Carlos Giga",
                telefone: "(48) 3444-5555", 
                usaFaturamento: false, // Só paga no balcão
                observacoes: "Não aceita faturamento. Pagamentos somente à vista.",
                tabelaPrecos: { 1: 135.00, 2: 185.00, 3: 255.00, 4: 155.00, 5: 105.00 }
            }
        ];

        // Empty arrays for seed logic
        db.ordens_servico = [];
        db.caixa_diario = [];
        db.caixa_movimentos = [];
        db.contas_pagar = [];
        db.faturas = [];
        db.auditoria = [];
        db.metas_despesas = {
            1: {
                "Aluguel": 3000.00,
                "Água / Luz / Internet": 500.00,
                "Impostos / Taxas": 1500.00,
                "Material de Escritório": 300.00,
                "Serviços de Terceiros": 2000.00,
                "Outros": 600.00
            },
            2: {
                "Aluguel": 2000.00,
                "Água / Luz / Internet": 400.00,
                "Impostos / Taxas": 1000.00,
                "Material de Escritório": 200.00,
                "Serviços de Terceiros": 1500.00,
                "Outros": 400.00
            }
        };

        // Run Historical Seed Generator
        seedHistoricalData();

        // Save to LocalStorage
        saveDatabase();
        localStorage.setItem('certive_db_seeded', 'true');
    } else {
        loadDatabase();
        // Force update of Unit details and lookup portarias
        if (!db.portarias_uf) {
            db.portarias_uf = {
                "SC": "Portaria DETRAN-SC nº 465/2023",
                "SP": "Portaria DETRAN-SP nº 123/2023",
                "PR": "Portaria DETRAN-PR nº 789/2023"
            };
        }
        if (db.unidades) {
            db.unidades.forEach(u => {
                if (u.id === 1) {
                    u.nome = "Certive Matriz — São José";
                    u.endereco = "Rua das Camélias - Kobrasol SC";
                    u.razao_social = "Certive Vistorias Automotivas Ltda";
                    u.cnpj = "45.890.122/0001-08";
                    u.credenciamento = "ECV-2023-091";
                    u.cidade = "São José";
                    u.uf = "SC";
                    u.canal_ouvidoria = "ouvidoria@certive.com.br";
                } else if (u.id === 2) {
                    u.nome = "Certive Filial — Palhoça";
                    u.endereco = "Avenida Atílio Pagani, 850, Palhoça - SC";
                    u.razao_social = "Certive Vistorias Automotivas Ltda";
                    u.cnpj = "45.890.122/0002-99";
                    u.credenciamento = "ECV-2023-142";
                    u.cidade = "Palhoça";
                    u.uf = "SC";
                    u.canal_ouvidoria = "ouvidoria@certive.com.br";
                }
            });
        }
        saveDatabase();
        // Force migration check for partner fields
        if (db.parceiros) {
            db.parceiros.forEach(p => {
                if (p.responsavel === undefined) p.responsavel = "NÃO CADASTRADO";
                if (p.observacoes === undefined) p.observacoes = "";
            });
        }
        // Force migration check for OS fields
        if (db.ordens_servico) {
            db.ordens_servico.forEach(o => {
                if (o.observacoes === undefined) o.observacoes = "NÃO INFORMADA";
                if (o.statusNfse === undefined) o.statusNfse = "Não solicitada";
                if (o.numeroNfse === undefined) o.numeroNfse = null;
                if (o.dataNfse === undefined) o.dataNfse = null;
            });
        }
        // Force migration check for faturas fields
        if (db.faturas) {
            db.faturas.forEach(f => {
                if (f.statusBoleto === undefined) f.statusBoleto = "Não gerado";
                if (f.boletoVencimento === undefined) f.boletoVencimento = null;
                if (f.boletoCodigoDeBarras === undefined) f.boletoCodigoDeBarras = null;
            });
        }
        // Force migration check for accounts payable fields
        if (db.contas_pagar) {
            db.contas_pagar.forEach(c => {
                if (c.observacoes === undefined) c.observacoes = "";
                if (c.anexo === undefined) c.anexo = null;
                if (c.comprovante === undefined) c.comprovante = null;

                // Migrate category
                if (c.categoria === undefined) {
                    if (c.descricao.includes("Aluguel")) {
                        c.categoria = "Aluguel";
                    } else if (c.descricao.includes("Celesc") || c.descricao.includes("Energia") || c.descricao.includes("Luz") || c.descricao.includes("Água") || c.descricao.includes("Internet")) {
                        c.categoria = "Água / Luz / Internet";
                    } else if (c.descricao.includes("DETRAN") || c.descricao.includes("Taxa")) {
                        c.categoria = "Impostos / Taxas";
                    } else {
                        c.categoria = "Outros";
                    }
                }

                // Migrate provider
                if (c.fornecedor === undefined) {
                    if (c.descricao.includes("Aluguel")) {
                        c.fornecedor = c.unidadeId === 1 ? "Imobiliária Matriz" : "Imobiliária Filial";
                    } else if (c.descricao.includes("Celesc")) {
                        c.fornecedor = "Celesc";
                    } else if (c.descricao.includes("DETRAN")) {
                        c.fornecedor = "DETRAN-SC";
                    } else {
                        c.fornecedor = "Outros";
                    }
                }
            });
        }
        if (!db.metas_despesas) {
            db.metas_despesas = {
                1: {
                    "Aluguel": 3000.00,
                    "Água / Luz / Internet": 500.00,
                    "Impostos / Taxas": 1500.00,
                    "Material de Escritório": 300.00,
                    "Serviços de Terceiros": 2000.00,
                    "Outros": 600.00
                },
                2: {
                    "Aluguel": 2000.00,
                    "Água / Luz / Internet": 400.00,
                    "Impostos / Taxas": 1000.00,
                    "Material de Escritório": 200.00,
                    "Serviços de Terceiros": 1500.00,
                    "Outros": 400.00
                }
            };
        }
        // Force migration check for services (ID 6 - Carros exóticos)
        if (db.servicos) {
            const hasExotic = db.servicos.find(s => s.id === 6);
            if (!hasExotic) {
                db.servicos.push({ id: 6, categoria: "Exótico", nome: "Carros exóticos", porte: "N/A", precoBalcao: 0.00 });
            }
        }
        // Force migration check for reference taxes (ID 6 - Carros exóticos)
        if (db.taxas_referencia) {
            const hasExoticTax = db.taxas_referencia.find(t => t.servicoId === 6);
            if (!hasExoticTax) {
                db.taxas_referencia.push({ servicoId: 6, taxa: 0.00 });
            }
        }
        saveDatabase();
    }
}

function saveDatabase() {
    localStorage.setItem('certive_db', JSON.stringify(db));
}

function loadDatabase() {
    db = JSON.parse(localStorage.getItem('certive_db') || '{}');
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
        { id: contaIdCounter++, unidadeId: 1, descricao: "Aluguel Comercial - Matriz", tipo: "fixo", vencimento: "2026-05-10", valor: 2500.00, pago: true, pagoEm: "2026-05-09", categoria: "Aluguel", fornecedor: "Imobiliária Matriz" },
        { id: contaIdCounter++, unidadeId: 2, descricao: "Aluguel Comercial - Filial", tipo: "fixo", vencimento: "2026-05-10", valor: 1800.00, pago: true, pagoEm: "2026-05-10", categoria: "Aluguel", fornecedor: "Imobiliária Filial" },
        { id: contaIdCounter++, unidadeId: 1, descricao: "Energia Elétrica Celesc - Matriz", tipo: "fixo", vencimento: "2026-05-15", valor: 450.00, pago: true, pagoEm: "2026-05-14", categoria: "Água / Luz / Internet", fornecedor: "Celesc" },
        { id: contaIdCounter++, unidadeId: 2, descricao: "Energia Elétrica Celesc - Filial", tipo: "fixo", vencimento: "2026-05-15", valor: 310.00, pago: true, pagoEm: "2026-05-15", categoria: "Água / Luz / Internet", fornecedor: "Celesc" },
        { id: contaIdCounter++, unidadeId: 1, descricao: "Aluguel Comercial - Matriz", tipo: "fixo", vencimento: "2026-06-10", valor: 2500.00, pago: true, pagoEm: "2026-06-09", categoria: "Aluguel", fornecedor: "Imobiliária Matriz" },
        { id: contaIdCounter++, unidadeId: 2, descricao: "Aluguel Comercial - Filial", tipo: "fixo", vencimento: "2026-06-10", valor: 1800.00, pago: false, pagoEm: null, categoria: "Aluguel", fornecedor: "Imobiliária Filial" },
        { id: contaIdCounter++, unidadeId: 1, descricao: "Energia Elétrica Celesc - Matriz", tipo: "fixo", vencimento: "2026-06-15", valor: 420.00, pago: false, pagoEm: null, categoria: "Água / Luz / Internet", fornecedor: "Celesc" },
        { id: contaIdCounter++, unidadeId: 2, descricao: "Energia Elétrica Celesc - Filial", tipo: "fixo", vencimento: "2026-06-15", valor: 290.00, pago: false, pagoEm: null, categoria: "Água / Luz / Internet", fornecedor: "Celesc" }
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
        { id: contaIdCounter++, unidadeId: 1, descricao: `Taxas DETRAN-SC — Consolidação Maio/2026`, tipo: "variavel", vencimento: "2026-06-10", valor: mayOSCountUnit1 * 27.00, pago: true, pagoEm: "2026-06-08", categoria: "Impostos / Taxas", fornecedor: "DETRAN-SC" },
        { id: contaIdCounter++, unidadeId: 2, descricao: `Taxas DETRAN-SC — Consolidação Maio/2026`, tipo: "variavel", vencimento: "2026-06-10", valor: mayOSCountUnit2 * 27.00, pago: true, pagoEm: "2026-06-09", categoria: "Impostos / Taxas", fornecedor: "DETRAN-SC" }
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
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(isoString) {
    if (!isoString) return "—";
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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

function renderMarkdown(text) {
    if (window.marked && (typeof window.marked.parse === 'function' || typeof window.marked === 'function')) {
        return typeof window.marked.parse === 'function' ? window.marked.parse(text) : window.marked(text);
    }
    
    // Fallback simple markdown parser to support offline use without throwing errors
    let html = text || "";
    
    // Escape HTML special characters first (safeguard)
    html = html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Simple table parser
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = "";
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableHtml = '<table class="table" style="width: 100%; border-collapse: collapse; margin: 16px 0;"><thead>';
            }
            
            if (line.includes('---|') || line.includes('--|')) {
                tableHtml = tableHtml.replace(/<\/tr>$/, '</thead><tbody>');
                continue;
            }
            
            const cols = line.split('|').slice(1, -1);
            const tag = inTable && !tableHtml.includes('<tbody>') ? 'th' : 'td';
            
            tableHtml += '<tr>' + cols.map(c => `<${tag} style="border: 1px solid var(--border); padding: 8px;">${c.trim()}</${tag}>`).join('') + '</tr>';
        } else {
            if (inTable) {
                inTable = false;
                tableHtml += '</tbody></table>';
                lines[i] = tableHtml + '\n' + line;
            }
        }
    }
    if (inTable) {
        tableHtml += '</tbody></table>';
        lines[lines.length - 1] = tableHtml;
    }
    
    html = lines.join('\n');
    
    // Line breaks and paragraphs
    html = html.split(/\n\n+/).map(p => {
        p = p.trim();
        if (p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<hr')) {
            return p;
        }
        return `<p style="margin-bottom: 12px; line-height: 1.5;">${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    
    // Horizontal rule
    html = html.replace(/^---$/gim, '<hr style="border: 0; border-top: 1px solid var(--border); margin: 24px 0;">');
    
    return html;
}

function logAudit(acao, descricao) {
    const operator = currentSession ? currentSession.nome : "Sistema";
    const log = {
        operador: operator,
        data: new Date().toISOString(),
        acao: acao,
        descricao: descricao,
        unidadeId: activeUnitId
    };
    dbSave('auditoria', log, 'insert_unshift');
}

// ==========================================
// AUTHENTICATION & LOGIN FLOW
// ==========================================

/**
 * Returns true if the currently logged-in user has Master/Admin access.
 * Master is defined as having the 'cadastros' permission (full access operators).
 */
function isMasterSession() {
    return !!(currentSession && currentSession.permissoes && currentSession.permissoes.includes('cadastros'));
}

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
    showToast(`Unidade alterada para: ${db.unidades.find(u => u.id === activeUnitId).nome}`, 'info');
    
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

// Navigation Handler
function navigateTo(pageId) {
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

    // Fechar menu mobile se estiver aberto
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
    }
    if (overlay && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
    }

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
    const today = new Date().toISOString().split('T')[0];
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
        
        let serviceName = s.nome;
        // Se for o serviço ID 4 (Cautelar) e o cliente selecionado for um parceiro do shopping, muda o nome para "Vistoria Cautelar Híbrida (Combo)"
        if (s.id === 4 && currentClientType === 'parceiro' && partner && partner.parceiroShopping) {
            serviceName = "Vistoria Cautelar Híbrida (Combo)";
        }
        
        return `
            <label class="service-option" id="lbl-svc-${s.id}" onclick="selectService(${s.id}, ${price})">
                <input type="radio" name="os-svc-radio" value="${s.id}">
                <div class="radio-dot"></div>
                <i class="${iconClass}" style="font-size: 18px; color: var(--accent);"></i>
                <div class="service-info">
                    <div class="service-name">${serviceName}</div>
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

function toggleInstallmentsNewOS() {
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

function clearOSForm() {
    currentSelectedServiceId = null;
    document.querySelectorAll('.service-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('os-valor').value = '';
    document.getElementById('os-placa').value = '';
    document.getElementById('os-renavam').value = '';
    document.getElementById('os-veiculo-chassi').value = '';
    document.getElementById('os-veiculo-marca-modelo').value = '';
    document.getElementById('os-veiculo-ano').value = '';
    document.getElementById('os-nome-cliente').value = '';
    document.getElementById('os-cpf-cliente').value = '';
    document.getElementById('os-celular-cliente').value = '';
    document.getElementById('os-finalidade').value = 'Compra/Venda';
    document.getElementById('os-cliente-endereco').value = '';
    document.getElementById('os-obs').value = '';
    document.getElementById('os-doc-veiculo').checked = false;
    document.getElementById('os-doc-identificacao').checked = false;
    document.getElementById('os-detran').checked = false;
    document.getElementById('os-parceiro-select').value = '';
    document.getElementById('os-pagamento').value = 'pix';
    document.getElementById('os-parcelas-group').style.display = 'none';
    document.getElementById('os-parcelas').value = '1';
    selectClientType('particular');
}

function submitOSForm() {
    try {
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

        const valEl = document.getElementById('os-valor');
        const placaEl = document.getElementById('os-placa');
        const renavamEl = document.getElementById('os-renavam');
        const chassiEl = document.getElementById('os-veiculo-chassi');
        const marcaModeloEl = document.getElementById('os-veiculo-marca-modelo');
        const anoEl = document.getElementById('os-veiculo-ano');
        const nomeEl = document.getElementById('os-nome-cliente');
        const cpfEl = document.getElementById('os-cpf-cliente');
        const celEl = document.getElementById('os-celular-cliente');
        const finalidadeEl = document.getElementById('os-finalidade');
        const enderecoEl = document.getElementById('os-cliente-endereco');
        const obsEl = document.getElementById('os-obs');
        const docVeiculoEl = document.getElementById('os-doc-veiculo');
        const docIdentidadeEl = document.getElementById('os-doc-identificacao');
        const detranEl = document.getElementById('os-detran');
        const pagamentoEl = document.getElementById('os-pagamento');
        const partnerSelect = document.getElementById('os-parceiro-select');
        const parcelasEl = document.getElementById('os-parcelas');

        const valor = valEl ? parseFloat(valEl.value) : NaN;
        const placa = placaEl ? placaEl.value.trim().toUpperCase() : '';
        const renavam = renavamEl ? renavamEl.value.trim() : '';
        const chassi = chassiEl ? chassiEl.value.trim().toUpperCase() : '';
        const marcaModelo = marcaModeloEl ? marcaModeloEl.value.trim().toUpperCase() : '';
        const ano = anoEl ? anoEl.value.trim() : '';
        const nome = nomeEl ? nomeEl.value.trim() : '';
        const cpf = cpfEl ? cpfEl.value.trim() : '';
        const cel = celEl ? celEl.value.trim() : '';
        const finalidade = finalidadeEl ? finalidadeEl.value : 'Compra/Venda';
        const endereco = enderecoEl ? enderecoEl.value.trim() : '';
        const obs = obsEl ? obsEl.value.trim() : '';
        const docVeiculo = docVeiculoEl ? docVeiculoEl.checked : false;
        const docIdentidade = docIdentidadeEl ? docIdentidadeEl.checked : false;
        const detran = detranEl ? detranEl.checked : false;
        const pagamento = pagamentoEl ? pagamentoEl.value : 'pix';
        const partnerId = partnerSelect ? parseInt(partnerSelect.value) : null;
        const parcelas = (pagamento === 'credito_parcelado' && parcelasEl) ? parseInt(parcelasEl.value) : null;

        // Form Validations
        const missingFields = [];
        if (!placa) missingFields.push("Placa");
        if (!renavam) missingFields.push("Renavam");
        if (!chassi) missingFields.push("Chassi");
        if (!marcaModelo) missingFields.push("Marca/Modelo");
        if (!ano) missingFields.push("Ano");
        if (!nome) missingFields.push("Nome do Solicitante");
        if (!cpf) missingFields.push("CPF/CNPJ");
        if (!cel) missingFields.push("Celular");
        if (!endereco) missingFields.push("Endereço");
        if (!obs) missingFields.push("Observações");

        if (missingFields.length > 0) {
            showToast(`Campos obrigatórios ausentes: ${missingFields.join(', ')}.`, "error");
            return;
        }

        if (isNaN(valor) || (valor <= 0 && pagamento !== 'isento')) {
            showToast("Por favor, preencha o valor do serviço corretamente.", "error");
            return;
        }

        if (!docVeiculo || !docIdentidade) {
            showToast("Erro: É obrigatório apresentar os documentos físicos do solicitante e do veículo.", "error");
            return;
        }

        const service = db.servicos.find(s => s.id === currentSelectedServiceId);
        if (!service) {
            showToast("Erro: Serviço selecionado inválido.", "error");
            return;
        }
        
        const osId = db.ordens_servico.length + 1;
        const num = "OS-" + String(osId).padStart(4, '0');

        // Build OS
        const newOS = {
            id: osId,
            numero: num,
            criadoEm: new Date().toISOString(),
            criadoPor: (currentSession ? currentSession.nome : 'Sistema'),
            unidadeId: activeUnitId,
            clienteTipo: currentClientType,
            parceiroId: currentClientType === 'parceiro' ? partnerId : null,
            clienteNome: nome,
            clienteCpfCnpj: cpf,
            clienteCelular: cel,
            clienteEndereco: endereco,
            osFinalidade: finalidade,
            placa: placa,
            renavam: renavam,
            veiculoChassi: chassi,
            veiculoMarcaModelo: marcaModelo,
            veiculoAno: ano,
            servicoId: service.id,
            servicoNome: (() => {
                let finalSvcName = service.nome;
                if (service.id === 4 && currentClientType === 'parceiro' && partnerId) {
                    const partner = db.parceiros.find(p => p.id === partnerId);
                    if (partner && partner.parceiroShopping) {
                        finalSvcName = "Vistoria Cautelar Híbrida (Combo)";
                    }
                }
                return finalSvcName;
            })(),
            valor: valor,
            observacoes: obs,
            pago: pagamento !== 'faturamento',
            formaPagamento: pagamento,
            parcelas: parcelas,
            statusNfse: "Não solicitada",
            numeroNfse: null,
            dataNfse: null,
            detranRegistrado: detran,
            docVeiculoApresentado: true,
            docIdentificacaoApresentado: true,
            status: "aberta", // Default startup state
            finalizadoEm: null,
            finalizadoPor: null,
            canceladoEm: null,
            canceladoPor: null,
            reapresentacaoOrigemID: window.activeRecheckOrigemId || null,
            contratoTexto: "",
            contratoHash: null,
            contratoAceitoEm: null
        };

        // Generate contract preview text
        const previewText = generateContractText(newOS);
        newOS.contratoTexto = previewText;
        
        // Store globally as pending
        window.pendingOS = newOS;
        
        // Set up modal contents
        const previewEl = document.getElementById('contrato-preview-content');
        if (previewEl) {
            previewEl.innerHTML = renderMarkdown(previewText);
        }
        
        const checkEl = document.getElementById('contrato-aceite-check');
        if (checkEl) checkEl.checked = false;
        
        const btnEl = document.getElementById('btn-confirmar-contrato');
        if (btnEl) btnEl.disabled = true;
        
        // Display modal
        const modalEl = document.getElementById('modal-contrato-assinatura');
        if (modalEl) {
            modalEl.style.display = 'flex';
            modalEl.classList.add('active');
        }
    } catch (e) {
        console.error("Erro ao processar formulário de O.S.:", e);
        alert("Ocorreu um erro ao processar o formulário de O.S.:\n" + e.message + "\n" + e.stack);
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
        const today = new Date().toISOString().split('T')[0];
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
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="openOSDetailsModal(${os.id})" title="Ver Ficha"><i class="ri-eye-line"></i></button>
                        ${isPending ? `<button class="btn btn-success btn-sm btn-icon" onclick="openConcludeVistoriaModal(${os.id})" title="Concluir Vistoria"><i class="ri-check-line"></i></button>` : ''}
                        ${isMasterSession() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteOS(${os.id})" title="Excluir OS"><i class="ri-delete-bin-line"></i></button>` : ''}
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
function submitConcludeVistoria(osId, approved) {
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
        os.respostaDetranNet = ans;
    } else if (service.categoria === "Cautelar") {
        const sim = document.getElementById('qst-shopping-sim').checked;
        const nao = document.getElementById('qst-shopping-nao').checked;
        if (!sim && !nao) {
            document.getElementById('qst-error').style.display = 'block';
            return;
        }
        ans = sim ? "SIM" : "NAO";
        os.respostaShopping = ans;
    }

    // Save final status
    os.status = approved ? "concluida_aprovada" : "concluida_reprovada";
    os.finalizadoEm = new Date().toISOString();
    os.finalizadoPor = currentSession.nome;

    dbSave('ordens_servico', {
        status: os.status,
        finalizadoEm: os.finalizadoEm,
        finalizadoPor: os.finalizadoPor,
        respostaDetranNet: os.respostaDetranNet || null,
        respostaShopping: os.respostaShopping || null
    }, 'update', os.id);
    
    showToast(`Vistoria concluída! Laudo ${approved ? 'APROVADO' : 'REPROVADO'} para placa ${os.placa}.`, "info");
    
    let auditMsg = `Concluiu a OS ${os.numero} (Placa: ${os.placa}) como ${approved ? 'APROVADO' : 'REPROVADO'}.`;
    if (ans) {
        auditMsg += ` Checklist de encerramento respondido: ${ans}.`;
    }
    logAudit("Laudo Emissão", auditMsg);
    
    closeOSModal();
    renderAtendimentoPage();
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
            <div class="detail-item"><label>Cobrança</label><span>${os.formaPagamento === 'credito_parcelado' ? `CRÉDITO PARCELADO (${os.parcelas}x)` : os.formaPagamento.toUpperCase()}</span></div>
            <div class="detail-item"><label>DETRAN-SC Registrada</label><span>${os.detranRegistrado ? '🟢 Registrada' : '🔴 Não Registrada'}</span></div>
            <div class="detail-item"><label>Status NFS-e</label><span style="font-weight: 700; color: ${os.statusNfse === 'Emitida' ? 'var(--success)' : (os.statusNfse === 'Pendente de emissão' ? 'var(--warning)' : 'var(--text-secondary)')};">${os.statusNfse || 'Não solicitada'}</span></div>
            <div class="detail-item"><label>Detalhes NFS-e</label><span>${os.numeroNfse ? `Nº ${os.numeroNfse} (${formatDateBr(os.dataNfse)})` : '—'}</span></div>
            <div class="detail-item" style="grid-column: span 2;"><label>Observações do Veículo (Modelo, Ano, Cor)</label><span>${os.observacoes || '—'}</span></div>
        </div>
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px; color: var(--accent);">Histórico de Fluxo:</h4>
        ${timelineHtml}
    `;

    // Footer actions depending on permissions & state
    let footerHtml = `
        <button class="btn btn-secondary" onclick="openContratoFirmadoModal(${os.id})"><i class="ri-file-shield-2-line"></i> Visualizar Contrato</button>
    `;

    if (os.status.startsWith('concluida') && (currentSession.permissoes.includes("faturamento") || currentSession.permissoes.includes("bi"))) {
        footerHtml += `<button class="btn btn-warning" onclick="requestNfse(${os.id})"><i class="ri-file-text-line"></i> Emitir NFS-e</button>`;
    }

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

function closeOSModal() {
    document.getElementById('modal-os-detalhes').classList.remove('active');
}

function closeOSModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-os-detalhes').classList.remove('active');
}

function changeOSStatus(id, newStatus) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    os.status = newStatus;
    
    // If transitioned to paga, create financial movement
    if (newStatus === 'paga') {
        os.pago = true;
        const activeCaixa = getTodayOpenCaixa();
        if (activeCaixa) {
            const newMov = {
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
            dbSave('caixa_movimentos', newMov, 'insert');
        }
    }

    dbSave('ordens_servico', {
        status: newStatus,
        pago: os.pago
    }, 'update', os.id);
    
    showToast(`O.S. ${os.numero} movida para ${newStatus.toUpperCase()}`, "success");
    logAudit("Atualização OS", `Alterou status da ${os.numero} para ${newStatus}.`);
    closeOSModal();
    renderAtendimentoPage();
}

function finalizeVistoria(id, approved) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    os.status = approved ? "concluida_aprovada" : "concluida_reprovada";
    os.finalizadoEm = new Date().toISOString();
    os.finalizadoPor = currentSession.nome;

    dbSave('ordens_servico', {
        status: os.status,
        finalizadoEm: os.finalizadoEm,
        finalizadoPor: os.finalizadoPor
    }, 'update', os.id);
    
    showToast(`Vistoria concluída! Laudo ${approved ? 'APROVADO' : 'REPROVADO'} para placa ${os.placa}.`, "info");
    logAudit("Laudo Emissão", `Laudou a OS ${os.numero} como ${approved ? 'APROVADO' : 'REPROVADO'}.`);
    closeOSModal();
    renderAtendimentoPage();
}

function cancelOS(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    // Estorno do Caixa if paid
    if (os.pago && os.formaPagamento !== 'faturamento') {
        const activeCaixa = getTodayOpenCaixa();
        if (activeCaixa) {
            const newMov = {
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
            dbSave('caixa_movimentos', newMov, 'insert');
        }
    }

    os.status = "cancelada";
    os.canceladoEm = new Date().toISOString();
    os.canceladoPor = currentSession.nome;

    dbSave('ordens_servico', {
        status: os.status,
        canceladoEm: os.canceladoEm,
        canceladoPor: os.canceladoPor
    }, 'update', os.id);
    
    showToast(`O.S. ${os.numero} cancelada. Venda estornada do caixa.`, "error");
    logAudit("Cancelamento OS", `Cancelou a OS ${os.numero} (placa ${os.placa}).`);
    closeOSModal();
    renderAtendimentoPage();
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
    document.getElementById('edit-os-finalidade').value = os.osFinalidade || 'Compra/Venda';
    document.getElementById('edit-os-cliente-endereco').value = os.clienteEndereco || '';
    document.getElementById('edit-os-placa').value = os.placa;
    document.getElementById('edit-os-renavam').value = os.renavam;
    document.getElementById('edit-os-veiculo-chassi').value = os.veiculoChassi || '';
    document.getElementById('edit-os-veiculo-marca-modelo').value = os.veiculoMarcaModelo || '';
    document.getElementById('edit-os-veiculo-ano').value = os.veiculoAno || '';
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
        document.getElementById('edit-os-parcelas').value = '1';
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

function submitEditOSForm(event) {
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
    const finalidade = document.getElementById('edit-os-finalidade').value;
    const endereco = document.getElementById('edit-os-cliente-endereco').value.trim();
    const placa = document.getElementById('edit-os-placa').value.trim().toUpperCase();
    const renavam = document.getElementById('edit-os-renavam').value.trim();
    const chassi = document.getElementById('edit-os-veiculo-chassi').value.trim().toUpperCase();
    const marcaModelo = document.getElementById('edit-os-veiculo-marca-modelo').value.trim().toUpperCase();
    const ano = document.getElementById('edit-os-veiculo-ano').value.trim();
    const obs = document.getElementById('edit-os-obs').value.trim();
    const serviceId = parseInt(document.getElementById('edit-os-servico').value);
    const valor = parseFloat(document.getElementById('edit-os-valor').value);
    const pagamento = document.getElementById('edit-os-pagamento').value;
    const detran = document.getElementById('edit-os-detran').checked;
    const parcelas = pagamento === 'credito_parcelado' ? parseInt(document.getElementById('edit-os-parcelas').value) : null;

    if (!nome || !cpf || !cel || !placa || !renavam || !obs || !serviceId || isNaN(valor) || valor <= 0 || !finalidade || !endereco || !chassi || !marcaModelo || !ano) {
        showToast("Preencha todos os campos obrigatórios e informe um valor válido.", "error");
        return;
    }

    const service = db.servicos.find(s => s.id === serviceId);
    
    os.clienteNome = nome;
    os.clienteCpfCnpj = cpf;
    os.clienteCellular = cel;
    os.clienteCelular = cel;
    os.osFinalidade = finalidade;
    os.clienteEndereco = endereco;
    os.placa = placa;
    os.renavam = renavam;
    os.veiculoChassi = chassi;
    os.veiculoMarcaModelo = marcaModelo;
    os.veiculoAno = ano;
    os.observacoes = obs;
    os.servicoId = service.id;
    os.servicoNome = service.nome;
    os.valor = valor;
    os.formaPagamento = pagamento;
    os.parcelas = parcelas;
    os.detranRegistrado = detran;

    // Regenerate contract text
    os.contratoTexto = generateContractText(os);
    if (os.contratoHash) {
        // If it was already accepted, recalculate the hash with the new data
        os.contratoHash = generateSignatureHash(os.contratoTexto);
    }

    dbSave('ordens_servico', {
        clienteNome: os.clienteNome,
        clienteCpfCnpj: os.clienteCpfCnpj,
        clienteCelular: os.clienteCelular,
        osFinalidade: os.osFinalidade,
        clienteEndereco: os.clienteEndereco,
        placa: os.placa,
        renavam: os.renavam,
        veiculoChassi: os.veiculoChassi,
        veiculoMarcaModelo: os.veiculoMarcaModelo,
        veiculoAno: os.veiculoAno,
        observacoes: os.observacoes,
        servicoId: os.servicoId,
        servicoNome: os.servicoNome,
        valor: os.valor,
        formaPagamento: os.formaPagamento,
        parcelas: os.parcelas,
        detranRegistrado: os.detranRegistrado,
        contratoTexto: os.contratoTexto,
        contratoHash: os.contratoHash
    }, 'update', os.id);
    
    showToast("Ordem de Serviço editada com sucesso!", "success");
    logAudit("Edição OS", `Editou os dados da OS ${os.numero} (Placa: ${os.placa}).`);
    
    closeEditOSModal();
    closeOSModal();
    renderAtendimentoPage();
    if (document.getElementById('panel-historico').classList.contains('active')) {
        renderHistorico();
    }
}

function deleteOS(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;
    
    if (os.status !== 'aberta') {
        showToast("Operação bloqueada: Só é permitido excluir ordens de serviço em status ABERTA.", "error");
        return;
    }

    if (confirm(`Tem certeza que deseja excluir permanentemente a OS ${os.numero}? Esta ação não poderá ser desfeita.`)) {
        const index = db.ordens_servico.findIndex(o => o.id === id);
        if (index !== -1) {
            dbSave('ordens_servico', null, 'delete', id);
            showToast(`OS ${os.numero} excluída com sucesso!`, "success");
            logAudit("Exclusão OS", `Excluiu permanentemente a OS ${os.numero} (Placa: ${os.placa}).`);
            
            closeOSModal();
            renderAtendimentoPage();
            if (document.getElementById('panel-historico').classList.contains('active')) {
                renderHistorico();
            }
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
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="openOSDetailsModal(${os.id})" title="Ver Ficha"><i class="ri-eye-line"></i></button>
                        ${isMasterSession() ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteOS(${os.id})" title="Excluir OS"><i class="ri-delete-bin-line"></i></button>` : ''}
                    </div>
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

async function deleteOS(osId) {
    if (!isMasterSession()) {
        showToast("Erro: Apenas operadores Master podem excluir ordens de servico.", "error");
        return;
    }

    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) {
        showToast("Ordem de Servico nao localizada.", "error");
        return;
    }

    if (confirm("ATENCAO: Tem certeza que deseja EXCLUIR DEFINITIVAMENTE a OS " + os.numero + " (Placa: " + os.placa + ")?\n\nIsso tambem remover\u00e1 qualquer lan\u00e7amento vinculado no caixa di\u00e1rio. Esta a\u00e7\u00e3o nao podera ser desfeita.")) {
        try {
            // 1. Deletar movimentos de caixa vinculados diretamente no banco (online e offline)
            if (window.useSupabase) {
                // Deleta todos os caixa_movimentos onde "osId" = os.id, direto no Supabase
                await sbDeleteWhere('caixa_movimentos', 'osId', os.id);
            }
            // Limpar cache local independente de online/offline
            db.caixa_movimentos = db.caixa_movimentos.filter(m => m.osId !== os.id);

            // 2. Deletar a própria OS
            await dbSave('ordens_servico', null, 'delete', os.id);

            showToast("OS " + os.numero + " e seus lan\u00e7amentos de caixa foram exclu\u00eddos!", "success");
            logAudit("Exclusao OS", "Excluiu permanentemente a OS " + os.numero + " (Placa: " + os.placa + ").");

            // 3. Recarregar todos os painéis afetados
            renderOSPipeline();
            renderHistorico();
            // Atualizar caixa somente se o elemento existir na tela
            if (document.getElementById('caixa-mov-tbody')) {
                renderCaixaPage();
            }
            if (typeof saveDatabase === 'function') saveDatabase();
        } catch (err) {
            console.error(err);
            showToast("Erro ao excluir OS e movimentos de caixa.", "error");
        }
    }
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
    document.getElementById('os-veiculo-chassi').value = parentOs.veiculoChassi || '';
    document.getElementById('os-veiculo-marca-modelo').value = parentOs.veiculoMarcaModelo || '';
    document.getElementById('os-veiculo-ano').value = parentOs.veiculoAno || '';
    document.getElementById('os-nome-cliente').value = parentOs.clienteNome;
    document.getElementById('os-cpf-cliente').value = parentOs.clienteCpfCnpj;
    document.getElementById('os-celular-cliente').value = parentOs.clienteCelular;
    document.getElementById('os-finalidade').value = parentOs.osFinalidade || 'Compra/Venda';
    document.getElementById('os-cliente-endereco').value = parentOs.clienteEndereco || '';
    
    document.getElementById('os-doc-veiculo').checked = true;
    document.getElementById('os-doc-identificacao').checked = true;
    
    // Set payment to Isento
    const paymentSelect = document.getElementById('os-pagamento');
    paymentSelect.innerHTML += `<option value="isento" selected>Isento (Reapresentação)</option>`;
    paymentSelect.value = "isento";

    // Show Toast
    showToast("Reapresentação gratuita ativada. Verifique os dados e registre a OS.", "info");
    closeOSModal();
    
    // Link on save: Intercept save behavior for recheck
    // We will save parent OS ID as global to link it on submission
    window.activeRecheckOrigemId = parentOs.id;
}



function getRecheckDaysRemaining(finalizedDateIso) {
    if (!finalizedDateIso) return -1;
    const finalDate = new Date(finalizedDateIso);
    const today = new Date();
    
    // Difference in milliseconds
    const diffTime = today - finalDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return 30 - diffDays;
}

// ==========================================
// CONTRACT GENERATION & SIGNATURE ENGINE
// ==========================================

function generateSignatureHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return 'SIG-' + Math.abs(hash).toString(16).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
}

function generateContractText(os) {
    const unit = db.unidades.find(u => u.id === os.unidadeId) || {};
    const portarias = db.portarias_uf || {};
    const portaria = portarias[unit.uf] || `Portaria DETRAN-${unit.uf || 'SC'} nº [NÃO DEFINIDA]`;
    const service = db.servicos.find(s => s.id === os.servicoId) || {};
    
    const isTransferencia = service.categoria === 'Transferência';
    const isCautelar = service.categoria === 'Cautelar';
    const isPesquisa = service.categoria === 'Pesquisa';
    
    // Compose Parte II Modules
    let modulesText = "";
    if (isTransferencia) {
        modulesText = `### PARTE II — MÓDULOS ESPECÍFICOS POR SERVIÇO\n\n` + 
                      `**Módulo 1 — Vistoria de Identificação Veicular (Transferência)**\n\n` +
                      `**M1.1. Escopo.** Serviço regulado, destinado a instruir procedimento de trânsito (transferência de propriedade, mudança de município/UF, alteração de característica, inclusão de gravame, entre outros). Nos termos do art. 2º, §2º, da Resolução CONTRAN nº 941/2022, verifica-se: a autenticidade da identificação do veículo e da documentação; a legitimidade da propriedade; a presença e funcionalidade dos equipamentos obrigatórios; e a eventual modificação das características originais e sua regularização. O laudo é eletrônico e só tem validade quando registrado no SISCSV.\n\n` +
                      `**M1.2. Fora do escopo.** Não integram este serviço a avaliação mecânica/estrutural ampla, vícios ocultos, histórico não constante do prontuário, procedência comercial, valor de mercado, débitos ou quilometragem — objeto, no que couber, da Vistoria Cautelar (Módulo 2).\n\n` +
                      `**M1.3. Reprovação - reapresentação em 30 dias.** Em caso de reprovação, o CONTRATANTE poderá sanar as pendências apontadas e reapresentar o veículo, sem nova cobrança, no prazo de 30 (trinta) dias contados da primeira vistoria. Decorrido o prazo, novo serviço será cobrado integralmente.`;
    } else if (isCautelar) {
        modulesText = `### PARTE II — MÓDULOS ESPECÍFICOS POR SERVIÇO\n\n` +
                      `**Módulo 2 — Vistoria Cautelar**\n\n` +
                      `**M2.1. Natureza.** Serviço privado e facultativo, não regulado por norma de trânsito obrigatória, de avaliação técnica da originalidade e da condição estrutural do veículo, destinado a subsidiar decisão de compra e venda. Abrange os mesmos pontos da vistoria de transferência e, adicionalmente, a análise estrutural ampla descrita a seguir.\n\n` +
                      `**M2.2. Pesquisa Veicular inclusa.** A contratação da Vistoria Cautelar inclui automaticamente a Pesquisa Veicular (Módulo 3), que a integra e a acompanha. A recíproca não se aplica: a Pesquisa Veicular pode ser contratada isoladamente.\n\n` +
                      `**M2.3. Objeto da análise.** A avaliação compreende: (a) identificação e autenticidade — chassi/monobloco, motor, câmbio, vidros, etiquetas, plaquetas e selos, confrontados com os padrões de fábrica; (b) análise estrutural por elemento — exame individualizado das peças da carroceria (capô, para-lamas, portas, colunas, teto, tampa traseira, longarinas, painéis dianteiro e traseiro, entre outras), registrando-se, para cada uma, a constatação aplicável (condição original; indícios de repintura; indícios de repintura com massa; amassados aparentes; arranhões aparentes; reparo); (c) condição geral de segurança associada à estrutura; e (d) indícios de eventos que afetem o valor de mercado (p. ex. sinistro, enchente), na medida do verificável pelo método.\n\n` +
                      `**M2.4. Método e limites.** A inspeção é visual, estética e sem desmontagem, restrita a itens acessíveis no momento do exame. Não constituem objeto deste serviço, por dependerem de procedimento diverso (desmontagem, perícia laboratorial, ensaio mecânico ou avaliação elétrica/eletrônica): defeitos não perceptíveis ao exame visual, vícios ocultos, e a aferição do funcionamento de sistemas mecânicos e eletrônicos. Os parâmetros técnicos de referência observam, no que aplicável, as normas ABNT pertinentes (p. ex. NBR 6066 e NBR 15180 para identificação; NBR 15048 para soldagem) e os conceitos de monta da Resolução CONTRAN nº 810/2020.\n\n` +
                      `**M2.5. Resultado.** O laudo reúne as informações de identificação e validação, a análise estrutural por elemento, e um resultado de conformidade (Conforme / Conforme com Apontamento / Não Conforme), além de campo de restrições e observações. O resultado expressa a opinião técnica da CONTRATADA sobre o estado e o histórico do veículo no momento da inspeção, e não substitui avaliação mecânica ou elétrica especializada.\n\n` +
                      `**M2.6. Reprovação.** Diante de resultado Não Conforme, o serviço se encerra com a entrega do laudo. Não há reapresentação gratuita (regra distinta da transferência): a Vistoria Cautelar é avaliação de constatação, e o apontamento desfavorável é resultado regular e válido do serviço, não ensejando nova execução sem custo nem devolução de valores.\n\n` +
                      `**M2.7. Reforço da cláusula temporal.** Reitera-se, neste serviço, a cláusula 2 da Parte I: o laudo cautelar atesta a condição do veículo da inspeção para trás, sendo recomendável a realização de novo laudo imediatamente antes da efetivação de qualquer negócio, dado que eventos posteriores podem alterar o estado do bem.\n\n` +
                      `**Módulo 3 — Pesquisa Veicular**\n\n` +
                      `**M3.1. Escopo.** Serviço de consulta e compilação de informações e histórico do veículo a partir de bases de dados oficiais e privadas disponíveis (p. ex. dados cadastrais, débitos, restrições, gravames, registros de leilão, sinistro, roubo/furto), entregues em formato de relatório.\n\n` +
                      `**M3.2. Responsabilidade e limites.** A CONTRATADA responde pela fidelidade da compilação em relação às fontes consultadas, não respondendo pela veracidade, completude ou atualização dos dados de origem, que são de responsabilidade das respectivas fontes. Pode haver divergência ou ausência de registros entre diferentes bases; recomenda-se a realização de novas consultas próximo à conclusão do negócio.\n\n` +
                      `**M3.3. Encerramento.** A entrega do relatório encerra o serviço. Por se tratar de resultado informativo, não há reapresentação nem reembolso em razão do conteúdo apurado.`;
    } else if (isPesquisa) {
        modulesText = `### PARTE II — MÓDULOS ESPECÍFICOS POR SERVIÇO\n\n` +
                      `**Módulo 3 — Pesquisa Veicular**\n\n` +
                      `**M3.1. Escopo.** Serviço de consulta e compilação de informações e histórico do veículo a partir de bases de dados oficiais e privadas disponíveis (p. ex. dados cadastrais, débitos, restrições, gravames, registros de leilão, sinistro, roubo/furto), entregues em formato de relatório.\n\n` +
                      `**M3.2. Responsabilidade e limites.** A CONTRATADA responde pela fidelidade da compilação em relação às fontes consultadas, não respondendo pela veracidade, completude ou atualização dos dados de origem, que são de responsabilidade das respectivas fontes. Pode haver divergência ou ausência de registros entre diferentes bases; recomenda-se a realização de novas consultas próximo à conclusão do negócio.\n\n` +
                      `**M3.3. Encerramento.** A entrega do relatório encerra o serviço. Por se tratar de resultado informativo, não há reapresentação nem reembolso em razão do conteúdo apurado.`;
    } else {
        modulesText = `### PARTE II — MÓDULOS ESPECÍFICOS POR SERVIÇO\n\n` +
                      `*Não aplicável para este tipo de serviço.*`;
    }

    // Common trunk (Parte I)
    let contractText = `## QUADRO-RESUMO DA CONTRATAÇÃO

| Campo | Conteúdo |
|---|---|
| Nº da Ordem de Serviço | {{os_numero}} |
| Data e hora de abertura | {{os_data_hora}} |
| Tipo de vistoria | {{os_tipo_vistoria}} |
| Finalidade declarada pelo cliente | {{os_finalidade}} |
| Valor do serviço | R$ {{os_valor}} |
| Forma de pagamento | {{os_forma_pagamento}} |

---

## 1. DAS PARTES

**CONTRATADA:** {{ecv_razao_social}}, pessoa jurídica de direito privado inscrita no CNPJ sob nº {{ecv_cnpj}}, com sede em {{ecv_endereco}}, **Empresa Credenciada de Vistoria (ECV)** habilitada junto ao {{ecv_detran_uf}} sob o credenciamento nº {{ecv_credenciamento_numero}}, doravante denominada **CONTRATADA**.

**CONTRATANTE:** {{cliente_nome}}, inscrito(a) no CPF/CNPJ sob nº {{cliente_documento}}, residente/sediado(a) em {{cliente_endereco}}, doravante denominado(a) **CONTRATANTE**.

**VEÍCULO OBJETO:** placa {{veiculo_placa}}, RENAVAM {{veiculo_renavam}}, chassi {{veiculo_chassi}}, marca/modelo {{veiculo_marca_modelo}}, ano fab./modelo {{veiculo_ano}}.

As partes celebram o presente contrato, que se rege pelo Código de Trânsito Brasileiro (Lei nº 9.503/1997), pela Resolução CONTRAN nº 941/2022 e alterações, pela {{ecv_portaria_estadual}}, pelo Código de Defesa do Consumidor (Lei nº 8.078/1990) e demais normas aplicáveis, mediante as cláusulas seguintes.

---

## 2. DO OBJETO E DO ESCOPO DO SERVIÇO

**2.1.** O objeto deste contrato é a realização de **vistoria de identificação veicular** e a emissão do respectivo **laudo eletrônico**, registrado no Sistema de Certificação de Segurança Veicular e Vistorias (SISCSV) mantido pelo órgão máximo executivo de trânsito da União.

**2.2.** Nos exatos termos do art. 2º, §2º, da Resolução CONTRAN nº 941/2022, a vistoria de identificação veicular limita-se a verificar:

a) a autenticidade da identificação do veículo e da sua documentação;
b) a legitimidade da propriedade;
c) se o veículo dispõe dos equipamentos obrigatórios e se estes estão funcionais;
d) se as características originais do veículo e de seus agregados foram modificadas e, em caso positivo, se a alteração foi autorizada, regularizada e consta do prontuário do veículo na repartição de trânsito.

**2.3.** O serviço é prestado **exclusivamente** dentro do escopo descrito na cláusula 2.2. O laudo emitido tem **natureza documental e de identificação**, destinando-se a instruir o procedimento de trânsito indicado no quadro-resumo, e **só tem validade quando registrado no SISCSV**.

---

## 3. DO QUE NÃO INTEGRA O OBJETO (DELIMITAÇÃO EXPRESSA DE ESCOPO)

**3.1.** O CONTRATANTE declara estar ciente, de forma livre e informada, de que a vistoria de identificação veicular **NÃO se confunde com vistoria cautelar, vistoria prévia (de seguradora), perícia ou avaliação mecânica**, e que, por consequência, **NÃO** estão compreendidos no objeto deste contrato, não constituindo obrigação nem responsabilidade da CONTRATADA:

a) a avaliação do estado mecânico, elétrico, eletrônico ou estrutural do veículo, nem a identificação de **vícios ocultos** ou de defeitos não aparentes a uma inspection visual de identificação;
b) a apuração do **histórico** do veículo — passagem por leilão, sinistro, recuperação, indenização integral, batidas ou reparos — quando tal informação **não constar** do prontuário oficial ou das bases de dados de trânsito acessíveis no ato;
c) a verificação de **procedência comercial**, autenticidade de negócio jurídico de compra e venda, ou idoneidade de terceiros (vendedor, comprador, intermediário);
d) a aferição de **quilometragem real**, valor de mercado, originalidade de peças não relacionadas à identificação, ou qualidade de reparos anteriores;
e) a existência de **débitos, multas, tributos (IPVA, seguro obrigatório), restrições financeiras, gravames ou bloqueios** sobre o veículo;
f) qualquer conferência que dependa de **perícia técnica especializada** (laboratorial, criminalística ou de engenharia), de competência de órgão diverso.

**3.2.** Caso o CONTRATANTE deseje verificação de procedência, histórico e condições gerais do veículo — em especial em situações de compra e venda —, a CONTRATADA esclarece que o serviço adequado é a **vistoria cautelar**, de natureza distinta e não obrigatória, que **poderá [OPCIONAL: ser / não ser]** ofertada por esta empresa mediante contratação específica e separada.

---

## 4. DAS OBRIGAÇÕES E RESPONSABILIDADES DA CONTRATADA

**4.1.** A CONTRATADA obriga-se a prestar serviço adequado, observando regularidade, continuidade, eficiência, segurança, atualidade e cortesia, na forma do art. 9º da Resolução CONTRAN nº 941/2022.

**4.2.** A CONTRATADA responde, civil e criminalmente, **pelos prejuízos causados em decorrência das informações e interpretações que ela própria inserir no laudo** de vistoria de identificação veicular (art. 9º, VIII, da Resolução CONTRAN nº 941/2022).

**4.3.** A responsabilidade da CONTRATADA **abrange e se limita** às falhas que lhe sejam imputáveis dentro do escopo da cláusula 2.2 — por exemplo, deixar de apontar adulteração de chassi, motor ou agregados que fosse perceptível à vistoria de identificação, ou registrar no laudo informação divergente da efetivamente constatada.

**4.4.** A CONTRATADA **NÃO responde**, por expressa previsão legal e por estarem fora de seu escopo de atuação:

a) por informações **oriundas dos bancos de dados BIN / RENAVAM / RENAMO** e demais bases oficiais de trânsito, das quais a CONTRATADA é mera consulente e não a fonte (art. 9º, VIII, parte final, da Resolução CONTRAN nº 941/2022);
b) por qualquer fato, defeito ou circunstância listados na cláusula 3.1, que não integram o objeto contratado;
c) por decisão do órgão de trânsito que recuse, exija complementação ou invalide o laudo no exercício de sua competência fiscalizatória, bem como por fato exclusivo de terceiro (notadamente do vendedor ou de proprietário anterior) ou do próprio CONTRATANTE;
d) por vícios ou adulterações executados com grau de sofisticação que os torne **imperceptíveis** a uma vistoria de identificação realizada segundo a boa técnica e o regulamento aplicável, demandando perícia especializada para sua constatação.

**4.5.** A CONTRATADA mantém, na forma do art. 5º, III, "d", da Resolução CONTRAN nº 941/2022, **Apólice de Seguro de Responsabilidade Civil Profissional no valor de R$ 500.000,00**, destinada à cobertura de danos eventualmente causados ao consumidor, sem prejuízo de que a responsabilidade da empresa não fica limitada ao teto da apólice.

---

## 5. DAS OBRIGAÇÕES E DECLARAÇÕES DO CONTRATANTE

**5.1.** O CONTRATANTE obriga-se a:

a) apresentar o veículo no local e horário ajustados, em condições de acesso e limpeza que permitam a vistoria (em especial dos pontos de identificação: chassi, motor e agregados);
b) apresentar a documentação obrigatória exigida pela legislação de trânsito (CRLV-e e demais documentos pertinentes à finalidade declarada);
c) prestar informações verdadeiras quanto à finalidade da vistoria e à titularidade/posse do veículo.

**5.2.** O CONTRATANTE **declara, sob sua responsabilidade**, que:

a) leu e compreendeu a delimitação de escopo das cláusulas 2 e 3, em especial que esta vistoria **não atesta** a ausência de vícios ocultos, a procedência comercial, o histórico não documentado, a inexistência de débitos ou a integridade mecânica do veículo;
b) [OPCIONAL — exibir quando a finalidade for compra/venda] foi orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.

---

## 6. DO PRAZO, EXECUÇÃO E ENTREGA DO LAUDO

**6.1.** A vistoria será realizada nas instalações da CONTRATADA, ressalvadas as hipóteses de **vistoria móvel** taxativamente previstas no art. 3º da Resolução CONTRAN nº 941/2022 (veículo sinistrado indenizado, recuperado por instituição financeira, comercializado por PJ do ramo, apreendido em pátio público, relacionado para leilão, ou de PBT superior a 10 toneladas).

**6.2.** O laudo será disponibilizado por meio eletrônico após o registro no SISCSV, no prazo de **24 (vinte e quatro) horas**, condicionada sua validade ao referido registro.

**6.3.** O processo de vistoria é integralmente registrado por videomonitoramento e biometria, sendo as imagens armazenadas pelo prazo legal de **5 (cinco) anos**, à disposição do órgão de trânsito e do CONTRATANTE para fins de auditoria.

---

## 7. DO PREÇO E PAGAMENTO

**7.1.** Pela prestação do serviço, o CONTRATANTE pagará o valor de R$ {{os_valor}}, na forma indicada no quadro-resumo, com emissão obrigatória de **Nota Fiscal de Serviço eletrônica (NFS-e)**, independentemente de solicitação.

**7.2.** O valor refere-se **exclusivamente** ao serviço de vistoria de identificação veicular e não inclui taxas do Detran, emolumentos, ou quaisquer outros serviços não descritos neste contrato.

---

## 8. DOS DIREITOS DO CONSUMIDOR

**8.1.** Esta contratação configura relação de consumo, regida pelo Código de Defesa do Consumidor. **Nenhuma cláusula deste contrato exclui, atenua ou transfere a responsabilidade da CONTRATADA por defeito na prestação do serviço dentro do escopo contratado** (art. 25 e art. 51, I, do CDC); a delimitação de escopo das cláusulas 2 e 3 destina-se a informar com clareza o que o serviço compreende, e não a afastar responsabilidade que a lei impõe.

**8.2.** São direitos do CONTRATANTE, sem prejuízo de outros previstos em lei:

a) receber informação clara, adequada e ostensiva sobre o serviço, seu escopo e seus limites;
b) obter cópia do laudo e acesso às imagens da sua vistoria;
c) ser atendido por **canal de ouvidoria / SAC** da CONTRATADA: {{ecv_canal_ouvidoria}};
d) registrar comentário ou reclamação perante o {{ecv_detran_uf}} e os órgãos de defesa do consumidor;
e) ser ressarcido, na forma da lei e até o limite da apólice referida na cláusula 4.5 (sem que isso constitua teto da responsabilidade legal), por danos comprovadamente decorrentes de falha da CONTRATADA no âmbito do escopo contratado.

---

## 9. DA PROTEÇÃO DE DADOS (LGPD)

**9.1.** A CONTRATADA tratará os dados pessoais do CONTRATANTE e do veículo exclusivamente para a execução do serviço e o cumprimento de obrigações legais e regulatórias perante o Sistema Nacional de Trânsito, na forma da Lei nº 13.709/2018 (LGPD).

**9.2.** É **vedado** à CONTRATADA repassar a terceiros, a qualquer título, as informações sobre o veículo e o proprietário objeto da vistoria (art. 13, VI, da Resolução CONTRAN nº 941/2022), ressalvado o fornecimento às autoridades competentes nos casos legalmente previstos.

---

## 10. DAS DISPOSIÇÕES FINAIS

**10.1.** Identificada **suspeita de fraude ou irregularidade insanável** na identificação do veículo, a CONTRATADA comunicará imediatamente a autoridade policial, na forma do art. 311 do Código Penal e do art. 9º, IX, da Resolução CONTRAN nº 941/2022, ato que **não** configura inadimplemento contratual da CONTRATADA.

**10.2.** A eventual nulidade de qualquer cláusula não prejudica as demais.

**10.3.** Fica eleito o foro do domicílio do CONTRATANTE para dirimir controvérsias oriundas deste contrato, conforme art. 101, I, do CDC.

E, por estarem de acordo, as partes firmam o presente instrumento [OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}].

{{ecv_cidade_uf}}, {{os_data}}.

| CONTRATADA | CONTRATANTE |
|---|---|
| {{ecv_razao_social}} | {{cliente_nome}} |
| CNPJ {{ecv_cnpj}} | CPF/CNPJ {{cliente_documento}} |

---

${modulesText}

---

## ACEITE E ASSINATURAS

Declaro que li e compreendi as Condições Gerais (Parte I), em especial a cláusula 2 (natureza temporal do laudo), e o(s) módulo(s) do(s) serviço(s) que contratei.

[OPCIONAL - só transferência] Estou ciente da regra de reapresentação em 30 dias (M1.3).
[OPCIONAL - só cautelar/pesquisa] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).
`;

    // Perform Conditional Replacements
    let filled = contractText;
    
    // Resolve Clause 3.2
    if (isTransferencia && os.osFinalidade === 'Compra/Venda') {
        filled = filled.replace('**poderá [OPCIONAL: ser / não ser]**', '**poderá ser**');
    } else {
        filled = filled.replace('**poderá [OPCIONAL: ser / não ser]**', '**poderá não ser**');
    }
    
    // Resolve Clause 5.2.b
    if (isTransferencia && os.osFinalidade === 'Compra/Venda') {
        filled = filled.replace('b) [OPCIONAL — exibir quando a finalidade for compra/venda] foi orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.', 
                                'b) Fui orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.');
    } else {
        filled = filled.replace('b) [OPCIONAL — exibir quando a finalidade for compra/venda] foi orientado de que, para fins de aquisição segura de veículo usado, recomenda-se vistoria cautelar específica, e que opta por contratar **apenas** a vistoria de identificação veicular.', '');
    }
    
    // Resolve Aceite options
    if (isTransferencia) {
        filled = filled.replace('[OPCIONAL - só transferência] Estou ciente da regra de reapresentação em 30 dias (M1.3).', '[X] Estou ciente da regra de reapresentação em 30 dias (M1.3).');
        filled = filled.replace('[OPCIONAL - só cautelar/pesquisa] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).', '');
    } else if (isCautelar || isPesquisa) {
        filled = filled.replace('[OPCIONAL - só transferência] Estou ciente da regra de reapresentação em 30 dias (M1.3).', '');
        filled = filled.replace('[OPCIONAL - só cautelar/pesquisa] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).', '[X] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).');
    } else {
        filled = filled.replace('[OPCIONAL - só transferência] Estou ciente da regra de reapresentação em 30 dias (M1.3).', '');
        filled = filled.replace('[OPCIONAL - só cautelar/pesquisa] Estou ciente de que, em caso de resultado Não Conforme ou de apontamento na pesquisa, o serviço se encerra sem reapresentação gratuita nem reembolso (M2.6 / M3.3).', '');
    }
    
    // Resolve electronic signature block
    if (os.contratoHash) {
        filled = filled.replace('[OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}]', 
                                `eletronicamente, com aceite registrado no sistema sob hash **${os.contratoHash}** em **${formatDateTimeBr(os.contratoAceitoEm)}**`);
    } else {
        filled = filled.replace('[OPCIONAL: eletronicamente, com aceite registrado no sistema sob hash {{aceite_hash}} em {{aceite_data_hora}}]', 
                                'eletronicamente (Assinatura Eletrônica pendente)');
    }
    
    // Standard Variable Substitutions
    const valorBr = typeof os.valor === 'number' ? os.valor.toFixed(2).replace('.', ',') : '0,00';
    const formatedDate = os.criadoEm ? formatDateBr(os.criadoEm) : formatDateBr(new Date().toISOString());
    const formatedDateTime = os.criadoEm ? formatDateTimeBr(os.criadoEm) : formatDateTimeBr(new Date().toISOString());
    
    const replacements = {
        '{{os_numero}}': os.numero || 'OS-XXXX',
        '{{os_data_hora}}': formatedDateTime,
        '{{os_tipo_vistoria}}': os.servicoNome || '',
        '{{os_finalidade}}': os.osFinalidade || 'Não declarada',
        '{{os_valor}}': valorBr,
        '{{os_forma_pagamento}}': (os.formaPagamento || '').toUpperCase(),
        '{{ecv_razao_social}}': unit.razao_social || 'CERTIVE VISTORIAS',
        '{{empresa_razao_social}}': unit.razao_social || 'CERTIVE VISTORIAS',
        '{{ecv_cnpj}}': unit.cnpj || '',
        '{{empresa_cnpj}}': unit.cnpj || '',
        '{{ecv_endereco}}': unit.endereco || '',
        '{{empresa_endereco}}': unit.endereco || '',
        '{{unidade_nome}}': unit.nome || '',
        '{{unidade_endereco}}': unit.endereco || '',
        '{{ecv_detran_uf}}': `DETRAN-${unit.uf || 'SC'}`,
        '{{ecv_credenciamento_numero}}': unit.credenciamento || '',
        '{{empresa_credenciamento}}': unit.credenciamento || '',
        '{{ecv_portaria_estadual}}': portaria,
        '{{portaria_estadual}}': portaria,
        '{{ecv_canal_ouvidoria}}': unit.canal_ouvidoria || 'ouvidoria@certive.com.br',
        '{{ecv_cidade_uf}}': `${unit.cidade || ''}/${unit.uf || ''}`,
        '{{cliente_nome}}': os.clienteNome || '',
        '{{cliente_cpf}}': os.clienteCpfCnpj || '',
        '{{cliente_documento}}': os.clienteCpfCnpj || '',
        '{{cliente_celular}}': os.clienteCelular || '',
        '{{cliente_tipo}}': os.clienteTipo || 'particular',
        '{{cliente_endereco}}': os.clienteEndereco || 'NÃO CADASTRADO',
        '{{veiculo_placa}}': os.placa || '',
        '{{veiculo_renavam}}': os.renavam || '',
        '{{veiculo_chassi}}': os.veiculoChassi || '',
        '{{veiculo_marca_modelo}}': os.veiculoMarcaModelo || '',
        '{{veiculo_ano}}': os.veiculoAno || '',
        '{{aceite_hash}}': os.contratoHash || '',
        '{{aceite_data_hora}}': os.contratoAceitoEm ? formatDateTimeBr(os.contratoAceitoEm) : '',
        '{{os_data}}': formatedDate
    };
    
    for (const [placeholder, value] of Object.entries(replacements)) {
        filled = filled.split(placeholder).join(value);
    }
    
    // Resolve any remaining curly brace placeholders to avoid raw {{ }}
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    filled = filled.replace(placeholderRegex, (match, p1) => {
        return `[PENDENTE: ${p1.toUpperCase()}]`;
    });
    
    return filled;
}

function printContract(os) {
    const printArea = document.getElementById('print-area');
    const contractHtml = renderMarkdown(os.contratoTexto || generateContractText(os));
    
    printArea.innerHTML = `
        <div class="print-contract-container">
            ${contractHtml}
        </div>
    `;
    
    window.print();
}

function printContractById(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (os) printContract(os);
}

// Modal signature controllers
function closeContratoModal() {
    const modalEl = document.getElementById('modal-contrato-assinatura');
    if (modalEl) {
        modalEl.style.display = 'none';
        modalEl.classList.remove('active');
    }
    window.pendingOS = null;
}

function toggleContratoConfirmBtn() {
    const isChecked = document.getElementById('contrato-aceite-check').checked;
    document.getElementById('btn-confirmar-contrato').disabled = !isChecked;
}

function printContratoPreview() {
    if (!window.pendingOS) return;
    const printArea = document.getElementById('print-area');
    const contractHtml = renderMarkdown(window.pendingOS.contratoTexto);
    printArea.innerHTML = `
        <div class="print-contract-container">
            ${contractHtml}
        </div>
    `;
    window.print();
}

async function confirmContratoAndSaveOS() {
    try {
        if (!window.pendingOS) return;
        
        const activeCaixa = getTodayOpenCaixa();
        if (!activeCaixa) {
            showToast("Erro: O caixa foi fechado durante a operação.", "error");
            return;
        }
        
        const os = window.pendingOS;
        let signatureHash = "";
        
        if (window.useSupabase) {
            // Fluxo Banco de Dados Supabase (Garante IDs sequenciais únicos sem colisão)
            const osToInsert = { ...os };
            delete osToInsert.id;
            osToInsert.numero = "OS-TEMP";
            osToInsert.contratoHash = null;
            osToInsert.contratoAceitoEm = null;
            osToInsert.contratoTexto = "";
            if (os.pago) {
                osToInsert.status = "paga";
            }
            
            // 1. Salvar no Supabase inicialmente para obter o ID incremental real
            const inserted = await sbInsert('ordens_servico', osToInsert);
            os.id = inserted.id;
            os.numero = generateOSNumber(inserted.id);
            os.status = osToInsert.status;
            
            // 2. Gerar hash de assinatura e texto com dados de assinatura e número reais
            signatureHash = generateSignatureHash(os.contratoTexto);
            os.contratoHash = signatureHash;
            os.contratoAceitoEm = new Date().toISOString();
            os.contratoTexto = generateContractText(os);
            
            // 3. Atualizar a OS com os dados do contrato assinado no Supabase
            await sbUpdate('ordens_servico', os.id, {
                numero: os.numero,
                contratoHash: os.contratoHash,
                contratoAceitoEm: os.contratoAceitoEm,
                contratoTexto: os.contratoTexto
            });
            
            // 4. Fluxo de Reapresentação
            if (os.reapresentacaoOrigemID) {
                const originalOS = db.ordens_servico.find(o => o.id === os.reapresentacaoOrigemID);
                if (originalOS) {
                    originalOS.reapresentadaData = new Date().toISOString();
                    await sbUpdate('ordens_servico', originalOS.id, {
                        reapresentadaData: originalOS.reapresentadaData
                    });
                }
                
                window.activeRecheckOrigemId = null;
                
                // Restaurar opções de pagamento padrão
                const paymentSelect = document.getElementById('os-pagamento');
                paymentSelect.innerHTML = `
                    <option value="pix">Pix (Transferência Online)</option>
                    <option value="debito">Cartão de Débito</option>
                    <option value="credito">Cartão de Crédito à Vista</option>
                    <option value="credito_parcelado">Crédito Parcelado</option>
                    <option value="especie">Dinheiro (Espécie)</option>
                    <option value="faturamento" id="opt-pagamento-faturamento" disabled>Faturamento Mensal (Apenas parceiros habilitados)</option>
                `;
            } else {
                // Fluxo padrão: Lançamento de Caixa
                if (os.pago) {
                    const newMov = {
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
                    const insertedMov = await sbInsert('caixa_movimentos', newMov);
                    db.caixa_movimentos.unshift(insertedMov);
                }
            }
            
            // Inserir no cache local
            db.ordens_servico.unshift(os);
            
        } else {
            // Fluxo Original LocalStorage (Fallback / Offline)
            signatureHash = generateSignatureHash(os.contratoTexto);
            os.contratoHash = signatureHash;
            os.contratoAceitoEm = new Date().toISOString();
            os.contratoTexto = generateContractText(os);
            
            if (os.reapresentacaoOrigemID) {
                db.ordens_servico.unshift(os);
                
                const originalOS = db.ordens_servico.find(o => o.id === os.reapresentacaoOrigemID);
                if (originalOS) {
                    originalOS.reapresentadaData = new Date().toISOString();
                }
                
                window.activeRecheckOrigemId = null;
                
                const paymentSelect = document.getElementById('os-pagamento');
                paymentSelect.innerHTML = `
                    <option value="pix">Pix (Transferência Online)</option>
                    <option value="debito">Cartão de Débito</option>
                    <option value="credito">Cartão de Crédito à Vista</option>
                    <option value="credito_parcelado">Crédito Parcelado</option>
                    <option value="especie">Dinheiro (Espécie)</option>
                    <option value="faturamento" id="opt-pagamento-faturamento" disabled>Faturamento Mensal (Apenas parceiros habilitados)</option>
                `;
            } else {
                if (os.pago) {
                    os.status = "paga";
                    const movId = db.caixa_movimentos.length + 1;
                    db.caixa_movimentos.push({
                        id: movId,
                        caixaId: activeCaixa.id,
                        tipo: "entrada",
                        valor: os.valor,
                        descricao: `Serviço ${os.servicoNome.split(' — ')[0]} (Placa: ${os.placa})`,
                        formaPagamento: os.formaPagamento,
                        data: new Date().toISOString(),
                        operador: currentSession.nome,
                        osId: os.id,
                        faturaId: null
                    });
                }
                
                db.ordens_servico.unshift(os);
            }
            saveDatabase();
        }
        
        showToast(`O.S. registrada e contrato assinado! Código: ${os.numero}`, "success");
        logAudit("Abertura OS", `Abriu a ordem ${os.numero} com contrato firmado (Hash: ${signatureHash}).`);
        
        closeContratoModal();
        printContract(os);
        
        clearOSForm();
        renderAtendimentoPage();
    } catch (e) {
        console.error("Erro ao confirmar contrato e salvar O.S.:", e);
        alert("Ocorreu um erro ao confirmar o contrato e salvar a O.S.:\n" + e.message + "\n" + e.stack);
    }
}

// Signed contract viewer modals
function openContratoFirmadoModal(osId) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;
    
    window.viewingSignedOS = os;
    
    document.getElementById('contrato-firmado-hash-display').textContent = `Hash: ${os.contratoHash || 'NÃO ASSINADO'}`;
    document.getElementById('contrato-firmado-data-display').textContent = `Aceito em: ${os.contratoAceitoEm ? formatDateTimeBr(os.contratoAceitoEm) : '—'}`;
    
    const contentContainer = document.getElementById('contrato-firmado-content');
    const contractText = os.contratoTexto || generateContractText(os);
    contentContainer.innerHTML = renderMarkdown(contractText);
    
    const modalEl = document.getElementById('modal-contrato-firmado');
    if (modalEl) {
        modalEl.style.display = 'flex';
        modalEl.classList.add('active');
    }
}

function closeContratoFirmadoModal() {
    const modalEl = document.getElementById('modal-contrato-firmado');
    if (modalEl) {
        modalEl.style.display = 'none';
        modalEl.classList.remove('active');
    }
    window.viewingSignedOS = null;
}

function printContratoFirmado() {
    if (!window.viewingSignedOS) return;
    printContract(window.viewingSignedOS);
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
    const today = new Date().toISOString().split('T')[0];
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
        const today = new Date().toISOString().split('T')[0];
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
    const today = new Date().toISOString().split('T')[0];
    const newDrawer = {
        unidadeId: activeUnitId,
        data: today,
        status: "aberto",
        abertoPor: currentSession.nome,
        fechadoPor: null,
        saldoAbertura: 200.00,
        saldoEspécieInformado: 0,
        fechadoEm: null
    };

    if (window.useSupabase) {
        const inserted = await sbInsert('caixa_diario', newDrawer);
        db.caixa_diario.push(inserted);
    } else {
        newDrawer.id = db.caixa_diario.length + 1;
        db.caixa_diario.push(newDrawer);
        saveDatabase();
    }
    
    showToast("Caixa diário aberto com fundo inicial de R$ 200,00.", "success");
    logAudit("Abertura Caixa", "Abriu o caixa diário da filial.");
    renderCaixaPage();
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

function submitCaixaMov(event) {
    event.preventDefault();
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;

    const tipo = document.getElementById('mov-tipo').value;
    const valor = parseFloat(document.getElementById('mov-valor').value);
    const desc = document.getElementById('mov-desc').value.trim();
    const forma = document.getElementById('mov-forma-pag').value;
    const partnerId = parseInt(document.getElementById('mov-parceiro-select').value);

    if (valor <= 0) {
        showToast("Valor do movimento inválido.", "error");
        return;
    }

    let finalDesc = desc;
    if (tipo === 'entrada' && partnerId) {
        const partner = db.parceiros.find(p => p.id === partnerId);
        finalDesc = `Aporte Faturamento: ${partner.nome} — ${desc}`;
    }

    const newMov = {
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

    dbSave('caixa_movimentos', newMov, 'insert');
    
    showToast("Movimentação manual lançada com sucesso!", "success");
    logAudit("Movimentação Caixa", `Lançou ${tipo.toUpperCase()} de ${formatCurrency(valor)}: ${finalDesc}.`);

    document.getElementById('caixa-mov-form').reset();
    adjustMovForm('saida');
    renderCaixaPage();
}

function deleteCaixaMov(id) {
    const index = db.caixa_movimentos.findIndex(m => m.id === id);
    if (index === -1) return;

    const mov = db.caixa_movimentos[index];
    dbSave('caixa_movimentos', null, 'delete', id);
    
    showToast("Lançamento manual removido.", "info");
    logAudit("Remoção Movimento", `Removeu lançamento: ${mov.descricao}`);
    renderCaixaPage();
}

function uint8ArrayToBase64(arr) {
    let binary = '';
    const len = arr.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(arr[i]);
    }
    return window.btoa(binary);
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

async function submitFecharCaixa(event) {
    event.preventDefault();
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;

    const fileInput = document.getElementById('fechar-relatorio-detran');
    const file = fileInput.files[0];
    if (!file) {
        showToast("Erro: É obrigatório anexar o PDF do Relatório do Portal do DETRAN.", "error");
        return;
    }

    if (file.type !== "application/pdf") {
        showToast("Erro: O arquivo anexado deve ser do tipo PDF.", "error");
        return;
    }

    if (file.size > 1024 * 1024) {
        showToast("Erro: O arquivo PDF do DETRAN não pode exceder 1MB.", "error");
        return;
    }

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

    if (!confirm(confirmMsg)) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const uploadedPdfBytes = e.target.result;

            const tempCaixa = {
                ...activeCaixa,
                saldoEspécieInformado: saldoFisico,
                fechadoPor: currentSession.nome,
                fechadoEm: new Date().toISOString()
            };

            const cashierPdfBytes = generateCashierPdfData(tempCaixa);

            // Merge using pdf-lib
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();

            const cashierDoc = await PDFDocument.load(cashierPdfBytes);
            const copiedPages1 = await mergedPdf.copyPages(cashierDoc, cashierDoc.getPageIndices());
            copiedPages1.forEach((page) => mergedPdf.addPage(page));

            const uploadedDoc = await PDFDocument.load(uploadedPdfBytes);
            const copiedPages2 = await mergedPdf.copyPages(uploadedDoc, uploadedDoc.getPageIndices());
            copiedPages2.forEach((page) => mergedPdf.addPage(page));

            const mergedPdfBytes = await mergedPdf.save();
            const base64Pdf = uint8ArrayToBase64(mergedPdfBytes);

            // Check final size in characters (approx 1.33MB base64 corresponds to 1MB binary)
            if (base64Pdf.length > 1.33 * 1024 * 1024) {
                showToast("Erro: O PDF consolidado excedeu o limite de 1MB. Tente anexar um PDF do DETRAN menor.", "error");
                return;
            }

            activeCaixa.status = "fechado";
            activeCaixa.saldoEspécieInformado = saldoFisico;
            activeCaixa.fechadoPor = currentSession.nome;
            activeCaixa.fechadoEm = new Date().toISOString();
            activeCaixa.pdfConsolidado = base64Pdf;

            saveDatabase();
            showToast("Caixa diário fechado com sucesso!", "success");
            logAudit("Fechamento Caixa", `Fechou caixa com diferença de ${formatCurrency(diff)} e anexou relatório DETRAN.`);
            
            document.getElementById('caixa-fechar-form').reset();
            renderCaixaPage();
        } catch (err) {
            console.error("Erro no processamento do PDF de fechamento:", err);
            showToast("Erro ao processar e consolidar PDFs. Verifique se os arquivos são válidos.", "error");
        }
    };
    reader.onerror = function() {
        showToast("Erro ao ler o arquivo do DETRAN.", "error");
    };
    reader.readAsArrayBuffer(file);
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
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="printCaixaById(${c.id})" title="Imprimir Relatório de Caixa"><i class="ri-printer-line"></i></button>
                        ${isMasterSession() ? `<button class="btn btn-warning btn-sm btn-icon" onclick="reopenCaixa(${c.id})" title="Reabrir Caixa Diario"><i class="ri-lock-unlock-line"></i></button>` : ''}
                        ${c.pdfConsolidado ? `<button class="btn btn-primary btn-sm btn-icon" onclick="downloadConsolidatedPdf(${c.id})" title="Baixar PDF Consolidado (Caixa + DETRAN)"><i class="ri-download-line"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function reopenCaixa(caixaId) {
    if (!isMasterSession()) {
        showToast("Erro: Apenas operadores Master podem reabrir caixas.", "error");
        return;
    }

    const openCaixa = db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.status === "aberto");
    if (openCaixa) {
        showToast("Operacao negada: Ja existe um caixa ABERTO hoje para esta unidade.", "error");
        return;
    }

    const c = db.caixa_diario.find(x => x.id === caixaId);
    if (!c) {
        showToast("Caixa nao localizado.", "error");
        return;
    }

    if (confirm("Confirmar a reabertura do caixa fechado do dia " + formatDateBr(c.data) + "?")) {
        c.status = "aberto";
        c.fechadoPor = null;
        c.fechadoEm = null;
        c.pdfConsolidado = null;

        if (window.useSupabase) {
            await sbUpdate('caixa_diario', c.id, {
                status: c.status,
                fechadoPor: null,
                fechadoEm: null,
                pdfConsolidado: null
            });
        } else {
            saveDatabase();
        }

        showToast("Caixa reaberto com sucesso!", "success");
        logAudit("Reabertura Caixa", "Reabriu o caixa do dia " + formatDateBr(c.data));
        
        renderCaixaPage();
    }
}

// Print Active Caixa (Today's Drawer)
function printActiveCaixa() {
    // Can print open or closed drawer
    const today = new Date().toISOString().split('T')[0];
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

function closeFatModal() {
    document.getElementById('modal-faturamento-fechar').classList.remove('active');
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

    let finalInvoice;
    let code = "";

    if (window.useSupabase) {
        // Fluxo Banco de Dados Supabase (Garante IDs sequenciais únicos sem colisão)
        const invoiceToInsert = {
            codigo: "FAT-TEMP",
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

        // 1. Salvar no Supabase inicialmente para obter o ID incremental real
        const inserted = await sbInsert('faturas', invoiceToInsert);
        code = generateFaturaCode(inserted.id);
        
        // 2. Atualizar a fatura com o código gerado real no Supabase
        finalInvoice = await sbUpdate('faturas', inserted.id, {
            codigo: code
        });
        
        // 3. Vincular as OSs faturadas a essa faturaId no Supabase
        for (const os of selectedOSs) {
            os.faturaId = inserted.id;
            await sbUpdate('ordens_servico', os.id, {
                faturaId: inserted.id
            });
        }
        
        db.faturas.unshift(finalInvoice);
    } else {
        // Fluxo Original LocalStorage (Fallback / Offline)
        const fatId = db.faturas.length + 1;
        code = "FAT-" + String(fatId).padStart(4, '0');

        finalInvoice = {
            id: fatId,
            codigo: code,
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

        db.faturas.push(finalInvoice);
        
        selectedOSs.forEach(o => {
            o.faturaId = fatId;
        });

        saveDatabase();
    }

    showToast(`Fatura ${code} gerada com sucesso!`, "success");
    logAudit("Faturamento Lote", `Faturou ${selectedOSs.length} OSs para ${document.getElementById('fat-modal-parceiro').value}.`);
    
    closeFatModal();
    renderFaturamentoPage();
}

function renderFatFaturas() {
    const tbody = document.getElementById('fat-faturas-tbody');
    const faturas = db.faturas
        .filter(f => f.unidadeId === activeUnitId)
        .sort((a, b) => b.id - a.id);

    if (faturas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhuma fatura emitida nesta unidade.</td></tr>';
        return;
    }

    tbody.innerHTML = faturas.map(f => {
        const partner = db.parceiros.find(p => p.id === f.parceiroId);
        const statusBadge = f.pago 
            ? `<span class="badge badge-done">Paga</span>` 
            : `<span class="badge badge-waiting">Aberto</span>`;

        const statusBoleto = f.statusBoleto || "Não gerado";
        let boletoBadge = '';
        if (statusBoleto === 'Não gerado') {
            boletoBadge = '<span class="badge badge-waiting" style="opacity:0.75;"><span class="badge-dot"></span> Não Gerado</span>';
        } else if (statusBoleto === 'Gerado') {
            boletoBadge = '<span class="badge badge-progress"><span class="badge-dot"></span> Gerado</span>';
        } else if (statusBoleto === 'Pago') {
            boletoBadge = '<span class="badge badge-done"><span class="badge-dot"></span> Pago</span>';
        } else if (statusBoleto === 'Vencido') {
            boletoBadge = '<span class="badge badge-cancelled"><span class="badge-dot"></span> Vencido</span>';
        }

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
                <td>${boletoBadge}</td>
                <td>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="printInvoiceById(${f.id})" title="Imprimir Fatura"><i class="ri-printer-line"></i></button>
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="openBoletoModal(${f.id})" title="Boleto Bancário"><i class="ri-bank-card-line"></i></button>
                        ${!f.pago ? `<button class="btn btn-success btn-sm" onclick="liquidateInvoice(${f.id})"><i class="ri-check-line"></i> Baixar</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function liquidateInvoice(invoiceId) {
    // Requires an open cashier drawer to inject faturamento payments
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) {
        showToast("Erro: É necessário que o caixa de hoje esteja ABERTO para dar baixa na fatura.", "error");
        return;
    }

    const invoice = db.faturas.find(f => f.id === invoiceId);
    if (!invoice) return;

    if (confirm(`Confirmar recebimento de pagamento para a fatura ${invoice.codigo} no valor de ${formatCurrency(invoice.valorTotal)}?`)) {
        invoice.pago = true;
        invoice.pagoEm = new Date().toISOString();

        // Mark all related OSs as settled/pago
        invoice.ordensIds.forEach(id => {
            const os = db.ordens_servico.find(o => o.id === id);
            if (os) os.pago = true;
        });

        // Insert cash drawer inflow (Pix by default)
        const partner = db.parceiros.find(p => p.id === invoice.parceiroId);
        db.caixa_movimentos.push({
            id: db.caixa_movimentos.length + 1,
            caixaId: activeCaixa.id,
            tipo: "entrada",
            valor: invoice.valorTotal,
            descricao: `Recebimento Fatura ${invoice.codigo} — ${partner.nome}`,
            formaPagamento: "pix",
            data: new Date().toISOString(),
            operador: currentSession.nome,
            osId: null,
            faturaId: invoice.id
        });

        saveDatabase();
        showToast(`Fatura ${invoice.codigo} liquidada com sucesso! Entrada gerada no caixa.`, "success");
        logAudit("Faturamento Baixa", `Liquidou fatura ${invoice.codigo} no valor de ${formatCurrency(invoice.valorTotal)}.`);
        
        renderFatFaturas();
    }
}

function printInvoiceById(invoiceId) {
    const f = db.faturas.find(x => x.id === invoiceId);
    if (!f) {
        showToast("Fatura não localizada.", "error");
        return;
    }

    const partner = db.parceiros.find(p => p.id === f.parceiroId);
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
    document.getElementById('tab-contas-assessor').style.display = tab === 'assessor' ? 'block' : 'none';

    if (tab === 'despesas') renderContasGerais();
    if (tab === 'variaveis') calcularCustosDetran();
    if (tab === 'assessor') renderAssessorTab();
}

function renderContasPage() {
    renderContasGears();
}

function renderContasGears() {
    if (currentContasTab === 'despesas') {
        renderContasGerais();
    } else if (currentContasTab === 'variaveis') {
        calcularCustosDetran();
    } else if (currentContasTab === 'assessor') {
        renderAssessorTab();
    }
}

function renderContasGerais() {
    const tbody = document.getElementById('contas-tbody');
    const list = db.contas_pagar
        .filter(c => c.unidadeId === activeUnitId)
        .sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhuma conta a pagar registrada.</td></tr>';
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

        const comprovanteHtml = c.comprovante
            ? `<button class="btn btn-success btn-sm btn-icon" onclick="previewExpenseComprovante(${c.id})" title="Visualizar Comprovante" style="padding: 4px; display: inline-flex; align-items: center; justify-content: center;"><i class="ri-checkbox-circle-line" style="font-size: 14px;"></i></button>`
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
                <td style="text-align: center;">${comprovanteHtml}</td>
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
    const cat = document.getElementById('desp-categoria').value;
    const fornecedor = document.getElementById('desp-fornecedor').value.trim();
    const fileInput = document.getElementById('desp-anexo');
    const obs = document.getElementById('desp-obs').value.trim();
    const file = fileInput.files[0];

    if (val <= 0) {
        showToast("Valor de despesa inválido.", "error");
        return;
    }

    const saveExpense = async (anexoData = null) => {
        const newExpense = {
            unidadeId: activeUnitId,
            descricao: desc,
            tipo: "fixo",
            vencimento: venc,
            valor: val,
            categoria: cat,
            fornecedor: fornecedor,
            observacoes: obs,
            anexo: anexoData,
            pago: false,
            pagoEm: null,
            comprovante: null
        };

        try {
            await dbSave('contas_pagar', newExpense, 'insert');
            showToast("Despesa cadastrada com sucesso!", "success");
            logAudit("Cadastro Despesa", `Adicionou despesa a pagar: ${desc} (Venc: ${formatDateBr(venc)})`);
            
            document.getElementById('despesa-form').reset();
            renderContasGerais();
        } catch (err) {
            console.error(err);
            showToast("Erro ao cadastrar despesa no banco.", "error");
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

function payExpense(id) {
    const expense = db.contas_pagar.find(c => c.id === id);
    if (!expense) return;

    const modal = document.getElementById('modal-os-detalhes');
    document.getElementById('detalhes-os-title').textContent = `Liquidar Despesa — ${expense.descricao}`;
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    document.getElementById('detalhes-os-body').innerHTML = `
        <div class="form-group" style="margin-bottom: 16px;">
            <label style="font-weight:600;">Descrição da Despesa</label>
            <input type="text" value="${expense.descricao}" readonly style="width:100%; padding:8px; background:var(--bg-secondary); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
            <label style="font-weight:600;">Valor</label>
            <input type="text" value="${formatCurrency(expense.valor)}" readonly style="width:100%; padding:8px; background:var(--bg-secondary); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm); font-weight:700;">
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
            <label for="pay-date" style="font-weight:600;">Data do Pagamento</label>
            <input type="date" id="pay-date" value="${todayStr}" required style="width:100%; padding:8px; background:var(--bg-primary); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
            <label for="pay-comprovante" style="font-weight:600;">Comprovante de Pagamento (Imagem / PDF)</label>
            <input type="file" id="pay-comprovante" accept="image/jpeg,image/png,application/pdf" style="width:100%; padding:6px 12px; font-size:12px;" required>
            <small style="color: var(--text-secondary); display:block; margin-top:4px;">Limite de tamanho: 1MB.</small>
        </div>
    `;

    document.getElementById('detalhes-os-footer').innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="closeOSModal()">Cancelar</button>
        <button class="btn btn-success btn-sm" onclick="submitPayExpense(${id})"><i class="ri-check-line"></i> Confirmar Pagamento</button>
    `;
    modal.classList.add('active');
}

function submitPayExpense(id) {
    const expense = db.contas_pagar.find(c => c.id === id);
    if (!expense) return;

    const payDate = document.getElementById('pay-date').value;
    const fileInput = document.getElementById('pay-comprovante');
    const file = fileInput.files[0];

    if (!payDate) {
        showToast("Selecione a data do pagamento.", "error");
        return;
    }

    if (!file) {
        showToast("O upload do comprovante de pagamento é obrigatório.", "error");
        return;
    }

    if (file.size > 1024 * 1024) {
        showToast("Erro: O comprovante não pode exceder 1MB.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const updates = {
            pago: true,
            pagoEm: payDate,
            comprovante: e.target.result
        };

        try {
            await dbSave('contas_pagar', updates, 'update', expense.id);
            expense.pago = true;
            expense.pagoEm = payDate;
            expense.comprovante = e.target.result;

            showToast("Pagamento registrado com sucesso!", "success");
            logAudit("Pagamento Despesa", `Marcou despesa como paga e anexou comprovante: ${expense.descricao}.`);
            closeOSModal();
            renderContasGerais();
        } catch (err) {
            console.error(err);
            showToast("Erro ao registrar pagamento no banco.", "error");
        }
    };
    reader.onerror = function() {
        showToast("Erro ao ler o arquivo de comprovante.", "error");
    };
    reader.readAsDataURL(file);
}

function previewExpenseComprovante(id) {
    const expense = db.contas_pagar.find(c => c.id === id);
    if (!expense || !expense.comprovante) {
        showToast("Comprovante não localizado.", "error");
        return;
    }

    const modal = document.getElementById('modal-os-detalhes');
    document.getElementById('detalhes-os-title').textContent = `Comprovante de Pagamento — ${expense.descricao}`;
    
    let contentHtml = "";
    if (expense.comprovante.startsWith("data:application/pdf")) {
        contentHtml = `
            <div style="height: 500px; width: 100%;">
                <iframe src="${expense.comprovante}" style="width: 100%; height: 100%; border: none;" type="application/pdf"></iframe>
            </div>
        `;
    } else {
        contentHtml = `
            <div style="text-align: center; max-height: 500px; overflow-y: auto; padding: 10px;">
                <img src="${expense.comprovante}" alt="Comprovante Pagamento" style="max-width: 100%; height: auto; border-radius: var(--radius-sm); box-shadow: var(--shadow-sm);">
            </div>
        `;
    }

    document.getElementById('detalhes-os-body').innerHTML = contentHtml;
    
    document.getElementById('detalhes-os-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeOSModal()">Fechar</button>
        <a href="${expense.comprovante}" download="comprovante_despesa_${expense.id}.${expense.comprovante.includes('pdf') ? 'pdf' : 'jpg'}" class="btn btn-primary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
            <i class="ri-download-line"></i> Download do Comprovante
        </a>
    `;
    modal.classList.add('active');
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

// ==========================================
// ASSESSOR DE DESPESAS (CAMADA A & B)
// ==========================================
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
    if (!db.metas_despesas) db.metas_despesas = {};
    if (!db.metas_despesas[activeUnitId]) db.metas_despesas[activeUnitId] = {};
    const unitMetas = db.metas_despesas[activeUnitId];
    
    grid.innerHTML = CATEGORIAS_DESPESAS.map(cat => {
        const metaVal = unitMetas[cat] !== undefined ? unitMetas[cat] : 0;
        return `
            <div class="form-group" style="margin: 0;">
                <label style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${cat}</label>
                <div style="position: relative; display: flex; align-items: center;">
                    <span style="position: absolute; left: 10px; color: var(--text-secondary); font-size: 12px;">R$</span>
                    <input type="number" step="0.01" min="0" class="meta-input-field" data-categoria="${cat}" value="${metaVal.toFixed(2)}" style="padding-left: 30px; width: 100%; box-sizing: border-box; background: var(--bg-primary); border: 1px solid var(--border); color: var(--text-primary); border-radius: var(--radius-sm); height: 36px;">
                </div>
            </div>
        `;
    }).join('');

    const unitExpenses = db.contas_pagar.filter(c => c.unidadeId === activeUnitId);
    const currentMonthStr = "2026-06";
    const prevMonthStr = "2026-05";

    // 1. Render Comparative Table (Camada A)
    const tbodyCat = document.getElementById('assessor-categorias-tbody');
    tbodyCat.innerHTML = CATEGORIAS_DESPESAS.map(cat => {
        const gastoAtual = unitExpenses.filter(c => c.categoria === cat && c.vencimento.startsWith(currentMonthStr)).reduce((sum, c) => sum + c.valor, 0);
        const gastoAnterior = unitExpenses.filter(c => c.categoria === cat && c.vencimento.startsWith(prevMonthStr)).reduce((sum, c) => sum + c.valor, 0);
        const meta = unitMetas[cat] || 0;
        
        // Historical average including all months in the DB for this unit
        const allMonths = [...new Set(unitExpenses.filter(c => c.categoria === cat).map(c => c.vencimento.substring(0, 7)))];
        const numMonths = allMonths.length || 1;
        const totalCatGastos = unitExpenses.filter(c => c.categoria === cat).reduce((sum, c) => sum + c.valor, 0);
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

function submitMetasDespesas(event) {
    event.preventDefault();
    if (!db.metas_despesas) db.metas_despesas = {};
    if (!db.metas_despesas[activeUnitId]) db.metas_despesas[activeUnitId] = {};
    
    const inputs = document.querySelectorAll('.meta-input-field');
    inputs.forEach(input => {
        const cat = input.getAttribute('data-categoria');
        const val = parseFloat(input.value) || 0;
        db.metas_despesas[activeUnitId][cat] = val;
    });
    
    saveDatabase();
    showToast("Metas financeiras salvas com sucesso!", "success");
    logAudit("Alteração Metas", `Atualizou as metas de despesas para a unidade ${activeUnitId}.`);
    renderAssessorTab();
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
    
    const unitMetas = (db.metas_despesas && db.metas_despesas[activeUnitId]) || {};
    
    CATEGORIAS_DESPESAS.forEach(cat => {
        const gastoAtual = currentExpenses.filter(c => c.categoria === cat).reduce((sum, c) => sum + c.valor, 0);
        const gastoAnterior = prevExpenses.filter(c => c.categoria === cat).reduce((sum, c) => sum + c.valor, 0);
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
                Olá, Ricardo! Analisei os lançamentos de contas a pagar da unidade <strong>${db.unidades.find(u => u.id === activeUnitId)?.nome || 'Unidade'}</strong> e aqui estão as minhas observações inteligentes:
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
        const taxRate = db.taxas_referencia.find(t => t.servicoId === s.id)?.tax || 0;
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
        vencimento: `${year}-${document.getElementById('detran-calculo-mes').value}-28`, // arbitrary due date
        valor: val,
        pago: false,
        pagoEm: null,
        categoria: "Impostos / Taxas",
        fornecedor: "DETRAN-SC",
        comprovante: null
    };

    try {
        await dbSave('contas_pagar', newPayable, 'insert');
        showToast("Guia consolidada enviada para o Financeiro com sucesso!", "success");
        logAudit("Consolidação DETRAN", `Gerou taxa DETRAN do mês de ${monthLabel}/${year} consolidada no valor de ${formatCurrency(val)}.`);
        calcularCustosDetran();
    } catch (err) {
        console.error(err);
        showToast("Erro ao lançar fatura DETRAN.", "error");
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
        const tax = db.taxas_referencia.find(t => t.servicoId === o.servicoId)?.tax || 0;
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
    document.getElementById('tab-cfg-portarias').style.display = tab === 'portarias' ? 'block' : 'none';

    if (tab === 'precos') renderConfigPrecos();
    if (tab === 'parceiros') renderConfigParceiros();
    if (tab === 'operadores') renderConfigOperadores();
    if (tab === 'portarias') renderConfigPortarias();
}

function renderConfigPage() {
    if (currentConfigTab === 'precos') renderConfigPrecos();
    else if (currentConfigTab === 'parceiros') renderConfigParceiros();
    else if (currentConfigTab === 'operadores') renderConfigOperadores();
    else if (currentConfigTab === 'portarias') renderConfigPortarias();
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
        const tax = db.taxas_referencia.find(t => t.servicoId === s.id)?.tax || 0;
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
    for (const s of db.servicos) {
        const val = parseFloat(document.querySelector(`input[name="cfg-svc-${s.id}"]`).value);
        s.precoBalcao = val;
        if (window.useSupabase) {
            await sbUpdate('servicos', s.id, { precoBalcao: val }).catch(err => console.error(err));
        }
    }

    if (!window.useSupabase) {
        saveDatabase();
    }
    showToast("Tabela de preços de balcão atualizada com sucesso!", "success");
    logAudit("Ajuste Preço", "Alterou valores da tabela de balcão.");
}

async function submitConfigTaxas(event) {
    event.preventDefault();
    for (const s of db.servicos) {
        const val = parseFloat(document.querySelector(`input[name="cfg-tax-${s.id}"]`).value);
        const refTax = db.taxas_referencia.find(t => t.servicoId === s.id);
        if (refTax) {
            refTax.tax = val;
            if (window.useSupabase) {
                await sbUpdate('taxas_referencia', refTax.id, { taxa: val }).catch(err => console.error(err));
            }
        }
    }

    if (!window.useSupabase) {
        saveDatabase();
    }
    showToast("Tabela de taxas de concessão do órgão atualizada!", "success");
    logAudit("Ajuste Taxa", "Alterou taxas de referência do DETRAN.");
}

// Config: Portarias por UF
function renderConfigPortarias() {
    const listContainer = document.getElementById('config-portarias-list');
    if (!listContainer) return;
    
    const portarias = db.portarias_uf || {};
    const keys = Object.keys(portarias).sort();
    
    if (keys.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 12px; color: var(--text-secondary);">Nenhuma portaria cadastrada.</td></tr>`;
        return;
    }
    
    listContainer.innerHTML = keys.map(uf => `
        <tr>
            <td style="font-weight: 700; color: var(--accent);">${uf}</td>
            <td>${portarias[uf]}</td>
            <td style="text-align: center;">
                <button class="btn btn-secondary btn-sm" onclick="editConfigPortaria('${uf}')" style="padding: 2px 6px; margin-right: 4px;"><i class="ri-edit-line"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteConfigPortaria('${uf}')" style="padding: 2px 6px;"><i class="ri-delete-bin-line"></i></button>
            </td>
        </tr>
    `).join('');
}

function editConfigPortaria(uf) {
    const portarias = db.portarias_uf || {};
    const text = portarias[uf] || '';
    
    document.getElementById('cfg-portaria-uf').value = uf;
    document.getElementById('cfg-portaria-texto').value = text;
    document.getElementById('cfg-portaria-old-uf').value = uf;
}

function deleteConfigPortaria(uf) {
    if (confirm(`Tem certeza que deseja excluir a portaria da UF ${uf}?`)) {
        if (db.portarias_uf && db.portarias_uf[uf]) {
            delete db.portarias_uf[uf];
            saveDatabase();
            showToast(`Portaria de ${uf} excluída com sucesso.`, "success");
            logAudit("Configuração Portaria", `Excluiu portaria da UF: ${uf}.`);
            renderConfigPortarias();
        }
    }
}

function submitConfigPortaria(event) {
    event.preventDefault();
    const uf = document.getElementById('cfg-portaria-uf').value.toUpperCase().trim();
    const texto = document.getElementById('cfg-portaria-texto').value.trim();
    const oldUf = document.getElementById('cfg-portaria-old-uf').value.toUpperCase().trim();
    
    if (!uf || !texto) {
        showToast("Preencha todos os campos da portaria.", "error");
        return;
    }
    
    if (!db.portarias_uf) {
        db.portarias_uf = {};
    }
    
    if (oldUf && oldUf !== uf) {
        delete db.portarias_uf[oldUf];
    }
    
    db.portarias_uf[uf] = texto;
    saveDatabase();
    
    showToast(`Portaria de ${uf} salva com sucesso.`, "success");
    logAudit("Configuração Portaria", `Salvou portaria da UF ${uf}: "${texto}".`);
    
    document.getElementById('config-portaria-form').reset();
    document.getElementById('cfg-portaria-old-uf').value = '';
    
    renderConfigPortarias();
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
                <td>
                    <strong>${p.nome}</strong>
                    ${p.parceiroShopping ? '<span class="badge badge-waiting" style="font-size: 10px; padding: 2px 6px; margin-left: 6px;">Shopping</span>' : ''}
                </td>
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

function submitConfigPartner(event) {
    event.preventDefault();
    const nome = document.getElementById('cfg-part-nome').value.trim();
    const cnpj = document.getElementById('cfg-part-cnpj').value.trim();
    const responsavel = document.getElementById('cfg-part-responsavel').value.trim();
    const tel = document.getElementById('cfg-part-tel').value.trim();
    const fat = document.getElementById('cfg-part-faturamento').checked;
    const shopping = document.getElementById('cfg-part-shopping').checked;
    const obs = document.getElementById('cfg-part-obs').value.trim();

    // Build Price table map (excluding Exotic Cars ID 6)
    let customPrecos = {};
    db.servicos.filter(s => s.id !== 6).forEach(s => {
        const val = parseFloat(document.querySelector(`input[name="matrix-price-${s.id}"]`).value);
        customPrecos[s.id] = val;
    });

    const emailEl = document.getElementById('cfg-part-email');
    const email = emailEl ? emailEl.value.trim() : '';

    // Payload sem 'email' (coluna não existe na tabela parceiros do banco)
    const partnerPayload = {
        nome: nome,
        cnpj: cnpj,
        responsavel: responsavel,
        telefone: tel,
        usaFaturamento: fat,
        observacoes: obs,
        tabelaPrecos: customPrecos,
        parceiroShopping: shopping
    };

    if (window.editingPartnerId) {
        const partner = db.parceiros.find(p => p.id === window.editingPartnerId);
        if (partner) {
            // Atualizar cache local imediatamente
            Object.assign(partner, partnerPayload);

            dbSave('parceiros', partnerPayload, 'update', partner.id).then(result => {
                // Se o update não encontrou no Supabase (parceiro só local), faz insert
                if (window.useSupabase && !result) {
                    return sbInsert('parceiros', partnerPayload).then(inserted => {
                        // Atualizar ID local com o novo ID do Supabase
                        partner.id = inserted.id;
                        window.editingPartnerId = inserted.id;
                        cacheUpdate('parceiros', partner.id, { id: inserted.id });
                        console.log('✅ Parceiro inserido no Supabase com novo ID:', inserted.id);
                    });
                }
            }).then(() => {
                showToast("Cadastro de parceiro atualizado com sucesso!", "success");
                logAudit("Edição Parceiro", `Atualizou os dados do parceiro ${nome}.`);
                cancelEditPartner();
                renderConfigParceiros();
            }).catch(err => {
                console.error(err);
                // Cache local já foi atualizado; informa que ficou salvo localmente
                showToast("Parceiro atualizado localmente.", "success");
                cancelEditPartner();
                renderConfigParceiros();
            });
        }
    } else {
        dbSave('parceiros', partnerPayload, 'insert').then(() => {
            showToast("Parceiro conveniado adicionado com sucesso!", "success");
            logAudit("Cadastro Parceiro", `Cadastrou parceiro ${nome}.`);
            document.getElementById('config-partner-form').reset();
            renderConfigParceiros();
        }).catch(err => {
            console.error(err);
            showToast("Erro ao cadastrar parceiro.", "error");
        });
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
    document.getElementById('cfg-part-shopping').checked = !!partner.parceiroShopping;
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

    db.servicos.filter(s => s.id !== 6).forEach(s => {
        const val = parseFloat(document.getElementById(`edit-matrix-price-${s.id}`).value);
        partner.tabelaPrecos[s.id] = val;
    });

    if (window.useSupabase) {
        await sbUpdate('parceiros', partner.id, {
            tabelaPrecos: partner.tabelaPrecos
        }).then(() => {
            showToast("Tabela de precos atualizada no Supabase!", "success");
        }).catch(err => {
            console.error("Erro ao atualizar tabela de precos online:", err);
        });
    } else {
        saveDatabase();
    }

    showToast("Tabela acordada do parceiro atualizada!", "success");
    logAudit("Ajuste Tabela Parceiro", `Atualizou a tabela de preços do parceiro ${partner.nome}.`);
    closeOSModal();
    renderConfigParceiros();
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
        await dbSave('operadores', newOp, 'insert');
        showToast("Novo operador cadastrado com sucesso!", "success");
        logAudit("Cadastro Operador", `Adicionou operador ${login}.`);
        document.getElementById('config-op-form').reset();
        renderConfigOperadores();
    } catch (err) {
        console.error(err);
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
        await dbSave('unidades', newUnit, 'insert');
        showToast("Nova filial cadastrada com sucesso!", "success");
        logAudit("Cadastro Filial", `Adicionou filial: ${nome}.`);

        document.getElementById('config-unit-form').reset();
        
        // Refresh selections & layout
        renderUnitSelectorOptions();
        renderConfigOperadores();
    } catch (err) {
        console.error(err);
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
    // 1. Initialize DB Schema & Seeds
    let dbLoaded = false;
    const isSupabaseConfigured = (typeof supabaseClient !== 'undefined' && supabaseClient !== null);
    
    if (isSupabaseConfigured) {
        window.useSupabase = true;
        dbLoaded = await loadAllFromSupabase();
    }
    
    if (!dbLoaded) {
        console.warn("⚠️ Supabase indisponível ou falhou ao carregar. Inicializando base offline local.");
        window.useSupabase = false;
        initDatabase();
    } else {
        console.log("🚀 Sistema carregado com sucesso via Supabase!");
    }
    
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
        if (t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'search') && t.id !== 'login-password' && t.id !== 'cfg-op-senha') {
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

// ==========================================
// INTEGRATIONS: NFS-e & BOLETOS (SIMULATED)
// ==========================================
function requestNfse(osId) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;

    const serviceName = os.servicoNome;
    const clientName = os.clienteNome;
    const clientDoc = os.clienteCpfCnpj;
    const val = os.valor;

    const modal = document.getElementById('modal-os-detalhes');
    window.lastDetailsOsId = osId;

    document.getElementById('detalhes-os-title').textContent = `Módulo de Integração NFS-e — OS ${os.numero}`;
    document.getElementById('detalhes-os-body').innerHTML = `
        <div style="background: var(--warning-bg); border: 1px solid var(--warning); padding: 16px; border-radius: var(--radius-sm); margin-bottom: 20px; color: var(--text-primary);">
            <h4 style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:8px; color: var(--warning);">
                <i class="ri-alert-line"></i> Integração Pendente de Homologação
            </h4>
            <p style="font-size: 12px; line-height: 1.5;">
                O módulo de emissão automática de NFS-e está modelado e pronto para comunicação com a Prefeitura. A integração de produção está aguardando ativação das chaves e certificados fiscais da prefeitura municipal.
            </p>
        </div>

        <h4 style="font-size:13px; font-weight:600; margin-bottom:12px; text-transform:uppercase; color:var(--accent);">Dados Mapeados para Emissão:</h4>
        <div class="detail-grid" style="margin-bottom: 20px;">
            <div class="detail-item"><label>Tomador (Razão/Nome)</label><span>${clientName}</span></div>
            <div class="detail-item"><label>CPF / CNPJ</label><span>${clientDoc}</span></div>
            <div class="detail-item"><label>Descrição do Serviço</label><span>${serviceName} (PLACA: ${os.placa})</span></div>
            <div class="detail-item"><label>Valor do Serviço</label><strong>${formatCurrency(val)}</strong></div>
            <div class="detail-item"><label>Unidade Tributária</label><span>Código de Serviço Municipal (Vistoria Veicular)</span></div>
        </div>

        <div class="form-group">
            <label>Alterar Status Fiscal para Teste:</label>
            <select id="nfse-test-status" style="width:100%; padding:8px; background:var(--bg-primary); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                <option value="Não solicitada" ${os.statusNfse === 'Não solicitada' ? 'selected' : ''}>Não solicitada</option>
                <option value="Pendente de emissão" ${os.statusNfse === 'Pendente de emissão' ? 'selected' : ''}>Pendente de emissão (Simular Solicitação)</option>
                <option value="Emitida" ${os.statusNfse === 'Emitida' ? 'selected' : ''}>Emitida (Simular Emissão Bem Sucedida)</option>
            </select>
        </div>
    `;

    document.getElementById('detalhes-os-footer').innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="openOSDetailsModal(${osId})">Voltar</button>
        <button class="btn btn-primary btn-sm" onclick="saveNfseSimulatedStatus(${osId})">Confirmar</button>
    `;
}

function saveNfseSimulatedStatus(osId) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;

    const status = document.getElementById('nfse-test-status').value;
    os.statusNfse = status;
    if (status === 'Emitida') {
        os.numeroNfse = "NFS-" + String(Math.floor(100000 + Math.random() * 900000));
        os.dataNfse = new Date().toISOString();
    } else {
        os.numeroNfse = null;
        os.dataNfse = null;
    }

    saveDatabase();
    showToast(`Status NFS-e da OS ${os.numero} atualizado para: ${status}`, "success");
    logAudit("Simulação NFS-e", `Atualizou status NFS-e da OS ${os.numero} para ${status}.`);
    openOSDetailsModal(osId);
}

function openBoletoModal(invoiceId) {
    const f = db.faturas.find(x => x.id === invoiceId);
    if (!f) return;

    const partner = db.parceiros.find(p => p.id === f.parceiroId);
    const modal = document.getElementById('modal-os-detalhes');

    const statusBoleto = f.statusBoleto || "Não gerado";
    let statusColor = "var(--text-secondary)";
    if (statusBoleto === "Gerado") statusColor = "var(--info)";
    if (statusBoleto === "Pago") statusColor = "var(--success)";
    if (statusBoleto === "Vencido") statusColor = "var(--danger)";

    let actionButton = "";
    if (statusBoleto === "Não gerado") {
        actionButton = `<button class="btn btn-primary btn-sm" onclick="simulateGenerateBoleto(${f.id})"><i class="ri-bank-card-line"></i> Simular Geração de Boleto</button>`;
    } else if (statusBoleto === "Gerado") {
        actionButton = `
            <button class="btn btn-success btn-sm" onclick="simulatePayBoleto(${f.id})"><i class="ri-money-dollar-circle-line"></i> Simular Liquidação (Pagamento)</button>
        `;
    }

    document.getElementById('detalhes-os-title').textContent = `Módulo de Boleto Bancário — Fatura ${f.codigo}`;
    document.getElementById('detalhes-os-body').innerHTML = `
        <div style="background: var(--warning-bg); border: 1px solid var(--warning); padding: 16px; border-radius: var(--radius-sm); margin-bottom: 20px; color: var(--text-primary);">
            <h4 style="display:flex; align-items:center; gap:8px; font-size:14px; margin-bottom:8px; color: var(--warning);">
                <i class="ri-alert-line"></i> Integração de Boletos em Homologação
            </h4>
            <p style="font-size: 12px; line-height: 1.5;">
                O sistema de registro automático de boletos com instrução de protesto está estruturado e homologado com a API bancária. A ativação está pendente de assinatura do contrato de cobrança com o banco parceiro.
            </p>
        </div>

        <h4 style="font-size:13px; font-weight:600; margin-bottom:12px; text-transform:uppercase; color:var(--accent);">Dados Mapeados para Cobrança:</h4>
        <div class="detail-grid" style="margin-bottom: 20px;">
            <div class="detail-item"><label>Sacado / Parceiro</label><strong>${partner ? partner.nome : '—'}</strong></div>
            <div class="detail-item"><label>CNPJ / CPF</label><span>${partner ? partner.cnpj : '—'}</span></div>
            <div class="detail-item"><label>Valor de Vencimento</label><strong style="color: var(--success);">${formatCurrency(f.valorTotal)}</strong></div>
            <div class="detail-item"><label>Referência de Fatura</label><span>${f.codigo}</span></div>
            <div class="detail-item"><label>Vencimento Estimado</label><span>${formatDateBr(new Date(new Date().getTime() + 5*24*60*60*1000).toISOString())}</span></div>
            <div class="detail-item"><label>Status do Boleto</label><span style="font-weight: 700; color: ${statusColor};">${statusBoleto.toUpperCase()}</span></div>
        </div>

        ${statusBoleto === 'Gerado' ? `
            <div class="form-group" style="background: var(--bg-primary); border: 1px solid var(--border); padding: 12px; border-radius: var(--radius-sm); font-family: monospace; font-size: 11px; word-break: break-all; margin-bottom: 20px;">
                <label style="font-family: 'Outfit'; font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; display: block;">LINHA DIGITÁVEL DO BOLETO</label>
                34191.79001 01043.513184 91020.150008 7 982500000${Math.floor(f.valorTotal).toString().padStart(5, '0')}
            </div>
        ` : ''}
    `;

    document.getElementById('detalhes-os-footer').innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="closeOSModal()">Fechar</button>
        ${actionButton}
    `;
    modal.classList.add('active');
}

function simulateGenerateBoleto(invoiceId) {
    const f = db.faturas.find(x => x.id === invoiceId);
    if (!f) return;

    f.statusBoleto = "Gerado";
    f.boletoVencimento = new Date(new Date().getTime() + 5*24*60*60*1000).toISOString().split('T')[0];
    saveDatabase();

    showToast(`Boleto para fatura ${f.codigo} gerado com sucesso (modo simulação).`, "success");
    logAudit("Simulação Boleto", `Gerou boleto para fatura ${f.codigo}.`);
    
    renderFatFaturas();
    openBoletoModal(invoiceId);
}

function simulatePayBoleto(invoiceId) {
    const f = db.faturas.find(x => x.id === invoiceId);
    if (!f) return;

    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) {
        showToast("Erro: É necessário que o caixa de hoje esteja ABERTO para liquidar o boleto da fatura.", "error");
        return;
    }

    f.statusBoleto = "Pago";
    saveDatabase();

    showToast(`Boleto da fatura ${f.codigo} pago (modo simulação).`, "success");
    logAudit("Simulação Boleto", `Liquidou boleto referente à fatura ${f.codigo}.`);

    liquidateInvoiceDirect(invoiceId);

    renderFatFaturas();
    closeOSModal();
}

function liquidateInvoiceDirect(invoiceId) {
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;

    const invoice = db.faturas.find(f => f.id === invoiceId);
    if (!invoice || invoice.pago) return;

    invoice.pago = true;
    invoice.pagoEm = new Date().toISOString();

    invoice.ordensIds.forEach(id => {
        const os = db.ordens_servico.find(o => o.id === id);
        if (os) os.pago = true;
    });

    const partner = db.parceiros.find(p => p.id === invoice.parceiroId);
    db.caixa_movimentos.push({
        id: db.caixa_movimentos.length + 1,
        caixaId: activeCaixa.id,
        tipo: "entrada",
        valor: invoice.valorTotal,
        descricao: `Recebimento Fatura (Boleto) ${invoice.codigo} — ${partner.nome}`,
        formaPagamento: "pix",
        data: new Date().toISOString(),
        operador: currentSession.nome,
        osId: null,
        faturaId: invoice.id
    });

    saveDatabase();
}

// Global mobile sidebar helper
function toggleSidebarMobile() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
    if (overlay) {
        overlay.classList.toggle('active');
    }
}

