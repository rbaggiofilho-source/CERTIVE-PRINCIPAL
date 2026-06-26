const fs = require('fs');
let content = fs.readFileSync('js/atendimento.js', 'utf8');

// Find printContract function
const match = content.match(/function printContract\(os\) \{[\s\S]*?function printContractById\(id\) \{[\s\S]*?if \(os\) printContract\(os\);\n\}/);

if (match) {
    content = content.replace(match[0], '');
    content = content.replace(/\/\/ ==========================================\n\/\/ CONTRACT GENERATION & PRINT FLOW\n\/\/ ==========================================\n/, '');
    fs.writeFileSync('js/atendimento.js', content, 'utf8');
    console.log("Deleted printContract from js/atendimento.js");
} else {
    console.log("Could not find printContract in js/atendimento.js");
}
