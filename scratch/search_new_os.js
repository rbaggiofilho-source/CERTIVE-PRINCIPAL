const fs = require('fs');

const appContent = fs.readFileSync('C:/Users/Ricardo/.gemini/antigravity/scratch/CERTIVE-PRINCIPAL/app_v8.js', 'utf8');
const appLines = appContent.split('\n');

console.log("--- PROCURANDO ESTRUTURA DE OS NO JS ---");
appLines.forEach((line, idx) => {
    if (line.includes('const newOS =') || line.includes('const newOs =')) {
        console.log(`Linha ${idx + 1}: ${line.trim()}`);
        const start = Math.max(0, idx - 2);
        const end = Math.min(appLines.length - 1, idx + 25);
        for (let i = start; i <= end; i++) {
            console.log(`  ${i + 1}: ${appLines[i]}`);
        }
    }
});
