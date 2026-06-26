const fs = require('fs');
let content = fs.readFileSync('app.html', 'utf8');

content = content.replace(
    /<select id="edit-os-pagamento" required>\s*<option value="pix">Pix \(Transferência Online\)<\/option>/g,
    `<select id="edit-os-pagamento" onchange="toggleInstallmentsEditOS()" required>\n                            <option value="pix">Pix (Transferência Online)</option>\n                            <option value="credito_parcelado">Crédito Parcelado</option>`
);

if (!content.includes('id="edit-os-parcelas-group"')) {
    content = content.replace(
        /<\/select>\s*<\/div>\s*<label class="form-check" style="margin-bottom: 20px;">/g,
        `</select>\n                        </div>\n                        <div class="form-group" id="edit-os-parcelas-group" style="display: none;">\n                            <label for="edit-os-parcelas">Número de Parcelas</label>\n                            <select id="edit-os-parcelas">\n                                <option value="1">1x (Sem juros)</option>\n                                <option value="2">2x (Sem juros)</option>\n                                <option value="3">3x (Sem juros)</option>\n                                <option value="4">4x (Com juros)</option>\n                                <option value="5">5x (Com juros)</option>\n                                <option value="6">6x (Com juros)</option>\n                                <option value="7">7x (Com juros)</option>\n                                <option value="8">8x (Com juros)</option>\n                                <option value="9">9x (Com juros)</option>\n                                <option value="10">10x (Com juros)</option>\n                                <option value="11">11x (Com juros)</option>\n                                <option value="12">12x (Com juros)</option>\n                            </select>\n                        </div>\n                        <label class="form-check" style="margin-bottom: 20px;">`
    );
}

fs.writeFileSync('app.html', content, 'utf8');
