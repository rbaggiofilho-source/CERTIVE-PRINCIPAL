// ==========================================
// CERTIVE VISTORIAS — Supabase Configuration
// ==========================================

const SUPABASE_URL = 'https://aeajxahdflzqxmydxtgv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ur22iF8Q6EXacyQ0ICGmVQ_dNh2KBHL';

// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase client inicializado:', SUPABASE_URL);
