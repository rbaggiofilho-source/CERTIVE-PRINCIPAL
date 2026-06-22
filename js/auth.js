// ==========================================
// CERTIVE VISTORIAS — AUTH MODULE
// ==========================================

function checkSession() {
    const sessionData = localStorage.getItem('certive_session');

    if (sessionData) {
        currentSession = JSON.parse(sessionData);

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

        // Navigate to saved page or first permitted page
        const savedPage = localStorage.getItem('certive_current_page');
        if (savedPage) {
            navigateTo(savedPage);
        } else if (currentSession.permissoes.includes("abertura_os")) {
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
        // Not logged in - redirect to login page
        window.location.href = 'index.html';
    }
}

function handleLogout() {
    logAudit("Logout", `Efetuou logout do sistema.`);
    localStorage.removeItem('certive_session');
    localStorage.removeItem('certive_current_page');
    currentSession = null;
    window.location.href = 'index.html';
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
