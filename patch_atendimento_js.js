const fs = require('fs');
let content = fs.readFileSync('js/atendimento.js', 'utf8');

// Add toggle functions if not present
if (!content.includes('function toggleParcelas')) {
    content += `\n\nfunction toggleParcelas() {
    const pag = document.getElementById('os-pagamento').value;
    const group = document.getElementById('os-parcelas-group');
    if (pag === 'credito_parcelado') {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
    }
}

function toggleInstallmentsEditOS() {
    const pag = document.getElementById('edit-os-pagamento').value;
    const group = document.getElementById('edit-os-parcelas-group');
    if (pag === 'credito_parcelado') {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
    }
}\n`;
}

// In submitOSForm
content = content.replace(
    /const pagamento = document\.getElementById\('os-pagamento'\)\.value;/g,
    `const pagamento = document.getElementById('os-pagamento').value;\n    const parcelasEl = document.getElementById('os-parcelas');\n    const parcelas = (pagamento === 'credito_parcelado' && parcelasEl) ? parseInt(parcelasEl.value) : null;`
);

content = content.replace(
    /formaPagamento: pagamento,/g,
    `formaPagamento: pagamento,\n            parcelas: parcelas,`
);

// In openOSDetailsModal
content = content.replace(
    /<div class="detail-item"><label>Cobrança<\/label><span>\$\{os\.formaPagamento\.toUpperCase\(\)\}<\/span><\/div>/g,
    `<div class="detail-item"><label>Cobrança</label><span>\$\{os.formaPagamento === 'credito_parcelado' ? \`CRÉDITO PARCELADO (\$\{os.parcelas\}x)\` : os.formaPagamento.toUpperCase()\}</span></div>`
);

// In openEditOSModal
content = content.replace(
    /document\.getElementById\('edit-os-pagamento'\)\.value = os\.formaPagamento;/g,
    `document.getElementById('edit-os-pagamento').value = os.formaPagamento;\n    if (os.formaPagamento === 'credito_parcelado') {\n        document.getElementById('edit-os-parcelas-group').style.display = 'block';\n        document.getElementById('edit-os-parcelas').value = os.parcelas || '1';\n    } else {\n        document.getElementById('edit-os-parcelas-group').style.display = 'none';\n    }`
);

// In submitEditOSForm
content = content.replace(
    /const pagamento = document\.getElementById\('edit-os-pagamento'\)\.value;/g,
    `const pagamento = document.getElementById('edit-os-pagamento').value;\n    const parcelas = pagamento === 'credito_parcelado' ? parseInt(document.getElementById('edit-os-parcelas').value) : null;`
);

content = content.replace(
    /os\.formaPagamento = pagamento;/g,
    `os.formaPagamento = pagamento;\n    os.parcelas = parcelas;`
);

fs.writeFileSync('js/atendimento.js', content, 'utf8');
