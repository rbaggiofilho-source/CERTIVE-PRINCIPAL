// Escape de texto digitado por usuários antes de montar HTML (evita XSS:
// um nome de cliente com <script> ou <img onerror> não pode virar código na tela).
function escHtml(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c]);
}
window.escHtml = escHtml;

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

// Os dados vêm SEMPRE do banco (loadAllFromSupabase). Nada de dados de clientes,
// caixa ou financeiro fica gravado no navegador: num computador compartilhado de
// balcão, o próximo usuário não pode ver o que o anterior acessou. As fotos da
// vistoria ainda não enviadas ficam no IndexedDB (CautelarOfflineDB) até subirem.
function saveDatabase() { /* sem cópia local do banco */ }

// Remove cópias locais deixadas por versões antigas (banco inteiro, dados de demonstração)
function limparDadosLocaisAntigos() {
    ['certive_db', 'certive_db_seeded', 'certive_simulado_reprovado', 'certive_reopened_v3'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) { /* modo privado */ }
    });
}
limparDadosLocaisAntigos();

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

// Divisão do pagamento de uma OS: a coluna pagamentoDividido é a fonte; a
// marca [PAG_DIVIDIDO: ...] nas observações fica só para as OS antigas (se
// alguém editasse as observações, a divisão se perdia).
function divisaoPagamento(os) {
    if (!os) return null;
    const col = os.pagamentoDividido;
    if (Array.isArray(col) && col.length === 2) return col.map(p => ({ forma: p.forma, valor: Number(p.valor) }));
    return parseDividedPayment(os.observacoes);
}

function removeDividedPaymentTag(obsText) {
    if (!obsText) return '';
    return obsText.replace(/\[PAG_DIVIDIDO: [^\]]+\]/, '').trim();
}

function formatCurrency(val) {
    const n = Number(val);
    return (isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---- Dinheiro em centavos ----
// Somar reais em ponto flutuante acumula erro (0,1 + 0,2 = 0,30000000000000004)
// e o total do caixa "não fecha" por um centavo. Toda soma de valores passa por
// aqui: a conta é feita em centavos inteiros.
function paraCentavos(valor) {
    const n = Number(valor);
    return isFinite(n) ? Math.round(n * 100) : 0;
}
function somaCentavos(a, b) {
    return (paraCentavos(a) + paraCentavos(b)) / 100;
}
// Lê um valor digitado ("1.234,56", "1234.56", "R$ 150"). Devolve null quando
// não é um valor válido, para quem chama recusar em vez de gravar R$ 0.
function lerValorMonetario(texto) {
    let t = String(texto == null ? '' : texto).trim().replace(/[R$\s]/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return paraCentavos(t) / 100;
}

// ---- Datas: sempre no horário de Brasília ----
// O banco guarda instantes em UTC. Cortar a string ISO ("2026-09-28T23:10Z")
// ou usar toISOString() para saber "o dia" joga o que acontece depois das 21h
// para o dia seguinte. Toda conversão instante -> dia passa por aqui.
const FUSO_CERTIVE = 'America/Sao_Paulo';
const _fmtDiaSP = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_CERTIVE, year: 'numeric', month: '2-digit', day: '2-digit' });
const _fmtHoraSP = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO_CERTIVE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const RE_SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' do dia em Brasília. Uma data pura ('2026-09-01') volta como está:
// new Date('2026-09-01') é meia-noite UTC, que em Brasília ainda é dia 31.
function diaSP(entrada = new Date()) {
    if (typeof entrada === 'string' && RE_SO_DATA.test(entrada)) return entrada;
    const d = entrada instanceof Date ? entrada : new Date(entrada);
    if (isNaN(d.getTime())) return '';
    return _fmtDiaSP.format(d);
}

function horaSP(entrada = new Date()) {
    const d = entrada instanceof Date ? entrada : new Date(entrada);
    return _fmtHoraSP.format(d);
}

// Instante (ISO UTC) no dia dataStr com o horário atual de Brasília.
// Brasília não tem horário de verão desde 2019: UTC-3 fixo.
function instanteNoDiaSP(dataStr, agora = new Date()) {
    if (!dataStr || !RE_SO_DATA.test(dataStr)) return agora.toISOString();
    return new Date(`${dataStr}T${horaSP(agora)}-03:00`).toISOString();
}

// Soma dias a uma data 'YYYY-MM-DD' sem passar por fuso.
function somarDiasData(dataStr, dias) {
    const [a, m, d] = dataStr.split('-').map(Number);
    const t = new Date(Date.UTC(a, m - 1, d + dias));
    return t.toISOString().slice(0, 10);
}

function formatDateBr(isoString) {
    if (!isoString) return "—";
    // Se for formato de data simples YYYY-MM-DD (do tipo DATE no PostgreSQL)
    if (typeof isoString === 'string' && isoString.length === 10 && isoString.includes('-') && !isoString.includes('T')) {
        const parts = isoString.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const dia = diaSP(isoString);
    if (!dia) return "—";
    const [year, month, day] = dia.split('-');
    return `${day}/${month}/${year}`;
}

function formatDateTimeBr(isoString) {
    if (!isoString) return "—";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "—";
    const [year, month, day] = diaSP(date).split('-');
    return `${day}/${month}/${year} ${horaSP(date).slice(0, 5)}`;
}

function renderMarkdown(text) {
    // O texto do contrato leva dados digitados (nome, endereço...): o HTML gerado
    // passa pelo DOMPurify. Sem ele, usa o conversor simples abaixo, que escapa tudo.
    if (window.DOMPurify && window.marked && (typeof window.marked.parse === 'function' || typeof window.marked === 'function')) {
        const html = typeof window.marked.parse === 'function' ? window.marked.parse(text || '') : window.marked(text || '');
        return window.DOMPurify.sanitize(html);
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

// Gravação feita em segundo plano que falhou: avisa quem está usando, em vez
// de deixar só no console enquanto a tela mostra a alteração como feita.
function avisarFalhaGravacao(contexto) {
    return (erro) => {
        console.error(`${contexto} não gravada:`, erro);
        showToast(`${contexto} NÃO foi gravada no servidor${erro && erro.message ? ` (${erro.message})` : ''}. Verifique a conexão e refaça.`, "error");
    };
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
        atualizarBadgeVersao();

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

async function handleLogin(event) {
    event.preventDefault();

    // Trava contra envio duplo. O login é assíncrono (autentica e depois carrega
    // toda a base), e dois Enter seguidos disparavam duas cargas simultâneas —
    // por isso os dois "Bem-vindo" empilhados. Duas cargas concorrentes também
    // dobram o volume baixado e ajudam a estourar o tempo limite do servidor.
    if (window.__logando) return;
    const btnLogin = event.target && event.target.querySelector
        ? event.target.querySelector('button[type="submit"]') : null;
    window.__logando = true;
    if (btnLogin) { btnLogin.disabled = true; btnLogin.style.opacity = '0.6'; }
    try {

    const loginInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value.trim();
    const errorDiv = document.getElementById('login-error');

    const mostrarErro = (msg) => {
        errorDiv.style.display = 'flex';
        document.getElementById('login-error-text').textContent =
            msg || "Usuário ou senha inválidos, ou operador inativo.";
    };

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        showToast("Conectando ao sistema... Aguarde um instante e tente novamente.", "info");
        return;
    }

    // E-mail interno do sistema — o funcionário nunca vê isto; digita só o usuário.
    const email = `${loginInput.toLowerCase()}@sistema.certive.com.br`;

    try {
        // 1) Valida usuário + senha no servidor (Supabase Auth). A senha nunca
        //    é comparada aqui no navegador; quem confere é o servidor.
        const { data: authData, error: authError } =
            await supabaseClient.auth.signInWithPassword({ email, password: passwordInput });

        if (authError || !authData || !authData.user) {
            mostrarErro();
            return;
        }

        // Deixa o token do usuário disponível de imediato para os acessos diretos.
        if (authData.session) { sbAccessToken = authData.session.access_token; }

        // 2) Carrega o perfil (função, permissões, unidade) do operador logado.
        const { data: perfil, error: perfilError } = await supabaseClient
            .from('operadores')
            .select('id, nome, login, funcao, unidadeId, permissoes, ativo')
            .eq('user_id', authData.user.id)
            .single();

        if (perfilError || !perfil || perfil.ativo !== true) {
            await supabaseClient.auth.signOut();
            mostrarErro("Operador inativo ou sem perfil configurado. Procure o administrador.");
            return;
        }

        sessionStorage.setItem('certive_session', JSON.stringify(perfil));
        errorDiv.style.display = 'none';

        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';

        // Recarrega os dados já autenticado — com o RLS, os dados só vêm após o login.
        if (typeof loadAllFromSupabase === 'function') {
            try { await loadAllFromSupabase(); } catch (e) { console.warn('Falha ao recarregar dados após login:', e); }
        }

        showToast(`Bem-vindo, ${perfil.nome}!`, 'success');
        atualizarBadgeVersao();
        logAudit("Login", `Efetuou login no terminal.`);
        checkSession();
    } catch (e) {
        console.error("Erro no login:", e);
        mostrarErro("Não foi possível conectar. Verifique a internet e tente novamente.");
    }

    } finally {
        // Libera sempre: se o login falhar, o operador precisa tentar de novo.
        window.__logando = false;
        if (btnLogin) { btnLogin.disabled = false; btnLogin.style.opacity = ''; }
    }
}

// Encerra a sessão após um período sem uso (computador de balcão compartilhado)
const LOGOUT_INATIVIDADE_MIN = 45;
(function vigiarInatividade() {
    let ultimoUso = Date.now();
    const marcar = () => { ultimoUso = Date.now(); };
    ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach(ev => document.addEventListener(ev, marcar, { passive: true, capture: true }));
    setInterval(() => {
        if (!currentSession) return;
        // Não derruba no meio da captura de fotos (vistoria em andamento)
        if (document.getElementById('cautelar-camera-overlay')) return;
        if (Date.now() - ultimoUso > LOGOUT_INATIVIDADE_MIN * 60000) {
            ultimoUso = Date.now();
            showToast("Sessão encerrada por inatividade.", "warning");
            handleLogout(true);
        }
    }, 60000);
})();

async function handleLogout(porInatividade = false) {
    // Alterações ainda não enviadas ao servidor se perderiam ao sair
    let pendentes = 0;
    try { pendentes = (typeof getSyncQueue === 'function' ? getSyncQueue() : []).length; } catch (e) { /* ignora */ }
    if (pendentes > 0 && !porInatividade && !confirm(`Há ${pendentes} alteração(ões) ainda não enviadas ao servidor. Se sair agora, elas podem se perder. Sair mesmo assim?`)) return;
    logAudit("Logout", porInatividade ? `Sessão encerrada por inatividade.` : `Efetuou logout do sistema.`);
    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            await supabaseClient.auth.signOut();
        }
    } catch (e) {
        console.warn("Erro ao encerrar sessão no servidor:", e);
    }
    // Nada do usuário anterior fica no navegador
    try {
        sessionStorage.clear();
        ['certive_modoDiaReaberto', 'certive_dataDiaReaberto', 'certive_caixaReabertoId'].forEach(k => localStorage.removeItem(k));
    } catch (e) { /* modo privado */ }
    window.modoDiaReaberto = false;
    window.dataDiaReaberto = null;
    window.caixaReabertoId = null;
    currentSession = null;
    // Descarta da memória os dados carregados (recarrega a página limpa)
    location.reload();
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
    select.innerHTML = db.unidades.map(u => `<option value="${u.id}">${escHtml(u.nome)}</option>`).join('');
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
// ==========================================================
// ATUALIZAÇÕES DO SISTEMA
// ----------------------------------------------------------
// Registro das versões. Cada entrada é escrita PARA O OPERADOR: o que mudou
// na tela dele e o que ele precisa fazer diferente — não o que mudou no código.
//
// Ao publicar uma versão nova: incremente APP_VERSION e adicione a entrada no
// TOPO do array. A data é a de publicação.
// ==========================================================

const APP_VERSION = '9.6.3';

const ATUALIZACOES = [
    {
        versao: '9.6.3',
        data: '2026-09-29',
        titulo: 'Busca por nome no Histórico Geral não trava mais',
        resumo: 'Ao pesquisar por nome (ou parte do nome) no Histórico Geral, o sistema mostrava o erro "Cannot read properties of null" e não retornava nada. Acontecia porque alguma OS tinha o CPF/CNPJ (ou o nome) do cliente em branco, e a busca quebrava naquele registro. Corrigido: registros com esses campos vazios são simplesmente ignorados na comparação e a busca funciona normalmente.',
        mudancas: [
            {
                area: 'Histórico Geral',
                titulo: 'Pesquisa por nome/placa/documento à prova de campos vazios',
                oQueMudou: 'A busca passou a tratar OS sem nome, sem CPF/CNPJ ou sem placa sem gerar erro. Antes, um único registro com esses campos em branco derrubava a pesquisa inteira.',
                comoUsar: 'Pesquise por nome normalmente na aba Histórico Geral. Se você viu o erro antes, recarregue a página (Ctrl+F5) após esta atualização.'
            }
        ]
    },
    {
        versao: '9.6.2',
        data: '2026-09-28',
        titulo: 'O relatório do DETRAN nunca mais é descartado no fechamento',
        resumo: 'Quando o relatório do DETRAN vinha assinado digitalmente, o sistema não conseguia juntar os PDFs e acabava guardando só o comprovante do caixa — perdendo justamente o relatório do DETRAN. Corrigido: agora os PDFs assinados são lidos e mesclados normalmente e, no caso raro de a junção ainda falhar, o sistema guarda o relatório do DETRAN (o documento insubstituível) em vez do comprovante do caixa, que pode ser refeito a qualquer momento.',
        mudancas: [
            {
                area: 'Fechamento de caixa',
                titulo: 'Relatório do DETRAN preservado mesmo assinado digitalmente',
                oQueMudou: 'A leitura do PDF do DETRAN passou a aceitar arquivos assinados/protegidos, então a mesclagem com o comprovante do caixa funciona e os dois documentos ficam salvos juntos. Se por algum motivo a mesclagem ainda falhar, o sistema guarda o relatório do DETRAN, não mais só o comprovante do caixa.',
                comoUsar: 'Nada muda no uso: anexe o relatório do DETRAN normalmente ao fechar o caixa. O documento agora fica sempre guardado.'
            }
        ]
    },
    {
        versao: '9.6.1',
        data: '2026-09-27',
        titulo: 'Correção da enxurrada de erros "duplicate key" na sincronização',
        resumo: 'Alguns operadores viam vários erros seguidos ("duplicate key... pendencias_fechamento" e "bigint null") repetindo sem parar. Era a fila de sincronização presa em itens que nunca iam dar certo. Corrigido: esses itens são descartados em vez de repetir, e a auditoria deixou de tentar recriar uma pendência que já existe.',
        mudancas: [
            {
                area: 'Sincronização',
                titulo: 'Itens impossíveis não travam mais a fila',
                oQueMudou: 'Quando uma gravação falhava por um motivo definitivo (o registro já existia, ou o id era inválido), o sistema recolocava o item na fila e tentava de novo, sem parar, enchendo a tela de erros. Agora esses casos são descartados (o dado já estava salvo ou não teria como salvar) e só erros de internet continuam sendo repetidos.',
                comoUsar: 'Se você viu essa enxurrada de erros, feche e abra o sistema depois desta atualização: a fila vai limpar sozinha e os avisos param.'
            },
            {
                area: 'Fechamento de caixa',
                titulo: 'Auditoria não recria pendência que já existe',
                oQueMudou: 'A conferência do DETRAN tentava criar de novo uma pendência cuja divergência já tinha sido registrada antes (mesmo já resolvida), o que gerava o erro "duplicate key". Agora, se a divergência reaparece, a pendência existente é reaberta em vez de duplicada.',
                comoUsar: 'Nada muda no uso.'
            }
        ]
    },
    {
        versao: '9.6.0',
        data: '2026-09-27',
        titulo: 'Conferência do DETRAN agora também confere o valor',
        resumo: 'Além de conferir placa, laudo sem OS e OS sem laudo, o fechamento passa a comparar o VALOR de cada laudo do DETRAN com o valor da OS. Quando o valor diferir, aparece como divergência e vira pendência de auditoria. Combos ficam de fora (a OS cobra o pacote e o DETRAN registra só a transferência), para não dar alarme falso.',
        mudancas: [
            {
                area: 'Fechamento de caixa',
                titulo: 'Conferência de valor laudo × OS',
                oQueMudou: 'A conferência com o DETRAN comparava placa e presença (laudo↔OS), mas não o valor. Agora, quando um laudo do DETRAN casa com uma OS do mesmo dia e o valor é diferente, isso aparece na lista de divergências do fechamento ("VALOR DIFERENTE DO DETRAN") e é gravado como pendência até ser corrigido. Vistorias combo são ignoradas nessa comparação, porque a OS cobra o pacote (cautelar + transferência) e o DETRAN registra só a transferência — a diferença é esperada.',
                comoUsar: 'Nada muda no procedimento. No fechamento, se algum valor não bater com o DETRAN, o sistema avisa junto com as outras divergências, apontando OS, valor no sistema e valor no DETRAN.'
            }
        ]
    },
    {
        versao: '9.5.3',
        data: '2026-09-24',
        titulo: 'Contas a Pagar: some o erro que travava o salvamento da despesa',
        resumo: 'Ao cadastrar uma despesa (ex.: DARF, FGTS), às vezes aparecia "Erro ao salvar no banco... contas_pagar_competencia_plausivel" e a conta só era salva localmente (ficava como pendente de sincronizar). A causa era o ano da competência digitado com poucos dígitos no seletor de mês (ex.: 26 virava o ano 0026). Agora o sistema corrige o ano sozinho antes de salvar.',
        mudancas: [
            {
                area: 'Contas a Pagar',
                titulo: 'A competência com ano digitado errado é corrigida automaticamente',
                oQueMudou: 'No campo "Competência (mês de referência)", o navegador deixa digitar o ano com dois dígitos — e "26" acabava virando o ano 0026, que o sistema recusava por segurança. A despesa então não salvava online e ficava pendente. Agora, ao salvar, o ano de dois dígitos vira 2026 e, se ficar muito longe do vencimento, a competência assume o mês do vencimento. Vale para o cadastro, a edição e a sincronização das despesas que ficaram presas.',
                comoUsar: 'Cadastre a despesa normalmente. Se você tinha despesas "pendentes de sincronizar" por causa desse erro, elas sobem sozinhas na próxima sincronização. Dica: ao preencher a competência, digite o ano com quatro dígitos (2026).'
            }
        ]
    },
    {
        versao: '9.5.2',
        data: '2026-09-18',
        titulo: 'Conferência com o DETRAN volta a funcionar de verdade',
        resumo: 'A conferência automática no fechamento de caixa não estava lendo o relatório do DETRAN — mesmo com o arquivo certo anexado todo dia. O motivo era técnico: no relatório do Portal ECV, cada linha é impressa em duas alturas ligeiramente diferentes, e o leitor quebrava cada laudo em duas partes, sem reconhecer nenhum. Corrigido. Testado com o relatório real de 17/09: leu os 9 laudos e o total de R$ 1.438,53, batendo com o rodapé do próprio DETRAN.',
        mudancas: [
            {
                area: 'Fechamento de caixa',
                titulo: 'O leitor agora entende o relatório do DETRAN',
                oQueMudou: 'O relatório "Laudos realizados no período" do Portal ECV imprime, na mesma linha, a placa um pouquinho mais baixa que o valor. O leitor agrupava o texto pela altura exata e, com isso, separava cada laudo em dois pedaços que não casavam com nada — lia zero laudos e a conferência passava batida, embora o arquivo estivesse correto. Agora o leitor agrupa por proximidade e remonta a linha inteira.',
                comoUsar: 'Nada muda no procedimento: continue anexando o relatório de laudos do Portal ECV no fechamento. A diferença é que agora a conferência realmente roda e aponta placa digitada errada, laudo sem OS e OS sem laudo.'
            }
        ]
    },
    {
        versao: '9.5.1',
        data: '2026-09-17',
        titulo: 'Rede de segurança: aviso se o arquivo anexado for o comprovante do sistema',
        resumo: 'Passo de segurança: se por engano for anexado, no fechamento, o comprovante de caixa que o próprio sistema gera em vez do relatório de laudos do DETRAN, o sistema avisa qual é o arquivo certo.',
        mudancas: [
            {
                area: 'Fechamento de caixa',
                titulo: 'O sistema reconhece o comprovante do próprio sistema',
                oQueMudou: 'Se alguém anexar o comprovante de fechamento gerado pelo sistema (que não é o relatório do DETRAN), aparece o aviso "ARQUIVO ERRADO" indicando o certo. É uma proteção; o relatório correto continua sendo o "Laudos realizados no período" do Portal ECV.',
                comoUsar: 'Se aparecer o aviso "ARQUIVO ERRADO", troque o anexo pelo relatório de laudos exportado do Portal ECV.'
            }
        ]
    },
    {
        versao: '9.5.0',
        data: '2026-09-15',
        titulo: 'Vistorias reprovadas voltam a aparecer no faturamento',
        resumo: 'Vistoria reprovada de parceiro também é cobrança: o laudo foi emitido e o DETRAN já cobrou os R$27. Mesmo assim, elas não apareciam na tela de faturamento — só as aprovadas entravam. Agora aprovada e reprovada aparecem juntas para faturar. Só o retorno (reapresentação) continua isento, como deve ser.',
        mudancas: [
            {
                area: 'Faturamento',
                titulo: 'Vistoria reprovada de parceiro agora entra no faturamento',
                oQueMudou: 'A tela de faturamento só listava as vistorias aprovadas. As reprovadas ficavam de fora e o parceiro nunca era cobrado por elas — mesmo o laudo tendo sido emitido e o DETRAN já tendo cobrado a taxa. Em agosto, 11 vistorias de parceiro (R$ 1.773,00) estavam nessa situação; em julho eram 7 (R$ 883,00) e no início de setembro mais 2 (R$ 316,50).',
                comoUsar: 'Abra Faturamento › Pendentes. As reprovadas agora aparecem na lista junto com as aprovadas, com o valor cheio, prontas para gerar a fatura do parceiro normalmente. O retorno (reapresentação) de uma reprovada continua isento e não aparece — está correto, não se cobra duas vezes.'
            }
        ]
    },
    {
        versao: '9.4.1',
        data: '2026-09-01',
        titulo: 'Correção do erro de conexão e do menu no celular',
        resumo: 'O sistema deixou de baixar 28 MB de anexos a cada login. Era isso que causava o "Erro ao conectar com o banco de dados", principalmente no celular. O menu lateral também voltou a ficar alinhado.',
        mudancas: [
            {
                area: 'Menu',
                titulo: 'Menu lateral alinhado no celular',
                oQueMudou: 'No celular, cada item do menu aparecia numa posição diferente, como se estivesse torto. Uma regra feita para deixar os botões maiores no toque estava sendo aplicada também ao menu, e centralizava cada linha conforme o tamanho do nome.',
                comoUsar: 'Nada muda no uso. Se o menu ainda aparecer torto depois desta atualização, feche e abra o navegador para ele buscar a versão nova do visual.'
            },
            {
                area: 'Todo o sistema',
                titulo: 'O erro de conexão foi corrigido',
                oQueMudou: 'A cada login o sistema baixava todos os anexos, comprovantes e contratos de uma vez — cerca de 28 MB. No celular isso estourava o tempo limite do servidor e aparecia o erro de conexão. Agora esses arquivos só são baixados quando alguém clica para abrir.',
                comoUsar: 'Nada muda no seu jeito de usar. Ao clicar para ver um anexo ou comprovante, ele aparece "Carregando..." por um instante antes de abrir — é normal, está buscando só aquele arquivo.'
            },
            {
                area: 'Todo o sistema',
                titulo: 'Falha de rede tenta de novo sozinha',
                oQueMudou: 'Uma oscilação de internet derrubava o carregamento inteiro. Agora o sistema tenta novamente até três vezes antes de desistir.',
                comoUsar: 'Se aparecer o erro de conexão mesmo assim, é sinal de queda real de internet, não de instabilidade momentânea.'
            },
            {
                area: 'Acesso',
                titulo: 'Login não entra duas vezes',
                oQueMudou: 'Dois toques seguidos no botão de entrar disparavam dois carregamentos ao mesmo tempo, dobrando o volume baixado. Era por isso que às vezes apareciam duas mensagens de boas-vindas.',
                comoUsar: 'O botão trava sozinho enquanto entra. Se o login falhar, ele destrava para você tentar de novo.'
            }
        ]
    },
    {
        versao: '9.3.0',
        data: '2026-08-31',
        titulo: 'Página de faturas reformada',
        resumo: 'O histórico de faturas passa a ter filtro de mês e mostra separadamente quanto foi gerado, quanto já entrou e quanto ainda está em aberto.',
        mudancas: [
            {
                area: 'Faturamento',
                titulo: 'Filtro de mês no histórico de faturas',
                oQueMudou: 'Antes a aba "Faturas Emitidas" listava tudo junto, de todos os meses, e o total somava pagas e em aberto na mesma conta. Agora dá para ver um mês por vez, com três totais separados: gerado, recebido e em aberto.',
                comoUsar: 'Use as setas para trocar de mês, ou marque "Ver todas" para o histórico completo.'
            },
            {
                area: 'Faturamento',
                titulo: 'Não dá mais para faturar a mesma OS duas vezes',
                oQueMudou: 'O botão de gerar fatura trava enquanto a fatura está sendo criada, e o sistema recusa faturar uma OS que já está em outra fatura. Isso aconteceu em 06/08: dois cliques seguidos geraram a FAT-0031 e a FAT-0032, as duas para a mesma OS.',
                comoUsar: 'Nada muda no seu jeito de trabalhar. Se aparecer o aviso de que já existe fatura para a OS, procure a fatura antiga em vez de gerar outra.'
            },
            {
                area: 'Faturamento',
                titulo: 'Filtros de situação, parceiro e busca',
                oQueMudou: 'Além do mês, dá para filtrar só as em aberto, só as pagas, por parceiro, ou buscar pelo código da fatura ou nome do parceiro.',
                comoUsar: 'Combine os filtros à vontade. O botão "Limpar filtros" volta tudo ao normal. Os totais no rodapé da tabela sempre somam o que está sendo exibido, não o histórico inteiro.'
            },
            {
                area: 'Faturamento',
                titulo: 'A tabela mostra quem gerou e quem deu baixa',
                oQueMudou: 'A fatura registrava quando foi paga, mas não por quem. Agora a coluna de emissão mostra a data e quem gerou, e a de baixa mostra a data e quem baixou.',
                comoUsar: 'O histórico antigo foi preenchido a partir do movimento de caixa gerado na baixa, então as faturas já pagas também mostram o responsável. Uma fatura antiga aparece como "não registrado" quando não houve movimento de caixa associado.'
            },
            {
                area: 'Faturamento',
                titulo: 'Você escolhe o que significa "as faturas de julho"',
                oQueMudou: 'Uma fatura tem três datas diferentes: quando as vistorias foram feitas (competência), quando a fatura foi gerada (emissão) e quando o cliente pagou. Elas quase nunca caem no mesmo mês — a maior parte das faturas de serviços de julho foi gerada e paga em agosto.',
                comoUsar: 'No seletor "Contar o mês pela data de", escolha o que você quer saber. Competência responde "quanto de serviço foi feito no mês". Emissão responde "quanto foi faturado no mês". Pagamento responde "quanto entrou de dinheiro no mês". As três respostas são diferentes e todas estão certas — depende da pergunta.'
            }
        ]
    },
    {
        versao: '9.0.0',
        data: '2026-08-30',
        titulo: 'Conferência automática com o DETRAN',
        resumo: 'O sistema passa a conferir sozinho, no fechamento do caixa, se tudo que o DETRAN cobrou está registrado aqui. Também mudou a forma de lançar saídas de caixa e de digitar placas.',
        mudancas: [
            {
                area: 'Caixa Diário',
                titulo: 'O fechamento confere o relatório do DETRAN',
                oQueMudou: 'O PDF do Portal ECV que você já anexa para fechar o caixa agora é lido pelo sistema e comparado com as Ordens de Serviço do período.',
                comoUsar: 'Anexe o relatório normalmente. Se estiver tudo certo, aparece um aviso verde com a taxa prevista. Se houver diferença, o sistema mostra a lista antes de deixar fechar. Você ainda pode fechar mesmo assim, mas a divergência fica registrada.'
            },
            {
                area: 'Caixa Diário',
                titulo: 'Pendências não somem mais',
                oQueMudou: 'Toda divergência encontrada no fechamento vira uma pendência gravada, com quem detectou e quando. Ela reaparece a cada fechamento, contando há quantos dias está sem correção, até alguém resolver.',
                comoUsar: 'O painel "Pendências de conferência com o DETRAN" aparece no topo da página do Caixa quando há algo em aberto. Para baixar uma pendência, clique em "Marcar resolvida" e descreva o que foi feito. Quando você corrige de verdade (lança a OS que faltava, por exemplo), o próprio sistema baixa no fechamento seguinte.'
            },
            {
                area: 'Atendimento',
                titulo: 'A placa é validada na hora de digitar',
                oQueMudou: 'O campo de placa formata sozinho e recusa formato inválido. A 5ª posição é onde quase todo erro acontece: no padrão Mercosul ela é LETRA, e é comum digitar o número parecido.',
                comoUsar: 'Digite normalmente, sem hífen — ele é colocado sozinho. Se a borda ficar vermelha, leia a mensagem embaixo do campo. Atenção redobrada na 5ª posição: 0 e O, 7 e H, 9 e J, 4 e E, 3 e D se confundem fácil.'
            },
            {
                area: 'Caixa Diário',
                titulo: 'Toda saída agora tem uma natureza',
                oQueMudou: 'Antes, depósito no banco, pagamento de conta e despesa da empresa eram lançados igual. Só que depósito não é despesa — o dinheiro continua sendo da empresa, só sai da gaveta para a conta.',
                comoUsar: 'Ao lançar uma saída, escolha: "Despesa da empresa" (café, insumos, Uber), "Depósito no banco" ou "Pagamento de conta já lançada". Só a primeira entra como custo no Painel BI.'
            },
            {
                area: 'Caixa Diário',
                titulo: 'Pagamento parcial de conta',
                oQueMudou: 'Quando a saída é pagamento de uma conta do Contas a Pagar, dá para dizer qual conta está sendo paga. O sistema soma os pagamentos e dá baixa sozinho quando fecha.',
                comoUsar: 'Escolha "Pagamento de conta já lançada" e selecione a conta na lista — ela mostra quanto já foi pago e quanto falta. Pode pagar em várias parcelas ao longo do mês. Quando a soma atingir o valor, a conta é baixada automaticamente.'
            },
            {
                area: 'Caixa Diário',
                titulo: 'Aviso de OS em aberto no fechamento',
                oQueMudou: 'Ao fechar o caixa, o sistema lista as Ordens de Serviço que ficaram sem finalizar.',
                comoUsar: 'Finalize ou cancele antes de fechar. Uma OS em aberto some dos relatórios, mas se o laudo já saiu o DETRAN cobra a taxa do mesmo jeito.'
            },
            {
                area: 'Contas a Pagar',
                titulo: 'A guia do DETRAN é calculada corretamente',
                oQueMudou: 'O DETRAN cobra R$ 27,00 por laudo emitido, qualquer que seja o resultado — aprovado, reprovado, bloqueado, cancelado ou não enviado. O único laudo gratuito é o retorno. O cálculo antigo deixava vários de fora.',
                comoUsar: 'Nada muda na sua rotina, mas a provisão do mês passa a bater com a guia que chega. Lembre: vistoria cancelada ou reprovada também precisa de OS lançada.'
            },
            {
                area: 'Painel BI',
                titulo: 'Competência separada do vencimento',
                oQueMudou: 'As despesas entram no resultado pelo mês de competência, não pela data de vencimento. A guia do DETRAN de julho, que vence em agosto, é custo de julho.',
                comoUsar: 'Ao cadastrar uma despesa, preencha a competência corretamente — é ela que define em qual mês o custo aparece. O Painel BI também passou a somar as despesas pagas direto pelo caixa.'
            }
        ]
    }
];

function versaoVistaKey() {
    const quem = currentSession ? (currentSession.id || currentSession.nome) : 'anon';
    return `certive_versao_vista_${quem}`;
}

function marcarAtualizacaoVista() {
    try { localStorage.setItem(versaoVistaKey(), APP_VERSION); } catch (e) { /* modo privado */ }
    const badge = document.getElementById('nav-atualizacoes-badge');
    if (badge) badge.style.display = 'none';
}

function atualizarBadgeVersao() {
    const rodape = document.getElementById('sidebar-versao');
    if (rodape) rodape.textContent = `Versão ${APP_VERSION}`;
    const badge = document.getElementById('nav-atualizacoes-badge');
    if (!badge) return;
    let vista = null;
    try { vista = localStorage.getItem(versaoVistaKey()); } catch (e) { /* modo privado */ }
    badge.style.display = (vista === APP_VERSION) ? 'none' : 'inline-block';
}

function renderAtualizacoes() {
    const alvo = document.getElementById('atualizacoes-lista');
    const atual = document.getElementById('atualizacoes-versao-atual');
    if (atual) atual.textContent = APP_VERSION;
    if (!alvo) return;

    alvo.innerHTML = ATUALIZACOES.map((rel, idx) => {
        const d = rel.data ? rel.data.split('-').reverse().join('/') : '';
        const ehAtual = idx === 0;
        return `
        <div class="panel-card" style="margin-bottom: 20px; ${ehAtual ? 'border: 1.5px solid var(--accent);' : ''}">
            <div class="panel-card-header" style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;">
                <h3 style="margin: 0;">Versão ${rel.versao}</h3>
                ${ehAtual ? '<span style="font-size:10px; font-weight:800; letter-spacing:.08em; background:var(--accent); color:#111; padding:3px 8px; border-radius:3px;">ATUAL</span>' : ''}
                <span style="margin-left: auto; font-size: 12px; color: var(--text-muted);">
                    <i class="ri-calendar-line"></i> ${d}
                </span>
            </div>
            <div class="panel-card-body">
                <h4 style="margin: 0 0 6px 0; font-size: 16px;">${escHtml(rel.titulo)}</h4>
                <p style="margin: 0 0 18px 0; color: var(--text-secondary); max-width: 70ch;">${rel.resumo}</p>

                ${rel.mudancas.map(m => `
                <div style="border-left: 3px solid var(--border); padding: 0 0 0 14px; margin-bottom: 18px;">
                    <div style="font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--accent); margin-bottom: 3px;">${m.area}</div>
                    <div style="font-weight: 700; margin-bottom: 6px;">${escHtml(m.titulo)}</div>
                    <div style="color: var(--text-secondary); font-size: 13.5px; line-height: 1.6; max-width: 74ch;">
                        <div style="margin-bottom: 6px;"><strong style="color: var(--text-primary);">O que mudou:</strong> ${m.oQueMudou}</div>
                        <div><strong style="color: var(--text-primary);">Como usar:</strong> ${m.comoUsar}</div>
                    </div>
                </div>`).join('')}
            </div>
        </div>`;
    }).join('');
}

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

    if (navPermissions[pageId] && currentSession && !currentSession.permissoes.includes(navPermissions[pageId])) {
        showToast("Acesso Negado: Você não tem permissão para acessar este módulo.", "error");
        return;
    }

    // Toggle nav active links
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${pageId}`);
    if (activeNav) activeNav.classList.add('active');

    // Atualiza o badge de pendências de baixa retroativa no menu Caixa.
    if (typeof atualizarBadgeCaixa === 'function') atualizarBadgeCaixa();

    // Toggle panels
    document.querySelectorAll('.section-panel').forEach(el => el.classList.remove('active'));
    const targetPanel = document.getElementById(`panel-${pageId}`);
    if (targetPanel) targetPanel.classList.add('active');

    // Atualizações não exige permissão: todo operador precisa saber o que mudou
    if (pageId === 'atualizacoes') {
        renderAtualizacoes();
        marcarAtualizacaoVista();
    }

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
        .reduce((sum, o) => somaCentavos(sum, o.valor), 0);

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
        list.map(p => `<option value="${p.id}">${escHtml(p.nome)}</option>`).join('');
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
        list.map(s => `<option value="${s.id}">${s.nome.toUpperCase()} (CPF/CNPJ: ${escHtml(s.cpf)})</option>`).join('');

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
    if (document.getElementById('os-veiculo-tipo')) document.getElementById('os-veiculo-tipo').value = '';
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
    
    // A reapresentação gratuita vale só para a OS em que foi ativada
    window.activeRecheckOrigemId = null;
    document.getElementById('os-valor').disabled = false;
    restaurarOpcoesPagamentoOS();
    document.getElementById('os-pagamento').value = 'pix';

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
        const tipoVeicEl = document.getElementById('os-veiculo-tipo');
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
        const veiculoTipo = tipoVeicEl ? tipoVeicEl.value : '';
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

        // Cliente parceiro sem parceiro escolhido: a OS ficava sem dono e nunca
        // aparecia no fechamento da fatura (OS-0547, OS-0171).
        if (currentClientType === 'parceiro' && (!partnerId || !db.parceiros.some(p => p.id === partnerId))) {
            showToast("Selecione o parceiro (lojista) antes de registrar a O.S.", "error");
            if (partnerSelect) { partnerSelect.focus(); partnerSelect.style.borderColor = 'var(--danger)'; }
            return;
        }

        // Placa fora do padrão trava aqui: uma placa errada não bate com o
        // relatório do DETRAN e inviabiliza a conferência da guia.
        if (placa && !placaValida(placa)) {
            showToast(`Placa inválida: ${motivoPlacaInvalida(placa)}`, "error");
            if (placaEl) { placaEl.focus(); placaEl.style.borderColor = 'var(--danger)'; }
            return;
        }

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

        if (pagamento === 'isento' && !window.activeRecheckOrigemId) {
            showToast("Pagamento isento só vale para reapresentação. Escolha a forma de pagamento.", "error");
            return;
        }
        if (window.activeRecheckOrigemId && pagamento !== 'isento') {
            // Trocou a forma de pagamento: deixou de ser a reapresentação gratuita
            window.activeRecheckOrigemId = null;
        }

        if (isNaN(valor) || (valor <= 0 && pagamento !== 'isento')) {
            showToast("Por favor, preencha o valor do serviço corretamente.", "error");
            return;
        }

        let finalObs = obs;
        let pagamentoDividido = null;
        if (pagamento === 'dividido') {
            const f1 = document.getElementById('os-div-forma-1').value;
            const v1 = parseFloat(document.getElementById('os-div-valor-1').value) || 0;
            const f2 = document.getElementById('os-div-forma-2').value;
            const v2 = parseFloat(document.getElementById('os-div-valor-2').value) || 0;
            
            if (v1 <= 0 || v2 <= 0) {
                showToast("Por favor, preencha ambos os valores parciais do pagamento dividido.", "error");
                return;
            }
            
            if (paraCentavos(v1) + paraCentavos(v2) !== paraCentavos(valor)) {
                showToast(`A soma dos valores (R$ ${v1.toFixed(2)} + R$ ${v2.toFixed(2)} = R$ ${(v1+v2).toFixed(2)}) deve ser exatamente igual ao valor total do serviço (R$ ${valor.toFixed(2)}).`, "error");
                return;
            }
            
            finalObs += `\n[PAG_DIVIDIDO: ${f1}=${v1};${f2}=${v2}]`;
            pagamentoDividido = [{ forma: f1, valor: v1 }, { forma: f2, valor: v2 }];
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
        
        // Número provisório só para a prévia do contrato; o definitivo vem do banco
        const osId = null;
        const num = "OS-(a gerar)";

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
                ? instanteNoDiaSP(window.dataDiaReaberto)
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
            veiculoTipo: veiculoTipo || null,
            servicoId: service.id,
            servicoNome: finalServiceName,
            valor: valor,
            observacoes: finalObs,
            pago: pagamento !== 'faturamento',
            formaPagamento: pagamento,
            parcelas: parcelas,
            pagamentoDividido,
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
                <td><strong style="color: var(--accent);">${escHtml(os.numero)}</strong></td>
                <td>${time}</td>
                <td>
                    <strong>${escHtml(os.clienteNome)}</strong><br>
                    <small style="color: var(--text-secondary); font-weight: 500;">PLACA: ${escHtml(os.placa)}</small>
                </td>
                <td>${os.servicoNome.split(' — ')[0]}</td>
                <td style="font-weight: 600; color: var(--success);">${formatCurrency(os.valor)}</td>
                <td><span style="text-transform: uppercase; font-size: 11px;">${escHtml(os.formaPagamento)}</span></td>
                <td>${statusBadge}</td>
                <td style="text-align: right; padding-right: 20px;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="openOSDetailsModal(${os.id})" title="Ver Ficha"><i class="ri-eye-line"></i></button>
                        ${isPending ? `<button class="btn btn-success btn-sm btn-icon" onclick="openConcludeVistoriaModal(${os.id})" title="Concluir Vistoria"><i class="ri-check-line"></i></button>` : ''}
                        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteOS(${os.id})" title="Excluir OS"><i class="ri-delete-bin-line"></i></button>
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
            <h4 style="font-size: 14px; margin-bottom: 6px;">Veículo Placa: <strong>${escHtml(os.placa)}</strong></h4>
            <p style="font-size: 12px; color: var(--text-secondary);">${escHtml(os.servicoNome)}</p>
            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Cliente: ${escHtml(os.clienteNome)}</p>
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
            // O que já foi recebido não é reescrito (o caixa pode estar fechado):
            // a diferença sai como devolução no caixa de hoje.
            registrarDescontoReprovada(os, valorOriginal);
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
                <div class="tl-time">${formatDateTimeBr(os.criadoEm)} por ${escHtml(os.criadoPor)}</div>
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
                <div class="tl-time">${formatDateTimeBr(os.finalizadoEm)} por ${escHtml(os.finalizadoPor)}</div>
            </div>
        `;
    }

    if (os.status === 'cancelada') {
        timelineHtml += `
            <div class="timeline-item cancelled">
                <div class="tl-title">O.S. Cancelada</div>
                <div class="tl-time">${formatDateTimeBr(os.canceladoEm)} por ${escHtml(os.canceladoPor)}</div>
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
                            <i class="ri-checkbox-circle-line"></i> Reapresentação já efetuada na ordem <strong>${escHtml(rechecked.numero)}</strong>.
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
        const splitData = divisaoPagamento(os);
        if (splitData) {
            cobrancaLabel = `DIVIDIDO (${splitData[0].forma.toUpperCase()}: R$ ${splitData[0].valor.toFixed(2)} / ${splitData[1].forma.toUpperCase()}: R$ ${splitData[1].valor.toFixed(2)})`;
        }
    }

    document.getElementById('detalhes-os-body').innerHTML = `
        ${recheckBannerHtml}
        <div class="detail-grid">
            <div class="detail-item"><label>Número da OS</label><strong>${escHtml(os.numero)}</strong></div>
            <div class="detail-item"><label>Status Atual</label><span style="font-weight: 700; color: var(--accent);">${statusMap[os.status]}</span></div>
            <div class="detail-item"><label>Tipo de Cliente</label><span>${os.clienteTipo.toUpperCase()}</span></div>
            <div class="detail-item"><label>Placa do Veículo</label><strong>${escHtml(os.placa)}</strong></div>
            <div class="detail-item"><label>Renavam</label><span>${escHtml(os.renavam)}</span></div>
            <div class="detail-item"><label>Solicitante</label><span>${escHtml(os.clienteNome)}</span></div>
            <div class="detail-item"><label>CPF / CNPJ</label><span>${escHtml(os.clienteCpfCnpj)}</span></div>
            <div class="detail-item"><label>Celular</label><span>${escHtml(os.clienteCelular)}</span></div>
            <div class="detail-item"><label>Serviço Executado</label><span>${escHtml(os.servicoNome)}</span></div>
            <div class="detail-item"><label>Valor Final</label><strong style="color: var(--success);">${formatCurrency(os.valor)}</strong></div>
            <div class="detail-item"><label>Cobrança</label><span>${cobrancaLabel}</span></div>
            <div class="detail-item"><label>DETRAN-SC Registrada</label><span>${os.detranRegistrado ? '🟢 Registrada' : '🔴 Não Registrada'}</span></div>
            <div class="detail-item"><label>Status NFS-e</label><span style="font-weight: 700; color: ${os.statusNfse === 'Emitida' ? 'var(--success)' : (os.statusNfse === 'Pendente de emissão' ? 'var(--warning)' : 'var(--text-secondary)')};">${escHtml(os.statusNfse || 'Não solicitada')}</span></div>
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
        // Dados do veículo: corrigíveis enquanto a O.S. não foi concluída (o laudo exige)
        if (os.status !== 'aberta' && os.status !== 'cancelada' && !os.status.startsWith('concluida')) {
            const faltam = cautelarDadosVeiculoFaltando(os, ((db.cautelares || []).find(c => c.osId === os.id) || {}).id);
            footerHtml += `<button class="btn ${faltam.length ? 'btn-danger' : 'btn-secondary'}" onclick="abrirCorrecaoDadosVeiculo(${os.id}, () => openOSDetailsModal(${os.id}))"><i class="ri-car-line"></i> Dados do veículo${faltam.length ? ` (${faltam.length} pendente${faltam.length > 1 ? 's' : ''})` : ''}</button>`;
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


function closeOSModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-os-detalhes').classList.remove('active');
}

// Devolução do desconto de 50% da vistoria reprovada de parceiro, quando o
// dinheiro já tinha entrado (OS paga na abertura).
function registrarDescontoReprovada(os, valorOriginal) {
    // OS faturada: o registro no caixa (não é dinheiro) passa a mostrar o valor com desconto
    if (os.formaPagamento === 'faturamento') {
        const reg = db.caixa_movimentos.find(m => m.osId === os.id && m.tipo === 'entrada' && m.formaPagamento === 'faturamento');
        if (reg && Math.abs(Number(reg.valor) - os.valor) > 0.004) {
            dbSave('caixa_movimentos', { valor: os.valor }, 'update', reg.id)
                .then(() => { reg.valor = os.valor; })
                .catch(avisarFalhaGravacao('Valor da vistoria faturada no caixa'));
        }
        return;
    }
    const recebidos = db.caixa_movimentos.filter(m => m.osId === os.id && movEhRecebimento(m));
    const recebido = recebidos.reduce((t, m) => somaCentavos(t, m.valor), 0)
        - db.caixa_movimentos.filter(m => m.osId === os.id && m.tipo === 'saida').reduce((t, m) => somaCentavos(t, m.valor), 0);
    const devolver = Math.round((Math.min(recebido, valorOriginal) - os.valor) * 100) / 100;
    if (devolver <= 0) return;
    const caixa = getTodayOpenCaixa();
    if (!caixa) {
        showToast(`Desconto aplicado, mas o caixa de hoje está fechado: lance a devolução de ${formatCurrency(devolver)} manualmente.`, "warning");
        return;
    }
    const forma = recebidos.slice().sort((a, b) => b.valor - a.valor)[0].formaPagamento;
    dbSave('caixa_movimentos', {
        caixaId: caixa.id,
        tipo: 'saida',
        valor: devolver,
        descricao: `Devolução desconto 50% (reprovada) OS ${os.numero}`,
        formaPagamento: forma,
        data: new Date().toISOString(),
        operador: currentSession.nome,
        osId: os.id,
        faturaId: null
    }, 'insert').then(() => {
        showToast(`Devolução de ${formatCurrency(devolver)} lançada no caixa de hoje.`, "info");
    }).catch(e => {
        console.error("Erro ao lançar a devolução do desconto:", e);
        showToast(`A devolução de ${formatCurrency(devolver)} NÃO foi lançada no caixa. Lance manualmente.`, "error");
    });
}

async function changeOSStatus(id, newStatus) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;

    try {
        // Ao virar "paga", lança a entrada no caixa, a não ser que ela já exista
        // (a OS paga na abertura já entrou) ou que a OS seja faturada (o dinheiro
        // dela entra só na baixa da fatura).
        let pago = os.pago;
        if (newStatus === 'paga') {
            pago = true;
            const activeCaixa = getTodayOpenCaixa();
            const jaLancada = db.caixa_movimentos.some(m => m.osId === os.id && m.tipo === 'entrada');
            if (!jaLancada && os.formaPagamento !== 'faturamento') {
                if (!activeCaixa) { showToast("Abra o caixa de hoje para confirmar o pagamento.", "error"); return; }
                await dbSave('caixa_movimentos', {
                    caixaId: activeCaixa.id,
                    tipo: "entrada",
                    valor: os.valor,
                    descricao: `Serviço ${(os.servicoNome || 'Vistoria').split(' — ')[0]} (Placa: ${os.placa})`,
                    formaPagamento: os.formaPagamento,
                    data: new Date().toISOString(),
                    operador: currentSession.nome,
                    osId: os.id,
                    faturaId: null
                }, 'insert');
            }
        }
        await dbSave('ordens_servico', { status: newStatus, pago }, 'update', os.id);
        os.status = newStatus;
        os.pago = pago;
    } catch (err) {
        showToast(`A O.S. ${os.numero} não foi atualizada: ` + (err.message || err), "error");
        return;
    }

    showToast(`O.S. ${os.numero} movida para ${newStatus.toUpperCase()}`, "success");
    logAudit("Atualização OS", `Alterou status da ${os.numero} para ${newStatus}.`);
    closeOSModal();
    renderAtendimentoPage();
}


// A função _remover_os_da_fatura do banco ainda não considera as cobranças
// extras (mensalidade): tirar uma O.S. de uma fatura com mensalidade faria a
// mensalidade sumir do valor. Até a migração 20261001020000 ser aplicada,
// essa operação fica bloqueada aqui. Depois de aplicada, trocar para true.
const REMOVER_OS_CONSIDERA_EXTRAS = false;

function bloqueioSaidaDaFatura(fat) {
    if (REMOVER_OS_CONSIDERA_EXTRAS || !fat || !cobrancasExtrasDaFatura(fat).length) return null;
    return `A fatura ${fat.codigo} tem mensalidade lançada; por enquanto a O.S. não pode sair dela. Peça ao administrador para ajustar a fatura.`;
}

// Tira a OS de uma fatura em aberto (cancela antes a cobrança do Asaas, cujo
// valor deixaria de bater). Lança erro se não for possível.
async function tirarOSDaFatura(os, fat) {
    const bloqueio = bloqueioSaidaDaFatura(fat);
    if (bloqueio) throw new Error(bloqueio);
    if (fat && fat.asaas_payment_id) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-asaas-billing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sbAuthToken()}` },
            body: JSON.stringify({ faturaId: fat.id })
        });
        const d = await res.json().catch(() => ({}));
        if (d.status === 'ja_recebida') throw new Error(`a cobrança da fatura ${fat.codigo} já consta paga no Asaas; dê baixa na fatura`);
        if (!res.ok || !['cancelada', 'sem_cobranca'].includes(d.status)) throw new Error('não foi possível cancelar a cobrança no Asaas (' + (d.error || res.status) + ')');
        fat.asaas_payment_id = null;
        fat.asaas_url = null;
    }
    const { data: r, error } = await supabaseClient.rpc('remover_os_da_fatura', { p_os_id: os.id, p_por: currentSession.nome });
    if (error) throw error;
    aplicarResultadoAlteracaoPagamento(os, r);
}

async function cancelOS(id) {
    const os = db.ordens_servico.find(o => o.id === id);
    if (!os) return;
    if (os.status === 'cancelada') { showToast("Esta O.S. já está cancelada.", "info"); return; }

    // OS numa fatura: sai dela junto com o cancelamento (fatura paga não muda)
    const fatDaOS = os.faturaId ? db.faturas.find(f => f.id === os.faturaId) : null;
    if (fatDaOS && fatDaOS.pago) {
        showToast(`Esta O.S. está na fatura ${fatDaOS.codigo}, que já foi paga. Faça o acerto como crédito ao parceiro.`, "error");
        return;
    }
    if (bloqueioSaidaDaFatura(fatDaOS)) { showToast(bloqueioSaidaDaFatura(fatDaOS), "error"); return; }

    // O que de fato entrou de dinheiro por esta OS (cada forma do pagamento
    // dividido separada), descontando estornos já feitos.
    const recebidoPorForma = {};
    db.caixa_movimentos.filter(m => m.osId === os.id).forEach(m => {
        if (movEhRecebimento(m)) recebidoPorForma[m.formaPagamento] = (recebidoPorForma[m.formaPagamento] || 0) + Number(m.valor || 0);
        else if (m.tipo === 'saida') recebidoPorForma[m.formaPagamento] = (recebidoPorForma[m.formaPagamento] || 0) - Number(m.valor || 0);
    });
    const estornos = Object.entries(recebidoPorForma).filter(([, v]) => v > 0.004);
    const totalEstorno = estornos.reduce((s2, [, v]) => s2 + v, 0);

    const activeCaixa = getTodayOpenCaixa();
    if (estornos.length > 0 && !activeCaixa) {
        showToast("Abra o caixa de hoje antes de cancelar: esta O.S. tem pagamento a estornar.", "error");
        return;
    }

    const msg = `Cancelar a O.S. ${os.numero} (placa ${os.placa})?` +
        (estornos.length ? `\n\nSerá lançado no caixa de hoje o estorno de ${formatCurrency(totalEstorno)} (${estornos.map(([f, v]) => `${f}: ${formatCurrency(v)}`).join(', ')}).` : '') +
        (fatDaOS ? `\n\nA O.S. sai da fatura ${fatDaOS.codigo}${fatDaOS.asaas_payment_id ? ' e a cobrança do Asaas dela será cancelada (gere outra depois)' : ''}.` : '');
    if (!confirm(msg)) return;

    try {
        if (fatDaOS) await tirarOSDaFatura(os, fatDaOS);
        for (const [forma, valor] of estornos) {
            const newMov = {
                caixaId: activeCaixa.id,
                tipo: "saida",
                valor: Math.round(valor * 100) / 100,
                descricao: `Estorno OS ${os.numero} (Venda Cancelada)`,
                formaPagamento: forma,
                data: new Date().toISOString(),
                operador: currentSession.nome,
                osId: os.id,
                faturaId: null
            };
            await dbSave('caixa_movimentos', newMov, 'insert');
        }

        const canceladoEm = new Date().toISOString();
        await dbSave('ordens_servico', {
            status: "cancelada",
            canceladoEm,
            canceladoPor: currentSession.nome
        }, 'update', os.id);
        os.status = "cancelada";
        os.canceladoEm = canceladoEm;
        os.canceladoPor = currentSession.nome;
    } catch (err) {
        console.error("Erro ao cancelar OS:", err);
        showToast("Não foi possível cancelar a O.S.: " + (err.message || err), "error");
        renderAtendimentoPage();
        return;
    }

    showToast(estornos.length ? `O.S. ${os.numero} cancelada. Estorno de ${formatCurrency(totalEstorno)} lançado no caixa.` : `O.S. ${os.numero} cancelada.`, "success");
    logAudit("Cancelamento OS", `Cancelou a OS ${os.numero} (placa ${os.placa})${estornos.length ? `, estorno ${formatCurrency(totalEstorno)}` : ''}.`);
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
    if (document.getElementById('edit-os-veiculo-tipo')) document.getElementById('edit-os-veiculo-tipo').value = os.veiculoTipo || '';
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
        const splitData = divisaoPagamento(os);
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
    if (placa && !placaValida(placa)) {
        showToast(`Placa inválida: ${motivoPlacaInvalida(placa)}`, "error");
        return;
    }
    const renavam = document.getElementById('edit-os-renavam').value.trim();
    const chassi = document.getElementById('edit-os-veiculo-chassi').value.trim().toUpperCase();
    const marcaModelo = document.getElementById('edit-os-veiculo-marca-modelo').value.trim().toUpperCase();
    const ano = document.getElementById('edit-os-veiculo-ano').value.trim();
    const veiculoTipo = document.getElementById('edit-os-veiculo-tipo') ? document.getElementById('edit-os-veiculo-tipo').value : (os.veiculoTipo || '');
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
    let pagamentoDividido = null;
    if (pagamento === 'dividido') {
        const f1 = document.getElementById('edit-os-div-forma-1').value;
        const v1 = parseFloat(document.getElementById('edit-os-div-valor-1').value) || 0;
        const f2 = document.getElementById('edit-os-div-forma-2').value;
        const v2 = parseFloat(document.getElementById('edit-os-div-valor-2').value) || 0;
        
        if (v1 <= 0 || v2 <= 0) {
            showToast("Por favor, preencha ambos os valores parciais do pagamento dividido.", "error");
            return;
        }
        
        if (paraCentavos(v1) + paraCentavos(v2) !== paraCentavos(valor)) {
            showToast(`A soma dos valores (R$ ${v1.toFixed(2)} + R$ ${v2.toFixed(2)} = R$ ${(v1+v2).toFixed(2)}) deve ser exatamente igual ao valor total do serviço (R$ ${valor.toFixed(2)}).`, "error");
            return;
        }
        
        finalObs += `\n[PAG_DIVIDIDO: ${f1}=${v1};${f2}=${v2}]`;
        pagamentoDividido = [{ forma: f1, valor: v1 }, { forma: f2, valor: v2 }];
    }

    const service = db.servicos.find(s => s.id === serviceId);
    if (!service) { showToast("Serviço inválido.", "error"); return; }

    // Classificação dinâmica do serviço em CAPS LOCK na edição (Item A.2)
    let finalSvcName = service.nome.toUpperCase();
    if (os.clienteTipo === 'parceiro') {
        if (service.id === 4) finalSvcName = "VISTORIA CAUTELAR AVULSA";
        else if (service.id === 7) finalSvcName = "VISTORIA COMBO";
        else if (service.id === 8) finalSvcName = "VISTORIA DE TRANSFERÊNCIA COMBO";
    }

    // A comparação é feita ANTES de mexer na OS. Antes o sistema alterava o
    // registro e depois o comparava com ele mesmo, então nunca via mudança e a
    // trava de caixa fechado não funcionava.
    const divisaoAntes = JSON.stringify(divisaoPagamento(os) || null);
    const divisaoDepois = JSON.stringify(pagamentoDividido);
    const mudouFinanceiro =
        Math.abs(Number(os.valor) - valor) > 0.004 ||
        os.formaPagamento !== pagamento ||
        (os.parcelas || null) !== (parcelas || null) ||
        divisaoAntes !== divisaoDepois;

    const movsDaVenda = db.caixa_movimentos.filter(m => m.osId === os.id && m.tipo === 'entrada' && !m.faturaId);
    const temCaixaFechado = movsDaVenda.some(m => {
        const caixa = db.caixa_diario.find(c => c.id === m.caixaId);
        return caixa && caixa.status === 'fechado';
    });
    const fatDaEdicao = os.faturaId ? db.faturas.find(f => f.id === os.faturaId) : null;
    if (mudouFinanceiro && bloqueioSaidaDaFatura(fatDaEdicao)) {
        showToast(bloqueioSaidaDaFatura(fatDaEdicao), "error");
        return;
    }
    if (mudouFinanceiro && temCaixaFechado) {
        showToast("Esta OS tem lançamento em Caixa Diário FECHADO: valor e forma de pagamento não podem ser alterados aqui. Use \"Alterar forma de pagamento\" com justificativa.", "error");
        return;
    }
    const activeCaixa = getTodayOpenCaixa();
    if (mudouFinanceiro && !activeCaixa && !os.reapresentacaoOrigemID) {
        showToast("Abra o caixa de hoje para alterar valor ou forma de pagamento.", "error");
        return;
    }

    const alteracoes = {
        clienteNome: nome,
        clienteCpfCnpj: cpf,
        clienteCelular: cel,
        osFinalidade: finalidade,
        clienteEndereco: endereco,
        placa,
        renavam,
        veiculoChassi: chassi,
        veiculoMarcaModelo: marcaModelo,
        veiculoAno: ano,
        veiculoTipo: veiculoTipo || null,
        observacoes: finalObs,
        servicoId: service.id,
        servicoNome: finalSvcName,
        valor,
        detranRegistrado: detran
    };
    // O contrato assinado não é reescrito: é o texto que o cliente aceitou.
    // Só uma OS ainda sem assinatura tem o texto regenerado.
    if (!os.contratoHash) {
        alteracoes.contratoTexto = generateContractText({ ...os, ...alteracoes, formaPagamento: pagamento, parcelas });
    }

    try {
        if (mudouFinanceiro) {
            const osNova = { ...os, ...alteracoes, formaPagamento: pagamento, parcelas, pagamentoDividido, pago: pagamento !== 'faturamento' };
            // Troca os lançamentos da venda e a forma de pagamento numa transação
            const { data: r, error } = await supabaseClient.rpc('alterar_pagamento_os', {
                p_os_id: os.id,
                p_os: { formaPagamento: pagamento, pago: osNova.pago, parcelas, observacoes: finalObs, pagamentoDividido },
                p_movimentos: activeCaixa ? movimentosDaVendaOS(osNova, activeCaixa) : [],
                p_por: currentSession.nome
            });
            if (error) throw error;
            aplicarResultadoAlteracaoPagamento(os, r);
        }
        await dbSave('ordens_servico', alteracoes, 'update', os.id);
        Object.assign(os, alteracoes, { formaPagamento: pagamento, parcelas, pagamentoDividido, pago: pagamento !== 'faturamento' });
    } catch (err) {
        console.error("Erro ao salvar a edição da OS:", err);
        showToast("A edição da OS não foi salva: " + (err.message || err), "error");
        return;
    }

    showToast("Ordem de Serviço editada com sucesso!", "success");
    logAudit("Edição OS", `Editou os dados da OS ${os.numero} (Placa: ${os.placa})${mudouFinanceiro ? ` — pagamento: ${pagamento}, valor ${formatCurrency(valor)}` : ''}.`);

    closeEditOSModal();
    closeOSModal();
    renderAtendimentoPage();
    if (document.getElementById('panel-historico').classList.contains('active')) {
        renderHistorico();
    }
}

// Aplica no cache local o resultado das funções alterar_pagamento_os /
// remover_os_da_fatura do banco.
function aplicarResultadoAlteracaoPagamento(os, r) {
    if (!r) return;
    const apagados = new Set((r.apagados || []).map(Number));
    if (apagados.size) db.caixa_movimentos = db.caixa_movimentos.filter(m => !apagados.has(Number(m.id)));
    (r.movimentos || []).forEach(m => db.caixa_movimentos.unshift(prepareRecordFromDb('caixa_movimentos', m)));
    const f = r.fatura && r.fatura.fatura_id ? r.fatura : (r.fatura_id ? r : null);
    if (f) {
        if (f.fatura_apagada) db.faturas = db.faturas.filter(x => x.id !== f.fatura_id);
        else {
            const fat = db.faturas.find(x => x.id === f.fatura_id);
            if (fat) { fat.ordensIds = (f.ordensIds || []).map(Number); fat.valorTotal = Number(f.valorTotal) || 0; }
        }
        if (f.credito_devolvido) {
            if (!db.parceiros_creditos) db.parceiros_creditos = [];
            db.parceiros_creditos.push(normalizeRecord('parceiros_creditos', f.credito_devolvido));
        }
        (db.parceiros_creditos || []).forEach(c => { if (f.fatura_apagada && c.faturaId === f.fatura_id) c.faturaId = null; });
    }
    if (r.os) Object.assign(os, prepareRecordFromDb('ordens_servico', r.os));
    else os.faturaId = null;
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

// A carga inicial traz só os últimos meses (ver JANELA_MESES em supabase-db.js).
// Quando a tela precisa de período anterior (ou de busca em todo o histórico),
// busca o restante uma vez e desenha de novo.
function garantirHistoricoCompleto(precisa, redesenhar) {
    if (!precisa || window.historicoCompleto || typeof carregarHistoricoCompleto !== 'function' || window.__carregandoHistorico) return;
    window.__carregandoHistorico = true;
    showToast("Buscando o histórico completo...", "info");
    carregarHistoricoCompleto()
        .then(() => { if (typeof redesenhar === 'function') redesenhar(); })
        .catch(e => { console.error(e); showToast("Não foi possível buscar o histórico anterior: " + (e.message || e), "error"); })
        .finally(() => { window.__carregandoHistorico = false; });
}

// Lista filtrada do Histórico Geral (mesma fonte da tela e do relatório).
function getHistoricoFilteredList() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const placaFilter = (g('hist-filter-placa') || '').trim().toUpperCase();
    const clienteFilter = (g('hist-filter-cliente') || '').trim().toUpperCase();
    const servicoFilter = g('hist-filter-servico');
    const valorFilter = g('hist-filter-valor');
    const dataIniFilter = g('hist-filter-data-ini');
    const dataFimFilter = g('hist-filter-data-fim');
    const pagamentoFilter = g('hist-filter-pagamento');
    const statusFilter = g('hist-filter-status');
    const corte = typeof inicioJanelaCarga === 'function' ? inicioJanelaCarga() : '';
    garantirHistoricoCompleto(!!(placaFilter || clienteFilter || valorFilter || (dataIniFilter && dataIniFilter < corte)), renderHistorico);

    return db.ordens_servico.filter(o => {
        if (o.unidadeId !== activeUnitId) return false;
        if (placaFilter && !(o.placa || '').toUpperCase().includes(placaFilter)) return false;
        if (clienteFilter) {
            // Campos podem vir nulos (ex.: OS sem CPF/CNPJ ou sem nome do cliente).
            // Sem o "|| ''" o .includes/.toUpperCase quebra a busca inteira.
            const nameMatch = (o.clienteNome || '').toUpperCase().includes(clienteFilter);
            const docMatch = (o.clienteCpfCnpj || '').includes(clienteFilter);
            if (!nameMatch && !docMatch) return false;
        }
        if (servicoFilter && o.servicoId !== parseInt(servicoFilter)) return false;
        if (valorFilter && Math.abs(o.valor - parseFloat(valorFilter)) > 0.01) return false;
        const osDate = getLocalDateString(o.criadoEm);
        if (dataIniFilter && osDate < dataIniFilter) return false;
        if (dataFimFilter && osDate > dataFimFilter) return false;
        if (pagamentoFilter && o.formaPagamento !== pagamentoFilter) return false;
        if (statusFilter && o.status !== statusFilter) return false;
        return true;
    });
}

function renderHistorico() {
    const list = getHistoricoFilteredList();

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
                <td><strong style="color: var(--accent);">${escHtml(os.numero)}</strong></td>
                <td>${date} ${time}</td>
                <td>
                    <strong>${escHtml(os.clienteNome)}</strong><br>
                    <small style="color: var(--text-secondary); font-weight: 500;">PLACA: ${escHtml(os.placa)}</small>
                </td>
                <td>${os.servicoNome.split(' — ')[0]}</td>
                <td style="font-weight: 600; color: var(--success);">${formatCurrency(os.valor)}</td>
                <td><span style="text-transform: uppercase; font-size: 11px;">${escHtml(os.formaPagamento)}</span></td>
                <td>${statusBadge}</td>
                <td style="text-align: right; padding-right: 20px;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="openOSDetailsModal(${os.id})" title="Ver Ficha"><i class="ri-eye-line"></i></button>
                        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteOS(${os.id})" title="Excluir OS"><i class="ri-delete-bin-line"></i></button>
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

// ============================================================
// RELATÓRIOS (PDF) — mesmo modelo de layout do Caixa Diário
// ============================================================
function truncarTexto(txt, n) {
    txt = String(txt || '');
    return txt.length > n ? txt.slice(0, n - 1) + '.' : txt;
}

function relatorioNovoPdf(subtitulo, metaLinhas) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const unit = db.unidades.find(u => u.id === activeUnitId);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text("CERTIVE VISTORIAS", 14, 20);

    doc.setFontSize(10);
    doc.setFont("Helvetica", "normal");
    doc.text(subtitulo, 14, 26);
    doc.line(14, 28, 196, 28);

    doc.setFontSize(9);
    doc.setFont("Helvetica", "bold"); doc.text("Unidade:", 14, 35);
    doc.setFont("Helvetica", "normal"); doc.text(unit ? unit.nome : "—", 32, 35);
    doc.setFont("Helvetica", "bold"); doc.text("Emitido em:", 130, 35);
    doc.setFont("Helvetica", "normal"); doc.text(new Date().toLocaleString('pt-BR'), 155, 35);

    let y = 42;
    doc.setFontSize(9);
    (metaLinhas || []).forEach(linha => { doc.text(linha, 14, y); y += 5; });
    doc.line(14, y, 196, y);
    return { doc, y: y + 6 };
}

function gerarRelatorioHistorico() {
    if (!window.jspdf) { showToast("Biblioteca de PDF não carregada. Recarregue a página.", "error"); return; }
    const list = getHistoricoFilteredList().slice().sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));
    if (list.length === 0) { showToast("Nenhum registro no filtro atual para gerar o relatório.", "info"); return; }

    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const filtros = [];
    if (g('hist-filter-data-ini') || g('hist-filter-data-fim'))
        filtros.push(`Periodo: ${g('hist-filter-data-ini') ? formatDateBr(g('hist-filter-data-ini')) : 'inicio'} a ${g('hist-filter-data-fim') ? formatDateBr(g('hist-filter-data-fim')) : 'hoje'}`);
    if (g('hist-filter-placa')) filtros.push(`Placa: ${g('hist-filter-placa').toUpperCase()}`);
    if (g('hist-filter-cliente')) filtros.push(`Cliente: ${g('hist-filter-cliente')}`);
    if (g('hist-filter-servico')) { const s = db.servicos.find(x => x.id === parseInt(g('hist-filter-servico'))); if (s) filtros.push(`Servico: ${s.nome.split(' — ')[0]}`); }
    if (g('hist-filter-pagamento')) filtros.push(`Pagamento: ${g('hist-filter-pagamento')}`);
    if (g('hist-filter-status')) filtros.push(`Status: ${g('hist-filter-status')}`);

    const totalValor = list.reduce((s, o) => somaCentavos(s, o.valor), 0);
    const meta = [`Registros: ${list.length}    Valor total: ${formatCurrency(totalValor)}`];
    if (filtros.length) meta.push('Filtros: ' + filtros.join('   |   '));

    const { doc, y: startY } = relatorioNovoPdf("Relatorio de Ordens de Servico", meta);
    let y = startY;
    const header = () => {
        doc.setFont("Helvetica", "bold"); doc.setFontSize(8);
        doc.text("N.", 14, y);
        doc.text("Data", 30, y);
        doc.text("Cliente / Placa", 52, y);
        doc.text("Servico", 104, y);
        doc.text("Forma", 134, y);
        doc.text("Status", 154, y);
        doc.text("Valor", 196, y, { align: 'right' });
        doc.line(14, y + 1.5, 196, y + 1.5);
        y += 6;
        doc.setFont("Helvetica", "normal");
    };
    header();

    const statusTxt = { aberta: 'Aberta', paga: 'Paga', em_execucao: 'Em vistoria', concluida_aprovada: 'Aprovada', concluida_reprovada: 'Reprovada', cancelada: 'Cancelada' };
    doc.setFontSize(8);
    list.forEach(os => {
        if (y > 282) { doc.addPage(); y = 20; header(); }
        doc.text(truncarTexto(os.numero, 10), 14, y);
        doc.text(formatDateBr(os.criadoEm), 30, y);
        doc.text(truncarTexto(`${os.clienteNome} (${os.placa})`, 28), 52, y);
        doc.text(truncarTexto((os.servicoNome || '').split(' — ')[0], 15), 104, y);
        doc.text(truncarTexto(os.formaPagamento, 11), 134, y);
        doc.text(truncarTexto(statusTxt[os.status] || os.status || '', 12), 154, y);
        doc.text(formatCurrency(os.valor), 196, y, { align: 'right' });
        y += 5.5;
    });

    doc.line(14, y, 196, y); y += 6;
    doc.setFont("Helvetica", "bold"); doc.setFontSize(9);
    doc.text(`TOTAL (${list.length} registros)`, 14, y);
    doc.text(formatCurrency(totalValor), 196, y, { align: 'right' });

    doc.save(`relatorio_historico_${hojeLocalStr()}.pdf`);
    showToast("Relatório gerado com sucesso!", "success");
    logAudit("Relatório Histórico", `Gerou relatório do histórico (${list.length} registros).`);
}

// ==========================================================
// RELATÓRIO DE FATURAS EM ABERTO ("dinheiro na rua")
// ----------------------------------------------------------
// Todas as faturas não pagas da unidade, de qualquer mês, agrupadas por
// parceiro, com o total a receber e há quanto tempo cada uma está em aberto.
// Respeita só o filtro de parceiro da tela (o mês não importa: fatura antiga
// não paga também é dinheiro na rua).
// ==========================================================
function gerarRelatorioFaturasEmAberto() {
    if (!window.jspdf) { showToast("Biblioteca de PDF não carregada. Recarregue a página.", "error"); return; }
    const elParc = document.getElementById('fat-filtro-parceiro');
    const fParceiro = elParc && elParc.value ? parseInt(elParc.value) : null;

    const hoje = diaSP();
    const diasEmAberto = f => {
        const ini = diaSP(f.criadoEm);
        if (!ini) return 0;
        return Math.max(0, Math.round((Date.parse(hoje + 'T12:00:00Z') - Date.parse(ini + 'T12:00:00Z')) / 86400000));
    };
    const abertas = (db.faturas || [])
        .filter(f => f.unidadeId === activeUnitId && !f.pago && Number(f.valorTotal) > 0)
        .filter(f => !fParceiro || f.parceiroId === fParceiro);
    if (!abertas.length) { showToast("Não há faturas em aberto" + (fParceiro ? " para este parceiro." : "."), "info"); return; }

    const nomeParceiro = id => { const p = db.parceiros.find(x => x.id === id); return p ? p.nome : 'Parceiro removido'; };
    const total = abertas.reduce((t, f) => somaCentavos(t, f.valorTotal), 0);

    // Por parceiro, do maior valor em aberto para o menor
    const grupos = {};
    abertas.forEach(f => { (grupos[f.parceiroId] = grupos[f.parceiroId] || []).push(f); });
    const parceiros = Object.keys(grupos).map(id => {
        const lista = grupos[id].sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
        return { id: Number(id), nome: nomeParceiro(Number(id)), lista, total: lista.reduce((t, f) => somaCentavos(t, f.valorTotal), 0) };
    }).sort((a, b) => b.total - a.total);

    // Tempo em aberto (desde a emissão)
    const faixas = [
        { rotulo: 'Até 15 dias', de: 0, ate: 15, cor: [46, 125, 50] },
        { rotulo: '16 a 30 dias', de: 16, ate: 30, cor: [212, 160, 23] },
        { rotulo: '31 a 60 dias', de: 31, ate: 60, cor: [230, 110, 30] },
        { rotulo: 'Mais de 60 dias', de: 61, ate: Infinity, cor: [183, 28, 28] }
    ].map(fx => {
        const itens = abertas.filter(f => { const d = diasEmAberto(f); return d >= fx.de && d <= fx.ate; });
        return { ...fx, qtd: itens.length, valor: itens.reduce((t, f) => somaCentavos(t, f.valorTotal), 0) };
    });
    const maisAntiga = Math.max(...abertas.map(diasEmAberto));
    const comAsaas = abertas.filter(f => f.asaas_url || f.asaas_payment_id);
    const unidade = db.unidades.find(u => u.id === activeUnitId) || {};

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14, D = W - M;
    const NAVY = [10, 31, 61], OURO = [212, 160, 23], TXT = [28, 33, 43], CINZA = [110, 118, 130], LINHA = [226, 229, 234], FUNDO = [246, 247, 249];
    const cor = (c, tipo = 'text') => tipo === 'text' ? doc.setTextColor(...c) : tipo === 'fill' ? doc.setFillColor(...c) : doc.setDrawColor(...c);
    const fonte = (tam, peso = 'normal') => { doc.setFont('helvetica', peso); doc.setFontSize(tam); };

    // Cabeçalho
    const cabecalho = (primeira) => {
        cor(NAVY, 'fill'); doc.rect(0, 0, W, primeira ? 34 : 18, 'F');
        cor(OURO, 'fill'); doc.rect(0, primeira ? 34 : 18, W, 0.9, 'F');
        cor([255, 255, 255]); fonte(primeira ? 16 : 11, 'bold');
        doc.text('CERTIVE VISTORIAS', M, primeira ? 14 : 11.5);
        cor(OURO); fonte(primeira ? 10 : 8, 'bold');
        doc.text('RELATÓRIO DE FATURAS EM ABERTO', primeira ? M : D, primeira ? 21 : 11.5, primeira ? {} : { align: 'right' });
        if (primeira) {
            cor([200, 208, 222]); fonte(8.5);
            doc.text(`${unidade.nome || 'Unidade'}${fParceiro ? '  ·  Parceiro: ' + nomeParceiro(fParceiro) : ''}`, M, 27.5);
            doc.text(`Posição em ${formatDateBr(hoje)} às ${horaSP().slice(0, 5)}`, D, 27.5, { align: 'right' });
        }
    };
    cabecalho(true);
    let y = 44;

    // Indicadores
    const cartoes = [
        { rotulo: 'TOTAL A RECEBER', valor: formatCurrency(total), destaque: true },
        { rotulo: 'FATURAS EM ABERTO', valor: String(abertas.length) },
        { rotulo: 'PARCEIROS', valor: String(parceiros.length) },
        { rotulo: 'MAIS ANTIGA', valor: `${maisAntiga} dia${maisAntiga === 1 ? '' : 's'}` }
    ];
    const larg = [64, 38, 38, 42], gap = (D - M - larg.reduce((a, b) => a + b, 0)) / 3;
    let x = M;
    cartoes.forEach((c, i) => {
        cor(c.destaque ? NAVY : FUNDO, 'fill'); doc.roundedRect(x, y, larg[i], 22, 2, 2, 'F');
        if (c.destaque) { cor(OURO, 'fill'); doc.rect(x, y + 20.6, larg[i], 1.4, 'F'); }
        cor(c.destaque ? OURO : CINZA); fonte(7, 'bold'); doc.text(c.rotulo, x + 4, y + 7);
        cor(c.destaque ? [255, 255, 255] : TXT); fonte(c.destaque ? 15 : 13, 'bold'); doc.text(c.valor, x + 4, y + 16.5);
        x += larg[i] + gap;
    });
    y += 30;

    // Tempo em aberto: barra proporcional + legenda
    cor(TXT); fonte(9, 'bold'); doc.text('TEMPO EM ABERTO (desde a emissão)', M, y); y += 4;
    let bx = M;
    faixas.forEach(fx => {
        if (!fx.valor) return;
        const w = (D - M) * (fx.valor / total);
        cor(fx.cor, 'fill'); doc.rect(bx, y, w, 5, 'F'); bx += w;
    });
    y += 10;
    const colW = (D - M) / 4;
    faixas.forEach((fx, i) => {
        const cx = M + i * colW;
        cor(fx.cor, 'fill'); doc.rect(cx, y - 3, 3, 3, 'F');
        cor(TXT); fonte(8, 'bold'); doc.text(fx.rotulo, cx + 5, y - 0.4);
        cor(CINZA); fonte(8); doc.text(`${formatCurrency(fx.valor)} · ${fx.qtd} fatura${fx.qtd === 1 ? '' : 's'}`, cx + 5, y + 4);
    });
    y += 9;
    cor(CINZA); fonte(7.5);
    doc.text(`${comAsaas.length} de ${abertas.length} faturas com cobrança gerada no Asaas (${formatCurrency(comAsaas.reduce((t, f) => somaCentavos(t, f.valorTotal), 0))}).`, M, y);
    y += 8;

    // Tabela por parceiro
    const col = { cod: M + 2, comp: M + 22, emis: M + 66, dias: M + 96, cob: M + 116, env: M + 138, val: D - 2 };
    const cabecTabela = () => {
        cor(NAVY, 'fill'); doc.rect(M, y, D - M, 7, 'F');
        cor([255, 255, 255]); fonte(7, 'bold');
        doc.text('FATURA', col.cod, y + 4.7); doc.text('COMPETÊNCIA', col.comp, y + 4.7); doc.text('EMITIDA EM', col.emis, y + 4.7);
        doc.text('DIAS', col.dias, y + 4.7); doc.text('COBRANÇA', col.cob, y + 4.7); doc.text('ENVIADA', col.env, y + 4.7);
        doc.text('VALOR', col.val, y + 4.7, { align: 'right' });
        y += 7;
    };
    const novaPagina = () => { doc.addPage(); cabecalho(false); y = 26; cabecTabela(); };
    cabecTabela();

    parceiros.forEach(p => {
        if (y > 262) novaPagina();
        // faixa do parceiro
        cor([236, 240, 247], 'fill'); doc.rect(M, y, D - M, 7.5, 'F');
        cor(OURO, 'fill'); doc.rect(M, y, 1.2, 7.5, 'F');
        cor(NAVY); fonte(8.5, 'bold'); doc.text(truncarTexto(p.nome.toUpperCase(), 60), M + 4, y + 5);
        doc.text(`${p.lista.length} fatura${p.lista.length === 1 ? '' : 's'}  ·  ${formatCurrency(p.total)}`, col.val, y + 5, { align: 'right' });
        y += 7.5;
        p.lista.forEach((f, i) => {
            if (y > 278) novaPagina();
            if (i % 2 === 1) { cor(FUNDO, 'fill'); doc.rect(M, y, D - M, 6.2, 'F'); }
            const dias = diasEmAberto(f);
            const corDias = (faixas.find(fx => dias >= fx.de && dias <= fx.ate) || faixas[0]).cor;
            cor(TXT); fonte(8, 'bold'); doc.text(f.codigo || `#${f.id}`, col.cod, y + 4.2);
            fonte(8);
            const comp = f.periodoInicio ? `${formatDateBr(f.periodoInicio)} a ${formatDateBr(f.periodoFim || f.periodoInicio)}` : '—';
            doc.text(comp, col.comp, y + 4.2);
            doc.text(formatDateBr(f.criadoEm), col.emis, y + 4.2);
            cor(corDias); fonte(8, 'bold'); doc.text(String(dias), col.dias, y + 4.2);
            cor(TXT); fonte(8); doc.text(f.asaas_url || f.asaas_payment_id ? 'Asaas' : '—', col.cob, y + 4.2);
            doc.text(f.notificacao_zap ? 'WhatsApp' : '—', col.env, y + 4.2);
            fonte(8, 'bold'); doc.text(formatCurrency(f.valorTotal), col.val, y + 4.2, { align: 'right' });
            y += 6.2;
        });
        cor(LINHA, 'draw'); doc.setLineWidth(0.2); doc.line(M, y, D, y);
        y += 2;
    });

    // Total geral
    if (y > 268) novaPagina();
    y += 3;
    cor(NAVY, 'fill'); doc.roundedRect(M, y, D - M, 11, 1.5, 1.5, 'F');
    cor([255, 255, 255]); fonte(9.5, 'bold'); doc.text(`TOTAL A RECEBER  ·  ${abertas.length} fatura${abertas.length === 1 ? '' : 's'}`, M + 4, y + 7.2);
    cor(OURO); fonte(12, 'bold'); doc.text(formatCurrency(total), D - 4, y + 7.4, { align: 'right' });

    // Rodapé em todas as páginas
    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
        doc.setPage(i);
        cor(LINHA, 'draw'); doc.setLineWidth(0.2); doc.line(M, 287, D, 287);
        cor(CINZA); fonte(7);
        doc.text(`Gerado por ${currentSession ? currentSession.nome : 'Sistema'} em ${formatDateTimeBr(new Date().toISOString())}`, M, 291.5);
        doc.text(`Página ${i} de ${paginas}`, D, 291.5, { align: 'right' });
    }

    doc.save(`faturas_em_aberto_${hoje}.pdf`);
    showToast(`Relatório gerado: ${abertas.length} faturas em aberto, ${formatCurrency(total)} a receber.`, "success");
    logAudit("Relatório Faturas em Aberto", `Gerou relatório de faturas em aberto: ${abertas.length} faturas, ${formatCurrency(total)}.`);
}

function gerarRelatorioContas() {
    if (!window.jspdf) { showToast("Biblioteca de PDF não carregada. Recarregue a página.", "error"); return; }
    if (!contasCompetenciaSel) contasCompetenciaSel = hojeLocalStr().substring(0, 7);

    const contasDoMes = db.contas_pagar
        .filter(c => c.unidadeId === activeUnitId)
        .filter(c => competenciaMes(c) === contasCompetenciaSel)
        .slice()
        .sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));

    if (contasDoMes.length === 0) { showToast(`Nenhuma conta em ${mesLabelPt(contasCompetenciaSel)}.`, "info"); return; }

    const val = c => Number(c.valor) || 0;
    const soma = arr => arr.reduce((s, c) => s + val(c), 0);
    const pagas = contasDoMes.filter(c => statusConta(c) === 'paga');
    const vencidas = contasDoMes.filter(c => statusConta(c) === 'vencida');
    const aPagar = contasDoMes.filter(c => statusConta(c) === 'a_pagar');

    const meta = [
        `Competencia: ${mesLabelPt(contasCompetenciaSel)}    Contas: ${contasDoMes.length}`,
        `Total: ${formatCurrency(soma(contasDoMes))}   |   Pagas: ${formatCurrency(soma(pagas))}   |   A pagar: ${formatCurrency(soma(aPagar))}   |   Vencidas: ${formatCurrency(soma(vencidas))}`
    ];

    const { doc, y: startY } = relatorioNovoPdf("Relatorio de Contas a Pagar", meta);
    let y = startY;
    const header = () => {
        doc.setFont("Helvetica", "bold"); doc.setFontSize(8);
        doc.text("Vencimento", 14, y);
        doc.text("Descricao", 40, y);
        doc.text("Categoria", 96, y);
        doc.text("Fornecedor", 128, y);
        doc.text("Status", 158, y);
        doc.text("Valor", 196, y, { align: 'right' });
        doc.line(14, y + 1.5, 196, y + 1.5);
        y += 6;
        doc.setFont("Helvetica", "normal");
    };
    header();

    const stTxt = { paga: 'Paga', vencida: 'Vencida', a_pagar: 'A pagar' };
    doc.setFontSize(8);
    contasDoMes.forEach(c => {
        if (y > 282) { doc.addPage(); y = 20; header(); }
        doc.text(c.vencimento ? formatDateBr(c.vencimento) : '—', 14, y);
        doc.text(truncarTexto(c.descricao, 30), 40, y);
        doc.text(truncarTexto(c.categoria, 16), 96, y);
        doc.text(truncarTexto(c.fornecedor, 16), 128, y);
        doc.text(stTxt[statusConta(c)] || '', 158, y);
        doc.text(formatCurrency(c.valor), 196, y, { align: 'right' });
        y += 5.5;
    });

    doc.line(14, y, 196, y); y += 6;
    doc.setFont("Helvetica", "bold"); doc.setFontSize(9);
    doc.text(`TOTAL ${mesLabelPt(contasCompetenciaSel).toUpperCase()} (${contasDoMes.length} contas)`, 14, y);
    doc.text(formatCurrency(soma(contasDoMes)), 196, y, { align: 'right' });

    doc.save(`relatorio_contas_${contasCompetenciaSel}.pdf`);
    showToast("Relatório gerado com sucesso!", "success");
    logAudit("Relatório Contas", `Gerou relatório de contas — ${mesLabelPt(contasCompetenciaSel)} (${contasDoMes.length} contas).`);
}

async function deleteOS(osId) {
    const isAllowed = isMasterSession() || (currentSession && (currentSession.role === 'admin' || currentSession.role === 'gerente' || currentSession.nome.includes('Ricardo')));
    if (!isAllowed) {
        showToast("Erro: Apenas administradores ou operadores Master podem excluir ordens de serviço.", "error");
        return;
    }

    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) {
        showToast("Ordem de Servico nao localizada.", "error");
        return;
    }

    if (os.faturaId) {
        const fat = db.faturas.find(f => f.id === os.faturaId);
        showToast(`Esta OS está na fatura ${fat ? fat.codigo : '#' + os.faturaId}. Cancele a OS (ela sai da fatura) em vez de excluir.`, "error");
        return;
    }

    // Verificar se algum movimento desta OS está em um caixa fechado
    const movsRelacionados = db.caixa_movimentos.filter(m => m.osId === os.id);
    const temCaixaFechado = movsRelacionados.some(m => {
        const caixa = db.caixa_diario.find(c => c.id === m.caixaId);
        return caixa && caixa.status === 'fechado';
    });

    if (temCaixaFechado) {
        showToast("Erro: Esta OS possui movimentações financeiras vinculadas a um Caixa Diário FECHADO. Reabra o caixa antes de prosseguir.", "error");
        return;
    }

    if (confirm("ATENCAO: Tem certeza que deseja EXCLUIR DEFINITIVAMENTE a OS " + os.numero + " (Placa: " + os.placa + ")?\n\nIsso também removerá as vistorias, seções, fotos e lançamentos de caixa vinculados. Esta ação não poderá ser desfeita.")) {
        try {
            const cautelares = db.cautelares.filter(c => c.osId === os.id);
            const cautelarIds = cautelares.map(c => c.id);

            // 1. Deletar fotos e seções associadas localmente
            for (const c of cautelares) {
                const secoes = db.cautelares_secoes.filter(s => s.cautelarId === c.id);
                const secaoIds = secoes.map(s => s.id);
                db.cautelares_fotos = db.cautelares_fotos.filter(f => !secaoIds.includes(f.secaoId));
                db.cautelares_secoes = db.cautelares_secoes.filter(s => s.cautelarId !== c.id);
            }

            // 2. Deletar cautelares e lançamentos de caixa locais
            db.cautelares = db.cautelares.filter(c => c.osId !== os.id);
            db.caixa_movimentos = db.caixa_movimentos.filter(m => m.osId !== os.id);

            // 3. Sincronizar exclusão com o Supabase online
            if (window.useSupabase) {
                await sbDeleteWhere('caixa_movimentos', 'osId', os.id);
                for (const cId of cautelarIds) {
                    const { data: secoes } = await supabaseClient.from('cautelares_secoes').select('id').eq('cautelarId', cId);
                    if (secoes && secoes.length > 0) {
                        for (const sec of secoes) {
                            await supabaseClient.from('cautelares_fotos').delete().eq('secaoId', sec.id);
                        }
                    }
                    await supabaseClient.from('cautelares_secoes').delete().eq('cautelarId', cId);
                    await supabaseClient.from('cautelares').delete().eq('id', cId);
                }
            }

            // 4. Deletar a própria OS
            await dbSave('ordens_servico', null, 'delete', os.id);

            showToast("OS " + os.numero + " e seus lançamentos de caixa/vistorias foram excluídos!", "success");
            logAudit("Exclusao OS", "Excluiu permanentemente a OS " + os.numero + " (Placa: " + os.placa + ").");

            // 5. Recarregar todos os painéis afetados
            renderOSPipeline();
            renderHistorico();
            if (document.getElementById('caixa-mov-tbody')) {
                renderCaixaPage();
            }
            if (typeof saveDatabase === 'function') saveDatabase();
        } catch (err) {
            console.error(err);
            showToast("Erro ao excluir OS e vistorias vinculadas.", "error");
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
    if (document.getElementById('os-veiculo-tipo')) document.getElementById('os-veiculo-tipo').value = parentOs.veiculoTipo || '';
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

// Opções de pagamento do formulário de OS (a reapresentação troca por "Isento")
function restaurarOpcoesPagamentoOS() {
    const paymentSelect = document.getElementById('os-pagamento');
    if (!paymentSelect) return;
    paymentSelect.innerHTML = `
        <option value="pix">Pix (Transferência Online)</option>
        <option value="debito">Cartão de Débito</option>
        <option value="credito">Cartão de Crédito à Vista</option>
        <option value="credito_parcelado">Crédito Parcelado</option>
        <option value="especie">Dinheiro (Espécie)</option>
        <option value="dividido">Dividido em 2 formas</option>
        <option value="faturamento" id="opt-pagamento-faturamento" disabled>Faturamento Mensal (Apenas parceiros habilitados)</option>
    `;
}

// Lançamentos de caixa da venda de uma OS nova (sem osId: o banco preenche)
function movimentosDaVendaOS(os, caixa) {
    if (os.reapresentacaoOrigemID || os.formaPagamento === 'isento') return [];
    const base = {
        caixaId: caixa.id,
        tipo: "entrada",
        data: new Date().toISOString(),
        operador: currentSession.nome,
        faturaId: null
    };
    const servico = (os.servicoNome || 'Vistoria').split(' — ')[0];
    if (os.formaPagamento === 'dividido') {
        const partes = divisaoPagamento(os) || [];
        return partes.map((part, i) => ({
            ...base,
            valor: part.valor,
            formaPagamento: part.forma,
            descricao: `[DIVIDIDO ${i + 1}/2] Serviço ${servico} (Placa: ${os.placa})`
        }));
    }
    // A OS faturada também é registrada no caixa do dia (conferência com o
    // DETRAN), mas não conta como dinheiro recebido: ver movEhRecebimento.
    return [{ ...base, valor: os.valor, formaPagamento: os.formaPagamento, descricao: `Serviço ${servico} (Placa: ${os.placa})` }];
}

async function confirmContratoAndSaveOS() {
    if (!window.pendingOS) return;
    // Trava contra clique duplo: cada clique criaria uma OS
    if (window.__salvandoOS) return;
    const btnConfirmar = document.getElementById('btn-confirmar-contrato');

    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) {
        showToast("Erro: O caixa foi fechado durante a operação.", "error");
        return;
    }

    window.__salvandoOS = true;
    if (btnConfirmar) btnConfirmar.disabled = true;
    const os = { ...window.pendingOS };
    try {
        // 1. O banco reserva o id; o contrato já sai com o número definitivo
        const { data: idReservado, error: erroId } = await supabaseClient.rpc('reservar_id_os');
        if (erroId) throw erroId;
        os.id = Number(idReservado);
        os.numero = generateOSNumber(os.id);
        if (os.pago) os.status = "paga";
        os.contratoAceitoEm = new Date().toISOString();
        os.contratoTexto = generateContractText(os);
        os.contratoHash = generateSignatureHash(os.contratoTexto);

        // 2. OS, lançamentos de caixa e marca da reapresentação numa transação só
        const { data: criado, error } = await supabaseClient.rpc('criar_os', {
            p_os: prepareRecordForDb('ordens_servico', os),
            p_movimentos: movimentosDaVendaOS(os, activeCaixa)
        });
        if (error) throw error;

        const osSalva = prepareRecordFromDb('ordens_servico', criado.os);
        (criado.movimentos || []).forEach(m => db.caixa_movimentos.unshift(prepareRecordFromDb('caixa_movimentos', m)));
        if (osSalva.reapresentacaoOrigemID) {
            const original = db.ordens_servico.find(o => o.id === osSalva.reapresentacaoOrigemID);
            if (original) original.reapresentadaData = new Date().toISOString();
        }
        db.ordens_servico.unshift(osSalva);
        window.pendingOS = null;

        showToast(`O.S. registrada e contrato assinado! Código: ${osSalva.numero}`, "success");
        logAudit("Abertura OS", `Abriu a ordem ${osSalva.numero} com contrato firmado (Hash: ${osSalva.contratoHash}).`);

        closeContratoModal();
        printContract(osSalva);
        saveOSRecurringSolicitor(osSalva);
        clearOSForm();
        renderAtendimentoPage();
        if (typeof window.syncDetranFloatingPayable === 'function') {
            window.syncDetranFloatingPayable().catch(err => console.error("[DETRAN Sincronizador] Erro:", err));
        }
    } catch (e) {
        console.error("Erro ao confirmar contrato e salvar O.S.:", e);
        const semRede = typeof erroDeRede === 'function' && erroDeRede(e);
        showToast(semRede
            ? "Sem conexão: a O.S. NÃO foi registrada. Verifique a internet e confirme de novo."
            : "A O.S. não foi registrada: " + (e.message || e), "error");
    } finally {
        window.__salvandoOS = false;
        if (btnConfirmar) btnConfirmar.disabled = false;
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
async function openContratoFirmadoModal(osId) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;

    // O texto do contrato não vem no carregamento inicial. Buscar o original
    // importa aqui: o gerado na hora pode divergir do que o cliente assinou,
    // se o modelo mudou depois. É o texto assinado que tem valor.
    if (!os.contratoTexto && os.temContrato && typeof carregarCampoPesado === 'function') {
        try {
            await carregarCampoPesado('ordens_servico', osId, 'contratoTexto');
        } catch (e) {
            showToast("Não foi possível carregar o contrato assinado. Exibindo o modelo atual.", "warning");
        }
    }

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

// Entrada que é dinheiro recebido de fato. A OS faturada fica registrada no
// caixa do dia do atendimento só para conferência com o DETRAN; o dinheiro dela
// entra uma única vez, na baixa da fatura. Contar as duas dobrava a receita.
function movEhRecebimento(m) {
    return !!m && m.tipo === 'entrada' && m.formaPagamento !== 'faturamento' && m.formaPagamento !== 'isento';
}

// Retorna a data em formato YYYY-MM-DD considerando o fuso horário local do navegador
function getLocalDateString(dateInput) {
    return diaSP(dateInput);
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
    // Só o caixa de HOJE recebe as vendas de hoje. Um caixa de outro dia
    // esquecido aberto recebia tudo e bagunçava os dois fechamentos; ele é
    // avisado na tela do caixa (caixasAbertosAntigos) para ser fechado.
    const hoje = getLocalDateString(new Date());
    return db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.data === hoje && c.status === "aberto") || null;
}

function caixasAbertosAntigos() {
    const hoje = getLocalDateString(new Date());
    return db.caixa_diario
        .filter(c => c.unidadeId === activeUnitId && c.status === "aberto" && c.data < hoje)
        .sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

// Auto-sincronização retroativa de lançamentos de caixa pendentes (Item D)
async function autoSyncMissingOSMovements() {
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;
    if (window.__autoSyncCaixa) return;   // uma rodada por vez
    window.__autoSyncCaixa = true;
    try {
        const todayStr = getOperativeDate();
        const candidatas = db.ordens_servico.filter(os =>
            getLocalDateString(os.criadoEm) === todayStr &&
            os.unidadeId === activeCaixa.unidadeId &&
            os.status !== 'cancelada' &&
            os.formaPagamento !== 'isento' &&
            !os.reapresentacaoOrigemID &&
            os.id > 0 &&
            !db.caixa_movimentos.some(m => m.osId === os.id));
        if (candidatas.length === 0) return;

        // O cache deste aparelho pode estar atrasado: confere no banco quais
        // OS já têm lançamento (feito por outro aparelho) antes de criar.
        const { data: noBanco, error } = await supabaseClient.from('caixa_movimentos')
            .select('*').in('osId', candidatas.map(o => o.id));
        if (error) { console.warn('Auto-sincronização do caixa adiada:', error.message); return; }
        (noBanco || []).forEach(m => {
            if (!db.caixa_movimentos.some(x => x.id === m.id)) db.caixa_movimentos.unshift(prepareRecordFromDb('caixa_movimentos', m));
        });
        const comLancamento = new Set((noBanco || []).map(m => m.osId));

        for (const os of candidatas) {
            if (comLancamento.has(os.id)) continue;
            console.log(`⚠️ OS ${os.numero} de hoje não possui lançamento no caixa. Sincronizando...`);
            for (const mov of movimentosDaVendaOS(os, activeCaixa)) {
                const { data: inserido, error: e2 } = await supabaseClient.from('caixa_movimentos')
                    .insert({ ...mov, osId: os.id, data: os.criadoEm, operador: os.criadoPor || 'Sistema' }).select().single();
                if (e2) {
                    // 23505: outro aparelho lançou no mesmo instante (regra do banco)
                    if (e2.code !== '23505') console.error(`Erro ao auto-sincronizar OS ${os.numero}:`, e2.message);
                    continue;
                }
                db.caixa_movimentos.unshift(prepareRecordFromDb('caixa_movimentos', inserido));
            }
        }
    } catch (err) {
        console.error('Erro na auto-sincronização do caixa:', err);
    } finally {
        window.__autoSyncCaixa = false;
    }
}

async function renderCaixaPage() {
    if (typeof renderPendencias === 'function') renderPendencias();
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
        db.parceiros.filter(p => p.usaFaturamento).map(p => `<option value="${p.id}">${escHtml(p.nome)}</option>`).join('');

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

    // Caixa de outro dia esquecido aberto: precisa ser fechado no dia dele
    const antigos = window.modoDiaReaberto ? [] : caixasAbertosAntigos();
    if (antigos.length) {
        statusBadgeContainer.innerHTML += antigos.map(c => `
            <div style="margin-top:8px; padding:8px 12px; border-radius:6px; background:rgba(239,68,68,.12); color:var(--danger); font-size:12px; font-weight:600;">
                O caixa de ${formatDateBr(c.data)} ficou aberto. Ele não recebe as vendas de hoje; feche-o no dia dele.
                <button class="btn btn-danger btn-sm" style="margin-left:8px;" onclick="enterReopenMode(${c.id})"><i class="ri-lock-line"></i> Ir fechar</button>
            </div>`).join('');
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
                    'Authorization': `Bearer ${sbAuthToken()}`
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
        const cashPayments = movsUltimo.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
        const cashSangrias = movsUltimo.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
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
    const unidadeNomeAbre = (db.unidades.find(u => u.id === activeUnitId) || {}).nome || 'Unidade';
    const horaAbre = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    notificarAdmins('🟢 Caixa aberto', `${unidadeNomeAbre} — aberto por ${currentSession.nome} às ${horaAbre}.`);
    renderCaixaPage();
}

// Resumo de vendas de um caixa. "Recebido" é o dinheiro que entrou (pix,
// espécie, cartão...). "A faturar" são as vistorias de parceiros com
// faturamento mensal: o dinheiro delas entra depois, na baixa da fatura.
// "Vendido" é a soma dos dois: o movimento do dia.
function resumoVendasCaixa(caixa) {
    const movs = db.caixa_movimentos.filter(m => m.caixaId === caixa.id);
    const soma = lista => lista.reduce((t, m) => somaCentavos(t, m.valor), 0);
    const recebido = soma(movs.filter(movEhRecebimento));
    const aFaturar = soma(movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'faturamento'));
    const saidas = soma(movs.filter(m => m.tipo === 'saida'));
    return { recebido, aFaturar, saidas, vendido: somaCentavos(recebido, aFaturar), resultado: (paraCentavos(recebido) - paraCentavos(saidas)) / 100 };
}

function renderCaixaKPIs(activeCaixa) {
    const kpiGrid = document.getElementById('caixa-kpis');
    if (!activeCaixa) {
        kpiGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h4>Caixa Fechado hoje para esta unidade.</h4></div>`;
        return;
    }

    const movs = db.caixa_movimentos.filter(m => m.caixaId === activeCaixa.id);
    
    const totalEntradas = movs.filter(movEhRecebimento).reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalSaidas = movs.filter(m => m.tipo === 'saida').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    
    // Physical cash balance (Float + cash payments - cash sangrias)
    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const finalCashInDrawer = activeCaixa.saldoAbertura + cashPayments - cashSangrias;

    const totalBalance = totalEntradas - totalSaidas;
    const resumo = resumoVendasCaixa(activeCaixa);

    kpiGrid.innerHTML = `
        <div class="kpi-card kpi-blue">
            <div class="kpi-icon"><i class="ri-shopping-bag-3-line"></i></div>
            <div class="kpi-value">${formatCurrency(resumo.vendido)}</div>
            <div class="kpi-label">Vendas do Dia</div>
        </div>
        <div class="kpi-card kpi-green">
            <div class="kpi-icon"><i class="ri-add-line"></i></div>
            <div class="kpi-value">${formatCurrency(totalEntradas)}</div>
            <div class="kpi-label">Recebido no Caixa</div>
        </div>
        <div class="kpi-card kpi-purple">
            <div class="kpi-icon"><i class="ri-file-list-3-line"></i></div>
            <div class="kpi-value">${formatCurrency(resumo.aFaturar)}</div>
            <div class="kpi-label">A Faturar (Parceiros)</div>
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
        <div class="kpi-card kpi-blue">
            <div class="kpi-icon"><i class="ri-funds-line"></i></div>
            <div class="kpi-value" style="color: ${totalBalance >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(totalBalance)}</div>
            <div class="kpi-label">Resultado em Caixa</div>
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
    
    // Injetar vistorias isentas do dia no caixa para correspondência física com o DETRAN
    const isentas = db.ordens_servico.filter(os => {
        const osDateLocal = getLocalDateString(os.criadoEm);
        const isSameDay = osDateLocal === activeCaixa.data;
        return isSameDay && 
               os.unidadeId === activeCaixa.unidadeId && 
               os.status !== 'cancelada' && 
               os.formaPagamento === 'isento';
    });

    const simulatedMovs = isentas.map(os => ({
        id: `isenta-${os.id}`,
        caixaId: activeCaixa.id,
        tipo: 'entrada',
        valor: 0,
        descricao: `Vistoria Isenta: ${(os.servicoNome || 'VISTORIA').split(' — ')[0]} (Placa: ${os.placa})`,
        formaPagamento: 'isento',
        data: os.criadoEm,
        operador: os.criadoPor || 'Sistema',
        osId: os.id,
        faturaId: null,
        isSimulated: true
    }));

    const allMovs = [...movs, ...simulatedMovs].sort((a, b) => new Date(b.data) - new Date(a.data));
    
    if (allMovs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum lançamento realizado hoje.</td></tr>';
        return;
    }

    tbody.innerHTML = allMovs.map(m => {
        const time = new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const valEntrada = m.tipo === 'entrada' ? formatCurrency(m.valor) : '—';
        const valSaida = m.tipo === 'saida' ? formatCurrency(m.valor) : '—';
        const isSystem = m.osId || m.faturaId;

        return `
            <tr>
                <td>${time}</td>
                <td>
                    <strong>${escHtml(m.descricao)}</strong>
                    ${isSystem ? `<br><small style="color: var(--accent);">Integrado pelo Sistema</small>` : ''}
                </td>
                <td><span style="text-transform: uppercase;">${escHtml(m.formaPagamento)}</span></td>
                <td style="text-align: right; color: var(--success); font-weight: 600;">${valEntrada}</td>
                <td style="text-align: right; color: var(--danger); font-weight: 600;">${valSaida}</td>
                <td>
                    ${(!isSystem && !m.isSimulated) ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteCaixaMov(${m.id})" title="Excluir Lançamento"><i class="ri-delete-bin-line"></i></button>` : '—'}
                </td>
            </tr>
        `;
    }).join('');
}

function adjustMovForm(type) {
    const pGroup = document.getElementById('group-mov-parceiro');
    const fGroup = document.getElementById('group-mov-pag');
    const nGroup = document.getElementById('group-mov-natureza');
    if (type === 'entrada') {
        pGroup.style.display = 'block';
        if (nGroup) nGroup.style.display = 'none';
        adjustMovNatureza(null);
    } else {
        pGroup.style.display = 'none';
        if (nGroup) nGroup.style.display = 'block';
        const nat = document.getElementById('mov-natureza');
        adjustMovNatureza(nat ? nat.value : 'despesa');
    }
}

// Quanto de uma conta a pagar já foi quitado por saídas do caixa.
function totalPagoPorCaixa(contaId) {
    if (!contaId) return 0; // sem conta não há o que somar: movimento sem
                            // vínculo também tem contaPagarId nulo
    return (db.caixa_movimentos || [])
        .filter(m => m.tipo === 'saida' && m.contaPagarId === contaId)
        .reduce((sum, m) => somaCentavos(sum, m.valor), 0);
}

// Mostra e preenche o seletor de conta quando a saída é pagamento de conta.
function adjustMovNatureza(natureza) {
    const cGroup = document.getElementById('group-mov-conta');
    const select = document.getElementById('mov-conta-pagar');
    if (!cGroup || !select) return;

    if (natureza !== 'pagamento_conta') {
        cGroup.style.display = 'none';
        select.value = '';
        return;
    }

    cGroup.style.display = 'block';
    const abertas = (db.contas_pagar || [])
        .filter(c => c.unidadeId === activeUnitId && !c.pago)
        .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));

    select.innerHTML = '<option value="">Selecione a conta...</option>' + abertas.map(c => {
        const jaPago = totalPagoPorCaixa(c.id);
        const falta = Number(c.valor) - jaPago;
        const venc = c.vencimento ? String(c.vencimento).substring(8, 10) + '/' + String(c.vencimento).substring(5, 7) : '';
        const parcial = jaPago > 0 ? ` — já pago ${formatCurrency(jaPago)}, falta ${formatCurrency(falta)}` : '';
        return `<option value="${c.id}">${escHtml(c.descricao)} (venc. ${venc}) — ${formatCurrency(c.valor)}${parcial}</option>`;
    }).join('');

    if (abertas.length === 0) {
        select.innerHTML = '<option value="">Nenhuma conta em aberto nesta unidade</option>';
    }
}

async function submitCaixaMov(event) {
    event.preventDefault();
    const activeCaixa = getTodayOpenCaixa();
    if (!activeCaixa) return;

    const tipo = document.getElementById('mov-tipo').value;
    const valor = lerValorMonetario(document.getElementById('mov-valor').value);
    const desc = document.getElementById('mov-desc').value.trim();
    const forma = document.getElementById('mov-forma-pag').value;
    const partnerId = parseInt(document.getElementById('mov-parceiro-select').value);
    // Só saída tem natureza. Entrada fica null.
    const natEl = document.getElementById('mov-natureza');
    const natureza = tipo === 'saida' ? ((natEl && natEl.value) || 'despesa') : null;
    const contaEl = document.getElementById('mov-conta-pagar');
    const contaPagarId = (natureza === 'pagamento_conta' && contaEl && contaEl.value)
        ? parseInt(contaEl.value) : null;

    if (natureza === 'pagamento_conta' && !contaPagarId) {
        showToast("Selecione qual conta está sendo paga.", "error");
        return;
    }

    if (valor === null || valor <= 0) {
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
        faturaId: null,
        natureza: natureza,
        contaPagarId: contaPagarId
    };

    // Aguarda a gravação: só depois dela o movimento entra no cache local, e é
    // do cache que totalPagoPorCaixa soma. Sem o await, o total sairia errado.
    await dbSave('caixa_movimentos', newMov, 'insert');

    // Baixa automática: quando a soma dos pagamentos pelo caixa cobre a conta.
    if (contaPagarId) {
        const conta = db.contas_pagar.find(c => c.id === contaPagarId);
        if (conta && !conta.pago) {
            const totalPago = totalPagoPorCaixa(contaPagarId);
            if (totalPago >= Number(conta.valor) - 0.005) {
                const hoje = diaSP();
                dbSave('contas_pagar', { pago: true, pagoEm: hoje }, 'update', contaPagarId);
                showToast(`Conta "${conta.descricao}" quitada e baixada automaticamente.`, "success");
                logAudit("Baixa automática", `Conta ${conta.descricao} quitada por pagamentos do caixa (${formatCurrency(totalPago)}).`);
            } else {
                const falta = Number(conta.valor) - totalPago;
                showToast(`Pagamento parcial registrado. Faltam ${formatCurrency(falta)} para quitar "${conta.descricao}".`, "info");
            }
        }
    }

    if (natureza === 'transferencia') {
        showToast("Depósito registrado. O dinheiro saiu da gaveta, mas não conta como despesa.", "success");
    } else if (natureza !== 'pagamento_conta') {
        showToast("Movimentação manual lançada com sucesso!", "success");
    }
    logAudit("Movimentação Caixa", `Lançou ${tipo.toUpperCase()} de ${formatCurrency(valor)}: ${finalDesc}.`);

    document.getElementById('caixa-mov-form').reset();
    adjustMovForm('saida');
    renderCaixaPage();
}

async function deleteCaixaMov(id) {
    const index = db.caixa_movimentos.findIndex(m => m.id === id);
    if (index === -1) return;

    const mov = db.caixa_movimentos[index];
    const caixa = db.caixa_diario.find(c => c.id === mov.caixaId);
    if (caixa && caixa.status === 'fechado') {
        showToast("Este lançamento é de um caixa fechado e não pode ser removido.", "error");
        return;
    }
    if (!confirm(`Remover o lançamento "${mov.descricao}" (${formatCurrency(Number(mov.valor))})?`)) return;
    try {
        await dbSave('caixa_movimentos', null, 'delete', id);
    } catch (err) {
        showToast("O lançamento NÃO foi removido: " + (err.message || err), "error");
        return;
    }

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

    // Injetar vistorias isentas do dia no caixa para correspondência física com o DETRAN
    const isentas = db.ordens_servico.filter(os => {
        const osDateLocal = getLocalDateString(os.criadoEm);
        const isSameDay = osDateLocal === c.data;
        return isSameDay && 
               os.unidadeId === c.unidadeId && 
               os.status !== 'cancelada' && 
               os.formaPagamento === 'isento';
    });

    const simulatedMovs = isentas.map(os => ({
        id: `isenta-${os.id}`,
        caixaId: c.id,
        tipo: 'entrada',
        valor: 0,
        descricao: `Vistoria Isenta: ${(os.servicoNome || 'VISTORIA').split(' — ')[0]}`,
        formaPagamento: 'isento',
        data: os.criadoEm,
        operador: os.criadoPor || 'Sistema',
        osId: os.id,
        faturaId: null
    }));

    const allMovs = [...movs, ...simulatedMovs].sort((a, b) => new Date(a.data) - new Date(b.data));

    const entries = allMovs.filter(m => m.tipo === 'entrada');
    const exits = allMovs.filter(m => m.tipo === 'saida');

    const totalEntradas = entries.filter(movEhRecebimento).reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalSaidas = exits.reduce((sum, m) => somaCentavos(sum, m.valor), 0);

    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const estimatedCash = c.saldoAbertura + cashPayments - cashSangrias;
    const diff = c.saldoEspécieInformado - estimatedCash;

    const totalPix = entries.filter(m => m.formaPagamento === 'pix').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalEspecie = entries.filter(m => m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalDebito = entries.filter(m => m.formaPagamento === 'debito').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalCredito = entries.filter(m => m.formaPagamento === 'credito').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalCreditoParcelado = entries.filter(m => m.formaPagamento === 'credito_parcelado').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalFaturamento = db.ordens_servico
        .filter(o => o.unidadeId === c.unidadeId && getLocalDateString(o.criadoEm) === c.data && o.status !== 'cancelada' && o.formaPagamento === 'faturamento')
        .reduce((sum, o) => somaCentavos(sum, o.valor), 0);

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
    const resumoPdf = resumoVendasCaixa(c);
    doc.text(`Fundo Inicial (Abertura): ${formatCurrency(c.saldoAbertura)}`, 14, 60);
    doc.text(`Recebido no Caixa (+): ${formatCurrency(totalEntradas)}`, 14, 66);
    doc.text(`Total de Saidas (-): ${formatCurrency(totalSaidas)}`, 14, 72);
    doc.text(`Resultado em Caixa: ${formatCurrency(totalEntradas - totalSaidas)}`, 14, 78);
    doc.text(`A Faturar (parceiros): ${formatCurrency(resumoPdf.aFaturar)}`, 14, 84);
    doc.setFont("Helvetica", "bold");
    doc.text(`Vendas do Dia: ${formatCurrency(resumoPdf.vendido)}`, 14, 90);
    doc.setFont("Helvetica", "normal");

    doc.text(`Total Pix: ${formatCurrency(totalPix)}`, 110, 60);
    doc.text(`Total Dinheiro: ${formatCurrency(totalEspecie)}`, 110, 66);
    doc.text(`Total Debito: ${formatCurrency(totalDebito)}`, 110, 72);
    doc.text(`Total Credito Vista: ${formatCurrency(totalCredito)}`, 110, 78);
    doc.text(`Total Credito Parcelado: ${formatCurrency(totalCreditoParcelado)}`, 110, 84);
    doc.text(`Total Faturamento: ${formatCurrency(totalFaturamento)}`, 110, 90);
    doc.text(`Vistorias Isentas: ${isentas.length} vistorias`, 110, 96);
    doc.text(`Total Vistorias: ${entries.filter(m => m.osId).length} vistorias`, 110, 102);

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
    allMovs.forEach((m) => {
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

// ==========================================================
// AUDITORIA DO FECHAMENTO — confere o PDF do DETRAN contra as OS
// ----------------------------------------------------------
// O operador já anexa o relatório do Portal ECV para fechar o caixa. Em vez
// de só arquivar o PDF, o sistema lê e compara com o que foi registrado.
//
// O DETRAN cobra R$ 27,00 por LAUDO EMITIDO, qualquer que seja o resultado
// (aprovado, reprovado, bloqueado, cancelado, não enviado). Só o RETORNO é
// gratuito. Então cada laudo do relatório precisa ter uma OS correspondente,
// e cada OS de serviço ECV precisa ter saído no relatório.
// ==========================================================

const PDFJS_WORKER = 'js/vendor/pdfjs-3.11.174.worker.min.js';

// Linha do relatório: PLACA MARCA/MODELO DD/MM/AAAA HH:MM NOTA R$ VALOR [OBS] STATUS
const RE_LAUDO = /([A-Z]{3}\d[A-Z0-9]\d{2})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s+(\d+)\s+R\$\s*([\d.,]+)\s+(.*)$/;
const RE_PERIODO = /Per[íi]odo\s+de\s*:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i;

// Reconstrói as linhas do PDF agrupando os fragmentos de texto pela posição
// vertical. O getTextContent devolve pedaços soltos; sem reagrupar por Y, a
// linha da placa se mistura com a de cima e a regex não casa.
//
// IMPORTANTE: NÃO dá para agrupar por Y arredondado. No relatório real do
// Portal ECV, as colunas de valor (nº da nota, R$, status) são desenhadas
// ~1pt ACIMA das colunas de placa da MESMA linha (ex.: 737,45 vs 736,37).
// Arredondar jogava cada metade num grupo diferente e QUEBRAVA cada laudo em
// duas linhas — a regex nunca casava e a conferência lia zero laudos todo dia.
// Agora agrupamos por PROXIMIDADE: pedaços dentro de uma tolerância vertical
// (bem menor que o ~13pt entre linhas de verdade) entram na mesma linha.
async function extrairLinhasPdf(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdfjsLib indisponível');
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const linhas = [];
    for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();

        const pedacos = content.items
            .filter(it => it.str && it.str.trim())
            .map(it => ({
                y: it.transform[5],                       // posição vertical
                x: it.transform[4],                       // posição horizontal
                str: it.str,
                h: Math.abs(it.height || it.transform[3] || 8)
            }))
            .sort((a, b) => b.y - a.y);                    // de cima para baixo

        // Agrupa por proximidade vertical. A tolerância acompanha a altura da
        // fonte (metades da mesma linha ficam a ~1pt; linhas distam ~13pt),
        // com um piso para relatórios de fonte pequena.
        const grupos = [];
        pedacos.forEach(p => {
            const tol = Math.max(3, p.h * 0.6);
            const atual = grupos.length ? grupos[grupos.length - 1] : null;
            if (atual && Math.abs(atual.y - p.y) <= tol) {
                atual.itens.push(p);
            } else {
                grupos.push({ y: p.y, itens: [p] });
            }
        });

        grupos.forEach(g => {
            g.itens.sort((a, b) => a.x - b.x);
            linhas.push(g.itens.map(p => p.str).join(' ').replace(/\s+/g, ' ').trim());
        });
    }
    return linhas;
}

// Assinaturas do comprovante de fechamento que o PRÓPRIO sistema gera.
// O operador costuma anexar esse PDF por engano no lugar do relatório do
// DETRAN ("Laudos realizados no período", exportado do Portal ECV). Como ele
// não tem laudos no layout esperado, a conferência silenciosamente não roda.
// Detectar aqui permite avisar o operador qual é o arquivo certo.
const MARCADORES_COMPROVANTE_SISTEMA = [
    'DEMONSTRATIVO FINANCEIRO',
    'RESUMO FINANCEIRO E CONCILIACAO',
    'RESUMO FINANCEIRO E CONCILIAÇÃO',
    'DETALHE DOS LANCAMENTOS',
    'DETALHE DOS LANÇAMENTOS',
    'ASSINATURA DO OPERADOR',
    'ASSINATURA DO SUPERVISOR'
];

function pareceComprovanteDoSistema(linhas) {
    const texto = (linhas || []).join(' ').toUpperCase();
    let achados = 0;
    for (const m of MARCADORES_COMPROVANTE_SISTEMA) {
        if (texto.includes(m)) achados++;
        if (achados >= 2) return true; // dois marcadores já são conclusivos
    }
    return false;
}

// Extrai os laudos e o período coberto pelo relatório.
async function lerRelatorioDetran(arrayBuffer) {
    const linhas = await extrairLinhasPdf(arrayBuffer);
    const documentoDoSistema = pareceComprovanteDoSistema(linhas);
    const laudos = [];
    let periodo = null;
    linhas.forEach(bruta => {
        // Normaliza aqui também: o parser precisa funcionar com linha vinda de
        // qualquer origem, não só do extrairLinhasPdf. Um \r no fim quebra o
        // ancoramento da regex, porque "." não casa carriage return em JS.
        const linha = String(bruta || '').replace(/\s+/g, ' ').trim();
        if (!linha) return;
        if (!periodo) {
            const mp = linha.match(RE_PERIODO);
            if (mp) periodo = { de: mp[1], ate: mp[2] };
        }
        const m = linha.match(RE_LAUDO);
        if (m) {
            const resto = (m[7] || '').trim();
            const retorno = /^Retorno/i.test(resto);
            laudos.push({
                placa: m[1],
                modelo: m[2].trim(),
                data: m[3],
                hora: m[4],
                nota: m[5],
                valor: parseFloat(m[6].replace(/\./g, '').replace(',', '.')),
                retorno: retorno,
                status: retorno ? resto.replace(/^Retorno/i, '').trim() : resto
            });
        }
    });
    return { laudos, periodo, totalLinhas: linhas.length, documentoDoSistema };
}

// dd/mm/aaaa -> aaaa-mm-dd
function dataBrParaISO(d) {
    const p = String(d || '').split('/');
    return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : null;
}

// Conversão entre o padrão antigo e o Mercosul.
//
// A regra oficial: em ABC1234, o SEGUNDO dígito (5ª posição) vira letra pela
// ordem do alfabeto — 0=A, 1=B, 2=C, 3=D, 4=E, 5=F, 6=G, 7=H, 8=I, 9=J.
// Então ABC1234 e ABC1D34 são O MESMO VEÍCULO, não placas diferentes.
//
// Isso importa porque o sistema e o Portal ECV nem sempre gravam a placa no
// mesmo padrão. Sem esta conversão, o mesmo carro aparece dos dois lados da
// conferência como divergência: 15 das 20 "placas erradas" apuradas em julho
// e agosto de 2026 eram exatamente isto — carro certo, formato diferente.
const MERCOSUL_DIGITO_LETRA = ['A','B','C','D','E','F','G','H','I','J'];

// Forma canônica da placa: tudo vira Mercosul, para comparação.
function placaCanonica(v) {
    const p = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Padrão antigo (3 letras + 4 dígitos) converte; Mercosul fica como está
    if (/^[A-Z]{3}[0-9]{4}$/.test(p)) {
        return p.slice(0, 4) + MERCOSUL_DIGITO_LETRA[Number(p[4])] + p.slice(5);
    }
    return p;
}

// Mesmo veículo, ainda que escrito em padrões diferentes.
function mesmoVeiculo(a, b) {
    return placaCanonica(a) === placaCanonica(b);
}

// Distância de 1 caractere: identifica placa digitada errada.
function difereEmUmCaractere(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false;
    return d === 1;
}

// Compara o relatório com as OS do mesmo período e devolve as divergências.
function auditarRelatorioDetran(laudos, periodo, unidadeId) {
    const cobrados = laudos.filter(l => !l.retorno);
    const iniISO = periodo ? dataBrParaISO(periodo.de) : null;
    const fimISO = periodo ? dataBrParaISO(periodo.ate) : null;

    const osPeriodo = (db.ordens_servico || []).filter(o => {
        if (o.unidadeId !== unidadeId) return false;
        if (!servicoGeraLaudoDetran(o.servicoId)) return false;
        if (o.status === 'cancelada' || osEhRetornoDetran(o)) return false;
        if (!iniISO || !fimISO) return true; // sem período legível, compara tudo
        if (!o.criadoEm) return false;
        const iso = diaSP(o.criadoEm);
        return iso >= iniISO && iso <= fimISO;
    });

    // Compara pela forma canônica: o mesmo carro pode estar gravado no padrão
    // antigo de um lado e no Mercosul do outro. Ver placaCanonica.
    const norm = v => placaCanonica(v);

    // Comparação por QUANTIDADE, não por presença. Um mesmo veículo pode ter
    // dois laudos cobrados no mesmo dia — foi o caso da MCM1003 em 11/08/2026,
    // cancelada às 09:08 e reprovada às 09:21, as duas cobradas. Comparar só
    // "a placa existe nos dois lados" deixaria passar a segunda.
    const porPlacaDetran = new Map();
    cobrados.forEach(l => {
        const k = norm(l.placa);
        if (!porPlacaDetran.has(k)) porPlacaDetran.set(k, []);
        porPlacaDetran.get(k).push(l);
    });
    const porPlacaOS = new Map();
    osPeriodo.forEach(o => {
        const k = norm(o.placa);
        if (!porPlacaOS.has(k)) porPlacaOS.set(k, []);
        porPlacaOS.get(k).push(o);
    });

    const semOS = [];      // laudos cobrados sem OS correspondente
    const semLaudo = [];   // OS que não saíram no relatório
    porPlacaDetran.forEach((lista, placa) => {
        const sobra = lista.length - (porPlacaOS.get(placa) || []).length;
        if (sobra > 0) semOS.push(...lista.slice(-sobra));
    });
    porPlacaOS.forEach((lista, placa) => {
        const sobra = lista.length - (porPlacaDetran.get(placa) || []).length;
        if (sobra > 0) semLaudo.push(...lista.slice(-sobra));
    });

    // Cruza as sobras: placa que só difere por 1 caractere é erro de digitação,
    // não vistoria faltando.
    const typos = [];
    const laudosUsados = new Set();
    semOS.forEach(l => {
        const cand = semLaudo.find(o =>
            !typos.some(t => t.os === o) && difereEmUmCaractere(norm(o.placa), norm(l.placa)));
        if (cand) { typos.push({ os: cand, laudo: l }); laudosUsados.add(l); }
    });
    const osTypo = new Set(typos.map(t => t.os));

    // Conferência de VALOR: para o laudo que casa com uma OS do MESMO dia,
    // compara o valor cobrado. Combos ficam de fora (ver servicoEhCombo). O
    // mesmo dia evita cruzar o mesmo carro vistoriado em datas diferentes.
    const diaLocalDeOS = o => {
        return o.criadoEm ? diaSP(o.criadoEm) : null;
    };
    const osPorPlacaDia = new Map();
    osPeriodo.forEach(o => {
        const k = `${norm(o.placa)}|${diaLocalDeOS(o)}`;
        if (!osPorPlacaDia.has(k)) osPorPlacaDia.set(k, []);
        osPorPlacaDia.get(k).push(o);
    });
    const valoresDivergentes = [];
    const osValorUsada = new Set();
    cobrados.forEach(l => {
        const lista = osPorPlacaDia.get(`${norm(l.placa)}|${dataBrParaISO(l.data)}`);
        if (!lista) return;
        // Casa com uma OS não-combo ainda não usada; se só houver combo, pula
        // (diferença esperada). Placa já apontada como digitada errada também sai.
        const o = lista.find(x => !osValorUsada.has(x) && !osTypo.has(x) && !servicoEhCombo(x.servicoId));
        if (!o) return;
        const vOS = Number(o.valor) || 0;
        if (vOS > 0 && Math.abs(vOS - l.valor) >= 0.01) {
            valoresDivergentes.push({ os: o, laudo: l, valorOS: vOS, valorDetran: l.valor });
            osValorUsada.add(o);
        }
    });

    return {
        totalLaudos: laudos.length,
        retornos: laudos.length - cobrados.length,
        cobrados: cobrados.length,
        osRegistradas: osPeriodo.length,
        taxaPrevista: cobrados.length * 27.00,
        faltamNoSistema: semOS.filter(l => !laudosUsados.has(l)),
        naoEnviadasAoDetran: semLaudo.filter(o => !osTypo.has(o)),
        placasErradas: typos,
        valoresDivergentes
    };
}

// ==========================================================
// PENDÊNCIAS DE FECHAMENTO
// ----------------------------------------------------------
// O operador pode fechar com divergência, mas a divergência não some: fica
// gravada e é recontada a cada fechamento, todos os dias, até ser corrigida.
// A chave de deduplicação evita recriar a mesma pendência todo dia — o que
// sobe é o contador de vezes que ela foi ignorada.
// ==========================================================

function chavePendencia(tipo, ident) {
    return `${tipo}:${String(ident || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
}

// Converte o resultado da auditoria em pendências normalizadas.
function pendenciasDaAuditoria(auditoria, osAbertas) {
    const itens = [];

    (auditoria.faltamNoSistema || []).forEach(l => {
        itens.push({
            tipo: 'laudo_sem_os',
            chave: chavePendencia('laudo_sem_os', `${l.placa}${l.data}${l.hora}`),
            placa: l.placa,
            descricao: `Laudo cobrado pelo DETRAN em ${l.data} ${l.hora} (${l.status}) sem OS no sistema`,
            valorTaxa: 27.00,
            osId: null,
            osNumero: null
        });
    });

    (auditoria.naoEnviadasAoDetran || []).forEach(o => {
        itens.push({
            tipo: 'os_sem_laudo',
            chave: chavePendencia('os_sem_laudo', o.numero),
            placa: o.placa,
            descricao: `${o.numero} (${o.placa}, ${formatCurrency(o.valor)}) sem laudo no relatório — confira nesta ordem: o serviço está certo (cautelar não gera laudo), há OS duplicada, ou o laudo não foi enviado`,
            valorTaxa: 0,
            osId: o.id,
            osNumero: o.numero
        });
    });

    (auditoria.placasErradas || []).forEach(t => {
        itens.push({
            tipo: 'placa_errada',
            chave: chavePendencia('placa_errada', t.os.numero),
            placa: t.os.placa,
            descricao: `${t.os.numero} está com a placa ${t.os.placa}; no DETRAN é ${t.laudo.placa}`,
            valorTaxa: 0,
            osId: t.os.id,
            osNumero: t.os.numero
        });
    });

    (auditoria.valoresDivergentes || []).forEach(v => {
        itens.push({
            tipo: 'valor_divergente',
            chave: chavePendencia('valor_divergente', v.os.numero),
            placa: v.os.placa,
            descricao: `${v.os.numero} (${v.os.placa}): valor no sistema ${formatCurrency(v.valorOS)}, no DETRAN ${formatCurrency(v.valorDetran)}`,
            valorTaxa: 0,
            osId: v.os.id,
            osNumero: v.os.numero
        });
    });

    (osAbertas || []).forEach(o => {
        itens.push({
            tipo: 'os_aberta',
            chave: chavePendencia('os_aberta', o.numero),
            placa: o.placa,
            descricao: o.status === 'em_execucao'
                ? `${o.numero} (${o.placa}) com vistoria iniciada e não finalizada — emita o laudo ou cancele (fica fora do faturamento até lá)`
                : `${o.numero} (${o.placa}) continua em aberto — finalize ou cancele`,
            valorTaxa: 0,
            osId: o.id,
            osNumero: o.numero
        });
    });

    return itens;
}

function pendenciasAbertas(unidadeId) {
    return (db.pendencias_fechamento || [])
        .filter(p => p.unidadeId === unidadeId && !p.resolvida);
}

// Reavalia as pendências já gravadas: as que não aparecem mais na conferência
// de hoje foram corrigidas e são baixadas automaticamente.
async function resolverPendenciasCorrigidas(unidadeId, chavesAtuais, quem) {
    const abertas = pendenciasAbertas(unidadeId);
    const agora = new Date().toISOString();
    let resolvidas = 0;
    for (const p of abertas) {
        if (chavesAtuais.has(p.chave)) continue;
        // OS em aberto só sai da lista quando muda de status de verdade
        if (p.tipo === 'os_aberta') {
            const os = (db.ordens_servico || []).find(o => o.id === p.osId);
            if (os && os.status === 'aberta') continue;
        }
        try {
            await dbSave('pendencias_fechamento', {
                resolvida: true, resolvidaEm: agora, resolvidaPor: quem,
                resolvidaComo: 'Não apareceu mais na conferência do fechamento'
            }, 'update', p.id);
            resolvidas++;
        } catch (e) { console.error('[Pendências] Falha ao resolver:', e); }
    }
    return resolvidas;
}

// Grava as pendências de hoje: cria as novas, incrementa as que reapareceram.
async function registrarPendencias(unidadeId, itens, quem, dataFechamento) {
    // Procura pela chave em TODAS as pendências da unidade (abertas E resolvidas).
    // O índice único (unidadeId, chave) cobre as duas: inserir uma chave que já
    // existe resolvida dava "duplicate key" e entupia a fila de sincronização.
    // Se a divergência reaparece, a pendência resolvida é REABERTA.
    const todas = (db.pendencias_fechamento || []).filter(p => p.unidadeId === unidadeId);
    let novas = 0, repetidas = 0;
    for (const item of itens) {
        const existente = todas.find(p => p.chave === item.chave);
        try {
            if (existente) {
                const upd = {
                    vezesIgnorada: (Number(existente.vezesIgnorada) || 1) + 1,
                    ultimoFechamento: dataFechamento
                };
                if (existente.resolvida) {   // a divergência voltou: reabre
                    upd.resolvida = false;
                    upd.resolvidaEm = null;
                    upd.resolvidaPor = null;
                    upd.resolvidaComo = null;
                }
                await dbSave('pendencias_fechamento', upd, 'update', existente.id);
                repetidas++;
            } else {
                await dbSave('pendencias_fechamento', {
                    unidadeId: unidadeId,
                    tipo: item.tipo,
                    chave: item.chave,
                    placa: item.placa,
                    descricao: item.descricao,
                    valorTaxa: item.valorTaxa,
                    osId: item.osId,
                    osNumero: item.osNumero,
                    detectadaPor: quem,
                    primeiroFechamento: dataFechamento,
                    ultimoFechamento: dataFechamento,
                    vezesIgnorada: 1,
                    resolvida: false
                }, 'insert');
                novas++;
            }
        } catch (e) { console.error('[Pendências] Falha ao gravar:', e); }
    }
    return { novas, repetidas };
}

const ROTULO_PENDENCIA = {
    laudo_sem_os: 'Taxa paga sem OS',
    os_sem_laudo: 'OS sem laudo',
    placa_errada: 'Placa errada',
    valor_divergente: 'Valor diferente do DETRAN',
    os_aberta:    'OS em aberto'
};

const COR_PENDENCIA = {
    laudo_sem_os: 'var(--danger)',
    os_sem_laudo: 'var(--danger)',
    placa_errada: 'var(--warning, #B07206)',
    valor_divergente: 'var(--warning, #B07206)',
    os_aberta:    'var(--warning, #B07206)'
};

function renderPendencias() {
    const card = document.getElementById('card-pendencias');
    const tbody = document.getElementById('pendencias-tbody');
    const contador = document.getElementById('pendencias-contador');
    if (!card || !tbody) return;

    const verResolvidas = (document.getElementById('pendencias-ver-resolvidas') || {}).checked;
    const todas = (db.pendencias_fechamento || []).filter(p => p.unidadeId === activeUnitId);
    const abertas = todas.filter(p => !p.resolvida);
    const lista = (verResolvidas ? todas : abertas)
        .slice()
        .sort((a, b) => (Number(b.vezesIgnorada) || 1) - (Number(a.vezesIgnorada) || 1));

    // O card some quando não há nada pendente — só aparece quando exige ação
    if (lista.length === 0 && !verResolvidas) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    const taxaEmRisco = abertas.reduce((sm, p) => somaCentavos(sm, p.valorTaxa), 0);
    if (contador) {
        contador.textContent = abertas.length > 0
            ? ` — ${abertas.length} em aberto${taxaEmRisco > 0 ? ` (${formatCurrency(taxaEmRisco)} de taxa)` : ''}`
            : ' — tudo em dia';
        contador.style.color = abertas.length > 0 ? 'var(--danger)' : 'var(--success)';
    }

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:18px; text-align:center; color:var(--text-muted);">Nenhuma pendência registrada.</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(p => {
        const vezes = Number(p.vezesIgnorada) || 1;
        const det = p.detectadaEm ? new Date(p.detectadaEm).toLocaleDateString('pt-BR') : '—';
        const cor = COR_PENDENCIA[p.tipo] || 'var(--text-secondary)';
        const reincidente = vezes > 1;
        return `
        <tr style="border-top: 1px solid var(--border); ${p.resolvida ? 'opacity:.5;' : ''}">
            <td style="padding: 10px 14px; white-space: nowrap;">
                <span style="font-size: 11px; font-weight: 700; color: ${cor};">${ROTULO_PENDENCIA[p.tipo] || p.tipo}</span>
            </td>
            <td style="padding: 10px 14px;">${escHtml(p.descricao || '')}</td>
            <td style="padding: 10px 14px; white-space: nowrap;">${det}</td>
            <td style="padding: 10px 14px; white-space: nowrap;">${p.detectadaPor || '—'}</td>
            <td style="padding: 10px 14px; text-align: center; font-weight: ${reincidente ? '800' : '400'}; color: ${reincidente ? 'var(--danger)' : 'inherit'};">
                ${vezes}${reincidente ? 'x' : ''}
            </td>
            <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">${Number(p.valorTaxa) > 0 ? formatCurrency(p.valorTaxa) : '—'}</td>
            <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
                ${p.resolvida
                    ? `<span style="font-size:11px; color:var(--success);">Resolvida por ${p.resolvidaPor || '—'}</span>`
                    : `<button class="btn btn-secondary btn-sm" onclick="resolverPendenciaManual(${p.id})">Marcar resolvida</button>`}
            </td>
        </tr>`;
    }).join('');
}

async function resolverPendenciaManual(id) {
    const p = (db.pendencias_fechamento || []).find(x => x.id === id);
    if (!p) return;
    const como = prompt(`Como esta pendência foi resolvida?\n\n${p.descricao}\n\nDescreva o que foi feito:`);
    if (como === null) return;
    if (!como.trim()) { showToast("Descreva o que foi feito para poder baixar a pendência.", "error"); return; }
    try {
        await dbSave('pendencias_fechamento', {
            resolvida: true,
            resolvidaEm: new Date().toISOString(),
            resolvidaPor: currentSession ? currentSession.nome : 'Sistema',
            resolvidaComo: como.trim()
        }, 'update', id);
        logAudit("Pendência resolvida", `${p.descricao} — ${como.trim()}`);
        showToast("Pendência baixada.", "success");
        renderPendencias();
    } catch (e) {
        console.error('[Pendências] Falha ao baixar:', e);
        showToast("Erro ao baixar a pendência.", "error");
    }
}

// Monta o texto da auditoria para o operador ler antes de fechar.
function textoAuditoriaDetran(a) {
    const p = [];
    p.push(`Relatório do DETRAN: ${a.totalLaudos} laudos (${a.retornos} retorno gratuito), ${a.cobrados} cobrados.`);
    p.push(`Taxa prevista: ${formatCurrency(a.taxaPrevista)} (${a.cobrados} x R$ 27,00)`);
    p.push(`OS registradas no sistema: ${a.osRegistradas}`);
    if (a.placasErradas.length) {
        p.push('', `PLACA DIGITADA ERRADA (${a.placasErradas.length}):`);
        a.placasErradas.forEach(t => p.push(`  ${t.os.numero}: ${t.os.placa} -> o correto é ${t.laudo.placa}`));
    }
    if (a.faltamNoSistema.length) {
        p.push('', `COBRADO PELO DETRAN, SEM OS NO SISTEMA (${a.faltamNoSistema.length}) — ${formatCurrency(a.faltamNoSistema.length * 27)} de taxa:`);
        a.faltamNoSistema.forEach(l => p.push(`  ${l.placa} — ${l.data} ${l.hora} — ${l.status}`));
    }
    if (a.naoEnviadasAoDetran.length) {
        p.push('', `OS NO SISTEMA SEM LAUDO CORRESPONDENTE (${a.naoEnviadasAoDetran.length}):`);
        p.push('  Confira nesta ordem: 1) o servico esta certo? cautelar e pesquisa nao geram');
        p.push('  laudo; 2) ha OS duplicada para o mesmo veiculo? 3) o laudo nao foi enviado.');
        a.naoEnviadasAoDetran.forEach(o => p.push(`  ${o.numero} — ${o.placa} — ${formatCurrency(o.valor)}`));
    }
    if ((a.valoresDivergentes || []).length) {
        p.push('', `VALOR DIFERENTE DO DETRAN (${a.valoresDivergentes.length}):`);
        a.valoresDivergentes.forEach(v => p.push(`  ${v.os.numero} — ${v.os.placa}: sistema ${formatCurrency(v.valorOS)} x DETRAN ${formatCurrency(v.valorDetran)}`));
    }
    return p.join('\n');
}

// OS que ficaram sem finalizar. Uma OS parada em "aberta" some dos relatórios
// e da base de cálculo da guia, mas o laudo já foi emitido e o DETRAN já cobrou.
// Foi o caso da OS-0357 (MGV-0J98) e da OS-0484 (QHU-8I50) em agosto/2026.
// OS não finalizadas: aberta, paga (sem vistoria) e em execução (vistoria
// iniciada sem laudo emitido). Antes só "aberta" contava, e uma cautelar
// iniciada e não finalizada passava pelo fechamento do caixa sem aviso e
// ficava fora do faturamento do parceiro (OS-0723, 29/09).
const STATUS_OS_NAO_FINALIZADA = ['aberta', 'paga', 'em_execucao'];
const ROTULO_STATUS_PENDENTE = { aberta: 'aberta', paga: 'paga, sem vistoria', em_execucao: 'vistoria não finalizada' };

function osEmAbertoDaUnidade(unidadeId) {
    return (db.ordens_servico || []).filter(o =>
        o.unidadeId === unidadeId && STATUS_OS_NAO_FINALIZADA.includes(o.status)
    ).sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
}

function resumoOSEmAberto(lista) {
    return lista.map(o => {
        const dia = o.criadoEm ? new Date(o.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '--/--';
        return `• ${o.numero} — ${o.placa || 'sem placa'} (${dia}) — ${ROTULO_STATUS_PENDENTE[o.status] || o.status}`;
    }).join('\n');
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

    // Não deixa fechar o dia com OS pendente sem o operador ver.
    const pendentes = osEmAbertoDaUnidade(activeCaixa.unidadeId);
    let pendenciasOSRegistradas = false;
    if (pendentes.length > 0) {
        const segue = confirm(
            `Existem ${pendentes.length} Ordem(ns) de Serviço não finalizada(s) nesta unidade:\n\n` +
            resumoOSEmAberto(pendentes) +
            `\n\nOS não finalizada não entra na conferência da guia do DETRAN nem no ` +
            `faturamento do parceiro. Finalize ou cancele antes de fechar o caixa.\n\n` +
            `Se fechar assim, elas ficam registradas como pendência do fechamento.\n\n` +
            `Fechar mesmo assim?`
        );
        if (!segue) return;
        logAudit("Fechamento com pendência", `Fechou o caixa com ${pendentes.length} OS em aberto: ${pendentes.map(o => o.numero).join(', ')}.`);
    }

    const saldoFisico = lerValorMonetario(document.getElementById('fechar-saldo-fisico').value);
    if (saldoFisico === null || saldoFisico < 0) {
        showToast("Informe o saldo em dinheiro contado na gaveta (pode ser 0,00).", "error");
        return;
    }
    
    // Calculate estimated cash balance in box
    const movs = db.caixa_movimentos.filter(m => m.caixaId === activeCaixa.id);
    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const estimatedCash = (paraCentavos(activeCaixa.saldoAbertura) + paraCentavos(cashPayments) - paraCentavos(cashSangrias)) / 100;

    const diff = (paraCentavos(saldoFisico) - paraCentavos(estimatedCash)) / 100;

    // AUDITORIA: lê o PDF do DETRAN que o operador acabou de anexar e compara
    // com as OS registradas. Falha na leitura não impede o fechamento — o PDF
    // pode vir assinado digitalmente ou em layout diferente.
    try {
        const bytesAuditoria = await file.arrayBuffer();
        const { laudos, periodo, documentoDoSistema } = await lerRelatorioDetran(bytesAuditoria);

        if (documentoDoSistema) {
            // Arquivo errado: é o comprovante de fechamento gerado pelo próprio
            // sistema, não o relatório do DETRAN. Sem o relatório certo a
            // conferência não tem com o que comparar.
            logAudit('Fechamento sem conferência DETRAN',
                'Anexou o comprovante de fechamento do próprio sistema no lugar do relatório de laudos do DETRAN. Conferência não realizada.');
            const segue = confirm(
                'ARQUIVO ERRADO\n\n' +
                'Você anexou o comprovante de FECHAMENTO DE CAIXA gerado pelo próprio sistema.\n\n' +
                'A conferência precisa do relatório do DETRAN:\n' +
                'Portal ECV → "Laudos realizados no período" → exportar em PDF.\n\n' +
                'Sem esse arquivo a conferência com o DETRAN NÃO acontece. ' +
                'Fechar o caixa assim mesmo, sem conferência?'
            );
            if (!segue) return;
        } else if (laudos.length === 0) {
            const segue = confirm(
                'Não foi possível ler nenhum laudo no PDF anexado.\n\n' +
                'Confira se é mesmo o relatório "Laudos realizados no período" do Portal ECV.\n\n' +
                'Fechar o caixa sem a conferência automática?'
            );
            if (!segue) return;
        } else {
            const auditoria = auditarRelatorioDetran(laudos, periodo, activeCaixa.unidadeId);
            const problemas = auditoria.faltamNoSistema.length
                            + auditoria.naoEnviadasAoDetran.length
                            + auditoria.placasErradas.length
                            + (auditoria.valoresDivergentes || []).length;

            if (problemas === 0) {
                showToast(`Conferência OK: ${auditoria.cobrados} laudos batem com o sistema. Taxa prevista ${formatCurrency(auditoria.taxaPrevista)}.`, "success");
            } else {
                const segue = confirm(
                    'CONFERÊNCIA COM O DETRAN — ' + problemas + ' divergência(s)\n\n' +
                    textoAuditoriaDetran(auditoria) +
                    '\n\nCorrija antes de fechar. Fechar mesmo assim?'
                );
                if (!segue) return;
                logAudit("Fechamento com divergência DETRAN",
                    `Fechou com ${problemas} divergência(s). ` +
                    `Faltam no sistema: ${auditoria.faltamNoSistema.length}. ` +
                    `Não saíram no DETRAN: ${auditoria.naoEnviadasAoDetran.length}. ` +
                    `Placas erradas: ${auditoria.placasErradas.length}. ` +
                    `Valores diferentes: ${(auditoria.valoresDivergentes || []).length}.`);
            }

            // Grava as pendências e recontabiliza as que já estavam abertas.
            // A divergência ignorada hoje volta a aparecer amanhã, com o
            // contador de reincidência subindo, até alguém corrigir.
            const abertasAgora = osEmAbertoDaUnidade(activeCaixa.unidadeId);
            const itens = pendenciasDaAuditoria(auditoria, abertasAgora);
            const chavesHoje = new Set(itens.map(i => i.chave));
            const hojeISO = diaSP();
            const quem = currentSession ? currentSession.nome : 'Sistema';

            const resolvidas = await resolverPendenciasCorrigidas(activeCaixa.unidadeId, chavesHoje, quem);
            const { novas, repetidas } = await registrarPendencias(activeCaixa.unidadeId, itens, quem, hojeISO);

            if (resolvidas > 0) {
                showToast(`${resolvidas} pendência(s) anterior(es) foram corrigidas e baixadas.`, "success");
            }
            window.__pendenciasFechamento = { novas, repetidas, resolvidas, total: itens.length };
            pendenciasOSRegistradas = true;
        }
    } catch (err) {
        console.error('[Auditoria DETRAN] Falha ao ler o PDF:', err);
        const segue = confirm(
            'Não foi possível conferir o PDF do DETRAN automaticamente.\n\n' +
            'O arquivo pode estar assinado digitalmente ou protegido.\n\n' +
            'Fechar o caixa sem a conferência automática?'
        );
        if (!segue) return;
    }

    // Sem a conferência do DETRAN (arquivo errado ou ilegível), as OS não
    // finalizadas ainda assim viram pendência do fechamento
    if (!pendenciasOSRegistradas && pendentes.length) {
        try {
            await registrarPendencias(activeCaixa.unidadeId, pendenciasDaAuditoria({}, pendentes),
                currentSession ? currentSession.nome : 'Sistema', diaSP());
        } catch (e) { console.error('Pendências de OS não registradas:', e); }
    }

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

                // O relatório do DETRAN costuma vir assinado digitalmente/cifrado.
                // Sem ignoreEncryption o pdf-lib lança e a mesclagem falha, fazendo
                // o sistema descartar justamente o relatório do DETRAN. Com a flag,
                // a mesclagem passa e os DOIS documentos ficam preservados.
                const uploadedDoc = await PDFDocument.load(uploadedPdfBytes, { ignoreEncryption: true });
                const copiedPages2 = await mergedPdf.copyPages(uploadedDoc, uploadedDoc.getPageIndices());
                copiedPages2.forEach((page) => mergedPdf.addPage(page));

                const mergedPdfBytes = await mergedPdf.save();
                base64Pdf = uint8ArrayToBase64(mergedPdfBytes);
            } catch (pdfMergeError) {
                console.warn("Falha ao mesclar PDFs. Preservando o relatório do DETRAN, que é o documento insubstituível.", pdfMergeError);
                // O comprovante do caixa é gerado pelo sistema e pode ser refeito a
                // qualquer momento; o relatório do DETRAN, não. Por isso, na falha
                // da mesclagem, guardamos o relatório do DETRAN (e não o comprovante
                // do caixa) para nunca perder a evidência da conferência.
                base64Pdf = uint8ArrayToBase64(new Uint8Array(uploadedPdfBytes));
                showToast("Nota: não foi possível mesclar os PDFs (relatório do DETRAN assinado digitalmente). O caixa foi fechado guardando o relatório do DETRAN.", "warning");
            }

            // Check final size in characters (approx 1.33MB base64 corresponds to 1MB binary)
            if (base64Pdf.length > 1.33 * 1024 * 1024) {
                showToast("Erro: O PDF consolidado excedeu o limite de 1MB. Tente anexar um PDF do DETRAN menor.", "error");
                return;
            }

            // Grava primeiro; a tela só mostra o caixa fechado se o banco gravou
            const fechadoEm = new Date().toISOString();
            const fechamento = {
                status: "fechado",
                saldoEspécieInformado: saldoFisico,
                fechadoPor: currentSession.nome,
                fechadoEm,
                pdfConsolidado: base64Pdf
            };
            try {
                await dbSave('caixa_diario', fechamento, 'update', activeCaixa.id);
            } catch (dbErr) {
                console.warn("⚠️ Erro ao salvar fechamento com PDF (limite de payload ou rede). Tentando sem o PDF...", dbErr);
                try {
                    await dbSave('caixa_diario', { ...fechamento, pdfConsolidado: null }, 'update', activeCaixa.id);
                    fechamento.pdfConsolidado = base64Pdf;   // fica só neste aparelho
                    showToast("Caixa fechado, mas o PDF consolidado não coube no banco: baixe-o agora pelo histórico deste aparelho.", "warning");
                } catch (retryErr) {
                    console.error("❌ Erro crítico ao salvar fechamento de caixa:", retryErr);
                    showToast("O caixa NÃO foi fechado: o banco não gravou (" + (retryErr.message || retryErr) + "). Tente de novo.", "error");
                    return;
                }
            }
            Object.assign(activeCaixa, fechamento);

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
                    const cashPaymentsReaberto = movsReaberto.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
                    const cashSangriasReaberto = movsReaberto.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
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
                        const cashPaymentsSub = movsSub.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
                        const cashSangriasSub = movsSub.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
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

            // Notifica os administradores (push no celular)
            const unidadeNomeFecha = (db.unidades.find(u => u.id === activeCaixa.unidadeId) || {}).nome || 'Unidade';
            const horaFecha = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const movsFecha = db.caixa_movimentos.filter(m => m.caixaId === activeCaixa.id);
            const entradasTotaisFecha = movsFecha.filter(movEhRecebimento).reduce((s, m) => somaCentavos(s, m.valor), 0);
            const saidasTotaisFecha = movsFecha.filter(m => m.tipo === 'saida').reduce((s, m) => somaCentavos(s, m.valor), 0);
            const resultadoLiquidoFecha = entradasTotaisFecha - saidasTotaisFecha;
            const resumoFecha = resumoVendasCaixa(activeCaixa);
            // Aviso de inconsistência: repete TODO DIA enquanto não for corrigida,
            // e mostra há quantos fechamentos ela vem sendo arrastada.
            const emAberto = pendenciasAbertas(activeCaixa.unidadeId);
            let alertaPendentes = '';
            if (emAberto.length > 0) {
                const taxaEmRisco = emAberto.reduce((sm, p) => somaCentavos(sm, p.valorTaxa), 0);
                const antigas = emAberto.filter(p => (Number(p.vezesIgnorada) || 1) > 1);
                const linhas = emAberto.slice(0, 8).map(p => {
                    const v = Number(p.vezesIgnorada) || 1;
                    return `• ${p.descricao}${v > 1 ? ` [${v}º fechamento seguido]` : ''}`;
                });
                if (emAberto.length > 8) linhas.push(`• … e mais ${emAberto.length - 8}`);
                alertaPendentes =
                    `\n\n⚠️ ${emAberto.length} INCONSISTÊNCIA(S) EM ABERTO nesta unidade` +
                    (antigas.length ? ` — ${antigas.length} já vinham de fechamentos anteriores` : '') +
                    (taxaEmRisco > 0 ? `\nTaxa DETRAN sem registro: ${formatCurrency(taxaEmRisco)}` : '') +
                    `\n\n${linhas.join('\n')}`;
            }
            const tituloPush = alertaPendentes ? '⚠️ Caixa fechado COM PENDÊNCIA' : '🔴 Caixa fechado';
            notificarAdmins(tituloPush, `${unidadeNomeFecha} — fechado por ${currentSession.nome} às ${horaFecha}.\nVendas do dia: ${formatCurrency(resumoFecha.vendido)} (recebido ${formatCurrency(entradasTotaisFecha)}, a faturar ${formatCurrency(resumoFecha.aFaturar)})\nSaídas: ${formatCurrency(saidasTotaisFecha)}\nResultado em caixa: ${formatCurrency(resultadoLiquidoFecha)}${alertaPendentes}`);
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
    garantirHistoricoCompleto(true, renderCaixaHistorico);
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
        const totalEntradas = movs.filter(movEhRecebimento).reduce((sum, m) => somaCentavos(sum, m.valor), 0);
        const totalSaidas = movs.filter(m => m.tipo === 'saida').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
        
        const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
        const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
        const estimatedCash = c.saldoAbertura + cashPayments - cashSangrias;
        
        const diff = c.saldoEspécieInformado - estimatedCash;
        const diffColor = Math.abs(diff) < 0.005 ? 'var(--success)' : (diff > 0 ? 'var(--info)' : 'var(--danger)');

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
                <td style="text-align: right;"><strong>${formatCurrency(resumoVendasCaixa(c).vendido)}</strong><br><small style="color: var(--success);">recebido ${formatCurrency(totalEntradas)}</small>${resumoVendasCaixa(c).aFaturar > 0 ? `<br><small style="color: var(--text-secondary);">a faturar ${formatCurrency(resumoVendasCaixa(c).aFaturar)}</small>` : ''}</td>
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

    // Injetar vistorias isentas do dia no caixa para correspondência física com o DETRAN
    const isentas = db.ordens_servico.filter(os => {
        const osDateLocal = getLocalDateString(os.criadoEm);
        const isSameDay = osDateLocal === c.data;
        return isSameDay && 
               os.unidadeId === c.unidadeId && 
               os.status !== 'cancelada' && 
               os.formaPagamento === 'isento';
    });

    const simulatedMovs = isentas.map(os => ({
        id: `isenta-${os.id}`,
        caixaId: c.id,
        tipo: 'entrada',
        valor: 0,
        descricao: `Vistoria Isenta: ${(os.servicoNome || 'VISTORIA').split(' — ')[0]}`,
        formaPagamento: 'isento',
        data: os.criadoEm,
        operador: os.criadoPor || 'Sistema',
        osId: os.id,
        faturaId: null
    }));

    const allMovs = [...movs, ...simulatedMovs].sort((a, b) => new Date(a.data) - new Date(b.data));

    const entries = allMovs.filter(m => m.tipo === 'entrada');
    const exits = allMovs.filter(m => m.tipo === 'saida');

    const totalEntradas = entries.filter(movEhRecebimento).reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalSaidas = exits.reduce((sum, m) => somaCentavos(sum, m.valor), 0);

    const cashPayments = movs.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const cashSangrias = movs.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const estimatedCash = c.saldoAbertura + cashPayments - cashSangrias;
    const diff = c.saldoEspécieInformado - estimatedCash;

    // Modalidades de Pagamento
    const totalPix = entries.filter(m => m.formaPagamento === 'pix').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalEspecie = entries.filter(m => m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalDebito = entries.filter(m => m.formaPagamento === 'debito').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalCredito = entries.filter(m => m.formaPagamento === 'credito' || m.formaPagamento === 'credito_parcelado').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const totalFaturamento = db.ordens_servico
        .filter(o => o.unidadeId === c.unidadeId && getLocalDateString(o.criadoEm) === c.data && o.status !== 'cancelada' && o.formaPagamento === 'faturamento')
        .reduce((sum, o) => somaCentavos(sum, o.valor), 0);

    // Entries Rows mapping
    let entryRows = entries.map(m => {
        const os = m.osId ? db.ordens_servico.find(o => o.id === m.osId) : null;
        const plate = os ? os.placa : "—";
        const clientType = os ? (os.formaPagamento === 'isento' ? 'ISENTO' : os.clienteTipo.toUpperCase()) : "FAT. RECEBIDO";
        const time = new Date(m.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const obsText = os && os.observacoes ? `<br><small style="color: #666; font-size: 9px;">Veículo: ${removeDividedPaymentTag(os.observacoes)}</small>` : '';
        return `
            <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
                <td style="padding: 6px;">${time}</td>
                <td style="padding: 6px;">${escHtml(m.descricao)}${obsText}</td>
                <td style="padding: 6px;"><strong>${plate}</strong></td>
                <td style="padding: 6px;">${clientType}</td>
                <td style="padding: 6px; text-transform: uppercase;">${escHtml(m.formaPagamento)}</td>
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
                <td style="padding: 6px;">${escHtml(m.descricao)}</td>
                <td style="padding: 6px; text-transform: uppercase;">${escHtml(m.formaPagamento)}</td>
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
                <strong>Unidade Operacional:</strong> ${escHtml(unit.nome)}<br>
                <strong>Endereço:</strong> ${escHtml(unit.endereco)}<br>
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
                    <strong>Total em Faturamento:</strong> ${formatCurrency(totalFaturamento)}<br>
                    <strong>Vistorias Isentas:</strong> ${isentas.length} vistorias
                </div>
                <div style="border-left: 1px solid #ccc; padding-left: 16px;">
                    <strong style="text-transform: uppercase;">Controle de Serviços (DETRAN):</strong><br>
                    <strong>Total de Vistorias:</strong> ${entries.filter(m => m.osId).length} vistorias<br>
                    <hr style="border:0; border-top: 1px solid #ccc; margin: 6px 0;">
                    <strong style="text-transform: uppercase;">Resumo Financeiro:</strong><br>
                    <strong>Vendas do Dia:</strong> ${formatCurrency(resumoVendasCaixa(c).vendido)}<br>
                    <strong>A Faturar (parceiros):</strong> ${formatCurrency(resumoVendasCaixa(c).aFaturar)}<br>
                    <hr style="border:0; border-top: 1px solid #ccc; margin: 6px 0;">
                    <strong>Fundo Inicial (Abertura):</strong> ${formatCurrency(c.saldoAbertura)}<br>
                    <strong>Recebido no Caixa (+):</strong> ${formatCurrency(totalEntradas)}<br>
                    <strong>Total de Saídas (-):</strong> ${formatCurrency(totalSaidas)}<br>
                    <hr style="border:0; border-top: 1px solid #ccc; margin: 6px 0;">
                    <strong>Resultado em Caixa:</strong> <strong style="color: ${totalEntradas - totalSaidas >= 0 ? '#10b981' : '#ef4444'}">${formatCurrency(totalEntradas - totalSaidas)}</strong>
                </div>
                <div style="border-left: 1px solid #ccc; padding-left: 16px;">
                    <strong style="text-transform: uppercase;">Conciliação (Dinheiro Físico):</strong><br>
                    <strong>Saldo Estimado:</strong> ${formatCurrency(estimatedCash)}<br>
                    <strong>Saldo Apurado:</strong> ${c.status === 'fechado' ? formatCurrency(c.saldoEspécieInformado) : 'AGUARDANDO FECHAMENTO'}<br>
                    <hr style="border:0; border-top: 1px solid #ccc; margin: 6px 0;">
                    <strong>Diferença de Caixa:</strong> <strong style="color: ${Math.abs(diff) < 0.005 ? '#10b981' : '#ef4444'}">${c.status === 'fechado' ? formatCurrency(diff) : 'AGUARDANDO FECHAMENTO'}</strong>
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
    const totalAReceber = openOSList.reduce((sum, os) => somaCentavos(sum, os.valor), 0);
    
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
    const totalHistorico = activeUnitFaturas.reduce((sum, f) => somaCentavos(sum, f.valorTotal), 0);
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
        db.parceiros.filter(p => p.usaFaturamento).map(p => `<option value="${p.id}">${escHtml(p.nome)}</option>`).join('');
}

function getUnbilledOSs() {
    // Uma vistoria REPROVADA é serviço prestado: o laudo foi emitido e o
    // parceiro paga por ele (o custo do DETRAN de R$27 tambem ja foi gerado).
    // Só o retorno/reapresentacao é isento — e esse entra como formaPagamento
    // 'isento', logo ja fica de fora deste filtro. Por isso incluimos aqui
    // tanto aprovada quanto reprovada; senao as reprovadas somem do faturamento.
    return db.ordens_servico.filter(o =>
        o.unidadeId === activeUnitId &&
        o.formaPagamento === 'faturamento' &&
        !o.faturaId &&
        (o.status === 'concluida_aprovada' || o.status === 'concluida_reprovada')
    );
}

function renderFatPendentes() {
    renderFaturamentoKPIs();
    const tbody = document.getElementById('fat-pendentes-tbody');
    const partnerId = parseInt(document.getElementById('fat-parceiro-filter').value);
    
    // Mostrar/ocultar botão de crédito/cortesia
    const btnCredito = document.getElementById('btn-fat-credito');
    if (btnCredito) {
        btnCredito.style.display = partnerId ? 'inline-flex' : 'none';
    }
    
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
                <td><strong>${escHtml(o.numero)}</strong></td>
                <td>${formatDateTimeBr(o.criadoEm)}</td>
                <td>${partner ? partner.nome : '—'}</td>
                <td>
                    <strong>${escHtml(o.placa)}</strong><br>
                    <small style="color: var(--text-secondary); font-weight: 500;">${removeDividedPaymentTag(o.observacoes) || '—'}</small>
                </td>
                <td>${o.servicoNome.split(' — ')[0]}</td>
                <td style="text-align: right; color: var(--success); font-weight: 600;">${formatCurrency(o.valor)}</td>
                <td>${escHtml(o.criadoPor)}</td>
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

// ---- Mensalidade fixa do parceiro (ex.: aluguel do pátio) ----
// Cadastrada no parceiro e cobrada uma vez por mês de competência, junto com
// as O.S., sem passar pelo atendimento. Fica em faturas.cobrancasExtras.
function parceiroTemMensalidade(partner) {
    return !!partner && Number(partner.mensalidadeValor) > 0;
}

function cobrancasExtrasDaFatura(f) {
    return Array.isArray(f && f.cobrancasExtras) ? f.cobrancasExtras : [];
}

function totalExtrasDaFatura(f) {
    return cobrancasExtrasDaFatura(f).reduce((s, e) => somaCentavos(s, Number(e.valor) || 0), 0);
}

function faturaDaMensalidade(parceiroId, competencia) {
    return (db.faturas || []).find(f => f.parceiroId === parceiroId &&
        cobrancasExtrasDaFatura(f).some(e => e.tipo === 'mensalidade' && e.competencia === competencia));
}

function rotuloCompetencia(competencia) {
    const [a, m] = String(competencia || '').split('-');
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return meses[Number(m) - 1] ? `${meses[Number(m) - 1]}/${a}` : String(competencia || '');
}

// A competência da mensalidade é o mês do fim do período da fatura
function atualizarMensalidadeFatModal() {
    const box = document.getElementById('fat-modal-mens-box');
    const partner = db.parceiros.find(p => p.id === parseInt(document.getElementById('fat-modal-parceiro-id').value));
    if (!parceiroTemMensalidade(partner)) {
        box.style.display = 'none';
        document.getElementById('fat-modal-mens-incluir').checked = false;
        recalcFatModalTotais();
        return;
    }
    box.style.display = '';
    const fim = document.getElementById('fat-modal-fim').value || diaSP(new Date());
    const competencia = fim.slice(0, 7);
    const ja = faturaDaMensalidade(partner.id, competencia);
    const chk = document.getElementById('fat-modal-mens-incluir');
    document.getElementById('fat-modal-mens-comp').textContent = rotuloCompetencia(competencia);
    document.getElementById('fat-modal-mens-aviso').textContent = ja
        ? `A mensalidade de ${rotuloCompetencia(competencia)} já foi cobrada na fatura ${ja.codigo}.`
        : 'Desmarque se este mês não deve ser cobrado. O valor pode ser ajustado só para esta fatura.';
    chk.disabled = !!ja;
    // Mês novo (ou modal recém-aberto): vem marcada; no mesmo mês respeita o operador
    if (ja) chk.checked = false;
    else if (window.fatModalMensCompetencia !== competencia) chk.checked = true;
    window.fatModalMensCompetencia = competencia;
    recalcFatModalTotais();
}

function mensalidadeSelecionadaFatModal() {
    const chk = document.getElementById('fat-modal-mens-incluir');
    if (!chk || !chk.checked || chk.disabled) return null;
    return {
        tipo: 'mensalidade',
        descricao: document.getElementById('fat-modal-mens-desc').value.trim(),
        valor: lerValorMonetario(document.getElementById('fat-modal-mens-valor').value) || 0,
        competencia: window.fatModalMensCompetencia
    };
}

function recalcFatModalTotais() {
    const totalOS = window.fatModalTotalOS || 0;
    const totalCreditos = window.fatModalTotalCreditos || 0;
    const mens = mensalidadeSelecionadaFatModal();
    const extras = mens ? mens.valor : 0;
    const bruto = somaCentavos(totalOS, extras);
    document.getElementById('fat-modal-total-bruto').textContent = formatCurrency(totalOS);
    document.getElementById('fat-modal-linha-extras').style.display = mens ? 'flex' : 'none';
    document.getElementById('fat-modal-total-extras').textContent = formatCurrency(extras);
    document.getElementById('fat-modal-total-creditos').textContent = `- ${formatCurrency(Math.min(totalCreditos, bruto))}`;
    document.getElementById('fat-modal-total-liquido').textContent = formatCurrency(Math.max(0, bruto - totalCreditos));
}

function openGirarFaturaModal() {
    const checkboxes = document.querySelectorAll('input[name="fat-select-os"]:checked');
    const selectedIds = Array.from(checkboxes).map(el => parseInt(el.value));
    const selectedOSs = db.ordens_servico.filter(o => selectedIds.includes(o.id));
    const filtroParceiro = parseInt(document.getElementById('fat-parceiro-filter').value);

    // Ensure all belong to the SAME partner
    const partnerIds = [...new Set(selectedOSs.map(o => o.parceiroId))];
    if (partnerIds.length > 1) {
        showToast("Erro: Selecione vistorias de apenas UM parceiro para gerar a fatura.", "error");
        return;
    }

    let partner;
    if (selectedOSs.length === 0) {
        // Sem O.S.: só dá para fechar a fatura da mensalidade do parceiro filtrado
        partner = db.parceiros.find(p => p.id === filtroParceiro);
        if (!parceiroTemMensalidade(partner)) {
            showToast("Por favor, selecione pelo menos uma OS para faturar.", "error");
            return;
        }
    } else {
        partner = db.parceiros.find(p => p.id === partnerIds[0]);
    }
    if (!partner) {
        showToast("Parceiro da O.S. não encontrado.", "error");
        return;
    }

    const totalVal = selectedOSs.reduce((sum, o) => somaCentavos(sum, o.valor), 0);

    // Calcular créditos/cortesias disponíveis
    const creditosDisponiveis = (db.parceiros_creditos || []).filter(c => c.parceiroId === partner.id && !c.utilizado);
    const totalCreditos = creditosDisponiveis.reduce((sum, c) => somaCentavos(sum, c.valor), 0);

    // Populate modal
    document.getElementById('fat-modal-parceiro').value = partner.nome;
    document.getElementById('fat-modal-parceiro-id').value = partner.id;
    document.getElementById('fat-modal-qtd').textContent = selectedOSs.length;

    // Autofill dates (oldest and newest of selected OSs); só mensalidade = mês corrente
    if (selectedOSs.length) {
        const dates = selectedOSs.map(o => new Date(o.criadoEm));
        document.getElementById('fat-modal-inicio').value = diaSP(new Date(Math.min(...dates)));
        document.getElementById('fat-modal-fim').value = diaSP(new Date(Math.max(...dates)));
    } else {
        const hoje = diaSP(new Date());
        document.getElementById('fat-modal-inicio').value = hoje.slice(0, 8) + '01';
        document.getElementById('fat-modal-fim').value = hoje;
    }

    // Save ids inside global window to fetch on submit
    window.selectedFatOSIds = selectedIds;
    window.fatModalTotalOS = totalVal;
    window.fatModalTotalCreditos = totalCreditos;
    window.fatModalMensCompetencia = null;
    document.getElementById('fat-modal-mens-desc').value = partner.mensalidadeDescricao || 'Mensalidade';
    document.getElementById('fat-modal-mens-valor').value = parceiroTemMensalidade(partner) ? Number(partner.mensalidadeValor).toFixed(2) : '';
    atualizarMensalidadeFatModal();

    document.getElementById('modal-faturamento-fechar').classList.add('active');
    atualizarCreditosFatModal(partner.id);
}

// Os créditos podem ter mudado desde que a tela foi aberta (outra pessoa
// lançou, fatura desfeita...). O banco abate os créditos que estão livres na
// hora de fechar, então o resumo do modal busca o saldo atualizado de lá.
async function atualizarCreditosFatModal(parceiroId) {
    if (!window.useSupabase || !window.onlineTables || !window.onlineTables['parceiros_creditos']) return;
    try {
        const { data, error } = await supabaseClient.from('parceiros_creditos').select('*').eq('parceiroId', parceiroId);
        if (error || !Array.isArray(data)) return;
        const frescos = data.map(c => normalizeRecord('parceiros_creditos', c));
        db.parceiros_creditos = (db.parceiros_creditos || []).filter(c => c.parceiroId !== parceiroId).concat(frescos);
        if (parseInt(document.getElementById('fat-modal-parceiro-id').value) !== parceiroId) return;
        window.fatModalTotalCreditos = frescos.filter(c => !c.utilizado).reduce((s, c) => somaCentavos(s, c.valor), 0);
        recalcFatModalTotais();
    } catch (e) {
        console.warn('Não foi possível atualizar os créditos do parceiro:', e);
    }
}


function closeFatModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-faturamento-fechar').classList.remove('active');
}

function openCreditoCortesiaModal() {
    const partnerId = parseInt(document.getElementById('fat-parceiro-filter').value);
    if (!partnerId) {
        showToast("Selecione um parceiro conveniado primeiro.", "error");
        return;
    }
    const partner = db.parceiros.find(p => p.id === partnerId);
    if (!partner) return;

    document.getElementById('cred-modal-parceiro-nome').value = partner.nome;
    document.getElementById('cred-modal-parceiro-id').value = partner.id;
    document.getElementById('cred-modal-tipo').value = "credito";
    document.getElementById('cred-modal-valor').value = "";
    document.getElementById('cred-modal-desc').value = "";

    document.getElementById('modal-fat-credito').classList.add('active');
}

function closeCreditoCortesiaModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-fat-credito').classList.remove('active');
}

async function submitCreditoCortesiaForm(event) {
    event.preventDefault();
    const partnerId = parseInt(document.getElementById('cred-modal-parceiro-id').value);
    const tipo = document.getElementById('cred-modal-tipo').value;
    const valor = parseFloat(document.getElementById('cred-modal-valor').value);
    const descricao = document.getElementById('cred-modal-desc').value.trim();

    if (!partnerId || isNaN(valor) || valor <= 0 || !descricao) {
        showToast("Preencha todos os campos corretamente.", "error");
        return;
    }

    const newRecord = {
        parceiroId: partnerId,
        tipo: tipo,
        valor: valor,
        descricao: descricao,
        faturaId: null,
        utilizado: false,
        criadoEm: new Date().toISOString(),
        criadoPor: (window.currentSession && window.currentSession.nome) ? window.currentSession.nome : "Operador"
    };

    try {
        showToast("Registrando lançamento...", "info");
        let savedRecord;
        if (window.useSupabase && window.onlineTables['parceiros_creditos']) {
            savedRecord = await sbInsert('parceiros_creditos', newRecord);
        } else {
            // Modo local (localStorage)
            const arr = db.parceiros_creditos || [];
            newRecord.id = arr.length > 0 ? Math.max(...arr.map(r => r.id || 0)) + 1 : 1;
            savedRecord = newRecord;
        }

        // Atualizar cache local
        if (!db.parceiros_creditos) db.parceiros_creditos = [];
        cacheInsert('parceiros_creditos', savedRecord);
        if (typeof saveDatabase === 'function') saveDatabase();

        showToast(`${tipo === 'credito' ? 'Crédito' : 'Cortesia'} lançado com sucesso!`, "success");
        closeCreditoCortesiaModal();
        
        // Recalcular faturamento pendente
        if (typeof renderFatPendentes === 'function') {
            renderFatPendentes();
        }
    } catch (err) {
        console.error("Erro ao registrar crédito/cortesia:", err);
        showToast("Erro de rede ao salvar no banco online.", "error");
    }
}

async function submitGirarFatura(event) {
    event.preventDefault();

    // Trava contra clique duplo. Gerar fatura é assíncrono (Asaas, PDF, banco):
    // sem isto, dois cliques em sequência produzem duas faturas para as mesmas
    // OS. Foi o que aconteceu com a FAT-0031 e a FAT-0032 em 06/08/2026 —
    // geradas com 4 segundos de diferença, ambas para a OS-0163.
    if (window.__faturandoAgora) {
        showToast("Aguarde: a fatura já está sendo gerada.", "info");
        return;
    }
    const btnSubmit = event.target && event.target.querySelector
        ? event.target.querySelector('button[type="submit"]') : null;

    const partnerId = parseInt(document.getElementById('fat-modal-parceiro-id').value);
    const dateIni = document.getElementById('fat-modal-inicio').value;
    const dateFim = document.getElementById('fat-modal-fim').value;
    const selectedIds = window.selectedFatOSIds || [];
    const mensalidade = mensalidadeSelecionadaFatModal();
    if (mensalidade && (!(mensalidade.valor > 0) || !mensalidade.descricao)) {
        showToast("Informe a descrição e o valor da mensalidade, ou desmarque-a.", "error");
        return;
    }
    const extras = mensalidade ? [mensalidade] : [];
    if (selectedIds.length === 0 && extras.length === 0) {
        showToast("Nada a faturar: sem O.S. selecionada e sem mensalidade.", "error");
        return;
    }

    // Segunda barreira: nenhuma das OS pode já estar em outra fatura. Pega
    // também o caso de duas abas abertas ou de um F5 no meio do processo.
    const jaFaturadas = (db.faturas || []).filter(f =>
        (f.ordensIds || []).some(id => selectedIds.includes(Number(id))));
    if (jaFaturadas.length > 0) {
        const osRepetidas = [...new Set(jaFaturadas.flatMap(f =>
            (f.ordensIds || []).map(Number).filter(id => selectedIds.includes(id))))];
        const numeros = osRepetidas
            .map(id => (db.ordens_servico.find(o => o.id === id) || {}).numero || `#${id}`);
        showToast(`Já existe fatura para ${numeros.join(', ')} (${jaFaturadas.map(f => f.codigo).join(', ')}).`, "error");
        return;
    }

    window.__faturandoAgora = true;
    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.style.opacity = '0.6'; }
    try {

    const selectedOSs = db.ordens_servico.filter(o => selectedIds.includes(o.id));

    // Fatura, vínculo das OS e consumo dos créditos numa transação no banco,
    // com as OS e os créditos travados: duas pessoas faturando ao mesmo tempo
    // não pegam as mesmas OS nem o mesmo crédito.
    const { data: r, error: erroFat } = await supabaseClient.rpc('faturar_os', {
        p_parceiro: partnerId,
        p_unidade: activeUnitId,
        p_inicio: dateIni,
        p_fim: dateFim,
        p_os_ids: selectedIds,
        p_criado_por: currentSession.nome,
        p_extras: extras
    });
    if (erroFat) {
        showToast("A fatura não foi gerada: " + erroFat.message, "error");
        return;
    }

    const finalInvoice = prepareRecordFromDb('faturas', r.fatura);
    finalInvoice.ordensIds = (finalInvoice.ordensIds || []).map(Number);
    const code = finalInvoice.codigo;
    const totalCreditosAbatidos = Number(r.abatido) || 0;
    selectedOSs.forEach(os => { os.faturaId = finalInvoice.id; });
    const usados = new Set((r.creditos_usados || []).map(Number));
    (db.parceiros_creditos || []).forEach(c => {
        if (usados.has(Number(c.id))) { c.utilizado = true; c.faturaId = finalInvoice.id; }
    });
    if (r.sobra) {
        if (!db.parceiros_creditos) db.parceiros_creditos = [];
        db.parceiros_creditos.push(normalizeRecord('parceiros_creditos', r.sobra));
    }
    db.faturas.unshift(finalInvoice);

    // --- Gerar PDF (a cobrança Asaas e o envio são ações separadas) ---
    // Desde 09/2026 o FECHAMENTO do lote NÃO dispara mais Asaas nem WhatsApp:
    // gerar cobrança, encaminhar e dar baixa são botões deliberados na aba
    // Histórico (clientes que adiantavam o pagamento eram cobrados indevidamente).
    try {
        showToast("Fatura salva! Gerando demonstrativo em PDF...", "info");
        const pdfUrl = await generateAndUploadInvoicePDF(finalInvoice);
        if (pdfUrl) {
            finalInvoice.pdf_url = pdfUrl;
            await sbUpdate('faturas', finalInvoice.id, { pdf_url: pdfUrl });
        }
    } catch (e) {
        console.error(e);
        showToast("Fatura fechada, mas houve um erro ao gerar o PDF.", "warning");
    }

    showToast(`Fatura ${code} gerada com sucesso!`, "success");
    logAudit("Faturamento Lote", `Faturou ${selectedOSs.length} OSs para ${document.getElementById('fat-modal-parceiro').value}${mensalidade ? ` + ${mensalidade.descricao} de ${rotuloCompetencia(mensalidade.competencia)} (${formatCurrency(mensalidade.valor)})` : ''} (Créditos abatidos: ${formatCurrency(totalCreditosAbatidos)}).`);
    
    closeFatModal();
    renderFaturamentoPage();

    } finally {
        // Libera a trava aconteça o que acontecer: se a geração falhar no meio,
        // o operador precisa poder tentar de novo.
        window.__faturandoAgora = false;
        if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.style.opacity = ''; }
    }
}

// ==========================================================
// FATURAS POR MÊS
// ----------------------------------------------------------
// Uma fatura tem TRÊS datas, e elas caem em meses diferentes:
//
//   competência — o período das vistorias   (periodoInicio/periodoFim)
//   emissão     — quando a fatura foi gerada (criadoEm)
//   pagamento   — quando o cliente pagou     (pagoEm)
//
// Quase toda fatura de serviços de julho/2026 foi gerada e paga em agosto.
// Por isso "as faturas de julho" não tem resposta única: depende de qual
// pergunta se está fazendo. O operador escolhe o critério na tela.
// ==========================================================

function mesDaFatura(f, criterio) {
    const mes = (v) => {
        if (!v) return null;
        const dia = diaSP(v);
        return dia ? dia.slice(0, 7) : String(v).substring(0, 7);
    };
    if (criterio === 'emissao')   return mes(f.criadoEm);
    if (criterio === 'pagamento') return f.pago ? mes(f.pagoEm) : null;
    // competência: o mês em que o período de cobrança fecha
    return f.periodoFim ? String(f.periodoFim).substring(0, 7)
                        : (f.periodoInicio ? String(f.periodoInicio).substring(0, 7) : mes(f.criadoEm));
}

function mudarMesFaturas(delta) {
    const el = document.getElementById('fat-mes-sel');
    if (!el || !el.value) return;
    const [a, m] = el.value.split('-').map(Number);
    const d = new Date(a, m - 1 + delta, 1);
    el.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderFatFaturas();
}

function renderResumoFaturas(lista, criterio, verTodas, mesSel) {
    const alvo = document.getElementById('fat-resumo-mes');
    if (!alvo) return;

    const pagas   = lista.filter(f => f.pago);
    const abertas = lista.filter(f => !f.pago);
    const soma = arr => arr.reduce((s, f) => somaCentavos(s, f.valorTotal), 0);

    // No critério "pagamento" não existe fatura em aberto: ela só entra no mês
    // quando foi paga. Mostrar "em aberto" ali seria sempre zero e confundiria.
    const porPagamento = criterio === 'pagamento';

    const rotulo = { competencia: 'com vistorias no mês',
                     emissao: 'geradas no mês',
                     pagamento: 'pagas no mês' }[criterio];

    const cel = (lab, val, sub, cor) => `
        <div style="background: var(--bg-card); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px;">
            <span style="font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: ${cor || 'var(--text-muted)'};">${lab}</span>
            <span style="font-size: 20px; font-weight: 800; ${cor ? `color:${cor};` : ''}">${val}</span>
            <span style="font-size: 11.5px; color: var(--text-muted);">${sub}</span>
        </div>`;

    alvo.innerHTML =
        cel(verTodas ? 'Total de faturas' : `Faturas — ${rotulo}`,
            formatCurrency(soma(lista)), `${lista.length} fatura(s)`) +
        cel('Recebido', formatCurrency(soma(pagas)), `${pagas.length} paga(s)`, 'var(--success)') +
        (porPagamento ? '' :
            cel('Em aberto', formatCurrency(soma(abertas)),
                abertas.length ? `${abertas.length} aguardando pagamento` : 'nada pendente',
                abertas.length ? 'var(--danger)' : 'var(--text-muted)'));
}

// Preenche o seletor de parceiro só com quem tem fatura nesta unidade.
function popularFiltroParceirosFaturas(faturasDaUnidade) {
    const el = document.getElementById('fat-filtro-parceiro');
    if (!el) return;
    const ids = [...new Set(faturasDaUnidade.map(f => f.parceiroId))];
    const opcoes = ids
        .map(id => {
            const p = db.parceiros.find(x => x.id === id);
            return { id, nome: p ? p.nome : `Parceiro #${id}` };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome));
    const atual = el.value;
    const novo = '<option value="">Todos</option>' +
        opcoes.map(o => `<option value="${o.id}">${escHtml(o.nome)}</option>`).join('');
    if (el.innerHTML !== novo) {
        el.innerHTML = novo;
        el.value = atual;   // preserva a escolha ao re-renderizar
    }
}

// Rodapé com os totais do que está sendo exibido — não do histórico inteiro.
function renderRodapeFaturas(lista) {
    const tfoot = document.getElementById('fat-faturas-tfoot');
    if (!tfoot) return;
    if (lista.length === 0) { tfoot.innerHTML = ''; return; }
    const total = lista.reduce((s, f) => somaCentavos(s, f.valorTotal), 0);
    const pago = lista.filter(f => f.pago).reduce((s, f) => somaCentavos(s, f.valorTotal), 0);
    const aberto = total - pago;
    const os = lista.reduce((s, f) => s + ((f.ordensIds || []).length), 0);
    tfoot.innerHTML = `
        <tr style="border-top: 2px solid var(--border); font-weight: 700; background: var(--bg-secondary);">
            <td colspan="4" style="padding: 12px 14px;">${lista.length} fatura(s) exibida(s)</td>
            <td style="text-align: center;">${os}</td>
            <td style="text-align: right;">${formatCurrency(total)}</td>
            <td colspan="4" style="padding: 12px 14px; font-weight: 400; font-size: 12px;">
                <span style="color: var(--success);">Recebido ${formatCurrency(pago)}</span>
                ${aberto > 0 ? ` &nbsp;•&nbsp; <span style="color: var(--danger);">Em aberto ${formatCurrency(aberto)}</span>` : ''}
            </td>
        </tr>`;
}

function limparFiltrosFaturas() {
    ['fat-filtro-status', 'fat-filtro-parceiro', 'fat-busca'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const t = document.getElementById('fat-ver-todas');
    if (t) t.checked = false;
    renderFatFaturas();
}

function renderFatFaturas() {
    renderFaturamentoKPIs();
    const tbody = document.getElementById('fat-faturas-tbody');

    const elMes = document.getElementById('fat-mes-sel');
    const elCrit = document.getElementById('fat-criterio');
    const elTodas = document.getElementById('fat-ver-todas');
    const criterio = (elCrit && elCrit.value) || 'competencia';
    const verTodas = !!(elTodas && elTodas.checked);

    // Primeira abertura: começa no mês corrente
    if (elMes && !elMes.value) {
        const hoje = new Date();
        elMes.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    }
    const mesSel = elMes ? elMes.value : null;

    const elStatus = document.getElementById('fat-filtro-status');
    const elParc = document.getElementById('fat-filtro-parceiro');
    const elBusca = document.getElementById('fat-busca');
    const fStatus = (elStatus && elStatus.value) || '';
    const fParceiro = elParc && elParc.value ? parseInt(elParc.value) : null;
    const termo = ((elBusca && elBusca.value) || '').trim().toUpperCase();

    const daUnidade = db.faturas.filter(f => f.unidadeId === activeUnitId);
    popularFiltroParceirosFaturas(daUnidade);

    const nomeParceiro = (id) => {
        const p = db.parceiros.find(x => x.id === id);
        return p ? p.nome : 'Parceiro removido';
    };

    const faturas = daUnidade
        .filter(f => verTodas || !mesSel || mesDaFatura(f, criterio) === mesSel)
        .filter(f => !fStatus || (fStatus === 'pago' ? f.pago : !f.pago))
        .filter(f => !fParceiro || f.parceiroId === fParceiro)
        .filter(f => !termo
            || String(f.codigo || '').toUpperCase().includes(termo)
            || nomeParceiro(f.parceiroId).toUpperCase().includes(termo))
        .sort((a, b) => b.id - a.id);

    renderResumoFaturas(faturas, criterio, verTodas, mesSel);
    renderRodapeFaturas(faturas);

    if (faturas.length === 0) {
        const msg = daUnidade.length === 0
            ? 'Nenhuma fatura emitida nesta unidade.'
            : 'Nenhuma fatura neste mês por esse critério. Troque o mês, o critério, ou marque "Ver todas".';
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:18px; color:var(--text-muted);">${msg}</td></tr>`;
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
            asaasBtn = `<button class="btn btn-secondary btn-sm btn-icon" onclick="generateAsaasBillingForInvoice(${f.id}, this)" title="3. Gerar Cobrança Automática (Asaas)"><i class="ri-bank-card-line"></i></button>`;
        }

        let zapBtn = '';
        if (f.asaas_url) {
            const zapColor = f.notificacao_zap ? "var(--success)" : "var(--text-secondary)";
            const zapTitle = f.notificacao_zap ? "Reenviar Fatura por WhatsApp" : "Enviar Fatura por WhatsApp";
            zapBtn = `<button class="btn btn-secondary btn-sm btn-icon" onclick="sendInvoiceWhatsApp(${f.id}, this)" title="${zapTitle}" style="color: ${zapColor}; border-color: var(--border); background: var(--bg-card); display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--radius-sm); transition: all 0.2s;"><i class="ri-whatsapp-line" style="font-size:14px;"></i></button>`;
        }

        return `
            <tr>
                <td><strong>${escHtml(f.codigo)}</strong></td>
                <td>${partner ? partner.nome : '<span style="color:var(--text-muted);">Parceiro removido</span>'}</td>
                <td style="white-space: nowrap;">
                    ${formatDateBr(f.periodoInicio)}${f.periodoInicio !== f.periodoFim ? ' a ' + formatDateBr(f.periodoFim) : ''}
                </td>
                <td style="white-space: nowrap;">
                    ${formatDateBr(f.criadoEm)}
                    <div style="font-size: 11px; color: var(--text-muted);">${escHtml(f.criadoPor || '—')}</div>
                </td>
                <td style="text-align: center; font-weight: 600;">${f.ordensIds.length}</td>
                <td style="text-align: right; font-weight: 700; color: ${f.pago ? 'var(--success)' : 'var(--text-primary)'};">${formatCurrency(f.valorTotal)}</td>
                <td>${statusBadge}</td>
                <td style="white-space: nowrap;">
                    ${f.pago ? formatDateBr(f.pagoEm) : '<span style="color:var(--text-muted);">—</span>'}
                    ${f.pago ? `<div style="font-size: 11px; color: var(--text-muted);">${f.pagoPor || 'não registrado'}</div>` : ''}
                </td>
                <td>${boletoBadge}</td>
                <td>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="printInvoiceById(${f.id})" title="1. Imprimir / PDF da Fatura"><i class="ri-printer-line"></i></button>
                        <button class="btn btn-secondary btn-sm btn-icon" onclick="forwardInvoice(${f.id}, this)" title="2. Encaminhar por E-mail + WhatsApp (sem cobrança)"><i class="ri-mail-send-line"></i></button>
                        ${asaasBtn}
                        ${zapBtn}
                        ${!f.pago ? `<button class="btn btn-success btn-sm" onclick="liquidateInvoice(${f.id})" title="4. Dar baixa (registrar pagamento)"><i class="ri-check-line"></i> Baixar</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================================
// BAIXA DE FATURA (novo fluxo — passo 4)
// Pergunta a DATA do pagamento e, quando há cobrança Asaas em aberto, se o
// pagamento foi feito PELO Asaas. Pagamento de hoje entra direto no caixa
// aberto; pagamento em data passada vira PENDÊNCIA para um Master reabrir o
// caixa daquele dia, lançar e re-fechar.
// ==========================================================

// Caixa (aberto OU fechado) da unidade ativa numa data YYYY-MM-DD.
function getCaixaByDate(dateStr) {
    return db.caixa_diario.find(c => c.unidadeId === activeUnitId && c.data === dateStr);
}

function liquidateInvoice(invoiceId) {
    const invoice = db.faturas.find(f => f.id === invoiceId);
    if (!invoice) return;
    if (invoice.pago) { showToast("Esta fatura já está baixada.", "info"); return; }

    const partner = db.parceiros.find(p => p.id === invoice.parceiroId);
    document.getElementById('baixa-fat-id').value = invoice.id;
    document.getElementById('baixa-fat-resumo').value =
        `${invoice.codigo} — ${partner ? partner.nome : ''} — ${formatCurrency(invoice.valorTotal)}`;

    const hojeRadio = document.querySelector('input[name="baixa-quando"][value="hoje"]');
    if (hojeRadio) hojeRadio.checked = true;
    const dataInput = document.getElementById('baixa-data');
    const hojeStr = getLocalDateString(new Date());
    dataInput.value = hojeStr;
    dataInput.max = hojeStr;
    dataInput.style.display = 'none';
    document.getElementById('baixa-forma').value = 'transferencia';
    document.getElementById('baixa-aviso-retroativo').style.display = 'none';

    const asaasBloco = document.getElementById('baixa-asaas-bloco');
    if (invoice.asaas_url || invoice.asaas_payment_id) {
        asaasBloco.style.display = 'block';
        const naoRadio = document.querySelector('input[name="baixa-via-asaas"][value="nao"]');
        if (naoRadio) naoRadio.checked = true;
    } else {
        asaasBloco.style.display = 'none';
    }

    document.getElementById('modal-fat-baixa').classList.add('active');
}

function closeBaixaModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modal-fat-baixa').classList.remove('active');
}

function onBaixaQuandoChange() {
    const sel = document.querySelector('input[name="baixa-quando"]:checked');
    const passado = sel && sel.value === 'passado';
    document.getElementById('baixa-data').style.display = passado ? 'block' : 'none';
    document.getElementById('baixa-aviso-retroativo').style.display = passado ? 'block' : 'none';
}

// Insere a entrada de caixa referente à baixa da fatura.
async function injetarMovimentoBaixa(caixa, invoice, partner, dataISO, forma) {
    const newMov = {
        caixaId: caixa.id,
        tipo: "entrada",
        valor: invoice.valorTotal,
        descricao: `Recebimento Fatura ${invoice.codigo} — ${partner ? partner.nome : ''}`,
        formaPagamento: forma || 'transferencia',
        data: dataISO,
        operador: currentSession ? currentSession.nome : 'Sistema',
        osId: null,
        faturaId: invoice.id
    };
    if (window.useSupabase) {
        const inserted = await sbInsert('caixa_movimentos', newMov);
        db.caixa_movimentos.unshift(inserted);
    } else {
        newMov.id = db.caixa_movimentos.length + 1;
        db.caixa_movimentos.push(newMov);
    }
    return newMov;
}

async function submitBaixaFatura(event) {
    event.preventDefault();
    const invoiceId = parseInt(document.getElementById('baixa-fat-id').value);
    const invoice = db.faturas.find(f => f.id === invoiceId);
    if (!invoice) return;
    if (invoice.pago) { showToast("Fatura já baixada.", "info"); closeBaixaModal(); return; }

    const quandoSel = document.querySelector('input[name="baixa-quando"]:checked');
    const quando = quandoSel ? quandoSel.value : 'hoje';
    const forma = document.getElementById('baixa-forma').value;
    const hojeStr = getLocalDateString(new Date());

    let dataPagStr = hojeStr;
    if (quando === 'passado') {
        dataPagStr = document.getElementById('baixa-data').value;
        if (!dataPagStr) { showToast("Informe a data do pagamento.", "error"); return; }
        if (dataPagStr > hojeStr) { showToast("A data do pagamento não pode ser futura.", "error"); return; }
    }
    const ehRetroativo = dataPagStr < hojeStr;

    // Cobrança Asaas em aberto? Como o pagamento chegou?
    const temAsaas = !!(invoice.asaas_url || invoice.asaas_payment_id);
    let viaAsaas = false;
    if (temAsaas) {
        const r = document.querySelector('input[name="baixa-via-asaas"]:checked');
        viaAsaas = !!(r && r.value === 'sim');
    }

    // Pré-condições de caixa
    if (!ehRetroativo) {
        if (!getTodayOpenCaixa()) {
            showToast("Erro: o caixa de hoje precisa estar ABERTO para lançar a baixa.", "error");
            return;
        }
    } else {
        if (!getCaixaByDate(dataPagStr)) {
            showToast("Não há caixa registrado nessa data. Confira a data correta do pagamento.", "error");
            return;
        }
    }

    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

    try {
        const partner = db.parceiros.find(p => p.id === invoice.parceiroId);

        // 1) Se pagou POR FORA e há cobrança Asaas em aberto → cancelar no Asaas.
        if (temAsaas && !viaAsaas && window.useSupabase) {
            try {
                showToast("Cancelando cobrança em aberto no Asaas...", "info");
                const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-asaas-billing`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sbAuthToken()}` },
                    body: JSON.stringify({ faturaId: invoice.id })
                });
                const d = await res.json().catch(() => ({}));
                if (res.ok && d.status === 'cancelada') {
                    invoice.asaas_payment_id = null; invoice.asaas_url = null;
                    showToast("Cobrança Asaas cancelada.", "success");
                } else if (d.status === 'ja_recebida') {
                    showToast("Atenção: a cobrança já consta RECEBIDA no Asaas. Baixa registrada mesmo assim.", "warning");
                } else if (!res.ok) {
                    showToast("Não foi possível cancelar no Asaas: " + (d.error || 'erro') + ". Baixa segue.", "warning");
                }
            } catch (e) {
                console.error(e);
                showToast("Falha ao cancelar cobrança Asaas (a baixa interna segue).", "warning");
            }
        }

        // 2) Marcar fatura e OS como pagas. Só marca se no BANCO ela ainda
        //    estiver em aberto: o aviso do Asaas pode ter dado baixa (e lançado
        //    no caixa) enquanto esta tela estava aberta.
        const pagoEmISO = ehRetroativo ? instanteNoDiaSP(dataPagStr) : new Date().toISOString();
        const pagoPor = currentSession ? currentSession.nome : 'Sistema';
        const faturaUpdate = { pago: true, pagoEm: pagoEmISO, pagoPor };
        // Só toca nos campos Asaas quando a cobrança foi de fato cancelada acima.
        if (temAsaas && !viaAsaas && invoice.asaas_payment_id === null) {
            faturaUpdate.asaas_payment_id = null;
            faturaUpdate.asaas_url = null;
        }
        const { data: virou, error: erroBaixa } = await supabaseClient.from('faturas')
            .update(faturaUpdate).eq('id', invoice.id).eq('pago', false).select('id');
        if (erroBaixa) throw erroBaixa;
        if (!virou || virou.length === 0) {
            invoice.pago = true;
            showToast(`A fatura ${invoice.codigo} já consta paga no banco (provavelmente pelo aviso do Asaas). Nada foi lançado de novo.`, "warning");
            closeBaixaModal();
            renderFatFaturas();
            return;
        }
        Object.assign(invoice, faturaUpdate);
        const { error: erroOS } = await supabaseClient.from('ordens_servico').update({ pago: true }).in('id', invoice.ordensIds);
        if (erroOS) throw erroOS;
        invoice.ordensIds.forEach(id => { const os = db.ordens_servico.find(o => o.id === id); if (os) os.pago = true; });

        // 3) Lançamento no caixa.
        if (!ehRetroativo) {
            await injetarMovimentoBaixa(getTodayOpenCaixa(), invoice, partner, pagoEmISO, forma);
            showToast(`Fatura ${invoice.codigo} baixada! Entrada lançada no caixa de hoje.`, "success");
        } else {
            const caixaDia = getCaixaByDate(dataPagStr);
            const pend = {
                faturaId: invoice.id,
                caixaId: caixaDia.id,
                unidadeId: activeUnitId,
                valor: invoice.valorTotal,
                dataPagamento: dataPagStr,
                formaPagamento: forma,
                descricao: `Recebimento Fatura ${invoice.codigo} — ${partner ? partner.nome : ''} (pgto ${formatDateBr(dataPagStr)})`,
                resolvido: false,
                criadoEm: new Date().toISOString(),
                criadoPor: currentSession ? currentSession.nome : 'Sistema'
            };
            if (!db.baixas_faturas_pendentes) db.baixas_faturas_pendentes = [];
            if (window.useSupabase && window.onlineTables['baixas_faturas_pendentes']) {
                const saved = await sbInsert('baixas_faturas_pendentes', pend);
                db.baixas_faturas_pendentes.unshift(saved);
            } else {
                pend.id = db.baixas_faturas_pendentes.length + 1;
                db.baixas_faturas_pendentes.unshift(pend);
            }
            showToast(`Fatura ${invoice.codigo} baixada! Pendência criada: um Master precisa reabrir o caixa de ${formatDateBr(dataPagStr)}, lançar e re-fechar.`, "success");
        }

        saveDatabase();
        logAudit("Faturamento Baixa", `Baixou fatura ${invoice.codigo} (${formatCurrency(invoice.valorTotal)}) — pgto ${formatDateBr(dataPagStr)}${ehRetroativo ? ' [retroativo/pendente]' : ''}.`);
        atualizarBadgeCaixa();
        closeBaixaModal();
        renderFatFaturas();
    } catch (err) {
        console.error("Erro ao dar baixa:", err);
        showToast("Erro ao processar a baixa da fatura: " + (err.message || err), "error");
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
}

// ---- Pendências de baixa retroativa + badge de notificação ----
function baixasPendentesAbertas() {
    return (db.baixas_faturas_pendentes || []).filter(b => !b.resolvido && b.unidadeId === activeUnitId);
}

// Badge tipo "notificação de app" no menu Caixa Diário.
function atualizarBadgeCaixa() {
    const nav = document.getElementById('nav-caixa');
    if (!nav) return;
    let badge = document.getElementById('nav-caixa-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'nav-caixa-badge';
        badge.style.cssText = 'margin-left:auto; background:var(--danger); color:#fff; font-size:9px; font-weight:800; min-width:18px; text-align:center; padding:2px 6px; border-radius:10px;';
        nav.appendChild(badge);
    }
    const n = baixasPendentesAbertas().length;
    if (n > 0) { badge.textContent = n; badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; }
}

// Lista as baixas retroativas pendentes no painel do Caixa.
function renderBaixasPendentes() {
    const card = document.getElementById('card-baixas-pendentes');
    const tbody = document.getElementById('baixas-pendentes-tbody');
    const contador = document.getElementById('baixas-pendentes-contador');
    if (!card || !tbody) return;

    const lista = baixasPendentesAbertas();
    if (lista.length === 0) {
        card.style.display = 'none';
        tbody.innerHTML = '';
        if (contador) contador.textContent = '';
        return;
    }
    card.style.display = 'block';
    if (contador) contador.textContent = `(${lista.length})`;

    const master = isMasterSession();
    tbody.innerHTML = lista.map(b => {
        const inv = db.faturas.find(f => f.id === b.faturaId);
        const acao = master
            ? `<button class="btn btn-danger btn-sm" onclick="resolverBaixaPendente(${b.id})"><i class="ri-lock-unlock-line"></i> Reabrir e lançar</button>`
            : `<span style="font-size:11px; color:var(--text-muted);">Aguardando Master</span>`;
        return `
            <tr style="border-top: 1px solid var(--border);">
                <td style="padding: 10px 14px;"><strong>${inv ? inv.codigo : ('#' + b.faturaId)}</strong></td>
                <td style="padding: 10px 14px; white-space: nowrap;">${formatDateBr(b.dataPagamento)}</td>
                <td style="padding: 10px 14px; text-align: right; font-weight: 600;">${formatCurrency(b.valor)}</td>
                <td style="padding: 10px 14px;">${escHtml(b.criadoPor || '—')}</td>
                <td style="padding: 10px 14px; text-align: right;">${acao}</td>
            </tr>
        `;
    }).join('');
}

// Master reabre o caixa do dia da pendência, lança a entrada e marca resolvida.
async function resolverBaixaPendente(pendId) {
    if (!isMasterSession()) {
        showToast("Apenas operadores Master podem reabrir caixas para lançar baixas retroativas.", "error");
        return;
    }
    const pend = (db.baixas_faturas_pendentes || []).find(b => b.id === pendId);
    if (!pend || pend.resolvido) return;
    const invoice = db.faturas.find(f => f.id === pend.faturaId);
    const partner = invoice ? db.parceiros.find(p => p.id === invoice.parceiroId) : null;
    let caixa = db.caixa_diario.find(c => c.id === pend.caixaId);
    if (!caixa) {
        // Pagamento avisado pelo Asaas num dia sem caixa: entra no caixa de hoje
        const hoje = getTodayOpenCaixa();
        if (!hoje) { showToast("Não havia caixa no dia do pagamento. Abra o caixa de hoje para lançar esta entrada.", "error"); return; }
        if (!confirm(`Não havia caixa em ${formatDateBr(pend.dataPagamento)}. Lançar ${formatCurrency(pend.valor)} (Fatura ${invoice ? invoice.codigo : ''}) no caixa de HOJE?`)) return;
        try {
            await injetarMovimentoBaixa(hoje, invoice || { id: pend.faturaId, codigo: '', valorTotal: pend.valor }, partner, new Date().toISOString(), pend.formaPagamento);
            const resolvidoEm = new Date().toISOString();
            const resolvidoPor = currentSession ? currentSession.nome : 'Master';
            await sbUpdate('baixas_faturas_pendentes', pend.id, { resolvido: true, resolvidoEm, resolvidoPor, caixaId: hoje.id });
            Object.assign(pend, { resolvido: true, resolvidoEm, resolvidoPor, caixaId: hoje.id });
            atualizarBadgeCaixa();
            logAudit("Baixa Pendente", `Lançou no caixa de hoje a baixa da fatura ${invoice ? invoice.codigo : pend.faturaId} (pagamento de ${formatDateBr(pend.dataPagamento)}).`);
            showToast("Entrada lançada no caixa de hoje.", "success");
            renderCaixaPage();
        } catch (err) {
            console.error("Erro ao resolver baixa pendente:", err);
            showToast("Erro ao lançar a baixa: " + (err.message || err), "error");
        }
        return;
    }

    if (!confirm(`Reabrir o caixa de ${formatDateBr(pend.dataPagamento)} e lançar ${formatCurrency(pend.valor)} (Fatura ${invoice ? invoice.codigo : ''})?\n\nApós lançar, o caixa ficará ABERTO no "Modo Dia Reaberto" para você conferir e re-fechar.`)) return;

    try {
        // 1) Lança a entrada no caixa daquele dia (back-dated).
        const dataISO = instanteNoDiaSP(pend.dataPagamento);
        await injetarMovimentoBaixa(caixa, invoice || { id: pend.faturaId, codigo: '', valorTotal: pend.valor }, partner, dataISO, pend.formaPagamento);

        // 2) Marca a pendência como resolvida.
        pend.resolvido = true;
        pend.resolvidoEm = new Date().toISOString();
        pend.resolvidoPor = currentSession ? currentSession.nome : 'Master';
        if (window.useSupabase && window.onlineTables['baixas_faturas_pendentes']) {
            await sbUpdate('baixas_faturas_pendentes', pend.id, {
                resolvido: true, resolvidoEm: pend.resolvidoEm, resolvidoPor: pend.resolvidoPor
            });
        }
        saveDatabase();
        atualizarBadgeCaixa();
        logAudit("Baixa Retroativa", `Lançou baixa retroativa da fatura ${invoice ? invoice.codigo : pend.faturaId} no caixa de ${formatDateBr(pend.dataPagamento)}.`);

        // 3) Reabre o caixa daquele dia para conferência e re-fechamento (fluxo existente).
        showToast("Entrada lançada. Reabrindo o caixa para conferência e re-fechamento...", "success");
        if (typeof reopenCaixa === 'function' && caixa.status === 'fechado') {
            await reopenCaixa(caixa.id);
        } else if (typeof renderCaixaPage === 'function') {
            renderCaixaPage();
        }
    } catch (err) {
        console.error("Erro ao resolver baixa pendente:", err);
        showToast("Erro ao lançar a baixa retroativa.", "error");
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
            <td style="padding: 6px;"><strong>${escHtml(o.numero)}</strong></td>
            <td style="padding: 6px;"><strong>${escHtml(o.placa)}</strong></td>
            <td style="padding: 6px;">${escHtml(o.veiculoMarcaModelo || '—')}</td>
            <td style="padding: 6px; text-align: center;">${escHtml(o.veiculoAno || '—')}</td>
            <td style="padding: 6px;">${o.servicoNome.split(' — ')[0]}</td>
            <td style="padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(o.valor)}</td>
        </tr>
    `).join('');

    if (!osRows) {
        osRows = `<tr><td colspan="6" style="text-align: center; padding: 12px; color: #666;">Nenhuma OS vinculada a esta fatura.</td></tr>`;
    }

    const totalExtras = totalExtrasDaFatura(f);
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = `
        <div class="print-header">
            <div style="display:flex; align-items:center; gap:12px;">
                ${certiveShieldSvg(38)}
                <div>
                    <h1 style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; color: ${CERTIVE_NAVY};">CERTIVE VISTORIAS</h1>
                    <p style="font-size: 10px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Faturamento de Parceiros — Demonstrativo de Cobrança</p>
                </div>
            </div>
            <div class="print-logo-dummy" style="font-size: 16px; padding: 6px 12px; color:${CERTIVE_NAVY}; border-color:${CERTIVE_NAVY};">FATURA ${escHtml(f.codigo)}</div>
        </div>

        <div style="margin-bottom: 24px; font-size: 12px; line-height: 1.6; display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; border-bottom: 1px solid #000; padding-bottom: 16px;">
            <div>
                <strong>Prestador:</strong> ${escHtml(unit.nome)}<br>
                <strong>Endereço:</strong> ${escHtml(unit.endereco)}<br>
                <strong>Período de Referência:</strong> ${formatDateBr(f.periodoInicio)} a ${formatDateBr(f.periodoFim)}
            </div>
            <div>
                <strong>Tomador (Parceiro):</strong> ${escHtml(partner.nome)}<br>
                <strong>CPF/CNPJ:</strong> ${escHtml(partner.cnpj)}<br>
                <strong>Responsável:</strong> ${escHtml(partner.responsavel || '—')}<br>
                <strong>Contato:</strong> ${escHtml(partner.telefone)}
            </div>
        </div>

        <div style="margin-bottom: 20px; font-size: 12px; line-height: 1.6; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <strong>Data de Emissão:</strong> ${formatDateBr(f.criadoEm)} por ${escHtml(f.criadoPor)}<br>
                <strong>Status de Pagamento:</strong> ${f.pago ? `PAGO EM ${formatDateBr(f.pagoEm)}` : 'AGUARDANDO PAGAMENTO'}
            </div>
            <div style="text-align: right;">
                ${totalExtras > 0 ? `<span style="font-size: 11px;">Outras cobranças: ${formatCurrency(totalExtras)}</span><br>` : ''}
                <span style="font-size: 14px; font-weight: 800; color: #000;">VALOR TOTAL: ${formatCurrency(f.valorTotal)}</span>
            </div>
        </div>

        ${oss.length || !totalExtras ? `
        <div class="print-section" style="border: 1px solid #000; margin-bottom: 20px; border-radius: 4px; overflow: hidden;">
            <div class="print-section-title" style="font-weight: 800; font-size: 12px; background: #eee; padding: 8px 12px; border-bottom: 1px solid #000;">DEMONSTRATIVO DE SERVIÇOS PRESTADOS</div>
            <div style="padding: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; text-align: left; font-size: 10px; color: #333; text-transform: uppercase;">
                            <th style="padding: 6px;">OS</th>
                            <th style="padding: 6px;">Placa</th>
                            <th style="padding: 6px;">Modelo do Veículo</th>
                            <th style="padding: 6px; text-align: center;">Ano</th>
                            <th style="padding: 6px;">Tipo de Serviço</th>
                            <th style="padding: 6px; text-align: right;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${osRows}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}

        ${htmlOutrasCobrancasFatura(f)}

        ${buildPaymentInstructionsHtml(f)}

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

// ============================================================
// CONTAS A PAGAR — separação por COMPETÊNCIA (mês de referência)
// Invariante: cards e lista saem SEMPRE do mesmo array filtrado.
// ============================================================
let contasCompetenciaSel = null;   // "YYYY-MM" da competência selecionada
let contasStatusFiltro = null;     // null | 'paga' | 'vencida' | 'a_pagar'

const MESES_PT = {
    '01':'Janeiro','02':'Fevereiro','03':'Março','04':'Abril','05':'Maio','06':'Junho',
    '07':'Julho','08':'Agosto','09':'Setembro','10':'Outubro','11':'Novembro','12':'Dezembro'
};

function mesLabelPt(ym) {
    if (!ym || ym.length < 7) return ym || '';
    return `${MESES_PT[ym.substring(5,7)]}/${ym.substring(0,4)}`;
}

// Mês (YYYY-MM) da COMPETÊNCIA da conta. Usa o campo competencia; se ausente
// (registros antigos, antes do backfill), cai no mês do vencimento.
function competenciaMes(c) {
    if (c.competencia) return String(c.competencia).substring(0, 7);
    if (c.vencimento) return String(c.vencimento).substring(0, 7);
    return null;
}

// Primeiro dia do mês de competência da conta, como Date. Usado pelos filtros
// por janela (ex.: últimos 30 dias) do Painel BI.
function competenciaDataConta(c) {
    const m = competenciaMes(c);
    return m ? new Date(`${m}-01T00:00:00`) : null;
}

// Hoje "YYYY-MM-DD" no fuso LOCAL (evita o bug de UTC do new Date('YYYY-MM-DD')).
function hojeLocalStr() {
    return diaSP();
}

// Status derivado em runtime (mutuamente exclusivo). Comparação por string YYYY-MM-DD.
function statusConta(c) {
    if (c.pago) return 'paga';
    const venc = c.vencimento ? String(c.vencimento).substring(0, 10) : null;
    if (venc && venc < hojeLocalStr()) return 'vencida';
    return 'a_pagar';
}

function mudarCompetencia(delta) {
    if (!contasCompetenciaSel) contasCompetenciaSel = hojeLocalStr().substring(0, 7);
    let [y, m] = contasCompetenciaSel.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    contasCompetenciaSel = `${y}-${String(m).padStart(2,'0')}`;
    contasStatusFiltro = null;
    renderContasGerais();
}
function irParaCompetencia(ym) {
    if (!ym) return;
    contasCompetenciaSel = ym;
    contasStatusFiltro = null;
    renderContasGerais();
}
function filtrarContasPorStatus(status) {
    contasStatusFiltro = (contasStatusFiltro === status) ? null : status;
    renderContasGerais();
}
function limparFiltroContas() {
    contasStatusFiltro = null;
    renderContasGerais();
}

// Sugere a competência (YYYY-MM) a partir do vencimento, se ainda estiver vazia.
function prefillCompetencia(prefixo) {
    const venc = document.getElementById(prefixo + '-vencimento');
    const comp = document.getElementById(prefixo + '-competencia');
    if (!venc || !comp) return;
    if (venc.value && !comp.value) comp.value = venc.value.substring(0, 7);
}

// Seletor de mês ( ‹  Mês/Ano  › )
function renderContasSeletorMes() {
    const nav = document.getElementById('contas-mes-nav');
    if (!nav) return;
    nav.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px; flex-wrap:wrap;">
            <div style="flex:1; min-width:110px;"></div>
            <div style="display:flex; align-items:center; gap:14px;">
                <button class="btn btn-secondary btn-sm btn-icon" onclick="mudarCompetencia(-1)" title="Competência anterior" style="padding:6px 10px;"><i class="ri-arrow-left-s-line"></i></button>
                <div style="min-width:170px; text-align:center; font-family:Outfit,sans-serif; font-weight:800; font-size:16px; color:var(--text-primary);">
                    <i class="ri-calendar-line" style="color:var(--accent); margin-right:6px;"></i>${mesLabelPt(contasCompetenciaSel)}
                </div>
                <button class="btn btn-secondary btn-sm btn-icon" onclick="mudarCompetencia(1)" title="Próxima competência" style="padding:6px 10px;"><i class="ri-arrow-right-s-line"></i></button>
            </div>
            <div style="flex:1; min-width:110px; display:flex; justify-content:flex-end;">
                <button class="btn btn-primary btn-sm" onclick="gerarRelatorioContas()" title="Gerar PDF das contas desta competência"><i class="ri-file-download-line"></i> Gerar Relatório</button>
            </div>
        </div>`;
}

// Banner de contas vencidas em competências ANTERIORES (informativo, fora dos totais)
function renderContasBannerAtrasadas() {
    const box = document.getElementById('contas-banner-atrasadas');
    if (!box) return;
    const hoje = hojeLocalStr();
    const antigas = db.contas_pagar.filter(c =>
        c.unidadeId === activeUnitId &&
        !c.pago &&
        c.vencimento && String(c.vencimento).substring(0,10) < hoje &&
        competenciaMes(c) && competenciaMes(c) < contasCompetenciaSel
    );
    if (antigas.length === 0) { box.innerHTML = ''; return; }
    const total = antigas.reduce((s, c) => somaCentavos(s, c.valor), 0);
    const maisAntiga = antigas.slice().sort((a,b) => competenciaMes(a).localeCompare(competenciaMes(b)))[0];
    const mesAlvo = competenciaMes(maisAntiga);
    box.innerHTML = `
        <div onclick="irParaCompetencia('${mesAlvo}')" title="Ir para a competência mais antiga em aberto" style="cursor:pointer; display:flex; align-items:center; gap:10px; padding:10px 14px; margin-bottom:16px; border:1px solid var(--danger); background:rgba(239,68,68,0.06); border-radius:var(--radius-sm);">
            <i class="ri-alarm-warning-line" style="color:var(--danger); font-size:18px;"></i>
            <span style="font-size:13px; color:var(--text-primary); font-weight:600;">
                ${antigas.length} ${antigas.length === 1 ? 'conta vencida' : 'contas vencidas'} em competências anteriores — <strong style="color:var(--danger);">${formatCurrency(total)}</strong>
            </span>
            <span style="margin-left:auto; font-size:12px; font-weight:700; color:var(--accent);">ver ›</span>
        </div>`;
}

// Cards — recebem o MESMO array que alimenta a lista
function renderContasKPIs(contasDoMes) {
    const kpiGrid = document.getElementById('contas-kpis-grid');
    if (!kpiGrid) return;
    const val = c => Number(c.valor) || 0;
    const soma = arr => arr.reduce((s, c) => s + val(c), 0);

    const pagas    = contasDoMes.filter(c => statusConta(c) === 'paga');
    const vencidas = contasDoMes.filter(c => statusConta(c) === 'vencida');
    const aPagar   = contasDoMes.filter(c => statusConta(c) === 'a_pagar');
    const pagasAtraso = pagas.filter(c => c.pagoEm && c.vencimento && String(c.vencimento).substring(0,10) < String(c.pagoEm).substring(0,10)).length;

    const card = (label, valor, qtd, cor, corBg, icon, onclick, ativo, sub) => `
        <div class="kpi-card" onclick="${onclick}" style="cursor:pointer; border:1.5px solid ${ativo ? cor : 'var(--border)'}; background:${ativo ? corBg : 'var(--bg-secondary)'}; display:flex; align-items:center; padding:16px; border-radius:var(--radius); box-shadow:var(--shadow); width:100%; box-sizing:border-box; transition:var(--transition);">
            <div class="kpi-icon" style="color:${cor}; background:${corBg}; width:44px; height:44px; display:flex; align-items:center; justify-content:center; border-radius:var(--radius-sm); font-size:22px; margin-right:14px; flex-shrink:0; border:1px solid ${cor}55;"><i class="${icon}"></i></div>
            <div class="kpi-info" style="display:flex; flex-direction:column;">
                <span class="kpi-label" style="font-size:9px; font-weight:700; color:var(--text-secondary); letter-spacing:0.5px; text-transform:uppercase;">${label}</span>
                <h3 class="kpi-value" style="font-size:18px; font-weight:800; color:${cor}; margin:2px 0 0 0;">${formatCurrency(valor)}</h3>
                <span class="kpi-subtext" style="font-size:10px; color:var(--text-muted); margin-top:1px;">${qtd} ${qtd === 1 ? 'conta' : 'contas'}${sub || ''}</span>
            </div>
        </div>`;

    kpiGrid.innerHTML =
        card('Total do Mês', soma(contasDoMes), contasDoMes.length, 'var(--text-primary)', 'var(--navy-light)', 'ri-wallet-3-line', 'limparFiltroContas()', !contasStatusFiltro, '') +
        card('A Pagar', soma(aPagar), aPagar.length, 'var(--warning)', 'rgba(245,158,11,0.08)', 'ri-time-line', "filtrarContasPorStatus('a_pagar')", contasStatusFiltro === 'a_pagar', '') +
        card('Vencidas', soma(vencidas), vencidas.length, 'var(--danger)', 'rgba(239,68,68,0.08)', 'ri-error-warning-line', "filtrarContasPorStatus('vencida')", contasStatusFiltro === 'vencida', '') +
        card('Pagas', soma(pagas), pagas.length, 'var(--success)', 'rgba(16,185,129,0.08)', 'ri-checkbox-circle-line', "filtrarContasPorStatus('paga')", contasStatusFiltro === 'paga', pagasAtraso > 0 ? ` · ${pagasAtraso} em atraso` : '');
}

function renderContasGerais() {
    if (!db.contas_pagar) return;
    if (!contasCompetenciaSel) contasCompetenciaSel = hojeLocalStr().substring(0, 7);

    // >>> ÚNICA fonte de dados: unidade ativa + COMPETÊNCIA selecionada <<<
    const contasDoMes = db.contas_pagar
        .filter(c => c.unidadeId === activeUnitId)
        .filter(c => competenciaMes(c) === contasCompetenciaSel);

    renderContasSeletorMes();
    renderContasBannerAtrasadas();
    renderContasKPIs(contasDoMes);   // cards do MESMO array

    const tbody = document.getElementById('contas-tbody');

    // Lista = mesmo array; filtro opcional por status (clique no card)
    let list = contasStatusFiltro
        ? contasDoMes.filter(c => statusConta(c) === contasStatusFiltro)
        : contasDoMes;

    // Ordenação: vencidas no topo, depois por vencimento crescente
    list = list.slice().sort((a, b) => {
        const va = statusConta(a) === 'vencida' ? 0 : 1;
        const vb = statusConta(b) === 'vencida' ? 0 : 1;
        if (va !== vb) return va - vb;
        return String(a.vencimento || '').localeCompare(String(b.vencimento || ''));
    });

    if (list.length === 0) {
        const msg = contasStatusFiltro
            ? `Nenhuma conta com esse status em ${mesLabelPt(contasCompetenciaSel)}.`
            : `Nenhuma conta lançada em ${mesLabelPt(contasCompetenciaSel)}.`;
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--text-muted);">${msg}</td></tr>`;
        return;
    }

    const isGerenteGeral = currentSession && currentSession.funcao && currentSession.funcao.toLowerCase().includes("gerente");
    const badgeStatus = {
        paga: '<span class="badge badge-done">Paga</span>',
        vencida: '<span class="badge" style="background:var(--danger-bg); color:var(--danger); border:1px solid var(--danger);">Vencida</span>',
        a_pagar: '<span class="badge badge-waiting">A pagar</span>'
    };

    tbody.innerHTML = list.map(c => {
        const statusBadge = badgeStatus[statusConta(c)] || '';

        const obsHtml = c.observacoes
            ? `<br><small style="color: var(--text-secondary); font-weight: 500; display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;">
                <i class="ri-barcode-line" style="font-size: 12px;"></i> ${escHtml(c.observacoes)}
                <button onclick="copyToClipboard('${escHtml(c.observacoes)}')" title="Copiar código de barras" style="background: none; border: none; padding: 2px; color: var(--accent); cursor: pointer; display: inline-flex; align-items: center; font-size: 11px;">
                    <i class="ri-file-copy-line"></i>
                </button>
               </small>`
            : '';

        const anexoHtml = (c.temAnexo || c.anexo)
            ? `<button class="btn btn-secondary btn-sm btn-icon" onclick="previewExpenseAttachment(${c.id})" title="Visualizar Fatura" style="padding: 4px; display: inline-flex; align-items: center; justify-content: center;"><i class="ri-eye-line" style="font-size: 14px;"></i></button>`
            : '<span style="color: var(--text-muted); font-size: 12px;">—</span>';

        const comprovanteHtml = (c.temComprovante || c.comprovante)
            ? `<button class="btn btn-success btn-sm btn-icon" onclick="previewExpenseComprovante(${c.id})" title="Visualizar Comprovante" style="padding: 4px; display: inline-flex; align-items: center; justify-content: center;"><i class="ri-checkbox-circle-line" style="font-size: 14px;"></i></button>`
            : '<span style="color: var(--text-muted); font-size: 12px;">—</span>';

        // O criador da conta ou o Gerente Geral podem editar/excluir
        const canDeleteOrEdit = isGerenteGeral || 
                                (c.criadoPor === currentSession.nome) || 
                                (c.criadoPor === currentSession.login);

        return `
            <tr>
                <td><span style="font-size:12px; font-weight:700; color:var(--accent); white-space:nowrap;">${mesLabelPt(competenciaMes(c))}</span></td>
                <td><strong>${formatDateBr(c.vencimento)}</strong></td>
                <td>
                    <strong>${escHtml(c.descricao)}</strong>
                    ${obsHtml}
                    ${(c.fornecedor || c.categoria) ? `<br><small style="color:var(--text-muted); font-size:11px;">${escHtml(c.fornecedor || '')}${(c.fornecedor && c.categoria) ? ' · ' : ''}${escHtml(c.categoria || '')}</small>` : ''}
                </td>
                <td><span class="badge badge-progress">${(c.tipo || '').toUpperCase()}</span></td>
                <td><span style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">${escHtml(c.criadoPor || 'Sistema')}</span></td>
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

    // Competência (mês de referência). Padrão = mês do vencimento; gravada no dia 1.
    const compMes = (document.getElementById('desp-competencia').value) || (venc ? venc.substring(0, 7) : '');
    const competencia = compMes ? normalizarCompetencia(`${compMes}-01`, venc) : null;

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
            competencia: competencia,
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
    document.getElementById('edit-conta-competencia').value = competenciaMes(conta) || '';
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
    const compMes = (document.getElementById('edit-conta-competencia').value) || (venc ? venc.substring(0, 7) : '');
    const competencia = compMes ? normalizarCompetencia(`${compMes}-01`, venc) : null;
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
            competencia: competencia,
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
    
    const todayStr = diaSP();
    
    document.getElementById('detalhes-os-body').innerHTML = `
        <div class="form-group" style="margin-bottom: 16px;">
            <label style="font-weight:600;">Descrição da Despesa</label>
            <input type="text" value="${escHtml(expense.descricao)}" readonly style="width:100%; padding:8px; background:var(--bg-secondary); border:1px solid var(--border); color:var(--text-primary); border-radius:var(--radius-sm);">
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

async function previewExpenseComprovante(id) {
    const expense = db.contas_pagar.find(c => c.id === id);
    // O comprovante não vem no carregamento inicial (base64 pesado): busca agora.
    if (expense && !expense.comprovante && expense.temComprovante && typeof carregarCampoPesado === 'function') {
        showToast("Carregando comprovante...", "info");
        try {
            await carregarCampoPesado('contas_pagar', id, 'comprovante');
        } catch (e) {
            showToast("Não foi possível carregar o comprovante.", "error");
            return;
        }
    }
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

async function previewExpenseAttachment(id) {
    const expense = db.contas_pagar.find(c => c.id === id);
    // O anexo não vem no carregamento inicial (base64 pesado): busca agora.
    if (expense && !expense.anexo && expense.temAnexo && typeof carregarCampoPesado === 'function') {
        showToast("Carregando anexo...", "info");
        try {
            await carregarCampoPesado('contas_pagar', id, 'anexo');
        } catch (e) {
            showToast("Não foi possível carregar o anexo.", "error");
            return;
        }
    }
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
        const gastoAtual = unitExpenses.filter(c => c.categoria === cat && c.vencimento.startsWith(currentMonthStr)).reduce((sum, c) => somaCentavos(sum, c.valor), 0);
        const gastoAnterior = unitExpenses.filter(c => c.categoria === cat && c.vencimento.startsWith(prevMonthStr)).reduce((sum, c) => somaCentavos(sum, c.valor), 0);
        const meta = unitMetas[cat] || 0;
        
        // Historical average including all months in the DB for this unit
        const allMonths = [...new Set(unitExpenses.filter(c => c.categoria === cat).map(c => c.vencimento.substring(0, 7)))];
        const numMonths = allMonths.length || 1;
        const totalCatGastos = unitExpenses.filter(c => c.categoria === cat).reduce((sum, c) => somaCentavos(sum, c.valor), 0);
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
                    <td><strong>${escHtml(v.fornecedor)}</strong></td>
                    <td><span class="badge badge-secondary" style="font-size: 11px; background: var(--bg-secondary); color: var(--text-secondary);">${escHtml(v.categoria)}</span></td>
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
        const gastoAtual = currentExpenses.filter(c => c.categoria === cat).reduce((sum, c) => somaCentavos(sum, c.valor), 0);
        const gastoAnterior = prevExpenses.filter(c => c.categoria === cat).reduce((sum, c) => somaCentavos(sum, c.valor), 0);
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
                Olá, Ricardo! Analisei os lançamentos de contas a pagar da unidade <strong>${escHtml(db.unidades.find(u => u.id === activeUnitId)?.nome || 'Unidade')}</strong> e aqui estão as minhas observações inteligentes:
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
                    A categoria <strong>${escHtml(item.categoria)}</strong> atingiu <strong>${formatCurrency(item.gasto)}</strong>, superando a meta definida de <strong>${formatCurrency(item.meta)}</strong> em <strong>${formatCurrency(item.excesso)}</strong> (+${((item.excesso/item.meta)*100).toFixed(1)}%). 
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
                    Os gastos na categoria <strong>${escHtml(item.categoria)}</strong> subiram <strong>${item.aumentoPct.toFixed(1)}%</strong> em relação ao mês anterior (de <strong>${formatCurrency(item.anterior)}</strong> para <strong>${formatCurrency(item.atual)}</strong>, uma alta de <strong>${formatCurrency(item.aumentoNominal)}</strong>).
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
                Identifiquei o lançamento de despesa variável <strong>${escHtml(detranExpense.descricao)}</strong> no valor de <strong>${formatCurrency(detranExpense.valor)}</strong>.
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
    const year = String(new Date().getFullYear());
    const tbody = document.getElementById('detran-calculo-tbody');
    const launchBtn = document.getElementById('btn-lancar-detran');

    // Laudos cobrados pelo DETRAN no mês (mesma base do sincronizador da provisão)
    const monthlyOSs = laudosDetranDoMes(year, month, activeUnitId);

    // Group count by Service type
    let totals = [];
    let grandTotal = 0;

    db.servicos.forEach(s => {
        if (!servicoGeraLaudoDetran(s.id)) return; // cautelar/pesquisa não entram na guia
        const count = monthlyOSs.filter(o => o.servicoId === s.id).length;
        const taxRate = taxaDetranDoServico(s.id);
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
    const MESES_PT = {
        '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
        '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
        '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    };
    const monthLabel = MESES_PT[String(month).padStart(2, '0')] || String(month);
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
        competencia: `${year}-${document.getElementById('detran-calculo-mes').value}-01`, // mês de referência das OS
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
        const m = competenciaMes(c);
        if (m) dates.add(m);
    });

    if (dates.size === 0) {
        dates.add("2026-05");
        dates.add("2026-06");
        dates.add("2026-07");
    }

    // Garante que o mês atual sempre exista como opção (mesmo sem dados ainda)
    const mesAtual = new Date().toISOString().substring(0, 7);
    dates.add(mesAtual);

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
        // Padrão ao abrir o BI: mês atual (com reserva para o mês mais recente com dados)
        if (dates.has(mesAtual)) {
            select.value = mesAtual;
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
    const corteMes = typeof inicioJanelaCarga === 'function' ? inicioJanelaCarga().slice(0, 7) : '';
    garantirHistoricoCompleto(period === 'todos' || (/^\d{4}-\d{2}$/.test(period) && period <= corteMes), renderBI);
    const capitalCustom = parseFloat(document.getElementById('bi-capital-investido').value) || null;

    let OSs = [];
    let Expenses = [];
    const today = new Date();

    // As despesas entram no período pela COMPETÊNCIA (mês de referência), não
    // pelo vencimento. A guia do DETRAN de julho vence em 10/08: ela é custo de
    // julho, não de agosto. Usar vencimento aqui jogava o custo de um mês no
    // resultado do mês seguinte — e os KPIs deste painel são de competência.
    if (period === '30') {
        const startDate = new Date();
        startDate.setDate(today.getDate() - 30);
        OSs = db.ordens_servico.filter(o => new Date(o.criadoEm) >= startDate);
        Expenses = db.contas_pagar.filter(c => {
            const d = competenciaDataConta(c);
            return d && d >= startDate;
        });
    } else if (period === 'todos') {
        OSs = [...db.ordens_servico];
        Expenses = [...db.contas_pagar];
    } else {
        OSs = db.ordens_servico.filter(o => o.criadoEm && competenciaLocalDeOS(o.criadoEm) === period);
        Expenses = db.contas_pagar.filter(c => competenciaMes(c) === period);
    }

    if (unitFilter !== 'todas') {
        const uId = parseInt(unitFilter);
        OSs = OSs.filter(o => o.unidadeId === uId);
        Expenses = Expenses.filter(c => c.unidadeId === uId);
    }

    const nonCancelledOSs = OSs.filter(o => o.status !== 'cancelada');
    const osCount = nonCancelledOSs.length;
    // === CÁLCULO DO REGIME DE CAIXA (ENTRADAS REAIS DE DINHEIRO) ===
    let periodMovs = [];
    if (period === '30') {
        const startDate = new Date();
        startDate.setDate(today.getDate() - 30);
        periodMovs = db.caixa_movimentos.filter(m => new Date(m.data) >= startDate);
    } else if (period === 'todos') {
        periodMovs = [...db.caixa_movimentos];
    } else {
        periodMovs = db.caixa_movimentos.filter(m => m.data && getLocalDateString(m.data).slice(0, 7) === period);
    }

    if (unitFilter !== 'todas') {
        const uId = parseInt(unitFilter);
        periodMovs = periodMovs.filter(m => {
            const cx = db.caixa_diario.find(c => c.id === m.caixaId);
            return cx && cx.unidadeId === uId;
        });
    }

    // Saídas de caixa que são despesa de verdade. Depósito no banco é troca de
    // caixa físico por bancário, e pagamento de conta já foi contabilizado na
    // competência dela — nenhum dos dois é custo novo. Movimento antigo sem
    // natureza gravada conta como despesa, que era o comportamento assumido.
    const caixaDespesasVal = periodMovs
        .filter(m => m.tipo === 'saida' && (!m.natureza || m.natureza === 'despesa'))
        .reduce((sum, m) => somaCentavos(sum, m.valor), 0);


    // Custos e Despesas (exclui lançamentos manuais do DETRAN para não duplicar com o cálculo de taxas das OSs)
    const fixedExpensesVal = Expenses.filter(c => c.tipo === 'fixo').reduce((sum, c) => somaCentavos(sum, c.valor), 0);
    const variableExpensesVal = Expenses.filter(c => (c.tipo === 'variavel' || c.tipo === 'variável') && c.fornecedor !== "DETRAN-SC").reduce((sum, c) => somaCentavos(sum, c.valor), 0);
    
    // Taxas operacionais do DETRAN — mesma regra da guia (ver laudosDetranDoMes).
    // A versão anterior somava a taxa de toda OS com valor > 0, sem olhar o tipo
    // de serviço: só acertava porque cautelar e pesquisa estão com taxa zerada na
    // tabela, e só excluía os retornos porque eles têm valor zero. Qualquer
    // mudança na tabela de taxas fazia o número derivar em silêncio.
    const variableTaxesVal = nonCancelledOSs.reduce((sum, o) => {
        if (!servicoGeraLaudoDetran(o.servicoId)) return sum;
        if (osEhRetornoDetran(o)) return sum;
        return sum + taxaDetranDoServico(o.servicoId);
    }, 0);

    const totalRevenue = nonCancelledOSs.reduce((sum, o) => somaCentavos(sum, o.valor), 0);
    const totalExpenses = fixedExpensesVal + variableExpensesVal + variableTaxesVal + caixaDespesasVal;
    const netProfit = totalRevenue - totalExpenses;

    const cashInflows = periodMovs.filter(movEhRecebimento);
    const fatPaymentsReceived = cashInflows.filter(m => m.faturaId !== null).reduce((sum, m) => somaCentavos(sum, m.valor), 0);
    const directPaymentsReceived = cashInflows.filter(m => m.faturaId === null).reduce((sum, m) => somaCentavos(sum, m.valor), 0);
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
                    <div class="kpi-label" style="color: var(--text-secondary); font-size: 10px; font-weight: 700; text-transform: uppercase;">Custos Totais (Contas + Taxas + Caixa)</div>
                    <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px;">Contas a pagar da competência, taxas do DETRAN e despesas pagas direto do caixa. Depósitos em banco não entram.</div>
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
                const revenue = partnerOSs.reduce((sum, o) => somaCentavos(sum, o.valor), 0);
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
                            <td><strong>${escHtml(ap.partner.nome)}</strong></td>
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
                selectPartner.innerHTML = activeList.map(p => `<option value="${p.id}">${escHtml(p.nome)}</option>`).join('');
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
                const val = svcOSs.reduce((sum, o) => somaCentavos(sum, o.valor), 0);
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
                val: comboOSs.reduce((sum, o) => somaCentavos(sum, o.valor), 0)
            };

            const comboTransfDetail = {
                id: 8,
                name: 'Vistoria de Transferência Combo (Parceiros)',
                cat: 'Transferência',
                count: comboTransfOSs.length,
                val: comboTransfOSs.reduce((sum, o) => somaCentavos(sum, o.valor), 0)
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
        OSs = db.ordens_servico.filter(o => o.criadoEm && competenciaLocalDeOS(o.criadoEm) === period);
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
        const day = Number(diaSP(o.criadoEm).slice(8, 10));
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

    const particularRev = OSs.filter(o => o.clienteTipo === 'particular').reduce((sum, o) => somaCentavos(sum, o.valor), 0);
    const partnerRev = OSs.filter(o => o.clienteTipo === 'parceiro').reduce((sum, o) => somaCentavos(sum, o.valor), 0);

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

    const tabBackup = document.getElementById('tab-cfg-backup');
    if (tabBackup) tabBackup.style.display = tab === 'backup' ? 'block' : 'none';

    const tabFat = document.getElementById('tab-cfg-faturamento');
    if (tabFat) tabFat.style.display = tab === 'faturamento' ? 'block' : 'none';

    if (tab === 'precos') renderConfigPrecos();
    if (tab === 'parceiros') renderConfigParceiros();
    if (tab === 'operadores') renderConfigOperadores();
    if (tab === 'portarias') renderConfigPortarias();
    if (tab === 'whatsapp') renderConfigWhatsApp();
    if (tab === 'auditoria') runIntegrityAudit();
    if (tab === 'faturamento') renderConfigFaturamento();
}

function renderConfigPage() {
    if (typeof atualizarStatusNotificacoesUI === 'function') atualizarStatusNotificacoesUI();
    if (currentConfigTab === 'precos') renderConfigPrecos();
    else if (currentConfigTab === 'parceiros') renderConfigParceiros();
    else if (currentConfigTab === 'operadores') renderConfigOperadores();
    else if (currentConfigTab === 'portarias') renderConfigPortarias();
    else if (currentConfigTab === 'whatsapp') renderConfigWhatsApp();
    else if (currentConfigTab === 'auditoria') runIntegrityAudit();
    else if (currentConfigTab === 'faturamento') renderConfigFaturamento();
}

function exportEmergencyBackup() {
    try {
        const backupData = {
            versao: "1.0",
            exportadoEm: new Date().toISOString(),
            exportadoPor: currentSession ? currentSession.nome : "Desconhecido",
            banco_local: db,
            fila_sincronizacao: typeof getSyncQueue === 'function' ? getSyncQueue() : [],
            unidadeAtivaId: activeUnitId
        };
        
        const jsonStr = JSON.stringify(backupData, null, 4);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
        const filename = `backup_certive_emergencia_${dateStr}.json`;
        
        const tempLink = document.createElement('a');
        tempLink.href = url;
        tempLink.download = filename;
        tempLink.style.display = 'none';
        
        document.body.appendChild(tempLink);
        tempLink.click();
        
        setTimeout(() => {
            document.body.removeChild(tempLink);
            URL.revokeObjectURL(url);
        }, 100);
        
        showToast("Backup de emergência exportado com sucesso!", "success");
    } catch (e) {
        console.error("Erro ao gerar backup de emergência:", e);
        showToast("Erro crítico ao gerar o arquivo de backup.", "error");
    }
}

// Config: Tabela de Preços e Taxas
function renderConfigPrecos() {
    const precosContainer = document.getElementById('config-precos-inputs');
    const taxasContainer = document.getElementById('config-taxas-inputs');

    precosContainer.innerHTML = db.servicos.map(s => `
        <div class="form-group">
            <label>${escHtml(s.nome)}</label>
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
            await sbUpdate('servicos', s.id, { precoBalcao: val }).catch(avisarFalhaGravacao('Preço'));
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
                await sbUpdate('taxas_referencia', refTax.id, { taxa: val }).catch(avisarFalhaGravacao('Preço'));
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
                    <strong>${escHtml(p.nome)}</strong>
                    ${p.parceiroShopping ? '<span class="badge badge-waiting" style="font-size: 10px; padding: 2px 6px; margin-left: 6px;">Shopping</span>' : ''}
                </td>
                <td>${escHtml(p.cnpj)}</td>
                <td>
                    <strong>${escHtml(p.responsavel || '—')}</strong><br>
                    <small style="color: var(--text-secondary); font-weight: 500;">TEL: ${escHtml(p.telefone)}</small>
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
    const mensalidadeValor = lerValorMonetario(document.getElementById('cfg-part-mensalidade-valor').value);
    const mensalidadeDescricao = document.getElementById('cfg-part-mensalidade-desc').value.trim();
    if (mensalidadeValor > 0 && !mensalidadeDescricao) {
        showToast("Informe a descrição da mensalidade (ex.: Aluguel do pátio lateral).", "warning");
        return;
    }

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
        precoComboTransferencia: precoComboTransf,
        mensalidadeDescricao: mensalidadeValor > 0 ? mensalidadeDescricao : null,
        mensalidadeValor: mensalidadeValor > 0 ? mensalidadeValor : null
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
    document.getElementById('cfg-part-mensalidade-desc').value = partner.mensalidadeDescricao || '';
    document.getElementById('cfg-part-mensalidade-valor').value = Number(partner.mensalidadeValor) > 0 ? Number(partner.mensalidadeValor).toFixed(2) : '';

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
                <td style="padding: 8px 0;">${escHtml(s.nome)}</td>
                <td style="text-align: right; padding: 8px 0;">
                    <input type="number" step="0.01" id="edit-matrix-price-${s.id}" value="${currentPrice.toFixed(2)}" style="width: 100px; padding: 4px 8px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); text-align: right;">
                </td>
            </tr>
        `;
    }).join('');

    const bodyHtml = `
        <div class="form-group">
            <label>Parceiro Conveniado</label>
            <strong>${escHtml(partner.nome)}</strong>
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
                <td><strong>${escHtml(o.login)}</strong></td>
                <td>${escHtml(o.nome)}</td>
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
            <td><strong>${escHtml(u.nome)}</strong></td>
            <td>${escHtml(u.endereco)}</td>
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

    if (!login || !senha) {
        showToast("Informe o usuário e a senha do operador.", "error");
        return;
    }
    const checkDuplicate = db.operadores.find(o => o.login && o.login.toLowerCase() === login.toLowerCase());
    if (checkDuplicate) {
        showToast("Erro: Este login de acesso já está em uso.", "error");
        return;
    }

    try {
        // Cria o operador pelo programa seguro no servidor. A senha vai direto
        // para o Supabase Auth (criptografada) — nunca é gravada aqui nem no banco.
        const { data, error } = await supabaseClient.functions.invoke('gerenciar-operador', {
            body: {
                acao: 'criar',
                nome: nome,
                login: login,
                senha: senha,
                funcao: checkedPerms.includes("bi") ? "Gerente" : "Operador",
                unidadeId: unitId,
                permissoes: checkedPerms
            }
        });
        if (error || (data && data.erro)) {
            throw new Error((data && data.erro) || (error && error.message) || "Falha ao criar operador.");
        }
        showToast("Novo operador cadastrado com sucesso!", "success");
        logAudit("Cadastro Operador", `Adicionou operador ${login}.`);
        document.getElementById('config-op-form').reset();
        // Recarrega a lista de operadores a partir do servidor
        try { const ops = await sbSelectAll('operadores'); if (ops) { db.operadores = ops; saveDatabase(); } } catch (_) {}
        renderConfigOperadores();
    } catch (err) {
        console.error(err);
        showToast("Erro ao cadastrar operador: " + err.message, "error");
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
    // Senha começa em branco: preencher só para DEFINIR uma nova senha.
    const campoSenha = document.getElementById('edit-op-senha');
    campoSenha.value = '';
    campoSenha.placeholder = 'Deixe em branco para manter a senha atual';
    campoSenha.required = false;
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

    const novaFuncao = checkedPerms.includes("bi") ? "Gerente" : "Operador";

    try {
        // Atualiza o perfil (sem senha) pelo programa seguro no servidor.
        const { data, error } = await supabaseClient.functions.invoke('gerenciar-operador', {
            body: {
                acao: 'atualizar',
                user_id: op.user_id,
                nome: nome,
                funcao: novaFuncao,
                unidadeId: unitId,
                permissoes: checkedPerms,
                ativo: ativo
            }
        });
        if (error || (data && data.erro)) {
            throw new Error((data && data.erro) || (error && error.message) || "Falha ao atualizar operador.");
        }

        // Se digitou uma nova senha, redefine com segurança (criptografada no servidor).
        if (senha) {
            const r = await supabaseClient.functions.invoke('gerenciar-operador', {
                body: { acao: 'resetar_senha', user_id: op.user_id, senha: senha }
            });
            if (r.error || (r.data && r.data.erro)) {
                throw new Error((r.data && r.data.erro) || "Perfil salvo, mas houve erro ao trocar a senha.");
            }
        }
    } catch (e) {
        console.error(e);
        showToast("Erro ao atualizar operador: " + e.message, "error");
        return;
    }

    // Recarrega o cache local a partir do servidor
    try { const ops = await sbSelectAll('operadores'); if (ops) { db.operadores = ops; saveDatabase(); } } catch (_) {}
    const opAtual = db.operadores.find(o => o.id === opId) || { login, nome, funcao: novaFuncao, permissoes: checkedPerms };

    logAudit("Edição Operador", `Editou configurações do operador: ${opAtual.login}`);
    showToast("Operador atualizado com sucesso!", "success");

    // Fecha modal e recarrega
    document.getElementById('modal-editar-operador').classList.remove('active');
    renderConfigOperadores();

    // Se editou a si mesmo, força atualização da sessão ativa
    if (currentSession && currentSession.id === opId) {
        currentSession.nome = opAtual.nome;
        currentSession.funcao = opAtual.funcao;
        currentSession.permissoes = opAtual.permissoes;
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

// ==========================================================
// PLACA — máscara e validação
// ----------------------------------------------------------
// Os dois padrões brasileiros válidos:
//   antigo   ABC1234  -> 3 letras + 4 números
//   Mercosul ABC1D23  -> 3 letras, 1 número, 1 LETRA, 2 números
//
// A 5ª posição é onde quase todo erro acontece: no Mercosul ela é letra,
// e o operador digita o número parecido. Nas conferências de julho e agosto
// de 2026 foram 21 placas erradas, quase todas ali — 0 no lugar de O ou D,
// 7 no lugar de H, 9 no lugar de J, 4 no lugar de E, 3 no lugar de D.
// ==========================================================

const RE_PLACA_ANTIGA   = /^[A-Z]{3}[0-9]{4}$/;
const RE_PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

// Só letras e números, maiúsculas, no máximo 7 caracteres.
function normalizarPlaca(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

// Exibição com hífen: ABC-1234 / ABC-1D23
function formatarPlaca(v) {
    const p = normalizarPlaca(v);
    return p.length > 3 ? p.slice(0, 3) + '-' + p.slice(3) : p;
}

function placaValida(v) {
    const p = normalizarPlaca(v);
    return RE_PLACA_ANTIGA.test(p) || RE_PLACA_MERCOSUL.test(p);
}

// Explica o que está errado, em vez de só recusar.
function motivoPlacaInvalida(v) {
    const p = normalizarPlaca(v);
    if (p.length === 0) return 'Informe a placa.';
    if (p.length < 7) return `Faltam ${7 - p.length} caractere(s). A placa tem 7.`;
    if (!/^[A-Z]{3}/.test(p)) return 'As 3 primeiras posições têm que ser letras.';
    if (!/^[A-Z]{3}[0-9]/.test(p)) return 'A 4ª posição tem que ser número.';
    if (!/[0-9]{2}$/.test(p)) return 'As 2 últimas posições têm que ser números.';
    if (/^[A-Z]{3}[0-9][0-9]/.test(p) && !RE_PLACA_ANTIGA.test(p)) {
        return 'A 5ª posição está como número. No padrão Mercosul ela é LETRA — confira se não é O, D, H, J, E ou B.';
    }
    return 'Placa fora dos padrões ABC1234 e ABC1D23.';
}

// Aplica a máscara preservando a posição do cursor.
function aplicarMascaraPlaca(input) {
    if (!input) return;
    const antes = input.value.slice(0, input.selectionStart || 0);
    const alfanumAntes = antes.replace(/[^a-zA-Z0-9]/g, '').length;
    input.value = formatarPlaca(input.value);
    // Recoloca o cursor após a mesma quantidade de caracteres alfanuméricos
    let pos = 0, contados = 0;
    while (pos < input.value.length && contados < alfanumAntes) {
        if (/[A-Z0-9]/.test(input.value[pos])) contados++;
        pos++;
    }
    try { input.setSelectionRange(pos, pos); } catch (e) { /* input pode não suportar */ }
}

// Pinta a borda e mostra o motivo enquanto o operador digita.
function validarPlacaVisual(input, msgElId) {
    if (!input) return;
    const msgEl = msgElId ? document.getElementById(msgElId) : null;
    const p = normalizarPlaca(input.value);
    if (p.length === 0) {
        input.style.borderColor = '';
        if (msgEl) msgEl.textContent = '';
        return;
    }
    const ok = placaValida(p);
    input.style.borderColor = ok ? 'var(--success)' : 'var(--danger)';
    if (msgEl) {
        msgEl.textContent = ok ? '' : motivoPlacaInvalida(p);
        msgEl.style.color = 'var(--danger)';
    }
}

function onPlacaInput(input, msgElId) {
    aplicarMascaraPlaca(input);
    validarPlacaVisual(input, msgElId);
    if (typeof checkPlacaLength === 'function') checkPlacaLength();
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
function mostrarFalhaCarregamento() {
    const overlay = document.getElementById('app-loading-overlay') || document.body;
    const caixa = document.createElement('div');
    caixa.id = 'falha-carregamento';
    caixa.style.cssText = 'position:fixed;inset:0;z-index:200000;background:#080d1a;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Outfit,Arial,sans-serif';
    caixa.innerHTML = `<div style="max-width:440px;text-align:center;color:#cbd5e1">
        <h2 style="color:#f8fafc;margin:0 0 12px">Não foi possível carregar o sistema</h2>
        <p style="margin:0 0 20px;line-height:1.5">A conexão com o servidor falhou. Nada foi alterado. Verifique a internet e tente de novo.</p>
        <button onclick="location.reload()" style="padding:12px 24px;background:#d4a017;color:#050811;border:none;border-radius:6px;font-weight:700;cursor:pointer">Tentar novamente</button></div>`;
    document.body.appendChild(caixa);
    if (overlay && overlay.id === 'app-loading-overlay') overlay.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize DB Schema & Seeds
    let dbLoaded = false;
    const isSupabaseConfigured = (typeof supabaseClient !== 'undefined' && supabaseClient !== null);
    
    if (isSupabaseConfigured) {
        window.useSupabase = true;
        // Garante que a sessão de login (se já existir) esteja restaurada ANTES de
        // carregar os dados. Sem isso, a leitura sairia como anônima e — com o banco
        // protegido — viria vazia. Isto evita o "sumiço" de dados na tela.
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session && session.access_token) {
                sbAccessToken = session.access_token;
            } else {
                // Sem sessão válida: não exibir dados sem login (evita tela vazia).
                sessionStorage.removeItem('certive_session');
            }
        } catch (e) { console.warn('getSession no boot falhou:', e); }
        dbLoaded = await loadAllFromSupabase();
    }
    
    if (!dbLoaded) {
        // Sem os dados do banco o sistema NÃO segue: antes caía numa base local com
        // dados fictícios, e o que se registrava nela nunca chegava ao servidor.
        console.error("Não foi possível carregar os dados do sistema.");
        mostrarFalhaCarregamento();
        return;
    } else {
        console.log("🚀 Sistema carregado com sucesso via Supabase!");
    }

    // Iniciar indicador visual de sincronização offline (Fase 3)
    if (typeof updateSyncIndicatorUI === 'function') {
        updateSyncIndicatorUI();
    }
    // Tentar processar a fila se estiver online
    if (typeof processSyncQueue === 'function' && navigator.onLine) {
        processSyncQueue().catch(err => console.error("Erro no processamento inicial da fila de sync:", err));
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

// NFS-e e boleto: a emissão simulada (número de nota e linha digitável
// inventados) foi removida. Marcar uma nota como "Emitida" sem ela existir é
// risco fiscal. A cobrança real é a do Asaas (aba Faturas).

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
        const splitData = divisaoPagamento(os);
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

    // 2. Pagamento dividido: confere os valores ANTES de mexer em qualquer coisa
    let partesDivididas = null;
    if (newForma === 'dividido') {
        const f1 = document.getElementById('alt-pag-div-forma-1').value;
        const v1 = parseFloat(document.getElementById('alt-pag-div-valor-1').value) || 0;
        const f2 = document.getElementById('alt-pag-div-forma-2').value;
        const v2 = parseFloat(document.getElementById('alt-pag-div-valor-2').value) || 0;
        if (v1 <= 0 || v2 <= 0) {
            showToast("Por favor, preencha ambos os valores parciais do pagamento dividido.", "error");
            return;
        }
        if (paraCentavos(v1) + paraCentavos(v2) !== paraCentavos(os.valor)) {
            showToast(`A soma dos valores (R$ ${v1.toFixed(2)} + R$ ${v2.toFixed(2)} = R$ ${(v1+v2).toFixed(2)}) deve ser exatamente igual ao valor total do serviço (R$ ${os.valor.toFixed(2)}).`, "error");
            return;
        }
        partesDivididas = [{ forma: f1, valor: v1 }, { forma: f2, valor: v2 }];
    }

    // 3. OS numa fatura: fatura paga não muda (o dinheiro já entrou)
    const fatAtual = os.faturaId ? db.faturas.find(f => f.id == os.faturaId) : null;
    if (fatAtual && fatAtual.pago) {
        showToast(`A fatura ${fatAtual.codigo} já foi paga: a OS não pode sair dela. Faça o acerto como crédito ao parceiro.`, "error");
        return;
    }
    if (bloqueioSaidaDaFatura(fatAtual)) {
        showToast(bloqueioSaidaDaFatura(fatAtual), "error");
        return;
    }

    // 4. Caixa de destino (pagamento direto): precisa existir na data informada
    let caixaDestino = null;
    if (newForma !== 'faturamento') {
        caixaDestino = db.caixa_diario.find(c => c.unidadeId === os.unidadeId && c.data === inputDataPagamento);
        if (!caixaDestino) {
            const { data: noBanco } = await supabaseClient.from('caixa_diario').select('*')
                .eq('unidadeId', os.unidadeId).eq('data', inputDataPagamento).maybeSingle();
            if (noBanco) { caixaDestino = prepareRecordFromDb('caixa_diario', noBanco); db.caixa_diario.push(caixaDestino); }
        }
        if (!caixaDestino) {
            showToast(inputDataPagamento === getLocalDateString(new Date())
                ? "Abra o caixa de hoje antes de lançar o pagamento."
                : `Não há caixa em ${formatDateBr(inputDataPagamento)}. Confira a data do pagamento.`, "error");
            return;
        }
        if (caixaDestino.status === 'fechado') {
            const confirmAdjust = confirm(`Atenção: O caixa de destino da data ${formatDateBr(inputDataPagamento)} já está fechado.\nA alteração irá modificar o fechamento contábil histórico.\n\nDeseja prosseguir mesmo assim?`);
            if (!confirmAdjust) return;
        }
    }

    const oldForma = os.formaPagamento;
    const btn = event.target && event.target.querySelector ? event.target.querySelector('button[type="submit"]') : null;
    if (btn) btn.disabled = true;

    try {
        // 5. Cobrança Asaas da fatura em aberto: o valor vai mudar, então ela é
        //    cancelada antes (e a fatura precisa de cobrança nova depois).
        if (fatAtual && fatAtual.asaas_payment_id) {
            if (!confirm(`A fatura ${fatAtual.codigo} tem cobrança no Asaas. Ela será cancelada, porque o valor da fatura muda. Gere uma cobrança nova depois. Continuar?`)) return;
            const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-asaas-billing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sbAuthToken()}` },
                body: JSON.stringify({ faturaId: fatAtual.id })
            });
            const d = await res.json().catch(() => ({}));
            if (d.status === 'ja_recebida') {
                showToast(`A cobrança da fatura ${fatAtual.codigo} já consta PAGA no Asaas. Dê baixa na fatura; a OS não pode sair dela.`, "error");
                return;
            }
            if (!res.ok || !['cancelada', 'sem_cobranca'].includes(d.status)) {
                showToast("Não foi possível cancelar a cobrança no Asaas: " + (d.error || res.status) + ". Nada foi alterado.", "error");
                return;
            }
            fatAtual.asaas_payment_id = null;
            fatAtual.asaas_url = null;
        }

        // 6. Novos lançamentos da venda
        const dataMov = instanteNoDiaSP(inputDataPagamento);
        const servico = (os.servicoNome || 'VISTORIA').split(' — ')[0];
        let movimentos = [];
        let observacoes = removeDividedPaymentTag(os.observacoes);
        if (partesDivididas) {
            movimentos = partesDivididas.map((part, i) => ({
                caixaId: caixaDestino.id, tipo: "entrada", valor: part.valor, formaPagamento: part.forma,
                descricao: `[DIVIDIDO ${i + 1}/2] Pgto OS: Serviço ${servico} (Placa: ${os.placa})`,
                data: dataMov, operador: currentSession.nome, faturaId: null
            }));
            observacoes = observacoes + `\n[PAG_DIVIDIDO: ${partesDivididas[0].forma}=${partesDivididas[0].valor};${partesDivididas[1].forma}=${partesDivididas[1].valor}]`;
        } else if (newForma !== 'faturamento') {
            movimentos = [{
                caixaId: caixaDestino.id, tipo: "entrada", valor: os.valor, formaPagamento: newForma,
                descricao: `Pgto OS: Serviço ${servico} (Placa: ${os.placa})`,
                data: dataMov, operador: currentSession.nome, faturaId: null
            }];
        }
        // Passando a faturamento, a OS fica sem fatura e entra no próximo
        // fechamento do parceiro (antes era criada uma fatura só para ela).

        // 7. Tudo numa transação no banco: sai da fatura em aberto (devolvendo
        //    o crédito abatido que não couber mais), troca os lançamentos e a OS.
        const { data: r, error } = await supabaseClient.rpc('alterar_pagamento_os', {
            p_os_id: os.id,
            p_os: { formaPagamento: newForma, pago: newForma !== 'faturamento', parcelas: newParcelas, observacoes, pagamentoDividido: partesDivididas },
            p_movimentos: movimentos,
            p_por: currentSession.nome
        });
        if (error) throw error;
        aplicarResultadoAlteracaoPagamento(os, r);

        const descAuditoria = `Alterou pgto da OS ${os.numero} (Placa: ${os.placa}) de '${oldForma.toUpperCase()}' para '${newForma.toUpperCase()}'${fatAtual ? ` (saiu da fatura ${fatAtual.codigo})` : ''}. Justificativa: ${justificativa}`;
        logAudit("Alterar Pagamento OS", descAuditoria);
        const credito = r && r.fatura && r.fatura.credito_devolvido;
        showToast(credito
            ? `Forma de pagamento atualizada. Crédito de ${formatCurrency(Number(credito.valor))} devolvido ao parceiro.`
            : "Forma de pagamento atualizada com sucesso!", "success");

        document.getElementById('modal-alterar-pagamento').classList.remove('active');
        if (document.getElementById('panel-caixa').classList.contains('active')) {
            await renderCaixaPage();
        } else if (document.getElementById('panel-faturamento').classList.contains('active')) {
            renderFatFaturas();
        } else if (document.getElementById('panel-historico').classList.contains('active')) {
            renderHistorico();
        }
        openOSDetailsModal(os.id);
    } catch (err) {
        console.error("Erro na alteração do pagamento:", err);
        showToast("A alteração do pagamento não foi gravada: " + (err.message || err), "error");
    } finally {
        if (btn) btn.disabled = false;
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
                const cashPaymentsReaberto = movsReaberto.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
                const cashSangriasReaberto = movsReaberto.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
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
                    const cashPaymentsSub = movsSub.filter(m => m.tipo === 'entrada' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
                    const cashSangriasSub = movsSub.filter(m => m.tipo === 'saida' && m.formaPagamento === 'especie').reduce((sum, m) => somaCentavos(sum, m.valor), 0);
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
        options += vistoriadores.map(op => `<option value="${op.id}">${escHtml(op.nome)}</option>`).join('');
        filterVistoriador.innerHTML = options;
    }

    // 3. Chamar a filtragem e desenho inicial das tabelas
    filterCautelares();

    // 4. Fotos que ficaram só no aparelho (de qualquer cautelar): tenta enviar
    cautelarEnviarTodasPendentes();
}

/**
 * Varre o IndexedDB e envia as fotos pendentes de todas as cautelares (no
 * máximo uma vez a cada 2 minutos). Fotos de cautelar que não existe mais são
 * descartadas, para o aparelho não acumular imagens indefinidamente.
 */
async function cautelarEnviarTodasPendentes() {
    const agora = Date.now();
    if (window._cautelarVarreduraEm && agora - window._cautelarVarreduraEm < 120000) return;
    window._cautelarVarreduraEm = agora;
    if (!window.useSupabase || typeof indexedDB === 'undefined') return;
    let registros = [];
    try {
        const conn = await CautelarOfflineDB.open();
        registros = await new Promise((resolve, reject) => {
            const req = conn.transaction(['fotos'], 'readonly').objectStore('fotos').getAllKeys();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = reject;
        });
    } catch (e) {
        return;
    }
    const ids = Array.from(new Set(registros.map(k => parseInt(String(k).split('_')[0])).filter(n => !isNaN(n))));
    for (const cid of ids) {
        // Só descarta com a lista de cautelares vinda do banco (não do cache offline)
        const listaConfiavel = window.onlineTables && window.onlineTables['cautelares'];
        if (listaConfiavel && !db.cautelares.some(c => c.id === cid)) {
            const recs = await CautelarOfflineDB.getAllFotos(cid).catch(() => []);
            for (const r of recs) await CautelarOfflineDB.deleteFoto(cid, r.slotCodigo).catch(() => {});
            continue;
        }
        await garantirDetalhesCautelarApp(cid);
        await cautelarEnviarPendentes(cid);
    }
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

    // Mais recente primeiro
    listData.sort((a, b) => b.criadoEmRaw - a.criadoEmRaw);

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
                    <td style="font-weight: 700; color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 14px;">${escHtml(item.os.placa)}</td>
                    <td>${removeDividedPaymentTag(item.os.observacoes)}</td>
                    <td>${escHtml(item.os.clienteNome)}</td>
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
                        <span style="font-weight: 800; color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 16px;">${escHtml(item.os.placa)}</span>
                        ${statusBadge}
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
                        <span><strong>Veículo:</strong> ${removeDividedPaymentTag(item.os.observacoes)}</span>
                        <span><strong>Cliente:</strong> ${escHtml(item.os.clienteNome)}</span>
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
async function iniciarCautelar(osId) {
    if (!db || !currentSession) return;
    if (window._iniciandoCautelar) return; // evita duplo toque criar duas cautelares
    window._iniciandoCautelar = true;
    try {
        await iniciarCautelarInterno(osId);
    } finally {
        window._iniciandoCautelar = false;
    }
}

async function iniciarCautelarInterno(osId) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) {
        showToast("Ordem de serviço não encontrada.", "error");
        return;
    }

    // Já existe cautelar para esta OS (ex.: criada em outro aparelho): só continua
    const existente = db.cautelares.find(c => c.osId === os.id);
    if (existente) {
        continuarCautelar(existente.id);
        return;
    }

    const year = new Date().getFullYear();
    const montar = (id) => ({
        id: id,
        osId: os.id,
        dossieNumero: `CV-${year}-${String(id).padStart(5, '0')}`,
        status: "em_captura",
        vistoriadorId: currentSession.id,
        finalizadoPorId: null,
        dataHoraInicio: new Date().toISOString(),
        dataHoraEnvio: null,
        dataHoraFinalizacao: null,
        parecerConsolidado: null,
        parecerTexto: ""
    });

    let newCautelar = null;
    const online = window.useSupabase && (!window.onlineTables || window.onlineTables['cautelares']);

    if (online) {
        // O id (e o número do dossiê) sai do maior id no BANCO, não só do cache
        // local: vários vistoriadores iniciam cautelares no mesmo dia. Em caso de
        // colisão (dois aparelhos ao mesmo tempo) tenta o próximo número.
        for (let tentativa = 0; tentativa < 5 && !newCautelar; tentativa++) {
            try {
                const { data, error } = await supabaseClient
                    .from('cautelares').select('id').order('id', { ascending: false }).limit(1);
                if (error) throw error;
                const maxRemoto = data && data[0] ? data[0].id : 0;
                const id = Math.max(maxRemoto, cautelarProximoId(db.cautelares) - 1) + 1 + tentativa;
                const candidata = montar(id);
                const { error: errIns } = await supabaseClient.from('cautelares').insert(candidata);
                if (errIns) {
                    if (errIns.code === '23505') continue; // id/dossiê já usado
                    throw errIns;
                }
                newCautelar = candidata;
            } catch (e) {
                console.warn("Falha ao registrar a cautelar no Supabase; seguindo offline.", e);
                break;
            }
        }
    }

    const salvaNoBanco = !!newCautelar;
    if (!newCautelar) newCautelar = montar(cautelarProximoId(db.cautelares));

    // Criar as 8 seções padrão
    const novasSecoes = cautelarCriarSecoes(newCautelar.id);

    // Atualizar status da OS
    os.status = "em_execucao";

    db.cautelares.push(newCautelar);
    saveDatabase();

    if (salvaNoBanco) {
        // As seções vão para o banco antes de abrir a captura, já com o id real,
        // para as fotos apontarem para a seção certa.
        try {
            await cautelarSincronizarSecoes(novasSecoes);
            await sbUpdate('ordens_servico', os.id, { status: os.status });
        } catch (e) {
            console.warn("Erro ao salvar seções da Cautelar no Supabase:", e);
        }
    }

    logAudit("Registrar Cautelar", `Iniciou captura da cautelar para placa ${os.placa}. Dossie: ${newCautelar.dossieNumero}`);
    showToast(`Vistoria iniciada para placa ${os.placa}!`, "success");

    // Redireciona para o fluxo de captura mobile (Milestone 2)
    continuarCautelar(newCautelar.id);
}

async function garantirDetalhesCautelarApp(cautelarId) {
    if (typeof garantirDetalhesCautelar === 'function') await garantirDetalhesCautelar(cautelarId);
}

const CAUTELAR_SECAO_NOMES = [
    "IDENTIFICAÇÃO DO VEÍCULO",
    "NUMERAÇÃO E DOCUMENTAÇÃO",
    "ANÁLISE ESTRUTURAL",
    "ANÁLISE DE PINTURA (MEDIDOR)",
    "VIDROS E ETIQUETAS",
    "COMPARTIMENTO DO MOTOR",
    "INTERIOR E QUADROS DE PORTA",
    "OBSERVAÇÕES FINAIS E ASSINATURA"
];

function cautelarProximoId(lista) {
    return (lista || []).reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
}

// Id provisório (negativo) para seções/fotos ainda não gravadas no banco. Como o
// app só carrega as cautelares em andamento, um id positivo "max+1" local podia
// coincidir com o de um registro antigo que está só na nuvem.
let _cautelarIdTemp = 0;
function cautelarIdTemporario() {
    _cautelarIdTemp += 1;
    return -(Date.now() * 100 + (_cautelarIdTemp % 100));
}

/**
 * Cria localmente as seções que faltam (1 a 8) de uma cautelar e devolve as criadas.
 */
function cautelarCriarSecoes(cautelarId) {
    const existentes = db.cautelares_secoes.filter(s => s.cautelarId === cautelarId);
    const criadas = [];
    CAUTELAR_SECAO_NOMES.forEach((nome, i) => {
        const num = i + 1;
        if (existentes.some(s => s.numeroSecao === num)) return;
        const newSecao = {
            id: cautelarIdTemporario(),
            cautelarId: cautelarId,
            numeroSecao: num,
            nomeSecao: nome,
            status: num === 1 ? "em_andamento" : "nao_iniciada",
            dadosJson: {},
            parecerSecao: "conforme",
            observacaoTexto: "",
            dataHoraCompletada: null
        };
        db.cautelares_secoes.push(newSecao);
        criadas.push(newSecao);
    });
    return criadas;
}

/**
 * Grava no Supabase as seções criadas localmente, adotando o id gerado pelo banco
 * (o id local pode colidir com seções já existentes na nuvem).
 */
async function cautelarSincronizarSecoes(secoes) {
    if (!window.useSupabase || !secoes || secoes.length === 0) return;
    for (const secao of secoes) {
        const { id: idLocal, ...semId } = secao;
        const salva = await sbInsert('cautelares_secoes', semId);
        if (salva && salva.id && salva.id !== idLocal) {
            secao.id = salva.id;
            db.cautelares_fotos.forEach(f => { if (f.secaoId === idLocal) f.secaoId = salva.id; });
        }
    }
    saveDatabase();
}

/**
 * Recupera as fotos que ficaram só no IndexedDB do aparelho (ex.: o navegador foi
 * fechado por falta de memória e, ao recarregar, a lista local veio do banco sem elas).
 */
async function cautelarRecuperarFotosOffline(cautelarId) {
    let registros = [];
    try {
        registros = await CautelarOfflineDB.getAllFotos(cautelarId);
    } catch (e) {
        console.warn("IndexedDB indisponível para recuperar fotos:", e);
        return 0;
    }
    let recuperadas = 0;
    registros.forEach(rec => {
        let secaoNum = null;
        Object.keys(CAUTELAR_SLOTS).forEach(n => {
            if (CAUTELAR_SLOTS[n].some(sl => sl.codigo === rec.slotCodigo)) secaoNum = parseInt(n);
        });
        const secao = secaoNum && db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === secaoNum);
        if (!secao) return;
        if (db.cautelares_fotos.some(f => f.secaoId === secao.id && f.slotCodigo === rec.slotCodigo)) return;
        db.cautelares_fotos.push({
            id: cautelarIdTemporario(),
            secaoId: secao.id,
            slotCodigo: rec.slotCodigo,
            slotNomeDisplay: rec.slotCodigo.toUpperCase(),
            urlOriginal: '',
            urlThumb: '',
            dataHoraCaptura: rec.timestamp,
            metadados_json: rec.metadados || {},
            ordemExibicao: 0,
            pendenteEnvio: true
        });
        recuperadas++;
    });
    if (recuperadas > 0) saveDatabase();
    return recuperadas;
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
        // Reaproveita a conexão: abrir uma nova a cada foto acumulava conexões
        if (this.db) return Promise.resolve(this.db);
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => {
                this.db = e.target.result;
                this.db.onclose = () => { this.db = null; };
                this.db.onversionchange = () => { this.db.close(); this.db = null; };
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

    saveFoto(cautelarId, slotCodigo, blob, metadados, thumb) {
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
                    thumb: thumb || null,
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

    // Apaga só se ainda for a MESMA foto (mesmo momento de gravação). Se o
    // vistoriador refez a foto enquanto a anterior subia, a nova fica.
    deleteFotoSeIgual(cautelarId, slotCodigo, timestamp) {
        return this.open().then((db) => {
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['fotos'], 'readwrite');
                const store = transaction.objectStore('fotos');
                const id = `${cautelarId}_${slotCodigo}`;
                const req = store.get(id);
                req.onsuccess = (e) => {
                    const atual = e.target.result;
                    if (atual && timestamp && atual.timestamp !== timestamp) { resolve(false); return; }
                    store.delete(id);
                    resolve(true);
                };
                req.onerror = (e) => reject(e);
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

// Mapeamento estático de fotos obrigatórias por seção. A ordem dos slots segue o
// caminho físico do vistoriador (região por região), para ele não ir e voltar
// entre dianteira e traseira. "grupo" vira um cabeçalho na tela.
const CAUTELAR_SLOTS = {
    1: [
        { codigo: 'placa_dianteira', nome: 'PLACA DIANTEIRA EM CLOSE', grupo: 'EXTERNO', texto: true },
        { codigo: 'frente_45_dir', nome: 'FRENTE 45° LADO DIREITO' },
        { codigo: 'traseira_45_esq', nome: 'TRASEIRA 45° LADO ESQUERDO' },
        { codigo: 'painel_hodometro', nome: 'PAINEL DE INSTRUMENTOS COM HODÔMETRO', grupo: 'CABINE', texto: true },
        { codigo: 'crlv_documento', nome: 'CRLV / CRV DO VEÍCULO', texto: true }
    ],
    2: [
        { codigo: 'chassi_gravado', nome: 'NÚMERO DO CHASSI GRAVADO', grupo: 'CAPÔ ABERTO', texto: true },
        { codigo: 'chassi_secundario', nome: 'NÚMERO DO CHASSI (PLAQUETAS/SECUNDÁRIO)', texto: true },
        { codigo: 'motor_gravado', nome: 'NÚMERO DO MOTOR GRAVADO', texto: true },
        { codigo: 'etiqueta_eta', nome: 'ETIQUETA ETA COMPARTIMENTO MOTOR', texto: true }
    ],
    3: [
        { codigo: 'longarina_diant_esq', nome: 'LONGARINA DIANTEIRA ESQUERDA', grupo: 'DIANTEIRA — CAPÔ ABERTO' },
        { codigo: 'torre_amort_diant_esq', nome: 'TORRE DO AMORTECEDOR DIANTEIRO ESQUERDO' },
        { codigo: 'painel_corta_fogo', nome: 'PAINEL CORTA-FOGO (ESTRUTURA)' },
        { codigo: 'torre_amort_diant_dir', nome: 'TORRE DO AMORTECEDOR DIANTEIRO DIREITO' },
        { codigo: 'longarina_diant_dir', nome: 'LONGARINA DIANTEIRA DIREITA' },
        { codigo: 'torre_amort_tras_dir', nome: 'TORRE DO AMORTECEDOR TRASEIRO DIREITO', grupo: 'TRASEIRA — PORTA-MALAS ABERTO' },
        { codigo: 'longarina_tras_dir', nome: 'LONGARINA TRASEIRA DIREITA' },
        { codigo: 'assoalho_porta_malas', nome: 'ASSOALHO DO PORTA-MALAS' },
        { codigo: 'longarina_tras_esq', nome: 'LONGARINA TRASEIRA ESQUERDA' },
        { codigo: 'torre_amort_tras_esq', nome: 'TORRE DO AMORTECEDOR TRASEIRO ESQUERDO' }
    ],
    4: [
        { codigo: 'medidor_pintura_uso', nome: 'FOTO DO MEDIDOR MINIPA EM USO (EVIDÊNCIA)' }
    ],
    // Volta de 360° no sentido: frente → lado do motorista → traseira → lado do passageiro
    5: [
        { codigo: 'vidro_parabrisa', nome: 'GRAVAÇÃO VIDRO PARA-BRISA', texto: true },
        { codigo: 'vidro_porta_diant_esq', nome: 'GRAVAÇÃO VIDRO PORTA DIANTEIRA ESQUERDA (MOTORISTA)', texto: true },
        { codigo: 'vidro_porta_tras_esq', nome: 'GRAVAÇÃO VIDRO PORTA TRASEIRA ESQUERDA', texto: true },
        { codigo: 'vidro_traseiro', nome: 'GRAVAÇÃO VIDRO TRASEIRO', texto: true },
        { codigo: 'vidro_porta_tras_dir', nome: 'GRAVAÇÃO VIDRO PORTA TRASEIRA DIREITA', texto: true },
        { codigo: 'vidro_porta_diant_dir', nome: 'GRAVAÇÃO VIDRO PORTA DIANTEIRA DIREITA', texto: true }
    ],
    6: [
        { codigo: 'motor_vista_geral', nome: 'VISTA GERAL DO COMPARTIMENTO DO MOTOR', grupo: 'CAPÔ ABERTO' },
        { codigo: 'motor_painel_corta_fogo', nome: 'PAINEL CORTA-FOGO (LADO DO MOTOR)' },
        { codigo: 'motor_batentes_dobradicas', nome: 'BATENTES DAS DOBRADIÇAS DO CAPÔ' }
    ],
    7: [
        { codigo: 'quadro_porta_diant_esq', nome: 'QUADRO PORTA DIANTEIRA ESQUERDA' },
        { codigo: 'quadro_porta_tras_esq', nome: 'QUADRO PORTA TRASEIRA ESQUERDA' },
        { codigo: 'quadro_porta_tras_dir', nome: 'QUADRO PORTA TRASEIRA DIREITA' },
        { codigo: 'quadro_porta_diant_dir', nome: 'QUADRO PORTA DIANTEIRA DIREITA' }
    ],
    8: []
};

// Ordem em que as seções são percorridas na captura (a numeração de cada seção no
// banco e no laudo não muda). Todo o trabalho com o capô aberto fica junto:
// numeração (II) → compartimento do motor (VI) → estrutura, que começa pela
// dianteira e termina no porta-malas (III). Depois as voltas de 360°: pintura (IV),
// vidros (V) e quadros de porta/interior (VII). Por fim o fechamento (VIII).
window.CAUTELAR_SLOTS = CAUTELAR_SLOTS;

const CAUTELAR_ORDEM_SECOES = [1, 2, 6, 3, 4, 5, 7, 8];

function cautelarPosicaoSecao(secaoNum) {
    return CAUTELAR_ORDEM_SECOES.indexOf(secaoNum);
}
function cautelarProximaSecao(secaoNum) {
    return CAUTELAR_ORDEM_SECOES[cautelarPosicaoSecao(secaoNum) + 1] || null;
}
function cautelarSecaoAnterior(secaoNum) {
    const i = cautelarPosicaoSecao(secaoNum);
    return i > 0 ? CAUTELAR_ORDEM_SECOES[i - 1] : null;
}
function cautelarSlotInfo(slotCodigo) {
    return Object.values(CAUTELAR_SLOTS).flat().find(sl => sl.codigo === slotCodigo) || null;
}

// Leva a tela da captura para o topo (ao trocar de seção a página abria no fim)
function cautelarRolarParaTopo() {
    const area = document.getElementById('captura-scroll-area');
    if (area) area.scrollTop = 0;
    let el = document.getElementById('cautelar-captura-view');
    while (el) {
        if (el.scrollTop) el.scrollTop = 0;
        el = el.parentElement;
    }
    window.scrollTo(0, 0);
}

// Variáveis globais de controle da Captura
window.activeCautelarId = null;
window.activeSecaoNum = 1;
window.autoSaveTimeout = null;

/**
 * Abre o formulário de Captura Mobile para a Cautelar selecionada.
 */
async function continuarCautelar(cautelarId) {
    if (!db || !currentSession) return;

    await garantirDetalhesCautelarApp(cautelarId);

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

    // Auto-reparo: cautelares criadas antes desta correção ficaram sem seções no
    // banco; sem elas a tela de captura abria vazia e não avançava.
    // Inclui as seções criadas offline (id provisório negativo) que ainda não subiram
    const secoesFaltando = cautelarCriarSecoes(cautelarId)
        .concat(db.cautelares_secoes.filter(sc => sc.cautelarId === cautelarId && sc.id < 0))
        .filter((sc, i, arr) => arr.indexOf(sc) === i);
    if (secoesFaltando.length > 0) {
        saveDatabase();
        if (window.useSupabase) {
            cautelarSincronizarSecoes(secoesFaltando)
                .catch(avisarFalhaGravacao('Seções da vistoria'));
        }
    }

    // Traz de volta as fotos que só estão no aparelho (IndexedDB) e tenta enviá-las
    cautelarRecuperarFotosOffline(cautelarId).then(n => {
        if (n > 0 && window.activeCautelarId === cautelarId) {
            showToast(`${n} foto(s) recuperada(s) do aparelho.`, "info");
            renderCapturaSecao(window.activeSecaoNum);
        }
        cautelarEnviarPendentes(cautelarId);
    });

    // Achar a última seção completa para já abrir na seção atual
    const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelarId);
    let targetSec = 1;
    secoes.sort((a, b) => cautelarPosicaoSecao(a.numeroSecao) - cautelarPosicaoSecao(b.numeroSecao));
    
    // Procura a primeira não completa (na ordem de execução)
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
    irParaSecaoCaptura(targetSec);
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
    const algarismosRomanos = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
    const posicao = cautelarPosicaoSecao(secaoNum);
    document.getElementById('captura-secao-titulo-romano').textContent = `ETAPA ${algarismosRomanos[posicao]} DE VIII`;
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
            if (slot.grupo) {
                const cab = document.createElement('div');
                cab.style.cssText = 'grid-column: 1 / -1; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: var(--accent); border-bottom: 1px solid var(--border); padding: 6px 0 4px; margin-top: 4px;';
                cab.innerHTML = `<i class="ri-map-pin-2-line"></i> ${slot.grupo}`;
                slotsGrid.appendChild(cab);
            }
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

// Troca de seção pelo usuário: abre a nova seção já no topo
function irParaSecaoCaptura(secaoNum) {
    renderCapturaSecao(secaoNum);
    cautelarRolarParaTopo();
    requestAnimationFrame(cautelarRolarParaTopo);
}

/**
 * Desenha a progress bar horizontal de 8 segmentos.
 */
function renderCapturaProgressBar(activeSec) {
    const barContainer = document.getElementById('captura-progress-bar');
    if (!barContainer) return;

    let html = '';
    CAUTELAR_ORDEM_SECOES.forEach((i, pos) => {
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

        html += `<div style="flex: 1; height: 6px; background: ${color}; border: ${border}; border-radius: 3px;" title="Etapa ${pos + 1}: ${secao ? secao.nomeSecao : ''}"></div>`;
    });
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
                    <select id="status-foto-${escHtml(slot.codigo)}" onchange="salvarStatusFoto('${escHtml(slot.codigo)}', 'status', this.value)" style="margin-top: 4px; height: 34px; padding: 4px 8px; font-size: 12px; width: 100%;">
                        <option value="original" ${currentStatus === 'original' ? 'selected' : ''}>Original</option>
                        <option value="reparo_aparente" ${currentStatus === 'reparo_aparente' ? 'selected' : ''}>Indícios de Reparo</option>
                        <option value="substituicao" ${currentStatus === 'substituicao' ? 'selected' : ''}>Indícios de Substituição</option>
                        <option value="indicio_avaria" ${currentStatus === 'indicio_avaria' ? 'selected' : ''}>Indício de Avaria</option>
                        <option value="nao_aplicavel" ${currentStatus === 'nao_aplicavel' ? 'selected' : ''}>Não se Aplica</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">OBSERVAÇÕES DA PEÇA (OPCIONAL)</label>
                    <input type="text" id="obs-foto-${escHtml(slot.codigo)}" value="${obsPeca}" placeholder="Ex: pequeno amassado, solda..." oninput="salvarStatusFoto('${escHtml(slot.codigo)}', 'observacao', this.value)" style="margin-top: 4px; height: 32px; font-size: 11px; padding: 4px 8px; width: 100%;">
                </div>
            </div>
        `;
    } else if (window.activeSecaoNum === 5) {
        const isOriginal = photo ? photo.metadados_json?.vidro_original !== false : true;
        const numGravado = photo ? photo.metadados_json?.gravacao_lida || '' : '';
        const desbaste = photo ? photo.metadados_json?.desbaste === true : false;
        extraControls = `
            <div style="margin-top: 12px; text-align: left; display: flex; flex-direction: column; gap: 8px;">
                <div>
                    <label style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">Indícios de Desbaste / Polimento na gravação?</label>
                    <select id="desbaste-foto-${escHtml(slot.codigo)}" onchange="salvarEtiquetaVidro('${escHtml(slot.codigo)}', 'desbaste', this.value)" style="margin-top: 4px; height: 32px; padding: 4px 8px; font-size: 11px;">
                        <option value="nao" ${!desbaste ? 'selected' : ''}>NÃO</option>
                        <option value="sim" ${desbaste ? 'selected' : ''}>SIM — há desbaste/polimento</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">Gravação Original?</label>
                    <select id="original-foto-${escHtml(slot.codigo)}" onchange="salvarEtiquetaVidro('${escHtml(slot.codigo)}', 'original', this.value)" style="margin-top: 4px; height: 32px; padding: 4px 8px; font-size: 11px;">
                        <option value="sim" ${isOriginal ? 'selected' : ''}>SIM</option>
                        <option value="nao" ${!isOriginal ? 'selected' : ''}>NÃO</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 10px; color: var(--text-secondary); font-weight: 700;">Número Gravado</label>
                    <input type="text" id="gravacao-foto-${escHtml(slot.codigo)}" value="${numGravado}" placeholder="DIGITE O CHASSI LIDO..." oninput="salvarEtiquetaVidro('${escHtml(slot.codigo)}', 'gravacao', this.value)" style="margin-top: 4px; height: 32px; font-size: 11px; padding: 4px 8px; font-family: monospace;">
                </div>
            </div>
        `;
    }

    // Quilometragem digitada junto da foto do painel
    if (slot.codigo === 'painel_hodometro') {
        const secKm = db.cautelares_secoes.find(s => s.id === secaoId);
        const kmAtual = secKm && secKm.dadosJson ? (secKm.dadosJson.quilometragem || '') : '';
        extraControls = `
            <div style="margin-top: 12px; text-align: left;">
                <label for="caut-km" style="font-size: 11px; color: var(--text-secondary); font-weight: 700;">QUILOMETRAGEM EXIBIDA NO PAINEL <span style="color:var(--danger)">*</span></label>
                <input type="number" inputmode="numeric" id="caut-km" value="${kmAtual}" placeholder="DIGITE A KM DO PAINEL..." oninput="autoSaveCampo('quilometragem', this.value)" style="margin-top: 4px; width: 100%; font-size: 16px; font-weight: 700; font-family: monospace;">
            </div>
        `;
    }

    // Input file invisível e câmera ativa por capture="environment"
    const inputId = `input-camera-${slot.codigo}`;
    
    if (photo) {
        // Exibe preview da foto: URL da nuvem, ou a miniatura guardada no aparelho
        const displayUrl = photo.url_thumb || photo.urlThumb || photo.url_original || photo.urlOriginal || '';
        const isLocalBlob = photo.pendenteEnvio || displayUrl.startsWith('blob:') || !displayUrl.startsWith('http');
        const statusFoto = photo.pendenteEnvio
            ? `<span id="status-envio-${escHtml(slot.codigo)}" style="font-size: 9px; color: var(--warning, #f59e0b); display: block; margin-top: 2px;"><i class="ri-upload-cloud-2-line"></i> Salva no aparelho — aguardando envio</span>`
            : `<span style="font-size: 9px; color: var(--success); display: block; margin-top: 2px;"><i class="ri-checkbox-circle-fill"></i> Capturada e enviada</span>`;
        // A miniatura base64 aparece na hora; o original do IndexedDB entra por cima depois
        const initialSrc = (displayUrl.startsWith('http') || displayUrl.startsWith('data:')) ? displayUrl : '';
        
        card.innerHTML = `
            <div style="position: relative; width: 100%; height: 160px; border-radius: var(--radius-sm); overflow: hidden; background: #000;">
                <img id="img-preview-${escHtml(slot.codigo)}" src="${initialSrc}" onclick="abrirPreviewFotoCautelar('${escHtml(slot.codigo)}')" style="width: 100%; height: 100%; object-fit: cover; cursor: zoom-in;" alt="${escHtml(slot.nome)}">
                <span style="position: absolute; left: 8px; bottom: 8px; background: rgba(0,0,0,0.6); color: #fff; font-size: 10px; padding: 3px 8px; border-radius: 10px; pointer-events: none;"><i class="ri-zoom-in-line"></i> Toque para ampliar</span>
                <button onclick="deleteFotoCaptura('${escHtml(slot.codigo)}')" style="position: absolute; top: 8px; right: 8px; background: rgba(239, 68, 68, 0.9); color: white; border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s;">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </div>
            <h5 style="font-size: 12px; font-weight: 700; color: var(--text-primary); margin-top: 10px; text-transform: uppercase;">${escHtml(slot.nome)}</h5>
            ${statusFoto}
            ${extraControls}
        `;

        if (isLocalBlob) {
            // Puxa o Blob real do IndexedDB assincronamente e cria uma URL temporária válida
            CautelarOfflineDB.getFoto(window.activeCautelarId, slot.codigo).then(record => {
                if (record && (record.thumb || record.blob)) {
                    const freshUrl = URL.createObjectURL(record.thumb || record.blob);
                    const imgEl = document.getElementById(`img-preview-${slot.codigo}`);
                    if (imgEl) {
                        imgEl.onload = () => URL.revokeObjectURL(freshUrl);
                        imgEl.src = freshUrl;
                    } else {
                        URL.revokeObjectURL(freshUrl);
                    }
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
            <input type="file" id="${inputId}" accept="image/*" style="display: none;" onchange="handleFotoUpload('${escHtml(slot.codigo)}', event)">
            <div onclick="abrirCameraCautelar('${escHtml(slot.codigo)}')" style="padding: 24px 0; border: 2px dashed var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: 0.2s;">
                <i class="ri-camera-lens-line" style="font-size: 40px; color: var(--accent); margin-bottom: 10px; display: inline-block;"></i>
                <h5 style="font-size: 12px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; margin-bottom: 4px;">${escHtml(slot.nome)}</h5>
                <span style="font-size: 11px; color: var(--text-secondary);">Tocar para capturar</span>
            </div>
            <button type="button" onclick="document.getElementById('${inputId}').click()" style="margin-top: 8px; background: none; border: none; color: var(--text-secondary); font-size: 11px; text-decoration: underline; cursor: pointer;">Escolher da galeria</button>
            ${extraControls}
        `;
    }

    return card;
}

const CAUTELAR_TIPOS_VEICULO = [
    { v: 'hatch', t: 'Hatch' },
    { v: 'sedan', t: 'Sedan' },
    { v: 'suv', t: 'SUV' },
    { v: 'pickup', t: 'Pick-up' },
    { v: 'van', t: 'Van / Utilitário' },
    { v: 'minivan', t: 'Minivan' },
    { v: 'cupe', t: 'Cupê' },
    { v: 'outro', t: 'Outro' }
];
window.CAUTELAR_TIPOS_VEICULO = CAUTELAR_TIPOS_VEICULO;

const CAUTELAR_ETIQUETAS = [
    { codigo: 'eta_motor', nome: 'Etiqueta ETA do compartimento do motor' },
    { codigo: 'eta_coluna', nome: 'Etiqueta ETA da coluna / batente da porta' }
];
const CAUTELAR_ETIQUETA_STATUS = [
    { v: 'preservada', t: 'Preservada' },
    { v: 'danificada', t: 'Danificada' },
    { v: 'ausente', t: 'Ausente' }
];

// Peças da pintura na ordem de execução (volta de 360°). "laudo" é o nome curto
// usado na tabela do laudo.
const CAUTELAR_PINTURA_ITENS = [
    { codigo: 'para_choque_diant', nome: 'Para-choque dianteiro', tipo: 'plastico' },
    { codigo: 'capo', nome: 'Capô', tipo: 'metal' },
    { codigo: 'paralama_diant_esq', nome: 'Paralama dianteiro esquerdo', tipo: 'metal' },
    { codigo: 'coluna_diant_esq', nome: 'Coluna dianteira esquerda', tipo: 'coluna' },
    { codigo: 'porta_diant_esq', nome: 'Porta dianteira esquerda', tipo: 'metal' },
    { codigo: 'coluna_central_esq', nome: 'Coluna central esquerda', tipo: 'coluna' },
    { codigo: 'porta_tras_esq', nome: 'Porta traseira esquerda', tipo: 'metal' },
    { codigo: 'coluna_tras_esq', nome: 'Coluna traseira esquerda', tipo: 'coluna' },
    { codigo: 'paralama_tras_esq', nome: 'Paralama traseiro esquerdo', tipo: 'metal' },
    { codigo: 'tampa_traseira', nome: 'Tampa traseira', tipo: 'metal' },
    { codigo: 'para_choque_tras', nome: 'Para-choque traseiro', tipo: 'plastico' },
    { codigo: 'paralama_tras_dir', nome: 'Paralama traseiro direito', tipo: 'metal' },
    { codigo: 'coluna_tras_dir', nome: 'Coluna traseira direita', tipo: 'coluna' },
    { codigo: 'porta_tras_dir', nome: 'Porta traseira direita', tipo: 'metal' },
    { codigo: 'coluna_central_dir', nome: 'Coluna central direita', tipo: 'coluna' },
    { codigo: 'porta_diant_dir', nome: 'Porta dianteira direita', tipo: 'metal' },
    { codigo: 'coluna_diant_dir', nome: 'Coluna dianteira direita', tipo: 'coluna' },
    { codigo: 'paralama_diant_dir', nome: 'Paralama dianteiro direito', tipo: 'metal' },
    { codigo: 'teto', nome: 'Teto', tipo: 'metal' }
].map((it, i) => Object.assign(it, { ordem: i + 1 }));
window.CAUTELAR_PINTURA_ITENS = CAUTELAR_PINTURA_ITENS;

// Classificação manual (os valores são os mesmos usados nas cores do laudo)
const CAUTELAR_CLASSES_PINTURA = [
    { v: 'Original', t: 'Original' },
    { v: 'Repintura', t: 'Repintura' },
    { v: 'Repintura com massa', t: 'Repintura c/ massa' },
    { v: 'Avariado', t: 'Avariado' },
    { v: 'Não aplicável', t: 'Não se aplica' }
];
const CAUTELAR_CLASSES_COLUNA = [
    { v: 'Original', t: 'Original' },
    { v: 'Repintura', t: 'Repintura' },
    { v: 'Repintura com massa', t: 'Repintura c/ massa' }
];

function cautelarColunaComReparo(d) {
    return CAUTELAR_PINTURA_ITENS.some(it => it.tipo === 'coluna' && (d || {})[`pint_${it.codigo}_reparo`] === 'sim');
}

// Grupo de botões de escolha única (mais rápido que select no celular)
function cautelarChipsHtml(campo, atual, opcoes) {
    return `<div class="caut-chips" data-campo="${campo}" style="display: flex; flex-wrap: wrap; gap: 6px;">` +
        opcoes.map(op => {
            const ativo = atual === op.v;
            return `<button type="button" data-valor="${op.v}" onclick="cautelarEscolherChip(this)" style="padding: 7px 12px; font-size: 12px; font-weight: 700; border-radius: 16px; cursor: pointer; border: 1px solid ${ativo ? 'var(--accent)' : 'var(--border)'}; background: ${ativo ? 'var(--accent)' : 'transparent'}; color: ${ativo ? '#0b1220' : 'var(--text-primary)'};">${op.t}</button>`;
        }).join('') + `</div>`;
}

function cautelarEscolherChip(btn) {
    const grupo = btn.closest('.caut-chips');
    if (!grupo) return;
    grupo.querySelectorAll('button').forEach(b => {
        const ativo = b === btn;
        b.style.background = ativo ? 'var(--accent)' : 'transparent';
        b.style.borderColor = ativo ? 'var(--accent)' : 'var(--border)';
        b.style.color = ativo ? '#0b1220' : 'var(--text-primary)';
    });
    const campo = grupo.dataset.campo;
    const valor = btn.dataset.valor;
    // grava já na memória para a validação enxergar sem esperar o debounce
    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === window.activeSecaoNum);
    if (secao) {
        secao.dadosJson = secao.dadosJson || {};
        secao.dadosJson[campo] = valor;
    }
    autoSaveCampo(campo, valor);
    if (campo === 'tipoVeiculo') {
        const cautelar = db.cautelares.find(c => c.id === window.activeCautelarId);
        const os = cautelar && db.ordens_servico.find(o => o.id === cautelar.osId);
        if (os && os.veiculoTipo !== valor) {
            os.veiculoTipo = valor;
            saveDatabase();
            if (window.useSupabase) sbUpdate('ordens_servico', os.id, { veiculoTipo: valor }).catch(avisarFalhaGravacao('Alteração da vistoria'));
        }
    }
    if (window.activeSecaoNum === 4) cautelarAtualizarObsSec4();
    validarSecaoCompleta();
}

function cautelarAtualizarObsSec4() {
    const secao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === 4);
    const label = document.getElementById('caut-secao4-obs-label');
    if (!secao || !label) return;
    label.innerHTML = cautelarColunaComReparo(secao.dadosJson)
        ? `Observações <span style="color:var(--danger)">* (descreva os reparos estruturais encontrados nas colunas)</span>`
        : 'Observações do Vistoriador (Opcional)';
}

// Compara o chassi digitado com o CHASSI da O.S. (antes comparava com o RENAVAM)
function cautelarValidarChassi() {
    const input = document.getElementById('caut-chassi');
    const span = document.getElementById('caut-chassi-validation');
    if (!input || !span) return;
    const cautelar = db.cautelares.find(c => c.id === window.activeCautelarId);
    const os = cautelar && db.ordens_servico.find(o => o.id === cautelar.osId);
    const normalizar = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const lido = normalizar(input.value);
    const cadastro = normalizar(os && os.veiculoChassi);
    if (!lido) {
        span.style.display = 'none';
        return;
    }
    span.style.display = 'block';
    if (!cadastro) {
        span.innerHTML = `<i class="ri-information-line"></i> Chassi não informado no cadastro da O.S. — sem conferência automática.`;
        span.style.color = 'var(--text-secondary)';
    } else if (lido === cadastro) {
        span.innerHTML = `<i class="ri-checkbox-circle-fill" style="color:var(--success)"></i> Confere com o chassi da O.S.`;
        span.style.color = 'var(--success)';
    } else {
        span.innerHTML = `<i class="ri-alert-fill" style="color:var(--danger)"></i> Divergente do chassi da O.S. (${escHtml(os.veiculoChassi)})`;
        span.style.color = 'var(--danger)';
    }
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
                        <label>Tipo de Veículo (carroceria) <span style="color:var(--danger)">*</span></label>
                        ${cautelarChipsHtml('tipoVeiculo', data.tipoVeiculo || os.veiculoTipo || '', CAUTELAR_TIPOS_VEICULO)}
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
                        <textarea id="caut-secao1-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE A IDENTIFICAÇÃO DO VEÍCULO..." oninput="autoSaveCampo('observacao', this.value)">${escHtml(data.observacao || '')}</textarea>
                    </div>
                </div>
            `;
            break;

        case 2: {
            const etiquetasHtml = CAUTELAR_ETIQUETAS.map(et => {
                const atual = data[et.codigo] || '';
                return `
                    <div style="padding: 10px 0; border-bottom: 1px solid var(--border);">
                        <div style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">${escHtml(et.nome)} <span style="color:var(--danger)">*</span></div>
                        ${cautelarChipsHtml(et.codigo, atual, CAUTELAR_ETIQUETA_STATUS)}
                    </div>`;
            }).join('');
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label for="caut-chassi">Chassi Lido <span style="color:var(--danger)">*</span></label>
                        <input type="text" id="caut-chassi" value="${escHtml(data.chassiLido || '')}" placeholder="DIGITE O CHASSI LIDO..." oninput="this.value = this.value.toUpperCase(); autoSaveCampo('chassiLido', this.value); cautelarValidarChassi();" style="font-family: monospace; letter-spacing: 1px;" required>
                        <span id="caut-chassi-validation" style="font-size: 11px; margin-top: 4px; display: none;"></span>
                    </div>
                    <div class="form-group">
                        <label for="caut-motor">Motor Lido <span style="color:var(--danger)">*</span></label>
                        <input type="text" id="caut-motor" value="${escHtml(data.motorLido || '')}" placeholder="DIGITE O MOTOR LIDO..." oninput="autoSaveCampo('motorLido', this.value.toUpperCase())" style="font-family: monospace; letter-spacing: 1px;" required>
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
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Etiquetas ETA — avalie cada uma <span style="color:var(--danger)">*</span></label>
                        ${etiquetasHtml}
                        <p style="font-size: 11px; color: var(--warning, #f59e0b); margin: 8px 0 0;"><i class="ri-information-line"></i> Etiqueta DANIFICADA ou AUSENTE: descreva no campo de observações abaixo (local, estado e o que foi constatado).</p>
                    </div>
                    <div class="form-group">
                        <label for="caut-secao2-obs" id="caut-secao2-obs-label">Observações (Opcional)</label>
                        <textarea id="caut-secao2-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE CHASSI, MOTOR E ETIQUETAS..." oninput="autoSaveCampo('observacao', this.value)">${escHtml(data.observacao || '')}</textarea>
                    </div>
                </div>
            `;
            setTimeout(() => cautelarValidarChassi(), 50);
            break;
        }

        case 3:
            const showEnchenteObs = data.indicioEnchente === 'sim';
            const showDeformacao = data.indicioBatida === 'sim';
            const showBatidaObs = showDeformacao && data.deformacaoEstrutural === 'sim';
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
                        <label for="caut-batida">Indícios de Batida? <span style="color:var(--danger)">*</span></label>
                        <select id="caut-batida" onchange="autoSaveCampo('indicioBatida', this.value); toggleDynamicFieldsSec3();" required>
                            <option value="nao" ${data.indicioBatida === 'sim' ? '' : 'selected'}>NÃO</option>
                            <option value="sim" ${data.indicioBatida === 'sim' ? 'selected' : ''}>SIM</option>
                        </select>
                    </div>
                    <div class="form-group" id="caut-deformacao-container" style="display: ${showDeformacao ? 'block' : 'none'};">
                        <label for="caut-deformacao">Houve Deformação Estrutural? <span style="color:var(--danger)">*</span></label>
                        <select id="caut-deformacao" onchange="autoSaveCampo('deformacaoEstrutural', this.value); toggleDynamicFieldsSec3();">
                            <option value="">SELECIONE...</option>
                            <option value="nao" ${data.deformacaoEstrutural === 'nao' ? 'selected' : ''}>NÃO</option>
                            <option value="sim" ${data.deformacaoEstrutural === 'sim' ? 'selected' : ''}>SIM</option>
                        </select>
                    </div>
                    <div class="form-group" id="caut-batida-obs-container" style="display: ${showBatidaObs ? 'block' : 'none'};">
                        <label for="caut-batida-obs">Descreva a deformação estrutural <span style="color:var(--danger)">*</span></label>
                        <textarea id="caut-batida-obs" placeholder="Descreva onde está a deformação, cortes ou soldas estruturais encontrados..." oninput="autoSaveCampo('obsBatida', this.value)" ${showBatidaObs ? 'required' : ''}>${data.obsBatida || ''}</textarea>
                    </div>

                    <div class="form-group">
                        <label for="caut-parecer-estrutural">Parecer Estrutural Consolidado <span style="color:var(--danger)">*</span></label>
                        <select id="caut-parecer-estrutural" onchange="autoSaveCampo('parecerEstrutural', this.value); toggleDynamicFieldsSec3();" required>
                            <option value="conforme" ${data.parecerEstrutural === 'conforme' || !data.parecerEstrutural ? 'selected' : ''}>CONFORME</option>
                            <option value="com_ressalvas" ${data.parecerEstrutural === 'com_ressalvas' ? 'selected' : ''}>CONFORME COM RESSALVA</option>
                            <option value="nao_conforme" ${data.parecerEstrutural === 'nao_conforme' ? 'selected' : ''}>NÃO CONFORME</option>
                        </select>
                    </div>
                    <div class="form-group" id="caut-parecer-obs-container" style="display: ${showParecerObs ? 'block' : 'none'};">
                        <label for="caut-secao3-obs" id="caut-secao3-obs-label">Comentários e Justificativa do Parecer <span style="color:var(--danger)">*</span></label>
                        <textarea id="caut-secao3-obs" placeholder="Justifique o parecer com ressalvas ou não conforme..." oninput="autoSaveCampo('observacao', this.value)" ${showParecerObs ? 'required' : ''}>${escHtml(data.observacao || '')}</textarea>
                    </div>
                </div>
            `;
            setTimeout(() => toggleDynamicFieldsSec3(), 100);
            break;

        case 4: {
            // Ordem de execução: volta de 360° começando pela frente, lado do
            // motorista, traseira, lado do passageiro e, por fim, o teto.
            const linhas = CAUTELAR_PINTURA_ITENS.map(item => {
                const um = data[`pint_${item.codigo}_um`] || '';
                const classe = data[`pint_${item.codigo}_classe`] || '';
                const opcoes = item.tipo === 'coluna' ? CAUTELAR_CLASSES_COLUNA : CAUTELAR_CLASSES_PINTURA;
                const medida = item.tipo === 'plastico' ? `
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 6px;">Peça plástica — apenas classificação</div>` : `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <input type="number" inputmode="decimal" value="${um}" placeholder="µm" oninput="autoSaveCampo('pint_${escHtml(item.codigo)}_um', this.value)" style="width: 100px; text-align: right; font-family: monospace; padding: 6px; background: var(--bg-primary); border: 1px solid var(--border); color: var(--text-primary); border-radius: var(--radius-sm);">
                        <span style="font-size: 11px; color: var(--text-secondary);">µm medidos</span>
                    </div>`;
                const reparo = item.tipo === 'coluna' ? `
                    <div style="margin-top: 8px;">
                        <div style="font-size: 11px; font-weight: 700; margin-bottom: 4px;">Há indícios de reparos estruturais? <span style="color:var(--danger)">*</span></div>
                        ${cautelarChipsHtml(`pint_${item.codigo}_reparo`, data[`pint_${item.codigo}_reparo`] || '', [{ v: 'nao', t: 'Não' }, { v: 'sim', t: 'Sim' }])}
                    </div>` : '';
                return `
                    <div style="padding: 12px 0; border-bottom: 1px solid var(--border);">
                        <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 6px;">${item.ordem}. ${escHtml(item.nome)}</div>
                        ${medida}
                        <div style="font-size: 11px; font-weight: 700; margin-bottom: 4px;">${item.tipo === 'coluna' ? 'Estado geral' : 'Classificação'} <span style="color:var(--danger)">*</span></div>
                        ${cautelarChipsHtml(`pint_${item.codigo}_classe`, classe, opcoes)}
                        ${reparo}
                    </div>`;
            }).join('');

            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px;">
                    <label style="display:block; font-size:11px; color:var(--text-secondary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">ESPESSURA DA PINTURA (MICRA - µm) E CLASSIFICAÇÃO</label>
                    <p style="font-size: 11px; color: var(--text-secondary); margin: 0 0 8px;">Siga a ordem: frente → lado do motorista → traseira → lado do passageiro → teto. Registre a medida e depois classifique a peça.</p>
                    ${linhas}
                    <div class="form-group" style="margin-top:20px;">
                        <label for="caut-secao4-obs" id="caut-secao4-obs-label">Observações do Vistoriador (Opcional)</label>
                        <textarea id="caut-secao4-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE A PINTURA E AS COLUNAS..." oninput="autoSaveCampo('observacao', this.value)">${escHtml(data.observacao || '')}</textarea>
                    </div>
                </div>
            `;
            setTimeout(() => cautelarAtualizarObsSec4(), 50);
            break;
        }

        case 5:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <p style="font-size:12px; color:var(--text-secondary); line-height: 1.5; margin:0;">
                        Registre as gravações encontradas em todos os vidros. A verificação e o preenchimento de originalidade são feitos diretamente nos cards de foto acima de forma individualizada.
                    </p>
                    <div class="form-group">
                        <label for="caut-secao5-obs">Observações Gerais (Opcional)</label>
                        <textarea id="caut-secao5-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE OS VIDROS E ETIQUETAS..." oninput="autoSaveCampo('observacao', this.value)">${escHtml(data.observacao || '')}</textarea>
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
                        <textarea id="caut-secao6-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE COMPARTIMENTO DO MOTOR..." oninput="autoSaveCampo('observacao', this.value)">${escHtml(data.observacao || '')}</textarea>
                    </div>
                </div>
            `;
            break;

        case 7:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label for="caut-quadro-porta">Sinais de Intervenção/Soldas nos Quadros de Portas? <span style="color:var(--danger)">*</span></label>
                        <p style="font-size: 11px; color: var(--text-secondary); margin: 2px 0 6px;">Avalie o quadro de porta POR INTEIRO (soleira, batentes, dobradiças, contorno e colunas) — não apenas as colunas de sustentação do teto.</p>
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
                        <textarea id="caut-secao7-obs" placeholder="DIGITE OBSERVAÇÕES SOBRE O INTERIOR E QUADROS..." oninput="autoSaveCampo('observacao', this.value)">${escHtml(data.observacao || '')}</textarea>
                    </div>
                </div>
            `;
            setTimeout(() => toggleObsRequiredSec7(), 100);
            break;

        case 8:
            html = `
                <div class="panel-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 20px;">
                    <div class="form-group">
                        <label for="caut-parecer-preliminar">Parecer Técnico Final <span style="color:var(--danger)">*</span></label>
                        <select id="caut-parecer-preliminar" onchange="autoSaveCampo('parecerPreliminar', this.value); toggleObsRequiredSec8();" required>
                            <option value="">SELECIONE...</option>
                            <option value="conforme" ${data.parecerPreliminar === 'conforme' ? 'selected' : ''}>CONFORME</option>
                            <option value="com_ressalvas" ${data.parecerPreliminar === 'com_ressalvas' ? 'selected' : ''}>CONFORME COM RESSALVA</option>
                            <option value="nao_conforme" ${data.parecerPreliminar === 'nao_conforme' ? 'selected' : ''}>NÃO CONFORME</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="caut-secao8-obs" id="caut-secao8-obs-label">Observações Finais e Geral</label>
                        <textarea id="caut-secao8-obs" placeholder="DIGITE AS OBSERVAÇÕES FINAIS DO LAUDO..." oninput="autoSaveCampo('observacao', this.value)">${escHtml(data.observacao || '')}</textarea>
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

    const deformacaoContainer = document.getElementById('caut-deformacao-container');
    const deformacaoSel = document.getElementById('caut-deformacao');
    if (deformacaoContainer) deformacaoContainer.style.display = batida === 'sim' ? 'block' : 'none';
    const deformacao = batida === 'sim' && deformacaoSel ? deformacaoSel.value : '';

    const batidaContainer = document.getElementById('caut-batida-obs-container');
    const batidaInput = document.getElementById('caut-batida-obs');
    if (batidaContainer && batidaInput) {
        const show = deformacao === 'sim';
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
        if (window.useSupabase && !photo.pendenteEnvio) {
            sbUpdate('cautelares_fotos', photo.id, { metadados: photo.metadados_json }).catch(avisarFalhaGravacao('Alteração da vistoria'));
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
        } else if (field === 'desbaste') {
            photo.metadados_json.desbaste = value === 'sim';
        }
        saveDatabase();
        if (window.useSupabase && !photo.pendenteEnvio) {
            sbUpdate('cautelares_fotos', photo.id, { metadados: photo.metadados_json }).catch(avisarFalhaGravacao('Alteração da vistoria'));
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
            if (!((secao.dadosJson || {}).tipoVeiculo)) {
                isComplete = false;
                pendingItems.push("Tipo de Veículo");
            }
            const km = document.getElementById('caut-km')?.value ?? (secao.dadosJson || {}).quilometragem;
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
        case 2: {
            const chassi = document.getElementById('caut-chassi')?.value;
            const motor = document.getElementById('caut-motor')?.value;
            const d2 = secao.dadosJson || {};
            if (!chassi || chassi.trim().length < 5) {
                isComplete = false;
                pendingItems.push("Chassi Lido");
            }
            if (!motor || motor.trim().length < 3) {
                isComplete = false;
                pendingItems.push("Motor Lido");
            }
            let etiquetaComProblema = false;
            CAUTELAR_ETIQUETAS.forEach(et => {
                if (!d2[et.codigo]) {
                    isComplete = false;
                    pendingItems.push(et.nome);
                } else if (d2[et.codigo] !== 'preservada') {
                    etiquetaComProblema = true;
                }
            });
            const obs2 = document.getElementById('caut-secao2-obs');
            const label2 = document.getElementById('caut-secao2-obs-label');
            if (label2) label2.innerHTML = etiquetaComProblema
                ? `Observações <span style="color:var(--danger)">* (descreva a etiqueta danificada/ausente)</span>`
                : 'Observações (Opcional)';
            if (etiquetaComProblema && (!obs2 || !obs2.value.trim())) {
                isComplete = false;
                pendingItems.push("Observação sobre etiqueta danificada/ausente");
            }
            break;
        }
        case 3:
            const enchenteVal = document.getElementById('caut-enchente')?.value;
            const enchenteObsVal = document.getElementById('caut-enchente-obs')?.value;
            if (enchenteVal === 'sim' && (!enchenteObsVal || !enchenteObsVal.trim())) {
                isComplete = false;
                pendingItems.push("Observações de Indícios de Enchente");
            }
            const batidaVal = document.getElementById('caut-batida')?.value;
            const deformacaoVal = document.getElementById('caut-deformacao')?.value;
            const batidaObsVal = document.getElementById('caut-batida-obs')?.value;
            if (batidaVal === 'sim' && !deformacaoVal) {
                isComplete = false;
                pendingItems.push("Houve deformação estrutural?");
            }
            if (batidaVal === 'sim' && deformacaoVal === 'sim' && (!batidaObsVal || !batidaObsVal.trim())) {
                isComplete = false;
                pendingItems.push("Descrição da deformação estrutural");
            }
            const parecerVal = document.getElementById('caut-parecer-estrutural')?.value;
            const parecerObsVal = document.getElementById('caut-secao3-obs')?.value;
            if (parecerVal && parecerVal !== 'conforme' && (!parecerObsVal || !parecerObsVal.trim())) {
                isComplete = false;
                pendingItems.push("Comentários e Justificativa do Parecer Estrutural");
            }
            break;
        case 4: {
            const d4 = secao.dadosJson || {};
            let semMedida = 0, semClasse = 0, semReparo = 0;
            CAUTELAR_PINTURA_ITENS.forEach(item => {
                const classe = d4[`pint_${item.codigo}_classe`];
                if (!classe) semClasse++;
                if (item.tipo !== 'plastico' && classe !== 'Não aplicável' && !(parseFloat(d4[`pint_${item.codigo}_um`]) > 0)) semMedida++;
                if (item.tipo === 'coluna' && !d4[`pint_${item.codigo}_reparo`]) semReparo++;
            });
            if (semMedida) { isComplete = false; pendingItems.push(`Medida (µm) de ${semMedida} peça(s)`); }
            if (semClasse) { isComplete = false; pendingItems.push(`Classificação de ${semClasse} peça(s)`); }
            if (semReparo) { isComplete = false; pendingItems.push(`Reparo estrutural de ${semReparo} coluna(s)`); }
            const obs4 = document.getElementById('caut-secao4-obs');
            if (cautelarColunaComReparo(d4) && (!obs4 || !obs4.value.trim())) {
                isComplete = false;
                pendingItems.push("Descrição do reparo estrutural nas colunas (observações)");
            }
            break;
        }
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
                    sbUpdate('cautelares_secoes', secao.id, { status: 'completa', dataHoraCompletada: secao.dataHoraCompletada }).catch(avisarFalhaGravacao('Alteração da vistoria'));
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
                    sbUpdate('cautelares_secoes', secao.id, { status: 'em_andamento', dataHoraCompletada: null }).catch(avisarFalhaGravacao('Alteração da vistoria'));
                }
            }
        }
    }

    // Ocultar/Exibir botão voltar se estiver na primeira seção
    const btnAnterior = document.getElementById('btn-captura-anterior');
    if (btnAnterior) {
        btnAnterior.style.display = cautelarPosicaoSecao(secaoNum) === 0 ? 'none' : 'flex';
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
                sbUpdate('cautelares_secoes', secao.id, { dadosJson: secao.dadosJson })
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
    const proxima = cautelarProximaSecao(current);
    if (proxima) {
        // Inicializa a próxima seção se necessário
        const nextSecao = db.cautelares_secoes.find(s => s.cautelarId === window.activeCautelarId && s.numeroSecao === proxima);
        if (nextSecao && nextSecao.status === 'nao_iniciada') {
            nextSecao.status = 'em_andamento';
            saveDatabase();
            if (window.useSupabase) {
                sbUpdate('cautelares_secoes', nextSecao.id, { status: 'em_andamento' }).catch(avisarFalhaGravacao('Alteração da vistoria'));
            }
        }
        irParaSecaoCaptura(proxima);
        
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
                sbUpdate('cautelares', cautelar.id, { status: cautelar.status, dataHoraEnvio: cautelar.dataHoraEnvio }),
                sbUpdate('ordens_servico', os.id, { status: os.status })
            ]).catch(avisarFalhaGravacao('Alteração da vistoria'));
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
    const anterior = cautelarSecaoAnterior(window.activeSecaoNum);
    if (anterior) {
        irParaSecaoCaptura(anterior);
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
    fecharCameraCautelar();
    fecharPreviewFotoCautelar();
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
 * CÂMERA DENTRO DA PÁGINA
 * O <input capture> abre o app de câmera do sistema e o navegador vai para
 * segundo plano; no Android ele é encerrado por falta de memória no meio da
 * vistoria (a partir da 2ª/3ª foto). Aqui a câmera roda na própria página via
 * getUserMedia, então o navegador nunca sai da tela. Sem suporte ou sem
 * permissão, cai para o seletor de arquivo.
 */
const CAUTELAR_FOTO_LADO_MAX = 1600;
// Fotos de números gravados (chassi, motor, etiquetas, vidros): o quadro inteiro
// da câmera (1920), sem reduzir. Pedir 4K à câmera derrubava o navegador por
// falta de memória em celulares Android intermediários (28/09/2026).
const CAUTELAR_FOTO_LADO_MAX_TEXTO = 1920;
const CAUTELAR_FOTO_QUALIDADE = 0.82;

// Pede ao navegador que não apague os dados do site (fotos ainda não enviadas
// ficam no IndexedDB; o iPhone apaga dados de sites "não persistentes" quando
// falta espaço ou após dias sem uso).
function cautelarPedirArmazenamentoPersistente() {
    if (window.__persistenciaPedida || !navigator.storage || !navigator.storage.persist) return;
    window.__persistenciaPedida = true;
    navigator.storage.persisted().then(ja => ja || navigator.storage.persist()).then(ok => {
        if (!ok) console.warn('O navegador não garantiu o armazenamento persistente das fotos.');
    }).catch(() => {});
}

/**
 * Posição do celular no momento da foto, pelo sensor de gravidade.
 * Com a tela travada em pé, uma foto tirada com o aparelho deitado sai deitada;
 * aqui o sistema sabe como o celular estava sendo segurado e grava a foto em pé.
 */
const CautelarSensorPosicao = {
    leituras: [],
    handler: null,
    iniciar() {
        this.parar();
        this.leituras = [];
        if (typeof DeviceMotionEvent === 'undefined') return;
        const ligar = () => {
            this.handler = (e) => {
                const g = e.accelerationIncludingGravity;
                if (!g || g.x == null || g.y == null) return;
                this.leituras.push([g.x, g.y]);
                if (this.leituras.length > 8) this.leituras.shift();
            };
            window.addEventListener('devicemotion', this.handler);
        };
        // iPhone: a permissão do sensor precisa ser pedida no toque do usuário
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission().then(r => { if (r === 'granted') ligar(); }).catch(() => { });
        } else {
            ligar();
        }
    },
    parar() {
        if (this.handler) window.removeEventListener('devicemotion', this.handler);
        this.handler = null;
    },
    /**
     * Rotação (horária: 0, 90, 180 ou 270) que deixa a foto em pé, ou null quando a
     * posição é incerta (celular apontado para baixo/cima, inclinado a 45° ou sem sensor).
     */
    rotacaoNecessaria() {
        if (!this.leituras.length) return null;
        let x = 0, y = 0;
        this.leituras.forEach(l => { x += l[0]; y += l[1]; });
        x /= this.leituras.length; y /= this.leituras.length;
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) { x = -x; y = -y; } // iOS usa o sinal invertido
        if (Math.hypot(x, y) < 3) return null;
        // Posição física: 0 em pé, 90 topo para a esquerda, 180 de cabeça para baixo, 270 topo para a direita
        let fisica;
        if (Math.abs(x) > Math.abs(y) * 1.2) fisica = x > 0 ? 90 : 270;
        else if (Math.abs(y) > Math.abs(x) * 1.2) fisica = y > 0 ? 0 : 180;
        else return null;
        // Se a tela também girou, a imagem da câmera já vem na posição da tela
        const angTela = (screen.orientation && typeof screen.orientation.angle === 'number')
            ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
        const tela = ((angTela % 360) + 360) % 360;
        const diferenca = (((fisica - tela) % 360) + 360) % 360;
        return (360 - diferenca) % 360;
    }
};

async function abrirCameraCautelar(slotCodigo) {
    const usarArquivo = () => {
        const input = document.getElementById(`input-camera-${slotCodigo}`);
        if (input) {
            input.setAttribute('capture', 'environment');
            input.click();
            input.removeAttribute('capture');
        }
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        usarArquivo();
        return;
    }

    fecharCameraCautelar();
    CautelarSensorPosicao.iniciar(); // no toque do usuário (exigência do iPhone)
    const slotInfo = cautelarSlotInfo(slotCodigo);

    const overlay = document.createElement('div');
    overlay.id = 'cautelar-camera-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#000;display:flex;flex-direction:column;';
    overlay.innerHTML = `
        <div style="padding:12px 16px;color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span>${slotInfo ? slotInfo.nome : slotCodigo}</span>
            <button type="button" id="cam-fechar" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:13px;">Cancelar</button>
        </div>
        <div style="flex:1;position:relative;overflow:hidden;">
            <video id="cam-video" autoplay playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;"></video>
            ${slotInfo && slotInfo.texto ? `
            <div style="position:absolute;left:6%;right:6%;top:50%;height:28%;transform:translateY(-50%);border:2px dashed rgba(255,255,255,0.85);border-radius:8px;pointer-events:none;"></div>
            <div style="position:absolute;left:0;right:0;bottom:8px;text-align:center;color:#fff;font-size:12px;font-weight:700;text-shadow:0 1px 3px #000;padding:0 16px;pointer-events:none;">
                Enquadre o número/etiqueta INTEIRO na HORIZONTAL, do início ao fim, dentro da moldura
            </div>` : ''}
            <div id="cam-msg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;text-align:center;padding:24px;">Abrindo câmera...</div>
        </div>
        <div style="padding:16px 16px calc(16px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;">
            <button type="button" id="cam-sistema" style="background:none;border:none;color:#bbb;font-size:12px;text-decoration:underline;width:90px;text-align:left;">Câmera do celular</button>
            <button type="button" id="cam-disparo" aria-label="Tirar foto" disabled style="width:72px;height:72px;border-radius:50%;border:4px solid #fff;background:rgba(255,255,255,0.25);"></button>
            <span style="width:90px;"></span>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#cam-fechar').onclick = () => fecharCameraCautelar();
    overlay.querySelector('#cam-sistema').onclick = () => { fecharCameraCautelar(); usarArquivo(); };

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            // Full HD: resolução maior que esta estoura a memória do navegador no celular
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
    } catch (err) {
        console.warn("Câmera na página indisponível; usando a câmera do sistema.", err);
        fecharCameraCautelar();
        showToast("Não foi possível abrir a câmera aqui. Usando a câmera do celular.", "warning");
        usarArquivo();
        return;
    }
    // O overlay pode ter sido fechado enquanto a permissão era pedida
    if (!document.getElementById('cautelar-camera-overlay')) {
        stream.getTracks().forEach(t => t.stop());
        return;
    }
    window._cautelarCameraStream = stream;

    const video = overlay.querySelector('#cam-video');
    video.srcObject = stream;
    video.onloadedmetadata = () => {
        overlay.querySelector('#cam-msg').style.display = 'none';
        overlay.querySelector('#cam-disparo').disabled = false;
    };

    overlay.querySelector('#cam-disparo').onclick = async () => {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) return;
        const ladoMax = slotInfo && slotInfo.texto ? CAUTELAR_FOTO_LADO_MAX_TEXTO : CAUTELAR_FOTO_LADO_MAX;
        const escala = Math.min(1, ladoMax / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * escala);
        canvas.height = Math.round(h * escala);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const rotacaoSensor = CautelarSensorPosicao.rotacaoNecessaria();
        let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', CAUTELAR_FOTO_QUALIDADE));
        canvas.width = 0;
        canvas.height = 0;
        fecharCameraCautelar();
        if (blob && rotacaoSensor) {
            try { blob = await cautelarGirarBlob(blob, rotacaoSensor); } catch (e) { console.warn('Não foi possível endireitar a foto pelo sensor:', e); }
        }
        if (navigator.vibrate) navigator.vibrate(30);
        if (!blob) {
            showToast("Falha ao capturar a foto. Tente novamente.", "error");
            return;
        }
        await processarFotoCautelar(slotCodigo, blob, { origem: 'camera_pagina', jaReduzida: true, rotacaoSensor });
    };
}

function fecharCameraCautelar() {
    CautelarSensorPosicao.parar();
    if (window._cautelarCameraStream) {
        window._cautelarCameraStream.getTracks().forEach(t => t.stop());
        window._cautelarCameraStream = null;
    }
    const overlay = document.getElementById('cautelar-camera-overlay');
    if (overlay) {
        const video = overlay.querySelector('video');
        if (video) video.srcObject = null;
        overlay.remove();
    }
}

/**
 * Gira um JPEG em múltiplos de 90° (sentido horário).
 */
async function cautelarGirarBlob(blob, graus) {
    graus = ((graus % 360) + 360) % 360;
    if (!graus) return blob;
    const bmp = await createImageBitmap(blob);
    const deitar = graus === 90 || graus === 270;
    const canvas = document.createElement('canvas');
    canvas.width = deitar ? bmp.height : bmp.width;
    canvas.height = deitar ? bmp.width : bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(graus * Math.PI / 180);
    ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    if (bmp.close) bmp.close();
    const out = await new Promise(r => canvas.toBlob(r, 'image/jpeg', CAUTELAR_FOTO_QUALIDADE));
    canvas.width = 0;
    canvas.height = 0;
    if (!out) throw new Error('Falha ao girar a imagem');
    return out;
}

// Original da foto: do aparelho (se ainda não enviada) ou da nuvem
async function cautelarObterOriginal(cautelarId, slotCodigo) {
    const rec = await CautelarOfflineDB.getFoto(cautelarId, slotCodigo).catch(() => null);
    if (rec && rec.blob) return { blob: rec.blob, metadados: rec.metadados || {} };
    const secaoNum = cautelarSecaoDoSlot(slotCodigo);
    const secao = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === secaoNum);
    const photo = secao && db.cautelares_fotos.find(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);
    const url = photo && (photo.url_original || photo.urlOriginal);
    if (!url || !url.startsWith('http')) return null;
    const resp = await fetch(await urlArmazenamento(url), { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return { blob: await resp.blob(), metadados: photo.metadados_json || {} };
}

/**
 * Gira uma foto já registrada e a coloca de novo na fila de envio.
 */
async function cautelarGirarFoto(cautelarId, slotCodigo, graus) {
    const chave = `${cautelarId}_${slotCodigo}`;
    if (window._cautelarEnviando.has(chave) || window._cautelarOrientando.has(chave)) {
        throw new Error('A foto está sendo enviada ou conferida; tente girar em alguns segundos.');
    }
    window._cautelarOrientando.add(chave);
    try { return await cautelarGirarFotoAgora(cautelarId, slotCodigo, graus); }
    finally { window._cautelarOrientando.delete(chave); }
}

async function cautelarGirarFotoAgora(cautelarId, slotCodigo, graus) {
    const orig = await cautelarObterOriginal(cautelarId, slotCodigo);
    if (!orig) throw new Error('Foto original indisponível');
    const girada = await cautelarGirarBlob(orig.blob, graus);
    const thumb = await compressImage(girada, 400, 0.70);
    const metadados = Object.assign({}, orig.metadados, { rotacaoManual: ((orig.metadados.rotacaoManual || 0) + graus) % 360 });
    await CautelarOfflineDB.saveFoto(cautelarId, slotCodigo, girada, metadados, thumb);
    const secaoNum = cautelarSecaoDoSlot(slotCodigo);
    const secao = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === secaoNum);
    const photo = secao && db.cautelares_fotos.find(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);
    if (photo) {
        photo.pendenteEnvio = true;
        photo.metadados_json = Object.assign({}, photo.metadados_json || {}, { rotacaoManual: metadados.rotacaoManual });
        saveDatabase();
    }
    return girada;
}

function cautelarBlobParaDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Pergunta ao servidor a rotação que deixa o texto da foto na horizontal e legível
async function cautelarConsultarOrientacao(blob, slotCodigo) {
    if (!window.useSupabase || typeof supabaseClient === 'undefined' || !supabaseClient || navigator.onLine === false) return null;
    const amostra = await compressImage(blob, 1024, 0.85);
    const imagem = await cautelarBlobParaDataUrl(amostra);
    const { data, error } = await supabaseClient.functions.invoke('orientar-foto', { body: { imagem, slot: slotCodigo } });
    if (error || !data || typeof data.rotacao !== 'number') throw error || new Error('Resposta inválida da checagem de orientação');
    return data;
}

/**
 * Checagem redundante das fotos de identificação: o servidor analisa duas vezes a
 * imagem; se indicar rotação, a foto é girada e conferida DE NOVO — só fica girada
 * se a segunda conferência disser que está em pé. Caso contrário, a foto não é
 * alterada e fica marcada como "incerta" para conferência de quem emite o laudo.
 * Devolve { blob, rotacao, conferida, incerta }.
 */
async function cautelarGarantirOrientacao(blob, slotCodigo) {
    const r1 = await cautelarConsultarOrientacao(blob, slotCodigo);
    if (!r1) return { blob, rotacao: 0, conferida: false, incerta: false };
    if (!r1.rotacao) return { blob, rotacao: 0, conferida: true, incerta: !!r1.incerta };
    const girada = await cautelarGirarBlob(blob, r1.rotacao);
    const r2 = await cautelarConsultarOrientacao(girada, slotCodigo);
    if (r2 && r2.rotacao === 0 && !r2.incerta) return { blob: girada, rotacao: r1.rotacao, conferida: true, incerta: false };
    return { blob, rotacao: 0, conferida: true, incerta: true };
}

// Grava a foto ajustada (no aparelho e na fila de envio) com o registro da conferência
async function cautelarSalvarFotoConferida(cautelarId, slotCodigo, blob, metadadosBase, resultado) {
    const orientacaoIA = { rotacao: resultado.rotacao, incerta: resultado.incerta, conferidaEm: new Date().toISOString() };
    const metadados = Object.assign({}, metadadosBase || {}, { orientacaoIA });
    const thumb = resultado.rotacao ? await compressImage(blob, 400, 0.70) : undefined;
    const secaoNum = cautelarSecaoDoSlot(slotCodigo);
    const secao = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === secaoNum);
    const photo = secao && db.cautelares_fotos.find(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);
    if (resultado.rotacao) {
        await CautelarOfflineDB.saveFoto(cautelarId, slotCodigo, blob, metadados, thumb);
        if (photo) photo.pendenteEnvio = true;
    }
    if (photo) photo.metadados_json = Object.assign({}, photo.metadados_json || {}, { orientacaoIA });
    saveDatabase();
    // Foto já na nuvem e sem alteração: grava só o registro da conferência
    if (!resultado.rotacao && photo && Number(photo.id) > 0 && window.useSupabase) {
        sbUpdate('cautelares_fotos', photo.id, { metadados: photo.metadados_json }).catch(e => console.warn('Registro da conferência não gravado:', e));
    }
    return metadados;
}

/**
 * Logo depois da foto: fotos de números e etiquetas (chassi, motor, ETA, vidros,
 * placa, CRLV, painel) passam pela checagem redundante no servidor.
 */
async function cautelarAutoOrientar(cautelarId, slotCodigo) {
    const info = cautelarSlotInfo(slotCodigo);
    if (!info || !info.texto || navigator.onLine === false) return;

    const chave = `${cautelarId}_${slotCodigo}`;
    window._cautelarOrientando.add(chave);
    cautelarIndicador(`<i class="ri-loader-4-line" style="color:var(--accent); animation: pulse 1s infinite;"></i> Conferindo a posição da foto...`);
    try {
        const rec = await CautelarOfflineDB.getFoto(cautelarId, slotCodigo);
        if (!rec || !rec.blob) return;
        const resultado = await cautelarGarantirOrientacao(rec.blob, slotCodigo);
        if (!resultado.conferida) return;
        const agora = await CautelarOfflineDB.getFoto(cautelarId, slotCodigo).catch(() => null);
        if (!agora || agora.timestamp !== rec.timestamp) return;   // foto refeita no meio: a nova será conferida
        await cautelarSalvarFotoConferida(cautelarId, slotCodigo, resultado.blob, rec.metadados, resultado);
        const secaoNum = cautelarSecaoDoSlot(slotCodigo);
        if (resultado.rotacao && window.activeCautelarId === cautelarId && window.activeSecaoNum === secaoNum && !document.getElementById('cautelar-preview-overlay')) {
            renderCapturaSecao(secaoNum);
        }
        if (resultado.incerta) showToast(`Confira a posição da foto "${info.nome}": o texto não pôde ser confirmado na horizontal.`, "warning");
    } catch (e) {
        console.warn('Falha na checagem de orientação da foto:', e);
    } finally {
        window._cautelarOrientando.delete(chave);
    }
}

/**
 * Antes de emitir o laudo: confere de novo TODAS as fotos de identificação que
 * ainda não foram conferidas (ou ficaram incertas), endireita as que precisarem e
 * envia. Devolve os nomes das fotos cuja posição não pôde ser confirmada.
 */
async function cautelarConferirOrientacaoFotos(cautelarId, aoProgredir) {
    const secaoIds = db.cautelares_secoes.filter(s => s.cautelarId === cautelarId).map(s => s.id);
    const alvo = db.cautelares_fotos.filter(f => secaoIds.includes(f.secaoId)).filter(f => {
        const info = cautelarSlotInfo(f.slotCodigo);
        const o = (f.metadados_json || f.metadados || {}).orientacaoIA;
        return info && info.texto && !o;
    });
    // Já marcadas como incertas numa conferência anterior: não gasta outra análise,
    // vão direto para a lista de conferência de quem emite
    const incertas = db.cautelares_fotos.filter(f => secaoIds.includes(f.secaoId)).filter(f => {
        const o = (f.metadados_json || f.metadados || {}).orientacaoIA;
        return o && o.incerta;
    }).map(f => (cautelarSlotInfo(f.slotCodigo) || {}).nome || f.slotCodigo);
    let feitas = 0, alterou = false, i = 0;
    const trabalhador = async () => {
        while (i < alvo.length) {
            const foto = alvo[i++];
            const info = cautelarSlotInfo(foto.slotCodigo);
            const chave = `${cautelarId}_${foto.slotCodigo}`;
            // Trava por foto: não confere a que está subindo, girando ou sendo conferida
            if (window._cautelarEnviando.has(chave) || window._cautelarOrientando.has(chave)) { feitas++; continue; }
            window._cautelarOrientando.add(chave);
            try {
                const orig = await cautelarObterOriginal(cautelarId, foto.slotCodigo);
                if (!orig) continue;
                const urlAntes = foto.url_original;
                const resultado = await cautelarGarantirOrientacao(orig.blob, foto.slotCodigo);
                if (!resultado.conferida) { incertas.push(info.nome); continue; }
                if (foto.url_original !== urlAntes) continue;   // foto trocada no meio
                await cautelarSalvarFotoConferida(cautelarId, foto.slotCodigo, resultado.blob, orig.metadados, resultado);
                if (resultado.rotacao) alterou = true;
                if (resultado.incerta) incertas.push(info.nome);
            } catch (e) {
                console.warn('Checagem de orientação indisponível para', foto.slotCodigo, e);
                incertas.push(info.nome);
            } finally {
                window._cautelarOrientando.delete(chave);
                feitas++;
                if (typeof aoProgredir === 'function') aoProgredir(feitas, alvo.length);
            }
        }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
    if (alterou) await cautelarEnviarPendentes(cautelarId);
    return incertas;
}

/**
 * Pré-visualização em tela cheia: ampliar para conferir detalhes, girar,
 * excluir ou fechar. Na foto do painel, pede a quilometragem.
 */
async function abrirPreviewFotoCautelar(slotCodigo, opcoes = {}) {
    const cautelarId = window.activeCautelarId;
    const info = cautelarSlotInfo(slotCodigo);
    const secaoNum = cautelarSecaoDoSlot(slotCodigo);
    const secao = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === secaoNum);
    if (!secao) return;
    fecharPreviewFotoCautelar();

    const ehPainel = slotCodigo === 'painel_hodometro';
    const kmAtual = (secao.dadosJson || {}).quilometragem || '';

    const overlay = document.createElement('div');
    overlay.id = 'cautelar-preview-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;background:#000;display:flex;flex-direction:column;';
    overlay.innerHTML = `
        <div style="padding:12px 16px;color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;">${info ? info.nome : slotCodigo}</div>
        <div id="prev-area" style="flex:1;overflow:auto;position:relative;background:#000;-webkit-overflow-scrolling:touch;">
            <img id="prev-img" alt="" style="display:block;width:100%;height:100%;object-fit:contain;">
            <div id="prev-msg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;">Carregando foto...</div>
        </div>
        ${ehPainel ? `
        <div style="padding:10px 16px;background:#111;">
            <label for="prev-km" style="color:#fff;font-size:12px;font-weight:700;">QUILOMETRAGEM EXIBIDA NO PAINEL *</label>
            <input type="number" inputmode="numeric" id="prev-km" value="${kmAtual}" placeholder="Digite a km que aparece na foto" style="margin-top:6px;width:100%;font-size:20px;font-weight:700;font-family:monospace;padding:10px;">
        </div>` : ''}
        <div style="padding:12px 16px calc(12px + env(safe-area-inset-bottom));display:flex;gap:8px;background:#111;">
            <button type="button" id="prev-zoom" style="flex:1;background:#333;color:#fff;border:none;border-radius:8px;padding:12px 0;font-size:13px;font-weight:700;"><i class="ri-zoom-in-line"></i> 1x</button>
            <button type="button" id="prev-girar" style="flex:1;background:#333;color:#fff;border:none;border-radius:8px;padding:12px 0;font-size:13px;font-weight:700;"><i class="ri-clockwise-line"></i> Girar</button>
            <button type="button" id="prev-excluir" style="flex:1;background:#b91c1c;color:#fff;border:none;border-radius:8px;padding:12px 0;font-size:13px;font-weight:700;"><i class="ri-delete-bin-line"></i> Excluir</button>
            <button type="button" id="prev-fechar" style="flex:1.2;background:#16a34a;color:#fff;border:none;border-radius:8px;padding:12px 0;font-size:13px;font-weight:700;"><i class="ri-check-line"></i> Fechar</button>
        </div>`;
    document.body.appendChild(overlay);

    const img = overlay.querySelector('#prev-img');
    const msg = overlay.querySelector('#prev-msg');
    let urlTemp = null;
    const carregar = async () => {
        msg.style.display = 'flex';
        try {
            const rec = await CautelarOfflineDB.getFoto(cautelarId, slotCodigo).catch(() => null);
            if (urlTemp) { URL.revokeObjectURL(urlTemp); urlTemp = null; }
            if (rec && rec.blob) {
                urlTemp = URL.createObjectURL(rec.blob);
                img.src = urlTemp;
            } else {
                const photo = db.cautelares_fotos.find(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);
                img.src = photo ? (photo.url_original || photo.url_thumb || photo.urlThumb || '') : '';
            }
            img.onload = () => { msg.style.display = 'none'; };
            img.onerror = () => { msg.textContent = 'Não foi possível carregar a foto.'; };
        } catch (e) {
            msg.textContent = 'Não foi possível carregar a foto.';
        }
    };
    overlay._liberar = () => { if (urlTemp) URL.revokeObjectURL(urlTemp); };
    await carregar();

    // Zoom: 1x → 2x → 3x (arraste para percorrer a foto ampliada)
    let zoom = 1;
    const aplicarZoom = () => {
        if (zoom === 1) {
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.maxWidth = '';
        } else {
            img.style.width = `${zoom * 100}%`;
            img.style.height = 'auto';
            img.style.maxWidth = 'none';
        }
        overlay.querySelector('#prev-zoom').innerHTML = `<i class="ri-zoom-in-line"></i> ${zoom}x`;
    };
    overlay.querySelector('#prev-zoom').onclick = () => { zoom = zoom >= 3 ? 1 : zoom + 1; aplicarZoom(); };
    img.ondblclick = () => { zoom = zoom === 1 ? 2 : 1; aplicarZoom(); };

    const kmInput = overlay.querySelector('#prev-km');
    const salvarKm = () => {
        if (!kmInput) return true;
        const v = kmInput.value.trim();
        if (!v || parseFloat(v) <= 0) {
            kmInput.focus();
            showToast("Digite a quilometragem exibida no painel.", "warning");
            return false;
        }
        if (window.activeSecaoNum === secaoNum) {
            const campo = document.getElementById('caut-km');
            if (campo) campo.value = v;
        }
        secao.dadosJson = secao.dadosJson || {};
        secao.dadosJson.quilometragem = v;
        autoSaveCampo('quilometragem', v);
        return true;
    };
    if (kmInput && opcoes.focarKm) setTimeout(() => kmInput.focus(), 300);

    overlay.querySelector('#prev-fechar').onclick = () => {
        if (!salvarKm()) return;
        fecharPreviewFotoCautelar();
        if (window.activeSecaoNum === secaoNum) renderCapturaSecao(secaoNum);
    };
    overlay.querySelector('#prev-excluir').onclick = async () => {
        fecharPreviewFotoCautelar();
        await deleteFotoCaptura(slotCodigo);
    };
    overlay.querySelector('#prev-girar').onclick = async () => {
        const btn = overlay.querySelector('#prev-girar');
        btn.disabled = true;
        btn.innerHTML = '<i class="ri-loader-4-line"></i> ...';
        try {
            await cautelarGirarFoto(cautelarId, slotCodigo, 90);
            await carregar();
            cautelarEnviarPendentes(cautelarId);
        } catch (e) {
            console.warn(e);
            showToast(e && /enviada ou conferida/.test(e.message) ? e.message : "Não foi possível girar a foto agora.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ri-clockwise-line"></i> Girar';
        }
    };
}

function fecharPreviewFotoCautelar() {
    const overlay = document.getElementById('cautelar-preview-overlay');
    if (overlay) {
        if (overlay._liberar) overlay._liberar();
        overlay.remove();
    }
}

/**
 * Foto vinda do seletor de arquivo (galeria ou câmera do sistema).
 */
async function handleFotoUpload(slotCodigo, event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    await processarFotoCautelar(slotCodigo, file, {
        origem: 'arquivo',
        exif: { sizeBytes: file.size, type: file.type, name: file.name }
    });
}

function cautelarSecaoDoSlot(slotCodigo) {
    let secaoNum = null;
    Object.keys(CAUTELAR_SLOTS).forEach(n => {
        if (CAUTELAR_SLOTS[n].some(sl => sl.codigo === slotCodigo)) secaoNum = parseInt(n);
    });
    return secaoNum;
}

function cautelarIndicador(html) {
    const el = document.getElementById('captura-sync-indicator');
    if (el) el.innerHTML = html;
}

/**
 * Reduz a foto, guarda no aparelho (IndexedDB) e registra no slot. O envio para
 * a nuvem é feito em seguida, em segundo plano (cautelarEnviarPendentes); se a
 * rede falhar, a foto continua no aparelho e é reenviada depois.
 */
async function processarFotoCautelar(slotCodigo, fonte, opcoes = {}) {
    const cautelarId = window.activeCautelarId;
    const secaoNum = cautelarSecaoDoSlot(slotCodigo) || window.activeSecaoNum;
    const secao = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === secaoNum);
    if (!cautelarId || !secao) {
        showToast("Seção da vistoria não encontrada. Saia e entre de novo na cautelar.", "error");
        return;
    }

    cautelarIndicador(`<i class="ri-loader-4-line" style="color:var(--accent); animation: pulse 1s infinite;"></i> Processando imagem...`);

    try {
        cautelarPedirArmazenamentoPersistente();
        const infoSlot = cautelarSlotInfo(slotCodigo);
        const blobOriginal = opcoes.jaReduzida
            ? fonte
            : await compressImage(fonte, infoSlot && infoSlot.texto ? CAUTELAR_FOTO_LADO_MAX_TEXTO : CAUTELAR_FOTO_LADO_MAX, CAUTELAR_FOTO_QUALIDADE);
        const blobThumb = await compressImage(blobOriginal, 400, 0.70);

        const metadados = {
            device: navigator.userAgent,
            timestamp: new Date().toISOString(),
            origem: opcoes.origem || 'arquivo',
            exif: opcoes.exif || { sizeBytes: blobOriginal.size, type: 'image/jpeg' }
        };
        // Rotação aplicada pelo sensor de posição (null = posição incerta, sem ajuste)
        if (opcoes.rotacaoSensor !== undefined) metadados.rotacaoSensor = opcoes.rotacaoSensor;
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    // maximumAge reaproveita a posição recente: não segura cada foto 3s
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, maximumAge: 120000 });
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

        // 1. Guarda no aparelho primeiro: se o app cair, a foto não se perde
        await CautelarOfflineDB.saveFoto(cautelarId, slotCodigo, blobOriginal, metadados, blobThumb);

        // 2. Registro local, marcado como pendente de envio (sem base64: o
        //    localStorage tem ~5MB e é regravado a cada alteração)
        const existente = db.cautelares_fotos.findIndex(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);
        if (existente !== -1) db.cautelares_fotos.splice(existente, 1);
        db.cautelares_fotos.push({
            id: cautelarIdTemporario(),
            secaoId: secao.id,
            slotCodigo: slotCodigo,
            slotNomeDisplay: slotCodigo.toUpperCase(),
            urlOriginal: '',
            urlThumb: '',
            dataHoraCaptura: metadados.timestamp,
            metadados_json: metadados,
            ordemExibicao: 0,
            pendenteEnvio: true
        });
        saveDatabase();

        showToast("Foto capturada!", "success");
        if (window.activeCautelarId === cautelarId && window.activeSecaoNum === secaoNum) {
            renderCapturaSecao(secaoNum);
        }

        // Foto do painel: já pede a quilometragem com a imagem ampliada
        if (slotCodigo === 'painel_hodometro') {
            abrirPreviewFotoCautelar(slotCodigo, { focarKm: true });
        }

        // 3. Fotos de números/etiquetas: deixa a informação na horizontal antes de enviar
        await cautelarAutoOrientar(cautelarId, slotCodigo);

        // 4. Envio em segundo plano
        cautelarEnviarPendentes(cautelarId);
    } catch (e) {
        console.error("Erro no processamento da imagem:", e);
        showToast("Falha ao capturar a foto. Tente novamente.", "error");
        cautelarIndicador(`<i class="ri-error-warning-line" style="color:var(--danger);"></i> Falha na foto`);
    }
}

window._cautelarEnviando = window._cautelarEnviando || new Set();
window._cautelarOrientando = window._cautelarOrientando || new Set();

/**
 * Envia para a nuvem todas as fotos desta cautelar que estão só no aparelho.
 * Depois de enviada, a foto é apagada do IndexedDB para não lotar o celular.
 */
async function cautelarEnviarPendentes(cautelarId) {
    if (!window.useSupabase || (window.onlineTables && !window.onlineTables['cautelares_fotos'])) return;
    if (navigator.onLine === false) {
        cautelarIndicador(`<i class="ri-wifi-off-line" style="color:var(--danger);"></i> Sem internet (fotos salvas no aparelho)`);
        return;
    }
    // Garante que toda foto guardada no aparelho tenha o registro local
    await cautelarRecuperarFotosOffline(cautelarId);
    let registros = [];
    try {
        registros = await CautelarOfflineDB.getAllFotos(cautelarId);
    } catch (e) {
        return;
    }
    if (registros.length === 0) return;

    let falhas = 0;
    for (const rec of registros) {
        const chave = `${cautelarId}_${rec.slotCodigo}`;
        if (window._cautelarEnviando.has(chave) || window._cautelarOrientando.has(chave)) continue;
        window._cautelarEnviando.add(chave);
        cautelarIndicador(`<i class="ri-loader-4-line" style="color:var(--accent); animation: pulse 1s infinite;"></i> Enviando fotos...`);
        try {
            await cautelarEnviarFoto(cautelarId, rec);
        } catch (e) {
            falhas++;
            console.warn(`Envio da foto ${rec.slotCodigo} falhou; fica no aparelho para reenviar.`, e);
        } finally {
            window._cautelarEnviando.delete(chave);
        }
    }
    cautelarIndicador(falhas > 0
        ? `<i class="ri-wifi-off-line" style="color:var(--danger);"></i> ${falhas} foto(s) aguardando envio`
        : `<i class="ri-checkbox-circle-fill" style="color:var(--success);"></i> Sincronizado`);
}

async function cautelarEnviarFoto(cautelarId, rec) {
    const slotCodigo = rec.slotCodigo;
    const secaoNum = cautelarSecaoDoSlot(slotCodigo);
    const secao = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === secaoNum);
    if (!secao) throw new Error('Seção não encontrada');
    if (secao.id < 0) throw new Error('Seção ainda não gravada no banco');
    const photo = db.cautelares_fotos.find(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);
    // Sem registro local (cautelarRecuperarFotosOffline recria antes do envio)
    if (!photo) return;

    const thumb = rec.thumb || await compressImage(rec.blob, 400, 0.70);
    const base = `cautelares/${cautelarId}/${slotCodigo}`;
    const bucket = supabaseClient.storage.from('cautelares');
    const up1 = await bucket.upload(`${base}.jpg`, rec.blob, { upsert: true, contentType: 'image/jpeg' });
    if (up1.error) throw up1.error;
    const up2 = await bucket.upload(`${base}_thumb.jpg`, thumb, { upsert: true, contentType: 'image/jpeg' });
    if (up2.error) throw up2.error;
    // ?v= evita que o navegador mostre a foto antiga quando o slot é refeito
    const v = Date.now();
    const urlOriginal = `${bucket.getPublicUrl(`${base}.jpg`).data.publicUrl}?v=${v}`;
    const urlThumb = `${bucket.getPublicUrl(`${base}_thumb.jpg`).data.publicUrl}?v=${v}`;

    const linha = {
        secaoId: secao.id,
        slotCodigo: slotCodigo,
        slotNomeDisplay: photo.slotNomeDisplay || slotCodigo.toUpperCase(),
        url_original: urlOriginal,
        url_thumb: urlThumb,
        dataHoraCaptura: photo.dataHoraCaptura || rec.timestamp,
        metadados: photo.metadados_json || rec.metadados || {}
    };
    // Uma linha por slot: se já existir (ex.: envio anterior que caiu no meio), atualiza
    const { data: jaTem, error: errSel } = await supabaseClient
        .from('cautelares_fotos').select('id').eq('secaoId', secao.id).eq('slotCodigo', slotCodigo).limit(1);
    if (errSel) throw errSel;
    let salva;
    if (jaTem && jaTem.length > 0) {
        salva = await sbUpdate('cautelares_fotos', jaTem[0].id, linha);
        salva = Array.isArray(salva) ? salva[0] : salva;
        if (salva) salva.id = salva.id || jaTem[0].id;
    } else {
        salva = await sbInsert('cautelares_fotos', linha);
    }

    photo.id = (salva && salva.id) || photo.id;
    photo.url_original = urlOriginal;
    photo.url_thumb = urlThumb;
    photo.urlOriginal = '';
    photo.urlThumb = '';
    const apagou = await CautelarOfflineDB.deleteFotoSeIgual(cautelarId, slotCodigo, rec.timestamp);
    if (!apagou) {
        // Foto refeita durante o envio: a nova continua pendente e sobe em seguida
        photo.pendenteEnvio = true;
        setTimeout(() => cautelarEnviarPendentes(cautelarId), 500);
        return;
    }
    delete photo.pendenteEnvio;
    saveDatabase();

    const st = document.getElementById(`status-envio-${slotCodigo}`);
    if (st && window.activeCautelarId === cautelarId) {
        st.style.color = 'var(--success)';
        st.innerHTML = '<i class="ri-checkbox-circle-fill"></i> Capturada e enviada';
    }
}

// Voltou a internet: reenvia as fotos pendentes da cautelar aberta
window.addEventListener('online', () => {
    if (window.activeCautelarId) cautelarEnviarPendentes(window.activeCautelarId);
});

/**
 * Remove a foto do slot e apaga do banco de dados e IndexedDB.
 */
async function deleteFotoCaptura(slotCodigo) {
    const confirmMsg = "Deseja realmente apagar esta foto?";
    if (!confirm(confirmMsg)) return;

    const cautelarId = window.activeCautelarId;
    const secao = db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === window.activeSecaoNum);
    const photoIdx = db.cautelares_fotos.findIndex(f => f.secaoId === secao.id && f.slotCodigo === slotCodigo);

    if (photoIdx !== -1) {
        const photo = db.cautelares_fotos[photoIdx];

        // 1. Apaga do aparelho
        try {
            await CautelarOfflineDB.deleteFoto(cautelarId, slotCodigo);
        } catch (e) {
            console.warn(e);
        }

        // 2. Apaga da nuvem (só se já tinha sido enviada: id provisório é negativo)
        if (window.useSupabase && photo.id > 0) {
            sbDelete('cautelares_fotos', photo.id).catch(avisarFalhaGravacao('Alteração da vistoria'));
            const base = `cautelares/${cautelarId}/${slotCodigo}`;
            supabaseClient.storage.from('cautelares').remove([`${base}.jpg`, `${base}_thumb.jpg`])
                .catch(avisarFalhaGravacao('Alteração da vistoria'));
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
    // Decodifica direto do Blob (sem FileReader/data URL, que criava uma string
    // base64 de vários MB além do bitmap) e libera tudo ao final.
    const desenhar = (fonte, w, h, liberar) => new Promise((resolve, reject) => {
        let width = w;
        let height = h;
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

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
        liberar();

        canvas.toBlob((blob) => {
            // Zera o canvas para o navegador devolver a memória na hora
            canvas.width = 0;
            canvas.height = 0;
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error("Canvas blob conversion failed"));
            }
        }, 'image/jpeg', quality);
    });

    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file, { imageOrientation: 'from-image' })
            .catch(() => createImageBitmap(file))
            .then(bmp => desenhar(bmp, bmp.width, bmp.height, () => bmp.close && bmp.close()))
            .catch(() => compressImageViaImg(file, desenhar));
    }
    return compressImageViaImg(file, desenhar);
}

function compressImageViaImg(file, desenhar) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };
        img.onload = () => {
            desenhar(img, img.naturalWidth || img.width, img.naturalHeight || img.height, () => {
                URL.revokeObjectURL(url);
                img.src = '';
            }).then(resolve, reject);
        };
        img.src = url;
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


// Variável de controle do finalizador
window.activeFinalizacaoCautelarId = null;
window.operatorSignatureConfirmed = false;

/**
 * Abre o painel de finalização desktop para a Cautelar selecionada.
 */
async function abrirFinalizacaoDesktop(cautelarId) {
    if (!db || !currentSession) return;
    await garantirDetalhesCautelarApp(cautelarId);

    const cautelar = db.cautelares.find(c => c.id === cautelarId);
    if (!cautelar) {
        showToast("Cautelar não encontrada.", "error");
        return;
    }

    window.activeFinalizacaoCautelarId = cautelarId;
    window.operatorSignatureConfirmed = false;
    const osFinal = db.ordens_servico.find(o => o.id === cautelar.osId);
    const faltandoVeiculo = osFinal ? cautelarDadosVeiculoFaltando(osFinal, cautelarId) : [];
    if (faltandoVeiculo.length) {
        setTimeout(() => avisarDadosVeiculoFaltando(osFinal, faltandoVeiculo, () => {
            if (typeof atualizarPreviewLaudo === 'function') atualizarPreviewLaudo();
        }), 400);
    }

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


// Função auxiliar para converter imagens de vistoria em Base64 compactado para o GPT-4o Vision
async function imageToAiBase64(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const maxDim = 800;
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        resolve(null);
                        return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                }, "image/jpeg", 0.75);
            } catch (e) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/**
 * Resumo textual da vistoria (dados realmente coletados na captura), usado como
 * base da redação do laudo.
 */
function cautelarResumoParaLaudo(os, secoes, fotos) {
    const d = n => (secoes.find(s => s.numeroSecao === n)?.dadosJson) || {};
    const d1 = d(1), d2 = d(2), d3 = d(3), d4 = d(4), d6 = d(6), d7 = d(7), d8 = d(8);
    const simNao = v => v === 'sim' ? 'SIM' : (v === 'nao' ? 'NÃO' : 'N/A');
    const foto = cod => (fotos || []).find(f => f.slotCodigo === cod);
    const meta = cod => (foto(cod) || {}).metadados_json || (foto(cod) || {}).metadados || {};
    const rotuloEstrutura = {
        original: 'Original', reparo_aparente: 'Indícios de reparo', substituicao: 'Indícios de substituição',
        indicio_avaria: 'Indício de avaria', nao_aplicavel: 'Não se aplica'
    };
    const etqStatus = { preservada: 'PRESERVADA', danificada: 'DANIFICADA', ausente: 'AUSENTE' };

    let t = `DADOS DO VEÍCULO (cadastro da O.S.):
- Placa: ${os.placa || 'N/A'}
- Marca/Modelo: ${os.veiculoMarcaModelo || 'N/A'}
- Ano: ${os.veiculoAno || 'N/A'}
- Tipo de carroceria: ${os.veiculoTipo || d1.tipoVeiculo || 'N/A'}
- Chassi (cadastro): ${os.veiculoChassi || 'N/A'}
- Renavam: ${os.renavam || 'N/A'}

IDENTIFICAÇÃO
- Quilometragem lida no painel: ${d1.quilometragem || 'N/A'} km
- Placa confere com o CRLV: ${d1.placaConfere === 'nao' ? 'NÃO' : 'SIM'}
- Estado geral de conservação: ${d1.estadoConservacao || 'N/A'}
- Observações: ${d1.observacao || 'Nenhuma'}

NUMERAÇÃO (CHASSI, MOTOR E ETIQUETAS)
- Chassi lido no veículo: ${d2.chassiLido || 'N/A'}
- Motor lido no veículo: ${d2.motorLido || 'N/A'}
- Gravação do chassi original: ${d2.chassiOriginal !== false ? 'SIM' : 'NÃO'}
- Gravação do motor original: ${d2.motorOriginal !== false ? 'SIM' : 'NÃO'}
${CAUTELAR_ETIQUETAS.map(et => `- ${et.nome}: ${etqStatus[d2[et.codigo]] || 'N/A'}`).join('\n')}
- Observações: ${d2.observacao || 'Nenhuma'}

COMPARTIMENTO DO MOTOR
- Sinais de reparo/troca de estruturas no vão do motor: ${simNao(d6.reparoMotor)}
- Cor original preservada no vão: ${d6.corMotorOk === 'nao' ? 'NÃO' : 'SIM'}
- Observações: ${d6.observacao || 'Nenhuma'}

ESTRUTURA
- Indícios de enchente: ${simNao(d3.indicioEnchente || 'nao')}${d3.indicioEnchente === 'sim' ? ` (${d3.obsEnchente || ''})` : ''}
- Indícios de batida: ${simNao(d3.indicioBatida || 'nao')}
${d3.indicioBatida === 'sim' ? `- Houve deformação estrutural: ${simNao(d3.deformacaoEstrutural)}${d3.deformacaoEstrutural === 'sim' ? ` (${d3.obsBatida || ''})` : ''}\n` : ''}- Avaliação por peça:
${(CAUTELAR_SLOTS[3] || []).map(sl => {
        const m = meta(sl.codigo);
        const st = rotuloEstrutura[m.status_estrutural || 'original'] || m.status_estrutural;
        return `  * ${sl.nome}: ${st}${m.observacao_peca ? ` — ${m.observacao_peca}` : ''}`;
    }).join('\n')}
- Parecer estrutural: ${d3.parecerEstrutural || 'conforme'}
- Observações: ${d3.observacao || 'Nenhuma'}

PINTURA E ACABAMENTO (medição em micras e classificação feita pelo vistoriador)
${CAUTELAR_PINTURA_ITENS.map(it => {
        const um = d4[`pint_${it.codigo}_um`];
        const classe = d4[`pint_${it.codigo}_classe`] || 'N/A';
        const reparo = it.tipo === 'coluna' ? ` | indícios de reparo estrutural: ${simNao(d4[`pint_${it.codigo}_reparo`])}` : '';
        return `  * ${it.nome}: ${it.tipo === 'plastico' ? 'peça plástica' : (um ? um + ' µm' : 'sem medida')} — ${classe}${reparo}`;
    }).join('\n')}
- Observações: ${d4.observacao || 'Nenhuma'}

VIDROS (gravação do chassi)
${(CAUTELAR_SLOTS[5] || []).map(sl => {
        const m = meta(sl.codigo);
        return `  * ${sl.nome}: gravação ${m.vidro_original === false ? 'NÃO original' : 'original'}${m.gravacao_lida ? ` (${m.gravacao_lida})` : ''}${m.desbaste ? ' — INDÍCIOS DE DESBASTE/POLIMENTO' : ''}`;
    }).join('\n')}

QUADROS DE PORTA E INTERIOR
- Intervenção/soldas nos quadros de porta (avaliação do quadro inteiro): ${simNao(d7.intervencaoQuadros || 'nao')}
- Conservação do interior: ${d7.conservacaoInterior || 'N/A'}
- Observações: ${d7.observacao || 'Nenhuma'}

FECHAMENTO
- Parecer técnico do vistoriador: ${d8.parecerPreliminar === 'com_ressalvas' ? 'CONFORME COM RESSALVA' : (d8.parecerPreliminar === 'nao_conforme' ? 'NÃO CONFORME' : (d8.parecerPreliminar ? 'CONFORME' : 'N/A'))}
- Observações finais: ${d8.observacao || 'Nenhuma'}
`;
    return t;
}

async function solicitarLaudoAoServidor(cautelarId) {
    // supabaseClient é declarado com "let" em supabase-config.js: não fica em window.
    // Checar window.supabaseClient fazia o laudo nunca chegar ao servidor.
    if (!window.useSupabase || typeof supabaseClient === 'undefined' || !supabaseClient) {
        throw new Error("A emissão do laudo requer conexão com o servidor.");
    }
    const { data, error } = await supabaseClient.functions.invoke('gerar-laudo', {
        body: { cautelarId }
    });
    if (error) {
        let detalhe = error.message;
        try {
            const contexto = await error.context.json();
            detalhe = contexto.erro || (contexto.detalhes || []).join(' ') || detalhe;
        } catch (_) { /* resposta sem corpo JSON */ }
        throw new Error(detalhe || "Não foi possível gerar o laudo.");
    }
    // Bloqueio por foto obrigatória ausente vem sem redação (não gasta a geração)
    if (data && data.status === 'bloqueado' && !data.resposta) return data;
    if (!data || !data.resposta) throw new Error("O servidor retornou um laudo vazio.");
    return data;
}

function confirmarEmissaoComInconsistencias(itens, podeForcar, bloqueado) {
    const textoSeguro = valor => String(valor).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const titulo = bloqueado ? 'Laudo bloqueado: faltam itens obrigatórios' : 'Confira os apontamentos antes de emitir';
    const subtitulo = bloqueado
        ? 'O laudo não pode ser emitido até que os itens abaixo sejam corrigidos.'
        : 'Estes pontos não impedem a emissão, mas devem ser conferidos:';
    const rotuloEmitir = bloqueado ? 'Emitir mesmo assim' : 'Emitir laudo';
    return new Promise(resolve => {
        const fundo = document.createElement('div');
        fundo.style.cssText = 'position:fixed;inset:0;background:rgba(6,20,40,.72);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px';
        fundo.innerHTML = `<div style="background:var(--bg-card,#fff);color:var(--text-primary,#1c1c1c);max-width:620px;width:100%;border-radius:10px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
            <h3 style="margin:0 0 12px">${titulo}</h3>
            <p style="color:var(--text-secondary);font-size:13px">${subtitulo}</p>
            <ul style="max-height:280px;overflow:auto;padding-left:22px">${itens.map(i => `<li style="margin:7px 0">${textoSeguro(i)}</li>`).join('')}</ul>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
                <button class="btn btn-secondary" data-acao="voltar">Voltar e corrigir</button>
                ${podeForcar ? `<button class="btn btn-primary" data-acao="emitir">${rotuloEmitir}</button>` : ''}
            </div></div>`;
        document.body.appendChild(fundo);
        fundo.querySelector('[data-acao="voltar"]').onclick = () => { fundo.remove(); resolve(false); };
        const emitir = fundo.querySelector('[data-acao="emitir"]');
        if (emitir) emitir.onclick = () => { fundo.remove(); resolve(true); };
    });
}

/**
 * Antes de gerar o laudo no servidor, garante que as fotos que ainda estão no
 * aparelho subiram (o servidor só enxerga o que está no banco). Devolve quantas
 * continuam pendentes neste aparelho.
 */
async function cautelarFotosPendentesAntesDoLaudo(cautelarId) {
    try {
        await cautelarEnviarPendentes(cautelarId);
        const noAparelho = await CautelarOfflineDB.getAllFotos(cautelarId).catch(() => []);
        return noAparelho.length;
    } catch (e) {
        console.warn('Não foi possível conferir fotos pendentes:', e);
        return 0;
    }
}

async function analisarLaudoComIAInvisivel() {
    const cautelarId = window.activeFinalizacaoCautelarId;
    if (!cautelarId) throw new Error("Nenhum laudo ativo para finalização.");
    return solicitarLaudoAoServidor(cautelarId);
}

/**
 * DADOS DO VEÍCULO OBRIGATÓRIOS PARA O LAUDO
 * O laudo não é finalizado sem marca/modelo, ano, chassi, renavam e tipo do
 * veículo no cadastro da O.S. A correção pode ser feita aqui (tela de finalização
 * ou ficha da O.S. no atendimento), mesmo com a O.S. já em vistoria.
 */
function cautelarDadosVeiculoFaltando(os, cautelarId) {
    const d1 = cautelarId ? ((db.cautelares_secoes.find(s => s.cautelarId === cautelarId && s.numeroSecao === 1) || {}).dadosJson || {}) : {};
    const vazio = v => !String(v == null ? '' : v).trim() || /^n[ãa]o informado$/i.test(String(v).trim());
    const faltando = [];
    if (vazio(os.veiculoMarcaModelo)) faltando.push('Marca / modelo');
    if (vazio(os.veiculoAno)) faltando.push('Ano de fabricação / modelo');
    if (vazio(os.veiculoChassi)) faltando.push('Chassi (cadastro)');
    if (vazio(os.renavam)) faltando.push('Renavam');
    if (vazio(os.veiculoTipo) && vazio(d1.tipoVeiculo)) faltando.push('Tipo de veículo');
    return faltando;
}

function abrirCorrecaoDadosVeiculo(osId, aoSalvar) {
    const os = db.ordens_servico.find(o => o.id === osId);
    if (!os) return;
    const cautelar = (db.cautelares || []).find(c => c.osId === osId);
    const d1 = cautelar ? ((db.cautelares_secoes.find(s => s.cautelarId === cautelar.id && s.numeroSecao === 1) || {}).dadosJson || {}) : {};
    const d2 = cautelar ? ((db.cautelares_secoes.find(s => s.cautelarId === cautelar.id && s.numeroSecao === 2) || {}).dadosJson || {}) : {};
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const tipoAtual = os.veiculoTipo || d1.tipoVeiculo || '';
    document.getElementById('modal-dados-veiculo')?.remove();
    const fundo = document.createElement('div');
    fundo.id = 'modal-dados-veiculo';
    fundo.style.cssText = 'position:fixed;inset:0;background:rgba(6,20,40,.72);z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px';
    const campo = (id, rotulo, valor, extra = '') => `<label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);margin:12px 0 4px;text-transform:uppercase">${rotulo}</label>
        <input id="${id}" value="${esc(valor)}" ${extra} style="width:100%;height:40px;border:1px solid var(--border);border-radius:6px;padding:0 10px;font-size:14px;background:var(--bg-primary);color:var(--text-primary);text-transform:uppercase">`;
    fundo.innerHTML = `<div style="background:var(--bg-card,#fff);color:var(--text-primary,#1c1c1c);max-width:480px;width:100%;border-radius:10px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:92vh;overflow:auto">
        <h3 style="margin:0 0 4px">Dados do veículo — ${esc(os.placa)}</h3>
        <p style="margin:0;color:var(--text-secondary);font-size:12px">Obrigatórios para finalizar o laudo cautelar. Copie do documento do veículo (CRLV).</p>
        ${campo('dv-marca-modelo', 'Marca / modelo', os.veiculoMarcaModelo, 'placeholder="EX.: FIAT / TORO VOLCANO"')}
        ${campo('dv-ano', 'Ano fabricação / modelo', os.veiculoAno, 'placeholder="EX.: 2022/2023" inputmode="numeric"')}
        ${campo('dv-chassi', 'Chassi', os.veiculoChassi, 'maxlength="17" placeholder="17 CARACTERES"')}
        ${d2.chassiLido && !os.veiculoChassi ? `<button type="button" id="dv-usar-lido" style="margin-top:6px;background:none;border:none;color:var(--accent);font-size:12px;text-decoration:underline;padding:0">Usar o chassi lido na vistoria (${esc(d2.chassiLido)})</button>` : ''}
        ${campo('dv-renavam', 'Renavam', os.renavam, 'inputmode="numeric" maxlength="11"')}
        <label style="display:block;font-size:11px;font-weight:700;color:var(--text-secondary);margin:12px 0 4px;text-transform:uppercase">Tipo de veículo</label>
        <select id="dv-tipo" style="width:100%;height:40px;border:1px solid var(--border);border-radius:6px;padding:0 10px;font-size:14px;background:var(--bg-primary);color:var(--text-primary)">
            <option value="">SELECIONE</option>${CAUTELAR_TIPOS_VEICULO.map(({ v, t }) => `<option value="${v}" ${v === tipoAtual ? 'selected' : ''}>${t.toUpperCase()}</option>`).join('')}
        </select>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
            <button class="btn btn-secondary" data-acao="cancelar">Cancelar</button>
            <button class="btn btn-primary" data-acao="salvar">Salvar dados</button>
        </div></div>`;
    document.body.appendChild(fundo);
    const usarLido = fundo.querySelector('#dv-usar-lido');
    if (usarLido) usarLido.onclick = () => { fundo.querySelector('#dv-chassi').value = d2.chassiLido; };
    fundo.querySelector('[data-acao="cancelar"]').onclick = () => fundo.remove();
    fundo.querySelector('[data-acao="salvar"]').onclick = async () => {
        const val = id => fundo.querySelector(id).value.trim().toUpperCase();
        const marcaModelo = val('#dv-marca-modelo'), ano = val('#dv-ano'), chassi = val('#dv-chassi').replace(/\s/g, ''), renavam = val('#dv-renavam').replace(/\D/g, ''), tipo = fundo.querySelector('#dv-tipo').value;
        const faltam = [[marcaModelo, 'Marca / modelo'], [ano, 'Ano'], [chassi, 'Chassi'], [renavam, 'Renavam'], [tipo, 'Tipo de veículo']].filter(([v]) => !v).map(([, n]) => n);
        if (faltam.length) { showToast(`Preencha: ${faltam.join(', ')}.`, "error"); return; }
        if (!/^\d{4}(\/\d{4})?$/.test(ano)) { showToast("Ano inválido. Use 2022 ou 2022/2023.", "error"); return; }
        if (chassi.length !== 17 && !confirm(`O chassi informado tem ${chassi.length} caracteres (o padrão é 17). Confirma assim mesmo?`)) return;
        if (renavam.length < 9) { showToast("Renavam inválido (9 a 11 dígitos).", "error"); return; }
        const btn = fundo.querySelector('[data-acao="salvar"]');
        btn.disabled = true;
        try {
            os.veiculoMarcaModelo = marcaModelo;
            os.veiculoAno = ano;
            os.veiculoChassi = chassi;
            os.renavam = renavam;
            os.veiculoTipo = tipo;
            saveDatabase();
            await dbSave('ordens_servico', { veiculoMarcaModelo: marcaModelo, veiculoAno: ano, veiculoChassi: chassi, renavam, veiculoTipo: tipo }, 'update', os.id);
            logAudit("Dados do veículo", `Corrigiu os dados do veículo da OS ${os.numero} (placa ${os.placa}).`);
            showToast("Dados do veículo salvos.", "success");
            fundo.remove();
            if (typeof aoSalvar === 'function') aoSalvar(os);
        } catch (e) {
            console.error(e);
            showToast("Não foi possível salvar os dados do veículo. Tente novamente.", "error");
            btn.disabled = false;
        }
    };
}

function avisarDadosVeiculoFaltando(os, faltando, aoCorrigir) {
    document.getElementById('modal-veiculo-incompleto')?.remove();
    const fundo = document.createElement('div');
    fundo.id = 'modal-veiculo-incompleto';
    fundo.style.cssText = 'position:fixed;inset:0;background:rgba(6,20,40,.72);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
    fundo.innerHTML = `<div style="background:var(--bg-card,#fff);color:var(--text-primary,#1c1c1c);max-width:520px;width:100%;border-radius:10px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <h3 style="margin:0 0 8px">Laudo bloqueado: faltam dados do veículo</h3>
        <p style="color:var(--text-secondary);font-size:13px;margin:0 0 8px">O laudo cautelar só pode ser finalizado com os dados do veículo completos no cadastro da O.S. ${escHtml(os.numero)}:</p>
        <ul style="padding-left:22px;margin:0">${faltando.map(f => `<li style="margin:6px 0">${f}</li>`).join('')}</ul>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
            <button class="btn btn-secondary" data-acao="fechar">Fechar</button>
            <button class="btn btn-primary" data-acao="corrigir">Corrigir agora</button>
        </div></div>`;
    document.body.appendChild(fundo);
    fundo.querySelector('[data-acao="fechar"]').onclick = () => fundo.remove();
    fundo.querySelector('[data-acao="corrigir"]').onclick = () => { fundo.remove(); abrirCorrecaoDadosVeiculo(os.id, aoCorrigir); };
}

// Código de verificação do laudo (vai no QR e no rodapé). Aleatório e sem
// letras ambíguas: não dá para adivinhar o de outro laudo.
function gerarCodigoVerificacao() {
    const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, b => alfabeto[b % alfabeto.length]).join('');
}

async function sha256Hex(bytes) {
    const dig = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(dig), b => b.toString(16).padStart(2, '0')).join('');
}

// Fotos obrigatórias conferidas no BANCO (não no cache deste aparelho): a mesa
// não enxerga foto presa no celular do vistoriador.
async function cautelarFotosObrigatoriasFaltando(cautelarId) {
    const OBRIG = {
        placa_dianteira: 'Placa dianteira', painel_hodometro: 'Painel com hodômetro', crlv_documento: 'Documento do veículo',
        chassi_gravado: 'Número do chassi gravado', motor_gravado: 'Número do motor'
    };
    const { data: secoes, error: e1 } = await supabaseClient.from('cautelares_secoes').select('id').eq('cautelarId', cautelarId);
    if (e1) throw e1;
    const ids = (secoes || []).map(x => x.id);
    if (!ids.length) return Object.values(OBRIG);
    const { data: fotos, error: e2 } = await supabaseClient.from('cautelares_fotos').select('slotCodigo, url_original').in('secaoId', ids);
    if (e2) throw e2;
    const tem = new Set((fotos || []).filter(f => f.url_original).map(f => f.slotCodigo));
    return Object.keys(OBRIG).filter(k => !tem.has(k)).map(k => OBRIG[k]);
}

/**
 * Emite o laudo. A vistoria só vira "concluída" DEPOIS que o PDF final foi
 * gerado e guardado no servidor, com o SHA-256 do arquivo e o código de
 * verificação. Se algo falhar no meio, nada muda e dá para tentar de novo.
 */
async function gerarLaudoFinalPdf() {
    const cautelar = db.cautelares.find(c => c.id === window.activeFinalizacaoCautelarId);
    if (!cautelar) return;
    if (window.__emitindoLaudo) { showToast("O laudo já está sendo emitido.", "info"); return; }

    const os = db.ordens_servico.find(o => o.id === cautelar.osId);
    const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelar.id);
    const permissoes = (currentSession && currentSession.permissoes) || [];
    const ehAdministrador = permissoes.includes('cautelar_administrar');

    // Dados do veículo completos no cadastro: sem eles o laudo não é finalizado
    const faltandoVeiculo = cautelarDadosVeiculoFaltando(os, cautelar.id);
    if (faltandoVeiculo.length) {
        avisarDadosVeiculoFaltando(os, faltandoVeiculo, () => {
            if (typeof atualizarPreviewLaudo === 'function') atualizarPreviewLaudo();
            showToast("Dados completos. Agora é possível emitir o laudo.", "success");
        });
        return;
    }

    if (!window.operatorSignatureConfirmed) {
        showToast("É obrigatório assinar e confirmar sua assinatura de operador antes de emitir o laudo.", "warning");
        return;
    }
    if (!window.useSupabase || navigator.onLine === false) {
        showToast("A emissão do laudo precisa de conexão com o servidor.", "error");
        return;
    }

    const emitirBtn = document.querySelector("button[onclick='gerarLaudoFinalPdf()']");
    const originalText = emitirBtn ? emitirBtn.innerHTML : "";
    const etapa = texto => {
        if (emitirBtn) emitirBtn.innerHTML = `<i class="ri-loader-4-line spin" style="font-size: 20px; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> ${texto}`;
    };
    const liberar = () => {
        window.__emitindoLaudo = false;
        if (emitirBtn) { emitirBtn.disabled = false; emitirBtn.innerHTML = originalText; }
    };
    window.__emitindoLaudo = true;
    if (emitirBtn) emitirBtn.disabled = true;
    etapa('ENVIANDO FOTOS...');

    try {
        // 0. Fotos ainda no aparelho: tenta enviar antes; se não subirem, avisa.
        // Os avisos das conferências vão juntos numa única confirmação
        const avisos = [];
        const pendentesAparelho = await cautelarFotosPendentesAntesDoLaudo(cautelar.id);
        if (pendentesAparelho > 0) avisos.push(`${pendentesAparelho} foto(s) ainda não enviadas deste aparelho ficarão fora do laudo.`);

        // 0.1 Fotos obrigatórias conferidas no servidor
        const obrigatoriasFaltando = await cautelarFotosObrigatoriasFaltando(cautelar.id);
        if (obrigatoriasFaltando.length) {
            if (!ehAdministrador) {
                alert(`O laudo não pode ser emitido: estas fotos obrigatórias não estão no servidor:\n\n- ${obrigatoriasFaltando.join('\n- ')}\n\nPeça ao vistoriador para enviá-las (ou refazê-las).`);
                return liberar();
            }
            if (!confirm(`Fotos obrigatórias ausentes no servidor:\n\n- ${obrigatoriasFaltando.join('\n- ')}\n\nComo administrador, você pode emitir assim mesmo (fica registrado). Emitir?`)) return liberar();
            logAudit("Laudo sem fotos obrigatórias", `Emitiu o laudo da placa ${os.placa} sem: ${obrigatoriasFaltando.join(', ')}.`);
        }

        // 0.2 Fotos de identificação: conferência final da posição
        etapa('CONFERINDO FOTOS...');
        const incertas = await cautelarConferirOrientacaoFotos(cautelar.id, (feitas, total) => etapa(`CONFERINDO FOTOS ${feitas}/${total}...`));
        if (incertas.length) avisos.push(`Posição não confirmada automaticamente (confira na pré-visualização): ${incertas.join(', ')}.`);

        if (!confirm("Emitir a versão final deste laudo? O PDF será guardado no servidor com código de verificação e não poderá ser alterado." +
            (avisos.length ? `\n\nAtenção:\n- ${avisos.join('\n- ')}` : ''))) {
            return liberar();
        }

        // 1. Redação do laudo no servidor (sempre nova para este pacote de dados)
        etapa('GERANDO LAUDO...');
        showToast("O sistema está gerando o laudo…", "info");
        let resposta = null, laudoGeradoId = null;
        try {
            const laudoServidor = await analisarLaudoComIAInvisivel();
            const apontamentos = [...(laudoServidor.pendencias || []), ...(laudoServidor.inconsistencias || [])];
            const bloqueado = laudoServidor.status === 'bloqueado';
            const temAvisos = (laudoServidor.inconsistencias || []).length > 0;
            if (bloqueado || temAvisos) {
                const podeForcar = bloqueado ? ehAdministrador : (permissoes.includes('finalizar_cautelar') || ehAdministrador);
                const confirmou = await confirmarEmissaoComInconsistencias(apontamentos.length ? apontamentos : ['O laudo foi bloqueado para revisão.'], podeForcar, bloqueado);
                if (!confirmou) return liberar();
                if (bloqueado) logAudit("Laudo bloqueado emitido", `Emitiu o laudo da placa ${os.placa} apesar do bloqueio: ${apontamentos.join(' | ').slice(0, 900)}`);
            }
            resposta = laudoServidor.resposta || null;
            laudoGeradoId = laudoServidor.resposta ? laudoServidor.laudoId : null;
        } catch (erro) {
            console.error("Erro ao gerar laudo no servidor:", erro);
            // Sem a conferência do servidor, emitir com a redação padrão exige a
            // mesma permissão de liberar um laudo bloqueado, e fica registrado.
            if (!ehAdministrador) {
                alert("Não foi possível gerar a redação do laudo agora" + (erro && erro.message ? ` (${erro.message})` : "") +
                    ".\n\nTente de novo em instantes. A emissão com a redação padrão só pode ser feita por um administrador.");
                return liberar();
            }
            if (!confirm("Não foi possível gerar a redação do laudo agora" + (erro && erro.message ? ` (${erro.message})` : "") +
                ".\n\nEmitir com a redação padrão do sistema? (fica registrado)")) return liberar();
            logAudit("Laudo com redação padrão", `Emitiu o laudo da placa ${os.placa} com a redação padrão (servidor indisponível: ${(erro && erro.message) || erro}).`);
        }

        const parecerFinal = document.getElementById('caut-final-parecer').value;
        const obsFinal = document.getElementById('caut-final-obs').value;
        const approved = parecerFinal !== 'nao_conforme';
        const agora = new Date().toISOString();
        const codigo = gerarCodigoVerificacao();

        // 2. Monta o PDF com os dados finais. Os campos ficam no cache só
        //    durante a geração e voltam ao que eram se algo falhar.
        const antes = {
            cautelar: { ...cautelar },
            secao8: (() => { const s8 = secoes.find(s => s.numeroSecao === 8); return s8 ? { dadosJson: s8.dadosJson ? { ...s8.dadosJson } : s8.dadosJson, status: s8.status } : null; })()
        };
        const secao8 = secoes.find(s => s.numeroSecao === 8);
        Object.assign(cautelar, {
            dadosIaConfeccionado: resposta, laudoGeradoId, codigoVerificacao: codigo,
            parecerFinal, finalizadoEm: agora, dataHoraFinalizacao: agora, finalizadoPor: currentSession.nome
        });
        if (secao8) {
            secao8.dadosJson = { ...(secao8.dadosJson || {}), observacaoFinal: obsFinal, parecerFinal };
            secao8.status = "completa";
        }
        const desfazer = () => {
            Object.keys(cautelar).forEach(k => { if (!(k in antes.cautelar)) delete cautelar[k]; });
            Object.assign(cautelar, antes.cautelar);
            if (secao8 && antes.secao8) Object.assign(secao8, antes.secao8);
        };

        let pdfBytes, pdfHash, pdfUrl;
        try {
            etapa('MONTANDO PDF...');
            pdfBytes = await generateInspectionReport(cautelar.id);
            pdfHash = await sha256Hex(pdfBytes);

            // 3. Guarda o PDF no servidor
            etapa('GUARDANDO PDF...');
            const storagePath = `laudos/${cautelar.id}/LAUDO_CAUTELAR_${os.placa}_${cautelar.dossieNumero}.pdf`;
            const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
            const { error: erroUpload } = await supabaseClient.storage.from('cautelares').upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
            if (erroUpload) throw new Error('não foi possível guardar o PDF no servidor (' + erroUpload.message + ')');
            pdfUrl = supabaseClient.storage.from('cautelares').getPublicUrl(storagePath).data.publicUrl;

            // 4. Só agora a vistoria vira concluída
            etapa('FINALIZANDO...');
            await sbUpdate('cautelares', cautelar.id, {
                status: 'concluida',
                parecerConsolidado: parecerFinal,
                pdfHash, pdfUrl,
                codigoVerificacao: codigo,
                laudoGeradoId,
                dataHoraFinalizacao: agora,
                finalizadoPorId: currentSession.id || null
            });
        } catch (erro) {
            desfazer();
            console.error("Erro na emissão do laudo:", erro);
            showToast(`O laudo NÃO foi emitido: ${erro && erro.message ? erro.message : erro}. Nada foi alterado; tente de novo.`, "error");
            return liberar();
        }

        cautelar.status = 'concluida';
        cautelar.pdfHash = pdfHash;
        cautelar.hashLaudo = pdfHash;
        cautelar.pdfUrl = pdfUrl;

        // 5. OS e seção 8 (a vistoria já está concluída; falha aqui é avisada)
        const osStatus = approved ? 'concluida_aprovada' : 'concluida_reprovada';
        try {
            await Promise.all([
                sbUpdate('ordens_servico', os.id, { status: osStatus, finalizadoEm: agora, finalizadoPor: currentSession.nome }),
                secao8 ? sbUpdate('cautelares_secoes', secao8.id, { dadosJson: secao8.dadosJson, status: 'completa' }) : Promise.resolve()
            ]);
            Object.assign(os, { status: osStatus, finalizadoEm: agora, finalizadoPor: currentSession.nome });
        } catch (erro) {
            showToast(`Laudo emitido, mas a O.S. não foi atualizada (${erro.message || erro}). Confira a O.S. ${os.numero}.`, "warning");
        }

        // Desconto de parceiro na reprovada (só depois do laudo emitido)
        if (os.clienteTipo === 'parceiro' && !approved &&
            confirm("Esta vistoria foi REPROVADA e o cliente é um lojista parceiro.\nDeseja aplicar o desconto comercial de 50% nesta OS?")) {
            const valorOriginal = os.valor;
            const valor = parseFloat((valorOriginal * 0.5).toFixed(2));
            const observacoes = (os.observacoes ? os.observacoes + " | " : "") + `Desconto comercial de 50% aplicado (Cautelar Reprovada). Valor original: R$ ${valorOriginal.toFixed(2)}`;
            try {
                await sbUpdate('ordens_servico', os.id, { valor, observacoes });
                Object.assign(os, { valor, observacoes });
                registrarDescontoReprovada(os, valorOriginal);
            } catch (erro) {
                showToast("O desconto NÃO foi aplicado: " + (erro.message || erro), "error");
            }
        }

        logAudit("Finalizar Cautelar", `Emitiu o laudo cautelar da placa ${os.placa} (parecer ${parecerFinal.toUpperCase()}, código ${codigo}).`);

        // 6. Entrega o arquivo guardado (o mesmo que foi registrado)
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        link.download = `LAUDO_CAUTELAR_${os.placa}_${cautelar.dossieNumero}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);

        showToast("Laudo emitido e guardado com sucesso!", "success");
        liberar();
        fecharFinalizacaoDesktop();
    } catch (erro) {
        console.error("Erro na emissão do laudo:", erro);
        showToast("Erro na emissão do laudo: " + (erro.message || erro), "error");
        liberar();
    }
}

// Localiza a OS por id (número) ou pela placa EXATA. Com a placa, se houver
// mais de uma OS, não escolhe sozinho: pede o id. Antes pegava a primeira que
// encontrasse (e a exclusão aceitava parte da placa).
function acharOSUnica(placaOuId) {
    if (typeof placaOuId === 'number' || /^\d+$/.test(String(placaOuId).trim())) {
        const os = db.ordens_servico.find(o => o.id === Number(placaOuId));
        return os ? { os } : { erro: `O.S. #${placaOuId} não encontrada.` };
    }
    const alvo = String(placaOuId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const lista = db.ordens_servico.filter(o => String(o.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === alvo);
    if (!lista.length) return { erro: `Nenhuma O.S. com a placa ${placaOuId}.` };
    if (lista.length > 1) return { erro: `Há ${lista.length} O.S. com a placa ${placaOuId} (${lista.map(o => `${o.numero} = id ${o.id}`).join(', ')}). Informe o id da O.S.` };
    return { os: lista[0] };
}

async function reabrirLaudo(placa) {
    if (!placa) {
        showToast("Por favor, informe a placa do veículo.", "warning");
        return;
    }
    
    try {
        const achado = acharOSUnica(placa);
        if (achado.erro) { showToast(achado.erro, "error"); return; }
        const os = achado.os;
        placa = os.placa;
        if (!(currentSession && (currentSession.permissoes || []).includes('cautelar_administrar'))) {
            showToast("Só um administrador de cautelar pode reabrir um laudo emitido.", "error");
            return;
        }
        if (!confirm(`Reabrir o laudo da O.S. ${os.numero} (placa ${os.placa})? O laudo emitido deixa de valer (a consulta pelo código passa a dizer "não localizado") até ser emitido de novo.`)) return;

        // Bloquear reabertura de OS faturada
        if (os.faturaId) {
            showToast(`Erro: Não é possível reabrir o laudo da placa ${placa.toUpperCase()} pois a OS correspondente já está vinculada à Fatura ID ${os.faturaId}.`, "error");
            return;
        }

        const cautelar = db.cautelares.find(c => c.osId === os.id);
        if (!cautelar) {
            showToast(`Vistoria Cautelar não encontrada para a OS ${os.id}`, "error");
            return;
        }

        console.log(`Reabrindo laudo da placa ${placa} (OS: ${os.id}, Cautelar: ${cautelar.id})...`);
        
        os.status = 'em_execucao';
        os.finalizadoEm = null;
        os.finalizadoPor = null;
        
        cautelar.status = 'em_andamento';
        cautelar.dadosIaConfeccionado = null;
        cautelar.hashLaudo = null;
        cautelar.finalizadoEm = null;
        cautelar.finalizadoPor = null;
        cautelar.pdfUrl = null;

        const secoes = db.cautelares_secoes.filter(s => s.cautelarId === cautelar.id);
        const secao8 = secoes.find(s => s.numeroSecao === 8);
        if (secao8) {
            secao8.dadosJson = secao8.dadosJson || {};
            secao8.dadosJson.observacaoFinal = "";
            secao8.dadosJson.parecerFinal = "";
            secao8.status = "pendente";
        }

        saveDatabase();

        if (window.useSupabase) {
            await Promise.all([
                sbUpdate('cautelares', cautelar.id, {
                    // dadosIaConfeccionado é só local (não há coluna no banco)
                    status: 'em_andamento',
                    pdfUrl: null,
                    pdfHash: null,
                    codigoVerificacao: null,
                    laudoGeradoId: null,
                    dataHoraFinalizacao: null,
                    finalizadoPorId: null
                }),
                sbUpdate('ordens_servico', os.id, {
                    status: 'em_execucao',
                    finalizadoEm: null,
                    finalizadoPor: null
                }),
                secao8 ? sbUpdate('cautelares_secoes', secao8.id, {
                    dadosJson: secao8.dadosJson,
                    status: 'pendente'
                }) : Promise.resolve()
            ]);
        }
        cautelar.codigoVerificacao = null;
        cautelar.laudoGeradoId = null;
        logAudit("Reabrir Laudo", `Reabriu o laudo cautelar da O.S. ${os.numero} (placa ${os.placa}).`);

        showToast(`Laudo da placa ${placa.toUpperCase()} reaberto com sucesso!`, "success");
        setTimeout(() => {
            location.reload();
        }, 1000);
    } catch (err) {
        console.error("Erro ao reabrir laudo:", err);
        showToast("Erro ao reabrir o laudo: " + (err.message || err) + ". Recarregue a página e confira.", "error");
    }
}
window.reabrirLaudo = reabrirLaudo;

async function excluirVistoria(placa) {
    if (!placa) {
        showToast("Por favor, informe a placa ou parte dela.", "warning");
        return;
    }

    try {
        const achado = acharOSUnica(placa);
        if (achado.erro) { showToast(achado.erro, "error"); return; }
        const os = achado.os;
        if (os.faturaId) { showToast(`A O.S. ${os.numero} está numa fatura; cancele-a em vez de excluir.`, "error"); return; }

        const confirmMsg = `ATENÇÃO: Deseja realmente EXCLUIR DEFINITIVAMENTE a OS Placa: ${os.placa} e todas as suas vistorias, seções, fotos e lançamentos financeiros? Esta ação não pode ser desfeita.`;
        if (!confirm(confirmMsg)) return;

        console.log(`Excluindo laudo da placa ${os.placa} (OS ID: ${os.id})...`);

        const cautelares = db.cautelares.filter(c => c.osId === os.id);
        const cautelarIds = cautelares.map(c => c.id);

        // Deletar fotos associadas localmente
        for (const c of cautelares) {
            const secoes = db.cautelares_secoes.filter(s => s.cautelarId === c.id);
            const secaoIds = secoes.map(s => s.id);
            db.cautelares_fotos = db.cautelares_fotos.filter(f => !secaoIds.includes(f.secaoId));
            db.cautelares_secoes = db.cautelares_secoes.filter(s => s.cautelarId !== c.id);
        }

        // Deletar cautelares e lançamentos locais
        db.cautelares = db.cautelares.filter(c => c.osId !== os.id);
        db.caixa_movimentos = db.caixa_movimentos.filter(m => m.osId !== os.id);
        db.ordens_servico = db.ordens_servico.filter(o => o.id !== os.id);

        saveDatabase();

        // Atualizar no Supabase online
        if (window.useSupabase) {
            for (const cId of cautelarIds) {
                // Remove fotos por secao
                const { data: secoes } = await supabaseClient.from('cautelares_secoes').select('id').eq('cautelarId', cId);
                if (secoes && secoes.length > 0) {
                    for (const sec of secoes) {
                        await supabaseClient.from('cautelares_fotos').delete().eq('secaoId', sec.id);
                    }
                }
                await supabaseClient.from('cautelares_secoes').delete().eq('cautelarId', cId);
                await supabaseClient.from('cautelares').delete().eq('id', cId);
            }
            await supabaseClient.from('caixa_movimentos').delete().eq('osId', os.id);
            await supabaseClient.from('ordens_servico').delete().eq('id', os.id);
        }

        showToast(`OS e laudo da placa ${os.placa} excluídos com sucesso!`, "success");
        setTimeout(() => {
            location.reload();
        }, 1000);
    } catch (err) {
        console.error("Erro ao excluir vistoria:", err);
        showToast("Erro crítico ao excluir vistoria.", "error");
    }
}
window.excluirVistoria = excluirVistoria;

/**
 * Abre a visualização resumida (modo leitura) da Cautelar.
 */
async function verResumoCautelar(cautelarId) {
    if (!db) return;
    await garantirDetalhesCautelarApp(cautelarId);
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
 * Baixa o laudo PDF emitido: o arquivo guardado na emissão (o mesmo do SHA-256
 * registrado). Gerar um PDF novo a cada clique produzia documentos diferentes
 * com o mesmo código.
 */
async function exibirPdfCautelar(cautelarId) {
    const cautelar = db.cautelares.find(c => c.id === cautelarId);
    if (!cautelar) return;
    const os = db.ordens_servico.find(o => o.id === cautelar.osId) || {};
    if (!cautelar.pdfUrl) {
        showToast("Este laudo não tem PDF guardado no servidor. Um administrador pode reabrir e emitir de novo.", "error");
        return;
    }
    try {
        showToast("Baixando o laudo...", "info");
        const url = await urlArmazenamento(cautelar.pdfUrl, 600);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `LAUDO_CAUTELAR_${os.placa || ''}_${cautelar.dossieNumero || cautelar.id}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);
        logAudit("Download Laudo", `Baixou o laudo cautelar da placa ${os.placa || '?'} (dossiê ${cautelar.dossieNumero || cautelar.id}).`);
    } catch (err) {
        console.error("Erro ao baixar o laudo:", err);
        showToast("Não foi possível baixar o laudo: " + (err.message || err), "error");
    }
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

// Bloco "Outras cobranças" (mensalidade do parceiro etc.) da fatura impressa / PDF
function htmlOutrasCobrancasFatura(f) {
    const extras = cobrancasExtrasDaFatura(f);
    if (!extras.length) return '';
    const linhas = extras.map(e => `
        <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
            <td style="padding: 6px;"><strong>${escHtml(e.descricao || 'Cobrança')}</strong></td>
            <td style="padding: 6px;">${e.competencia ? 'Referente a ' + escHtml(rotuloCompetencia(e.competencia)) : ''}</td>
            <td style="padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(Number(e.valor) || 0)}</td>
        </tr>`).join('');
    return `
        <div style="border: 1px solid #000; border-radius: 4px; overflow: hidden; margin-bottom: 20px;">
            <div style="font-weight: 800; font-size: 12px; background: #eee; padding: 10px 14px; border-bottom: 1px solid #000;">OUTRAS COBRANÇAS</div>
            <div style="padding: 10px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; font-size: 10px; text-transform: uppercase;">
                            <th style="padding: 6px;">Descrição</th>
                            <th style="padding: 6px;">Competência</th>
                            <th style="padding: 6px; text-align: right;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        </div>`;
}

async function generateAndUploadInvoicePDF(f) {
    if (!window.useSupabase) return null;

    const partner = db.parceiros.find(p => p.id === f.parceiroId);
    const unit = db.unidades.find(u => u.id === f.unidadeId);
    const oss = db.ordens_servico.filter(o => f.ordensIds.includes(o.id));

    let osRows = oss.map(o => `
        <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
            <td style="padding: 6px;"><strong>${escHtml(o.numero)}</strong></td>
            <td style="padding: 6px;"><strong>${escHtml(o.placa)}</strong></td>
            <td style="padding: 6px;">${escHtml(o.veiculoMarcaModelo || '—')}</td>
            <td style="padding: 6px; text-align: center;">${escHtml(o.veiculoAno || '—')}</td>
            <td style="padding: 6px;">${o.servicoNome.split(' — ')[0]}</td>
            <td style="padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(o.valor)}</td>
        </tr>
    `).join('');

    if (!osRows) {
        osRows = `<tr><td colspan="6" style="text-align: center; padding: 12px; color: #666;">Nenhuma OS vinculada a esta fatura.</td></tr>`;
    }

    // Créditos e descontos aplicados nesta fatura
    const creditosAbatidos = (db.parceiros_creditos || []).filter(c => c.faturaId === f.id);
    const totalCreditos = creditosAbatidos.reduce((sum, c) => somaCentavos(sum, c.valor), 0);
    const totalBruto = oss.reduce((sum, o) => somaCentavos(sum, o.valor), 0);
    const totalExtras = totalExtrasDaFatura(f);

    let creditosHtml = '';
    if (creditosAbatidos.length > 0) {
        const creditosRows = creditosAbatidos.map(c => `
            <tr style="border-bottom: 1px dotted #ffcdd2; font-size: 11px; color: #b71c1c;">
                <td style="padding: 6px;" colspan="4"><strong>[${c.tipo === 'credito' ? 'CRÉDITO' : 'CORTESIA'}]</strong> ${escHtml(c.descricao)}</td>
                <td style="padding: 6px; text-align: right; font-weight: 600;" colspan="2">- ${formatCurrency(c.valor)}</td>
            </tr>
        `).join('');

        creditosHtml = `
            <div style="border: 1px solid #e53935; border-radius: 4px; overflow: hidden; margin-bottom: 30px; margin-top: 15px;">
                <div style="font-weight: 800; font-size: 12px; background: #ffebee; color: #c62828; padding: 10px 14px; border-bottom: 1px solid #e53935;">
                    CRÉDITOS E CORTESIAS ABATIDOS NESTA FATURA
                </div>
                <div style="padding: 10px;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <tbody>
                            ${creditosRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    const div = document.createElement('div');
    div.style.padding = '40px';
    div.style.fontFamily = 'Outfit, sans-serif';
    div.style.color = '#000';
    div.style.width = '800px';
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 30px; border-bottom: 2px solid ${CERTIVE_NAVY}; padding-bottom: 10px;">
            <div style="display:flex; align-items:center; gap:12px;">
                ${certiveShieldSvg(42)}
                <div>
                    <h1 style="font-size: 24px; font-weight: 800; margin: 0; color: ${CERTIVE_NAVY};">CERTIVE VISTORIAS</h1>
                    <p style="font-size: 11px; text-transform: uppercase; margin: 4px 0 0 0; color:#555;">Faturamento de Parceiros — Demonstrativo de Cobrança</p>
                </div>
            </div>
            <div style="border: 2px solid ${CERTIVE_NAVY}; color:${CERTIVE_NAVY}; padding: 8px 16px; font-weight: 800; font-size: 16px;">
                FATURA ${escHtml(f.codigo)}
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 13px; line-height: 1.6; margin-bottom: 30px;">
            <div>
                <strong>Prestador:</strong> ${escHtml(unit.nome)}<br>
                <strong>Endereço:</strong> ${escHtml(unit.endereco)}<br>
                <strong>Período de Referência:</strong> ${formatDateBr(f.periodoInicio)} a ${formatDateBr(f.periodoFim)}
            </div>
            <div style="text-align: right;">
                <strong>Tomador (Parceiro):</strong> ${escHtml(partner.nome)}<br>
                <strong>CPF/CNPJ:</strong> ${escHtml(partner.cnpj)}<br>
                <strong>Contato:</strong> ${escHtml(partner.telefone)}
            </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
            <div>
                <strong>Data de Emissão:</strong> ${formatDateBr(f.criadoEm)} por ${escHtml(f.criadoPor)}<br>
                <strong>Status de Pagamento:</strong> ${f.pago ? 'PAGO / LIQUIDADO' : 'AGUARDANDO PAGAMENTO'}
            </div>
            <div style="text-align: right; font-size: 13px; line-height: 1.4;">
                <strong>Bruto OSs:</strong> ${formatCurrency(totalBruto)}<br>
                ${totalExtras > 0 ? `<strong>Outras cobranças:</strong> ${formatCurrency(totalExtras)}<br>` : ''}
                <strong>Créditos/Descontos:</strong> - ${formatCurrency(totalCreditos)}<br>
                <span style="font-size: 16px; font-weight: 800; color: #2e7d32;">VALOR LÍQUIDO: ${formatCurrency(f.valorTotal)}</span>
            </div>
        </div>

        ${oss.length || !totalExtras ? `
        <div style="border: 1px solid #000; border-radius: 4px; overflow: hidden; margin-bottom: 20px;">
            <div style="font-weight: 800; font-size: 12px; background: #eee; padding: 10px 14px; border-bottom: 1px solid #000;">
                DEMONSTRATIVO DE SERVIÇOS PRESTADOS
            </div>
            <div style="padding: 10px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; font-size: 10px; text-transform: uppercase;">
                            <th style="padding: 6px;">OS</th>
                            <th style="padding: 6px;">Placa</th>
                            <th style="padding: 6px;">Modelo do Veículo</th>
                            <th style="padding: 6px; text-align: center;">Ano</th>
                            <th style="padding: 6px;">Tipo de Serviço</th>
                            <th style="padding: 6px; text-align: right;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${osRows}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}

        ${htmlOutrasCobrancasFatura(f)}

        ${creditosHtml}

        ${buildPaymentInstructionsHtml(f)}
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
                    <span>${escHtml(item.descricao)}</span>
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
                            'Authorization': `Bearer ${sbAuthToken()}`
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
                            'Authorization': `Bearer ${sbAuthToken()}`
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

// Substitui as variáveis do texto padrão do e-mail pela fatura concreta.
function preencherTextoFatura(texto, fatura, partner) {
    return String(texto || '')
        .replace(/\{PARCEIRO\}/g, partner ? partner.nome : '')
        .replace(/\{CODIGO\}/g, fatura.codigo || '')
        .replace(/\{INICIO\}/g, formatDateBr(fatura.periodoInicio))
        .replace(/\{FIM\}/g, formatDateBr(fatura.periodoFim))
        .replace(/\{VALOR\}/g, formatCurrency(fatura.valorTotal));
}

// Passo 2 — ENCAMINHAR a fatura (e-mail + WhatsApp) SEM gerar cobrança Asaas.
async function forwardInvoice(faturaId, btn) {
    if (!window.useSupabase) {
        showToast("Erro: O encaminhamento só está disponível no modo online (Supabase).", "error");
        return;
    }
    const fatura = db.faturas.find(x => x.id === faturaId);
    if (!fatura) return;
    const partner = db.parceiros.find(p => p.id === fatura.parceiroId);

    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spinning" style="font-size:14px;"></i>'; }

    try {
        // Garante um PDF disponível (reusa o já gerado, senão gera agora).
        let pdfUrl = fatura.pdf_url || null;
        if (!pdfUrl) {
            showToast("Gerando PDF da fatura para envio...", "info");
            pdfUrl = await generateAndUploadInvoicePDF(fatura);
            if (pdfUrl) {
                fatura.pdf_url = pdfUrl;
                try { await sbUpdate('faturas', fatura.id, { pdf_url: pdfUrl }); } catch (e) { /* coluna opcional */ }
            }
        }

        const cfg = getFaturamentoConfig();
        const assunto = preencherTextoFatura(cfg.emailAssunto, fatura, partner);
        const corpo = preencherTextoFatura(cfg.emailCorpo, fatura, partner);

        showToast("Encaminhando fatura (e-mail + WhatsApp)...", "info");
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invoice-forward`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sbAuthToken()}` },
            // O PDF não é público: e-mail e WhatsApp recebem um link temporário (7 dias)
            body: JSON.stringify({ faturaId, pdfUrl: pdfUrl ? await urlArmazenamento(pdfUrl, 7 * 24 * 3600) : null, canais: ['email', 'whatsapp'], assunto, corpo })
        });

        if (res.ok) {
            const d = await res.json();
            const map = {
                enviado: 'enviado', erro: 'falhou', sem_email: 'sem e-mail no cadastro',
                sem_whatsapp: 'sem WhatsApp no cadastro', sem_config: 'canal não configurado', nao_enviado: 'não enviado'
            };
            const partes = [];
            if (d.email) partes.push(`E-mail: ${map[d.email] || d.email}`);
            if (d.whatsapp) partes.push(`WhatsApp: ${map[d.whatsapp] || d.whatsapp}`);
            const sucesso = d.email === 'enviado' || d.whatsapp === 'enviado';
            showToast(`Encaminhamento — ${partes.join(' · ')}`, sucesso ? 'success' : 'warning');
            logAudit("Faturamento Encaminhar", `Encaminhou fatura ${fatura.codigo} (${partes.join(', ')}).`);
        } else {
            let errText = "Erro desconhecido";
            try { errText = (await res.json()).error || errText; } catch (e) {}
            showToast("Erro ao encaminhar: " + errText, "error");
        }
    } catch (err) {
        console.error("Erro ao encaminhar fatura:", err);
        showToast("Erro de rede ao encaminhar a fatura.", "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
        if (typeof renderFatFaturas === 'function') renderFatFaturas();
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
                'Authorization': `Bearer ${sbAuthToken()}`
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

async function generateAsaasBillingForInvoice(faturaId, btn) {
    if (!window.useSupabase) {
        showToast("Erro: A integração com Asaas só está disponível no modo online (Supabase).", "error");
        return;
    }

    const fatura = db.faturas.find(x => x.id === faturaId);
    if (!fatura) return;

    if (fatura.asaas_url) {
        showToast("Esta fatura já possui uma cobrança Asaas gerada.", "info");
        return;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line spinning" style="font-size:14px;"></i>';

    try {
        showToast("Gerando cobrança no Asaas...", "info");

        const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-asaas-billing`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sbAuthToken()}`
            },
            body: JSON.stringify({ faturaId: faturaId })
        });

        if (res.ok) {
            const data = await res.json();
            fatura.asaas_payment_id = data.paymentId;
            fatura.asaas_url = data.url;
            fatura.notificacao_zap = (data.zapStatus === 'enviado');

            await sbUpdate('faturas', fatura.id, {
                asaas_payment_id: fatura.asaas_payment_id,
                asaas_url: fatura.asaas_url,
                notificacao_zap: fatura.notificacao_zap
            });

            showToast("Cobrança Asaas gerada com sucesso!", "success");
        } else {
            let errText = "Erro desconhecido";
            try {
                const data = await res.json();
                errText = data.error || errText;
            } catch(e) {}
            showToast("Erro Asaas: " + errText, "error");
        }
    } catch (err) {
        console.error("Erro ao gerar cobrança Asaas:", err);
        showToast("Erro de rede ao conectar à API do Asaas.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        if (typeof renderFatFaturas === 'function') {
            renderFatFaturas();
        }
    }
}

// Sincronizador Automático de Taxas Flutuantes do DETRAN
// ==========================================================
// BASE DE CÁLCULO DA GUIA DETRAN (fonte única de verdade)
// ----------------------------------------------------------
// O DETRAN-SC cobra R$ 27,00 por LAUDO EMITIDO, independentemente
// do porte do veículo e independentemente do resultado: laudo
// aprovado, reprovado, bloqueado, cancelado ou "não enviado" são
// todos cobrados. O ÚNICO laudo gratuito é o RETORNO (reapresentação
// de uma vistoria anterior).
//
// Por isso NÃO se pode filtrar por status "concluída" nem por
// valor > 0: OS em aberto, pagas ou de valor zero também geram
// laudo cobrado. O retorno é identificado por reapresentacaoOrigemID.
// ==========================================================

// Converte um timestamp (UTC do banco) para 'YYYY-MM' no fuso local.
// Comparar a string ISO direto (criadoEm.startsWith('2026-07')) joga
// as OS lançadas após as 21h do último dia do mês para o mês seguinte.
function competenciaLocalDeOS(criadoEm) {
    if (!criadoEm) return null;
    const dia = diaSP(criadoEm);
    return dia ? dia.slice(0, 7) : null;
}

// true quando o serviço da OS gera laudo cobrado pelo DETRAN.
function servicoGeraLaudoDetran(servicoId) {
    const s = (db.servicos || []).find(x => x.id === servicoId);
    if (!s) return false;
    // Fallback para bases antigas sem a coluna geraLaudoDetran
    if (typeof s.geraLaudoDetran === 'boolean') return s.geraLaudoDetran;
    return /TRANSFER|COMBO/i.test(s.nome || '');
}

// true quando a OS é um RETORNO (reapresentação) — laudo gratuito.
function osEhRetornoDetran(o) {
    return o.reapresentacaoOrigemID !== null && o.reapresentacaoOrigemID !== undefined;
}

// true quando o serviço é COMBO. No combo a OS cobra o pacote (cautelar +
// transferência), mas o DETRAN registra só a transferência — então o valor da
// OS é legitimamente maior que o do laudo. Por isso a conferência de valor
// ignora combos, senão apontaria divergência em toda vistoria combo.
function servicoEhCombo(servicoId) {
    const s = (db.servicos || []).find(x => x.id === servicoId);
    return s ? /COMBO/i.test(s.nome || '') : false;
}

// Retorna as OS que compõem a guia DETRAN de um mês/unidade.
function laudosDetranDoMes(year, monthNum, unidadeId) {
    const alvo = `${year}-${String(monthNum).padStart(2, '0')}`;
    return (db.ordens_servico || []).filter(o =>
        o.unidadeId === unidadeId &&
        competenciaLocalDeOS(o.criadoEm) === alvo &&
        servicoGeraLaudoDetran(o.servicoId) &&
        o.status !== 'cancelada' &&
        !osEhRetornoDetran(o)
    );
}

// Taxa DETRAN por laudo do serviço (default R$27,00 se não cadastrada).
function taxaDetranDoServico(servicoId) {
    const ref = (db.taxas_referencia || []).find(t => t.servicoId === servicoId);
    if (!ref) return 27.00;
    const v = parseFloat(ref.taxa);
    return isNaN(v) ? 27.00 : v;
}

// Valor total da guia DETRAN do mês.
function totalGuiaDetran(year, monthNum, unidadeId) {
    return laudosDetranDoMes(year, monthNum, unidadeId)
        .reduce((acc, o) => acc + taxaDetranDoServico(o.servicoId), 0);
}

window.competenciaLocalDeOS = competenciaLocalDeOS;
window.laudosDetranDoMes = laudosDetranDoMes;
window.totalGuiaDetran = totalGuiaDetran;

window.syncDetranFloatingPayable = async function() {
    // Chamada após cada gravação de OS: duas execuções simultâneas criavam
    // a provisão em dobro. Uma de cada vez (e o banco tem regra de unicidade).
    if (window.__sincronizandoDetran) { window.__sincronizarDetranDeNovo = true; return; }
    window.__sincronizandoDetran = true;
    try { await sincronizarProvisaoDetran(); }
    finally {
        window.__sincronizandoDetran = false;
        if (window.__sincronizarDetranDeNovo) { window.__sincronizarDetranDeNovo = false; setTimeout(() => window.syncDetranFloatingPayable(), 300); }
    }
};

async function sincronizarProvisaoDetran() {
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
        // 1. Mês de competência: o do dia operativo (dia reaberto ou hoje), lido
        //    como texto. new Date('2026-09-01') é dia 31/08 no Brasil.
        const diaOperativo = getOperativeDate();
        const year = diaOperativo.slice(0, 4);
        const monthNum = diaOperativo.slice(5, 7);

        const meses = {
            '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
            '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
            '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
        };
        const monthLabel = meses[monthNum];
        const unidade = (db.unidades || []).find(u => u.id === activeUnitId) || {};
        const uf = String(unidade.uf || 'SC').toUpperCase();
        const targetDesc = `Taxas DETRAN-${uf} — Provisão ${monthLabel}/${year}`;
        const competencia = `${year}-${monthNum}-01`;

        // 2. Calcular a guia: 1 laudo cobrado por OS de serviço ECV no mês,
        //    excluindo apenas canceladas e retornos (ver bloco de regras acima).
        const monthlyOSs = laudosDetranDoMes(year, monthNum, activeUnitId);
        const totalTaxas = Math.round(monthlyOSs.reduce((acc, o) => acc + taxaDetranDoServico(o.servicoId), 0) * 100) / 100;

        // 3. Provisão já existente deste mês e unidade (de qualquer UF, para não
        //    duplicar as antigas "DETRAN-SC" se a unidade mudar de estado)
        const ehProvisao = c => c.unidadeId === activeUnitId &&
            /^Taxas DETRAN-\S+ — Provisão /.test(String(c.descricao || '')) &&
            (String(c.competencia || '').slice(0, 7) === `${year}-${monthNum}` || c.descricao === targetDesc);
        let existingPayable = db.contas_pagar.find(ehProvisao);

        // Vencimento: 5º dia útil do mês seguinte
        const [nextYear, nextMonth] = monthNum === '12' ? [Number(year) + 1, 0] : [Number(year), Number(monthNum)];
        const dueDate = getFifthWorkingDay(nextYear, nextMonth);

        if (!existingPayable && totalTaxas > 0) {
            const newPayable = {
                unidadeId: activeUnitId,
                descricao: targetDesc,
                tipo: "variavel",
                vencimento: dueDate,
                competencia, // competência = mês das OS que geraram as taxas
                valor: totalTaxas,
                pago: false,
                pagoEm: null,
                categoria: "Impostos / Taxas",
                fornecedor: `DETRAN-${uf}`,
                comprovante: null,
                criadoPor: "Sistema (Automático)"
            };
            const { data, error } = await supabaseClient.from('contas_pagar').insert(newPayable).select().single();
            if (!error && data) {
                cacheInsert('contas_pagar', normalizeRecord('contas_pagar', data));
                return;
            }
            if (error && error.code === '23505') {
                // Outro aparelho criou ao mesmo tempo: usa a que ficou no banco
                const { data: jaExiste } = await supabaseClient.from('contas_pagar').select('*')
                    .eq('unidadeId', activeUnitId).eq('competencia', competencia).like('descricao', 'Taxas DETRAN-% — Provisão %').maybeSingle();
                if (jaExiste) {
                    existingPayable = normalizeRecord('contas_pagar', jaExiste);
                    if (!db.contas_pagar.some(c => c.id === existingPayable.id)) cacheInsert('contas_pagar', existingPayable);
                }
            } else {
                console.error('[DETRAN Sincronizador] Erro de inserção:', error);
                return;
            }
        }

        // 4. Existe e não está paga: acompanha o valor da guia
        if (existingPayable && !existingPayable.pago && Math.abs(Number(existingPayable.valor) - totalTaxas) > 0.004) {
            console.log(`[DETRAN Sincronizador] Atualizando valor da conta de provisão para: ${totalTaxas}`);
            const { error } = await supabaseClient.from('contas_pagar').update({ valor: totalTaxas }).eq('id', existingPayable.id);
            if (error) { console.error('[DETRAN Sincronizador] Erro ao atualizar:', error); return; }
            cacheUpdate('contas_pagar', existingPayable.id, { valor: totalTaxas });
        }
    } catch (e) {
        console.error("[DETRAN Sincronizador] Falha crítica na execução:", e);
    }
}

// ==========================================================
// CONFIGURAÇÃO DE FATURAMENTO — dados bancários + texto do e-mail
// ----------------------------------------------------------
// Guardados na mesma linha única de configuracoes_gerais (merge para não
// sobrescrever campos de outras integrações).
// ==========================================================

const DEFAULT_FAT_EMAIL_ASSUNTO = "Fatura {CODIGO} — Certive Vistorias";
const DEFAULT_FAT_EMAIL_CORPO =
`Prezado(a) {PARCEIRO},

Segue em anexo a fatura referente aos serviços de vistoria prestados no período de {INICIO} a {FIM}, no valor total de {VALOR}.

As instruções de pagamento constam no documento anexo. Em caso de dúvidas, estamos à disposição.

Atenciosamente,
Equipe Certive Vistorias.`;

const DEFAULT_FAT_BANCO = {
    favorecido: "MELEGARI TECH SOLUCOES VEICULARES LTDA",
    cnpj: "64.683.079/0001-85",
    banco: "461 - Asaas I.P S.A",
    agencia: "0001",
    conta: "7450656-9",
    tipoConta: "Conta de Pagamento",
    // Chave PIX aleatória cadastrada no Asaas (recebimento/reconciliação).
    // O QR do documento e o campo "Chave PIX" usam exatamente esta chave.
    pix: "83e5a290-14ad-4b22-a1af-ab0779c544d1"
};

// Identidade visual do documento da fatura (padrão do site).
const CERTIVE_NAVY = '#0a1f3d';
const CERTIVE_GOLD = '#d4a017';

// Brasão dourado (o mesmo escudo do login/sidebar). Renderizado como <img> com
// data-URI de SVG — mais confiável no html2canvas/impressão que SVG inline.
function certiveShieldSvg(size) {
    const s = size || 34;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${CERTIVE_GOLD}" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm-5 7.93c.02-1.95 3.34-2.93 5-2.93s4.98.98 5 2.93C15.5 17.5 13.9 18 12 18s-3.5-.5-5-3.07z"/></svg>`;
    return `<img src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" width="${s}" height="${s}" alt="Certive" style="flex:none; display:block;">`;
}

// ---- PIX "copia e cola" (BR Code EMV) + QR ----
// CRC16-CCITT (0xFFFF, poly 0x1021) exigido pelo padrão do Banco Central.
function pixCrc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= (str.charCodeAt(i) & 0xFF) << 8;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Remove acentos e limita tamanho (campos 59/60 do BR Code são ASCII curtos).
function pixAscii(txt, max) {
    const clean = String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').trim().toUpperCase();
    return clean.substring(0, max || 25);
}

// Monta o payload PIX estático. amount opcional (com valor, o app do cliente já
// vem preenchido). key aceita telefone (+55...), CNPJ, e-mail ou chave aleatória.
function buildPixBrCode({ key, name, city, amount, txid }) {
    const f = (id, val) => id + String(val.length).padStart(2, '0') + val;
    const chave = String(key || '').replace(/\s+/g, '');
    const gui = f('00', 'br.gov.bcb.pix') + f('01', chave);
    const mai = f('26', gui);
    let payload =
        f('00', '01') +
        mai +
        f('52', '0000') +
        f('53', '986') +
        (amount ? f('54', Number(amount).toFixed(2)) : '') +
        f('58', 'BR') +
        f('59', pixAscii(name, 25) || 'CERTIVE') +
        f('60', pixAscii(city, 15) || 'SAO JOSE') +
        f('62', f('05', pixAscii(txid || '***', 25)));
    payload += '6304';
    return payload + pixCrc16(payload);
}

// Gera um data URL (PNG) do QR PIX usando a lib qrcodejs (global QRCode).
function gerarQrPixDataUrl(payloadText, px) {
    try {
        if (typeof QRCode === 'undefined' || !payloadText) return null;
        const holder = document.createElement('div');
        holder.style.display = 'none';
        document.body.appendChild(holder);
        // eslint-disable-next-line no-new
        new QRCode(holder, { text: payloadText, width: px || 150, height: px || 150, correctLevel: QRCode.CorrectLevel.M });
        const canvas = holder.querySelector('canvas');
        const dataUrl = canvas ? canvas.toDataURL('image/png') : (holder.querySelector('img') || {}).src || null;
        document.body.removeChild(holder);
        return dataUrl;
    } catch (e) {
        console.warn('Falha ao gerar QR PIX:', e);
        return null;
    }
}

// Retorna a config de faturamento efetiva (o que estiver salvo, com fallback
// para os valores padrão). Usado pelo PDF da fatura e pelo envio de e-mail.
function getFaturamentoConfig() {
    const cfg = (db.configuracoes_gerais && db.configuracoes_gerais.length > 0) ? db.configuracoes_gerais[0] : {};
    const b = cfg.fatBanco || {};
    return {
        favorecido: b.favorecido || DEFAULT_FAT_BANCO.favorecido,
        cnpj: b.cnpj || DEFAULT_FAT_BANCO.cnpj,
        banco: b.banco || DEFAULT_FAT_BANCO.banco,
        agencia: b.agencia || DEFAULT_FAT_BANCO.agencia,
        conta: b.conta || DEFAULT_FAT_BANCO.conta,
        tipoConta: b.tipoConta || DEFAULT_FAT_BANCO.tipoConta,
        pix: b.pix || DEFAULT_FAT_BANCO.pix,
        emailAssunto: cfg.fatEmailAssunto || DEFAULT_FAT_EMAIL_ASSUNTO,
        emailCorpo: cfg.fatEmailCorpo || DEFAULT_FAT_EMAIL_CORPO
    };
}

// Bloco HTML com as instruções de pagamento (dados bancários) para o PDF da
// fatura. Só faz sentido quando há valor em aberto a receber.
function buildPaymentInstructionsHtml(f) {
    if (f && f.pago) return '';
    if (f && typeof f.valorTotal === 'number' && f.valorTotal <= 0) return '';
    const c = getFaturamentoConfig();
    const unit = f ? db.unidades.find(u => u.id === f.unidadeId) : null;

    // QR PIX (BR Code) gerado a partir da chave configurada + valor da fatura.
    let qrHtml = '';
    if (c.pix) {
        const payload = buildPixBrCode({
            key: c.pix,
            name: c.favorecido,
            city: unit && unit.cidade ? unit.cidade : 'SAO JOSE',
            amount: f && f.valorTotal ? f.valorTotal : null,
            txid: f && f.codigo ? f.codigo.replace(/[^A-Za-z0-9]/g, '') : '***'
        });
        const dataUrl = gerarQrPixDataUrl(payload, 150);
        if (dataUrl) {
            qrHtml = `
                <div style="flex:none; text-align:center; padding-left:14px; border-left:1px dashed #bbb;">
                    <img src="${dataUrl}" alt="QR Code PIX" style="width:130px; height:130px; display:block;">
                    <div style="font-size:10px; font-weight:800; color:${CERTIVE_NAVY}; margin-top:4px; letter-spacing:.03em;">PAGUE COM PIX</div>
                </div>`;
        }
    }

    const linhaPix = c.pix
        ? `<tr><td style="padding: 3px 0; width: 130px; color:#555;">Chave PIX</td><td style="padding: 3px 0; font-weight: 700;">${c.pix}</td></tr>`
        : '';

    return `
        <div style="border: 1px solid ${CERTIVE_NAVY}; border-radius: 4px; overflow: hidden; margin-top: 20px;">
            <div style="font-weight: 800; font-size: 12px; background: ${CERTIVE_NAVY}; color: #fff; padding: 10px 14px;">
                INSTRUÇÕES DE PAGAMENTO
            </div>
            <div style="padding: 14px; font-size: 12px; line-height: 1.5; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <table style="border-collapse: collapse; flex:1;">
                    <tbody>
                        <tr><td style="padding: 3px 0; width: 120px; color:#555;">Favorecido</td><td style="padding: 3px 0; font-weight: 700;">${c.favorecido}</td></tr>
                        <tr><td style="padding: 3px 0; color:#555;">CPF/CNPJ</td><td style="padding: 3px 0; font-weight: 700;">${escHtml(c.cnpj)}</td></tr>
                        <tr><td style="padding: 3px 0; color:#555;">Banco</td><td style="padding: 3px 0; font-weight: 700;">${c.banco}</td></tr>
                        <tr><td style="padding: 3px 0; color:#555;">Agência</td><td style="padding: 3px 0; font-weight: 700;">${c.agencia}</td></tr>
                        <tr><td style="padding: 3px 0; color:#555;">Conta</td><td style="padding: 3px 0; font-weight: 700;">${c.conta} ${c.tipoConta ? '(' + c.tipoConta + ')' : ''}</td></tr>
                        ${linhaPix}
                    </tbody>
                </table>
                ${qrHtml}
            </div>
        </div>
    `;
}

function renderConfigFaturamento() {
    const cfg = getFaturamentoConfig();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('cfg-fat-favorecido', cfg.favorecido);
    set('cfg-fat-cnpj', cfg.cnpj);
    set('cfg-fat-banco', cfg.banco);
    set('cfg-fat-agencia', cfg.agencia);
    set('cfg-fat-conta', cfg.conta);
    set('cfg-fat-tipo-conta', cfg.tipoConta);
    set('cfg-fat-pix', cfg.pix);
    set('cfg-fat-email-assunto', cfg.emailAssunto);
    set('cfg-fat-email-corpo', cfg.emailCorpo);
}

async function submitConfigFaturamento(event) {
    event.preventDefault();
    if (!currentSession) return;

    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    // Merge: preserva o que já existe na linha única (WhatsApp, etc.)
    const existing = (db.configuracoes_gerais && db.configuracoes_gerais.length > 0) ? db.configuracoes_gerais[0] : {};
    const oldId = existing.id || null;

    const payload = {
        ...existing,
        fatBanco: {
            favorecido: val('cfg-fat-favorecido'),
            cnpj: val('cfg-fat-cnpj'),
            banco: val('cfg-fat-banco'),
            agencia: val('cfg-fat-agencia'),
            conta: val('cfg-fat-conta'),
            tipoConta: val('cfg-fat-tipo-conta'),
            pix: val('cfg-fat-pix')
        },
        fatEmailAssunto: val('cfg-fat-email-assunto') || DEFAULT_FAT_EMAIL_ASSUNTO,
        fatEmailCorpo: (document.getElementById('cfg-fat-email-corpo') || {}).value || DEFAULT_FAT_EMAIL_CORPO,
        atualizadoEm: new Date().toISOString(),
        atualizadoPor: currentSession.nome || 'Admin'
    };

    try {
        showToast("Salvando configurações de faturamento...", "info");

        if (window.useSupabase) {
            if (oldId) {
                const { error } = await supabaseClient.from('configuracoes_gerais')
                    .update({ fatBanco: payload.fatBanco, fatEmailAssunto: payload.fatEmailAssunto, fatEmailCorpo: payload.fatEmailCorpo, atualizadoEm: payload.atualizadoEm, atualizadoPor: payload.atualizadoPor })
                    .eq('id', oldId);
                if (error) throw error;
                payload.id = oldId;
            } else {
                const { data, error } = await supabaseClient.from('configuracoes_gerais')
                    .insert({ fatBanco: payload.fatBanco, fatEmailAssunto: payload.fatEmailAssunto, fatEmailCorpo: payload.fatEmailCorpo, atualizadoEm: payload.atualizadoEm, atualizadoPor: payload.atualizadoPor })
                    .select()
                    .single();
                if (error) throw error;
                payload.id = data.id;
            }
        } else {
            payload.id = oldId || (db.configuracoes_gerais && db.configuracoes_gerais.length > 0 ? Math.max(...db.configuracoes_gerais.map(r => r.id || 0)) + 1 : 1);
        }

        db.configuracoes_gerais = [payload];
        if (!window.useSupabase && typeof saveDatabase === 'function') saveDatabase();

        showToast("Configurações de faturamento salvas com sucesso!", "success");
        logAudit("Config Faturamento", "Atualizou dados bancários / texto de e-mail da fatura.");
        renderConfigFaturamento();
    } catch (err) {
        console.error("Erro ao salvar config de faturamento:", err);
        showToast("Erro ao salvar configurações de faturamento.", "error");
    }
}

// ==========================================================
// NOTIFICAÇÕES PUSH (Web Push) — avisos no celular do admin
// ==========================================================

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

function pushSuportado() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}

async function ativarNotificacoesPush() {
    if (!pushSuportado()) {
        showToast('Este aparelho/navegador não suporta notificações. No iPhone: adicione o app à Tela de Início e abra por lá.', 'warning');
        return;
    }
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            showToast('Permissão de notificações negada. Ative nas configurações do navegador/app.', 'warning');
            atualizarStatusNotificacoesUI();
            return;
        }
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY)
            });
        }
        await salvarInscricaoPush(sub);
        showToast('Notificações ativadas neste dispositivo! ✅', 'success');
        atualizarStatusNotificacoesUI();
    } catch (e) {
        console.error('Erro ao ativar notificações:', e);
        showToast('Não foi possível ativar as notificações: ' + (e.message || e), 'error');
    }
}

async function salvarInscricaoPush(sub) {
    const raw = sub.toJSON();
    const isAdmin = !!(currentSession && currentSession.permissoes &&
        (currentSession.permissoes.includes('cadastros') || currentSession.permissoes.includes('bi')));
    const registro = {
        endpoint: raw.endpoint,
        p256dh: raw.keys.p256dh,
        auth: raw.keys.auth,
        operadorId: currentSession ? currentSession.id : null,
        operadorNome: currentSession ? currentSession.nome : null,
        isAdmin: isAdmin,
        userAgent: (navigator.userAgent || '').substring(0, 250)
    };
    const { error } = await supabaseClient
        .from('push_subscriptions')
        .upsert(registro, { onConflict: 'endpoint' });
    if (error) throw error;
}

async function desativarNotificacoesPush() {
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            const endpoint = sub.endpoint;
            await sub.unsubscribe();
            try { await supabaseClient.from('push_subscriptions').delete().eq('endpoint', endpoint); } catch (e) {}
        }
        showToast('Notificações desativadas neste dispositivo.', 'info');
        atualizarStatusNotificacoesUI();
    } catch (e) {
        console.error('Erro ao desativar notificações:', e);
    }
}

async function atualizarStatusNotificacoesUI() {
    const el = document.getElementById('push-status');
    const btnOn = document.getElementById('btn-push-ativar');
    const btnOff = document.getElementById('btn-push-desativar');
    if (!el) return;
    if (!pushSuportado()) {
        el.innerHTML = '<span style="color: var(--warning);">Não suportado neste navegador. No iPhone, adicione à Tela de Início e abra por lá.</span>';
        if (btnOn) btnOn.style.display = 'none';
        if (btnOff) btnOff.style.display = 'none';
        return;
    }
    let ativo = false;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        ativo = !!sub && Notification.permission === 'granted';
    } catch (e) {}
    if (ativo) {
        el.innerHTML = '<span style="color: var(--success);">✅ Ativadas neste dispositivo</span>';
        if (btnOn) btnOn.style.display = 'none';
        if (btnOff) btnOff.style.display = 'inline-flex';
    } else {
        el.innerHTML = '<span style="color: var(--text-secondary);">Desativadas neste dispositivo</span>';
        if (btnOn) btnOn.style.display = 'inline-flex';
        if (btnOff) btnOff.style.display = 'none';
    }
}

// Dispara notificação push para os administradores (best-effort, não bloqueia o fluxo)
async function notificarAdmins(titulo, corpo) {
    try {
        if (!window.useSupabase) return;
        await supabaseClient.functions.invoke('send-push', { body: { titulo, corpo, url: '/app.html' } });
    } catch (e) {
        console.warn('Falha ao notificar admins (push):', e.message || e);
    }
}

async function analisarLaudoComIA() {
    const cautelarId = window.activeFinalizacaoCautelarId;
    if (!cautelarId) return showToast("Nenhum laudo ativo para finalização.", "error");
    const btn = document.getElementById('btn-cautelar-ia-analisar');
    const loading = document.getElementById('cautelar-ia-loading');
    try {
        if (btn) btn.disabled = true;
        if (loading) loading.style.display = 'flex';
        showToast("O sistema está gerando o laudo…", "info");
        const resultado = await solicitarLaudoAoServidor(cautelarId);
        const cautelar = db.cautelares.find(c => c.id === cautelarId);
        if (cautelar) {
            cautelar.dadosIaConfeccionado = resultado.resposta;
            cautelar.laudoGeradoId = resultado.laudoId;
            saveDatabase();
        }
        const avisos = [...(resultado.pendencias || []), ...(resultado.inconsistencias || [])];
        showToast(avisos.length ? `Laudo preparado com ${avisos.length} apontamento(s).` : "Laudo preparado com sucesso!", avisos.length ? "warning" : "success");
        return resultado;
    } catch (erro) {
        console.error("Erro ao preparar laudo:", erro);
        showToast(erro.message || "Não foi possível preparar o laudo.", "error");
        throw erro;
    } finally {
        if (btn) btn.disabled = false;
        if (loading) loading.style.display = 'none';
    }
}




