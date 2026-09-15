import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

// ==========================================================
// CANCELAR COBRANÇA ASAAS (usado na baixa manual, passo 4).
// Quando o cliente pagou por fora (PIX/cartão/transferência) uma
// fatura que TINHA cobrança Asaas em aberto, removemos essa cobrança
// para o cliente não ser cobrado de novo. Se o pagamento foi feito
// PELA própria cobrança Asaas, NÃO chamamos isto — o Asaas já baixa.
// ==========================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const asaasUrl = Deno.env.get('ASAAS_API_URL') || 'https://api.asaas.com/v3';
const asaasKey = Deno.env.get('ASAAS_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { faturaId } = await req.json();
    if (!faturaId) {
      return new Response(JSON.stringify({ error: 'faturaId é obrigatório' }), { status: 400, headers: CORS });
    }

    const { data: fatura, error } = await supabase
      .from('faturas').select('*').eq('id', faturaId).single();
    if (error || !fatura) throw new Error('Fatura não encontrada: ' + (error?.message || ''));

    if (!fatura.asaas_payment_id) {
      // Nada a cancelar no Asaas.
      return new Response(JSON.stringify({ status: 'sem_cobranca' }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // Não é possível remover cobrança já recebida/confirmada no Asaas.
    const getRes = await fetch(`${asaasUrl}/payments/${fatura.asaas_payment_id}`, {
      method: 'GET',
      headers: { 'access_token': asaasKey, 'Content-Type': 'application/json' }
    });
    if (getRes.ok) {
      const det = await getRes.json();
      if (det.status && ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(det.status)) {
        return new Response(JSON.stringify({ status: 'ja_recebida', asaasStatus: det.status }), {
          headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
    }

    const delRes = await fetch(`${asaasUrl}/payments/${fatura.asaas_payment_id}`, {
      method: 'DELETE',
      headers: { 'access_token': asaasKey, 'Content-Type': 'application/json' }
    });

    if (!delRes.ok) {
      throw new Error(`Asaas Delete Error: ${await delRes.text()}`);
    }

    // Limpa os campos da cobrança na fatura.
    await supabase.from('faturas').update({
      asaas_payment_id: null,
      asaas_url: null
    }).eq('id', fatura.id);

    return new Response(JSON.stringify({ status: 'cancelada' }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
