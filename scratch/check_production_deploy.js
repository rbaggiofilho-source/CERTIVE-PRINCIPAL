async function run() {
    console.log("🌐 Verificando o arquivo de produção em certive.com.br/app_v8.js...");
    try {
        const res = await fetch("https://certive.com.br/app_v8.js");
        if (!res.ok) {
            console.error(`❌ Erro ao baixar o arquivo: HTTP ${res.status}`);
            return;
        }
        const code = await res.text();
        const hasIsentas = code.includes("Injetar vistorias isentas");
        console.log(`\nContém a alteração de vistorias isentas? ${hasIsentas ? "✅ SIM" : "❌ NÃO"}`);
        
        // Vamos pesquisar se há o termo "reapresentacaoOrigemID" dentro de renderCaixaMovimentos
        const idx = code.indexOf("function renderCaixaMovimentos");
        if (idx !== -1) {
            console.log("\nTrecho de renderCaixaMovimentos na produção:");
            console.log(code.substring(idx, idx + 600));
        } else {
            console.log("❌ Não encontrou a função renderCaixaMovimentos no código de produção!");
        }
    } catch (err) {
        console.error("❌ Falha na requisição:", err);
    }
}

run();
