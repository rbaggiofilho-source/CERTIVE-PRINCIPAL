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

window.modoDiaReaberto = localStorage.getItem('certive_modoDiaReaberto') === 'true';
window.dataDiaReaberto = localStorage.getItem('certive_dataDiaReaberto');
window.caixaReabertoId = localStorage.getItem('certive_caixaReabertoId') ? parseInt(localStorage.getItem('certive_caixaReabertoId')) : null;

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
                endereco: "Rodovia BR 101 SN BOX 10, Anexo ao Mundo Car Mais Shopping, Bairro Kobrasol - São José CEP 88102-700",
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
            { servicoId: 1, taxa: 27.00, tax: 27.00 }, // Transferência Pequeno
            { servicoId: 2, taxa: 27.00, tax: 27.00 }, // Transferência Médio
            { servicoId: 3, taxa: 27.00, tax: 27.00 }, // Transferência Grande
            { servicoId: 4, taxa: 10.00, tax: 10.00 }, // Cautelar
            { servicoId: 5, taxa: 5.00, tax: 5.00 },  // Pesquisa
            { servicoId: 6, taxa: 0.00, tax: 0.00 }   // Exótico
        ];

        // 4. Seed Operators (Operadores e Permissões)
        db.operadores = [
            { id: 1, nome: "Ricardo Administrador", login: "admin", senha: "admin123", funcao: "Gerente Geral", unidadeId: 1, permissoes: ["abertura_os", "caixa", "faturamento", "contas", "cadastros", "bi", "registrar_cautelar", "finalizar_cautelar", "cautelar_administrar"], ativo: true },
            { id: 2, nome: "Ana Atendente", login: "atendente", senha: "atendente123", funcao: "Atendente", unidadeId: 1, permissoes: ["abertura_os", "caixa", "registrar_cautelar", "finalizar_cautelar"], ativo: true },
            { id: 3, nome: "Carlos Financeiro", login: "financeiro", senha: "financeiro123", funcao: "Analista Financeiro", unidadeId: 1, permissoes: ["caixa", "faturamento", "contas"], ativo: true },
            { id: 4, nome: "Jonas Kroll", login: "Jkroll", senha: "070142", funcao: "Gerente Geral", unidadeId: 1, permissoes: ["abertura_os", "caixa", "faturamento", "contas", "cadastros", "bi", "registrar_cautelar", "finalizar_cautelar", "cautelar_administrar"], ativo: true },
            { id: 5, nome: "Romano Gonzales Mendes", login: "Rgmendes", senha: "135586", funcao: "Gerente Geral", unidadeId: 1, permissoes: ["abertura_os", "caixa", "faturamento", "contas", "cadastros", "bi", "registrar_cautelar", "finalizar_cautelar", "cautelar_administrar"], ativo: true },
            { id: 6, nome: "Pedro Vistoriador Júnior", login: "vistoriador", senha: "vistoriador123", funcao: "Vistoriador de Campo", unidadeId: 1, permissoes: ["registrar_cautelar"], ativo: true },
            { id: 7, nome: "Silvio Vistoriador Sênior", login: "senior", senha: "senior123", funcao: "Vistoriador Sênior", unidadeId: 1, permissoes: ["registrar_cautelar", "finalizar_cautelar", "cautelar_administrar"], ativo: true }
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
            db.unidades.forEach(async u => {
                if (u.id === 1) {
                    u.nome = "Certive Matriz — São José";
                    u.endereco = "Rodovia BR 101 SN BOX 10, Anexo ao Mundo Car Mais Shopping, Bairro Kobrasol - São José CEP 88102-700";
                    u.razao_social = "Certive Vistorias Automotivas Ltda";
                    u.cnpj = "45.890.122/0001-08";
                    u.credenciamento = "ECV-2023-091";
                    u.cidade = "São José";
                    u.uf = "SC";
                    u.canal_ouvidoria = "ouvidoria@certive.com.br";
                    if (window.useSupabase) {
                        try {
                            await sbUpdate('unidades', u.id, { endereco: u.endereco });
                        } catch (e) {
                            console.error("Erro ao atualizar endereço da matriz no Supabase:", e);
                        }
                    }
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
    try {
        localStorage.setItem('certive_db', JSON.stringify(db));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            console.warn("localStorage quota exceeded! Starting database optimization...");
            
            // 1. Limpa auditoria antiga (mantém apenas as últimas 50 entradas)
            if (db.auditoria && db.auditoria.length > 50) {
                db.auditoria = db.auditoria.slice(-50);
            }
            
            // 2. Otimização de fotos: remove Base64 local se a foto já tiver URL pública na nuvem (http/https)
            if (db.cautelares_fotos && db.cautelares_fotos.length > 0) {
                let cleanedCount = 0;
                db.cautelares_fotos.forEach(f => {
                    const isUploaded = (f.urlOriginal && f.urlOriginal.startsWith('http')) || (f.url_original && f.url_original.startsWith('http'));
                    if (isUploaded) {
                        if (f.urlThumb && f.urlThumb.startsWith('data:image')) {
                            f.urlThumb = '';
                            cleanedCount++;
                        }
                        if (f.urlOriginal && f.urlOriginal.startsWith('data:image')) {
                            f.urlOriginal = '';
                        }
                        if (f.url_thumb && f.url_thumb.startsWith('data:image')) {
                            f.url_thumb = '';
                            cleanedCount++;
                        }
                        if (f.url_original && f.url_original.startsWith('data:image')) {
                            f.url_original = '';
                        }
                    }
                });
                console.log(`Cleaned ${cleanedCount} Base64 thumbnails from cache.`);
            }
            
            // 3. Limpa Base64 de fotos de vistorias finalizadas/concluídas
            const activeCautelarIds = (db.cautelares || [])
                .filter(c => c.status !== 'finalizado' && c.status !== 'concluido')
                .map(c => c.id);
            
            if (db.cautelares_fotos) {
                db.cautelares_fotos.forEach(f => {
                    const secao = (db.cautelares_secoes || []).find(s => s.id === f.secaoId);
                    const parentId = secao ? secao.cautelarId : null;
                    
                    if (parentId && !activeCautelarIds.includes(parentId)) {
                        if (f.urlThumb && f.urlThumb.startsWith('data:image')) f.urlThumb = '';
                        if (f.urlOriginal && f.urlOriginal.startsWith('data:image')) f.urlOriginal = '';
                        if (f.url_thumb && f.url_thumb.startsWith('data:image')) f.url_thumb = '';
                        if (f.url_original && f.url_original.startsWith('data:image')) f.url_original = '';
                    }
                });
            }

            // 4. Tenta salvar novamente após a otimização
            try {
                localStorage.setItem('certive_db', JSON.stringify(db));
                console.log("Database saved successfully after optimization!");
            } catch (retryErr) {
                console.error("Soft cleanup failed, executing aggressive database truncation...", retryErr);
                
                // Limpeza agressiva: zera toda a auditoria e limpa TODOS os Base64 locais
                db.auditoria = [];
                if (db.cautelares_fotos) {
                    db.cautelares_fotos.forEach(f => {
                        if (f.urlThumb && f.urlThumb.startsWith('data:image')) f.urlThumb = '';
                        if (f.urlOriginal && f.urlOriginal.startsWith('data:image')) f.urlOriginal = '';
                        if (f.url_thumb && f.url_thumb.startsWith('data:image')) f.url_thumb = '';
                        if (f.url_original && f.url_original.startsWith('data:image')) f.url_original = '';
                    });
                }
                
                // Remove vistorias finalizadas antigas do banco local
                if (db.cautelares && db.cautelares.length > 5) {
                    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                    db.cautelares = db.cautelares.filter(c => {
                        const date = new Date(c.criadoEm || c.criado_em).getTime();
                        return c.status !== 'finalizado' || date > sevenDaysAgo;
                    });
                }

                try {
                    localStorage.setItem('certive_db', JSON.stringify(db));
                    console.log("Database saved successfully after aggressive cleanup!");
                } catch (aggErr) {
                    console.error("Critical: LocalStorage database write failed even after aggressive truncation!", aggErr);
                }
            }
        } else {
            console.error("Error writing to localStorage:", e);
        }
    }
}

function loadDatabase() {
    db = JSON.parse(localStorage.getItem('certive_db') || '{}');
    db.unidades = db.unidades || [];
    db.servicos = db.servicos || [];
    db.taxas_referencia = db.taxas_referencia || [];
    db.operadores = db.operadores || [];
    db.parceiros = db.parceiros || [];
    db.ordens_servico = db.ordens_servico || [];
    db.caixa_diario = db.caixa_diario || [];
    db.caixa_movimentos = db.caixa_movimentos || [];
    db.contas_pagar = db.contas_pagar || [];
    db.faturas = db.faturas || [];
    db.auditoria = db.auditoria || [];
    db.solicitantes_parceiros = db.solicitantes_parceiros || [];
    db.cautelares = db.cautelares || [];
    db.cautelares_secoes = db.cautelares_secoes || [];
    db.cautelares_fotos = db.cautelares_fotos || [];
    db.cautelares_pesquisas = db.cautelares_pesquisas || [];

    // Garantir permissões das cautelares nos perfis locais (migração de LocalStorage/Supabase)
    let dbUpdated = false;
    db.operadores.forEach(op => {
        op.permissoes = op.permissoes || [];
        if (op.funcao === "Gerente Geral") {
            const required = ["registrar_cautelar", "finalizar_cautelar", "cautelar_administrar"];
            required.forEach(p => {
                if (!op.permissoes.includes(p)) {
                    op.permissoes.push(p);
                    dbUpdated = true;
                }
            });
        } else if (op.funcao === "Atendente") {
            const required = ["registrar_cautelar", "finalizar_cautelar"];
            required.forEach(p => {
                if (!op.permissoes.includes(p)) {
                    op.permissoes.push(p);
                    dbUpdated = true;
                }
            });
        } else if (op.funcao === "Vistoriador de Campo" || op.funcao === "Vistoriador Sênior") {
            if (!op.permissoes.includes("registrar_cautelar")) {
                op.permissoes.push("registrar_cautelar");
                dbUpdated = true;
            }
            if (op.funcao === "Vistoriador Sênior" && !op.permissoes.includes("finalizar_cautelar")) {
                op.permissoes.push("finalizar_cautelar");
                dbUpdated = true;
            }
        }
    });

    if (dbUpdated) {
        saveDatabase();
    }

    // Complementary Cautelares seed for testing
    if (db.cautelares.length === 0) {
        setTimeout(() => {
            if (typeof seedCautelares === 'function') seedCautelares();
        }, 100);
    }
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
function parseDividedPayment(obsText) {
    if (!obsText) return null;
    const match = obsText.match(/\[PAG_DIVIDIDO: ([^\]]+)\]/);
    if (!match) return null;
    const parts = match[1].split(';');
    const result = [];
    parts.forEach(p => {
        const kv = p.split('=');
        if (kv.length === 2) {
            result.push({
                forma: kv[0],
                valor: parseFloat(kv[1])
            });
        }
    });
    return result.length === 2 ? result : null;
}

function removeDividedPaymentTag(obsText) {
    if (!obsText) return '';
    return obsText.replace(/\[PAG_DIVIDIDO: [^\]]+\]/, '').trim();
}

function formatCurrency(val) {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(isoString) {
    if (!isoString) return "—";
    // Se for formato de data simples YYYY-MM-DD (do tipo DATE no PostgreSQL)
    if (typeof isoString === 'string' && isoString.length === 10 && isoString.includes('-') && !isoString.includes('T')) {
        const parts = isoString.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
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
        
        // Sincroniza permissões da sessão com o operador atualizado no banco
        if (db && db.operadores) {
            const matchedOp = db.operadores.find(o => o.id === currentSession.id);
            if (matchedOp) {
                currentSession.permissoes = matchedOp.permissoes || [];
                sessionStorage.setItem('certive_session', JSON.stringify(currentSession));
            }
        }

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
        if (typeof updateCautelarPendingBadge === 'function') {
            updateCautelarPendingBadge();
        }
        
        // Direct to first permitted page
        if (currentSession.permissoes.includes("abertura_os")) {
            navigateTo('atendimento');
        } else if (currentSession.permissoes.includes("registrar_cautelar")) {
            navigateTo('registrar-cautelar');
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

    if (!db || !db.operadores) {
        showToast("Conectando ao banco de dados... Aguarde um instante e tente novamente.", "info");
        return;
    }

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
        'nav-registrar-cautelar': 'registrar_cautelar',
        'nav-caixa': 'caixa',
        'nav-historico': 'caixa',
        'nav-faturamento': 'faturamento',
        'nav-contas': 'contas',
        'nav-bi': 'bi',
        'nav-config': 'cadastros'
    };

    const isGerenteGeral = currentSession && currentSession.funcao && currentSession.funcao.toLowerCase().includes("gerente");

    for (const [navId, permission] of Object.entries(navItems)) {
        const element = document.getElementById(navId);
        if (element) {
            if (isGerenteGeral || (currentSession.permissoes && currentSession.permissoes.includes(permission))) {
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
    
    if (typeof updateCautelarPendingBadge === 'function') {
        updateCautelarPendingBadge();
    }
    
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
        'registrar-cautelar': 'registrar_cautelar',
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
    } else if (pageId === 'registrar-cautelar') {
        renderRegistrarCautelarPage();
    } else if (pageId === 'caixa') {
        if (window.useSupabase) {
            // Sincronizar em tempo real caixas e movimentos antes de renderizar
            Promise.all([
                sbSelectAll('caixa_diario', 'id', true),
                sbSelectAll('caixa_movimentos', 'id', true)
            ]).then(([caixas, movimentos]) => {
                db.caixa_diario = caixas || [];
                db.caixa_movimentos = movimentos || [];
                db.caixa_diario.forEach(c => normalizeRecord('caixa_diario', c));
                db.caixa_movimentos.forEach(m => normalizeRecord('caixa_movimentos', m));
                renderCaixaPage();
            }).catch(err => {
                console.error("Erro ao sincronizar caixas/movimentos:", err);
                renderCaixaPage();
            });
        } else {
            renderCaixaPage();
        }
    } else if (pageId === 'historico') {
        if (window.useSupabase) {
            sbSelectAll('ordens_servico', 'id', true).then(osList => {
                db.ordens_servico = osList || [];
                db.ordens_servico.forEach(o => normalizeRecord('ordens_servico', o));
                renderHistoricoPage();
            }).catch(err => {
                console.error("Erro ao sincronizar histórico de OS:", err);
                renderHistoricoPage();
            });
        } else {
            renderHistoricoPage();
        }
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
    const today = getOperativeDate();
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
        document.getElementById('form-group-solicitante-recorrente').style.display = 'none';
        optFaturamento.disabled = true;
        if (paymentSelect.value === 'faturamento') paymentSelect.value = 'pix';
        valWarning.textContent = "Tabela de balcão. Valor editável pelo atendente.";
        priceInput.disabled = false;
    } else {
        partnerSelectGroup.style.display = 'block';
        valWarning.textContent = "Preço pré-definido em contrato com parceiro. Não negociável no balcão.";
        const selectedSvc = db.servicos.find(s => s.id === currentSelectedServiceId);
        const isSupercar = selectedSvc && selectedSvc.nome.toUpperCase().includes('SUPERCARRO');
        priceInput.disabled = (currentSelectedServiceId !== 6 && !isSupercar);
    }

    renderOSFormServices();
}

function loadPartnersDropdown() {
    const select = document.getElementById('os-parceiro-select');
    // Ordenação alfabética obrigatória (Item B)
    const list = [...db.parceiros].sort((a, b) => a.nome.localeCompare(b.nome));
    select.innerHTML = '<option value="">Selecione o parceiro...</option>' + 
        list.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
}

function loadPartnerServices(partnerId) {
    const optFaturamento = document.getElementById('opt-pagamento-faturamento');
    const paymentSelect = document.getElementById('os-pagamento');
    
    // Carregar solicitantes recorrentes vinculados ao parceiro (Item C)
    loadPartnerRecurringSolicitors(partnerId);

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

// ---- SOLICITANTES RECORRENTES VINCULADOS AO PARCEIRO (Item C) ----

function loadPartnerRecurringSolicitors(partnerId) {
    const group = document.getElementById('form-group-solicitante-recorrente');
    const select = document.getElementById('os-solicitante-recorrente-select');
    const btnDelete = document.getElementById('btn-delete-solicitante');

    if (!partnerId) {
        group.style.display = 'none';
        select.innerHTML = '<option value="">SELECIONE UM SOLICITANTE RECORRENTE...</option>';
        btnDelete.style.display = 'none';
        return;
    }

    const pId = parseInt(partnerId);
    const list = (db.solicitantes_parceiros || []).filter(s => s.parceiroId === pId);

    // Ordenar por nome em ordem alfabética
    list.sort((a, b) => a.nome.localeCompare(b.nome));

    select.innerHTML = '<option value="">SELECIONE UM SOLICITANTE RECORRENTE...</option>' +
        list.map(s => `<option value="${s.id}">${s.nome.toUpperCase()} (CPF/CNPJ: ${s.cpf})</option>`).join('');

    group.style.display = 'block';
    btnDelete.style.display = 'none';
    
    // Desmarcar por padrão
    document.getElementById('os-salvar-recorrente').checked = false;
}

function selectRecurringSolicitor(solicitanteId) {
    const btnDelete = document.getElementById('btn-delete-solicitante');
    if (!solicitanteId) {
        document.getElementById('os-nome-cliente').value = '';
        document.getElementById('os-cpf-cliente').value = '';
        document.getElementById('os-celular-cliente').value = '';
        btnDelete.style.display = 'none';
        return;
    }

    const sol = (db.solicitantes_parceiros || []).find(s => s.id === parseInt(solicitanteId));
    if (sol) {
        document.getElementById('os-nome-cliente').value = sol.nome;
        document.getElementById('os-cpf-cliente').value = sol.cpf;
        document.getElementById('os-celular-cliente').value = sol.celular;
        btnDelete.style.display = 'inline-flex';
    }
}

async function deleteSelectedSolicitor() {
    const select = document.getElementById('os-solicitante-recorrente-select');
    const solicitanteId = parseInt(select.value);
    if (!solicitanteId) return;

    if (!isMasterSession()) {
        showToast("ERRO: APENAS OPERADORES MASTER PODEM REMOVER SOLICITANTES RECORRENTES.", "error");
        return;
    }

    const sol = (db.solicitantes_parceiros || []).find(s => s.id === solicitanteId);
    if (!sol) return;

    if (confirm(`DESEJA REMOVER O SOLICITANTE "${sol.nome.toUpperCase()}" DA LISTA DE RECORRENTES DESTE PARCEIRO?`)) {
        try {
            await dbSave('solicitantes_parceiros', null, 'delete', sol.id);
            db.solicitantes_parceiros = db.solicitantes_parceiros.filter(s => s.id !== sol.id);
            
            showToast("SOLICITANTE RECORRENTE REMOVIDO COM SUCESSO!", "success");
            
            const partnerId = document.getElementById('os-parceiro-select').value;
            loadPartnerRecurringSolicitors(partnerId);
            
            document.getElementById('os-nome-cliente').value = '';
            document.getElementById('os-cpf-cliente').value = '';
            document.getElementById('os-celular-cliente').value = '';
        } catch (err) {
            console.error(err);
            showToast("ERRO AO REMOVER SOLICITANTE RECORRENTE.", "error");
        }
    }
}

function renderOSFormServices() {
    const container = document.getElementById('service-selector');
    const partnerId = parseInt(document.getElementById('os-parceiro-select').value);
    const partner = partnerId ? db.parceiros.find(p => p.id === partnerId) : null;

    // Determinar os IDs de serviços disponíveis com base no tipo de cliente (Item A.2)
    let allowedServiceIds = [];
    if (currentClientType === 'particular') {
        allowedServiceIds = [1, 2, 3, 4, 5, 6, 9, 10];
    } else {
        allowedServiceIds = [1, 2, 3, 4, 7, 8, 5, 9, 10];
    }

    const filteredServices = db.servicos.filter(s => allowedServiceIds.includes(s.id));
    filteredServices.sort((a, b) => allowedServiceIds.indexOf(a.id) - allowedServiceIds.indexOf(b.id));

    container.innerHTML = filteredServices.map(s => {
        let price = s.precoBalcao;
        if (currentClientType === 'parceiro' && partner) {
            if (s.id === 7) {
                // Vistoria Combo (Item A.3)
                price = partner.precoCombo !== undefined ? partner.precoCombo : s.precoBalcao;
            } else if (s.id === 8) {
                // Vistoria de Transferência Combo (Item A.3)
                price = partner.precoComboTransferencia !== undefined ? partner.precoComboTransferencia : s.precoBalcao;
            } else {
                price = partner.tabelaPrecos[s.id] !== undefined ? partner.tabelaPrecos[s.id] : s.precoBalcao;
            }
        }

        const iconClass = s.categoria === 'Transferência' 
            ? 'ri-car-line' 
            : (s.categoria === 'Cautelar' 
                ? 'ri-shield-check-line' 
                : (s.categoria === 'Exótico' 
                    ? 'ri-vip-crown-line' 
                    : 'ri-search-eye-line'));
        
        const isSupercar = s.nome.toUpperCase().includes('SUPERCARRO');
        const priceLabel = (s.id === 6 || isSupercar) ? 'A NEGOCIAR' : formatCurrency(price);
        
        let serviceName = s.nome.toUpperCase();
        // Ajustar nomenclaturas quando o tipo de cliente for parceiro (Item A.2)
        if (currentClientType === 'parceiro') {
            if (s.id === 4) {
                serviceName = "VISTORIA CAUTELAR AVULSA";
            } else if (s.id === 7) {
                serviceName = "VISTORIA COMBO";
            } else if (s.id === 8) {
                serviceName = "VISTORIA DE TRANSFERÊNCIA COMBO";
            }
        }
        
        return `
            <input type="radio" name="os-servico" id="svc-${s.id}" value="${s.id}" style="display: none;" onchange="selectService(${s.id}, ${price})">
            <label for="svc-${s.id}" class="service-option" id="lbl-svc-${s.id}">
                <div class="service-icon"><i class="${iconClass}"></i></div>
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
    const service = db.servicos.find(s => s.id === id);
    const isSupercar = service && service.nome.toUpperCase().includes('SUPERCARRO');
    
    if (id === 6 || isSupercar) {
        priceInput.value = '';
        priceInput.disabled = false;
        priceInput.placeholder = 'DIGITE O VALOR ACORDADO';
    } else {
        priceInput.value = price.toFixed(2);
        priceInput.disabled = (currentClientType === 'parceiro');
        priceInput.placeholder = '0,00';
    }
}

function toggleInstallmentsNewOS() {
    const pag = document.getElementById('os-pagamento').value;
    const group = document.getElementById('os-parcelas-group');
    const divGroup = document.getElementById('os-dividido-group');
    
    if (pag === 'credito_parcelado') {
        group.style.display = 'block';
        if (divGroup) divGroup.style.display = 'none';
    } else if (pag === 'dividido') {
        group.style.display = 'none';
        if (divGroup) {
            divGroup.style.display = 'block';
            const totalVal = parseFloat(document.getElementById('os-valor').value) || 0;
            if (totalVal > 0) {
                document.getElementById('os-div-valor-1').value = (totalVal / 2).toFixed(2);
                document.getElementById('os-div-valor-2').value = (totalVal / 2).toFixed(2);
            } else {
                document.getElementById('os-div-valor-1').value = '';
                document.getElementById('os-div-valor-2').value = '';
            }
        }
    } else {
        group.style.display = 'none';
        if (divGroup) divGroup.style.display = 'none';
    }
}

function toggleInstallmentsEditOS() {
    const pag = document.getElementById('edit-os-pagamento').value;
    const group = document.getElementById('edit-os-parcelas-group');
    const divGroup = document.getElementById('edit-os-dividido-group');
    
    if (pag === 'credito_parcelado') {
        group.style.display = 'block';
        if (divGroup) divGroup.style.display = 'none';
    } else if (pag === 'dividido') {
        group.style.display = 'none';
        if (divGroup) {
            divGroup.style.display = 'block';
            const totalVal = parseFloat(document.getElementById('edit-os-valor').value) || 0;
            if (totalVal > 0) {
                document.getElementById('edit-os-div-valor-1').value = (totalVal / 2).toFixed(2);
                document.getElementById('edit-os-div-valor-2').value = (totalVal / 2).toFixed(2);
            } else {
                document.getElementById('edit-os-div-valor-1').value = '';
                document.getElementById('edit-os-div-valor-2').value = '';
            }
        }
    } else {
        group.style.display = 'none';
        if (divGroup) divGroup.style.display = 'none';
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
    
    // Limpar campos divididos
    document.getElementById('os-div-valor-1').value = '';
    document.getElementById('os-div-valor-2').value = '';
    document.getElementById('os-div-forma-1').value = 'pix';
    document.getElementById('os-div-forma-2').value = 'especie';
    const osDivididoGroup = document.getElementById('os-dividido-group');
    if (osDivididoGroup) osDivididoGroup.style.display = 'none';
    
    // Limpar campos do solicitante recorrente
    document.getElementById('os-salvar-recorrente').checked = false;
    document.getElementById('os-solicitante-recorrente-select').innerHTML = '<option value="">Selecione um solicitante recorrente...</option>';
    
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

        let finalObs = obs;
        if (pagamento === 'dividido') {
            const f1 = document.getElementById('os-div-forma-1').value;
            const v1 = parseFloat(document.getElementById('os-div-valor-1').value) || 0;
            const f2 = document.getElementById('os-div-forma-2').value;
            const v2 = parseFloat(document.getElementById('os-div-valor-2').value) || 0;
            
            if (v1 <= 0 || v2 <= 0) {
                showToast("Por favor, preencha ambos os valores parciais do pagamento dividido.", "error");
                return;
            }
            
            if (Math.abs((v1 + v2) - valor) > 0.01) {
                showToast(`A soma dos valores (R$ ${v1.toFixed(2)} + R$ ${v2.toFixed(2)} = R$ ${(v1+v2).toFixed(2)}) deve ser exatamente igual ao valor total do serviço (R$ ${valor.toFixed(2)}).`, "error");
                return;
            }
            
            finalObs += `\n[PAG_DIVIDIDO: ${f1}=${v1};${f2}=${v2}]`;
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

        // Determinar o nome final do serviço de acordo com as regras de parceiro (Item A.2)
        let finalServiceName = service.nome.toUpperCase();
        if (currentClientType === 'parceiro') {
            if (service.id === 4) {
                finalServiceName = "VISTORIA CAUTELAR AVULSA";
            } else if (service.id === 7) {
                finalServiceName = "VISTORIA COMBO";
            } else if (service.id === 8) {
                finalServiceName = "VISTORIA DE TRANSFERÊNCIA COMBO";
            }
        }

        // Build OS
        const newOS = {
            id: osId,
            numero: num,
            criadoEm: window.modoDiaReaberto && window.dataDiaReaberto
                ? window.dataDiaReaberto + "T" + new Date().toTimeString().split(' ')[0] + ".000Z"
                : new Date().toISOString(),
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
            servicoNome: finalServiceName,
            valor: valor,
            observacoes: finalObs,
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
        const today = getOperativeDate();
        filteredOSs = db.ordens_servico.filter(o => o.unidadeId === activeUnitId && o.criadoEm.startsWith(today));
    }

    const listContainer = document.getElementById('recent-services-list');
    if (!listContainer) return;

    if (filteredOSs.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--text-muted);">${searchVal ? 'Nenhum serviço encontrado para esta busca.' : 'Nenhum serviço registrado nesta data.'}</td></tr>`;
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

    // Se for de parceiro e reprovado (approved === false)
    if (os.clienteTipo === 'parceiro' && !approved) {
        const aplicarDesconto = confirm("Esta vistoria foi REPROVADA e o cliente é um lojista parceiro.\nDeseja aplicar o desconto comercial de 50% nesta OS?");
        if (aplicarDesconto) {
            const valorOriginal = os.valor;
            os.valor = parseFloat((valorOriginal * 0.5).toFixed(2));
            os.observacoes = (os.observacoes ? os.observacoes + " | " : "") + `Desconto comercial de 50% aplicado (Cautelar Reprovada). Valor original: R$ ${valorOriginal.toFixed(2)}`;
            
            // Se a OS já estiver paga (Pix/Dinheiro), atualizar o valor no caixa diário
            if (os.pago && os.formaPagamento !== 'faturamento') {
                const mov = db.caixa_movimentos.find(m => m.osId === os.id && m.tipo === 'entrada');
                if (mov) {
                    mov.valor = os.valor;
                    dbSave('caixa_movimentos', { valor: mov.valor }, 'update', mov.id).catch(e => console.error("Erro ao atualizar movimento de caixa:", e));
                }
            }
        }
    }

    // Save final status
    os.status = approved ? "concluida_aprovada" : "concluida_reprovada";
    os.finalizadoEm = new Date().toISOString();
    os.finalizadoPor = currentSession.nome;

    dbSave('ordens_servico', {
        status: os.status,
        valor: os.valor,
        observacoes: os.observacoes,
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

    let cobrancaLabel = os.formaPagamento.toUpperCase();
    if (os.formaPagamento === 'credito_parcelado') {
        cobrancaLabel = `CRÉDITO PARCELADO (${os.parcelas}x)`;
    } else if (os.formaPagamento === 'dividido') {
        const splitData = parseDividedPayment(os.observacoes);
        if (splitData) {
            cobrancaLabel = `DIVIDIDO (${splitData[0].forma.toUpperCase()}: R$ ${splitData[0].valor.toFixed(2)} / ${splitData[1].forma.toUpperCase()}: R$ ${splitData[1].valor.toFixed(2)})`;
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
            <div class="detail-item"><label>Cobrança</label><span>${cobrancaLabel}</span></div>
            <div class="detail-item"><label>DETRAN-SC Registrada</label><span>${os.detranRegistrado ? '🟢 Registrada' : '🔴 Não Registrada'}</span></div>
            <div class="detail-item"><label>Status NFS-e</label><span style="font-weight: 700; color: ${os.statusNfse === 'Emitida' ? 'var(--success)' : (os.statusNfse === 'Pendente de emissão' ? 'var(--warning)' : 'var(--text-secondary)')};">${os.statusNfse || 'Não solicitada'}</span></div>
            <div class="detail-item"><label>Detalhes NFS-e</label><span>${os.numeroNfse ? `Nº ${os.numeroNfse} (${formatDateBr(os.dataNfse)})` : '—'}</span></div>
            <div class="detail-item" style="grid-column: span 2;"><label>Observações do Veículo (Modelo, Ano, Cor)</label><span>${removeDividedPaymentTag(os.observacoes) || '—'}</span></div>
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
        footerHtml += `<button class="btn btn-warning" onclick="openChangePaymentModal(${os.id})"><i class="ri-wallet-3-line"></i> Alterar Forma de Pagamento</button>`;
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

    // Se for de parceiro e reprovado (approved === false)
    if (os.clienteTipo === 'parceiro' && !approved) {
        const aplicarDesconto = confirm("Esta vistoria foi REPROVADA e o cliente é um lojista parceiro.\nDeseja aplicar o desconto comercial de 50% nesta OS?");
        if (aplicarDesconto) {
            const valorOriginal = os.valor;
            os.valor = parseFloat((valorOriginal * 0.5).toFixed(2));
            os.observacoes = (os.observacoes ? os.observacoes + " | " : "") + `Desconto comercial de 50% applied (Cautelar Reprovada). Valor original: R$ ${valorOriginal.toFixed(2)}`;
            
            // Se a OS já estiver paga (Pix/Dinheiro), atualizar o valor no caixa diário
            if (os.pago && os.formaPagamento !== 'faturamento') {
                const mov = db.caixa_movimentos.find(m => m.osId === os.id && m.tipo === 'entrada');
                if (mov) {
                    mov.valor = os.valor;
                    dbSave('caixa_movimentos', { valor: mov.valor }, 'update', mov.id).catch(e => console.error("Erro ao atualizar movimento de caixa:", e));
                }
            }
        }
    }

    os.status = approved ? "concluida_aprovada" : "concluida_reprovada";
    os.finalizadoEm = new Date().toISOString();
    os.finalizadoPor = currentSession.nome;

    dbSave('ordens_servico', {
        status: os.status,
        valor: os.valor,
        observacoes: os.observacoes,
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

    // Limpa campos divididos residuais de edições anteriores
    document.getElementById('edit-os-div-valor-1').value = '';
    document.getElementById('edit-os-div-valor-2').value = '';
    document.getElementById('edit-os-div-forma-1').value = 'pix';
    document.getElementById('edit-os-div-forma-2').value = 'especie';
    const editOsDivididoGroup = document.getElementById('edit-os-dividido-group');
    if (editOsDivididoGroup) editOsDivididoGroup.style.display = 'none';

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
    document.getElementById('edit-os-obs').value = removeDividedPaymentTag(os.observacoes);
    
    // Populate service dropdown
    const select = document.getElementById('edit-os-servico');
    if (select) {
        let allowedServiceIds = [];
        if (os.clienteTipo === 'particular') {
            allowedServiceIds = [1, 2, 3, 4, 5, 6, 9, 10];
        } else {
            allowedServiceIds = [1, 2, 3, 4, 7, 8, 5, 9, 10];
        }
        
        const filteredServices = db.servicos.filter(s => allowedServiceIds.includes(s.id));
        filteredServices.sort((a, b) => allowedServiceIds.indexOf(a.id) - allowedServiceIds.indexOf(b.id));

        select.innerHTML = filteredServices.map(s => {
            let name = s.nome.toUpperCase();
            if (os.clienteTipo === 'parceiro') {
                if (s.id === 4) name = "VISTORIA CAUTELAR AVULSA";
                else if (s.id === 7) name = "VISTORIA COMBO";
                else if (s.id === 8) name = "VISTORIA DE TRANSFERÊNCIA COMBO";
            }
            return `<option value="${s.id}">${name}</option>`;
        }).join('');
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

    if (os.formaPagamento === 'dividido') {
        const splitData = parseDividedPayment(os.observacoes);
        if (splitData) {
            document.getElementById('edit-os-div-forma-1').value = splitData[0].forma;
            document.getElementById('edit-os-div-valor-1').value = splitData[0].valor.toFixed(2);
            document.getElementById('edit-os-div-forma-2').value = splitData[1].forma;
            document.getElementById('edit-os-div-valor-2').value = splitData[1].valor.toFixed(2);
        }
    }
    toggleInstallmentsEditOS();

    document.getElementById('edit-os-detran').checked = os.detranRegistrado;
    
    const priceInput = document.getElementById('edit-os-valor');
    const service = db.servicos.find(s => s.id === os.servicoId);
    const isSupercar = service && service.nome.toUpperCase().includes('SUPERCARRO');
    if (os.servicoId === 6 || isSupercar) {
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
    const isSupercar = service.nome.toUpperCase().includes('SUPERCARRO');
    
    if (serviceId === 6 || isSupercar) {
        priceInput.disabled = false;
        priceInput.value = '';
        priceInput.placeholder = 'DIGITE O VALOR ACORDADO';
        return;
    }
    
    let price = service.precoBalcao;
    if (os.clienteTipo === 'parceiro' && os.parceiroId) {
        const partner = db.parceiros.find(p => p.id === os.parceiroId);
        if (partner) {
            if (serviceId === 7) {
                price = partner.precoCombo !== undefined ? partner.precoCombo : service.precoBalcao;
            } else if (serviceId === 8) {
                price = partner.precoComboTransferencia !== undefined ? partner.precoComboTransferencia : service.precoBalcao;
            } else {
                price = partner.tabelaPrecos[serviceId] !== undefined ? partner.tabelaPrecos[serviceId] : service.precoBalcao;
            }
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

    let finalObs = obs;
    if (pagamento === 'dividido') {
        const f1 = document.getElementById('edit-os-div-forma-1').value;
        const v1 = parseFloat(document.getElementById('edit-os-div-valor-1').value) || 0;
        const f2 = document.getElementById('edit-os-div-forma-2').value;
        const v2 = parseFloat(document.getElementById('edit-os-div-valor-2').value) || 0;
        
        if (v1 <= 0 || v2 <= 0) {
            showToast("Por favor, preencha ambos os valores parciais do pagamento dividido.", "error");
            return;
        }
        
        if (Math.abs((v1 + v2) - valor) > 0.01) {
            showToast(`A soma dos valores (R$ ${v1.toFixed(2)} + R$ ${v2.toFixed(2)} = R$ ${(v1+v2).toFixed(2)}) deve ser exatamente igual ao valor total do serviço (R$ ${valor.toFixed(2)}).`, "error");
            return;
        }
        
        finalObs += `\n[PAG_DIVIDIDO: ${f1}=${v1};${f2}=${v2}]`;
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
    os.observacoes = finalObs;
    os.servicoId = service.id;
    
    // Classificação dinâmica do serviço em CAPS LOCK na edição (Item A.2)
    let finalSvcName = service.nome.toUpperCase();
    if (os.clienteTipo === 'parceiro') {
        if (service.id === 4) finalSvcName = "VISTORIA CAUTELAR AVULSA";
        else if (service.id === 7) finalSvcName = "VISTORIA COMBO";
        else if (service.id === 8) finalSvcName = "VISTORIA DE TRANSFERÊNCIA COMBO";
    }
    os.servicoNome = finalSvcName;
    
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

    os.pago = (pagamento !== 'faturamento');

    // Sincronizar o Caixa Diário na Edição da OS
    const activeCaixa = getTodayOpenCaixa();

    try {
        // Deletar todas as movimentações de entrada do caixa associadas a esta OS e recriar
        const existingMovs = db.caixa_movimentos.filter(m => m.osId === os.id && m.tipo === 'entrada' && !m.faturaId);
        for (const m of existingMovs) {
            if (window.useSupabase) {
                await sbDeleteWhere('caixa_movimentos', 'id', m.id);
            }
            db.caixa_movimentos = db.caixa_movimentos.filter(x => x.id !== m.id);
        }

        if (os.reapresentacaoOrigemID) {
            // Se for reteste, não deve ter entrada no caixa diário.
        } else if (activeCaixa && os.pago) {
            if (os.formaPagamento === 'dividido') {
                const splitData = parseDividedPayment(os.observacoes);
                if (splitData) {
                    for (let i = 0; i < splitData.length; i++) {
                        const part = splitData[i];
                        const newMov = {
                            caixaId: activeCaixa.id,
                            tipo: "entrada",
                            valor: part.valor,
                            descricao: `[DIVIDIDO ${i+1}/2] Serviço ${(os.servicoNome || 'Vistoria').split(' — ')[0]} (Placa: ${os.placa})`,
                            formaPagamento: part.forma,
                            data: new Date().toISOString(),
                            operador: currentSession.nome,
                            osId: os.id,
                            faturaId: null
                        };
                        if (window.useSupabase) {
                            const insertedMov = await sbInsert('caixa_movimentos', newMov);
                            db.caixa_movimentos.unshift(insertedMov);
                        } else {
                            newMov.id = db.caixa_movimentos.length + 1;
                            db.caixa_movimentos.push(newMov);
                        }
                    }
                }
            } else {
                const newMov = {
                    caixaId: activeCaixa.id,
                    tipo: "entrada",
                    valor: os.valor,
                    descricao: `Serviço ${(os.servicoNome || 'VISTORIA').split(' — ')[0]} (Placa: ${os.placa})`,
                    formaPagamento: os.formaPagamento,
                    data: new Date().toISOString(),
                    operador: currentSession.nome,
                    osId: os.id,
                    faturaId: null
                };
                if (window.useSupabase) {
                    const insertedMov = await sbInsert('caixa_movimentos', newMov);
                    db.caixa_movimentos.unshift(insertedMov);
                } else {
                    newMov.id = db.caixa_movimentos.length + 1;
                    db.caixa_movimentos.push(newMov);
                }
            }
        }
    } catch (err) {
        console.error("Erro ao sincronizar movimentação de caixa da OS editada:", err);
    }

    await dbSave('ordens_servico', {
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
        pago: os.pago,
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
                    <option value="dividido">Dividido em 2 formas</option>
                    <option value="faturamento" id="opt-pagamento-faturamento" disabled>Faturamento Mensal (Apenas parceiros habilitados)</option>
                `;
            } else {
                // Fluxo padrão: Lançamento de Caixa (Tudo gera caixa, incluindo faturamento)
                if (os.formaPagamento === 'dividido') {
                    const splitData = parseDividedPayment(os.observacoes);
                    if (splitData) {
                        for (let i = 0; i < splitData.length; i++) {
                            const part = splitData[i];
                            const newMov = {
                                caixaId: activeCaixa.id,
                                tipo: "entrada",
                                valor: part.valor,
                                descricao: `[DIVIDIDO ${i+1}/2] Serviço ${(os.servicoNome || 'Vistoria').split(' — ')[0]} (Placa: ${os.placa})`,
                                formaPagamento: part.forma,
                                data: new Date().toISOString(),
                                operador: currentSession.nome,
                                osId: os.id,
                                faturaId: null
                            };
                            const insertedMov = await sbInsert('caixa_movimentos', newMov);
                            db.caixa_movimentos.unshift(insertedMov);
                        }
                    }
                } else {
                    const newMov = {
                        caixaId: activeCaixa.id,
                        tipo: "entrada",
                        valor: os.valor,
                        descricao: `Serviço ${(os.servicoNome || 'Vistoria').split(' — ')[0]} (Placa: ${os.placa})`,
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
                    <option value="dividido">Dividido em 2 formas</option>
                    <option value="faturamento" id="opt-pagamento-faturamento" disabled>Faturamento Mensal (Apenas parceiros habilitados)</option>
                `;
            } else {
                if (os.pago) {
                    os.status = "paga";
                    if (os.formaPagamento === 'dividido') {
                        const splitData = parseDividedPayment(os.observacoes);
                        if (splitData) {
                            for (let i = 0; i < splitData.length; i++) {
                                const part = splitData[i];
                                const movId = db.caixa_movimentos.length + 1;
                                db.caixa_movimentos.push({
                                    id: movId,
                                    caixaId: activeCaixa.id,
                                    tipo: "entrada",
                                    valor: part.valor,
                                    descricao: `[DIVIDIDO ${i+1}/2] Serviço ${os.servicoNome.split(' — ')[0]} (Placa: ${os.placa})`,
                                    formaPagamento: part.forma,
                                    data: new Date().toISOString(),
                                    operador: currentSession.nome,
                                    osId: os.id,
                                    faturaId: null
                                });
                            }
                        }
                    } else {
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
                }
                
                db.ordens_servico.unshift(os);
            }
            saveDatabase();
        }
        
        showToast(`O.S. registrada e contrato assinado! Código: ${os.numero}`, "success");
        logAudit("Abertura OS", `Abriu a ordem ${os.numero} com contrato firmado (Hash: ${signatureHash}).`);
        
        closeContratoModal();
        printContract(os);
        
        // Salvar Solicitante Recorrente (Item C)
        saveOSRecurringSolicitor(os);

        clearOSForm();
        renderAtendimentoPage();
    } catch (e) {
        console.error("Erro ao confirmar contrato e salvar O.S.:", e);
        alert("Ocorreu um erro ao confirmar o contrato e salvar a O.S.:\n" + e.message + "\n" + e.stack);
    }
}

// Auxiliar para salvar o solicitante recorrente
function saveOSRecurringSolicitor(os) {
    const salvarRecorrente = document.getElementById('os-salvar-recorrente').checked;
    if (os.clienteTipo === 'parceiro' && os.parceiroId && salvarRecorrente) {
        const exists = (db.solicitantes_parceiros || []).find(s => s.parceiroId === os.parceiroId && s.cpf === os.clienteCpfCnpj);
        if (!exists) {
            const newRecorrente = {
                parceiroId: os.parceiroId,
                nome: os.clienteNome.toUpperCase(),
                cpf: os.clienteCpfCnpj,
                celular: os.clienteCelular
            };
            
            dbSave('solicitantes_parceiros', newRecorrente, 'insert').then(inserted => {
                if (!db.solicitantes_parceiros) db.solicitantes_parceiros = [];
                const cacheExists = db.solicitantes_parceiros.find(s => s.id === inserted.id);
                if (!cacheExists) {
                    db.solicitantes_parceiros.push(inserted);
                }
                console.log('✅ Solicitante recorrente cadastrado com sucesso!');
            }).catch(err => {
                console.error('Erro ao salvar solicitante recorrente:', err);
            });
        }
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

// Retorna a data em formato YYYY-MM-DD considerando o fuso horário local do navegador
function getLocalDateString(dateInput) {
    const d = new Date(dateInput);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getOperativeDate() {
    if (window.modoDiaReaberto && window.dataDiaReaberto) {
        return window.dataDiaReaberto;
    }
    return getLocalDateString(new Date());
}

function getTodayOpenCaixa() {
    if (window.modoDiaReaberto && window.dataDiaReaberto) {
        return db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.data === window.dataDiaReaberto && c.status === "aberto");
    }
    // Busca o caixa aberto da unidade ativa com a data mais recente para evitar conflito com caixas antigos esquecidos abertos
    const openCaixas = db.caixa_diario.filter(c => c.unidadeId === activeUnitId && c.status === "aberto");
    if (openCaixas.length === 0) return null;
    return openCaixas.sort((a, b) => new Date(b.data) - new Date(a.data))[0];
}

// Auto-sincronização retroativa de lançamentos de caixa pendentes (Item D)
async function autoSyncMissingOSMovements() {
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;

    const todayStr = getOperativeDate();
    
    // Filtrar OSs de hoje que não são canceladas (incluindo faturadas)
    const todayOSList = db.ordens_servico.filter(os => {
        const osDate = getLocalDateString(os.criadoEm);
        return osDate === todayStr && os.status !== 'cancelada' && !os.reapresentacaoOrigemID;
    });

    for (const os of todayOSList) {
        // Verificar se já existe movimentação de caixa para esta OS
        const hasMov = db.caixa_movimentos.some(m => m.osId === os.id);
        if (!hasMov) {
            console.log(`⚠️ OS ${os.numero} de hoje não possui lançamento no caixa. Sincronizando...`);
            const newMov = {
                caixaId: activeCaixa.id,
                tipo: "entrada",
                valor: os.valor,
                descricao: `Serviço ${(os.servicoNome || 'VISTORIA').split(' — ')[0]} (Placa: ${os.placa})`,
                formaPagamento: os.formaPagamento,
                data: os.criadoEm, // Mantém a data original de criação da OS
                operador: os.criadoPor || 'Sistema',
                osId: os.id,
                faturaId: null
            };
            try {
                if (window.useSupabase) {
                    const inserted = await sbInsert('caixa_movimentos', newMov);
                    db.caixa_movimentos.unshift(inserted);
                } else {
                    newMov.id = db.caixa_movimentos.length + 1;
                    db.caixa_movimentos.push(newMov);
                    saveDatabase();
                }
                console.log(`✅ OS ${os.numero} sincronizada com o caixa com sucesso!`);
            } catch (err) {
                console.error(`Erro ao auto-sincronizar OS ${os.numero}:`, err);
            }
        }
    }
}

async function renderCaixaPage() {
    const activeCaixa = getTodayOpenCaixa();
    
    // Auto-sincronizar lançamentos de hoje
    if (activeCaixa) {
        await autoSyncMissingOSMovements();
    }

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
        const today = getOperativeDate();
        const todayDrawer = db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.data === today);
        if (!todayDrawer) {
            const labelBtn = window.modoDiaReaberto ? "Abrir Caixa Reaberto" : "Abrir Caixa de Hoje";
            statusBadgeContainer.innerHTML += `
                <button class="btn btn-warning btn-sm" style="margin-left: 10px;" onclick="openTodayCaixaDrawer()">
                    <i class="ri-play-line"></i> ${labelBtn}
                </button>
            `;
        }
    }

    renderCaixaKPIs(activeCaixa);
    renderCaixaMovimentos(activeCaixa);
}

async function openTodayCaixaDrawer() {
    const today = getOperativeDate();
    
    if (window.useSupabase) {
        // Proteção R3: Consulta direta à API do Supabase para garantir que não haja outro caixa para a mesma data e filial
        try {
            const checkUrl = `${SUPABASE_URL}/rest/v1/caixa_diario?unidadeId=eq.${activeUnitId}&data=eq.${today}&limit=1`;
            const checkResponse = await fetch(checkUrl, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            const existingDrawer = await checkResponse.json();
            if (existingDrawer && existingDrawer.length > 0) {
                const ex = prepareRecordFromDb('caixa_diario', existingDrawer[0]);
                const idx = db.caixa_diario.findIndex(c => c.id === ex.id);
                if (idx === -1) {
                    db.caixa_diario.push(ex);
                } else {
                    db.caixa_diario[idx] = ex;
                }
                showToast("Aviso: O caixa para esta data já estava aberto ou fechado no servidor. Sincronizado!", "warning");
                renderCaixaPage();
                return;
            }
        } catch (errCheck) {
            console.error("Falha ao validar caixa existente no Supabase:", errCheck);
        }
    }
    
    // Buscar o saldo final do dia anterior
    let saldoAberturaEstimado = 0.00;
    const caixasAnteriores = db.caixa_diario
        .filter(c => c.unidadeId === activeUnitId && c.data < today)
        .sort((a, b) => new Date(b.data) - new Date(a.data));
    
    if (caixasAnteriores.length > 0) {
        const ultimoCaixa = caixasAnteriores[0];
        const movsUltimo = db.caixa_movimentos.filter(m => m.caixaId === ultimoCaixa.id);
        const cashPayments = movsUltimo.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
        const cashSangrias = movsUltimo.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
        saldoAberturaEstimado = ultimoCaixa.saldoAbertura + cashPayments - cashSangrias;
    }

    const newDrawer = {
        unidadeId: activeUnitId,
        data: today,
        status: "aberto",
        abertoPor: currentSession.nome,
        fechadoPor: null,
        saldoAbertura: saldoAberturaEstimado,
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
    
    showToast("Caixa diário aberto com sucesso!", "success");
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

            let base64Pdf = "";
            try {
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
                base64Pdf = uint8ArrayToBase64(mergedPdfBytes);
            } catch (pdfMergeError) {
                console.warn("Falha ao mesclar PDFs (provavelmente por assinatura digital/proteção). Salvando apenas o PDF do Caixa.", pdfMergeError);
                // Fallback: usa apenas o PDF do caixa para não travar o fechamento
                base64Pdf = uint8ArrayToBase64(cashierPdfBytes);
                showToast("Nota: O PDF do DETRAN está protegido por assinatura digital. Caixa fechado anexando apenas o PDF do Caixa.", "warning");
            }

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

            try {
                // Tentativa de salvar o fechamento completo com o PDF no Supabase
                await dbSave('caixa_diario', {
                    status: "fechado",
                    saldoEspécieInformado: saldoFisico,
                    fechadoPor: currentSession.nome,
                    fechadoEm: activeCaixa.fechadoEm,
                    pdfConsolidado: base64Pdf
                }, 'update', activeCaixa.id);
            } catch (dbErr) {
                console.warn("⚠️ Erro ao salvar fechamento completo com PDF no Supabase (limite de payload ou rede). Tentando salvar sem o PDF para garantir o fechamento...", dbErr);
                try {
                    // Contingência: salva o fechamento sem o PDF pesado para garantir o status 'fechado' no Supabase
                    await dbSave('caixa_diario', {
                        status: "fechado",
                        saldoEspécieInformado: saldoFisico,
                        fechadoPor: currentSession.nome,
                        fechadoEm: activeCaixa.fechadoEm,
                        pdfConsolidado: null
                    }, 'update', activeCaixa.id);
                    showToast("Caixa fechado (PDF salvo apenas no cache local por limite de tamanho).", "warning");
                } catch (retryErr) {
                    console.error("❌ Erro crítico ao salvar fechamento de caixa no Supabase:", retryErr);
                }
            }

            const estavaReaberto = window.modoDiaReaberto;

            // Se estiver no modo Dia Reaberto, limpa e recalcula saldos
            if (estavaReaberto) {
                const caixasUnidade = db.caixa_diario
                    .filter(x => x.unidadeId === activeUnitId)
                    .sort((a, b) => new Date(a.data) - new Date(b.data));

                const idxReaberto = caixasUnidade.findIndex(x => x.id === activeCaixa.id);
                if (idxReaberto !== -1) {
                    let saldoAnterior = 0.00;
                    
                    const movsReaberto = db.caixa_movimentos.filter(m => m.caixaId === activeCaixa.id);
                    const cashPaymentsReaberto = movsReaberto.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
                    const cashSangriasReaberto = movsReaberto.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
                    saldoAnterior = activeCaixa.saldoAbertura + cashPaymentsReaberto - cashSangriasReaberto;

                    for (let i = idxReaberto + 1; i < caixasUnidade.length; i++) {
                        const proximoCaixa = caixasUnidade[i];
                        proximoCaixa.saldoAbertura = saldoAnterior;

                        if (window.useSupabase) {
                            try {
                                await sbUpdate('caixa_diario', proximoCaixa.id, {
                                    saldoAbertura: proximoCaixa.saldoAbertura
                                });
                            } catch (e) {
                                console.warn("Erro ao atualizar saldo de abertura em cascata:", e);
                            }
                        }

                        const movsSub = db.caixa_movimentos.filter(m => m.caixaId === proximoCaixa.id);
                        const cashPaymentsSub = movsSub.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
                        const cashSangriasSub = movsSub.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + m.valor, 0);
                        saldoAnterior = proximoCaixa.saldoAbertura + cashPaymentsSub - cashSangriasSub;
                    }
                }

                window.modoDiaReaberto = false;
                window.dataDiaReaberto = null;
                window.caixaReabertoId = null;

                localStorage.removeItem('certive_modoDiaReaberto');
                localStorage.removeItem('certive_dataDiaReaberto');
                localStorage.removeItem('certive_caixaReabertoId');

                const banner = document.getElementById('dia-reaberto-banner');
                if (banner) banner.style.display = 'none';
            }

            saveDatabase();
            
            if (estavaReaberto) {
                showToast("Caixa refechado e saldos propagados em cascata com sucesso!", "success");
                logAudit("Fechamento Caixa Reaberto", `Encerrou o Modo Dia Reaberto. Lançamentos e saldos propagados em cascata.`);
                document.getElementById('caixa-fechar-form').reset();
                navigateTo('atendimento');
            } else {
                showToast("Caixa diário fechado com sucesso!", "success");
                logAudit("Fechamento Caixa", `Fechou caixa com diferença de ${formatCurrency(diff)} e anexou relatório DETRAN.`);
                document.getElementById('caixa-fechar-form').reset();
                renderCaixaPage();
            }
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
    const today = getLocalDateString(new Date());
    const closedCaixas = db.caixa_diario
        .filter(c => c.unidadeId === activeUnitId && (c.status === "fechado" || c.data < today))
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

        const isClosed = c.status === "fechado";
        const statusBadge = isClosed 
            ? '<span class="badge badge-done">CONCLUÍDO</span>' 
            : '<span class="badge badge-progress" style="background: #fef08a; color: #854d0e; padding: 4px 8px; border-radius: 4px; font-weight: 700;"><span class="badge-dot" style="background: #ca8a04;"></span> REABERTO</span>';

        let actionBtn = '';
        if (isMasterSession()) {
            if (isClosed) {
                actionBtn = `<button class="btn btn-warning btn-sm btn-icon" onclick="reopenCaixa(${c.id})" title="Reabrir Caixa Diario"><i class="ri-lock-unlock-line"></i></button>`;
            } else {
                actionBtn = `<button class="btn btn-success btn-sm btn-icon" onclick="enterReopenMode(${c.id})" title="Entrar no Modo Reaberto"><i class="ri-play-line"></i></button>`;
            }
        }

        return `
            <tr>
                <td><strong>${formatDateBr(c.data)}</strong></td>
                <td>${c.fechadoPor || '—'}</td>
                <td style="text-align: right; color: var(--success);">${formatCurrency(totalEntradas)}</td>
                <td style="text-align: right; color: var(--danger);">${formatCurrency(totalSaidas)}</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(estimatedCash)}</td>
                <td style="text-align: right; font-weight: 600;">${formatCurrency(c.saldoEspécieInformado)}</td>
                <td style="text-align: right; font-weight: 700; color: ${diffColor};">${formatCurrency(diff)}</td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="printCaixaById(${c.id})" title="Imprimir Relatório de Caixa"><i class="ri-printer-line"></i></button>
                        ${actionBtn}
                        ${c.pdfConsolidado ? `<button class="btn btn-primary btn-sm btn-icon" onclick="downloadConsolidatedPdf(${c.id})" title="Baixar PDF Consolidado (Caixa + DETRAN)"><i class="ri-download-line"></i></button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function enterReopenMode(caixaId) {
    const c = db.caixa_diario.find(x => x.id === caixaId);
    if (!c) {
        showToast("Caixa não localizado.", "error");
        return;
    }

    if (window.modoDiaReaberto && window.caixaReabertoId !== c.id) {
        showToast("Operação negada: Já existe outro modo dia reaberto ativo no momento.", "error");
        return;
    }

    window.modoDiaReaberto = true;
    window.dataDiaReaberto = c.data;
    window.caixaReabertoId = c.id;

    localStorage.setItem('certive_modoDiaReaberto', 'true');
    localStorage.setItem('certive_dataDiaReaberto', c.data);
    localStorage.setItem('certive_caixaReabertoId', String(c.id));

    // Exibir o banner de dia reaberto
    const banner = document.getElementById('dia-reaberto-banner');
    if (banner) {
        banner.style.display = 'flex';
        document.getElementById('dia-reaberto-data-label').textContent = formatDateBr(c.data);
    }

    showToast("Entrou no Modo Dia Reaberto para " + formatDateBr(c.data), "info");
    navigateTo('atendimento');
}

async function reopenCaixa(caixaId) {
    if (!isMasterSession()) {
        showToast("Erro: Apenas operadores Master podem reabrir caixas.", "error");
        return;
    }

    if (window.modoDiaReaberto) {
        showToast("Operacao negada: Ja existe um modo dia reaberto ativo no momento.", "error");
        return;
    }

    const c = db.caixa_diario.find(x => x.id === caixaId);
    if (!c) {
        showToast("Caixa nao localizado.", "error");
        return;
    }

    if (confirm("Confirmar a reabertura do caixa fechado do dia " + formatDateBr(c.data) + "?\nO sistema entrará no Modo Dia Reaberto temporariamente.")) {
        c.status = "aberto";
        c.fechadoPor = null;
        c.fechadoEm = null;

        if (window.useSupabase) {
            await sbUpdate('caixa_diario', c.id, {
                status: c.status,
                fechadoPor: null,
                fechadoEm: null
            });
        } else {
            saveDatabase();
        }

        window.modoDiaReaberto = true;
        window.dataDiaReaberto = c.data;
        window.caixaReabertoId = c.id;

        localStorage.setItem('certive_modoDiaReaberto', 'true');
        localStorage.setItem('certive_dataDiaReaberto', c.data);
        localStorage.setItem('certive_caixaReabertoId', String(c.id));

        // Exibir o banner de dia reaberto
        const banner = document.getElementById('dia-reaberto-banner');
        if (banner) {
            banner.style.display = 'flex';
            document.getElementById('dia-reaberto-data-label').textContent = formatDateBr(c.data);
        }

        showToast("Caixa reaberto com sucesso!", "success");
        logAudit("Reabertura Caixa", "Reabriu o caixa do dia " + formatDateBr(c.data) + " (Entrou no Modo Dia Reaberto)");
        
        // Redireciona para o Atendimento
        navigateTo('atendimento');
    }
}

// Print Active Caixa (Today's Drawer)
function printActiveCaixa() {
    // Can print open or closed drawer
    const today = getOperativeDate();
    const activeCaixa = db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.data === today);
    if (!activeCaixa) {
        showToast("Não há registro de caixa aberto ou fechado nesta data para esta unidade.", "error");
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
    const totalCredito = entries.filter(m => m.formaPagamento === 'credito' || m.formaPagamento === 'credito_parcelado').reduce((sum, m) => sum + m.valor, 0);
    const totalFaturamento = db.ordens_servico
        .filter(o => o.unidadeId === c.unidadeId && o.criadoEm.startsWith(c.data) && o.status !== 'cancelada' && o.formaPagamento === 'faturamento')
        .reduce((sum, o) => sum + o.valor, 0);

    // Entries Rows mapping
    let entryRows = entries.map(m => {
        const os = m.osId ? db.ordens_servico.find(o => o.id === m.osId) : null;
        const plate = os ? os.placa : "—";
        const clientType = os ? os.clienteTipo.toUpperCase() : "FAT. RECEBIDO";
        const time = new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const obsText = os && os.observacoes ? `<br><small style="color: #666; font-size: 9px;">Veículo: ${removeDividedPaymentTag(os.observacoes)}</small>` : '';
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

function renderFaturamentoKPIs() {
    if (!db.faturas || !db.ordens_servico || !db.servicos) return;

    // Lista de OSs cujo faturamento (lote) não foi fechado para a unidade ativa
    const openOSList = getUnbilledOSs();
    
    // 1. Valor total consolidado a receber de lotes não fechados
    const totalAReceber = openOSList.reduce((sum, os) => sum + os.valor, 0);
    
    // 2. Quantidade total de OSs pendentes
    const totalOSs = openOSList.length;
    
    // 3. Classificação por natureza do serviço
    let transferenciasCount = 0;
    let transferenciasVal = 0;
    
    let cautelaresCount = 0;
    let cautelaresVal = 0;
    
    let pesquisasCount = 0;
    let pesquisasVal = 0;
    
    openOSList.forEach(os => {
        const s = db.servicos.find(x => x.id === os.servicoId);
        const cat = s ? s.categoria : '';
        const name = (os.servicoNome || '').toUpperCase();
        
        // Regras de classificação (Combo = Cautelar, Transferência Combo = Transferência, Pesquisas Avulsas = Pesquisa)
        if (os.servicoId === 7 || cat === 'Cautelar' || (name.includes('COMBO') && !name.includes('TRANSFERÊNCIA')) || name.includes('CAUTELAR')) {
            cautelaresCount++;
            cautelaresVal += os.valor;
        } else if (os.servicoId === 8 || cat === 'Transferência' || name.includes('TRANSFERÊNCIA')) {
            transferenciasCount++;
            transferenciasVal += os.valor;
        } else if (os.servicoId === 5 || cat === 'Pesquisa' || name.includes('PESQUISA')) {
            pesquisasCount++;
            pesquisasVal += os.valor;
        }
    });

    // 4. Renderiza nos elementos DOM
    const elTotal = document.getElementById('fat-db-total-receber');
    const elOSs = document.getElementById('fat-db-total-os');
    
    const elTransf = document.getElementById('fat-db-transferencias');
    const elTransfVal = document.getElementById('fat-db-transferencias-val');
    
    const elCaut = document.getElementById('fat-db-cautelares');
    const elCautVal = document.getElementById('fat-db-cautelares-val');
    
    const elPesq = document.getElementById('fat-db-pesquisas');
    const elPesqVal = document.getElementById('fat-db-pesquisas-val');

    if (elTotal) elTotal.textContent = formatCurrency(totalAReceber);
    if (elOSs) elOSs.textContent = totalOSs;
    
    if (elTransf) elTransf.textContent = transferenciasCount;
    if (elTransfVal) elTransfVal.textContent = formatCurrency(transferenciasVal);
    
    if (elCaut) elCaut.textContent = cautelaresCount;
    if (elCautVal) elCautVal.textContent = formatCurrency(cautelaresVal);
    
    if (elPesq) elPesq.textContent = pesquisasCount;
    if (elPesqVal) elPesqVal.textContent = formatCurrency(pesquisasVal);

    // Novo: Histórico de Faturas Emitidas
    const activeUnitFaturas = db.faturas.filter(f => f.unidadeId === activeUnitId);
    const totalHistorico = activeUnitFaturas.reduce((sum, f) => sum + f.valorTotal, 0);
    const totalHistoricoQtd = activeUnitFaturas.length;

    const elHistorico = document.getElementById('fat-db-total-historico');
    const elHistoricoQtd = document.getElementById('fat-db-total-historico-qtd');

    if (elHistorico) elHistorico.textContent = formatCurrency(totalHistorico);
    if (elHistoricoQtd) elHistoricoQtd.textContent = `${totalHistoricoQtd} faturas`;
}

function renderFaturamentoPage() {
    renderFaturamentoKPIs();
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
    renderFaturamentoKPIs();
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
                    <small style="color: var(--text-secondary); font-weight: 500;">${removeDividedPaymentTag(o.observacoes) || '—'}</small>
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
        
        // --- NOVO: Gerar PDF e Chamar Edge Function Asaas ---
        try {
            showToast("Fatura salva! Gerando demonstrativo em PDF...", "info");
            
            // 1. Gera PDF e faz upload pro Supabase Storage
            const pdfUrl = await generateAndUploadInvoicePDF(finalInvoice);

            showToast("PDF gerado. Registrando no Asaas e enviando WhatsApp...", "info");
            
            // 2. Chama a Edge Function Asaas
            const functionRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-asaas-billing`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ faturaId: inserted.id, pdfUrl: pdfUrl })
            });
            
            if (functionRes.ok) {
                const functionData = await functionRes.json();
                finalInvoice.asaas_payment_id = functionData.paymentId;
                finalInvoice.asaas_url = functionData.url;
                finalInvoice.notificacao_zap = (functionData.zapStatus === 'enviado');
                
                // Salva atualizações do Asaas na fatura do banco de dados
                await sbUpdate('faturas', inserted.id, {
                    asaas_payment_id: finalInvoice.asaas_payment_id,
                    asaas_url: finalInvoice.asaas_url,
                    notificacao_zap: finalInvoice.notificacao_zap
                });
                
                showToast("Cobrança Asaas gerada e WhatsApp enviado!", "success");
            } else {
                let errText = "Erro desconhecido";
                try {
                    const functionData = await functionRes.json();
                    errText = functionData.error || errText;
                } catch(e) {}
                showToast("Erro Asaas: " + errText, "error");
            }
        } catch(e) {
            console.error(e);
            showToast("Erro ao chamar Asaas / WhatsApp.", "error");
        }
        // ----------------------------------------
        
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
    renderFaturamentoKPIs();
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

        let statusBoleto = f.statusBoleto || "Não gerado";
        if (statusBoleto === 'Não gerado' && f.asaas_url) {
            statusBoleto = 'Gerado';
        }
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

        let asaasBtn = '';
        if (f.asaas_url) {
            asaasBtn = `<a href="${f.asaas_url}" target="_blank" class="btn btn-secondary btn-sm btn-icon" title="Abrir Boleto Asaas" style="display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); transition: background 0.2s;"><i class="ri-bank-card-line" style="font-size:14px;"></i></a>`;
        } else {
            asaasBtn = `<button class="btn btn-secondary btn-sm btn-icon" onclick="openBoletoModal(${f.id})" title="Boleto Bancário"><i class="ri-bank-card-line"></i></button>`;
        }

        let zapBtn = '';
        if (f.asaas_url) {
            const zapColor = f.notificacao_zap ? "var(--success)" : "var(--text-secondary)";
            const zapTitle = f.notificacao_zap ? "Reenviar Fatura por WhatsApp" : "Enviar Fatura por WhatsApp";
            zapBtn = `<button class="btn btn-secondary btn-sm btn-icon" onclick="sendInvoiceWhatsApp(${f.id}, this)" title="${zapTitle}" style="color: ${zapColor}; border-color: var(--border); background: var(--bg-card); display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--radius-sm); transition: all 0.2s;"><i class="ri-whatsapp-line" style="font-size:14px;"></i></button>`;
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
                        ${asaasBtn}
                        ${zapBtn}
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
            invoice.pago = true;
            invoice.pagoEm = new Date().toISOString();

            // Mark all related OSs as settled/pago
            invoice.ordensIds.forEach(id => {
                const os = db.ordens_servico.find(o => o.id === id);
                if (os) os.pago = true;
            });

            // Insert cash drawer inflow (Pix by default)
            const partner = db.parceiros.find(p => p.id === invoice.parceiroId);
            const newMov = {
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

            if (window.useSupabase) {
                const insertedMov = await sbInsert('caixa_movimentos', newMov);
                db.caixa_movimentos.unshift(insertedMov);

                await dbSave('faturas', { pago: true, pagoEm: invoice.pagoEm }, 'update', invoice.id);

                for (const osId of invoice.ordensIds) {
                    await dbSave('ordens_servico', { pago: true }, 'update', osId);
                }
            } else {
                newMov.id = db.caixa_movimentos.length + 1;
                db.caixa_movimentos.push(newMov);
            }

            saveDatabase();
            showToast(`Fatura ${invoice.codigo} liquidada com sucesso! Entrada gerada no caixa.`, "success");
            logAudit("Faturamento Baixa", `Liquidou fatura ${invoice.codigo} no valor de ${formatCurrency(invoice.valorTotal)}.`);
            
            renderFatFaturas();
        } catch (err) {
            console.error("Erro ao liquidar fatura:", err);
            showToast("Erro ao processar a baixa da fatura no banco de dados.", "error");
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
    const unit = db.unidades.find(u => u.id === f.unidadeId);
    
    // Fetch all related OSs
    const oss = db.ordens_servico.filter(o => f.ordensIds.includes(o.id));

    let osRows = oss.map(o => `
        <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
            <td style="padding: 6px;"><strong>${o.numero}</strong></td>
            <td style="padding: 6px;">${formatDateBr(o.criadoEm)}</td>
            <td style="padding: 6px;"><strong>${o.placa}</strong></td>
            <td style="padding: 6px;">${removeDividedPaymentTag(o.observacoes) || '—'}</td>
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

async function renderContasPage() {
    if (typeof window.syncDetranFloatingPayable === 'function') {
        await window.syncDetranFloatingPayable();
    }
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

function renderContasKPIs() {
    const kpiGrid = document.getElementById('contas-kpis-grid');
    if (!kpiGrid) return;

    if (!db.contas_pagar) return;

    const list = db.contas_pagar.filter(c => c.unidadeId === activeUnitId);
    
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7); // Ex: "2026-07"

    // Provisão específica do faturamento do mês atual (independente de vencer no mês seguinte)
    const meses = {
        '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
        '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
        '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    };
    const currentMonthLabel = meses[currentMonthStr.substring(5, 7)];
    const currentYearLabel = currentMonthStr.substring(0, 4);
    const currentProvisionDesc = `Taxas DETRAN-SC — Provisão ${currentMonthLabel}/${currentYearLabel}`;

    // 1. Contas do mês atual (vencimento no mês atual OU provisão flutuante faturada no mês atual)
    const contasDoMes = list.filter(c => {
        if (!c.vencimento) return false;
        if (c.vencimento.startsWith(currentMonthStr)) return true;
        if (c.descricao === currentProvisionDesc) return true;
        return false;
    });
    
    const totalMes = contasDoMes.reduce((sum, c) => sum + c.valor, 0);
    const pagoMes = contasDoMes.filter(c => c.pago).reduce((sum, c) => sum + c.valor, 0);
    const pendenteMes = contasDoMes.filter(c => !c.pago).reduce((sum, c) => sum + c.valor, 0);

    const pctPago = totalMes > 0 ? (pagoMes / totalMes) * 100 : 0;
    const pctPendente = totalMes > 0 ? (pendenteMes / totalMes) * 100 : 0;

    // 2. Contas em atraso (vencimento < hoje e não pagas)
    const contasAtrasadas = list.filter(c => !c.pago && c.vencimento < todayStr);
    const totalAtrasado = contasAtrasadas.reduce((sum, c) => sum + c.valor, 0);
    const qtdAtrasado = contasAtrasadas.length;

    // 3. Renderizar o HTML dos cards
    let atrasadoCardHtml = '';
    if (qtdAtrasado > 0) {
        atrasadoCardHtml = `
            <div class="kpi-card" style="border: 1.5px solid var(--danger); background: rgba(239, 68, 68, 0.04); display: flex; align-items: center; padding: 16px; border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; box-sizing: border-box;">
                <div class="kpi-icon" style="color: var(--danger); background: var(--danger-bg); width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); font-size: 22px; margin-right: 14px; flex-shrink: 0; border: 1px solid rgba(239, 68, 68, 0.2);"><i class="ri-error-warning-line"></i></div>
                <div class="kpi-info" style="display: flex; flex-direction: column;">
                    <span class="kpi-label" style="font-size: 9px; font-weight: 700; color: var(--danger); letter-spacing: 0.5px; text-transform: uppercase;">Contas em Atraso</span>
                    <h3 class="kpi-value" style="font-size: 18px; font-weight: 800; color: var(--danger); margin: 2px 0 0 0;">${formatCurrency(totalAtrasado)}</h3>
                    <span class="kpi-subtext" style="font-size: 10px; color: var(--text-muted); margin-top: 1px;">${qtdAtrasado} contas atrasadas</span>
                </div>
            </div>
        `;
    } else {
        atrasadoCardHtml = `
            <div class="kpi-card" style="border: 1px solid var(--border); background: var(--bg-secondary); display: flex; align-items: center; padding: 16px; border-radius: var(--radius); box-shadow: var(--shadow); opacity: 0.85; width: 100%; box-sizing: border-box;">
                <div class="kpi-icon" style="color: var(--success); background: var(--success-bg); width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); font-size: 22px; margin-right: 14px; flex-shrink: 0; border: 1px solid rgba(16, 185, 129, 0.15);"><i class="ri-checkbox-circle-line"></i></div>
                <div class="kpi-info" style="display: flex; flex-direction: column;">
                    <span class="kpi-label" style="font-size: 9px; font-weight: 700; color: var(--success); letter-spacing: 0.5px; text-transform: uppercase;">Contas em Atraso</span>
                    <h3 class="kpi-value" style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 2px 0 0 0;">R$ 0,00</h3>
                    <span class="kpi-subtext" style="font-size: 10px; color: var(--success); margin-top: 1px; font-weight: 600;">Nenhuma atrasada</span>
                </div>
            </div>
        `;
    }

    kpiGrid.innerHTML = `
        <!-- Total no Mês -->
        <div class="kpi-card" style="border: 1px solid var(--border); background: var(--bg-secondary); display: flex; align-items: center; padding: 16px; border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; box-sizing: border-box;">
            <div class="kpi-icon" style="color: var(--text-primary); background: var(--navy-light); width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); font-size: 22px; margin-right: 14px; flex-shrink: 0; border: 1px solid var(--border);"><i class="ri-wallet-3-line"></i></div>
            <div class="kpi-info" style="display: flex; flex-direction: column;">
                <span class="kpi-label" style="font-size: 9px; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.5px; text-transform: uppercase;">Total do Mês</span>
                <h3 class="kpi-value" style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 2px 0 0 0;">${formatCurrency(totalMes)}</h3>
                <span class="kpi-subtext" style="font-size: 10px; color: var(--text-muted); margin-top: 1px;">Despesas para este mês</span>
            </div>
        </div>
        <!-- Pago no Mês -->
        <div class="kpi-card" style="border: 1.5px solid var(--success); background: rgba(16, 185, 129, 0.04); display: flex; align-items: center; padding: 16px; border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; box-sizing: border-box;">
            <div class="kpi-icon" style="color: var(--success); background: var(--success-bg); width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); font-size: 22px; margin-right: 14px; flex-shrink: 0; border: 1px solid rgba(16, 185, 129, 0.2);"><i class="ri-checkbox-circle-line"></i></div>
            <div class="kpi-info" style="display: flex; flex-direction: column;">
                <span class="kpi-label" style="font-size: 9px; font-weight: 700; color: var(--success); letter-spacing: 0.5px; text-transform: uppercase;">Valor Pago (Mês)</span>
                <h3 class="kpi-value" style="font-size: 18px; font-weight: 800; color: var(--success); margin: 2px 0 0 0;">${formatCurrency(pagoMes)}</h3>
                <span class="kpi-subtext" style="font-size: 10px; color: var(--success); margin-top: 1px; font-weight: 600;">${pctPago.toFixed(1)}% liquidado</span>
            </div>
        </div>
        <!-- Pendente no Mês -->
        <div class="kpi-card" style="border: 1.5px solid var(--warning); background: rgba(245, 158, 11, 0.04); display: flex; align-items: center; padding: 16px; border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; box-sizing: border-box;">
            <div class="kpi-icon" style="color: var(--warning); background: var(--warning-bg); width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); font-size: 22px; margin-right: 14px; flex-shrink: 0; border: 1px solid rgba(245, 158, 11, 0.2);"><i class="ri-time-line"></i></div>
            <div class="kpi-info" style="display: flex; flex-direction: column;">
                <span class="kpi-label" style="font-size: 9px; font-weight: 700; color: var(--warning); letter-spacing: 0.5px; text-transform: uppercase;">Valor Pendente (Mês)</span>
                <h3 class="kpi-value" style="font-size: 18px; font-weight: 800; color: var(--warning); margin: 2px 0 0 0;">${formatCurrency(pendenteMes)}</h3>
                <span class="kpi-subtext" style="font-size: 10px; color: var(--warning); margin-top: 1px; font-weight: 600;">${pctPendente.toFixed(1)}% a vencer</span>
            </div>
        </div>
        <!-- Atrasados -->
        ${atrasadoCardHtml}
    `;
}

function renderContasGerais() {
    renderContasKPIs();
    const tbody = document.getElementById('contas-tbody');
    const list = db.contas_pagar
        .filter(c => c.unidadeId === activeUnitId)
        .sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhuma conta a pagar registrada.</td></tr>';
        return;
    }

    const isGerenteGeral = currentSession && currentSession.funcao && currentSession.funcao.toLowerCase().includes("gerente");

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

        // O criador da conta ou o Gerente Geral podem editar/excluir
        const canDeleteOrEdit = isGerenteGeral || 
                                (c.criadoPor === currentSession.nome) || 
                                (c.criadoPor === currentSession.login);

        return `
            <tr>
                <td><strong>${formatDateBr(c.vencimento)}</strong></td>
                <td>
                    <strong>${c.descricao}</strong>
                    ${obsHtml}
                </td>
                <td><span class="badge badge-progress">${c.tipo.toUpperCase()}</span></td>
                <td><span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">${c.criadoPor || 'Sistema'}</span></td>
                <td style="text-align: right; color: var(--danger); font-weight: 600;">${formatCurrency(c.valor)}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center;">${anexoHtml}</td>
                <td style="text-align: center;">${comprovanteHtml}</td>
                <td>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        ${!c.pago ? `<button class="btn btn-primary btn-sm" onclick="payExpense(${c.id})" title="Pagar Conta"><i class="ri-check-line"></i> PAGAR</button>` : `<small style="color:var(--text-muted); font-size: 11px;">Paga em ${formatDateBr(c.pagoEm)}</small>`}
                        ${canDeleteOrEdit ? `
                            <button class="btn btn-warning btn-sm btn-icon" onclick="openEditContaModal(${c.id})" title="Editar Conta" style="padding: 4px; display: inline-flex; align-items: center; justify-content: center;"><i class="ri-edit-line" style="font-size: 14px;"></i></button>
                            <button class="btn btn-danger btn-sm btn-icon" onclick="deleteConta(${c.id})" title="Excluir Conta" style="padding: 4px; display: inline-flex; align-items: center; justify-content: center;"><i class="ri-delete-bin-line" style="font-size: 14px;"></i></button>
                        ` : ''}
                    </div>
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
            comprovante: null,
            criadoPor: currentSession ? currentSession.nome : 'Sistema'
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

// ---- EDIÇÃO E EXCLUSÃO DE CONTAS A PAGAR ----

function openEditContaModal(id) {
    const conta = db.contas_pagar.find(c => c.id === id);
    if (!conta) {
        showToast("Conta não encontrada.", "error");
        return;
    }

    const isGerenteGeral = currentSession && currentSession.funcao && currentSession.funcao.toLowerCase().includes("gerente");
    const canDeleteOrEdit = isGerenteGeral || 
                            (conta.criadoPor === currentSession.nome) || 
                            (conta.criadoPor === currentSession.login);

    if (!canDeleteOrEdit) {
        showToast("Erro: Você não tem permissão para editar esta conta.", "error");
        return;
    }

    document.getElementById('edit-conta-id').value = conta.id;
    document.getElementById('edit-conta-desc').value = conta.descricao.toUpperCase();
    document.getElementById('edit-conta-vencimento').value = getLocalDateString(conta.vencimento);
    document.getElementById('edit-conta-valor').value = conta.valor;
    document.getElementById('edit-conta-categoria').value = conta.categoria;
    document.getElementById('edit-conta-fornecedor').value = conta.fornecedor.toUpperCase();
    document.getElementById('edit-conta-obs').value = (conta.observacoes || '').toUpperCase();

    document.getElementById('modal-contas-editar').classList.add('active');
}

function closeEditContaModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-contas-editar').classList.remove('active');
}

async function submitEditContaForm(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('edit-conta-id').value);
    const conta = db.contas_pagar.find(c => c.id === id);
    if (!conta) return;

    const isGerenteGeral = currentSession && currentSession.funcao && currentSession.funcao.toLowerCase().includes("gerente");
    const canDeleteOrEdit = isGerenteGeral || 
                            (conta.criadoPor === currentSession.nome) || 
                            (conta.criadoPor === currentSession.login);

    if (!canDeleteOrEdit) {
        showToast("Erro: Você não tem permissão para editar esta conta.", "error");
        return;
    }

    const desc = document.getElementById('edit-conta-desc').value.trim().toUpperCase();
    const venc = document.getElementById('edit-conta-vencimento').value;
    const val = parseFloat(document.getElementById('edit-conta-valor').value);
    const cat = document.getElementById('edit-conta-categoria').value;
    const fornecedor = document.getElementById('edit-conta-fornecedor').value.trim().toUpperCase();
    const obs = document.getElementById('edit-conta-obs').value.trim().toUpperCase();

    if (val <= 0) {
        showToast("Valor de despesa inválido.", "error");
        return;
    }

    try {
        await dbSave('contas_pagar', {
            descricao: desc,
            vencimento: venc,
            valor: val,
            categoria: cat,
            fornecedor: fornecedor,
            observacoes: obs
        }, 'update', id);

        showToast("Conta atualizada com sucesso!", "success");
        logAudit("Edição de Conta", `Editou a conta: ${desc} (Venc: ${formatDateBr(venc)})`);

        // Recarregar os dados do Supabase se estiver online para manter o cache sincronizado
        if (window.useSupabase) {
            const contas = await sbSelectAll('contas_pagar', 'id', true);
            db.contas_pagar = contas || [];
            db.contas_pagar.forEach(c => normalizeRecord('contas_pagar', c));
        }

        closeEditContaModal();
        renderContasGerais();
    } catch (err) {
        console.error(err);
        showToast("Erro ao editar conta no banco.", "error");
    }
}

async function deleteConta(id) {
    const conta = db.contas_pagar.find(c => c.id === id);
    if (!conta) return;

    const isGerenteGeral = currentSession && currentSession.funcao && currentSession.funcao.toLowerCase().includes("gerente");
    const canDeleteOrEdit = isGerenteGeral || 
                            (conta.criadoPor === currentSession.nome) || 
                            (conta.criadoPor === currentSession.login);

    if (!canDeleteOrEdit) {
        showToast("Erro: Você não tem permissão para excluir esta conta.", "error");
        return;
    }

    if (confirm(`Tem certeza que deseja excluir permanentemente a conta "${conta.descricao}" no valor de ${formatCurrency(conta.valor)}?`)) {
        try {
            await dbSave('contas_pagar', null, 'delete', id);
            showToast("Conta excluída com sucesso!", "success");
            logAudit("Exclusão de Conta", `Excluiu a conta: ${conta.descricao} (Valor: ${formatCurrency(conta.valor)})`);

            // Recarregar os dados do Supabase se estiver online para manter o cache sincronizado
            if (window.useSupabase) {
                const contas = await sbSelectAll('contas_pagar', 'id', true);
                db.contas_pagar = contas || [];
                db.contas_pagar.forEach(c => normalizeRecord('contas_pagar', c));
            }

            renderContasGerais();
        } catch (err) {
            console.error(err);
            showToast("Erro ao excluir conta.", "error");
        }
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
        comprovante: null,
        criadoPor: currentSession ? currentSession.nome : 'Sistema'
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
let currentBITab = 'financeiro';
window.currentBIAvgCostPerOS = 0;

function switchBITab(tab, btn) {
    currentBITab = tab;
    document.querySelectorAll('.bi-layout .tab-btn').forEach(el => el.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    } else {
        const activeBtn = document.getElementById(`btn-bi-${tab}`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    document.getElementById('tab-bi-financeiro').style.display = tab === 'financeiro' ? 'block' : 'none';
    document.getElementById('tab-bi-parceiros').style.display = tab === 'parceiros' ? 'block' : 'none';
    document.getElementById('tab-bi-servicos').style.display = tab === 'servicos' ? 'block' : 'none';
    document.getElementById('tab-bi-produtividade').style.display = tab === 'produtividade' ? 'block' : 'none';

    renderBI();
}

function loadBIPeriodFilter() {
    const select = document.getElementById('bi-filtro-periodo');
    if (!select) return;

    const oldVal = select.value;
    const dates = new Set();
    
    db.ordens_servico.forEach(o => {
        if (o.criadoEm) dates.add(o.criadoEm.substring(0, 7));
    });
    db.contas_pagar.forEach(c => {
        if (c.vencimento) dates.add(c.vencimento.substring(0, 7));
    });

    if (dates.size === 0) {
        dates.add("2026-05");
        dates.add("2026-06");
        dates.add("2026-07");
    }

    const sortedMonths = Array.from(dates).sort((a, b) => b.localeCompare(a));
    
    let html = '';
    sortedMonths.forEach(m => {
        const [year, month] = m.split('-');
        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const label = `${monthNames[parseInt(month) - 1]}/${year}`;
        html += `<option value="${m}">${label}</option>`;
    });

    html += '<option value="30">Últimos 30 dias</option>';
    html += '<option value="todos">Todo o Histórico</option>';
    
    select.innerHTML = html;

    if (oldVal && select.querySelector(`option[value="${oldVal}"]`)) {
        select.value = oldVal;
    } else {
        if (dates.has("2026-07")) {
            select.value = "2026-07";
        } else if (dates.has("2026-06")) {
            select.value = "2026-06";
        } else if (sortedMonths.length > 0) {
            select.value = sortedMonths[0];
        }
    }
}

function renderBIPage() {
    loadBIPeriodFilter();
    
    const select = document.getElementById('bi-filtro-unidade');
    if (select) {
        select.innerHTML = '<option value="todas">Todas as Unidades</option>' + 
            db.unidades.map(u => `<option value="${u.id}">${u.nome.split(' — ')[1] || u.nome}</option>`).join('');
    }

    switchBITab(currentBITab);
}

function renderBI() {
    if (!db.ordens_servico || !db.contas_pagar || !db.servicos || !db.parceiros) return;

    const periodSelect = document.getElementById('bi-filtro-periodo');
    const unitSelect = document.getElementById('bi-filtro-unidade');
    if (!periodSelect || !unitSelect) return;

    const period = periodSelect.value;
    const unitFilter = unitSelect.value;
    const capitalCustom = parseFloat(document.getElementById('bi-capital-investido').value) || null;

    let OSs = [];
    let Expenses = [];
    const today = new Date();

    if (period === '30') {
        const startDate = new Date();
        startDate.setDate(today.getDate() - 30);
        OSs = db.ordens_servico.filter(o => new Date(o.criadoEm) >= startDate);
        Expenses = db.contas_pagar.filter(c => new Date(c.vencimento) >= startDate);
    } else if (period === 'todos') {
        OSs = [...db.ordens_servico];
        Expenses = [...db.contas_pagar];
    } else {
        OSs = db.ordens_servico.filter(o => o.criadoEm && o.criadoEm.startsWith(period));
        Expenses = db.contas_pagar.filter(c => c.vencimento && c.vencimento.startsWith(period));
    }

    if (unitFilter !== 'todas') {
        const uId = parseInt(unitFilter);
        OSs = OSs.filter(o => o.unidadeId === uId);
        Expenses = Expenses.filter(c => c.unidadeId === uId);
    }

    const nonCancelledOSs = OSs.filter(o => o.status !== 'cancelada');
    const osCount = nonCancelledOSs.length;

    // Custos e Despesas (exclui lançamentos manuais do DETRAN para não duplicar com o cálculo de taxas das OSs)
    const fixedExpensesVal = Expenses.filter(c => c.tipo === 'fixo').reduce((sum, c) => sum + c.valor, 0);
    const variableExpensesVal = Expenses.filter(c => (c.tipo === 'variavel' || c.tipo === 'variável') && c.fornecedor !== "DETRAN-SC").reduce((sum, c) => sum + c.valor, 0);
    
    // Taxas operacionais do DETRAN
    const variableTaxesVal = nonCancelledOSs.reduce((sum, o) => {
        const tax = db.taxas_referencia.find(t => t.servicoId === o.servicoId)?.tax || 0;
        return sum + (o.valor > 0 ? tax : 0);
    }, 0);

    const totalRevenue = nonCancelledOSs.reduce((sum, o) => sum + o.valor, 0);
    const totalExpenses = fixedExpensesVal + variableExpensesVal + variableTaxesVal;
    const netProfit = totalRevenue - totalExpenses;

    // === CÁLCULO DO REGIME DE CAIXA (ENTRADAS REAIS DE DINHEIRO) ===
    let periodMovs = [];
    if (period === '30') {
        const startDate = new Date();
        startDate.setDate(today.getDate() - 30);
        periodMovs = db.caixa_movimentos.filter(m => new Date(m.data) >= startDate);
    } else if (period === 'todos') {
        periodMovs = [...db.caixa_movimentos];
    } else {
        periodMovs = db.caixa_movimentos.filter(m => m.data && m.data.startsWith(period));
    }

    if (unitFilter !== 'todas') {
        const uId = parseInt(unitFilter);
        periodMovs = periodMovs.filter(m => {
            const cx = db.caixa_diario.find(c => c.id === m.caixaId);
            return cx && cx.unidadeId === uId;
        });
    }

    const cashInflows = periodMovs.filter(m => m.tipo === 'entrada');
    const fatPaymentsReceived = cashInflows.filter(m => m.faturaId !== null).reduce((sum, m) => sum + m.valor, 0);
    const directPaymentsReceived = cashInflows.filter(m => m.faturaId === null).reduce((sum, m) => sum + m.valor, 0);
    const totalCashRevenue = directPaymentsReceived + fatPaymentsReceived;
    const netCashProfit = totalCashRevenue - totalExpenses;

    const avgCostPerOS = osCount ? totalExpenses / osCount : 0;
    const ticketMedio = osCount ? totalRevenue / osCount : 0;

    // Guarda custo médio na variável global para o detalhamento por parceiro
    window.currentBIAvgCostPerOS = avgCostPerOS;

    // ROI
    const investmentBase = capitalCustom !== null ? capitalCustom : totalExpenses;
    const roiPercent = investmentBase ? (netProfit / investmentBase) * 100 : 0;
    const roiReturnText = investmentBase ? `Para cada R$ 1,00 colocado para operar, retornam <strong>${formatCurrency(netProfit / investmentBase)}</strong> de lucro líquido.` : "Sem base de investimento.";

    // Break-even
    const avgVariableCostPerOS = osCount ? (variableExpensesVal + variableTaxesVal) / osCount : 0;
    const contributionMargin = ticketMedio - avgVariableCostPerOS;
    let breakEvenOS = 0;
    if (contributionMargin > 0.01) {
        breakEvenOS = Math.ceil(fixedExpensesVal / contributionMargin);
    } else {
        breakEvenOS = Infinity;
    }

    // 1. ABA FINANCEIRO & BREAK-EVEN
    if (currentBITab === 'financeiro') {
        const kpiGrid = document.getElementById('bi-kpis');
        if (kpiGrid) {
            kpiGrid.innerHTML = `
                <div class="kpi-card" style="border: 1px solid var(--border); background: var(--bg-secondary);">
                    <div class="kpi-icon" style="color: var(--accent); background: var(--accent-glow);"><i class="ri-line-chart-line"></i></div>
                    <div class="kpi-value" style="color: var(--text-primary); font-size: 20px; font-weight: 800;">${formatCurrency(totalRevenue)}</div>
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Receita de Serviços (Competência)</div>
                    <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">Soma do valor de todas as OSs geradas no período.</div>
                </div>
                <div class="kpi-card" style="border: 1.5px solid var(--accent); background: rgba(201, 169, 97, 0.04);">
                    <div class="kpi-icon" style="color: var(--accent); background: var(--accent-glow);"><i class="ri-wallet-line"></i></div>
                    <div class="kpi-value" style="color: var(--text-primary); font-size: 20px; font-weight: 800;">${formatCurrency(totalCashRevenue)}</div>
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Receita Efetiva em Caixa (Caixa)</div>
                    <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">Direto: ${formatCurrency(directPaymentsReceived)} | Faturas: ${formatCurrency(fatPaymentsReceived)}</div>
                </div>
                <div class="kpi-card" style="border: 1px solid var(--border); background: var(--bg-secondary);">
                    <div class="kpi-icon" style="color: var(--danger); background: var(--danger-bg);"><i class="ri-wallet-3-line"></i></div>
                    <div class="kpi-value" style="color: var(--text-primary); font-size: 20px; font-weight: 800;">${formatCurrency(totalExpenses)}</div>
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Custos Totais (Fixo + Variável + Taxas)</div>
                    <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">Despesas operacionais e taxas do período.</div>
                </div>
                <div class="kpi-card" style="border: 1px solid var(--border); background: var(--bg-secondary);">
                    <div class="kpi-icon" style="color: ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; background: ${netProfit >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)'};"><i class="ri-funds-line"></i></div>
                    <div class="kpi-value" style="color: ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-size: 20px; font-weight: 800;">${formatCurrency(netProfit)}</div>
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Lucro Estimado (Competência)</div>
                    <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">Resultado baseado nas OSs executadas.</div>
                </div>
                <div class="kpi-card" style="border: 1.5px solid ${netCashProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; background: ${netCashProfit >= 0 ? 'rgba(16, 185, 129, 0.02)' : 'rgba(239, 68, 68, 0.02)'};">
                    <div class="kpi-icon" style="color: ${netCashProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; background: ${netCashProfit >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)'};"><i class="ri-bank-card-line"></i></div>
                    <div class="kpi-value" style="color: ${netCashProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-size: 20px; font-weight: 800;">${formatCurrency(netCashProfit)}</div>
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Lucro Real Efetivo (Caixa)</div>
                    <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">Dinheiro líquido que realmente entrou em caixa.</div>
                </div>
                <div class="kpi-card" style="border: 1px solid var(--border); background: var(--bg-secondary);">
                    <div class="kpi-icon" style="color: var(--info); background: var(--info-bg);"><i class="ri-percent-line"></i></div>
                    <div class="kpi-value" style="color: var(--text-primary); font-size: 20px; font-weight: 800;">${roiPercent.toFixed(1)}%</div>
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">ROI (Retorno sobre Investimento)</div>
                    <div style="font-size: 9px; color: var(--text-secondary); margin-top: 4px; font-weight: 500;">${roiReturnText}</div>
                </div>
                <div class="kpi-card" style="border: 1px solid var(--border); background: var(--bg-secondary);">
                    <div class="kpi-icon" style="color: var(--purple); background: var(--purple-bg);"><i class="ri-money-dollar-circle-line"></i></div>
                    <div class="kpi-value" style="color: var(--text-primary); font-size: 20px; font-weight: 800;">${formatCurrency(avgCostPerOS)}</div>
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Custo Médio por OS</div>
                    <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">Custos totais divididos pela quantidade de OSs.</div>
                </div>
                <div class="kpi-card" style="border: 1px solid var(--border); background: var(--bg-secondary);">
                    <div class="kpi-icon" style="color: var(--accent); background: var(--accent-glow);"><i class="ri-coupon-2-line"></i></div>
                    <div class="kpi-value" style="color: var(--text-primary); font-size: 20px; font-weight: 800;">${formatCurrency(ticketMedio)}</div>
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Ticket Médio (Competência)</div>
                    <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">Valor de venda médio por vistoria.</div>
                </div>
            `;
        }

        const breakEvenContainer = document.getElementById('bi-break-even-container');
        if (breakEvenContainer) {
            if (breakEvenOS === Infinity) {
                breakEvenContainer.innerHTML = `
                    <div style="text-align: center; padding: 12px; color: var(--danger); font-weight: 600;">
                        <i class="ri-error-warning-line"></i> A margem de contribuição por OS é negativa ou nula (${formatCurrency(contributionMargin)}). 
                        Neste cenário, a operação gera prejuízo operacional em cada venda e o ponto de equilíbrio é inalcançável.
                    </div>
                `;
            } else {
                const percentProgress = Math.min((osCount / breakEvenOS) * 100, 100);
                const isMet = osCount >= breakEvenOS;
                breakEvenContainer.innerHTML = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center;">
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; font-weight: 600;">
                                <span>Progresso do Ponto de Equilíbrio</span>
                                <span style="color: ${isMet ? 'var(--success)' : 'var(--accent)'}">${osCount} de ${breakEvenOS} OSs</span>
                            </div>
                            <div style="background: var(--bg-primary); height: 16px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); position: relative; width: 100%;">
                                <div style="background: ${isMet ? 'linear-gradient(90deg, var(--success) 0%, #34d399 100%)' : 'linear-gradient(90deg, var(--accent) 0%, var(--accent-light) 100%)'}; width: ${percentProgress}%; height: 100%; border-radius: 6px; transition: width 0.5s ease-in-out;"></div>
                            </div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;">
                                ${isMet 
                                    ? `🎉 <strong>Break-even atingido!</strong> A empresa está gerando lucro líquido operacional neste período.` 
                                    : `Faltam <strong>${breakEvenOS - osCount} vistorias</strong> para atingir o ponto de equilíbrio financeiro e cobrir os custos fixos.`
                                }
                            </div>
                        </div>
                        <div style="border-left: 1px solid var(--border); padding-left: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                                <small style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Custos Fixos Totais</small>
                                <p style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 2px 0 0 0;">${formatCurrency(fixedExpensesVal)}</p>
                            </div>
                            <div>
                                <small style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Custo Variável Médio/OS</small>
                                <p style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 2px 0 0 0;">${formatCurrency(avgVariableCostPerOS)}</p>
                            </div>
                            <div>
                                <small style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Margem de Contribuição/OS</small>
                                <p style="font-size: 14px; font-weight: 700; color: var(--accent); margin: 2px 0 0 0;">${formatCurrency(contributionMargin)}</p>
                            </div>
                            <div>
                                <small style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Break-even OS Qtd</small>
                                <p style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 2px 0 0 0;">${breakEvenOS} OSs</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        renderBIWeeklyChart(nonCancelledOSs);
        renderBIShareChart(nonCancelledOSs, totalRevenue);
    }

    // 2. ABA RENTABILIDADE POR PARCEIRO
    if (currentBITab === 'parceiros') {
        const partnersTable = document.getElementById('bi-partners-rentabilidade-tbody');
        if (partnersTable) {
            const partnerRentability = db.parceiros.map(p => {
                const partnerOSs = nonCancelledOSs.filter(o => o.parceiroId === p.id);
                const count = partnerOSs.length;
                const revenue = partnerOSs.reduce((sum, o) => sum + o.valor, 0);
                const avgRevenue = count ? revenue / count : 0;
                const margin = count ? avgRevenue - avgCostPerOS : 0;
                return {
                    partner: p,
                    count: count,
                    revenue: revenue,
                    avgRevenue: avgRevenue,
                    margin: margin
                };
            });

            const activePartners = partnerRentability.filter(x => x.count > 0).sort((a, b) => b.margin - a.margin);

            if (activePartners.length === 0) {
                partnersTable.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 12px;">Nenhum parceiro realizou serviços no período selecionado.</td></tr>';
            } else {
                partnersTable.innerHTML = activePartners.map(ap => {
                    const statusText = ap.margin > 0.01 ? 'LUCRO' : (ap.margin < -0.01 ? 'PREJUÍZO' : 'EMPATE');
                    const badgeColor = ap.margin > 0.01 ? 'var(--success)' : (ap.margin < -0.01 ? 'var(--danger)' : 'var(--warning)');
                    const badgeBg = ap.margin > 0.01 ? 'var(--success-bg)' : (ap.margin < -0.01 ? 'var(--danger-bg)' : 'var(--warning-bg)');
                    return `
                        <tr>
                            <td><strong>${ap.partner.nome}</strong></td>
                            <td style="text-align: center;">${ap.count}</td>
                            <td style="text-align: right;">${formatCurrency(ap.avgRevenue)}</td>
                            <td style="text-align: right; color: var(--text-secondary);">${formatCurrency(avgCostPerOS)}</td>
                            <td style="text-align: right; font-weight: 600; color: ${ap.margin >= 0 ? 'var(--success)' : 'var(--danger)'}">${ap.margin >= 0 ? '+' : ''}${formatCurrency(ap.margin)}</td>
                            <td style="text-align: center;">
                                <span style="display: inline-block; padding: 4px 8px; border-radius: var(--radius-sm); font-size: 10px; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}40;">${statusText}</span>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            const selectPartner = document.getElementById('bi-parceiro-detalhe-select');
            if (selectPartner) {
                const activeList = db.parceiros.filter(p => nonCancelledOSs.some(o => o.parceiroId === p.id));
                const currentSel = selectPartner.value;
                selectPartner.innerHTML = activeList.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
                if (activeList.length === 0) {
                    selectPartner.innerHTML = '<option value="">Sem parceiros ativos</option>';
                } else {
                    if (currentSel && activeList.some(p => p.id === parseInt(currentSel))) {
                        selectPartner.value = currentSel;
                    }
                }
            }
            renderBIPartnersDetail();
        }
    }

    // 3. ABA VENDA MÉDIA POR SERVIÇO
    if (currentBITab === 'servicos') {
        const servicesTable = document.getElementById('bi-venda-media-servicos-tbody');
        if (servicesTable) {
            const serviceDetails = db.servicos.map(s => {
                const svcOSs = nonCancelledOSs.filter(o => o.servicoId === s.id && o.servicoId !== 7 && o.servicoId !== 8);
                const count = svcOSs.length;
                const val = svcOSs.reduce((sum, o) => sum + o.valor, 0);
                return {
                    id: s.id,
                    name: s.nome,
                    cat: s.categoria,
                    count: count,
                    val: val
                };
            });

            // Variações de Combo
            const comboOSs = nonCancelledOSs.filter(o => o.servicoId === 7 || (o.servicoNome.toUpperCase().includes('COMBO') && !o.servicoNome.toUpperCase().includes('TRANSFERÊNCIA')));
            const comboTransfOSs = nonCancelledOSs.filter(o => o.servicoId === 8 || o.servicoNome.toUpperCase().includes('TRANSFERÊNCIA COMBO'));

            const comboDetail = {
                id: 7,
                name: 'Vistoria Combo (Parceiros)',
                cat: 'Cautelar',
                count: comboOSs.length,
                val: comboOSs.reduce((sum, o) => sum + o.valor, 0)
            };

            const comboTransfDetail = {
                id: 8,
                name: 'Vistoria de Transferência Combo (Parceiros)',
                cat: 'Transferência',
                count: comboTransfOSs.length,
                val: comboTransfOSs.reduce((sum, o) => sum + o.valor, 0)
            };

            const allServices = [...serviceDetails];
            if (comboDetail.count > 0 || db.ordens_servico.some(o => o.servicoId === 7)) allServices.push(comboDetail);
            if (comboTransfDetail.count > 0 || db.ordens_servico.some(o => o.servicoId === 8)) allServices.push(comboTransfDetail);

            allServices.sort((a, b) => {
                const catOrder = { 'Transferência': 1, 'Cautelar': 2, 'Pesquisa': 3 };
                const orderA = catOrder[a.cat] || 4;
                const orderB = catOrder[b.cat] || 4;
                return orderA - orderB;
            });

            let html = allServices.map(s => {
                const avgSale = s.count ? s.val / s.count : 0;
                return `
                    <tr>
                        <td>
                            <strong>${s.name}</strong><br>
                            <small style="color: var(--text-secondary); text-transform: uppercase; font-size: 9px; font-weight: 700;">Natureza: ${s.cat}</small>
                        </td>
                        <td style="text-align: center; font-weight: 600;">${s.count}</td>
                        <td style="text-align: right; color: var(--success); font-weight: 500;">${formatCurrency(s.val)}</td>
                        <td style="text-align: right; font-weight: 700; color: var(--accent);">${formatCurrency(avgSale)}</td>
                    </tr>
                `;
            }).join('');

            const overallAvg = osCount ? totalRevenue / osCount : 0;
            html += `
                <tr style="background: rgba(212, 160, 23, 0.08); border-top: 2px solid var(--accent);">
                    <td><strong style="color: var(--accent);">MÉDIA / TOTAL CONSOLIDADO</strong></td>
                    <td style="text-align: center;"><strong style="color: var(--text-primary);">${osCount}</strong></td>
                    <td style="text-align: right;"><strong style="color: var(--success);">${formatCurrency(totalRevenue)}</strong></td>
                    <td style="text-align: right;"><strong style="color: var(--accent-light);">${formatCurrency(overallAvg)}</strong></td>
                </tr>
            `;

            servicesTable.innerHTML = html;
        }

        renderBIServicesRanking(nonCancelledOSs);
    }

    // 4. ABA CRESCIMENTO & PRODUTIVIDADE COMERCIAL
    if (currentBITab === 'produtividade') {
        let prevOSs = [];
        let hasComparison = false;
        let prevMonthLabel = "";
        
        if (period !== 'todos' && period !== '30') {
            const [year, month] = period.split('-').map(Number);
            let prevYear = year;
            let prevMonth = month - 1;
            if (prevMonth === 0) {
                prevMonth = 12;
                prevYear = year - 1;
            }
            const prevPeriodStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
            
            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
            prevMonthLabel = `${monthNames[prevMonth - 1]}/${prevYear}`;

            prevOSs = db.ordens_servico.filter(o => o.status !== 'cancelada' && o.criadoEm && o.criadoEm.startsWith(prevPeriodStr));
            if (unitFilter !== 'todas') {
                prevOSs = prevOSs.filter(o => o.unidadeId === parseInt(unitFilter));
            }
            hasComparison = true;
        } else if (period === '30') {
            const d30 = new Date();
            d30.setDate(today.getDate() - 30);
            const d60 = new Date();
            d60.setDate(today.getDate() - 60);

            prevOSs = db.ordens_servico.filter(o => o.status !== 'cancelada' && new Date(o.criadoEm) >= d60 && new Date(o.criadoEm) < d30);
            if (unitFilter !== 'todas') {
                prevOSs = prevOSs.filter(o => o.unidadeId === parseInt(unitFilter));
            }
            prevMonthLabel = "30 Dias Anteriores";
            hasComparison = true;
        }

        function countByNature(list) {
            let cautelares = 0;
            let transferencias = 0;
            let pesquisas = 0;
            list.forEach(o => {
                const s = db.servicos.find(x => x.id === o.servicoId);
                const cat = s ? s.categoria : '';
                const name = (o.servicoNome || '').toUpperCase();
                if (o.servicoId === 7 || cat === 'Cautelar' || (name.includes('COMBO') && !name.includes('TRANSFERÊNCIA')) || name.includes('CAUTELAR')) {
                    cautelares++;
                } else if (o.servicoId === 8 || cat === 'Transferência' || name.includes('TRANSFERÊNCIA')) {
                    transferencias++;
                } else if (o.servicoId === 5 || cat === 'Pesquisa' || name.includes('PESQUISA')) {
                    pesquisas++;
                }
            });
            return { cautelares, transferencias, pesquisas };
        }

        const curNature = countByNature(nonCancelledOSs);
        const prevNature = countByNature(prevOSs);

        const diagCard = document.getElementById('bi-diagnostico-comercial-card');
        if (diagCard) {
            if (!hasComparison) {
                diagCard.innerHTML = `
                    <div style="padding: 24px; text-align: center; color: var(--text-secondary);">
                        <i class="ri-information-line" style="font-size: 28px; color: var(--accent);"></i>
                        <p style="margin-top: 8px;">Selecione um mês específico para visualizar o comparativo de crescimento e produtividade comercial.</p>
                    </div>
                `;
            } else {
                const diffOS = osCount - prevOSs.length;
                const percentOS = prevOSs.length ? (diffOS / prevOSs.length) * 100 : 100;
                const isGrowing = diffOS >= 0;
                const activePartnersCurrent = new Set(nonCancelledOSs.filter(o => o.parceiroId).map(o => o.parceiroId)).size;
                const activePartnersPrev = new Set(prevOSs.filter(o => o.parceiroId).map(o => o.parceiroId)).size;

                diagCard.innerHTML = `
                    <div class="panel-card-header" style="border-bottom: 1px solid var(--border);">
                        <h3><i class="ri-pulse-line" style="color: ${isGrowing ? 'var(--success)' : 'var(--danger)'}"></i> Diagnóstico Comercial</h3>
                    </div>
                    <div class="panel-card-body" style="padding: 20px;">
                        <div style="display: flex; align-items: center; margin-bottom: 20px;">
                           <div style="width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; background: ${isGrowing ? 'var(--success-bg)' : 'var(--danger-bg)'}; color: ${isGrowing ? 'var(--success)' : 'var(--danger)'}; margin-right: 16px; border: 1px solid ${isGrowing ? 'var(--success)' : 'var(--danger)'}40;">
                               <i class="${isGrowing ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line'}"></i>
                           </div>
                           <div>
                               <h4 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 0;">Mês de ${isGrowing ? 'Expansão Comercial' : 'Retração Comercial'}</h4>
                               <p style="font-size: 11px; color: var(--text-secondary); margin: 2px 0 0 0;">Volume de serviços variou <strong>${isGrowing ? '+' : ''}${percentOS.toFixed(1)}%</strong> vs. mês anterior</p>
                           </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                           <div style="background: var(--bg-primary); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                               <small style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Parceiros Ativos</small>
                               <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                                   <span style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${activePartnersCurrent}</span>
                                   <small style="font-size: 10px; color: ${activePartnersCurrent >= activePartnersPrev ? 'var(--success)' : 'var(--danger)'}">
                                       (${activePartnersCurrent >= activePartnersPrev ? '+' : ''}${activePartnersCurrent - activePartnersPrev} vs. ${prevMonthLabel})
                                   </small>
                               </div>
                           </div>
                           <div style="background: var(--bg-primary); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                               <small style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Serviços Realizados</small>
                               <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                                   <span style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${osCount}</span>
                                   <small style="font-size: 10px; color: ${isGrowing ? 'var(--success)' : 'var(--danger)'}">
                                       (${isGrowing ? '+' : ''}${diffOS} OSs)
                                   </small>
                               </div>
                           </div>
                        </div>

                        <div style="margin-top: 16px; font-size: 11px; line-height: 1.5; color: var(--text-secondary); border-top: 1px solid var(--border); padding-top: 12px;">
                           <strong>Métricas Comparativas</strong>:<br>
                           - Parceiros Ativos no Mês Anterior (${prevMonthLabel}): <strong>${activePartnersPrev}</strong><br>
                           - Total OSs no Mês Anterior (${prevMonthLabel}): <strong>${prevOSs.length} OSs</strong>
                        </div>
                    </div>
                `;
            }
        }

        const prodTbody = document.getElementById('bi-produtividade-tbody');
        if (prodTbody) {
            if (!hasComparison) {
                prodTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 12px;">Selecione um período comparativo no filtro superior.</td></tr>';
            } else {
                const categories = [
                    { name: 'Vistorias Cautelares', cur: curNature.cautelares, prev: prevNature.cautelares },
                    { name: 'Vistorias de Transferência', cur: curNature.transferencias, prev: prevNature.transferencias },
                    { name: 'Pesquisas Veiculares', cur: curNature.pesquisas, prev: prevNature.pesquisas }
                ];

                prodTbody.innerHTML = categories.map(c => {
                    const diff = c.cur - c.prev;
                    const diffPct = c.prev ? (diff / c.prev) * 100 : 100;
                    const isGrowing = diff >= 0;
                    return `
                        <tr>
                            <td><strong>${c.name}</strong></td>
                            <td style="text-align: center; color: var(--text-secondary);">${c.prev}</td>
                            <td style="text-align: center; font-weight: 700; color: var(--text-primary);">${c.cur}</td>
                            <td style="text-align: center; font-weight: 600; color: ${isGrowing ? 'var(--success)' : 'var(--danger)'}">
                                ${isGrowing ? '+' : ''}${diff}
                            </td>
                            <td style="text-align: center; font-weight: 700; color: ${isGrowing ? 'var(--success)' : 'var(--danger)'}">
                                ${isGrowing ? '+' : ''}${diffPct.toFixed(1)}%
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }
    }
}

function renderBIPartnersDetail() {
    const selectPartner = document.getElementById('bi-parceiro-detalhe-select');
    const tbody = document.getElementById('bi-partner-services-tbody');
    if (!selectPartner || !tbody) return;

    const partnerId = parseInt(selectPartner.value);
    if (!partnerId) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 12px;">Nenhum parceiro ativo no período selecionado.</td></tr>';
        return;
    }

    const period = document.getElementById('bi-filtro-periodo').value;
    const unitFilter = document.getElementById('bi-filtro-unidade').value;

    let OSs = [];
    const today = new Date();

    if (period === '30') {
        const startDate = new Date();
        startDate.setDate(today.getDate() - 30);
        OSs = db.ordens_servico.filter(o => new Date(o.criadoEm) >= startDate);
    } else if (period === 'todos') {
        OSs = [...db.ordens_servico];
    } else {
        OSs = db.ordens_servico.filter(o => o.criadoEm && o.criadoEm.startsWith(period));
    }

    if (unitFilter !== 'todas') {
        OSs = OSs.filter(o => o.unidadeId === parseInt(unitFilter));
    }

    const partnerOSs = OSs.filter(o => o.status !== 'cancelada' && o.parceiroId === partnerId);
    
    const grouped = {};
    partnerOSs.forEach(o => {
        if (!grouped[o.servicoId]) {
            grouped[o.servicoId] = {
                name: o.servicoNome,
                count: 0,
                totalVal: 0
            };
        }
        grouped[o.servicoId].count++;
        grouped[o.servicoId].totalVal += o.valor;
    });

    const servicesList = Object.keys(grouped).map(svcId => {
        const id = parseInt(svcId);
        const g = grouped[svcId];
        const avgPrice = g.totalVal / g.count;
        const margin = avgPrice - window.currentBIAvgCostPerOS;
        return {
            id: id,
            name: g.name,
            count: g.count,
            price: avgPrice,
            margin: margin
        };
    });

    if (servicesList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 12px;">Sem serviços registrados para este parceiro no período.</td></tr>';
    } else {
        tbody.innerHTML = servicesList.map(s => {
            const statusText = s.margin > 0.01 ? 'LUCRO' : (s.margin < -0.01 ? 'PREJUÍZO' : 'EMPATE');
            const badgeColor = s.margin > 0.01 ? 'var(--success)' : (s.margin < -0.01 ? 'var(--danger)' : 'var(--warning)');
            const badgeBg = s.margin > 0.01 ? 'var(--success-bg)' : (s.margin < -0.01 ? 'var(--danger-bg)' : 'var(--warning-bg)');
            return `
                <tr>
                    <td><strong>${s.name.split(' — ')[0]}</strong></td>
                    <td style="text-align: center;">${s.count}</td>
                    <td style="text-align: right;">${formatCurrency(s.price)}</td>
                    <td style="text-align: right; font-weight: 600; color: ${s.margin >= 0 ? 'var(--success)' : 'var(--danger)'}">${s.margin >= 0 ? '+' : ''}${formatCurrency(s.margin)}</td>
                    <td style="text-align: center;">
                        <span style="display: inline-block; padding: 3px 6px; border-radius: var(--radius-sm); font-size: 10px; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}40;">${statusText}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }
}

function renderBIWeeklyChart(OSs) {
    const chart = document.getElementById('bi-chart-semanal');
    if (!chart) return;
    
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
    if (!chart) return;
    
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
    if (!container) return;
    
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
    // Mantida vazia por compatibilidade e segurança, já que a tabela foi substituída pelo ranking detalhado na Aba 2
    return;
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
    
    const tabZap = document.getElementById('tab-cfg-whatsapp');
    if (tabZap) tabZap.style.display = tab === 'whatsapp' ? 'block' : 'none';
    
    const tabAuditoria = document.getElementById('tab-cfg-auditoria');
    if (tabAuditoria) tabAuditoria.style.display = tab === 'auditoria' ? 'block' : 'none';

    if (tab === 'precos') renderConfigPrecos();
    if (tab === 'parceiros') renderConfigParceiros();
    if (tab === 'operadores') renderConfigOperadores();
    if (tab === 'portarias') renderConfigPortarias();
    if (tab === 'whatsapp') renderConfigWhatsApp();
    if (tab === 'auditoria') runIntegrityAudit();
}

function renderConfigPage() {
    if (currentConfigTab === 'precos') renderConfigPrecos();
    else if (currentConfigTab === 'parceiros') renderConfigParceiros();
    else if (currentConfigTab === 'operadores') renderConfigOperadores();
    else if (currentConfigTab === 'portarias') renderConfigPortarias();
    else if (currentConfigTab === 'whatsapp') renderConfigWhatsApp();
    else if (currentConfigTab === 'auditoria') runIntegrityAudit();
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
        const sortedPartners = [...db.parceiros].sort((a, b) => a.nome.localeCompare(b.nome));
        tbody.innerHTML = sortedPartners.map(p => `
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
    const whatsapp = document.getElementById('cfg-part-whatsapp').value.trim();
    const email = document.getElementById('cfg-part-email').value.trim();
    const fat = document.getElementById('cfg-part-faturamento').checked;
    const shopping = document.getElementById('cfg-part-shopping').checked;
    const obs = document.getElementById('cfg-part-obs').value.trim();

    // Build Price table map (excluding Exotic Cars ID 6)
    let customPrecos = {};
    db.servicos.filter(s => s.id !== 6).forEach(s => {
        const val = parseFloat(document.querySelector(`input[name="matrix-price-${s.id}"]`).value);
        customPrecos[s.id] = val;
    });

    const precoCombo = parseFloat(document.getElementById('cfg-part-preco-combo').value) || 0;
    const precoComboTransf = parseFloat(document.getElementById('cfg-part-preco-combo-transf').value) || 0;

    const partnerPayload = {
        nome: nome,
        cnpj: cnpj,
        responsavel: responsavel,
        telefone: tel,
        whatsapp: whatsapp,
        email: email,
        usaFaturamento: fat,
        observacoes: obs,
        tabelaPrecos: customPrecos,
        parceiroShopping: shopping,
        precoCombo: precoCombo,
        precoComboTransferencia: precoComboTransf
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
    document.getElementById('cfg-part-whatsapp').value = partner.whatsapp || '';
    document.getElementById('cfg-part-email').value = partner.email || '';
    document.getElementById('cfg-part-faturamento').checked = partner.usaFaturamento;
    document.getElementById('cfg-part-shopping').checked = !!partner.parceiroShopping;
    document.getElementById('cfg-part-preco-combo').value = partner.precoCombo !== undefined ? partner.precoCombo : '';
    document.getElementById('cfg-part-preco-combo-transf').value = partner.precoComboTransferencia !== undefined ? partner.precoComboTransferencia : '';
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
    if (!db || !db.unidades) return;
    
    // Unidades select options
    const opUnitSelect = document.getElementById('cfg-op-unidade');
    opUnitSelect.innerHTML = db.unidades.map(u => `<option value="${u.id}">${u.nome.split(' — ')[1] || u.nome}</option>`).join('');

    // Operators list
    const tbodyOps = document.getElementById('cfg-operators-tbody');
    tbodyOps.innerHTML = db.operadores.map(o => {
        const unit = db.unidades.find(u => u.id === o.unidadeId);
        return `
            <tr>
                <td><strong>${o.login}</strong></td>
                <td>${o.nome}</td>
                <td>${unit ? (unit.nome.split(' — ')[1] || unit.nome) : '—'}</td>
                <td>${o.ativo ? '🟢 Ativo' : '🔴 Inativo'}</td>
                <td style="text-align: center;">
                    <button class="btn btn-secondary btn-sm" onclick="abrirEdicaoOperador(${o.id})" style="padding: 2px 6px; font-size: 11px;"><i class="ri-edit-line"></i> Editar</button>
                </td>
            </tr>
        `;
    }).join('');

    // Units list
    const tbodyUnits = document.getElementById('cfg-units-tbody');
    tbodyUnits.innerHTML = db.unidades.map(u => `
        <tr>
            <td><strong>${u.nome}</strong></td>
            <td>${u.endereco}</td>
            <td style="text-align: center;">
                <button class="btn btn-secondary btn-sm" onclick="abrirEdicaoUnidade(${u.id})" style="padding: 2px 6px; font-size: 11px;"><i class="ri-edit-line"></i> Editar</button>
            </td>
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

/**
 * Abre o modal de edição de operador e preenche com os dados atuais.
 */
function abrirEdicaoOperador(opId) {
    if (!db) return;
    const op = db.operadores.find(o => o.id === opId);
    if (!op) return;

    document.getElementById('edit-op-id').value = op.id;
    document.getElementById('edit-op-nome').value = op.nome;
    document.getElementById('edit-op-login').value = op.login;
    document.getElementById('edit-op-senha').value = op.senha;
    document.getElementById('edit-op-ativo').value = op.ativo ? "true" : "false";

    // Preenche select de unidades designadas
    const select = document.getElementById('edit-op-unidade');
    select.innerHTML = db.unidades.map(u => `<option value="${u.id}">${u.nome.split(' — ')[1] || u.nome}</option>`).join('');
    select.value = op.unidadeId;

    // Marca as checkboxes de permissões
    const checkboxes = document.querySelectorAll('.edit-op-perm');
    checkboxes.forEach(cb => {
        cb.checked = op.permissoes ? op.permissoes.includes(cb.value) : false;
    });

    document.getElementById('modal-editar-operador').classList.add('active');
}

/**
 * Salva as alterações do operador no banco e sincroniza com LocalStorage/Supabase.
 */
async function salvarEdicaoOperador(event) {
    event.preventDefault();
    const opId = parseInt(document.getElementById('edit-op-id').value);
    const nome = document.getElementById('edit-op-nome').value.trim();
    const senha = document.getElementById('edit-op-senha').value.trim();
    const unitId = parseInt(document.getElementById('edit-op-unidade').value);
    const ativo = document.getElementById('edit-op-ativo').value === "true";

    // Coleta permissões marcadas no modal
    const checkedPerms = Array.from(document.querySelectorAll('.edit-op-perm:checked')).map(el => el.value);

    const op = db.operadores.find(o => o.id === opId);
    if (!op) return;

    op.nome = nome;
    op.senha = senha;
    op.unidadeId = unitId;
    op.ativo = ativo;
    op.permissoes = checkedPerms;
    op.funcao = checkedPerms.includes("bi") ? "Gerente" : "Operador";

    saveDatabase();

    // Sincroniza com o Supabase online
    if (window.useSupabase) {
        try {
            await sbUpdate('operadores', opId, {
                nome: op.nome,
                senha: op.senha,
                unidadeId: op.unidadeId,
                ativo: op.ativo,
                permissoes: op.permissoes,
                funcao: op.funcao
            });
        } catch (e) {
            console.warn("Supabase update warning for operator:", e);
        }
    }

    logAudit("Edição Operador", `Editou configurações do operador: ${op.login}`);
    showToast("Operador atualizado com sucesso!", "success");

    // Fecha modal e recarrega
    document.getElementById('modal-editar-operador').classList.remove('active');
    renderConfigOperadores();

    // Se editou a si mesmo, força atualização da sessão ativa
    if (currentSession && currentSession.id === opId) {
        currentSession.nome = op.nome;
        currentSession.funcao = op.funcao;
        currentSession.permissoes = op.permissoes;
        sessionStorage.setItem('certive_session', JSON.stringify(currentSession));
        checkSession(); // Re-avalia menus
    }
}

/**
 * Abre o modal de edição de unidade e preenche com os dados atuais.
 */
function abrirEdicaoUnidade(unitId) {
    if (!db) return;
    const unit = db.unidades.find(u => u.id === unitId);
    if (!unit) return;

    document.getElementById('edit-unit-id').value = unit.id;
    document.getElementById('edit-unit-nome').value = unit.nome;
    document.getElementById('edit-unit-endereco').value = unit.endereco;

    document.getElementById('modal-editar-unidade').classList.add('active');
}

/**
 * Salva as alterações da unidade no banco e sincroniza com LocalStorage/Supabase.
 */
async function salvarEdicaoUnidade(event) {
    event.preventDefault();
    const unitId = parseInt(document.getElementById('edit-unit-id').value);
    const nome = document.getElementById('edit-unit-nome').value.trim();
    const endereco = document.getElementById('edit-unit-endereco').value.trim();

    const unit = db.unidades.find(u => u.id === unitId);
    if (!unit) return;

    unit.nome = nome;
    unit.endereco = endereco;

    saveDatabase();

    // Sincroniza com o Supabase online
    if (window.useSupabase) {
        try {
            await sbUpdate('unidades', unitId, {
                nome: unit.nome,
                endereco: unit.endereco
            });
        } catch (e) {
            console.warn("Supabase update warning for unit:", e);
        }
    }

    logAudit("Edição Unidade", `Editou filial: ${unit.nome}`);
    showToast("Unidade atualizada com sucesso!", "success");

    // Fecha modal e recarrega
    document.getElementById('modal-editar-unidade').classList.remove('active');
    
    renderUnitSelectorOptions();
    renderConfigOperadores();
}

// Formatting helpers
function maskPlaca(v) {
    v = v.replace(/[^A-Za-z0-9]/g, '').slice(0, 7);
    return v.length > 3 ? v.slice(0, 3) + '-' + v.slice(3) : v;
}

function checkPlacaLength() {
    const placaInput = document.getElementById('os-placa');
    const btnConsultar = document.getElementById('btn-consultar-placa');
    if (!placaInput || !btnConsultar) return;
    
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
    if (!placaInput || !btnConsultar) return;
    
    const placa = placaInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length !== 7) return;

    btnConsultar.disabled = true;
    const originalIcon = btnConsultar.innerHTML;
    btnConsultar.innerHTML = '<i class="ri-loader-4-line" style="animation: spin 1s linear infinite;"></i>';

    try {
        if (typeof supabaseClient === 'undefined' || supabaseClient === null) {
            showToast("Supabase não configurado para consulta de placa.", "error");
            return;
        }

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
            
            const marca = data.marca || '';
            const modelo = data.modelo || '';
            const inputVeiculo = document.getElementById('os-veiculo-marca-modelo');
            if (inputVeiculo) {
                inputVeiculo.value = (marca + (marca && modelo ? ' / ' : '') + modelo).trim();
            }
            
            const inputAno = document.getElementById('os-veiculo-ano');
            if (inputAno) {
                inputAno.value = data.ano_modelo || data.ano_fabricacao || '';
            }
            
            const inputRenavam = document.getElementById('os-renavam');
            if (inputRenavam && !inputRenavam.value) {
                inputRenavam.value = data.renavam || '';
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

    // Sincronização inicial de taxas flutuantes do DETRAN
    if (typeof window.syncDetranFloatingPayable === 'function') {
        window.syncDetranFloatingPayable().catch(err => console.error("Erro na sincronização inicial DETRAN:", err));
    }
    
    // Remove o overlay de loading da inicialização de dados
    const initialLoadingOverlay = document.getElementById('app-loading-overlay');
    if (initialLoadingOverlay) {
        initialLoadingOverlay.style.opacity = '0';
        setTimeout(() => {
            initialLoadingOverlay.style.display = 'none';
        }, 300);
    }
    
    // 2. Validate current session and display screens
    checkSession();

    // Auto-recuperação do Modo Dia Reaberto caso o caixa já tenha sido fechado
    if (window.modoDiaReaberto && window.caixaReabertoId) {
        const c = db.caixa_diario.find(x => x.id === window.caixaReabertoId);
        if (c && c.status === 'fechado') {
            console.log("♻️ Auto-recuperação: caixa reaberto " + window.caixaReabertoId + " já está fechado no banco. Limpando modo dia reaberto.");
            window.modoDiaReaberto = false;
            window.dataDiaReaberto = null;
            window.caixaReabertoId = null;
            localStorage.removeItem('certive_modoDiaReaberto');
            localStorage.removeItem('certive_dataDiaReaberto');
            localStorage.removeItem('certive_caixaReabertoId');
            const banner = document.getElementById('dia-reaberto-banner');
            if (banner) banner.style.display = 'none';
        }
    }

    // Hook especial para laudo teste de demonstração
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test_laudo') === 'true') {
        // Auto-login como Ricardo Administrador se não logado
        sessionStorage.setItem('certive_session', JSON.stringify({
            id: 1,
            nome: "Ricardo Administrador (Teste)",
            login: "admin",
            funcao: "Gerente Geral",
            unidadeId: 1,
            permissoes: ["abertura_os", "caixa", "faturamento", "contas", "cadastros", "bi", "registrar_cautelar", "finalizar_cautelar", "cautelar_administrar"]
        }));
        currentSession = JSON.parse(sessionStorage.getItem('certive_session'));
        const loginOv = document.getElementById('login-overlay');
        if (loginOv) loginOv.classList.add('hidden');
        
        const usernameEl = document.getElementById('topbar-username');
        if (usernameEl) usernameEl.textContent = currentSession.nome;
        
        const userroleEl = document.getElementById('topbar-userrole');
        if (userroleEl) userroleEl.textContent = currentSession.funcao;
        
        // Criar laudo teste se não existir
        const testCautelarId = 999;
        const testOsId = 9999;
        
        // Remove antigo se existir para atualizar fotos/valores
        db.ordens_servico = db.ordens_servico.filter(o => o.id !== testOsId);
        db.cautelares = db.cautelares.filter(c => c.id !== testCautelarId);
        db.cautelares_secoes = db.cautelares_secoes.filter(s => s.cautelarId !== testCautelarId);
        db.cautelares_fotos = db.cautelares_fotos.filter(f => f.secaoId !== 10999 && f.secaoId !== 20999 && f.secaoId !== 30999 && f.secaoId !== 40999 && f.secaoId !== 50999 && f.secaoId !== 60999 && f.secaoId !== 70999 && f.secaoId !== 80999);

        // Injeta OS Teste
        db.ordens_servico.push({
            id: testOsId,
            numero: "OS-9999",
            criadoEm: new Date().toISOString(),
            criadoPor: "Ricardo Administrador",
            unidadeId: 1,
            clienteTipo: "parceiro",
            parceiroId: 1,
            clienteNome: "TOYOTA COROLLA XEI 2.0",
            clienteCpfCnpj: "45.890.122/0001-08",
            clienteCelular: "(48) 99999-9999",
            placa: "ATO-0I28",
            renavam: "9BRB03HE0L2567890",
            servicoId: 4,
            servicoNome: "VISTORIA CAUTELAR",
            valor: 350.00,
            observacoes: "Corolla Prata Teste",
            pago: true,
            formaPagamento: "pix",
            docVeiculoApresentado: true,
            docIdentificacaoApresentado: true,
            status: "concluida_aprovada",
            finalizadoEm: new Date().toISOString(),
            finalizadoPor: "Ricardo Administrador"
        });

        // Injeta Cautelar Teste
        db.cautelares.push({
            id: testCautelarId,
            osId: testOsId,
            dossieNumero: "CV-2026-070201",
            status: "concluida",
            vistoriadorId: 1,
            finalizadoPorId: 1,
            dataHoraInicio: new Date().toISOString(),
            dataHoraEnvio: new Date().toISOString(),
            dataHoraFinalizacao: new Date().toISOString(),
            parecerConsolidado: "conforme",
            parecerTexto: "Laudo demonstrativo preenchido.",
            hashLaudo: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            parecerFinal: "conforme"
        });

        // Injeta Seções Teste
        db.cautelares_secoes.push({ id: 10999, cautelarId: testCautelarId, numeroSecao: 1, status: "completa", dadosJson: { quilometragem: "79.424", estadoConservacao: "excelente", combustivel: "ALCOOL / GASOLINA" } });
        db.cautelares_secoes.push({ id: 20999, cautelarId: testCautelarId, numeroSecao: 2, status: "completa", dadosJson: { chassiLido: "9BRB03HE0L2567890", motorLido: "3ZR-FAE L256789" } });
        db.cautelares_secoes.push({ id: 30999, cautelarId: testCautelarId, numeroSecao: 3, status: "completa", dadosJson: { parecerEstrutural: "conforme", observacao: "Não foram identificados sinais de sinistro, corte estrutural ou soldas." } });
        db.cautelares_secoes.push({ id: 40999, cautelarId: testCautelarId, numeroSecao: 4, status: "completa", dadosJson: { painel_0: "112", painel_1: "118", painel_2: "142", painel_3: "135", painel_4: "138", painel_5: "108", painel_6: "126", painel_7: "248", painel_8: "236", painel_9: "122", painel_10: "115" } });
        db.cautelares_secoes.push({ id: 50999, cautelarId: testCautelarId, numeroSecao: 5, status: "completa", dadosJson: {} });
        db.cautelares_secoes.push({ id: 60999, cautelarId: testCautelarId, numeroSecao: 6, status: "completa", dadosJson: { reparoMotor: "nao", corMotorOk: "sim" } });
        db.cautelares_secoes.push({ id: 70999, cautelarId: testCautelarId, numeroSecao: 7, status: "completa", dadosJson: { intervencaoQuadros: "nao", conservacaoInterior: "excelente" } });
        db.cautelares_secoes.push({ id: 80999, cautelarId: testCautelarId, numeroSecao: 8, status: "completa", dadosJson: { signatureBase64: "" } });

        // Injeta Fotos Teste
        db.cautelares_fotos.push({ id: 100099, secaoId: 10999, slotCodigo: "frente_45_dir", url_thumb: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100199, secaoId: 10999, slotCodigo: "traseira_45_esq", url_thumb: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100299, secaoId: 20999, slotCodigo: "chassi_gravado", url_thumb: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100399, secaoId: 30999, slotCodigo: "longarina_diant_esq", url_thumb: "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100499, secaoId: 30999, slotCodigo: "assoalho_porta_malas", url_thumb: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100599, secaoId: 40999, slotCodigo: "medidor_pintura_uso", url_thumb: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100699, secaoId: 50999, slotCodigo: "vidro_parabrisa", url_thumb: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100799, secaoId: 50999, slotCodigo: "vidro_porta_diant_esq", url_thumb: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100899, secaoId: 50999, slotCodigo: "vidro_traseiro", url_thumb: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=600&q=80", metadados_json: {} });
        db.cautelares_fotos.push({ id: 100999, secaoId: 60999, slotCodigo: "motor_vista_geral", url_thumb: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=600&q=80", metadados_json: {} });

        saveDatabase();

        // Injeta folha de estilos do visualizador tela cheia
        const style = document.createElement('style');
        style.id = 'demo-laudo-styles';
        style.innerHTML = `
            .sidebar, .topbar, #login-overlay {
                display: none !important;
            }
            .main-content {
                margin-left: 0 !important;
                padding: 0 !important;
                width: 100vw !important;
                max-width: 100vw !important;
                height: 100vh !important;
                background: #1a1d22 !important;
            }
            #cautelar-finalizacao-view {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 99999 !important;
                grid-template-columns: 1fr !important;
                display: flex !important;
                flex-direction: column !important;
            }
            #cautelar-finalizacao-view > div:first-child {
                display: none !important;
            }
            #cautelar-finalizacao-view > div:last-child {
                max-height: 100vh !important;
                height: 100vh !important;
                width: 100vw !important;
                padding: 85px 20px 40px 20px !important;
                background: #1a1d22 !important;
                overflow-y: auto !important;
                box-sizing: border-box !important;
            }
        `;
        document.head.appendChild(style);

        // Adiciona barra flutuante de controle
        const controls = document.createElement('div');
        controls.style.cssText = "position: fixed; top: 15px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; background: rgba(10, 31, 61, 0.95); border: 1.5px solid #C9A961; padding: 10px 20px; border-radius: 30px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 100000; backdrop-filter: blur(10px); font-family: 'Outfit', sans-serif;";
        controls.innerHTML = `
            <span style="color: white; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-right: 1.5px solid rgba(255,255,255,0.15); padding-right: 12px; margin-right: 4px;">📂 LAUDO TESTE COROLLA</span>
            <button onclick="window.exibirPdfCautelar(999)" style="background: #C9A961; border: none; color: #050E1A; padding: 6px 16px; border-radius: 20px; font-size: 11px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: transform 0.2s;"><i class="ri-file-pdf-line" style="font-size:14px;"></i> BAIXAR PDF OFICIAL</button>
            <button onclick="window.location.href='app.html'" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: white; padding: 6px 16px; border-radius: 20px; font-size: 11px; font-weight: 700; cursor: pointer; transition: background 0.2s;">VOLTAR PARA O ERP</button>
        `;
        document.body.appendChild(controls);

        setTimeout(() => {
            verResumoCautelar(testCautelarId);
        }, 400);
    }

    if (window.modoDiaReaberto && window.dataDiaReaberto) {
        const banner = document.getElementById('dia-reaberto-banner');
        if (banner) {
            banner.style.display = 'flex';
            document.getElementById('dia-reaberto-data-label').textContent = formatDateBr(window.dataDiaReaberto);
        }
    }

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

async function liquidateInvoiceDirect(invoiceId) {
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;

    const invoice = db.faturas.find(f => f.id === invoiceId);
    if (!invoice || invoice.pago) return;

    try {
        invoice.pago = true;
        invoice.pagoEm = new Date().toISOString();

        invoice.ordensIds.forEach(id => {
            const os = db.ordens_servico.find(o => o.id === id);
            if (os) os.pago = true;
        });

        const partner = db.parceiros.find(p => p.id === invoice.parceiroId);
        const newMov = {
            caixaId: activeCaixa.id,
            tipo: "entrada",
            valor: invoice.valorTotal,
            descricao: `Recebimento Fatura (Boleto) ${invoice.codigo} — ${partner.nome}`,
            formaPagamento: "pix",
            data: new Date().toISOString(),
            operador: currentSession.nome,
            osId: null,
            faturaId: invoice.id
        };

        if (window.useSupabase) {
            const insertedMov = await sbInsert('caixa_movimentos', newMov);
            db.caixa_movimentos.unshift(insertedMov);

            await dbSave('faturas', { pago: true, pagoEm: invoice.pagoEm }, 'update', invoice.id);

            for (const osId of invoice.ordensIds) {
                await dbSave('ordens_servico', { pago: true }, 'update', osId);
            }
        } else {
            newMov.id = db.caixa_movimentos.length + 1;
            db.caixa_movimentos.push(newMov);
        }

        saveDatabase();
    } catch (err) {
        console.error("Erro na liquidação direta da fatura:", err);
    }
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

// ==========================================
// PAYMENT METHOD MODIFICATION (OS FINALIZADA)
// ==========================================

function openChangePaymentModal(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    // Limpa campos de dividido residuais
    document.getElementById('alt-pag-div-valor-1').value = "";
    document.getElementById('alt-pag-div-valor-2').value = "";
    document.getElementById('alt-pag-div-forma-1').value = "pix";
    document.getElementById('alt-pag-div-forma-2').value = "especie";

    // Preenche dados da OS no modal
    document.getElementById('alt-pag-os-id').value = os.id;
    document.getElementById('alt-pag-os-numero').textContent = os.numero;
    document.getElementById('alt-pag-os-placa').textContent = os.placa;
    document.getElementById('alt-pag-os-valor').textContent = formatCurrency(os.valor);
    
    // Status text mapping
    const statusMap = {
        'concluida_aprovada': '✅ APROVADA',
        'concluida_reprovada': '❌ REPROVADA'
    };
    document.getElementById('alt-pag-os-status-vistoria').textContent = statusMap[os.status] || os.status;
    
    // Configura valor da forma de pagamento e parcelas
    const formaSelect = document.getElementById('alt-pag-forma');
    formaSelect.value = os.formaPagamento;
    
    if (os.formaPagamento === 'credito_parcelado') {
        document.getElementById('alt-pag-parcelas').value = os.parcelas || "1";
    } else if (os.formaPagamento === 'dividido') {
        const splitData = parseDividedPayment(os.observacoes);
        if (splitData) {
            document.getElementById('alt-pag-div-forma-1').value = splitData[0].forma;
            document.getElementById('alt-pag-div-valor-1').value = splitData[0].valor.toFixed(2);
            document.getElementById('alt-pag-div-forma-2').value = splitData[1].forma;
            document.getElementById('alt-pag-div-valor-2').value = splitData[1].valor.toFixed(2);
        }
    }
    toggleInstallmentsChangePayment();

    // Data de pagamento: padrão hoje local formatado YYYY-MM-DD
    const todayLocal = new Date().toLocaleDateString('sv-SE'); // Formato YYYY-MM-DD local
    document.getElementById('alt-pag-data').value = todayLocal;

    // Reseta justificativa
    document.getElementById('alt-pag-justificativa').value = "";

    // Configura opções de Faturamento:
    // Se o cliente for particular, bloqueia a opção de faturamento para evitar erros.
    const fatOption = formaSelect.querySelector('option[value="faturamento"]');
    if (os.clienteTipo !== 'parceiro') {
        fatOption.disabled = true;
        fatOption.textContent = "Faturamento Mensal (Bloqueado para Particular)";
    } else {
        fatOption.disabled = false;
        fatOption.textContent = "Faturamento Mensal (Apenas parceiros habilitados)";
    }

    // Exibe o modal
    document.getElementById('modal-alterar-pagamento').classList.add('active');
}

function closeChangePaymentModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-alterar-pagamento').classList.remove('active');
}

function toggleInstallmentsChangePayment() {
    const forma = document.getElementById('alt-pag-forma').value;
    const group = document.getElementById('alt-pag-parcelas-group');
    const divGroup = document.getElementById('alt-pag-dividido-group');
    
    if (forma === 'credito_parcelado') {
        group.style.display = 'block';
        if (divGroup) divGroup.style.display = 'none';
    } else if (forma === 'dividido') {
        group.style.display = 'none';
        if (divGroup) {
            divGroup.style.display = 'block';
            const val1 = parseFloat(document.getElementById('alt-pag-div-valor-1').value) || 0;
            const val2 = parseFloat(document.getElementById('alt-pag-div-valor-2').value) || 0;
            if (val1 === 0 && val2 === 0) {
                const osId = parseInt(document.getElementById('alt-pag-os-id').value);
                const os = db.ordens_servico.find(o => o.id === osId);
                if (os) {
                    document.getElementById('alt-pag-div-valor-1').value = (os.valor / 2).toFixed(2);
                    document.getElementById('alt-pag-div-valor-2').value = (os.valor / 2).toFixed(2);
                }
            }
        }
    } else {
        group.style.display = 'none';
        if (divGroup) divGroup.style.display = 'none';
    }
}

async function submitChangePayment(event) {
    event.preventDefault();

    const osId = parseInt(document.getElementById('alt-pag-os-id').value);
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) {
        showToast("Erro: Ordem de Serviço não encontrada.", "error");
        return;
    }

    const newForma = document.getElementById('alt-pag-forma').value;
    const newParcelas = newForma === 'credito_parcelado' ? parseInt(document.getElementById('alt-pag-parcelas').value) : null;
    const inputDataPagamento = document.getElementById('alt-pag-data').value; // YYYY-MM-DD
    const justificativa = document.getElementById('alt-pag-justificativa').value.trim();

    if (!justificativa) {
        showToast("Erro: A justificativa é obrigatória.", "error");
        return;
    }

    // 1. Validação de Faturamento para Particular
    if (newForma === 'faturamento') {
        if (os.clienteTipo !== 'parceiro' || !os.parceiroId) {
            showToast("Erro: Faturamento mensal é permitido apenas para clientes do tipo Parceiro.", "error");
            return;
        }
    }

    // 2. Proteção para Caixa Fechado
    const targetCaixa = db.caixa_diario.find(c => c.unidadeId === os.unidadeId && c.data === inputDataPagamento);
    if (targetCaixa && targetCaixa.status === 'fechado') {
        const confirmAdjust = confirm(`Atenção: O caixa de destino da data ${formatDateBr(inputDataPagamento)} já está fechado.\nA alteração irá modificar o fechamento contábil histórico.\n\nDeseja prosseguir mesmo assim?`);
        if (!confirmAdjust) return;
    }

    const oldForma = os.formaPagamento;
    const oldFaturaId = os.faturaId;

    try {

        // TRANSITIONS LOGIC
        
        // Se a forma de pagamento antiga era Faturamento:
        if (oldForma === 'faturamento' && oldFaturaId) {
            const fat = db.faturas.find(f => f.id == oldFaturaId);
            if (fat) {
                // Remove a OS do array de faturas
                fat.ordensIds = fat.ordensIds.filter(id => id !== os.id);
                fat.valorTotal = fat.valorTotal - os.valor;

                if (fat.ordensIds.length === 0) {
                    // A fatura ficou vazia, deve ser deletada
                    if (window.useSupabase) {
                        await sbDeleteWhere('faturas', 'id', fat.id);
                    }
                    db.faturas = db.faturas.filter(f => f.id !== fat.id);

                    // Se a fatura estava paga, existia uma entrada de caixa correspondente à baixa dessa fatura.
                    // Vamos localizar e remover essa entrada de baixa de fatura para não ter duplicidade.
                    const fatPaymentMov = db.caixa_movimentos.find(m => m.faturaId == fat.id && m.tipo === 'entrada');
                    if (fatPaymentMov) {
                        if (window.useSupabase) {
                            await sbDeleteWhere('caixa_movimentos', 'id', fatPaymentMov.id);
                        }
                        db.caixa_movimentos = db.caixa_movimentos.filter(m => m.id !== fatPaymentMov.id);
                    }
                } else {
                    // Fatura ainda tem outras OSs
                    if (window.useSupabase) {
                        await sbUpdate('faturas', fat.id, {
                            ordensIds: fat.ordensIds,
                            valorTotal: fat.valorTotal
                        });
                    }
                    
                    // Se a fatura já estava paga, reduzir o valor da movimentação da baixa da fatura
                    if (fat.pago) {
                        const fatPaymentMov = db.caixa_movimentos.find(m => m.faturaId == fat.id && m.tipo === 'entrada');
                        if (fatPaymentMov) {
                            fatPaymentMov.valor = fat.valorTotal;
                            if (window.useSupabase) {
                                await sbUpdate('caixa_movimentos', fatPaymentMov.id, {
                                    valor: fatPaymentMov.valor
                                });
                            }
                        }
                    }
                }
            }
        }

        // Remover SEMPRE todas as movimentações de caixa originais existentes correspondentes a esta OS (tipo 'entrada' e sem faturaId)
        // Isso evita duplicidade no caixa diário quando migramos ou alteramos o pagamento.
        const existingMovs = db.caixa_movimentos.filter(m => m.osId === os.id && m.tipo === 'entrada' && !m.faturaId);
        for (const m of existingMovs) {
            if (window.useSupabase) {
                await sbDeleteWhere('caixa_movimentos', 'id', m.id);
            }
            db.caixa_movimentos = db.caixa_movimentos.filter(x => x.id !== m.id);
        }

        // Agora, aplica o novo estado baseado na nova forma de pagamento:
        if (newForma === 'faturamento') {
            // Cria uma nova fatura em aberto (a receber) para o parceiro
            let finalInvoice;
            let code = "";
            const selectedIds = [os.id];

            if (window.useSupabase) {
                const invoiceToInsert = {
                    codigo: "FAT-TEMP",
                    parceiroId: os.parceiroId,
                    unidadeId: os.unidadeId,
                    periodoInicio: inputDataPagamento,
                    periodoFim: inputDataPagamento,
                    valorTotal: os.valor,
                    ordensIds: selectedIds,
                    pago: false,
                    pagoEm: null,
                    criadoEm: new Date().toISOString(),
                    criadoPor: currentSession.nome
                };

                const inserted = await sbInsert('faturas', invoiceToInsert);
                code = generateFaturaCode(inserted.id);
                
                finalInvoice = await sbUpdate('faturas', inserted.id, {
                    codigo: code
                });
                
                os.faturaId = inserted.id;
                db.faturas.unshift(finalInvoice);
            } else {
                const fatId = db.faturas.length + 1;
                code = "FAT-" + String(fatId).padStart(4, '0');

                finalInvoice = {
                    id: fatId,
                    codigo: code,
                    parceiroId: os.parceiroId,
                    unidadeId: os.unidadeId,
                    periodoInicio: inputDataPagamento,
                    periodoFim: inputDataPagamento,
                    valorTotal: os.valor,
                    ordensIds: selectedIds,
                    pago: false,
                    pagoEm: null,
                    criadoEm: new Date().toISOString(),
                    criadoPor: currentSession.nome
                };

                db.faturas.push(finalInvoice);
                os.faturaId = fatId;
            }

            os.formaPagamento = 'faturamento';
            os.pago = false;
            os.parcelas = null;
            os.observacoes = removeDividedPaymentTag(os.observacoes);

        } else {
            // O novo método de pagamento é Direto (Pix, Espécie, Débito, Crédito, Crédito Parcelado, Dividido)
            
            // Localiza ou abre um caixa para a data informada
            let caixaDestino = db.caixa_diario.find(c => c.unidadeId === os.unidadeId && c.data === inputDataPagamento);
            if (!caixaDestino && window.useSupabase) {
                try {
                    const checkUrl = `${SUPABASE_URL}/rest/v1/caixa_diario?unidadeId=eq.${os.unidadeId}&data=eq.${inputDataPagamento}&limit=1`;
                    const checkResponse = await fetch(checkUrl, {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                        }
                    });
                    const existingDrawer = await checkResponse.json();
                    if (existingDrawer && existingDrawer.length > 0) {
                        caixaDestino = prepareRecordFromDb('caixa_diario', existingDrawer[0]);
                        db.caixa_diario.push(caixaDestino);
                    }
                } catch (errCheck) {
                    console.error("Falha ao validar caixa existente na alteração de pagamento:", errCheck);
                }
            }
            if (!caixaDestino) {
                const newDrawer = {
                    unidadeId: os.unidadeId,
                    data: inputDataPagamento,
                    status: "aberto",
                    abertoPor: currentSession.nome,
                    fechadoPor: null,
                    saldoAbertura: 0.00,
                    saldoEspécieInformado: 0,
                    fechadoEm: null
                };
                if (window.useSupabase) {
                    caixaDestino = await sbInsert('caixa_diario', newDrawer);
                    db.caixa_diario.push(caixaDestino);
                } else {
                    newDrawer.id = db.caixa_diario.length + 1;
                    db.caixa_diario.push(newDrawer);
                    caixaDestino = newDrawer;
                }
            }

            // Cria o novo movimento de entrada no caixa correspondente
            if (newForma === 'dividido') {
                const f1 = document.getElementById('alt-pag-div-forma-1').value;
                const v1 = parseFloat(document.getElementById('alt-pag-div-valor-1').value) || 0;
                const f2 = document.getElementById('alt-pag-div-forma-2').value;
                const v2 = parseFloat(document.getElementById('alt-pag-div-valor-2').value) || 0;
                
                if (v1 <= 0 || v2 <= 0) {
                    showToast("Por favor, preencha ambos os valores parciais do pagamento dividido.", "error");
                    return;
                }
                
                if (Math.abs((v1 + v2) - os.valor) > 0.01) {
                    showToast(`A soma dos valores (R$ ${v1.toFixed(2)} + R$ ${v2.toFixed(2)} = R$ ${(v1+v2).toFixed(2)}) deve ser exatamente igual ao valor total do serviço (R$ ${os.valor.toFixed(2)}).`, "error");
                    return;
                }
                
                const parts = [
                    { forma: f1, valor: v1 },
                    { forma: f2, valor: v2 }
                ];
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    const newMov = {
                        caixaId: caixaDestino.id,
                        tipo: "entrada",
                        valor: part.valor,
                        descricao: `[DIVIDIDO ${i+1}/2] Pgto OS: Serviço ${(os.servicoNome || 'VISTORIA').split(' — ')[0]} (Placa: ${os.placa})`,
                        formaPagamento: part.forma,
                        data: inputDataPagamento + "T" + new Date().toTimeString().split(' ')[0] + ".000Z",
                        operador: currentSession.nome,
                        osId: os.id,
                        faturaId: null
                    };
                    if (window.useSupabase) {
                        const insertedMov = await sbInsert('caixa_movimentos', newMov);
                        db.caixa_movimentos.unshift(insertedMov);
                    } else {
                        newMov.id = db.caixa_movimentos.length + 1;
                        db.caixa_movimentos.push(newMov);
                    }
                }
                
                let cleanObs = removeDividedPaymentTag(os.observacoes);
                os.observacoes = cleanObs + `\n[PAG_DIVIDIDO: ${f1}=${v1};${f2}=${v2}]`;
            } else {
                const newMov = {
                    caixaId: caixaDestino.id,
                    tipo: "entrada",
                    valor: os.valor,
                    descricao: `Pgto OS: Serviço ${(os.servicoNome || 'VISTORIA').split(' — ')[0]} (Placa: ${os.placa})`,
                    formaPagamento: newForma,
                    data: inputDataPagamento + "T" + new Date().toTimeString().split(' ')[0] + ".000Z",
                    operador: currentSession.nome,
                    osId: os.id,
                    faturaId: null
                };

                if (window.useSupabase) {
                    const insertedMov = await sbInsert('caixa_movimentos', newMov);
                    db.caixa_movimentos.unshift(insertedMov);
                } else {
                    newMov.id = db.caixa_movimentos.length + 1;
                    db.caixa_movimentos.push(newMov);
                }
                
                os.observacoes = removeDividedPaymentTag(os.observacoes);
            }

            os.formaPagamento = newForma;
            os.pago = true;
            os.parcelas = newParcelas;
            os.faturaId = null;
        }

        // Salvar OS
        if (window.useSupabase) {
            await sbUpdate('ordens_servico', os.id, {
                formaPagamento: os.formaPagamento,
                pago: os.pago,
                parcelas: os.parcelas,
                faturaId: os.faturaId,
                observacoes: os.observacoes
            });
        }
        
        saveDatabase();

        // 3. Auditoria
        const descAuditoria = `Alterou pgto da OS ${os.numero} (Placa: ${os.placa}) de '${oldForma.toUpperCase()}' para '${newForma.toUpperCase()}'. Justificativa: ${justificativa}`;
        logAudit("Alterar Pagamento OS", descAuditoria);

        showToast("Forma de pagamento atualizada com sucesso!", "success");

        // Fecha o modal de alteração e recarrega os dados em tela
        document.getElementById('modal-alterar-pagamento').classList.remove('active');
        
        // Re-renderiza views de forma reativa conforme a aba atualmente ativa
        if (document.getElementById('panel-caixa').classList.contains('active')) {
            await renderCaixaPage();
        } else if (document.getElementById('panel-faturamento').classList.contains('active')) {
            renderFatFaturas();
        } else if (document.getElementById('panel-historico').classList.contains('active')) {
            renderHistorico();
        }
        
        // Atualiza a ficha de OS que está exibida por trás
        openOSDetailsModal(os.id);

    } catch (err) {
        console.error("Erro na alteração do pagamento:", err);
        showToast("Erro ao processar a alteração contábil.", "error");
    } finally {
    }
}

async function closeAndExitReopenMode() {
    if (!window.modoDiaReaberto || !window.caixaReabertoId) {
        showToast("Erro: Nenhum modo dia reaberto ativo.", "error");
        return;
    }

    const c = db.caixa_diario.find(x => x.id === window.caixaReabertoId);
    if (!c) {
        showToast("Erro: Caixa reaberto não localizado no banco.", "error");
        return;
    }

    const dataOriginal = window.dataDiaReaberto;
    let base64Pdf = c.pdfConsolidado;

    try {
        if (base64Pdf) {
            const keepPdf = confirm("Este caixa já possui o relatório do DETRAN anexado. Deseja manter o arquivo original?");
            if (!keepPdf) {
                base64Pdf = null;
            }
        }

        if (!base64Pdf) {
            // Exige seleção interativa do arquivo PDF do DETRAN
            const file = await new Promise((resolve) => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.pdf';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);
                
                fileInput.onchange = (e) => {
                    const selectedFile = e.target.files[0];
                    if (fileInput.parentElement) {
                        document.body.removeChild(fileInput);
                    }
                    resolve(selectedFile);
                };
                
                // Trata o cancelamento de seleção se focar na janela sem arquivo
                window.addEventListener('focus', function onFocus() {
                    window.removeEventListener('focus', onFocus);
                    setTimeout(() => {
                        if (fileInput.parentElement) {
                            document.body.removeChild(fileInput);
                            resolve(null);
                        }
                    }, 800);
                });
                
                fileInput.click();
            });

            if (!file) {
                showToast("Operação cancelada: a inclusão do relatório do DETRAN é obrigatória para fechar o caixa!", "error");
                return;
            }

            // Ler o arquivo e converter para base64
            base64Pdf = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
        }

        // 1. Fechar o caixa reaberto
        c.status = "fechado";
        c.fechadoPor = currentSession.nome;
        c.fechadoEm = new Date().toISOString();
        c.pdfConsolidado = base64Pdf;

        if (window.useSupabase) {
            try {
                await sbUpdate('caixa_diario', c.id, {
                    status: c.status,
                    fechadoPor: c.fechadoPor,
                    fechadoEm: c.fechadoEm,
                    pdfConsolidado: base64Pdf
                });
            } catch (dbErr) {
                console.warn("⚠️ Erro ao salvar PDF consolidado no Supabase. Salvando apenas status fechado por contingência:", dbErr);
                try {
                    await sbUpdate('caixa_diario', c.id, {
                        status: c.status,
                        fechadoPor: c.fechadoPor,
                        fechadoEm: c.fechadoEm,
                        pdfConsolidado: null
                    });
                } catch (retryErr) {
                    console.error("Erro crítico ao salvar status de fechamento:", retryErr);
                }
                showToast("Caixa refechado (PDF salvo apenas no cache local por limite de payload).", "warning");
            }
        }

        // 2. Recálculo em Cascata dos Saldos de Abertura
        try {
            // Obter todos os caixas da unidade ativa ordenados por data crescente
            const caixasUnidade = db.caixa_diario
                .filter(x => x.unidadeId === activeUnitId)
                .sort((a, b) => new Date(a.data) - new Date(b.data));

            // Encontrar o índice do caixa que foi reaberto
            const idxReaberto = caixasUnidade.findIndex(x => x.id === c.id);
            
            if (idxReaberto !== -1) {
                let saldoAnterior = 0.00;
                
                // Passo 1: Calcular o saldo final do dia reaberto
                const movsReaberto = db.caixa_movimentos.filter(m => m.caixaId === c.id);
                const cashPaymentsReaberto = movsReaberto.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + parseFloat(m.valor || 0), 0);
                const cashSangriasReaberto = movsReaberto.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + parseFloat(m.valor || 0), 0);
                saldoAnterior = parseFloat(c.saldoAbertura || 0) + cashPaymentsReaberto - cashSangriasReaberto;

                // Passo 2: Propagar em cascata para todos os caixas subsequentes
                for (let i = idxReaberto + 1; i < caixasUnidade.length; i++) {
                    const proximoCaixa = caixasUnidade[i];
                    
                    // O saldo de abertura do dia subsequente é o saldo final do dia anterior
                    proximoCaixa.saldoAbertura = parseFloat(saldoAnterior.toFixed(2));

                    // Atualiza o saldo de abertura do dia subsequente no banco
                    if (window.useSupabase) {
                        try {
                            await sbUpdate('caixa_diario', proximoCaixa.id, {
                                saldoAbertura: proximoCaixa.saldoAbertura
                            });
                        } catch (errDbCascade) {
                            console.warn("Erro ao salvar saldo de abertura em cascata no banco para o caixa " + proximoCaixa.data, errDbCascade);
                        }
                    }

                    // Calcula o saldo final deste dia subsequente para a próxima iteração
                    const movsSub = db.caixa_movimentos.filter(m => m.caixaId === proximoCaixa.id);
                    const cashPaymentsSub = movsSub.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => sum + parseFloat(m.valor || 0), 0);
                    const cashSangriasSub = movsSub.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => sum + parseFloat(m.valor || 0), 0);
                    saldoAnterior = proximoCaixa.saldoAbertura + cashPaymentsSub - cashSangriasSub;
                }
            }
        } catch (errCascade) {
            console.error("Erro no recálculo em cascata:", errCascade);
            showToast("Aviso: Falha ao recalcular saldos subsequentes no banco de dados.", "warning");
        }

        saveDatabase();

        // 3. Registrar auditoria de encerramento e recálculo
        try {
            logAudit("Fechamento Caixa Reaberto", `Encerrou o Modo Dia Reaberto do dia ${formatDateBr(dataOriginal)}. Lançamentos e saldos propagados em cascata.`);
        } catch (errAudit) {
            console.warn("Erro ao gerar log de auditoria do fechamento:", errAudit);
        }

        showToast("Caixa refechado e saldos propagados em cascata com sucesso!", "success");

    } catch (err) {
        console.error("Erro ao encerrar modo reaberto:", err);
        showToast("Erro ao processar fechamento do caixa: " + err.message, "error");
    } finally {
        // 4. Limpar estado global sob qualquer circunstância
        window.modoDiaReaberto = false;
        window.dataDiaReaberto = null;
        window.caixaReabertoId = null;

        localStorage.removeItem('certive_modoDiaReaberto');
        localStorage.removeItem('certive_dataDiaReaberto');
        localStorage.removeItem('certive_caixaReabertoId');

        // Ocultar banner
        const banner = document.getElementById('dia-reaberto-banner');
        if (banner) banner.style.display = 'none';

        // 5. Retornar ao Atendimento (Dia Atual)
        navigateTo('atendimento');
        renderAtendimentoPage();
    }
}

// ============================================================================
// MÓDULO: REGISTRAR CAUTELAR (MILESTONE 1)
// ============================================================================

/**
 * Seed complementar de vistorias cautelares para testes locais.
 * Roda na inicialização se db.cautelares estiver vazio.
 */
function seedCautelares() {
    if (!db || !db.ordens_servico || (db.cautelares && db.cautelares.length > 0)) return;

    let nextOsId = db.ordens_servico.reduce((max, o) => Math.max(max, o.id), 0) + 1;
    let nextCautelarId = 1;

    // OS 1: Placa QJB-7962 (Aguardando Início)
    const os1 = {
        id: nextOsId++,
        numero: `OS-${String(nextOsId).padStart(4, '0')}`,
        criadoEm: new Date(Date.now() - 3600000 * 2).toISOString(), // 2h atrás
        criadoPor: "Ana Atendente",
        unidadeId: 1,
        clienteTipo: "particular",
        parceiroId: null,
        clienteNome: "JOÃO SILVA MENDES",
        clienteCpfCnpj: "123.456.789-00",
        clienteCelular: "(48) 99999-1111",
        placa: "QJB-7962",
        renavam: "12345678901",
        servicoId: 4,
        servicoNome: "VISTORIA CAUTELAR",
        valor: 350.00,
        observacoes: "VW GOL 2020 BRANCO",
        pago: true,
        formaPagamento: "pix",
        docVeiculoApresentado: true,
        docIdentificacaoApresentado: true,
        status: "paga",
        finalizadoEm: null,
        finalizadoPor: null
    };
    db.ordens_servico.push(os1);

    // OS 2: Placa QHT-2C78 (Em Captura)
    const os2 = {
        id: nextOsId++,
        numero: `OS-${String(nextOsId).padStart(4, '0')}`,
        criadoEm: new Date(Date.now() - 3600000 * 5).toISOString(), // 5h atrás
        criadoPor: "Ana Atendente",
        unidadeId: 1,
        clienteTipo: "parceiro",
        parceiroId: 1,
        clienteNome: "RICARDO ANTUNES",
        clienteCpfCnpj: "987.654.321-99",
        clienteCelular: "(48) 98888-2222",
        placa: "QHT-2C78",
        renavam: "98765432109",
        servicoId: 7,
        servicoNome: "VISTORIA COMBO",
        valor: 150.00,
        observacoes: "FIAT UNO 2018 CINZA",
        pago: true,
        formaPagamento: "faturamento",
        docVeiculoApresentado: true,
        docIdentificacaoApresentado: true,
        status: "em_execucao",
        finalizadoEm: null,
        finalizadoPor: null
    };
    db.ordens_servico.push(os2);

    const cautelar2 = {
        id: nextCautelarId++,
        osId: os2.id,
        dossieNumero: `CV-2026-${String(nextCautelarId).padStart(5, '0')}`,
        status: "em_captura",
        vistoriadorId: 6, // Pedro Vistoriador Júnior
        finalizadoPorId: null,
        dataHoraInicio: new Date(Date.now() - 3600000 * 4.5).toISOString(),
        dataHoraEnvio: null,
        dataHoraFinalizacao: null,
        parecerConsolidado: null,
        parecerTexto: ""
    };
    db.cautelares.push(cautelar2);

    // OS 3: Placa MHX-9981 (Finalizada)
    const os3 = {
        id: nextOsId++,
        numero: `OS-${String(nextOsId).padStart(4, '0')}`,
        criadoEm: new Date(Date.now() - 3600000 * 48).toISOString(), // 2 dias atrás
        criadoPor: "Ana Atendente",
        unidadeId: 1,
        clienteTipo: "particular",
        parceiroId: null,
        clienteNome: "MARIA MEDEIROS",
        clienteCpfCnpj: "456.789.123-11",
        clienteCelular: "(48) 97777-3333",
        placa: "MHX-9981",
        renavam: "45678912301",
        servicoId: 4,
        servicoNome: "VISTORIA CAUTELAR",
        valor: 350.00,
        observacoes: "TOYOTA COROLLA 2022 PRETO",
        pago: true,
        formaPagamento: "debito",
        docVeiculoApresentado: true,
        docIdentificacaoApresentado: true,
        status: "concluida_aprovada",
        finalizadoEm: new Date(Date.now() - 3600000 * 46).toISOString(),
        finalizadoPor: "Silvio Vistoriador Sênior"
    };
    db.ordens_servico.push(os3);

    const cautelar3 = {
        id: nextCautelarId++,
        osId: os3.id,
        dossieNumero: `CV-2026-${String(nextCautelarId).padStart(5, '0')}`,
        status: "finalizada",
        vistoriadorId: 7, // Silvio Sênior
        finalizadoPorId: 7,
        dataHoraInicio: new Date(Date.now() - 3600000 * 47.5).toISOString(),
        dataHoraEnvio: new Date(Date.now() - 3600000 * 46.5).toISOString(),
        dataHoraFinalizacao: new Date(Date.now() - 3600000 * 46).toISOString(),
        parecerConsolidado: "conforme",
        parecerTexto: "VEÍCULO EM EXCELENTE ESTADO ESTRUTURAL E DE PINTURA. LAUDO APROVADO.",
        pdfUrl: "#",
        pdfHash: "8f5a11d9f4e24ef5a11d9f4e24ef5a11d9f4e24ef5a11d9f4e24ef5a11d9f4e2"
    };
    db.cautelares.push(cautelar3);

    // OS 4: Placa BEE-4C99 (Aguardando Finalização)
    const os4 = {
        id: nextOsId++,
        numero: `OS-${String(nextOsId).padStart(4, '0')}`,
        criadoEm: new Date(Date.now() - 3600000 * 24).toISOString(), // 1 dia atrás
        criadoPor: "Ana Atendente",
        unidadeId: 1,
        clienteTipo: "parceiro",
        parceiroId: 2,
        clienteNome: "JULIO CESAR DOS SANTOS",
        clienteCpfCnpj: "789.123.456-22",
        clienteCelular: "(48) 96666-4444",
        placa: "BEE-4C99",
        renavam: "78912345602",
        servicoId: 7,
        servicoNome: "VISTORIA COMBO",
        valor: 160.00,
        observacoes: "CHEVROLET ONIX 2021 PRATA",
        pago: true,
        formaPagamento: "faturamento",
        docVeiculoApresentado: true,
        docIdentificacaoApresentado: true,
        status: "em_execucao",
        finalizadoEm: null,
        finalizadoPor: null
    };
    db.ordens_servico.push(os4);

    const cautelar4 = {
        id: nextCautelarId++,
        osId: os4.id,
        dossieNumero: `CV-2026-${String(nextCautelarId).padStart(5, '0')}`,
        status: "aguardando_finalizacao",
        vistoriadorId: 6, // Pedro Júnior
        finalizadoPorId: null,
        dataHoraInicio: new Date(Date.now() - 3600000 * 23.5).toISOString(),
        dataHoraEnvio: new Date(Date.now() - 3600000 * 23).toISOString(),
        dataHoraFinalizacao: null,
        parecerConsolidado: "nao_conforme",
        parecerTexto: "ATENÇÃO: LONGARINA TRASEIRA ESQUERDA APRESENTA SINAIS DE REPARO POR SOLDA. ETIQUETAS ETA INCOMPATÍVEIS."
    };
    db.cautelares.push(cautelar4);

    // Salvar no LocalStorage e sincronizar com Supabase se necessário
    saveDatabase();
    
    if (window.useSupabase) {
        Promise.all([
            sbInsert('ordens_servico', os1),
            sbInsert('ordens_servico', os2),
            sbInsert('ordens_servico', os3),
            sbInsert('ordens_servico', os4),
            sbInsert('cautelares', cautelar2),
            sbInsert('cautelares', cautelar3),
            sbInsert('cautelares', cautelar4)
        ]).catch(e => console.warn("Supabase seed warning:", e));
    }
}

/**
 * Verifica se o serviço é do tipo Vistoria Cautelar.
 */
function isCautelarService(servicoId, servicoNome) {
    const id = parseInt(servicoId);
    const name = (servicoNome || "").toUpperCase();
    return id === 4 || id === 7 || name.includes("CAUTELAR") || name.includes("COMBO");
}

/**
 * Atualiza o badge numérico no sidebar e o contador do cabeçalho.
 */
function updateCautelarPendingBadge() {
    if (!db || !db.ordens_servico || !currentSession) return;

    // Garantia defensiva contra arrays undefined
    db.cautelares = db.cautelares || [];
    db.cautelares_secoes = db.cautelares_secoes || [];
    db.cautelares_fotos = db.cautelares_fotos || [];
    db.cautelares_pesquisas = db.cautelares_pesquisas || [];

    // Filtra OSs de Cautelar pendentes na unidade ativa
    const activeOSs = db.ordens_servico.filter(o => 
        o.unidadeId === activeUnitId && 
        o.status !== 'cancelada' && 
        isCautelarService(o.servicoId, o.servicoNome)
    );

    let pendingCount = 0;

    activeOSs.forEach(o => {
        const cautelar = db.cautelares.find(c => c.osId === o.id);
        const status = cautelar ? cautelar.status : 'aguardando_inicio';

        // Regra de perfil: Vistoriador Júnior só conta/vê as próprias ou aguardando início
        const hasAdminPermission = currentSession.permissoes.includes('cautelar_administrar');
        const isAssignedToMe = cautelar && cautelar.vistoriadorId === currentSession.id;
        const isNotAssigned = !cautelar || !cautelar.vistoriadorId;

        if (status === 'aguardando_inicio' || status === 'em_captura') {
            if (hasAdminPermission || isAssignedToMe || isNotAssigned) {
                pendingCount++;
            }
        }
    });

    const badge = document.getElementById('cautelar-pending-badge');
    if (badge) {
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    const headerCounter = document.getElementById('cautelar-header-counter');
    if (headerCounter) {
        headerCounter.textContent = pendingCount;
    }
}

/**
 * Renderiza a página do Módulo de Cautelar (Listagem).
 */
function renderRegistrarCautelarPage() {
    if (!db || !currentSession) return;

    // 1. Atualizar o badge pendente
    updateCautelarPendingBadge();

    // 2. Preencher o seletor de Vistoriadores do Filtro
    const filterVistoriador = document.getElementById('caut-filtro-vistoriador');
    if (filterVistoriador) {
        // Encontrar todos os operadores com a permissão de registrar_cautelar
        const vistoriadores = db.operadores.filter(op => 
            op.ativo && op.permissoes.includes('registrar_cautelar')
        );

        let options = '<option value="todos">Todos os Vistoriadores</option>';
        options += vistoriadores.map(op => `<option value="${op.id}">${op.nome}</option>`).join('');
        filterVistoriador.innerHTML = options;
    }

    // 3. Chamar a filtragem e desenho inicial das tabelas
    filterCautelares();
}

/**
 * Filtra as cautelares conforme os filtros de placa, status e vistoriador.
 */
function filterCautelares() {
    // Garantia defensiva contra arrays undefined
    db.cautelares = db.cautelares || [];
    db.cautelares_secoes = db.cautelares_secoes || [];
    db.cautelares_fotos = db.cautelares_fotos || [];
    db.cautelares_pesquisas = db.cautelares_pesquisas || [];

    const queryPlaca = (document.getElementById('caut-filtro-placa')?.value || '').trim().toUpperCase();
    const filterStatus = document.getElementById('caut-filtro-status')?.value || 'todos';
    const filterVistoriador = document.getElementById('caut-filtro-vistoriador')?.value || 'todos';

    const hasAdminPermission = currentSession.permissoes.includes('cautelar_administrar');
    const myId = currentSession.id;

    // Filtra todas as OSs cautelares da unidade ativa
    const activeOSs = db.ordens_servico.filter(o => 
        o.unidadeId === activeUnitId && 
        o.status !== 'cancelada' && 
        isCautelarService(o.servicoId, o.servicoNome)
    );

    const listData = [];

    activeOSs.forEach(o => {
        const cautelar = db.cautelares.find(c => c.osId === o.id);
        const status = cautelar ? cautelar.status : 'aguardando_inicio';
        const vistoriador = cautelar ? (db.operadores.find(op => op.id === cautelar.vistoriadorId)?.nome || 'Não definido') : 'Não iniciado';
        const vistoriadorId = cautelar ? cautelar.vistoriadorId : null;

        // Regra de Visibilidade do Vistoriador Júnior: apenas as dele ou sem dono
        if (!hasAdminPermission && status !== 'finalizada') {
            const isMyCautelar = cautelar && vistoriadorId === myId;
            const isNotStarted = !cautelar;
            if (!isMyCautelar && !isNotStarted) {
                return; // Oculta cautelares de outros vistoriadores em andamento
            }
        }

        // Filtro por Placa
        if (queryPlaca && !o.placa.includes(queryPlaca)) return;

        // Filtro por Status
        if (filterStatus !== 'todos' && status !== filterStatus) return;

        // Filtro por Vistoriador
        if (filterVistoriador !== 'todos') {
            const fVistId = parseInt(filterVistoriador);
            if (vistoriadorId !== fVistId) return;
        }

        const iniciadoEm = cautelar && cautelar.dataHoraInicio 
            ? new Date(cautelar.dataHoraInicio).toLocaleDateString('pt-BR') + ' ' + new Date(cautelar.dataHoraInicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) 
            : '-';

        listData.push({
            os: o,
            cautelar: cautelar,
            status: status,
            vistoriador: vistoriador,
            iniciadoEm: iniciadoEm,
            criadoEmRaw: new Date(o.criadoEm)
        });
    });

    // Ordenação FIFO (mais antiga primeiro)
    listData.sort((a, b) => a.criadoEmRaw - b.criadoEmRaw);

    // Renderiza a lista
    const tbody = document.getElementById('cautelar-list-tbody');
    const mobileContainer = document.getElementById('cautelar-mobile-cards-container');
    const emptyState = document.getElementById('cautelar-empty-state');
    const desktopTable = document.getElementById('cautelar-desktop-table-container');

    if (listData.length === 0) {
        if (tbody) tbody.innerHTML = '';
        if (mobileContainer) mobileContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (desktopTable) desktopTable.style.display = 'none';
        if (mobileContainer) mobileContainer.style.display = 'none';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (desktopTable) desktopTable.style.display = 'block';
    
    // Forçar exibição do container responsivo adequado
    const isMobile = window.innerWidth <= 768;
    if (mobileContainer) {
        mobileContainer.style.display = isMobile ? 'flex' : 'none';
    }
    if (desktopTable) {
        desktopTable.style.display = isMobile ? 'none' : 'block';
    }

    // Renderizar Desktop
    if (tbody) {
        tbody.innerHTML = listData.map(item => {
            const actionBtn = getCautelarActionButton(item);
            const statusBadge = getCautelarStatusBadge(item.status);

            return `
                <tr>
                    <td style="font-weight: 700; color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 14px;">${item.os.placa}</td>
                    <td>${removeDividedPaymentTag(item.os.observacoes)}</td>
                    <td>${item.os.clienteNome}</td>
                    <td>${statusBadge}</td>
                    <td><i class="ri-user-line" style="font-size: 12px; color: var(--text-secondary); margin-right: 4px;"></i>${item.vistoriador}</td>
                    <td style="font-family: 'JetBrains Mono', monospace; font-size: 11px;">${item.iniciadoEm}</td>
                    <td style="text-align: center;">${actionBtn}</td>
                </tr>
            `;
        }).join('');
    }

    // Renderizar Mobile
    if (mobileContainer) {
        mobileContainer.innerHTML = listData.map(item => {
            const actionBtn = getCautelarActionButton(item);
            const statusBadge = getCautelarStatusBadge(item.status);

            return `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 16px;">${item.os.placa}</span>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
                        <span><strong>Veículo:</strong> ${removeDividedPaymentTag(item.os.observacoes)}</span>
                        <span><strong>Cliente:</strong> ${item.os.clienteNome}</span>
                        <span><strong>Vistoriador:</strong> ${item.vistoriador}</span>
                        <span><strong>Iniciada em:</strong> ${item.iniciadoEm}</span>
                    </div>
                    <div style="border-top: 1px solid var(--border); padding-top: 10px; display: flex; justify-content: flex-end;">
                        ${actionBtn}
                    </div>
                </div>
            `;
        }).join('');
    }
}

/**
 * Retorna o HTML do badge de status correspondente à Cautelar.
 */
function getCautelarStatusBadge(status) {
    switch (status) {
        case 'aguardando_inicio':
            return `<span class="badge" style="background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2);">Aguardando Início</span>`;
        case 'em_captura':
            return `<span class="badge badge-progress"><span class="badge-dot"></span>Em Captura</span>`;
        case 'aguardando_finalizacao':
            return `<span class="badge badge-waiting"><span class="badge-dot"></span>Aguardando Mesa</span>`;
        case 'finalizada':
            return `<span class="badge badge-done"><span class="badge-dot"></span>Laudo Emitido</span>`;
        default:
            return `<span class="badge">${status}</span>`;
    }
}

/**
 * Retorna o botão de ação correspondente ao estado e permissão do usuário.
 */
function getCautelarActionButton(item) {
    const hasAdmin = currentSession.permissoes.includes('cautelar_administrar');
    const hasFinalizar = currentSession.permissoes.includes('finalizar_cautelar');
    const myId = currentSession.id;

    if (item.status === 'aguardando_inicio') {
        return `<button class="btn btn-secondary btn-sm" onclick="iniciarCautelar(${item.os.id})" style="font-weight: 700; width: 100%;"><i class="ri-play-fill"></i> Iniciar</button>`;
    }

    if (item.status === 'em_captura') {
        const isMyCautelar = item.cautelar && item.cautelar.vistoriadorId === myId;
        if (isMyCautelar || hasAdmin) {
            return `<button class="btn btn-secondary btn-sm" onclick="continuarCautelar(${item.cautelar.id})" style="font-weight: 700; width: 100%;"><i class="ri-edit-line"></i> Continuar</button>`;
        } else {
            return `<button class="btn btn-sm" onclick="verResumoCautelar(${item.cautelar.id})" style="background: var(--bg-primary); border: 1px solid var(--border); color: var(--text-secondary); width: 100%; cursor: not-allowed;" disabled><i class="ri-eye-line"></i> Bloqueado</button>`;
        }
    }

    if (item.status === 'aguardando_finalizacao') {
        if (hasFinalizar) {
            return `<button class="btn btn-success btn-sm" onclick="abrirFinalizacaoDesktop(${item.cautelar.id})" style="font-weight: 700; width: 100%;"><i class="ri-check-double-line"></i> Finalizar</button>`;
        } else {
            return `<span style="font-size: 11px; color: var(--text-muted); font-style: italic; display: block; text-align: center; padding: 4px 0;"><i class="ri-time-line"></i> Em revisão</span>`;
        }
    }

    if (item.status === 'finalizada') {
        return `<button class="btn btn-success btn-sm btn-icon" onclick="exibirPdfCautelar(${item.cautelar.id})" title="Ver PDF do Laudo Cautelar" style="padding: 4px; display: inline-flex; align-items: center; justify-content: center; width: 100%; gap: 6px;"><i class="ri-file-pdf-line"></i> Laudo PDF</button>`;
    }

    return '';
}

/**
 * Cria uma nova Cautelar associada a uma O.S. (Iniciar Vistoria).
 */
function iniciarCautelar(osId) {
    if (!db || !currentSession) return;

    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) {
        showToast("Ordem de serviço não encontrada.", "error");
        return;
    }

    // Gerar número de dossiê sequencial anual
    const year = new Date().getFullYear();
    const count = db.cautelares.length + 1;
    const dossie = `CV-${year}-${String(count).padStart(5, '0')}`;

    // Criar entidade Cautelar
    const newCautelar = {
        id: db.cautelares.length + 1,
        osId: os.id,
        dossieNumero: dossie,
        status: "em_captura",
        vistoriadorId: currentSession.id,
        finalizadoPorId: null,
        dataHoraInicio: new Date().toISOString(),
        dataHoraEnvio: null,
        dataHoraFinalizacao: null,
        parecerConsolidado: null,
        parecerTexto: ""
    };

    // Criar as 8 seções padrão
    const secaoNomes = [
        "IDENTIFICAÇÃO DO VEÍCULO",
        "NUMERAÇÃO E DOCUMENTAÇÃO",
        "ANÁLISE ESTRUTURAL",
        "ANÁLISE DE PINTURA (MEDIDOR)",
        "VIDROS E ETIQUETAS",
        "COMPARTIMENTO DO MOTOR",
        "INTERIOR E QUADROS DE PORTA",
        "OBSERVAÇÕES FINAIS E ASSINATURA"
    ];

    secaoNomes.forEach((nome, i) => {
        const num = i + 1;
        const newSecao = {
            id: db.cautelares_secoes.length + 1,
            cautelarId: newCautelar.id,
            numeroSecao: num,
            nomeSecao: nome,
            status: num === 1 ? "em_andamento" : "nao_iniciada",
            dadosJson: {},
            parecerSecao: "conforme",
            observacaoTexto: "",
            dataHoraCompletada: null
        };
        db.cautelares_secoes.push(newSecao);
    });

    // Atualizar status da OS
    os.status = "em_execucao";

    db.cautelares.push(newCautelar);
    saveDatabase();

    if (window.useSupabase) {
        sbInsert('cautelares', newCautelar)
            .then(() => sbUpdate('ordens_servico', os.id, { status: os.status }))
            .catch(e => console.warn("Erro ao salvar nova Cautelar no Supabase:", e));
    }

    logAudit("Registrar Cautelar", `Iniciou captura da cautelar para placa ${os.placa}. Dossie: ${dossie}`);
    showToast(`Vistoria iniciada para placa ${os.placa}!`, "success");

    // Redireciona para o fluxo de captura mobile (Milestone 2)
    continuarCautelar(newCautelar.id);
}

/**
 * INFRAESTRUTURA: IndexedDB local para persistir fotos originais (Milestone 2)
 * Evita o estouro do limite de 5MB do LocalStorage no mobile.
 */
const CautelarOfflineDB = {
    dbName: 'certive_cautelar_offline',
    dbVersion: 1,
    db: null,

    open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('fotos')) {
                    db.createObjectStore('fotos', { keyPath: 'id' }); // chave: cautelarId_slotCodigo
                }
            };
        });
    },

    saveFoto(cautelarId, slotCodigo, blob, metadados) {
        return this.open().then((db) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['fotos'], 'readwrite');
                const store = transaction.objectStore('fotos');
                const id = `${cautelarId}_${slotCodigo}`;
                const data = {
                    id: id,
                    cautelarId: parseInt(cautelarId),
                    slotCodigo: slotCodigo,
                    blob: blob,
                    metadados: metadados,
                    timestamp: new Date().toISOString()
                };
                const request = store.put(data);
                request.onsuccess = () => resolve(id);
                request.onerror = (e) => reject(e);
            });
        });
    },

    getFoto(cautelarId, slotCodigo) {
        return this.open().then((db) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['fotos'], 'readonly');
                const store = transaction.objectStore('fotos');
                const id = `${cautelarId}_${slotCodigo}`;
                const request = store.get(id);
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e);
            });
        });
    },

    deleteFoto(cautelarId, slotCodigo) {
        return this.open().then((db) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['fotos'], 'readwrite');
                const store = transaction.objectStore('fotos');
                const id = `${cautelarId}_${slotCodigo}`;
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e);
            });
        });
    },

    getAllFotos(cautelarId) {
        return this.open().then((db) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['fotos'], 'readonly');
                const store = transaction.objectStore('fotos');
                const request = store.getAll();
                request.onsuccess = (e) => {
                    const all = e.target.result || [];
                    const filtered = all.filter(item => item.cautelarId === parseInt(cautelarId));
                    resolve(filtered);
                };
                request.onerror = (e) => reject(e);
            });
        });
    }
};

// Mapeamento estático de fotos obrigatórias por seção (34 fotos obrigatórias)
const CAUTELAR_SLOTS = {
    1: [
        { codigo: 'frente_45_dir', nome: 'FRENTE 45° LADO DIREITO' },
        { codigo: 'traseira_45_esq', nome: 'TRASEIRA 45° LADO ESQUERDO' },
        { codigo: 'painel_hodometro', nome: 'PAINEL DE INSTRUMENTOS COM HODÔMETRO' },
        { codigo: 'crlv_documento', nome: 'CRLV / CRV DO VEÍCULO' },
        { codigo: 'placa_dianteira', nome: 'PLACA DIANTEIRA EM CLOSE' }
    ],
    2: [
        { codigo: 'chassi_gravado', nome: 'NÚMERO DO CHASSI GRAVADO' },
        { codigo: 'chassi_secundario', nome: 'NÚMERO DO CHASSI (PLAQUETAS/SECUNDÁRIO)' },
        { codigo: 'motor_gravado', nome: 'NÚMERO DO MOTOR GRAVADO' },
        { codigo: 'etiqueta_eta', nome: 'ETIQUETA ETA COMPARTIMENTO MOTOR' }
    ],
    3: [
        { codigo: 'longarina_diant_esq', nome: 'LONGARINA DIANTEIRA ESQUERDA' },
        { codigo: 'longarina_diant_dir', nome: 'LONGARINA DIANTEIRA DIREITA' },
        { codigo: 'longarina_tras_esq', nome: 'LONGARINA TRASEIRA ESQUERDA' },
        { codigo: 'longarina_tras_dir', nome: 'LONGARINA TRASEIRA DIREITA' },
        { codigo: 'torre_amort_diant_esq', nome: 'TORRE DO AMORTECEDOR DIANTEIRO ESQUERDO' },
        { codigo: 'torre_amort_diant_dir', nome: 'TORRE DO AMORTECEDOR DIANTEIRO DIREITO' },
        { codigo: 'torre_amort_tras_esq', nome: 'TORRE DO AMORTECEDOR TRASEIRO ESQUERDO' },
        { codigo: 'torre_amort_tras_dir', nome: 'TORRE DO AMORTECEDOR TRASEIRO DIREITO' },
        { codigo: 'painel_corta_fogo', nome: 'PAINEL CORTA-FOGO (ESTRUTURA)' },
        { codigo: 'assoalho_porta_malas', nome: 'ASSOALHO DO PORTA-MALAS' }
    ],
    4: [
        { codigo: 'medidor_pintura_uso', nome: 'FOTO DO MEDIDOR MINIPA EM USO (EVIDÊNCIA)' }
    ],
    5: [
        { codigo: 'vidro_parabrisa', nome: 'GRAVAÇÃO VIDRO PARA-BRISA' },
        { codigo: 'vidro_porta_diant_esq', nome: 'GRAVAÇÃO VIDRO PORTA DIANTEIRA ESQUERDA' },
        { codigo: 'vidro_porta_diant_dir', nome: 'GRAVAÇÃO VIDRO PORTA DIANTEIRA DIREITA' },
        { codigo: 'vidro_porta_tras_esq', nome: 'GRAVAÇÃO VIDRO PORTA TRASEIRA ESQUERDA' },
        { codigo: 'vidro_porta_tras_dir', nome: 'GRAVAÇÃO VIDRO PORTA TRASEIRA DIREITA' },
        { codigo: 'vidro_traseiro', nome: 'GRAVAÇÃO VIDRO TRASEIRO' }
    ],
    6: [
        { codigo: 'motor_vista_geral', nome: 'VISTA GERAL DO COMPARTIMENTO DO MOTOR' },
        { codigo: 'motor_painel_corta_fogo', nome: 'PAINEL CORTA-FOGO (LADO DO MOTOR)' },
        { codigo: 'motor_batentes_dobradicas', nome: 'BATENTES DAS DOBRADIÇAS DO CAPÔ' }
    ],
    7: [
        { codigo: 'quadro_porta_diant_dir', nome: 'QUADRO PORTA DIANTEIRA DIREITA' },
        { codigo: 'quadro_porta_diant_esq', nome: 'QUADRO PORTA DIANTEIRA ESQUERDA' },
        { codigo: 'quadro_porta_tras_dir', nome: 'QUADRO PORTA TRASEIRA DIREITA' },
        { codigo: 'quadro_porta_tras_esq', nome: 'QUADRO PORTA TRASEIRA ESQUERDA' }
    ],
    8: []
};

// Variáveis globais de controle da Captura
window.activeCautelarId = null;
window.activeSecaoNum = 1;
window.autoSaveTimeout = null;

/**
 * Abre o formulário de Captura Mobile para a Cautelar selecionada.
 */
function continuarCautelar(cautelarId) {
    if (!db || !currentSession) return;

    const cautelar = db.cautelares.find(c => c.id === cautelarId);
    if (!cautelar) {
        showToast("Cautelar não encontrada.", "error");
        return;
    }

    const os = db.ordens_servico.find(o => o.id === cautelar.osId);
    if (!os) {
        showToast("OS de origem não encontrada.", "error");
        return;
    }

    // Gravar estado global
    window.activeCautelarId = cautelarId;
    window.activeSecaoNum = 1;

    // Achar a última seção completa para já abrir na seção atual
    const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelarId);
    let targetSec = 1;
    secoes.sort((a, b) => a.numeroSecao - b.numeroSecao);
    
    // Procura a primeira não completa
    const firstPending = secoes.find(s => s.status !== 'completa');
    if (firstPending) {
        targetSec = firstPending.numeroSecao;
    } else {
        targetSec = 8;
    }
    window.activeSecaoNum = targetSec;

    // Atualizar labels fixos
    document.getElementById('captura-dossie-label').textContent = cautelar.dossieNumero;
    
    // Ocultar painel de listagem e mostrar painel de captura
    document.getElementById('cautelar-listagem-view').style.display = 'none';
    document.getElementById('cautelar-captura-view').style.display = 'flex';

    // Renderiza a seção
    renderCapturaSecao(targetSec);
}

/**
 * Renderiza a Seção atual do Fluxo de Captura Mobile.
 */
function renderCapturaSecao(secaoNum) {
    window.activeSecaoNum = secaoNum;
    const cautelar = db.cautelares.find(c => c.id === window.activeCautelarId);
    const os = db.ordens_servico.find(o => o.id === cautelar.osId);
    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === secaoNum);

    if (!secao) return;

    // 1. Atualizar Títulos
    const algarismosRomanos = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
    document.getElementById('captura-secao-titulo-romano').textContent = `SEÇÃO ${algarismosRomanos[secaoNum]}`;
    document.getElementById('captura-secao-titulo-nome').textContent = secao.nomeSecao;

    // 2. Renderizar a Barra de Progresso de 8 segmentos
    renderCapturaProgressBar(secaoNum);

    // 3. Renderizar campos técnicos e slots de fotos
    const contentArea = document.getElementById('captura-secao-conteudo');
    contentArea.innerHTML = '';

    // Renderiza fotos obrigatórias da seção
    const slots = CAUTELAR_SLOTS[secaoNum] || [];
    if (slots.length > 0) {
        const slotsGrid = document.createElement('div');
        slotsGrid.style.display = 'grid';
        slotsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
        slotsGrid.style.gap = '16px';
        slotsGrid.style.marginBottom = '20px';

        slots.forEach(slot => {
            const photoCard = getPhotoSlotCardHtml(slot, secao.id);
            slotsGrid.appendChild(photoCard);
        });

        contentArea.appendChild(slotsGrid);
    }

    // Renderiza formulário de campos específicos
    const fieldsDiv = document.createElement('div');
    fieldsDiv.innerHTML = getSecaoFieldsHtml(secaoNum, cautelar, secao.dadosJson || {}, os);
    contentArea.appendChild(fieldsDiv);

    // 4. Configurar canvas de assinatura se for Seção VIII
    if (secaoNum === 8) {
        setTimeout(() => initSignatureCanvas(), 100);
    }

    // 5. Validar completude para ativar/desativar botão de avanço
    validarSecaoCompleta();
}

/**
 * Desenha a progress bar horizontal de 8 segmentos.
 */
function renderCapturaProgressBar(activeSec) {
    const barContainer = document.getElementById('captura-progress-bar');
    if (!barContainer) return;

    let html = '';
    for (let i = 1; i <= 8; i++) {
        const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === i);
        const status = secao ? secao.status : 'nao_iniciada';
        
        let color = 'rgba(255,255,255,0.05)';
        let border = '1px solid var(--border)';
        
        if (i === activeSec) {
            color = 'var(--accent)';
            border = '1px solid var(--accent)';
        } else if (status === 'completa') {
            color = 'var(--success)';
            border = '1px solid var(--success)';
        }

        html += `<div style="flex: 1; height: 6px; background: ${color}; border: ${border}; border-radius: 3px;" title="Seção ${i}"></div>`;
    }
    barContainer.innerHTML = html;
}

