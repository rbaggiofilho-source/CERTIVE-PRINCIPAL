const puppeteer = require('puppeteer');

(async () => {
    console.log("Starting flow test...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    page.on("console", msg => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", err => console.log("PAGE ERROR:", err.message));

    // Acessa a pagina e injeta localStorage
    await page.goto('http://127.0.0.1:8080/index.html', { waitUntil: 'networkidle0' });
    
    await page.evaluate(() => {
        localStorage.setItem('certive_session', JSON.stringify({
            id: 1, 
            nome: "Admin Test", 
            login: "admin", 
            permissoes: ["abertura_os", "caixa", "faturamento", "contas", "bi", "cadastros"]
        }));
    });

    await page.goto('http://127.0.0.1:8080/app.html', { waitUntil: 'networkidle0' });

    // Inject interceptor for toasts
    await page.evaluate(() => {
        const origToast = window.showToast;
        window.showToast = function(msg, type) {
            console.log("TOAST FIRED:", type, msg);
            if (origToast) origToast(msg, type);
        };
    });

    await page.waitForSelector('#app-content');
    
    try {
        const hasCaixaBtn = await page.$('#btn-abrir-caixa-modal');
        if (hasCaixaBtn) {
            await page.click('#btn-abrir-caixa-modal');
            await new Promise(r => setTimeout(r, 500));
            await page.type('#caixa-saldo-inicial', '100');
            await page.click('#btn-confirmar-abertura');
            await new Promise(r => setTimeout(r, 500));
        }
    } catch(e) {}

    await page.evaluate(() => navigateTo('atendimento'));
    await new Promise(r => setTimeout(r, 1000));

    await page.click('#lbl-svc-1'); 
    await page.type('#os-placa', 'XYZ1234');
    await page.type('#os-renavam', '12345678900');
    await page.type('#os-veiculo-chassi', '9BWZZZ1234567');
    await page.type('#os-marca', 'VW');
    await page.type('#os-modelo', 'GOL');
    await page.type('#os-ano', '2020');
    await page.type('#os-cor', 'PRETO');
    await page.type('#os-combustivel', 'FLEX');
    await page.type('#os-nome-cliente', 'Joao Teste');
    await page.type('#os-cpf-cliente', '123.456.789-00');
    await page.type('#os-celular-cliente', '11999999999');
    await page.type('#os-cliente-endereco', 'Rua Teste, 123');
    await page.select('#os-finalidade', 'Compra/Venda');
    await page.type('#os-obs', 'Teste de integracao');
    
    await page.evaluate(() => {
        document.getElementById('os-doc-veiculo').checked = true;
        document.getElementById('os-doc-identificacao').checked = true;
        
        // Inject fake open caixa
        db.caixa_diario.push({
            id: 999,
            unidadeId: activeUnitId,
            data: getLocalToday(),
            status: "aberto"
        });
    });

    console.log("Enviando form da OS...");
    await page.evaluate(() => submitOSForm());
    
    await new Promise(r => setTimeout(r, 2000));
    
    try {
        await page.evaluate(() => {
            document.getElementById('contrato-aceite-check').checked = true;
            toggleContratoConfirmBtn();
        });
        await page.click('#btn-confirmar-contrato');
        await new Promise(r => setTimeout(r, 4000));
        const checkOS = await page.evaluate(() => {
            const firstOS = db.ordens_servico.find(o => o.placa === 'XYZ1234');
            return firstOS ? firstOS.numero : null;
        });

        if (checkOS) {
            console.log(`✅ OS Criada com sucesso! Número: ${checkOS}`);
        } else {
            console.log("❌ Falha: OS não foi criada.");
        }
    } catch(e) {
        console.log("Erro no final:", e);
    }
    
    await browser.close();
})();
