const fs = require('fs');

let content = fs.readFileSync('js/contratos.js', 'utf8');

const newRenderMarkdown = `function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
        return marked.parse(text);
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
    html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
    
    // Simple table parser
    const lines = html.split('\\n');
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
                tableHtml = tableHtml.replace(/<\\/tr>$/, '</thead><tbody>');
                continue;
            }
            
            const cols = line.split('|').slice(1, -1);
            const tag = inTable && !tableHtml.includes('<tbody>') ? 'th' : 'td';
            
            tableHtml += '<tr>' + cols.map(c => \`<\${tag} style="border: 1px solid var(--border, #ccc); padding: 8px;">\${c.trim()}</\${tag}>\`).join('') + '</tr>';
        } else {
            if (inTable) {
                inTable = false;
                tableHtml += '</tbody></table>';
                lines[i] = tableHtml + '\\n' + line;
            }
        }
    }
    if (inTable) {
        tableHtml += '</tbody></table>';
        lines[lines.length - 1] = tableHtml;
    }
    
    html = lines.join('\\n');
    
    // Line breaks and paragraphs
    html = html.split(/\\n\\n+/).map(p => {
        p = p.trim();
        if (p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<hr')) {
            return p;
        }
        return \`<p style="margin-bottom: 12px; line-height: 1.5;">\${p.replace(/\\n/g, '<br>')}</p>\`;
    }).join('\\n');
    
    // Horizontal rule
    html = html.replace(/^---$/gim, '<hr style="border: 0; border-top: 1px solid var(--border, #ccc); margin: 24px 0;">');
    
    return html;
}`;

content = content.replace(/function renderMarkdown\(md\) \{[\s\S]*?return html;\n\}/, newRenderMarkdown);

const headerHtml = `
    const headerHtml = \`
<div style="text-align: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 3px solid #d4af37;">
    <h1 style="font-family: 'Georgia', serif; font-size: 32px; font-weight: 800; color: #1e3a5f; letter-spacing: 4px; margin: 0 0 4px 0;">CERTIVE</h1>
    <p style="font-family: 'Arial', sans-serif; font-size: 11px; font-weight: bold; color: #888; letter-spacing: 2px; margin: 0;">VISTORIA & IDENTIFICAÇÃO VEICULAR</p>
</div>
<div style="text-align: center; margin-bottom: 24px;">
    <h2 style="font-family: 'Georgia', serif; font-size: 18px; font-weight: 700; color: #1e3a5f; margin: 0 0 8px 0; line-height: 1.3;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS<br>DE VISTORIA DE IDENTIFICAÇÃO VEICULAR</h2>
    <p style="font-style: italic; font-size: 11px; color: #666; margin: 0;">Modelo padrão — campos entre chaves duplas {{ }} preenchidos automaticamente pelo sistema</p>
</div>\`;`;

// In printContract
content = content.replace(
    /const contractHtml = renderMarkdown\(os\.contratoTexto \|\| generateContractText\(os\)\);\s*area\.innerHTML = `\s*<div class="print-contract-container">\s*\$\{contractHtml\}\s*<\/div>\s*`;/g,
    `const contractHtml = renderMarkdown(os.contratoTexto || generateContractText(os));\n${headerHtml}\n    \n    area.innerHTML = \`\n        <div class="print-contract-container">\n            \$\{headerHtml\}\n            \$\{contractHtml\}\n        </div>\n    \`;`
);

// In printContratoPreview
content = content.replace(
    /const contractHtml = renderMarkdown\(window\.pendingOS\.contratoTexto\);\s*document\.getElementById\('print-area'\)\.innerHTML = `\s*<div class="print-contract-container">\s*\$\{contractHtml\}\s*<\/div>\s*`;/g,
    `const contractHtml = renderMarkdown(window.pendingOS.contratoTexto);\n${headerHtml}\n    document.getElementById('print-area').innerHTML = \`\n        <div class="print-contract-container">\n            \$\{headerHtml\}\n            \$\{contractHtml\}\n        </div>\n    \`;`
);

// In openContratoFirmadoModal
content = content.replace(
    /const contractText = os\.contratoTexto \|\| generateContractText\(os\);\s*contentContainer\.innerHTML = renderMarkdown\(contractText\);/g,
    `const contractText = os.contratoTexto || generateContractText(os);\n${headerHtml}\n    contentContainer.innerHTML = headerHtml + renderMarkdown(contractText);`
);

fs.writeFileSync('js/contratos.js', content, 'utf8');