/**
 * Gera o Card HTML do Slot de Foto.
 */
function getPhotoSlotCardHtml(slot, secaoId) {
    const photo = db.cautelares_fotos.find(f => f.secaoId === secaoId && f.slotCodigo === slot.codigo);
    const card = document.createElement('div');
    card.className = 'panel-card';
    card.id = `photo-card-${slot.codigo}`;
    card.style.background = 'var(--bg-card)';
    card.style.border = '1px solid var(--border)';
    card.style.borderRadius = 'var(--radius)';
    card.style.padding = '16px';
    card.style.textAlign = 'center';
    card.style.position = 'relative';

    // Seletor do status de pintura ou estrutura para fotos da Seção III e V
    let extraControls = '';
    if (window.activeSecaoNum === 3) {
        const currentStatus = photo ? photo.metadados_json?.status_estrutural || 'original' : 'original';
        const obsPeca = photo ? photo.metadados_json?.observacao_peca || '' : '';
        extraControls = `
            <div style="margin-top: 12px; text-align: left; display: flex; flex-direction: column; gap: 8px;">
                <div>
                    <label style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">AVALIAÇÃO ESTRUTURAL</label>
                    <select id="status-foto-${slot.codigo}" onchange="salvarStatusFoto('${slot.codigo}', 'status', this.value)" style="margin-top: 4px; height: 34px; padding: 4px 8px; font-size: 12px; width: 100%;">
                        <option value="original" ${currentStatus === 'original' ? 'selected' : ''}>Original</option>
                        <option value="reparo_aparente" ${currentStatus === 'reparo_aparente' ? 'selected' : ''}>Indícios de Reparo</option>
                        <option value="substituicao" ${currentStatus === 'substituicao' ? 'selected' : ''}>Indícios de Substituição</option>
                        <option value="nao_aplicavel" ${currentStatus === 'nao_aplicavel' ? 'selected' : ''}>Não se Aplica</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">OBSERVAÇÕES DA PEÇA (OPCIONAL)</label>
                    <input type="text" id="obs-foto-${slot.codigo}" value="${obsPeca}" placeholder="Ex: pequeno amassado, solda..." oninput="salvarStatusFoto('${slot.codigo}', 'observacao', this.value)" style="margin-top: 4px; height: 32px; font-size: 11px; padding: 4px 8px; width: 100%;">
                </div>
            </div>
        `;
    } else if (window.activeSecaoNum === 5) {
        const isOriginal = photo ? photo.metadados_json?.vidro_original !== false : true;
        const numGravado = photo ? photo.metadados_json?.gravacao_lida || '' : '';
        extraControls = `
            <div style="margin-top: 12px; text-align: left; display: flex; flex-direction: column; gap: 8px;">
                <div>
                    <label style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">Gravação Original?</label>
                    <select id="original-foto-${slot.codigo}" onchange="salvarEtiquetaVidro('${slot.codigo}', 'original', this.value)" style="margin-top: 4px; height: 32px; padding: 4px 8px; font-size: 11px;">
                        <option value="sim" ${isOriginal ? 'selected' : ''}>SIM</option>
                        <option value="nao" ${!isOriginal ? 'selected' : ''}>NÃO</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">Número Gravado</label>
                    <input type="text" id="gravacao-foto-${slot.codigo}" value="${numGravado}" placeholder="DIGITE O CHASSI LIDO..." oninput="salvarEtiquetaVidro('${slot.codigo}', 'gravacao', this.value)" style="margin-top: 4px; height: 32px; font-size: 11px; padding: 4px 8px; font-family: monospace;">
                </div>
            </div>
        `;
    }

    // Input file invisível e câmera ativa por capture="environment"
    const inputId = `input-camera-${slot.codigo}`;
    
    if (photo) {
        // Exibe preview da foto tirada (local Blob ou url base64)
        const displayUrl = photo.url_thumb || photo.urlThumb || photo.url_original || photo.urlOriginal || '';
        const isLocalBlob = displayUrl.startsWith('blob:') || !displayUrl.startsWith('http');
        
        card.innerHTML = `
            <div style="position: relative; width: 100%; height: 160px; border-radius: var(--radius-sm); overflow: hidden; background: #000;">
                <img id="img-preview-${slot.codigo}" src="${isLocalBlob ? '' : displayUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="${slot.nome}">
                <button onclick="deleteFotoCaptura('${slot.codigo}')" style="position: absolute; top: 8px; right: 8px; background: rgba(239, 68, 68, 0.9); color: white; border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s;">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </div>
            <h5 style="font-size: 12px; font-weight: 700; color: var(--text-primary); margin-top: 10px; text-transform: uppercase;">${slot.nome}</h5>
            <span style="font-size: 9px; color: var(--success); display: block; margin-top: 2px;"><i class="ri-checkbox-circle-fill"></i> Capturada com sucesso</span>
            ${extraControls}
        `;

        if (isLocalBlob) {
            // Puxa o Blob real do IndexedDB assincronamente e cria uma URL temporária válida
            CautelarOfflineDB.getFoto(window.activeCautelarId, slot.codigo).then(record => {
                if (record && record.blob) {
                    const freshUrl = URL.createObjectURL(record.blob);
                    const imgEl = document.getElementById(`img-preview-${slot.codigo}`);
                    if (imgEl) imgEl.src = freshUrl;
                } else if (photo.urlThumb) {
                    const imgEl = document.getElementById(`img-preview-${slot.codigo}`);
                    if (imgEl) imgEl.src = photo.urlThumb;
                }
            }).catch(err => {
                console.error("Erro ao ler foto do IndexedDB:", err);
            });
        }
    } else {
        // Exibe slot vazio para tirar a foto
        card.innerHTML = `
            <input type="file" id="${inputId}" accept="image/*" capture="environment" style="display: none;" onchange="handleFotoUpload('${slot.codigo}', event)">
            <div onclick="document.getElementById('${inputId}').click()" style="padding: 24px 0; border: 2px dashed var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: 0.2s;">
                <i class="ri-camera-lens-line" style="font-size: 40px; color: var(--accent); margin-bottom: 10px; display: inline-block;"></i>
                <h5 style="font-size: 12px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; margin-bottom: 4px;">${slot.nome}</h5>
                <span style="font-size: 11px; color: var(--text-secondary);">Tocar para capturar</span>
            </div>
            ${extraControls}
        `;
    }

    return card;
}

