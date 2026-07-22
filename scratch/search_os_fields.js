const fs = require('fs');

const migrationContent = fs.readFileSync('C:/Users/Ricardo/.gemini/antigravity/scratch/CERTIVE-PRINCIPAL/supabase/migrations/20260702000005_faturamento.sql', 'utf8');
console.log("--- TRECHO DA MIGRATION ---");
console.log(migrationContent.substring(0, 1500));
