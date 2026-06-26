const fs = require('fs');
let content = fs.readFileSync('pages/atendimento.html', 'utf8');

content = content.replace(
    /<select id="os-pagamento" onchange="toggleParcelas\(\)">\s*<option value="pix">Pix \(Transferência Online\)<\/option>/g,
    `<select id="os-pagamento" onchange="toggleParcelas()">\n                                        <option value="pix">Pix (Transferência Online)</option>\n                                        <option value="credito_parcelado">Crédito Parcelado</option>`
);

if (!content.includes('id="os-parcelas-group"')) {
    content = content.replace(
        /<\/select>\s*<\/div>\s*<div class="form-row" style="margin-top: 15px;">/g,
        `</select>\n                                </div>\n                                <div class="form-group" id="os-parcelas-group" style="display: none;">\n                                    <label for="os-parcelas">Qtd. Parcelas</label>\n                                    <select id="os-parcelas">\n                                        <option value="1">1x</option>\n                                        <option value="2">2x</option>\n                                        <option value="3">3x</option>\n                                        <option value="4">4x</option>\n                                        <option value="5">5x</option>\n                                        <option value="6">6x</option>\n                                        <option value="7">7x</option>\n                                        <option value="8">8x</option>\n                                        <option value="9">9x</option>\n                                        <option value="10">10x</option>\n                                        <option value="11">11x</option>\n                                        <option value="12">12x</option>\n                                    </select>\n                                </div>\n                            <div class="form-row" style="margin-top: 15px;">`
    );
}
fs.writeFileSync('pages/atendimento.html', content, 'utf8');