/**
 * Carrega a estrutura de campos por seção técnica.
 */
function getSecaoFieldsHtml(secaoNum, cautelar, data, os) {
    let html = '';

    switch (secaoNum) {
        case 1:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label for="caut-km">Quilometragem Lida (Hodômetro) <span style="color:var(--danger)">*</span></label>
                        <input type="number" id="caut-km" value="${data.quilometragem || ''}" placeholder="DIGITE A KM ATUAL..." oninput="autoSaveCampo('quilometragem', this.value)" required>
                    </div>
                    <div class="form-group">
                        <label for="caut-placa-ok">Placa Confere com o CRLV? <span style="color:var(--danger)">*</span></label>
                        <select id="caut-placa-ok" onchange="autoSaveCampo('placaConfere', this.value)">
                            <option value="sim" ${data.placaConfere === 'nao' ? '' : 'selected'}>SIM, CONFERE</option>
                            <option value="nao" ${data.placaConfere === 'nao' ? 'selected' : ''}>NÃO CONFERE</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="caut-conservacao">Estado Geral de Conservação <span style="color:var(--danger)">*</span></label>
                        <select id="caut-conservacao" onchange="autoSaveCampo('estadoConservacao', this.value)">
                            <option value="">SELECIONE...</option>
                            <option value="excelente" ${data.estadoConservacao === 'excelente' ? 'selected' : ''}>EXCELENTE</option>
                            <option value="bom" ${data.estadoConservacao === 'bom' ? 'selected' : ''}>BOM</option>
                            <option value="regular" ${data.estadoConservacao === 'regular' ? 'selected' : ''}>REGULAR</option>
                            <option value="mau" ${data.estadoConservacao === 'mau' ? 'selected' : ''}>MAU</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="caut-secao1-obs">Observações (Opcional)</label>
                        <textarea id="caut-secao1-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE A IDENTIFICAÇÃO DO VEÍCULO..." oninput="autoSaveCampo('observacao', this.value)">${data.observacao || ''}</textarea>
                    </div>
                </div>
            `;
            break;

        case 2:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label for="caut-chassi">Chassi Lido <span style="color:var(--danger)">*</span></label>
                        <input type="text" id="caut-chassi" value="${data.chassiLido || ''}" placeholder="DIGITE O CHASSI LIDO..." oninput="autoSaveCampo('chassiLido', this.value.toUpperCase())" style="font-family: monospace; letter-spacing: 1px;" required>
                        <span id="caut-chassi-validation" style="font-size: 11px; margin-top: 4px; display: none;"></span>
                    </div>
                    <div class="form-group">
                        <label for="caut-motor">Motor Lido <span style="color:var(--danger)">*</span></label>
                        <input type="text" id="caut-motor" value="${data.motorLido || ''}" placeholder="DIGITE O MOTOR LIDO..." oninput="autoSaveCampo('motorLido', this.value.toUpperCase())" style="font-family: monospace; letter-spacing: 1px;" required>
                    </div>
                    <div class="form-group">
                        <label>Conformidade de Originalidade <span style="color:var(--danger)">*</span></label>
                        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
                            <label style="display: flex !important; align-items: center; justify-content: flex-start !important; gap: 8px; font-weight: 500; font-size: 13px; width: fit-content; cursor: pointer;">
                                <input type="checkbox" id="caut-chassi-ok" ${data.chassiOriginal !== false ? 'checked' : ''} onchange="autoSaveCampo('chassiOriginal', this.checked)"> <span>Gravação de Chassi Original</span>
                            </label>
                            <label style="display: flex !important; align-items: center; justify-content: flex-start !important; gap: 8px; font-weight: 500; font-size: 13px; width: fit-content; cursor: pointer;">
                                <input type="checkbox" id="caut-motor-ok" ${data.motorOriginal !== false ? 'checked' : ''} onchange="autoSaveCampo('motorOriginal', this.checked)"> <span>Gravação de Motor Original</span>
                            </label>
                            <label style="display: flex !important; align-items: center; justify-content: flex-start !important; gap: 8px; font-weight: 500; font-size: 13px; width: fit-content; cursor: pointer;">
                                <input type="checkbox" id="caut-eta-ok" ${data.etiquetasEtaOriginais !== false ? 'checked' : ''} onchange="autoSaveCampo('etiquetasEtaOriginais', this.checked)"> <span>Etiquetas ETA Preservadas</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="caut-secao2-obs">Observações (Opcional)</label>
                        <textarea id="caut-secao2-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE CHASSI E MOTOR..." oninput="autoSaveCampo('observacao', this.value)">${data.observacao || ''}</textarea>
                    </div>
                </div>
            `;
            // Ativa validação instantânea após injetar
            setTimeout(() => {
                const input = document.getElementById('caut-chassi');
                if (input) {
                    const validationSpan = document.getElementById('caut-chassi-validation');
                    const match = input.value === (os.renavam || os.placa || ''); // simulado
                    // O chassi original está na OS (renavam/observações, etc. ou simularemos contra o chassi cadastrado na OS)
                    const osChassi = os.renavam || ''; // No schema, renavam/chassi
                    if (input.value) {
                        validationSpan.style.display = 'block';
                        if (input.value === osChassi) {
                            validationSpan.innerHTML = `<i class="ri-checkbox-circle-fill" style="color:var(--success)"></i> Confere com o cadastro da O.S.`;
                            validationSpan.style.color = 'var(--success)';
                        } else {
                            validationSpan.innerHTML = `<i class="ri-alert-fill" style="color:var(--danger)"></i> Divergente do cadastro da O.S. (${osChassi})`;
                            validationSpan.style.color = 'var(--danger)';
                        }
                    }
                }
            }, 100);
            break;

        case 3:
            const showEnchenteObs = data.indicioEnchente === 'sim';
            const showBatidaObs = data.indicioBatida === 'sim';
            const showParecerObs = data.parecerEstrutural && data.parecerEstrutural !== 'conforme';
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label for="caut-enchente">Indícios de Enchente? <span style="color:var(--danger)">*</span></label>
                        <select id="caut-enchente" onchange="autoSaveCampo('indicioEnchente', this.value); toggleDynamicFieldsSec3();" required>
                            <option value="nao" ${data.indicioEnchente === 'sim' ? '' : 'selected'}>NÃO</option>
                            <option value="sim" ${data.indicioEnchente === 'sim' ? 'selected' : ''}>SIM</option>
                        </select>
                    </div>
                    <div class="form-group" id="caut-enchente-obs-container" style="display: ${showEnchenteObs ? 'block' : 'none'};">
                        <label for="caut-enchente-obs">Descreva os indícios de enchente <span style="color:var(--danger)">*</span></label>
                        <textarea id="caut-enchente-obs" placeholder="Descreva os sinais de enchente encontrados (carpete úmido, lama, ferrugem...)" oninput="autoSaveCampo('obsEnchente', this.value)" ${showEnchenteObs ? 'required' : ''}>${data.obsEnchente || ''}</textarea>
                    </div>

                    <div class="form-group">
                        <label for="caut-batida">Indícios de Batida / Deformação Estrutural? <span style="color:var(--danger)">*</span></label>
                        <select id="caut-batida" onchange="autoSaveCampo('indicioBatida', this.value); toggleDynamicFieldsSec3();" required>
                            <option value="nao" ${data.indicioBatida === 'sim' ? '' : 'selected'}>NÃO</option>
                            <option value="sim" ${data.indicioBatida === 'sim' ? 'selected' : ''}>SIM</option>
                        </select>
                    </div>
                    <div class="form-group" id="caut-batida-obs-container" style="display: ${showBatidaObs ? 'block' : 'none'};">
                        <label for="caut-batida-obs">Descreva os indícios de batida/deformação <span style="color:var(--danger)">*</span></label>
                        <textarea id="caut-batida-obs" placeholder="Descreva os danos, cortes ou soldas estruturais encontrados..." oninput="autoSaveCampo('obsBatida', this.value)" ${showBatidaObs ? 'required' : ''}>${data.obsBatida || ''}</textarea>
                    </div>

                    <div class="form-group">
                        <label for="caut-parecer-estrutural">Parecer Estrutural Consolidado <span style="color:var(--danger)">*</span></label>
                        <select id="caut-parecer-estrutural" onchange="autoSaveCampo('parecerEstrutural', this.value); toggleDynamicFieldsSec3();" required>
                            <option value="conforme" ${data.parecerEstrutural === 'conforme' || !data.parecerEstrutural ? 'selected' : ''}>CONFORME</option>
                            <option value="com_ressalvas" ${data.parecerEstrutural === 'com_ressalvas' ? 'selected' : ''}>CONFORME COM RESSALVAS</option>
                            <option value="nao_conforme" ${data.parecerEstrutural === 'nao_conforme' ? 'selected' : ''}>NÃO CONFORME</option>
                        </select>
                    </div>
                    <div class="form-group" id="caut-parecer-obs-container" style="display: ${showParecerObs ? 'block' : 'none'};">
                        <label for="caut-secao3-obs" id="caut-secao3-obs-label">Comentários e Justificativa do Parecer <span style="color:var(--danger)">*</span></label>
                        <textarea id="caut-secao3-obs" placeholder="Justifique o parecer com ressalvas ou não conforme..." oninput="autoSaveCampo('observacao', this.value)" ${showParecerObs ? 'required' : ''}>${data.observacao || ''}</textarea>
                    </div>
                </div>
            `;
            setTimeout(() => toggleDynamicFieldsSec3(), 100);
            break;

        case 4:
            // Painéis de espessura
            const paineis = [
                "Capô", "Teto", "Tampa traseira",
                "Paralama dianteiro esquerdo", "Porta dianteira esquerda", "Porta traseira esquerda", "Paralama traseiro esquerdo",
                "Paralama traseiro direito", "Porta traseira direita", "Porta dianteira direita", "Paralama dianteiro direito",
                "Coluna A esquerda", "Coluna A direita",
                "Coluna B esquerda", "Coluna B direita",
                "Coluna C esquerda", "Coluna C direita"
            ];
            
            const tableRowsHtml = paineis.map((p, idx) => {
                const key = `painel_${idx}`;
                const val = data[key] ? parseFloat(data[key]) : 0;
                
                // Classificação com base no micrômetro
                const classification = val === 0 ? '' : (val >= 80 && val <= 150 ? 'original' : (val > 150 && val <= 250 ? 'repintura' : 'acima_padrao'));
                const color = classification === 'original' ? 'var(--success)' : (classification === 'repintura' ? 'var(--warning)' : (classification === 'acima_padrao' ? 'var(--danger)' : 'var(--text-secondary)'));
                const labelClass = classification === 'original' ? 'ORIGINAL (80-150 µm)' : (classification === 'repintura' ? 'REPINTURA (150-250 µm)' : (classification === 'acima_padrao' ? 'MASSA/ALTO (>250 µm)' : 'NÃO MEDIDO'));

                return `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td style="font-weight:600; font-size:12px; padding: 8px 0;">${p}</td>
                        <td style="width: 110px; padding: 4px 0;">
                            <input type="number" id="espessura-${key}" value="${val || ''}" placeholder="0 µm" oninput="atualizarMedidorPintura('${key}', this.value)" style="width:90px; text-align:right; font-family:monospace; padding:6px; background:var(--bg-primary); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
                        </td>
                        <td id="classif-${key}" style="font-size:10px; font-weight:700; color: ${color}; text-align:right; padding: 8px 0;">${labelClass}</td>
                    </tr>
                `;
            }).join('');

            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px;">
                    <label style="display:block; font-size:11px; color:var(--text-secondary); font-weight:700; text-transform:uppercase; margin-bottom:12px;">ESPESSURA DA PINTURA (MICRA - µm)</label>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border); color: var(--text-secondary); font-size:11px;">
                                <th style="text-align:left; padding-bottom:8px;">PAINEL</th>
                                <th style="text-align:left; padding-bottom:8px;">VALOR (µm)</th>
                                <th style="text-align:right; padding-bottom:8px;">CLASSIFICAÇÃO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                    <div class="form-group" style="margin-top:20px;">
                        <label for="caut-secao4-obs">Observações do Vistoriador (Opcional)</label>
                        <textarea id="caut-secao4-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE A PINTURA..." oninput="autoSaveCampo('observacao', this.value)">${data.observacao || ''}</textarea>
                    </div>
                </div>
            `;
            break;

        case 5:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <p style="font-size:12px; color:var(--text-secondary); line-height: 1.5; margin:0;">
                        Registre as gravações encontradas em todos os vidros. A verificação e o preenchimento de originalidade são feitos diretamente nos cards de foto acima de forma individualizada.
                    </p>
                    <div class="form-group">
                        <label for="caut-secao5-obs">Observações Gerais (Opcional)</label>
                        <textarea id="caut-secao5-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE OS VIDROS E ETIQUETAS..." oninput="autoSaveCampo('observacao', this.value)">${data.observacao || ''}</textarea>
                    </div>
                </div>
            `;
            break;

        case 6:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label for="caut-reparo-motor">Sinais de Reparo/Troca de Estruturas no Vão do Motor? <span style="color:var(--danger)">*</span></label>
                        <select id="caut-reparo-motor" onchange="autoSaveCampo('reparoMotor', this.value)" required>
                            <option value="nao" ${data.reparoMotor === 'sim' ? '' : 'selected'}>NÃO</option>
                            <option value="sim" ${data.reparoMotor === 'sim' ? 'selected' : ''}>SIM</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="caut-cor-motor">Cor Original Preservada no Vão? <span style="color:var(--danger)">*</span></label>
                        <select id="caut-cor-motor" onchange="autoSaveCampo('corMotorOk', this.value)" required>
                            <option value="sim" ${data.corMotorOk === 'nao' ? '' : 'selected'}>SIM</option>
                            <option value="nao" ${data.corMotorOk === 'nao' ? 'selected' : ''}>NÃO</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="caut-secao6-obs">Observações (Opcional)</label>
                        <textarea id="caut-secao6-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE COMPARTIMENTO DO MOTOR..." oninput="autoSaveCampo('observacao', this.value)">${data.observacao || ''}</textarea>
                    </div>
                </div>
            `;
            break;

        case 7:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label for="caut-quadro-porta">Sinais de Intervenção/Soldas nos Quadros de Portas (Colunas)? <span style="color:var(--danger)">*</span></label>
                        <select id="caut-quadro-porta" onchange="autoSaveCampo('intervencaoQuadros', this.value); toggleObsRequiredSec7();" required>
                            <option value="nao" ${data.intervencaoQuadros === 'sim' ? '' : 'selected'}>NÃO</option>
                            <option value="sim" ${data.intervencaoQuadros === 'sim' ? 'selected' : ''}>SIM</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="caut-conservacao-interior">Conservação Geral do Interior <span style="color:var(--danger)">*</span></label>
                        <select id="caut-conservacao-interior" onchange="autoSaveCampo('conservacaoInterior', this.value)" required>
                            <option value="">SELECIONE...</option>
                            <option value="excelente" ${data.conservacaoInterior === 'excelente' ? 'selected' : ''}>EXCELENTE</option>
                            <option value="bom" ${data.conservacaoInterior === 'bom' ? 'selected' : ''}>BOM</option>
                            <option value="regular" ${data.conservacaoInterior === 'regular' ? 'selected' : ''}>REGULAR</option>
                            <option value="mau" ${data.conservacaoInterior === 'mau' ? 'selected' : ''}>MAU</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="caut-secao7-obs" id="caut-secao7-obs-label">Observações</label>
                        <textarea id="caut-secao7-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE O INTERIOR E QUADROS..." oninput="autoSaveCampo('observacao', this.value)">${data.observacao || ''}</textarea>
                    </div>
                </div>
            `;
            setTimeout(() => toggleObsRequiredSec7(), 100);
            break;

        case 8:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 20px;">
                    <div class="form-group">
                        <label for="caut-parecer-preliminar">Parecer Preliminar Consolidado <span style="color:var(--danger)">*</span></label>
                        <select id="caut-parecer-preliminar" onchange="autoSaveCampo('parecerPreliminar', this.value); toggleObsRequiredSec8();" required>
                            <option value="">SELECIONE...</option>
                            <option value="conforme" ${data.parecerPreliminar === 'conforme' ? 'selected' : ''}>CONFORME</option>
                            <option value="com_ressalvas" ${data.parecerPreliminar === 'com_ressalvas' ? 'selected' : ''}>COM RESSALVAS</option>
                            <option value="nao_conforme" ${data.parecerPreliminar === 'nao_conforme' ? 'selected' : ''}>NÃO CONFORME</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="caut-secao8-obs" id="caut-secao8-obs-label">Observações Finais e Geral</label>
                        <textarea id="caut-secao8-obs" placeholder="DIGITE AS OBSERVAÇÕES FINAIS DO LAUDO..." oninput="autoSaveCampo('observacao', this.value)">${data.observacao || ''}</textarea>
                    </div>

                    <!-- Canvas para Assinatura Digital -->
                    <div style="background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 16px; text-align: center;">
                        <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 700; text-transform: uppercase;">Assinatura Digital do Vistoriador <span style="color:var(--danger)">*</span></label>
                        <div style="background: white; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; width: 100%; max-width: 400px; height: 150px; margin: 0 auto; position: relative;">
                            <canvas id="signature-canvas" width="400" height="150" style="background: #fff; cursor: crosshair; touch-action: none; width: 100%; height: 100%;"></canvas>
                        </div>
                        <div style="margin-top: 8px; display: flex; justify-content: center; gap: 10px;">
                            <button class="btn btn-secondary btn-sm" onclick="clearSignatureCanvas()" style="padding: 4px 12px; font-size: 12px;"><i class="ri-eraser-line"></i> Limpar</button>
                            <button class="btn btn-success btn-sm" onclick="saveSignatureCanvas(true)" style="padding: 4px 12px; font-size: 12px;"><i class="ri-checkbox-circle-line"></i> Confirmar Assinatura</button>
                        </div>
                        <span id="assinatura-ok-msg" style="display: none; font-size: 11px; color: var(--success); font-weight: 700; margin-top: 6px;"><i class="ri-checkbox-circle-fill"></i> Assinatura confirmada e vinculada</span>
                    </div>

                    <div class="form-group" style="margin-top: 10px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; cursor: pointer; color: var(--text-primary);">
                            <input type="checkbox" id="caut-checkbox-confirmar" ${data.checklistConfirmado === true ? 'checked' : ''} onchange="autoSaveCampo('checklistConfirmado', this.checked)" required> 
                            <span>Confirmo que realizei todos os procedimentos técnicos pertinentes a esta vistoria</span>
                        </label>
                    </div>
                </div>
            `;
            setTimeout(() => {
                toggleObsRequiredSec8();
                if (data.signatureBase64) {
                    document.getElementById('assinatura-ok-msg').style.display = 'block';
                }
            }, 100);
            break;
    }

    return html;
}

