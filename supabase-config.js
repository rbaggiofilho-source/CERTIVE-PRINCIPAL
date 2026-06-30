// ==========================================
// CERTIVE VISTORIAS — Supabase Configuration
// ==========================================

const SUPABASE_URL = 'https://xktsvimtkwjegzaljfpm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xuMeTcHg4M5S7qRi-H8nvQ_xN2F5wDa';

// Initialize Supabase Client with safety check
let supabaseClient;

if (typeof supabase === 'undefined') {
    console.error('❌ Supabase CDN não carregou. Verifique a conexão com a internet.');
    document.addEventListener('DOMContentLoaded', function() {
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <div style="text-align:center; color:#ef4444; padding:40px; max-width:500px;">
                    <h2 style="color:#f8fafc; margin-bottom:16px;">⚠️ Erro de Conexão</h2>
                    <p style="color:#94a3b8;">Não foi possível carregar os recursos do sistema. 
                    Verifique sua conexão com a internet e recarregue a página.</p>
                    <button onclick="location.reload()" style="margin-top:20px; padding:12px 24px; 
                    background:#d4a017; color:#050811; border:none; border-radius:6px; 
                    font-weight:700; cursor:pointer; font-family:Outfit,sans-serif;">
                    Recarregar Página</button>
                </div>`;
        }
    });
} else {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase client inicializado:', SUPABASE_URL);
}
