const fs = require('fs');

const appContent = fs.readFileSync('C:/Users/Ricardo/.gemini/antigravity/scratch/CERTIVE-PRINCIPAL/app_v8.js', 'utf8');
const appLines = appContent.split('\n');

console.log("--- PROCURANDO '+ BOLETO' NO JS ---");
appLines.forEach((line, idx) => {
    if (line.includes('+ BOLETO') || line.includes('+BOLETO') || line.includes('Boleto Bancário')) {
        console.log(`Linha ${idx + 1}: ${line.trim()}`);
    }
});