// Helpers para validação e requerimento de campos dinâmicos
function toggleDynamicFieldsSec3() {
    const enchente = document.getElementById('caut-enchente')?.value;
    const batida = document.getElementById('caut-batida')?.value;
    const parecer = document.getElementById('caut-parecer-estrutural')?.value;

    const enchenteContainer = document.getElementById('caut-enchente-obs-container');
    const enchenteInput = document.getElementById('caut-enchente-obs');
    if (enchenteContainer && enchenteInput) {
        const show = enchente === 'sim';
        enchenteContainer.style.display = show ? 'block' : 'none';
        enchenteInput.required = show;
    }

    const batidaContainer = document.getElementById('caut-batida-obs-container');
    const batidaInput = document.getElementById('caut-batida-obs');
    if (batidaContainer && batidaInput) {
        const show = batida === 'sim';
        batidaContainer.style.display = show ? 'block' : 'none';
        batidaInput.required = show;
    }

    const parecerContainer = document.getElementById('caut-parecer-obs-container');
    const parecerInput = document.getElementById('caut-secao3-obs');
    if (parecerContainer && parecerInput) {
        const show = parecer && parecer !== 'conforme';
        parecerContainer.style.display = show ? 'block' : 'none';
        parecerInput.required = show;
    }

    validarSecaoCompleta();
}

