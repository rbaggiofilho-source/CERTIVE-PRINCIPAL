const fs = require('fs');
const path = require('path');

function searchPlus(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== '.gemini' && file !== 'scratch') {
                searchPlus(filePath);
            }
        } else {
            if (file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.html')) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    if (content.includes('+ BOLETO') || content.includes('+BOLETO')) {
                        console.log(`Found in: ${filePath}`);
                    }
                } catch(e) {}
            }
        }
    }
}

searchPlus('C:/Users/Ricardo/.gemini/antigravity/scratch/CERTIVE-PRINCIPAL');
