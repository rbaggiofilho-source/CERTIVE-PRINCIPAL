// ==========================================
// CERTIVE VISTORIAS — CORE (Shared Utilities)
// ==========================================

// Global state variables
let db = {};
let currentSession = null;
let activeUnitId = 1;
let currentClientType = 'particular';
let currentSelectedServiceId = null;

// Initialize Database from Supabase
async function initDatabase() {
    await loadAllFromSupabase();
    console.log('[Certive] Database loaded from Supabase:', Object.keys(db).map(k => k + '(' + (db[k]?.length || 0) + ')').join(', '));
}

function saveDatabase() {
    // No-op: data is now persisted in Supabase.
}

async function loadDatabase() {
    await loadAllFromSupabase();
}

// Helper formatting functions
function formatCurrency(val) {
    if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(isoString) {
    if (!isoString) return "—";
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

// Custom Confirm Modal (replaces native confirm())
let _confirmResolve = null;

function showConfirm({ title, message, icon = '⚠️', confirmText = 'Confirmar', cancelText = 'Cancelar', confirmClass = 'btn-primary' }) {
    return new Promise((resolve) => {
        _confirmResolve = resolve;
        document.getElementById('confirm-icon').innerHTML = icon;
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').innerHTML = message;
        const btnOk = document.getElementById('confirm-btn-ok');
        btnOk.textContent = confirmText;
        btnOk.className = `btn ${confirmClass}`;
        document.getElementById('confirm-btn-cancel').textContent = cancelText;
        document.getElementById('modal-confirm').classList.add('active');
    });
}

function resolveConfirm(value) {
    document.getElementById('modal-confirm').classList.remove('active');
    if (_confirmResolve) {
        _confirmResolve(value);
        _confirmResolve = null;
    }
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

// Toast Alerts
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

// Unit Selector
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

// Clipboard
function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast("Código de barras copiado!", "success");
    }).catch(err => {
        console.error('[Certive] Copy failed:', err);
    });
}

// Navigation Handler
let _loadedModules = {};

async function navigateTo(pageId) {
    // Close sidebar on mobile
    document.querySelector('.sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');

    // Check permission
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

    // Save current page to localStorage for persistence on refresh
    localStorage.setItem('certive_current_page', pageId);

    // Load page content
    const contentArea = document.getElementById('app-content');
    try {
        const response = await fetch(`pages/${pageId}.html`);
        if (!response.ok) throw new Error('Page not found');
        const html = await response.text();
        contentArea.innerHTML = html;

        // Load module JS if not already loaded
        if (!_loadedModules[pageId]) {
            await loadScript(`js/${pageId}.js`);
            _loadedModules[pageId] = true;
        }

        // Call render function
        const renderFns = {
            'atendimento': 'renderAtendimentoPage',
            'caixa': 'renderCaixaPage',
            'historico': 'renderHistoricoPage',
            'faturamento': 'renderFaturamentoPage',
            'contas': 'renderContasPage',
            'bi': 'renderBIPage',
            'config': 'renderConfigPage'
        };

        const fn = renderFns[pageId];
        if (fn && typeof window[fn] === 'function') {
            window[fn]();
        }
    } catch (e) {
        console.error(`[Certive] Error loading page ${pageId}:`, e);
        contentArea.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-secondary);">
            <i class="ri-error-warning-line" style="font-size: 48px; color: var(--danger);"></i>
            <h3 style="margin-top: 16px;">Erro ao carregar página</h3>
            <p>Não foi possível carregar o módulo "${pageId}".</p>
        </div>`;
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}
