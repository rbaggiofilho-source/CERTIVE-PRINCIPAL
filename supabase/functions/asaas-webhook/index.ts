import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  // Webhooks geralmente são POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Validação de segurança do Token do Asaas (Recomendado)
    const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
    if (expectedToken) {
      const receivedToken = req.headers.get('asaas-access-token');
      if (receivedToken !== expectedToken) {
        console.warn('Tentativa de acesso negada: Token do Asaas inválido.');
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const payload = await req.json();

    console.log('Webhook Asaas Recebido:', payload.event, payload.payment?.id);

    // Asaas envia diversos eventos. Vamos ouvir apenas quando o pagamento for recebido/confirmado
    if (payload.event === 'PAYMENT_RECEIVED' || payload.event === 'PAYMENT_CONFIRMED') {
      const paymentId = payload.payment.id;

      if (!paymentId) throw new Error('ID do pagamento não encontrado no payload');

      // 1. Buscar a fatura correspondente
      const { data: fatura, error: faturaError } = await supabase
        .from('faturas')
        .select('id, ordensIds')
        .eq('asaas_payment_id', paymentId)
        .single();

      if (faturaError || !fatura) {
        console.error('Fatura não encontrada para o payment:', paymentId);
        return new Response('Fatura não encontrada', { status: 404 });
      }

      // 2. Dar baixa na Fatura
      const { error: updateFaturaError } = await supabase
        .from('faturas')
        .update({ pago: true, pagoEm: new Date().toISOString() })
        .eq('id', fatura.id);

      if (updateFaturaError) throw new Error('Erro ao atualizar fatura: ' + updateFaturaError.message);

      // 3. Dar baixa nas Ordens de Serviço (Vistorias) vinculadas à Fatura
      if (fatura.ordensIds && fatura.ordensIds.length > 0) {
        const { error: updateOsError } = await supabase
          .from('ordens_servico')
          .update({ pago: true })
          .in('id', fatura.ordensIds);

        if (updateOsError) throw new Error('Erro ao atualizar OSs: ' + updateOsError.message);
      }

      console.log(`Fatura ${fatura.id} e suas OSs foram dadas baixa com sucesso.`);
    }

    // Retorna 200 pro Asaas parar de tentar enviar o Webhook
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Erro no processamento do webhook:', err);
    // Mesmo com erro interno, retornar 200 se não quisermos que o Asaas faça retries infinitos,
    // mas se for erro temporário de banco, o Asaas recomanda retornar 500 para ele tentar de novo depois.
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
