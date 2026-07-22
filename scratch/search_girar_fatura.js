const fs = require('fs');

const appContent = fs.readFileSync('C:/Users/Ricardo/.gemini/antigravity/scratch/CERTIVE-PRINCIPAL/app_v8.js', 'utf8');
const appLines = appContent.split('\n');

console.log("--- PROCURANDO 'openGirarFaturaModal' OU 'GirarFatura' ---");
appLines.forEach((line, idx) => {
    if (line.includes('GirarFatura') || line.includes('girarFatura')) {
        console.log(`Linha ${idx + 1}: ${line.trim()}`);
        const start = Math.max(0, idx - 5);
        const end = Math.min(appLines.length - 1, idx + 45);
        for (let i = start; i <= end; i++) {
            console.log(`  ${i + 1}: ${appLines[i]}`);
        }
    }
});
