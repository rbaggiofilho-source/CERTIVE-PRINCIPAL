const SUPABASE_URL = 'https://xktsvimtkwjegzaljfpm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xuMeTcHg4M5S7qRi-H8nvQ_xN2F5wDa';

async function checkBmlPartner() {
    console.log("⏳ Buscando parceiro BML AUTOMOVEIS (ID 31) no Supabase...");
    const res = await fetch(`${SUPABASE_URL}/rest/v1/parceiros?id=eq.31`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
    });

    if (!res.ok) {
        console.error("❌ Erro ao buscar parceiro:", await res.text());
        return;
    }

    const data = await res.json();
    console.log("📌 Dados do parceiro no banco:");
    console.log(JSON.stringify(data, null, 2));
}

checkBmlPartner();