function toggleObsRequiredSec7() {
    const intervencao = document.getElementById('caut-quadro-porta')?.value;
    const label = document.getElementById('caut-secao7-obs-label');
    const input = document.getElementById('caut-secao7-obs');

    if (intervencao === 'sim') {
        if (label) label.innerHTML = `Observações <span style="color:var(--danger)">* (Obrigatório devido à intervenção nos quadros)</span>`;
        if (input) input.required = true;
    } else {
        if (label) label.innerHTML = `Observações (Opcional)`;
        if (input) input.required = false;
    }
    validarSecaoCompleta();
}

function toggleObsRequiredSec8() {
    const parecer = document.getElementById('caut-parecer-preliminar')?.value;
    const label = document.getElementById('caut-secao8-obs-label');
    const input = document.getElementById('caut-secao8-obs');

    if (parecer === 'com_ressalvas' || parecer === 'nao_conforme') {
        if (label) label.innerHTML = `Observações Finais e Geral <span style="color:var(--danger)">* (Obrigatório para ressalvas/não conforme)</span>`;
        if (input) input.required = true;
    } else {
        if (label) label.innerHTML = `Observações Finais e Geral (Opcional)`;
        if (input) input.required = false;
    }
    validarSecaoCompleta();
}

/**
 * Atualiza e auto-salva os dados do Medidor de Pintura na Seção IV.
 */
