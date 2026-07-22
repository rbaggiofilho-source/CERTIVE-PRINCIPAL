const fs = require('fs');

const appContent = fs.readFileSync('C:/Users/Ricardo/.gemini/antigravity/scratch/CERTIVE-PRINCIPAL/app_v8.js', 'utf8');
const appLines = appContent.split('\n');

console.log("--- PROCURANDO ESTRUTURA DE DECISÃO SUPABASE NO JS ---");
appLines.forEach((line, idx) => {
    if (line.includes('useSupabase') || line.includes('window.useSupabase')) {
        console.log(`Linha ${idx + 1}: ${line.trim()}`);
    }
});
