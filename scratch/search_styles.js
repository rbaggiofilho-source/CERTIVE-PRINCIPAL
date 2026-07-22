const fs = require('fs');

const stylesContent = fs.readFileSync('C:/Users/Ricardo/.gemini/antigravity/scratch/CERTIVE-PRINCIPAL/styles.css', 'utf8');
const stylesLines = stylesContent.split('\n');

console.log("--- PROCURANDO 'atendimento-layout' NO STYLES.CSS ---");
stylesLines.forEach((line, idx) => {
    if (line.includes('atendimento-layout') || line.includes('table-container')) {
        console.log(`Linha ${idx + 1}: ${line.trim()}`);
        const start = Math.max(0, idx - 3);
        const end = Math.min(stylesLines.length - 1, idx + 10);
        for (let i = start; i <= end; i++) {
            console.log(`  ${i + 1}: ${stylesLines[i]}`);
        }
    }
});