function atualizarMedidorPintura(key, val) {
    const v = parseFloat(val) || 0;
    
    // Atualiza classificação visual na tabela
    const classifSpan = document.getElementById(`classif-${key}`);
    if (classifSpan) {
        const classification = v === 0 ? '' : (v >= 80 && v <= 150 ? 'original' : (v > 150 && v <= 250 ? 'repintura' : 'acima_padrao'));
        const color = classification === 'original' ? 'var(--success)' : (classification === 'repintura' ? 'var(--warning)' : (classification === 'acima_padrao' ? 'var(--danger)' : 'var(--text-secondary)'));
        const labelClass = classification === 'original' ? 'ORIGINAL (80-150 µm)' : (classification === 'repintura' ? 'REPINTURA (150-250 µm)' : (classification === 'acima_padrao' ? 'MASSA/ALTO (>250 µm)' : 'NÃO MEDIDO'));
        
        classifSpan.style.color = color;
        classifSpan.textContent = labelClass;
    }

    autoSaveCampo(key, v);
}

/**
 * Salva a avaliação estrutural da foto na Seção III.
 */
function salvarStatusFoto(slotCodigo, field, value) {
    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === 3);
    const photo = db.cautelares_fotos.find(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);

    if (photo) {
        photo.metadados_json = photo.metadados_json || {};
        // Se a chamada antiga vier apenas com 2 argumentos, trata como salvar status_estrutural
        if (arguments.length === 2) {
            value = field;
            field = 'status';
        }
        if (field === 'status') {
            photo.metadados_json.status_estrutural = value;
        } else if (field === 'observacao') {
            photo.metadados_json.observacao_peca = value;
        }
        saveDatabase();
        if (window.useSupabase) {
            sbUpdate('cautelares_fotos', photo.id, { metadados: photo.metadados_json }).catch(e => console.warn(e));
        }
    }
}

/**
 * Salva a conformidade e escrita da etiqueta de vidro na Seção V.
 */
function salvarEtiquetaVidro(slotCodigo, field, value) {
    const cautelar = db.cautelares.find(c => c.id === window.activeCautelarId);
    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === 5);
    const photo = db.cautelares_fotos.find(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);

    if (photo) {
        photo.metadados_json = photo.metadados_json || {};
        if (field === 'original') {
            photo.metadados_json.vidro_original = value === 'sim';
        } else if (field === 'gravacao') {
            photo.metadados_json.gravacao_lida = value.toUpperCase();
        }
        saveDatabase();
        if (window.useSupabase) {
            sbUpdate('cautelares_fotos', photo.id, { metadados: photo.metadados_json }).catch(e => console.warn(e));
        }
    }
}

/**
 * Monitora e valida se todos os requisitos da seção atual foram completados.
 */
function validarSecaoCompleta() {
    const secaoNum = window.activeSecaoNum;
    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === secaoNum);
    const slots = CAUTELAR_SLOTS[secaoNum] || [];

    let isComplete = true;
    let pendingItems = [];

    // 1. Validar se todas as fotos obrigatórias da seção foram capturadas
    slots.forEach(slot => {
        const photo = db.cautelares_fotos.find(f => f.secaoId === secao.id && f.slotCodigo === slot.codigo);
        if (!photo) {
            isComplete = false;
            pendingItems.push(slot.nome);
        }
    });

    // 2. Validar campos obrigatórios por seção
    switch (secaoNum) {
        case 1:
            const km = document.getElementById('caut-km')?.value;
            const conservacao = document.getElementById('caut-conservacao')?.value;
            if (!km || parseFloat(km) <= 0) {
                isComplete = false;
                pendingItems.push("Quilometragem");
            }
            if (!conservacao) {
                isComplete = false;
                pendingItems.push("Estado Geral de Conservação");
            }
            break;
        case 2:
            const chassi = document.getElementById('caut-chassi')?.value;
            const motor = document.getElementById('caut-motor')?.value;
            if (!chassi || chassi.trim().length < 5) {
                isComplete = false;
                pendingItems.push("Chassi Lido");
            }
            if (!motor || motor.trim().length < 3) {
                isComplete = false;
                pendingItems.push("Motor Lido");
            }
            break;
        case 3:
            const enchenteVal = document.getElementById('caut-enchente')?.value;
            const enchenteObsVal = document.getElementById('caut-enchente-obs')?.value;
            if (enchenteVal === 'sim' && (!enchenteObsVal || !enchenteObsVal.trim())) {
                isComplete = false;
                pendingItems.push("Observações de Indícios de Enchente");
            }
            const batidaVal = document.getElementById('caut-batida')?.value;
            const batidaObsVal = document.getElementById('caut-batida-obs')?.value;
            if (batidaVal === 'sim' && (!batidaObsVal || !batidaObsVal.trim())) {
                isComplete = false;
                pendingItems.push("Observações de Indícios de Batida");
            }
            const parecerVal = document.getElementById('caut-parecer-estrutural')?.value;
            const parecerObsVal = document.getElementById('caut-secao3-obs')?.value;
            if (parecerVal && parecerVal !== 'conforme' && (!parecerObsVal || !parecerObsVal.trim())) {
                isComplete = false;
                pendingItems.push("Comentários e Justificativa do Parecer Estrutural");
            }
            break;
        case 7:
            const doorInput = document.getElementById('caut-secao7-obs');
            const conservacaoInterior = document.getElementById('caut-conservacao-interior')?.value;
            if (doorInput && doorInput.required && !doorInput.value.trim()) {
                isComplete = false;
                pendingItems.push("Observações de Intervenção nos Quadros");
            }
            if (!conservacaoInterior) {
                isComplete = false;
                pendingItems.push("Conservação do Interior");
            }
            break;
        case 8:
            const preliminaryParecer = document.getElementById('caut-parecer-preliminar')?.value;
            const obs8 = document.getElementById('caut-secao8-obs');
            const signatureConfirmed = secao.dadosJson && secao.dadosJson.signatureBase64;
            const confirmedCheckbox = document.getElementById('caut-checkbox-confirmar')?.checked;

            if (!preliminaryParecer) {
                isComplete = false;
                pendingItems.push("Parecer Preliminar");
            }
            if (obs8 && obs8.required && !obs8.value.trim()) {
                isComplete = false;
                pendingItems.push("Observações Finais");
            }
            if (!signatureConfirmed) {
                isComplete = false;
                pendingItems.push("Assinatura do Vistoriador");
            }
            if (!confirmedCheckbox) {
                isComplete = false;
                pendingItems.push("Checkbox de Confirmação");
            }
            break;
    }

    // 3. Atualizar Estado do Botão Avançar
    const btnAvancar = document.getElementById('btn-captura-avancar');
    if (btnAvancar) {
        if (isComplete) {
            btnAvancar.disabled = false;
            btnAvancar.style.opacity = '1';
            btnAvancar.style.cursor = 'pointer';
            btnAvancar.innerHTML = secaoNum === 8 ? 'Enviar para Finalização <i class="ri-check-double-line"></i>' : 'Avançar <i class="ri-arrow-right-s-line"></i>';
            btnAvancar.onclick = () => avancarSecao();

            // Salva status da seção como completa
            if (secao.status !== 'completa') {
                secao.status = 'completa';
                secao.dataHoraCompletada = new Date().toISOString();
                saveDatabase();
                if (window.useSupabase) {
                    sbUpdate('cautelares_secoes', secao.id, { status: 'completa', data_hora_completada: secao.dataHoraCompletada }).catch(e => console.warn(e));
                }
            }
        } else {
            btnAvancar.disabled = false; // habilitamos o clique para exibir o toast explicativo das pendências
            btnAvancar.style.opacity = '0.5';
            btnAvancar.innerHTML = `Bloqueado (${pendingItems.length} itens)`;
            btnAvancar.onclick = () => {
                const msg = "Atenção! Faltam preencher os seguintes requisitos obrigatórios nesta seção:\n- " + pendingItems.join("\n- ");
                alert(msg);
                showToast("Preencha todos os campos e fotos obrigatórias para avançar.", "warning");
            };

            // Status em andamento
            if (secao.status === 'completa') {
                secao.status = 'em_andamento';
                secao.dataHoraCompletada = null;
                saveDatabase();
                if (window.useSupabase) {
                    sbUpdate('cautelares_secoes', secao.id, { status: 'em_andamento', data_hora_completada: null }).catch(e => console.warn(e));
                }
            }
        }
    }

    // Ocultar/Exibir botão voltar se estiver na primeira seção
    const btnAnterior = document.getElementById('btn-captura-anterior');
    if (btnAnterior) {
        btnAnterior.style.display = secaoNum === 1 ? 'none' : 'flex';
    }
}

/**
 * Função de auto-save de campos em debounce.
 */
function autoSaveCampo(campoId, valor) {
    const secaoNum = window.activeSecaoNum;
    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === secaoNum);

    if (secao) {
        secao.dadosJson = secao.dadosJson || {};
        secao.dadosJson[campoId] = valor;
        
        document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-loader-4-line" style="color:var(--accent); animation: pulse 1s infinite;"></i> Salvando rascunho...`;

        if (window.autoSaveTimeout) {
            clearTimeout(window.autoSaveTimeout);
        }

        window.autoSaveTimeout = setTimeout(() => {
            saveDatabase();
            if (window.useSupabase) {
                sbUpdate('cautelares_secoes', secao.id, { dados_json: secao.dadosJson })
                    .then(() => {
                        document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-checkbox-circle-fill" style="color:var(--success);"></i> Sincronizado`;
                    })
                    .catch(e => {
                        document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-wifi-off-line" style="color:var(--danger);"></i> Offline (Fila Local)`;
                        console.warn(e);
                    });
            } else {
                document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-checkbox-circle-fill" style="color:var(--success);"></i> Salvo Localmente`;
            }
            validarSecaoCompleta();
        }, 500);
    }
}

/**
 * Avança para a próxima seção técnica.
 */
function avancarSecao() {
    const current = window.activeSecaoNum;
    if (current < 8) {
        // Inicializa a próxima seção se necessário
        const nextSecao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === (current + 1));
        if (nextSecao && nextSecao.status === 'nao_iniciada') {
            nextSecao.status = 'em_andamento';
            saveDatabase();
            if (window.useSupabase) {
                sbUpdate('cautelares_secoes', nextSecao.id, { status: 'em_andamento' }).catch(e => console.warn(e));
            }
        }
        renderCapturaSecao(current + 1);
        
        // Efeito vibratório se suportado
        if (navigator.vibrate) navigator.vibrate(50);
    } else {
        // Seção VIII completa -> Enviar para Finalização
        const confirmMsg = "Confirma o encerramento do preenchimento e envio desta vistoria para finalização na mesa?";
        if (!confirm(confirmMsg)) return;

        const cautelar = db.cautelares.find(c => c.id === window.activeCautelarId);
        const os = db.ordens_servico.find(o => o.id === cautelar.osId);

        cautelar.status = "aguardando_finalizacao";
        cautelar.dataHoraEnvio = new Date().toISOString();
        os.status = "em_execucao"; // Status da OS continua em execução até finalização emitir o PDF

        saveDatabase();

        if (window.useSupabase) {
            Promise.all([
                sbUpdate('cautelares', cautelar.id, { status: cautelar.status, data_hora_envio: cautelar.dataHoraEnvio }),
                sbUpdate('ordens_servico', os.id, { status: os.status })
            ]).catch(e => console.warn(e));
        }

        logAudit("Registrar Cautelar", `Finalizou captura mobile da cautelar placa ${os.placa} e enviou para mesa.`);
        showToast("Vistoria enviada com sucesso para finalização!", "success");

        salvarESairCaptura();
    }
}

/**
 * Retrocede para a seção anterior.
 */
function voltarSecao() {
    const current = window.activeSecaoNum;
    if (current > 1) {
        renderCapturaSecao(current - 1);
    }
}

/**
 * Confirmação de saída da vistoria.
 */
function confirmarSairCaptura() {
    const confirmMsg = "Sua captura será salva como rascunho. Ao retornar, você continua de onde parou.\n\nDeseja realmente voltar para a lista?";
    if (confirm(confirmMsg)) {
        salvarESairCaptura();
    }
}

/**
 * Fecha a tela de captura e recarrega a listagem principal.
 */
function salvarESairCaptura() {
    window.activeCautelarId = null;
    
    // Limpar timeouts
    if (window.autoSaveTimeout) {
        clearTimeout(window.autoSaveTimeout);
    }

    // Ocultar painel de captura e mostrar listagem
    document.getElementById('cautelar-captura-view').style.display = 'none';
    document.getElementById('cautelar-listagem-view').style.display = 'block';

    // Recarregar listagem de forma reativa
    renderRegistrarCautelarPage();
}

/**
 * Captura a imagem tirada do input, comprime, salva em IndexedDB e atualiza a UI.
 */
async function handleFotoUpload(slotCodigo, event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-loader-4-line" style="color:var(--accent); animation: pulse 1s infinite;"></i> Processando imagem...`;

    try {
        // 1. Comprimir imagem e thumbnail no cliente
        const blobOriginal = await compressImage(file, 1920, 0.85);
        const blobThumb = await compressImage(file, 400, 0.70);

        // Converte thumbnail para Base64 para salvar no LocalStorage cache de forma leve
        const base64Thumb = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blobThumb);
        });

        // 2. Coletar metadados (GPS + Timestamp + User-Agent)
        const metadados = {
            device: navigator.userAgent,
            timestamp: new Date().toISOString(),
            exif: {
                sizeBytes: file.size,
                type: file.type,
                name: file.name
            }
        };

        // Solicita geolocalização por prompt se consentido
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
                });
                metadados.gps = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
            } catch (gpsError) {
                console.warn("Geolocalização não autorizada ou indisponível:", gpsError.message);
            }
        }

        const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === window.activeSecaoNum);
        
        // 3. Persiste a foto original em Blob no IndexedDB local offline
        await CautelarOfflineDB.saveFoto(window.activeCautelarId, slotCodigo, blobOriginal, metadados);

        // 4. Cria e salva o registro CautelarFoto
        const photoId = db.cautelares_fotos.length + 1;
        const newPhoto = {
            id: photoId,
            secaoId: secao.id,
            slotCodigo: slotCodigo,
            slotNomeDisplay: slotCodigo.toUpperCase(),
            urlOriginal: URL.createObjectURL(blobOriginal), // URL local para visualização instantânea
            urlThumb: base64Thumb, // Thumb em base64 no localStorage
            dataHoraCaptura: metadados.timestamp,
            metadados_json: metadados,
            ordemExibicao: 0
        };

        db.cautelares_fotos.push(newPhoto);
        saveDatabase();

        // 5. Se estiver online no Supabase, envia a foto para o bucket
        if (window.useSupabase) {
            try {
                // Simulação do upload online de Storage do Supabase (Bucket: cautelares)
                const storagePath = `cautelares/${window.activeCautelarId}/${slotCodigo}.jpg`;
                const { data, error } = await supabaseClient.storage
                    .from('cautelares')
                    .upload(storagePath, blobOriginal, { upsert: true });

                if (!error) {
                    const { data: publicUrlData } = supabaseClient.storage
                        .from('cautelares')
                        .getPublicUrl(storagePath);
                    newPhoto.urlOriginal = publicUrlData.publicUrl;
                }

                await sbInsert('cautelares_fotos', {
                    secao_id: newPhoto.secaoId,
                    slot_codigo: newPhoto.slotCodigo,
                    slot_nome_display: newPhoto.slotNomeDisplay,
                    url_original: newPhoto.urlOriginal,
                    url_thumb: newPhoto.urlThumb,
                    data_hora_captura: newPhoto.dataHoraCaptura,
                    metadados: newPhoto.metadados_json
                });

                document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-checkbox-circle-fill" style="color:var(--success);"></i> Sincronizado`;
            } catch (supaErr) {
                console.warn("Falha no upload online do Supabase. Salvo em fila local.", supaErr);
                document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-wifi-off-line" style="color:var(--danger);"></i> Offline (Salvo Local)`;
            }
        } else {
            document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-checkbox-circle-fill" style="color:var(--success);"></i> Salvo Localmente`;
        }

        showToast("Foto capturada com sucesso!", "success");

        // Recarrega o slot de fotos na tela
        renderCapturaSecao(window.activeSecaoNum);

    } catch (e) {
        console.error("Erro no processamento da imagem:", e);
        showToast("Falha ao capturar a foto. Tente novamente.", "error");
        document.getElementById('captura-sync-indicator').innerHTML = `<i class="ri-checkbox-circle-fill" style="color:var(--success);"></i> Sincronizado`;
    }
}

/**
 * Remove a foto do slot e apaga do banco de dados e IndexedDB.
 */
async function deleteFotoCaptura(slotCodigo) {
    const confirmMsg = "Deseja realmente apagar esta foto?";
    if (!confirm(confirmMsg)) return;

    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === window.activeSecaoNum);
    const photoIdx = db.cautelares_fotos.findIndex(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);

    if (photoIdx !== -1) {
        const photo = db.cautelares_fotos[photoIdx];
        
        // 1. Apaga do IndexedDB
        await CautelarOfflineDB.deleteFoto(window.activeCautelarId, slotCodigo);

        // 2. Apaga da base online do Supabase
        if (window.useSupabase) {
            sbDelete('cautelares_fotos', photo.id).catch(e => console.warn(e));
        }

        // 3. Remove localmente
        db.cautelares_fotos.splice(photoIdx, 1);
        saveDatabase();

        showToast("Foto excluída com sucesso.", "info");

        // Recarrega a seção
        renderCapturaSecao(window.activeSecaoNum);
    }
}

/**
 * Comprime o arquivo de imagem usando canvas no cliente.
 */
function compressImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = (err) => reject(err);
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = (err) => reject(err);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSide) {
                        height *= maxSide / width;
                        width = maxSide;
                    }
                } else {
                    if (height > maxSide) {
                        width *= maxSide / height;
                        height = maxSide;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("Canvas blob conversion failed"));
                    }
                }, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ============================================================================
// CANVAS DE ASSINATURA DIGITAL (SEÇÃO VIII)
// ============================================================================

function initSignatureCanvas() {
    const canvas = document.getElementById('signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Configura tamanho correto no canvas interno
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.strokeStyle = '#050811'; // Cor navy profunda para a assinatura
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    function getPos(e) {
        const r = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - r.left,
            y: clientY - r.top
        };
    }

    function startDraw(e) {
        drawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
        e.preventDefault();
    }

    function draw(e) {
        if (!drawing) return;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        e.preventDefault();
        lastX = pos.x;
        lastY = pos.y;
    }

    function stopDraw() {
        drawing = false;
        saveSignatureCanvas(false); // Auto-salva rascunho sem alerta
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDraw);
    
    // Desenha de volta se houver rascunho salvo
    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === 8);
    if (secao && secao.dadosJson && secao.dadosJson.signatureBase64) {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = secao.dadosJson.signatureBase64;
    }
}

function clearSignatureCanvas() {
    const canvas = document.getElementById('signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    autoSaveCampo('signatureBase64', null);
    document.getElementById('assinatura-ok-msg').style.display = 'none';
}

function saveSignatureCanvas(showAlert = true) {
    const canvas = document.getElementById('signature-canvas');
    if (!canvas) return;
    
    // Verifica se o canvas está vazio (simplificado)
    const buffer = new Uint32Array(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    const hasData = buffer.some(color => color !== 0);

    if (!hasData) {
        if (showAlert) showToast("Por favor, assine no quadro branco antes de confirmar.", "warning");
        return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    autoSaveCampo('signatureBase64', dataUrl);

    document.getElementById('assinatura-ok-msg').style.display = 'block';
    if (showAlert) showToast("Assinatura confirmada com sucesso!", "success");
}

// ============================================================================
// STUBS E PLACEHOLDERS RESTANTES (MILESTONE 3)
// ============================================================================

/**
 * Abre a visualização resumida (modo leitura) da Cautelar.
 */
function verResumoCautelar(cautelarId) {
    showToast("Visualização de resumo em desenvolvimento (Milestone 2).", "info");
}

// Variável de controle do finalizador
window.activeFinalizacaoCautelarId = null;
window.operatorSignatureConfirmed = false;

/**
 * Abre o painel de finalização desktop para a Cautelar selecionada.
 */
function abrirFinalizacaoDesktop(cautelarId) {
    if (!db || !currentSession) return;

    const cautelar = db.cautelares.find(c => c.id === cautelarId);
    if (!cautelar) {
        showToast("Cautelar não encontrada.", "error");
        return;
    }

    window.activeFinalizacaoCautelarId = cautelarId;
    window.operatorSignatureConfirmed = false;

    // Resgata o parecer final ou inicializa com o preliminar
    const secao8 = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === 8);
    const parecerPreliminar = secao8 && secao8.dadosJson ? secao8.dadosJson.parecerPreliminar : 'conforme';
    
    document.getElementById('caut-final-parecer').value = parecerPreliminar || 'conforme';
    document.getElementById('caut-final-obs').value = secao8 && secao8.dadosJson && secao8.dadosJson.observacaoFinal ? secao8.dadosJson.observacaoFinal : '';
    document.getElementById('assinatura-operador-ok-msg').style.display = 'none';

    // Ocultar listagem e exibir finalização
    document.getElementById('cautelar-listagem-view').style.display = 'none';
    document.getElementById('cautelar-finalizacao-view').style.display = 'grid';

    // Inicializar canvas de assinatura do operador
    setTimeout(() => {
        initOperatorSignatureCanvas();
        atualizarPreviewLaudo();
    }, 100);
}

/**
 * Fecha a tela de finalização desktop.
 */
function fecharFinalizacaoDesktop() {
    window.activeFinalizacaoCautelarId = null;

    // Habilita inputs novamente
    const parecerSelect = document.getElementById('caut-final-parecer');
    if (parecerSelect) parecerSelect.disabled = false;
    
    const obsTextarea = document.getElementById('caut-final-obs');
    if (obsTextarea) obsTextarea.disabled = false;
    
    const canvasCard = document.getElementById('operator-signature-canvas')?.closest('.panel-card');
    if (canvasCard) canvasCard.style.display = 'block';

    document.getElementById('cautelar-finalizacao-view').style.display = 'none';
    document.getElementById('cautelar-listagem-view').style.display = 'block';
    
    renderRegistrarCautelarPage();
}

/**
 * Inicializa o canvas de assinatura do operador finalizador.
 */
function initOperatorSignatureCanvas() {
    const canvas = document.getElementById('operator-signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.strokeStyle = '#050811';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    function getPos(e) {
        const r = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - r.left,
            y: clientY - r.top
        };
    }

    function startDraw(e) {
        drawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
        e.preventDefault();
    }

    function draw(e) {
        if (!drawing) return;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        e.preventDefault();
        lastX = pos.x;
        lastY = pos.y;
    }

    function stopDraw() {
        drawing = false;
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDraw);

    // Se o operador já confirmou assinatura e ela está salva na sessão
    if (sessionStorage.getItem('certive_operator_signature')) {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = sessionStorage.getItem('certive_operator_signature');
        window.operatorSignatureConfirmed = true;
        document.getElementById('assinatura-operador-ok-msg').style.display = 'block';
    }
}

function clearOperatorSignatureCanvas() {
    const canvas = document.getElementById('operator-signature-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    window.operatorSignatureConfirmed = false;
    document.getElementById('assinatura-operador-ok-msg').style.display = 'none';
}

function confirmOperatorSignature(showAlert = true) {
    const canvas = document.getElementById('operator-signature-canvas');
    if (!canvas) return;

    const buffer = new Uint32Array(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    const hasData = buffer.some(color => color !== 0);

    if (!hasData) {
        if (showAlert) showToast("Desenhe sua assinatura no quadro antes de confirmar.", "warning");
        return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    sessionStorage.setItem('certive_operator_signature', dataUrl);
    window.operatorSignatureConfirmed = true;
    
    document.getElementById('assinatura-operador-ok-msg').style.display = 'block';
    if (showAlert) showToast("Assinatura do operador confirmada!", "success");
    
    atualizarPreviewLaudo();
}

/**
 * Renderiza a pré-visualização real-time do Laudo A4 de 9 páginas.
 */
function atualizarPreviewLaudo_old() {
    const previewContainer = document.getElementById('laudo-preview-container');
    if (!previewContainer) return;

    const cautelar = db.cautelares.find(c => c.id === window.activeFinalizacaoCautelarId);
    if (!cautelar) return;

    const os = db.ordens_servico.find(o => o.id === cautelar.osId);
    const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelar.id);

    // Resgata os dados preenchidos
    const dataSec1 = (secoes.find(s => s.numeroSecao === 1)?.dadosJson) || {};
    const dataSec2 = (secoes.find(s => s.numeroSecao === 2)?.dadosJson) || {};
    const dataSec3 = (secoes.find(s => s.numeroSecao === 3)?.dadosJson) || {};
    const dataSec4 = (secoes.find(s => s.numeroSecao === 4)?.dadosJson) || {};
    const dataSec5 = (secoes.find(s => s.numeroSecao === 5)?.dadosJson) || {};
    const dataSec6 = (secoes.find(s => s.numeroSecao === 6)?.dadosJson) || {};
    const dataSec7 = (secoes.find(s => s.numeroSecao === 7)?.dadosJson) || {};
    const dataSec8 = (secoes.find(s => s.numeroSecao === 8)?.dadosJson) || {};

    const parecerFinal = document.getElementById('caut-final-parecer').value;
    const obsFinal = document.getElementById('caut-final-obs').value;

    const signatureVistoriador = dataSec8.signatureBase64 || '';
    const signatureOperador = sessionStorage.getItem('certive_operator_signature') || '';

    // Coleta as fotos
    const fotos = db.cautelares_fotos.filter(f => secoes.map(s => s.id).includes(f.secaoId));

    const getFotoUrl = (codigo) => {
        const f = fotos.find(ph => ph.slotCodigo === codigo);
        return f ? (f.url_thumb || f.url_original || '') : '';
    };

    // Estilo comum das folhas internas
    const headerStyle = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid rgba(0, 0, 0, 0.08); padding-bottom: 8px; margin-bottom: 18px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 22px; height: 22px; border: 1.5px solid #C9A961; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #C9A961; font-weight: 900; font-size: 11px; font-family: 'Outfit', sans-serif;">C</div>
                <div style="font-size: 11px; font-weight: 800; color: #0A1F3D; font-family: 'Outfit', sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">Certive Vistorias</div>
                <div style="font-size: 8px; color: #a3aab8; font-weight: 500; font-family: 'Outfit', sans-serif; text-transform: uppercase; margin-left: 5px;">ECV CREDENCIADA DETRAN-SC</div>
            </div>
            <div style="text-align: right; font-family: 'Outfit', sans-serif;">
                <span style="font-size: 8px; color: #a3aab8; font-weight: 600; text-transform: uppercase;">DOSSIÊ</span><br>
                <span style="font-family: monospace; font-size: 9px; color: #0A1F3D; font-weight: 700;">${cautelar.dossieNumero}</span>
            </div>
        </div>
    `;

    const getFooterStyle = (pageNum) => `
        <div style="position: absolute; bottom: 30px; left: 40px; right: 40px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(0,0,0,0.06); padding-top: 8px; font-size: 8px; color: #a3aab8; font-family: 'Outfit', sans-serif; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px;">
            <span>CERTIVE VISTORIAS — CAUTELAR</span>
            <span>PÁG. 0${pageNum} DE 09</span>
        </div>
    `;

    let html = '';

    // ==========================================
    // PÁGINA 1: CAPA DO LAUDO (ESTILO PREMIUM AZUL DO MODELO)
    // ==========================================
    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 60px 50px; background: #050E1A; color: #fdfdfb; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; font-family: 'Outfit', sans-serif;">
            <!-- Linha Decorativa Dourada Topo -->
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 5px; background: #C9A961;"></div>
            
            <div style="display: flex; flex-direction: column; align-items: center; margin-top: 40px;">
                <!-- Logo Dourada Redonda -->
                <div style="width: 75px; height: 75px; border: 2px solid #C9A961; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 25px; box-shadow: 0 0 15px rgba(201, 169, 97, 0.2);">
                    <div style="color: #C9A961; font-size: 32px; font-weight: 900; letter-spacing: -2px;">C</div>
                </div>
                <h2 style="font-size: 16px; font-weight: 800; color: #C9A961; letter-spacing: 2px; text-transform: uppercase; margin: 0;">CERTIVE VISTORIAS</h2>
                <span style="font-size: 9px; font-weight: 500; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-top: 4px; letter-spacing: 0.5px;">ECV Credenciada Detran-SC</span>
            </div>

            <div style="text-align: center; margin: 40px 0;">
                <h1 style="font-size: 52px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; margin: 0 0 10px 0; text-transform: uppercase; font-family: 'Outfit', sans-serif; line-height: 1.1;">LAUDO<br>CAUTELAR</h1>
                <div style="font-size: 18px; font-weight: 700; color: #C9A961; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 25px;">de Aquisição Veicular</div>
                <div style="height: 1px; width: 60px; background: rgba(255,255,255,0.2); margin: 0 auto 25px auto;"></div>
                <p style="font-size: 11px; color: rgba(255,255,255,0.6); font-weight: 400; text-transform: uppercase; letter-spacing: 1.5px; margin: 0; line-height: 1.6;">Análise Físico-Estrutural<br>e Pesquisa Documental</p>
            </div>

            <!-- Selo Círculo Dourado Cautelar no centro inferior -->
            <div style="display: flex; justify-content: center; margin: 20px 0;">
                <div style="width: 130px; height: 130px; border: 1.5px dashed rgba(201, 169, 97, 0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative;">
                    <div style="width: 112px; height: 112px; border: 1.5px solid #C9A961; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.02);">
                        <div style="font-size: 18px; font-weight: 900; color: #C9A961;">C</div>
                        <span style="font-size: 6px; font-weight: 800; color: #C9A961; letter-spacing: 0.8px; text-transform: uppercase; margin-top: 2px;">CERTIVE</span>
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; font-size: 11px; color: rgba(255,255,255,0.7); font-family: 'Outfit', sans-serif;">
                <div>
                    <strong style="color: #C9A961;">SÃO JOSÉ / SC</strong><br>
                    <span>${new Date(cautelar.criadoEm).toLocaleDateString('pt-BR')}</span>
                </div>
                <div style="text-align: right;">
                    <strong style="color: #C9A961;">DOSSIÊ:</strong> <span style="font-family: monospace;">${cautelar.dossieNumero}</span>
                </div>
            </div>
        </div>
    `;

    // ==========================================
    // PÁGINA 2: IDENTIFICAÇÃO DO VEÍCULO (FICHA COM DUAS FOTOS LATERAIS)
    // ==========================================
    const imgVeiculo1 = getFotoUrl('frente_45_dir');
    const imgVeiculo2 = getFotoUrl('traseira_45_esq');
    
    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 40px; background: #FAF9F6; color: #0F1824; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; font-family: 'Outfit', sans-serif;">
            ${headerStyle}
            
            <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; margin-top: 10px;">
                <!-- Coluna de Títulos e Ficha Técnica -->
                <div>
                    <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px;">
                        <span style="font-family: 'Times New Roman', Times, serif; font-style: italic; font-size: 32px; color: #C9A961; font-weight: 700; line-height: 1;">I</span>
                        <div>
                            <h3 style="font-size: 16px; font-weight: 800; color: #0A1F3D; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Identificação<br>do Veículo</h3>
                        </div>
                    </div>

                    <!-- Ficha Técnica -->
                    <div style="display: flex; flex-direction: column; gap: 10px; font-size: 11px;">
                        <div>
                            <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Marca / Modelo</span>
                            <span style="font-weight: 800; font-size: 12px; color: #0A1F3D; text-transform: uppercase;">${os.clienteNome || 'TOYOTA COROLLA XEI 2.0'}</span>
                        </div>
                        <div style="height: 1px; background: rgba(0,0,0,0.05);"></div>
                        <div>
                            <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Ano Fabricação / Modelo</span>
                            <span style="font-weight: 700; color: #0a1f3d;">${os.fabricacaoAno || '2019'} / ${os.modeloAno || '2020'}</span>
                        </div>
                        <div style="height: 1px; background: rgba(0,0,0,0.05);"></div>
                        <div>
                            <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Cor</span>
                            <span style="font-weight: 700; color: #0a1f3d; text-transform: uppercase;">${os.cor || 'PRATA'}</span>
                        </div>
                        <div style="height: 1px; background: rgba(0,0,0,0.05);"></div>
                        <div>
                            <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Placa</span>
                            <span style="font-weight: 700; color: #0a1f3d; font-family: monospace; font-size: 12px; text-transform: uppercase;">${os.placa}</span>
                        </div>
                        <div style="height: 1px; background: rgba(0,0,0,0.05);"></div>
                        <div>
                            <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Chassi</span>
                            <span style="font-weight: 700; color: #0a1f3d; font-family: monospace; text-transform: uppercase;">${os.renavam || '9BRB03HE0L2567890'}</span>
                        </div>
                        <div style="height: 1px; background: rgba(0,0,0,0.05);"></div>
                        <div>
                            <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Motor</span>
                            <span style="font-weight: 700; color: #0a1f3d; font-family: monospace; text-transform: uppercase;">${os.chassi || '3ZR-FAE L256789'}</span>
                        </div>
                        <div style="height: 1px; background: rgba(0,0,0,0.05);"></div>
                        <div>
                            <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">Combustível</span>
                            <span style="font-weight: 700; color: #0a1f3d; text-transform: uppercase;">${dataSec1.combustivel || 'FLEX'}</span>
                        </div>
                        <div style="height: 1px; background: rgba(0,0,0,0.05);"></div>
                        <div>
                            <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px;">KM Informado</span>
                            <span style="font-weight: 700; color: #0a1f3d;">${dataSec1.quilometragem || '68.932'} km</span>
                        </div>
                    </div>
                </div>

                <!-- Coluna de Imagens e Dados de Vistoria -->
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <!-- Foto 1 -->
                    <div style="width: 100%; height: 160px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.08); overflow: hidden; background: #eef1f5;">
                        ${imgVeiculo1 ? `<img src="${imgVeiculo1}" style="width: 100%; height: 100%; object-fit: cover;">` : `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:10px; color:#aaa;">FRENTE 45° LADO DIREITO</div>`}
                    </div>
                    <!-- Foto 2 -->
                    <div style="width: 100%; height: 160px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.08); overflow: hidden; background: #eef1f5;">
                        ${imgVeiculo2 ? `<img src="${imgVeiculo2}" style="width: 100%; height: 100%; object-fit: cover;">` : `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:10px; color:#aaa;">TRASEIRA 45° LADO ESQUERDO</div>`}
                    </div>

                    <!-- Dados da Vistoria Card -->
                    <div style="background: rgba(10, 31, 61, 0.02); border: 1px solid rgba(10, 31, 61, 0.06); border-radius: 4px; padding: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 10px; margin-top: 10px;">
                        <h4 style="font-size: 9px; font-weight: 800; color: #0A1F3D; text-transform: uppercase; margin: 0 0 4px 0; letter-spacing: 0.5px;">Dados da Vistoria</h4>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #a3aab8; font-weight: 500;">DATA / HORA:</span>
                            <span style="font-weight: 700; color: #0a1f3d;">${new Date(cautelar.criadoEm).toLocaleDateString('pt-BR')} às ${new Date(cautelar.criadoEm).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #a3aab8; font-weight: 500;">LOCAL:</span>
                            <span style="font-weight: 700; color: #0a1f3d;">${db.unidades.find(u => u.id === os.unidadeId)?.nome || 'São José / SC'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #a3aab8; font-weight: 500;">VISTORIADOR:</span>
                            <span style="font-weight: 700; color: #0a1f3d; text-transform: uppercase;">${db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome || 'Romano Gonzales Mendes'}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            ${getFooterStyle(2)}
        </div>
    `;

    // ==========================================
    // PÁGINA 3: RESUMO DA ANÁLISE (EVALUATION BLOCKS)
    // ==========================================
    let labelParecer = 'CONFORME';
    let labelColor = '#3a663b';
    let labelBg = 'rgba(58, 102, 59, 0.08)';
    let labelBorder = 'rgba(58, 102, 59, 0.2)';
    let labelTextDesc = 'Com base nas verificações realizadas, o veículo apresenta condições compatíveis com sua idade e uso, não havendo impedimentos para a aquisição.';

    if (parecerFinal === 'com_ressalvas') {
        labelParecer = 'CONFORME COM RESSALVAS';
        labelColor = '#B8642B';
        labelBg = 'rgba(184, 100, 43, 0.08)';
        labelBorder = 'rgba(184, 100, 43, 0.2)';
        labelTextDesc = 'Foram identificadas repinturas em painéis secundários, sem indícios de massa poliéster ou reparos estruturais.';
    } else if (parecerFinal === 'nao_conforme') {
        labelParecer = 'NÃO CONFORME';
        labelColor = '#8B2635';
        labelBg = 'rgba(139, 38, 53, 0.08)';
        labelBorder = 'rgba(139, 38, 53, 0.2)';
        labelTextDesc = 'Identificado dano ou solda em regiões de chassi / colunas estruturais, gerando reprovação por comprometimento de integridade física.';
    }

    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 40px; background: #FAF9F6; color: #0F1824; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; font-family: 'Outfit', sans-serif;">
            ${headerStyle}
            
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; margin-top: 10px;">
                <span style="font-family: 'Times New Roman', Times, serif; font-style: italic; font-size: 32px; color: #C9A961; font-weight: 700; line-height: 1;">II</span>
                <div>
                    <h3 style="font-size: 16px; font-weight: 800; color: #0A1F3D; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Resumo da Análise</h3>
                </div>
            </div>

            <!-- Blocos de Avaliação de Módulos (Modelo Corolla) -->
            <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 30px;">
                <!-- Bloco Estrutura -->
                <div style="display: flex; gap: 16px; background: #ffffff; border: 1px solid rgba(0,0,0,0.05); border-radius: 6px; padding: 16px; align-items: center;">
                    <div style="width: 42px; height: 42px; border-radius: 50%; background: ${dataSec3.parecerEstrutural === 'nao_conforme' ? 'rgba(139, 38, 53, 0.08)' : (dataSec3.parecerEstrutural === 'com_ressalvas' ? 'rgba(184, 100, 43, 0.08)' : 'rgba(58, 102, 59, 0.08)')}; display: flex; align-items: center; justify-content: center; color: ${dataSec3.parecerEstrutural === 'nao_conforme' ? '#8B2635' : (dataSec3.parecerEstrutural === 'com_ressalvas' ? '#B8642B' : '#3a663b')}; font-size: 20px;">
                        <i class="ri-shield-check-line"></i>
                    </div>
                    <div style="flex: 1; font-size: 11px;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 2px;">ESTRUTURA E CARROCERIA</strong>
                        <span style="color: ${dataSec3.parecerEstrutural === 'nao_conforme' ? '#8B2635' : (dataSec3.parecerEstrutural === 'com_ressalvas' ? '#B8642B' : '#3a663b')}; font-weight: 700; text-transform: uppercase; margin-right: 6px;">${dataSec3.parecerEstrutural === 'nao_conforme' ? 'NÃO CONFORME' : (dataSec3.parecerEstrutural === 'com_ressalvas' ? 'COM RESSALVAS' : 'CONFORME')}</span>
                        <span style="color: #a3aab8; font-weight: 400;">${dataSec3.observacao || 'Não foram identificados sinais de sinistro, corte estrutural, remarcação de chassi ou danos que comprometam a integridade do veículo.'}</span>
                    </div>
                </div>

                <!-- Bloco Pintura -->
                <div style="display: flex; gap: 16px; background: #ffffff; border: 1px solid rgba(0,0,0,0.05); border-radius: 6px; padding: 16px; align-items: center;">
                    <div style="width: 42px; height: 42px; border-radius: 50%; background: rgba(184, 100, 43, 0.08); display: flex; align-items: center; justify-content: center; color: #B8642B; font-size: 20px;">
                        <i class="ri-palette-line"></i>
                    </div>
                    <div style="flex: 1; font-size: 11px;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 2px;">PINTURA E ACABAMENTO</strong>
                        <span style="color: #B8642B; font-weight: 700; text-transform: uppercase; margin-right: 6px;">COM RESSALVAS</span>
                        <span style="color: #a3aab8; font-weight: 400;">Foram identificadas repinturas em painéis secundários, sem indícios de massa poliéster ou reparos estruturais.</span>
                    </div>
                </div>

                <!-- Bloco Documentação -->
                <div style="display: flex; gap: 16px; background: #ffffff; border: 1px solid rgba(0,0,0,0.05); border-radius: 6px; padding: 16px; align-items: center;">
                    <div style="width: 42px; height: 42px; border-radius: 50%; background: rgba(58, 102, 59, 0.08); display: flex; align-items: center; justify-content: center; color: #3a663b; font-size: 20px;">
                        <i class="ri-file-list-3-line"></i>
                    </div>
                    <div style="flex: 1; font-size: 11px;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 2px;">DOCUMENTAÇÃO E RESTRIÇÕES</strong>
                        <span style="color: #3a663b; font-weight: 700; text-transform: uppercase; margin-right: 6px;">CONFORME</span>
                        <span style="color: #a3aab8; font-weight: 400;">Veículo com situação cadastral regular. Sem restrições, débitos ou apontamentos nas bases consultadas.</span>
                    </div>
                </div>
            </div>

            <!-- Parecer Técnico Card Base -->
            <div style="background: ${labelBg}; border: 1.5px solid ${labelBorder}; border-radius: 6px; padding: 20px; font-size: 12px;">
                <span style="font-size: 8px; color: #a3aab8; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 2px; letter-spacing: 0.5px;">PARECER TÉCNICO</span>
                <h2 style="font-size: 26px; font-weight: 800; color: ${labelColor}; margin: 0 0 10px 0; letter-spacing: 0.5px; text-transform: uppercase;">${labelParecer}</h2>
                <p style="font-size: 11.5px; color: #0A1F3D; line-height: 1.6; margin: 0; font-weight: 500;">
                    ${labelTextDesc}
                </p>
            </div>

            ${getFooterStyle(3)}
        </div>
    `;

    // ==========================================
    // PÁGINA 4: ANÁLISE ESTRUTURAL — REGIÃO DO CHASSI
    // ==========================================
    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 40px; background: #FAF9F6; color: #0F1824; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; font-family: 'Outfit', sans-serif;">
            ${headerStyle}
            
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; margin-top: 10px;">
                <span style="font-family: 'Times New Roman', Times, serif; font-style: italic; font-size: 32px; color: #C9A961; font-weight: 700; line-height: 1;">III</span>
                <div>
                    <h3 style="font-size: 16px; font-weight: 800; color: #0A1F3D; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Análise Estrutural<br><span style="font-size: 11px; color:#a3aab8; font-weight: 600;">Região do Chassi</span></h3>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 18px; margin-top: 10px;">
                <!-- Bloco 1 -->
                <div style="display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 16px;">
                    <div style="width: 100%; height: 135px; border-radius: 4px; overflow: hidden; background: #eef1f5; border: 1px solid rgba(0,0,0,0.05);">
                        ${getFotoUrl('chassi_gravado') ? `<img src="${getFotoUrl('chassi_gravado')}" style="width: 100%; height: 100%; object-fit: cover;">` : ''}
                    </div>
                    <div style="font-size: 11px; line-height: 1.5;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 4px; text-transform: uppercase;">Gravação de chassi</strong>
                        <p style="color: #a3aab8; margin: 0;">Numeração original de fábrica, gravação dentro do padrão apresentado pelo fabricante. Sem sinais de alteração.</p>
                    </div>
                </div>

                <!-- Bloco 2 -->
                <div style="display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 16px;">
                    <div style="width: 100%; height: 135px; border-radius: 4px; overflow: hidden; background: #eef1f5; border: 1px solid rgba(0,0,0,0.05);">
                        ${getFotoUrl('longarina_diant_esq') ? `<img src="${getFotoUrl('longarina_diant_esq')}" style="width: 100%; height: 100%; object-fit: cover;">` : ''}
                    </div>
                    <div style="font-size: 11px; line-height: 1.5;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 4px; text-transform: uppercase;">Longarina dianteira</strong>
                        <p style="color: #a3aab8; margin: 0;">Estrutura íntegra. Solda e pontos de fábrica preservados. Sem sinais de reparo ou soldas corretivas.</p>
                    </div>
                </div>

                <!-- Bloco 3 -->
                <div style="display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: center; padding-bottom: 16px;">
                    <div style="width: 100%; height: 135px; border-radius: 4px; overflow: hidden; background: #eef1f5; border: 1px solid rgba(0,0,0,0.05);">
                        ${getFotoUrl('assoalho_porta_malas') ? `<img src="${getFotoUrl('assoalho_porta_malas')}" style="width: 100%; height: 100%; object-fit: cover;">` : ''}
                    </div>
                    <div style="font-size: 11px; line-height: 1.5;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 4px; text-transform: uppercase;">Assoalho central</strong>
                        <p style="color: #a3aab8; margin: 0;">Estrutura íntegra. Sem sinais de amassado, solda irregular ou reparos estruturais no habitáculo.</p>
                    </div>
                </div>
            </div>

            ${getFooterStyle(4)}
        </div>
    `;

    // ==========================================
    // PÁGINA 5: PINTURA E ACABAMENTO (MICRÔMETRO & ESTRUTURA DO CARRO)
    // ==========================================
    const paintPanels = [
        "Capô", "Para-lama Dianteiro Esq.", "Porta Dianteira Esq.", "Porta Traseira Esq.",
        "Para-lama Traseiro Esq.", "Teto", "Para-lama Traseiro Dir.", "Porta Traseira Dir.",
        "Porta Dianteira Dir.", "Para-lama Dianteiro Dir.", "Tampa Traseira"
    ];

    const paintRowsHtml = paintPanels.map((p, idx) => {
        const val = parseFloat(dataSec4[`painel_${idx}`]) || 0;
        const isRepaint = val > 150;
        return `
            <div style="display: flex; justify-content: space-between; font-size: 10.5px; border-bottom: 1px solid rgba(0,0,0,0.04); padding: 5px 0;">
                <span style="font-weight: 600; color: #0A1F3D;">${p}</span>
                <span style="font-family: monospace; font-weight: 700; color: ${isRepaint ? '#B8642B' : '#0A1F3D'}">${val ? val + ' µm' : '112 µm'}</span>
            </div>
        `;
    }).join('');

    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 40px; background: #FAF9F6; color: #0F1824; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; font-family: 'Outfit', sans-serif;">
            ${headerStyle}
            
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; margin-top: 10px;">
                <span style="font-family: 'Times New Roman', Times, serif; font-style: italic; font-size: 32px; color: #C9A961; font-weight: 700; line-height: 1;">IV</span>
                <div>
                    <h3 style="font-size: 16px; font-weight: 800; color: #0A1F3D; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Pintura e Acabamento<br><span style="font-size: 11px; color:#a3aab8; font-weight: 600;">Medição de Espessura</span></h3>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 260px 1fr; gap: 30px; margin-top: 15px;">
                <!-- Esquema visual do carro -->
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; border: 1px solid rgba(0,0,0,0.05); border-radius: 6px; padding: 20px;">
                    <!-- Vetor do carro simulado -->
                    <div style="width: 130px; height: 320px; border: 1.5px solid #a3aab8; border-radius: 20px; position: relative; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 15px 0; background: #faf9f6;">
                        <!-- Capo -->
                        <div style="width: 70px; height: 55px; border: 1px solid #C9A961; border-radius: 8px; background: rgba(201, 169, 97, 0.05); display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color:#C9A961;">CAPÔ</div>
                        <!-- Teto -->
                        <div style="width: 80px; height: 95px; border: 1px solid #0A1F3D; border-radius: 6px; background: rgba(10,31,61,0.02); display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color:#0A1F3D;">TETO</div>
                        <!-- Mala -->
                        <div style="width: 70px; height: 40px; border: 1px solid #0A1F3D; border-radius: 4px; background: rgba(10,31,61,0.02); display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color:#0A1F3D;">MALA</div>
                    </div>
                </div>

                <!-- Tabela de Micragem -->
                <div style="display: flex; flex-direction: column; justify-content: space-between;">
                    <div style="display: flex; flex-direction: column;">
                        <div style="display: flex; justify-content: space-between; font-size: 9px; font-weight: 800; color: #a3aab8; border-bottom: 1.5px solid #0A1F3D; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <span>Painel</span>
                            <span>Espessura</span>
                        </div>
                        <div style="display: flex; flex-direction: column; margin-top: 5px;">
                            ${paintRowsHtml}
                        </div>
                    </div>

                    <!-- Observação do Vistoriador -->
                    <div style="border: 1px solid rgba(0,0,0,0.08); border-radius: 4px; padding: 12px; font-size: 10px; background: #ffffff; margin-top: 15px;">
                        <strong style="font-size: 8px; color: #a3aab8; display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Observação do Vistoriador</strong>
                        <p style="margin: 0; color: #0A1F3D; font-weight: 500;">
                            Repinturas identificadas no painel da lateral direita traseira e portas correspondentes. Não foi detectada presença de massa poliéster ou alterações estruturais.
                        </p>
                    </div>
                </div>
            </div>

            ${getFooterStyle(5)}
        </div>
    `;

    // ==========================================
    // PÁGINA 6: COMPARTIMENTO DO MOTOR E ESTRUTURAS
    // ==========================================
    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 40px; background: #FAF9F6; color: #0F1824; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; font-family: 'Outfit', sans-serif;">
            ${headerStyle}
            
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; margin-top: 10px;">
                <span style="font-family: 'Times New Roman', Times, serif; font-style: italic; font-size: 32px; color: #C9A961; font-weight: 700; line-height: 1;">V</span>
                <div>
                    <h3 style="font-size: 16px; font-weight: 800; color: #0A1F3D; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Compartimento do Motor<br><span style="font-size: 11px; color:#a3aab8; font-weight: 600;">e Estruturas</span></h3>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 18px; margin-top: 10px;">
                <!-- Bloco 1 -->
                <div style="display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 16px;">
                    <div style="width: 100%; height: 135px; border-radius: 4px; overflow: hidden; background: #eef1f5; border: 1px solid rgba(0,0,0,0.05);">
                        ${getFotoUrl('torre_amort_diant_esq') ? `<img src="${getFotoUrl('torre_amort_diant_esq')}" style="width: 100%; height: 100%; object-fit: cover;">` : ''}
                    </div>
                    <div style="font-size: 11px; line-height: 1.5;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 4px; text-transform: uppercase;">Torre do amortecedor lado esquerdo</strong>
                        <p style="color: #a3aab8; margin: 0;">Ponto de solda de fábrica íntegro. Sem sinais de reparo, corte ou deformação.</p>
                    </div>
                </div>

                <!-- Bloco 2 -->
                <div style="display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 16px;">
                    <div style="width: 100%; height: 135px; border-radius: 4px; overflow: hidden; background: #eef1f5; border: 1px solid rgba(0,0,0,0.05);">
                        ${getFotoUrl('painel_corta_fogo') ? `<img src="${getFotoUrl('painel_corta_fogo')}" style="width: 100%; height: 100%; object-fit: cover;">` : ''}
                    </div>
                    <div style="font-size: 11px; line-height: 1.5;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 4px; text-transform: uppercase;">Painel Corta-Fogo</strong>
                        <p style="color: #a3aab8; margin: 0;">Estrutura íntegra. Soldas originais preservadas.</p>
                    </div>
                </div>

                <!-- Bloco 3 -->
                <div style="display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: center; padding-bottom: 16px;">
                    <div style="width: 100%; height: 135px; border-radius: 4px; overflow: hidden; background: #eef1f5; border: 1px solid rgba(0,0,0,0.05);">
                        ${getFotoUrl('torre_amort_diant_dir') ? `<img src="${getFotoUrl('torre_amort_diant_dir')}" style="width: 100%; height: 100%; object-fit: cover;">` : ''}
                    </div>
                    <div style="font-size: 11px; line-height: 1.5;">
                        <strong style="font-size: 12px; color: #0a1f3d; display: block; margin-bottom: 4px; text-transform: uppercase;">Torre do amortecedor lado direito</strong>
                        <p style="color: #a3aab8; margin: 0;">Ponto de solda de fábrica íntegro. Sem sinais de reparo, corte ou deformação.</p>
                    </div>
                </div>
            </div>

            ${getFooterStyle(6)}
        </div>
    `;

    // ==========================================
    // PÁGINA 7: PESQUISA DOCUMENTAL (RESUMO DAS CONSULTAS)
    // ==========================================
    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 40px; background: #FAF9F6; color: #0F1824; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; font-family: 'Outfit', sans-serif;">
            ${headerStyle}
            
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; margin-top: 10px;">
                <span style="font-family: 'Times New Roman', Times, serif; font-style: italic; font-size: 32px; color: #C9A961; font-weight: 700; line-height: 1;">VI</span>
                <div>
                    <h3 style="font-size: 16px; font-weight: 800; color: #0A1F3D; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Pesquisa Documental<br><span style="font-size: 11px; color:#a3aab8; font-weight: 600;">Resumo das Consultas</span></h3>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px; margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <span style="font-weight: 600; color: #0a1f3d;">SITUAÇÃO CADASTRAL (SENATRAN)</span>
                    <span style="font-weight: 700; color: #6b8a3e;">REGULAR</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <span style="font-weight: 600; color: #0a1f3d;">RESTRIÇÃO ADMINISTRATIVA (RENAJUD)</span>
                    <span style="font-weight: 700; color: #6b8a3e;">NADA CONSTA</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <span style="font-weight: 600; color: #0a1f3d;">RESTRIÇÃO JUDICIAL</span>
                    <span style="font-weight: 700; color: #6b8a3e;">NADA CONSTA</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <span style="font-weight: 600; color: #0a1f3d;">ALIENAÇÃO FIDUCIÁRIA</span>
                    <span style="font-weight: 700; color: #6b8a3e;">NADA CONSTA</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <span style="font-weight: 600; color: #0a1f3d;">DÉBITOS (IPVA / LICENCIAMENTO / MULTAS)</span>
                    <span style="font-weight: 700; color: #6b8a3e;">NADA CONSTA</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <span style="font-weight: 600; color: #0a1f3d;">HISTÓRICO DE ROUBO E FURTO</span>
                    <span style="font-weight: 700; color: #6b8a3e;">NADA CONSTA</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <span style="font-weight: 600; color: #0a1f3d;">INDÍCIO DE SINISTRO (BASE SEGURADORAS)</span>
                    <span style="font-weight: 700; color: #6b8a3e;">NADA CONSTA</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <span style="font-weight: 600; color: #0a1f3d;">HISTÓRICO DE LEILÃO</span>
                    <span style="font-weight: 700; color: #6b8a3e;">NADA CONSTA</span>
                </div>
            </div>

            <!-- Fonte das Consultas Card -->
            <div style="background: rgba(10, 31, 61, 0.02); border: 1px solid rgba(10, 31, 61, 0.06); border-radius: 4px; padding: 16px; margin-top: 30px; font-size: 10px; line-height: 1.5; color: #a3aab8;">
                <strong style="color: #0A1F3D; font-size: 11px; display: block; margin-bottom: 6px; text-transform: uppercase;">Fonte das Consultas</strong>
                <span>SENATRAN • DETRAN/SC • RENAJUD • BIN (BASE SEGURADORAS) • SINESP • INFOSEG • BASE PROPRIETÁRIA CERTIVE</span><br>
                <span style="margin-top: 10px; display: block;">Data das consultas: ${new Date(cautelar.criadoEm).toLocaleDateString('pt-BR')} às 08:52</span>
            </div>

            ${getFooterStyle(7)}
        </div>
    `;

    // ==========================================
    // PÁGINA 8: REGISTRO FOTOGRÁFICO VISTORIA GERAL (GRID DE FOTOS)
    // ==========================================
    const gridCodes = [
        'frente_45_dir', 'traseira_45_esq', 'painel_hodometro',
        'crlv_documento', 'placa_dianteira', 'motor_vista_geral'
    ];

    const gridPhotosHtml = gridCodes.map(code => {
        const url = getFotoUrl(code);
        return `
            <div style="width: 100%; height: 115px; border-radius: 4px; overflow: hidden; background: #eef1f5; border: 1px solid rgba(0,0,0,0.05);">
                ${url ? `<img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">` : ''}
            </div>
        `;
    }).join('');

    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 40px; background: #FAF9F6; color: #0F1824; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; font-family: 'Outfit', sans-serif;">
            ${headerStyle}
            
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 24px; margin-top: 10px;">
                <span style="font-family: 'Times New Roman', Times, serif; font-style: italic; font-size: 32px; color: #C9A961; font-weight: 700; line-height: 1;">VII</span>
                <div>
                    <h3 style="font-size: 16px; font-weight: 800; color: #0A1F3D; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Registro Fotográfico<br><span style="font-size: 11px; color:#a3aab8; font-weight: 600;">Vistoria Geral</span></h3>
                </div>
            </div>

            <!-- Grid com 6 fotos principais -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 15px;">
                ${gridPhotosHtml}
            </div>

            <!-- QR Code do Laudo -->
            <div style="display: flex; justify-content: center; align-items: center; flex-direction: column; margin-top: 60px;">
                <div style="width: 100px; height: 100px; border: 1.5px solid #C9A961; border-radius: 4px; padding: 6px; background: white; display: flex; align-items: center; justify-content: center;">
                    <div id="laudo-preview-qrcode" style="width: 100%; height: 100%;"></div>
                </div>
                <span style="font-size: 7.5px; color: #a3aab8; font-weight: 600; text-transform: uppercase; margin-top: 10px; letter-spacing: 0.5px;">QR Code de Autenticidade do Laudo</span>
            </div>

            ${getFooterStyle(8)}
        </div>
    `;

    // ==========================================
    // PÁGINA 9: PARECER FINAL & ASSINATURAS (MODELO COROLLA)
    // ==========================================
    const hashLaudo = cautelar.hashLaudo || 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

    html += `
        <div class="laudo-pdf-page" style="width: 794px; height: 1122px; padding: 40px; background: #FAF9F6; color: #0F1824; box-shadow: 0 4px 10px rgba(0,0,0,0.2); box-sizing: border-box; position: relative; overflow: hidden; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; font-family: 'Outfit', sans-serif;">
            <div>
                ${headerStyle}
                
                <div style="text-align: center; margin-top: 15px; margin-bottom: 24px;">
                    <h3 style="font-size: 16px; font-weight: 800; color: #0A1F3D; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px;">Parecer Final</h3>
                </div>

                <!-- Box de Parecer Final Premium Dourado/Escuro -->
                <div style="background: #050E1A; color: white; padding: 30px; border-radius: 6px; border: 1.5px solid #C9A961; text-align: center; margin-bottom: 30px;">
                    <!-- Logo interna pequena -->
                    <div style="width: 32px; height: 32px; border: 1.5px solid #C9A961; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto;">
                        <span style="color:#C9A961; font-size:14px; font-weight:900;">C</span>
                    </div>
                    
                    <p style="font-size: 11px; line-height: 1.6; color: rgba(255,255,255,0.7); max-width: 500px; margin: 0 auto 16px auto; font-weight: 400;">
                        Com base em todas as verificações e pesquisas realizadas, certifico que o veículo vistoriado apresenta condições compatíveis com sua idade e uso, não havendo indícios de sinistro, remarcação de chassi, restrições ou irregularidades relevantes.
                    </p>
                    
                    <h2 style="font-size: 32px; font-weight: 800; color: #C9A961; margin: 0; text-transform: uppercase; letter-spacing: 1px;">CONFORME</h2>
                    <span style="font-size: 8.5px; font-weight: 600; color: #C9A961; letter-spacing: 1px; text-transform: uppercase;">PARA AQUISIÇÃO</span>
                </div>

                <!-- Rodapé de Localização e Data -->
                <div style="text-align: center; font-size: 11px; font-weight: 700; color: #0a1f3d; margin-bottom: 40px;">
                    São José/SC, ${new Date(cautelar.criadoEm).toLocaleDateString('pt-BR', {day: 'numeric', month: 'long', year: 'numeric'})}.
                </div>

                <!-- Assinatura Vistoriador -->
                <div style="display: flex; flex-direction: column; align-items: center; text-align: center; margin-top: 10px;">
                    <div style="width: 260px; height: 65px; border-bottom: 1.5px solid #0a1f3d; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        ${signatureVistoriador ? `<img src="${signatureVistoriador}" style="max-height: 100%; max-width: 100%; object-fit: contain;">` : ''}
                    </div>
                    <span style="font-size: 11px; font-weight: 800; color: #0a1f3d; margin-top: 6px; text-transform: uppercase;">${db.operadores.find(o => o.id === cautelar.vistoriadorId)?.nome || 'Carlos Eduardo Martins'}</span>
                    <span style="font-size: 8.5px; color: #a3aab8; font-weight: 700; text-transform: uppercase; margin-top: 2px;">VISTORIADOR</span>
                    <span style="font-size: 8px; font-family: monospace; color: #a3aab8; margin-top: 2px;">REGISTRO ECV ${cautelar.vistoriadorId ? '417.734.562-9' + cautelar.vistoriadorId : '417.734.562-91'}</span>
                </div>
            </div>

            <!-- Assinatura do Selo de Cautelar Rodapé -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1.5px solid #C9A961; padding-top: 15px; margin-top: 20px;">
                <div style="max-width: 480px; font-family: 'Outfit', sans-serif; font-size: 9px; color: #a3aab8; font-weight: 500; line-height: 1.5;">
                    <strong style="color: #0a1f3d; font-size: 9.5px; text-transform: uppercase;">Validação Criptográfica do Laudo:</strong><br>
                    <span style="font-family: monospace; font-size: 8px; color: #a3aab8; word-break: break-all; font-weight: 400;">${hashLaudo}</span>
                </div>
                <!-- Selo Dourado Pequeno no Canto -->
                <div style="width: 70px; height: 70px; border: 1px solid #C9A961; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: white;">
                    <span style="color:#C9A961; font-size:13px; font-weight:900; line-height: 1;">C</span>
                    <span style="font-size: 5px; font-weight: 800; color:#C9A961; text-transform: uppercase; margin-top: 1px;">CERTIVE</span>
                </div>
            </div>

            ${getFooterStyle(9)}
        </div>
    `;

    previewContainer.innerHTML = html;

    // Gerar o QR Code no preview de forma assíncrona na página 8
    setTimeout(() => {
        const qrDiv = document.getElementById('laudo-preview-qrcode');
        if (qrDiv) {
            qrDiv.innerHTML = '';
            const validationUrl = `https://rbaggiofilho-source.github.io/CERTIVE-PRINCIPAL/consulta-laudo.html?hash=${hashLaudo}`;
            new QRCode(qrDiv, {
                text: validationUrl,
                width: 88,
                height: 88,
                colorDark : "#050e1a",
                colorLight : "#faf9f6",
                correctLevel : QRCode.CorrectLevel.H
            });
        }
    }, 100);
}

/**
 * Emite o laudo finalizando o status da vistoria, gera o Hash SHA-256 e exporta para PDF.
 */
function gerarLaudoFinalPdf() {
    const cautelar = db.cautelares.find(c => c.id === window.activeFinalizacaoCautelarId);
    if (!cautelar) return;

    const os = db.ordens_servico.find(o => o.id === cautelar.osId);
    const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelar.id);

    // Valida se o operador assinou
    if (!window.operatorSignatureConfirmed) {
        showToast("É obrigatório assinar e confirmar sua assinatura de operador antes de emitir o laudo.", "warning");
        return;
    }

    const parecerFinal = document.getElementById('caut-final-parecer').value;
    const obsFinal = document.getElementById('caut-final-obs').value;

    const confirmMsg = "Deseja realmente gerar a versão final e selada deste laudo PDF? Esta ação registrará as assinaturas e o hash na blockchain interna.";
    if (!confirm(confirmMsg)) return;

    // 1. Gera Hash Único do laudo (SHA-256 simulado)
    const seed = `${os.placa}_${cautelar.dossieNumero}_${new Date().toISOString()}`;
    // Simple hash function for client-side
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
    }
    const hashLaudo = 'sha256_' + Math.abs(hash).toString(16).padStart(16, '0') + Math.random().toString(36).substring(2, 18);

    cautelar.hashLaudo = hashLaudo;
    cautelar.parecerFinal = parecerFinal;
    cautelar.status = "concluida";
    cautelar.finalizadoEm = new Date().toISOString();
    cautelar.finalizadoPor = currentSession.nome;

    const approved = parecerFinal !== 'nao_conforme';

    // Se for de parceiro e reprovado
    if (os.clienteTipo === 'parceiro' && !approved) {
        const aplicarDesconto = confirm("Esta vistoria foi REPROVADA e o cliente é um lojista parceiro.\nDeseja aplicar o desconto comercial de 50% nesta OS?");
        if (aplicarDesconto) {
            const valorOriginal = os.valor;
            os.valor = parseFloat((valorOriginal * 0.5).toFixed(2));
            os.observacoes = (os.observacoes ? os.observacoes + " | " : "") + `Desconto comercial de 50% aplicado (Cautelar Reprovada). Valor original: R$ ${valorOriginal.toFixed(2)}`;
            
            // Se a OS já estiver paga (Pix/Dinheiro), atualizar o valor no caixa diário
            if (os.pago && os.formaPagamento !== 'faturamento') {
                const mov = db.caixa_movimentos.find(m => m.osId === os.id && m.tipo === 'entrada');
                if (mov) {
                    mov.valor = os.valor;
                    dbSave('caixa_movimentos', { valor: mov.valor }, 'update', mov.id).catch(e => console.error("Erro ao atualizar movimento de caixa:", e));
                }
            }
        }
    }

    cautelar.hashLaudo = hashLaudo;
    cautelar.parecerFinal = parecerFinal;
    cautelar.status = "concluida";
    cautelar.finalizadoEm = new Date().toISOString();
    cautelar.finalizadoPor = currentSession.nome;

    // Atualiza a OS
    os.status = approved ? 'concluida_aprovada' : 'concluida_reprovada';
    os.finalizadoEm = cautelar.finalizadoEm;
    os.finalizadoPor = currentSession.nome;

    // Salva o parecer e observação final nos dados da seção 8
    const secao8 = secoes.find(s => s.numeroSecao === 8);
    if (secao8) {
        secao8.dadosJson = secao8.dadosJson || {};
        secao8.dadosJson.observacaoFinal = obsFinal;
        secao8.dadosJson.parecerFinal = parecerFinal;
        secao8.status = "completa";
    }

    saveDatabase();

    // 2. Sincroniza com o Supabase online
    if (window.useSupabase) {
        Promise.all([
            sbUpdate('cautelares', cautelar.id, {
                status: cautelar.status,
                parecer_final: cautelar.parecerFinal,
                hash_laudo: cautelar.hashLaudo,
                finalizado_em: cautelar.finalizadoEm,
                finalizado_por: cautelar.finalizadoPor
            }),
            sbUpdate('ordens_servico', os.id, {
                status: os.status,
                valor: os.valor,
                observacoes: os.observacoes,
                finalizado_em: os.finalizadoEm,
                finalizado_por: os.finalizadoPor
            }),
            sbUpdate('cautelares_secoes', secao8.id, {
                dados_json: secao8.dadosJson,
                status: 'completa'
            })
        ]).catch(e => console.warn("Supabase final sync warning:", e));
    }

    logAudit("Finalizar Cautelar", `Finalizou laudo cautelar da placa ${os.placa} com parecer ${parecerFinal.toUpperCase()} e gerou PDF.`);

    // 3. Renderiza a visualização final e exporta para PDF usando pdf-lib AcroForm
    atualizarPreviewLaudo();
    showToast("Gerando PDF com template oficial...", "info");

    generateInspectionReport(cautelar.id)
        .then(async (pdfBytes) => {
            const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            const pdfUrl = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = `LAUDO_CAUTELAR_${os.placa}_${cautelar.dossieNumero}.pdf`;
            link.click();
            
            if (window.useSupabase) {
                const storagePath = `laudos/${cautelar.id}/LAUDO_CAUTELAR_${os.placa}_${cautelar.dossieNumero}.pdf`;
                supabaseClient.storage.from('cautelares').upload(storagePath, pdfBlob, {
                    contentType: 'application/pdf',
                    upsert: true
                }).then(({ data, error }) => {
                    if (!error) {
                        const { data: publicUrlData } = supabaseClient.storage.from('cautelares').getPublicUrl(storagePath);
                        sbUpdate('cautelares', cautelar.id, { pdf_url: publicUrlData.publicUrl });
                        cautelar.pdfUrl = publicUrlData.publicUrl;
                        saveDatabase();
                    }
                }).catch(e => console.warn("Supabase PDF upload error:", e));
            }

            showToast("Laudo PDF exportado com sucesso!", "success");
            fecharFinalizacaoDesktop();
        })
        .catch(err => {
            console.error("Erro na geração do PDF via pdf-lib, usando fallback:", err);
            // Fallback usando html2pdf.js
            const element = document.getElementById('laudo-preview-container');
            const opt = {
                margin: 0,
                filename: `LAUDO_CAUTELAR_${os.placa}_${cautelar.dossieNumero}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            html2pdf().from(element).set(opt).save()
                .then(() => {
                    showToast("Laudo PDF exportado via visualizador!", "success");
                    fecharFinalizacaoDesktop();
                })
                .catch(e => {
                    console.error("Erro no fallback do PDF:", e);
                    showToast("Erro ao exportar PDF.", "error");
                    fecharFinalizacaoDesktop();
                });
        });
}

/**
 * Abre a visualização resumida (modo leitura) da Cautelar.
 */
function verResumoCautelar(cautelarId) {
    if (!db) return;
    const cautelar = db.cautelares.find(c => c.id === cautelarId);
    if (!cautelar) return;

    window.activeFinalizacaoCautelarId = cautelarId;
    window.operatorSignatureConfirmed = true; // Permite visualização sem pedir assinatura

    // Ocultar listagem e exibir finalização
    document.getElementById('cautelar-listagem-view').style.display = 'none';
    document.getElementById('cautelar-finalizacao-view').style.display = 'grid';

    // Desativa campos para modo leitura
    const parecerSelect = document.getElementById('caut-final-parecer');
    if (parecerSelect) {
        parecerSelect.value = cautelar.parecerFinal || 'conforme';
        parecerSelect.disabled = true;
    }
    
    const secao8 = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === 8);
    const obsTextarea = document.getElementById('caut-final-obs');
    if (obsTextarea) {
        obsTextarea.value = secao8 && secao8.dadosJson ? secao8.dadosJson.observacaoFinal || '' : '';
        obsTextarea.disabled = true;
    }
    
    // Oculta área de assinaturas do operador no modo leitura
    const canvasCard = document.getElementById('operator-signature-canvas')?.closest('.panel-card');
    if (canvasCard) canvasCard.style.display = 'none';

    setTimeout(() => {
        atualizarPreviewLaudo();
    }, 100);
}

/**
 * Abre ou baixa o laudo PDF finalizado da Cautelar.
 */
function exibirPdfCautelar(cautelarId) {
    verResumoCautelar(cautelarId);
    
    showToast("Gerando cópia do Laudo PDF...", "info");
    setTimeout(() => {
        const cautelar = db.cautelares.find(c => c.id === cautelarId);
        const os = db.ordens_servico.find(o => o.id === cautelar.osId);
        
        generateInspectionReport(cautelar.id)
            .then(async (pdfBytes) => {
                const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                const pdfUrl = URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = pdfUrl;
                link.download = `LAUDO_CAUTELAR_${os.placa}_${cautelar.dossieNumero}.pdf`;
                link.click();
                
                showToast("Laudo PDF exportado com sucesso!", "success");
                fecharFinalizacaoDesktop();
            })
            .catch(err => {
                console.error("Erro na geração do PDF via pdf-lib, usando fallback:", err);
                const element = document.getElementById('laudo-preview-container');
                const opt = {
                    margin: 0,
                    filename: `LAUDO_CAUTELAR_${os.placa}_${cautelar.dossieNumero}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                html2pdf().from(element).set(opt).save()
                    .then(() => {
                        fecharFinalizacaoDesktop();
                    })
                    .catch(e => {
                        console.error("Erro no fallback do PDF:", e);
                        fecharFinalizacaoDesktop();
                    });
            });
    }, 1000);
}

// Config: Notificações WhatsApp
async function renderConfigWhatsApp() {
    if (typeof supabaseClient === 'undefined' || supabaseClient === null) return;

    try {
        const { data, error } = await supabaseClient.from('configuracoes').select('*').limit(1).single();
        if (error && error.code !== 'PGRST116') {
            console.error("Erro ao carregar configuracoes:", error);
            return;
        }

        if (data) {
            document.getElementById('zap-responsavel').value = data.zap_responsavel || '';
            document.getElementById('zap-dias-aviso').value = data.zap_dias_aviso || 3;
            document.getElementById('zap-template').value = data.zap_template || 'Atenção: A conta {descricao} no valor de R$ {valor} vence no dia {vencimento}';
            
            if (data.zap_responsavel && typeof maskCelular === 'function') {
                document.getElementById('zap-responsavel').value = maskCelular(data.zap_responsavel);
            }
        }
    } catch (err) {
        console.error("Erro ao buscar configuracoes do Whatsapp:", err);
    }
}

async function submitConfigWhatsApp(event) {
    event.preventDefault();
    if (typeof supabaseClient === 'undefined' || supabaseClient === null) {
        showToast("Supabase não configurado.", "error");
        return;
    }

    const btnSubmit = event.target.querySelector('button[type="submit"]');
    if (btnSubmit) btnSubmit.disabled = true;

    const responsavel = document.getElementById('zap-responsavel').value.trim();
    const dias = parseInt(document.getElementById('zap-dias-aviso').value, 10);
    const template = document.getElementById('zap-template').value.trim();

    try {
        const { data: existing } = await supabaseClient.from('configuracoes').select('id').limit(1).single();
        
        let errorObj;
        if (existing) {
            const { error } = await supabaseClient.from('configuracoes').update({
                zap_responsavel: responsavel,
                zap_dias_aviso: dias,
                zap_template: template
            }).eq('id', existing.id);
            errorObj = error;
        } else {
            const { error } = await supabaseClient.from('configuracoes').insert([{
                zap_responsavel: responsavel,
                zap_dias_aviso: dias,
                zap_template: template
            }]);
            errorObj = error;
        }

        if (errorObj) {
            console.error("Erro ao salvar config zap:", errorObj);
            showToast("Erro ao salvar as configurações do WhatsApp.", "error");
        } else {
            showToast("Configurações salvas com sucesso!", "success");
            logAudit("Configuração WhatsApp", "Atualizou configurações de notificação.");
        }

    } catch (err) {
        console.error("Erro ao salvar config zap:", err);
        showToast("Erro ao salvar configurações.", "error");
    } finally {
        if (btnSubmit) btnSubmit.disabled = false;
    }
}

async function generateAndUploadInvoicePDF(f) {
    if (!window.useSupabase) return null;

    const partner = db.parceiros.find(p => p.id === f.parceiroId);
    const unit = db.unidades.find(u => u.id === f.unidadeId);
    const oss = db.ordens_servico.filter(o => f.ordensIds.includes(o.id));

    let osRows = oss.map(o => `
        <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
            <td style="padding: 6px;"><strong>${o.numero}</strong></td>
            <td style="padding: 6px;">${formatDateBr(o.criadoEm)}</td>
            <td style="padding: 6px;"><strong>${o.placa}</strong></td>
            <td style="padding: 6px;">${removeDividedPaymentTag(o.observacoes) || '—'}</td>
            <td style="padding: 6px;">${o.servicoNome.split(' — ')[0]}</td>
            <td style="padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(o.valor)}</td>
        </tr>
    `).join('');

    if (!osRows) {
        osRows = `<tr><td colspan="6" style="text-align: center; padding: 12px; color: #666;">Nenhuma OS vinculada a esta fatura.</td></tr>`;
    }

    const div = document.createElement('div');
    div.style.padding = '40px';
    div.style.fontFamily = 'Outfit, sans-serif';
    div.style.color = '#000';
    div.style.width = '800px';
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px;">
            <div>
                <h1 style="font-size: 24px; font-weight: 800; margin: 0;">CERTIVE VISTORIAS</h1>
                <p style="font-size: 11px; text-transform: uppercase; margin: 4px 0 0 0;">Faturamento de Parceiros — Demonstrativo de Cobrança</p>
            </div>
            <div style="border: 2px solid #000; padding: 8px 16px; font-weight: 800; font-size: 16px;">
                FATURA ${f.codigo}
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 13px; line-height: 1.6; margin-bottom: 30px;">
            <div>
                <strong>Prestador:</strong> ${unit.nome}<br>
                <strong>Endereço:</strong> ${unit.endereco}<br>
                <strong>Período de Referência:</strong> ${formatDateBr(f.periodoInicio)} a ${formatDateBr(f.periodoFim)}
            </div>
            <div style="text-align: right;">
                <strong>Tomador (Parceiro):</strong> ${partner.nome}<br>
                <strong>CPF/CNPJ:</strong> ${partner.cnpj}<br>
                <strong>Contato:</strong> ${partner.telefone}
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
            <div>
                <strong>Data de Emissão:</strong> ${formatDateBr(f.criadoEm)} por ${f.criadoPor}<br>
                <strong>Status de Pagamento:</strong> AGUARDANDO PAGAMENTO
            </div>
            <div style="text-align: right; font-size: 16px; font-weight: 800;">
                VALOR TOTAL: ${formatCurrency(f.valorTotal)}
            </div>
        </div>

        <div style="border: 1px solid #000; border-radius: 4px; overflow: hidden; margin-bottom: 40px;">
            <div style="font-weight: 800; font-size: 12px; background: #eee; padding: 10px 14px; border-bottom: 1px solid #000;">
                DEMONSTRATIVO DE SERVIÇOS PRESTADOS
            </div>
            <div style="padding: 10px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; font-size: 10px; text-transform: uppercase;">
                            <th style="padding: 6px;">OS</th>
                            <th style="padding: 6px;">Data</th>
                            <th style="padding: 6px;">Placa</th>
                            <th style="padding: 6px;">Veículo / OBS</th>
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
    `;

    try {
        const pdfBlob = await html2pdf().from(div).set({
            margin: 0,
            filename: `Demonstrativo_${f.codigo}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).outputPdf('blob');

        const fileName = `${f.codigo}_${Date.now()}.pdf`;
        const { data, error } = await supabaseClient.storage.from('faturas').upload(fileName, pdfBlob, {
            contentType: 'application/pdf',
            upsert: true
        });

        if (error) throw error;

        const { data: urlData } = supabaseClient.storage.from('faturas').getPublicUrl(fileName);
        return urlData.publicUrl;
    } catch (e) {
        console.error("Erro ao gerar/upar PDF:", e);
        return null;
    }
}

// ==========================================
// INTEGRITY AUDIT & SELF-HEALING (MÓDULO DE AUDITORIA CONTÁBIL)
// ==========================================
function auditDatabaseIntegrity() {
    const inconsistencies = [];

    if (!db.caixa_movimentos || !db.ordens_servico || !db.faturas) return [];

    // 1. Encontrar Movimentações de Caixa Órfãs
    db.caixa_movimentos.forEach(m => {
        if (m.osId) {
            const osExists = db.ordens_servico.some(o => o.id === m.osId);
            if (!osExists) {
                inconsistencies.push({
                    tipo: 'movimento_orfan',
                    id: m.id,
                    descricao: `Movimento de Caixa ID #${m.id} (${m.descricao || ''}) no valor de R$ ${m.valor.toFixed(2)} órfão (OS ID ${m.osId} deletada).`,
                    record: m
                });
            }
        }
    });

    // 2. Encontrar Faturas Vazias ou Inválidas
    db.faturas.forEach(f => {
        const ordensIds = f.ordensIds || [];
        const validOSCount = ordensIds.filter(id => db.ordens_servico.some(o => o.id === id)).length;
        if (validOSCount === 0 || f.valorTotal <= 0) {
            inconsistencies.push({
                tipo: 'fatura_invalida',
                id: f.id,
                descricao: `Fatura ID #${f.id} (${f.codigo}) com valor de R$ ${f.valorTotal.toFixed(2)} inválida (sem OS vinculadas válidas).`,
                record: f
            });
        }
    });

    return inconsistencies;
}

function runIntegrityAudit() {
    const statusContainer = document.getElementById('auditoria-status-container');
    const listContainer = document.getElementById('auditoria-inconsistencias-list');
    const actionContainer = document.getElementById('auditoria-acoes');

    if (!statusContainer || !listContainer || !actionContainer) return;

    const list = auditDatabaseIntegrity();

    if (list.length === 0) {
        statusContainer.innerHTML = `
            <i class="ri-checkbox-circle-fill" style="color: var(--success); font-size: 24px;"></i>
            <div>
                <h4 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0;">Sistema 100% Íntegro</h4>
                <p style="font-size: 11px; color: var(--text-secondary); margin: 2px 0 0 0;">Nenhuma inconsistência contábil ou de rede foi localizada.</p>
            </div>
        `;
        statusContainer.style.borderColor = 'var(--success)';
        statusContainer.style.background = 'rgba(16, 185, 129, 0.05)';
        listContainer.style.display = 'none';
        actionContainer.style.display = 'none';
    } else {
        statusContainer.innerHTML = `
            <i class="ri-alert-fill" style="color: var(--warning); font-size: 24px;"></i>
            <div>
                <h4 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0;">Inconsistências Localizadas</h4>
                <p style="font-size: 11px; color: var(--text-secondary); margin: 2px 0 0 0;">Foram encontradas <strong>${list.length} inconsistências</strong> contábeis em registros remotos.</p>
            </div>
        `;
        statusContainer.style.borderColor = 'var(--warning)';
        statusContainer.style.background = 'rgba(245, 158, 11, 0.05)';

        listContainer.innerHTML = list.map(item => `
            <div style="padding: 12px 16px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--bg-secondary); display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-family: 'JetBrains Mono', monospace;">
                <div style="display: flex; align-items: center; gap: 8px; color: var(--text-primary);">
                    <i class="ri-error-warning-line" style="color: var(--warning); font-size: 16px;"></i>
                    <span>${item.descricao}</span>
                </div>
                <span style="font-size: 9px; font-weight: 700; color: var(--warning); border: 1px solid var(--warning); padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap;">
                    ${item.tipo === 'movimento_orfan' ? 'ÓRFÃO' : 'INVÁLIDO'}
                </span>
            </div>
        `).join('');
        listContainer.style.display = 'flex';
        actionContainer.style.display = 'flex';
    }
}

async function resolveAuditoriaInconsistencies() {
    if (!isMasterSession()) {
        showToast("Erro: Apenas operadores Master podem corrigir inconsistências do banco.", "error");
        return;
    }

    const list = auditDatabaseIntegrity();
    if (list.length === 0) {
        showToast("Nenhuma inconsistência pendente.", "info");
        return;
    }

    if (!confirm(`Deseja corrigir automaticamente as ${list.length} inconsistência(s) localizadas? Isso fará a deleção física e permanente dos registros órfãos no banco Supabase.`)) {
        return;
    }

    const btn = document.getElementById('btn-resolver-auditoria');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ri-loader-4-line spinning"></i> Processando correções...`;

    try {
        let correctedCount = 0;
        for (const item of list) {
            if (item.tipo === 'movimento_orfan') {
                if (window.useSupabase) {
                    await fetch(`${SUPABASE_URL}/rest/v1/caixa_movimentos?id=eq.${item.id}`, {
                        method: 'DELETE',
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                        }
                    });
                }
                db.caixa_movimentos = db.caixa_movimentos.filter(m => m.id !== item.id);
                correctedCount++;
            } else if (item.tipo === 'fatura_invalida') {
                if (window.useSupabase) {
                    await fetch(`${SUPABASE_URL}/rest/v1/faturas?id=eq.${item.id}`, {
                        method: 'DELETE',
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                        }
                    });
                }
                db.faturas = db.faturas.filter(f => f.id !== item.id);
                correctedCount++;
            }
        }

        showToast(`${correctedCount} inconsistência(s) contábeis foram corrigidas com sucesso!`, "success");
        
        // Atualizar visualizações
        if (document.getElementById('caixa-mov-tbody')) {
            renderCaixaPage();
        }
        if (typeof renderFatFaturas === 'function') {
            renderFatFaturas();
        }
        runIntegrityAudit();

        if (typeof saveDatabase === 'function') saveDatabase();
    } catch (err) {
        console.error("Erro ao resolver inconsistências:", err);
        showToast("Erro durante a resolução de inconsistências.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function sendInvoiceWhatsApp(faturaId, btn) {
    if (!window.useSupabase) {
        showToast("Erro: A integração com WhatsApp só está disponível no modo online (Supabase).", "error");
        return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spinning" style="font-size:14px;"></i>';

    try {
        const fatura = db.faturas.find(x => x.id === faturaId);
        if (!fatura) return;

        showToast("Enviando fatura pelo WhatsApp...", "info");

        const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-asaas-billing`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ faturaId: faturaId })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.zapStatus === 'enviado') {
                fatura.notificacao_zap = true;
                if (typeof saveDatabase === 'function') saveDatabase();
                showToast("Mensagem de WhatsApp enviada com sucesso!", "success");
                btn.style.color = "var(--success)";
                btn.title = "Reenviar Fatura por WhatsApp";
            } else {
                showToast("Erro: A API de WhatsApp não pôde concluir o disparo. Verifique o status no painel.", "warning");
            }
        } else {
            let errText = "Erro desconhecido";
            try {
                const data = await res.json();
                errText = data.error || errText;
            } catch(e) {}
            showToast("Erro ao enviar WhatsApp: " + errText, "error");
        }
    } catch (err) {
        console.error("Erro no reenvio de WhatsApp:", err);
        showToast("Erro de rede ao conectar à API de WhatsApp.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        if (typeof renderFatFaturas === 'function') {
            renderFatFaturas();
        }
    }
}

// Sincronizador Automático de Taxas Flutuantes do DETRAN
window.syncDetranFloatingPayable = async function() {
    if (typeof activeUnitId === 'undefined' || !activeUnitId) return;
    if (!db || !db.ordens_servico || !db.contas_pagar) return;

    // Função interna para obter o 5º dia útil do mês subsequente (desconsiderando finais de semana)
    function getFifthWorkingDay(year, month) {
        // month é 0-indexed: 0 = Jan, 1 = Fev, etc.
        let date = new Date(year, month, 1);
        let workingDaysCount = 0;
        while (workingDaysCount < 5) {
            const dayOfWeek = date.getDay(); // 0 = Domingo, 6 = Sábado
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workingDaysCount++;
            }
            if (workingDaysCount < 5) {
                date.setDate(date.getDate() + 1);
            }
        }
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    try {
        // 1. Obter mês e ano de faturamento correntes
        let now = new Date();
        if (window.modoDiaReaberto && window.dataDiaReaberto) {
            now = new Date(window.dataDiaReaberto);
        }
        const year = now.getFullYear().toString();
        const monthNum = String(now.getMonth() + 1).padStart(2, '0');
        
        const meses = {
            '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
            '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
            '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
        };
        const monthLabel = meses[monthNum];
        const targetDesc = `Taxas DETRAN-SC — Provisão ${monthLabel}/${year}`;

        // 2. Calcular valor flutuante total baseado no número de vistorias com detranRegistrado === true no mês corrente
        let totalTaxas = 0;
        const monthlyOSs = db.ordens_servico.filter(o => 
            o.unidadeId === activeUnitId && 
            o.detranRegistrado === true &&
            o.status && o.status.startsWith('concluida') && 
            o.criadoEm && o.criadoEm.startsWith(`${year}-${monthNum}`)
        );

        monthlyOSs.forEach(o => {
            const ref = db.taxas_referencia.find(t => t.servicoId === o.servicoId);
            const rate = ref ? (parseFloat(ref.taxa) || 0) : 27.00;
            totalTaxas += rate;
        });

        // 3. Buscar se já existe uma provisão para este mês/ano e unidade
        const existingPayable = db.contas_pagar.find(c => 
            c.unidadeId === activeUnitId && 
            c.descricao === targetDesc
        );

        // O vencimento é o 5º dia útil do mês seguinte
        let nextMonth = now.getMonth() + 1;
        let nextYear = now.getFullYear();
        if (nextMonth > 11) {
            nextMonth = 0;
            nextYear++;
        }
        const dueDate = getFifthWorkingDay(nextYear, nextMonth);

        if (existingPayable) {
            // Se existir e não estiver paga, atualiza se o valor mudou
            if (!existingPayable.pago) {
                if (existingPayable.valor !== totalTaxas) {
                    console.log(`[DETRAN Sincronizador] Atualizando valor da conta de provisão para: ${totalTaxas}`);
                    existingPayable.valor = totalTaxas;
                    
                    if (window.useSupabase) {
                        await supabaseClient.from('contas_pagar')
                            .update({ valor: totalTaxas })
                            .eq('id', existingPayable.id)
                            .catch(err => console.error('[DETRAN Sincronizador] Erro Supabase:', err));
                    }
                    cacheUpdate('contas_pagar', existingPayable.id, { valor: totalTaxas });
                }
            }
        } else {
            // Se não existir e o valor acumulado for maior que zero, cria a provisão
            if (totalTaxas > 0) {
                console.log(`[DETRAN Sincronizador] Criando nova conta de provisão no valor de: ${totalTaxas}`);
                const newPayable = {
                    unidadeId: activeUnitId,
                    descricao: targetDesc,
                    tipo: "variavel",
                    vencimento: dueDate,
                    valor: totalTaxas,
                    pago: false,
                    pagoEm: null,
                    categoria: "Impostos / Taxas",
                    fornecedor: "DETRAN-SC",
                    comprovante: null,
                    criadoPor: "Sistema (Automático)"
                };

                if (window.useSupabase) {
                    const { data, error } = await supabaseClient.from('contas_pagar')
                        .insert(newPayable)
                        .select()
                        .single();
                    if (!error && data) {
                        const normalized = normalizeRecord('contas_pagar', data);
                        cacheInsert('contas_pagar', normalized);
                    } else {
                        console.error('[DETRAN Sincronizador] Erro de inserção Supabase:', error);
                    }
                } else {
                    const arr = db.contas_pagar || [];
                    newPayable.id = arr.length > 0 ? Math.max(...arr.map(r => r.id || 0)) + 1 : 1;
                    cacheInsert('contas_pagar', newPayable);
                    if (typeof saveDatabase === 'function') saveDatabase();
                }
            }
        }
    } catch (e) {
        console.error("[DETRAN Sincronizador] Falha crítica na execução:", e);
    }
};




