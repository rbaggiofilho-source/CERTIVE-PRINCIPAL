import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const asaasUrl = Deno.env.get('ASAAS_API_URL') || 'https://sandbox.asaas.com/api/v3';
const asaasKey = Deno.env.get('ASAAS_API_KEY')!;

const zapToken = Deno.env.get('ZAP_API_TOKEN')!;
const zapInstanceId = Deno.env.get('ZAP_INSTANCE_ID')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const { faturaId, pdfUrl } = await req.json();

    if (!faturaId) {
      return new Response(JSON.stringify({ error: 'faturaId é obrigatório' }), { status: 400 });
    }

    // 1. Buscar a fatura no banco
    const { data: fatura, error: faturaError } = await supabase
      .from('faturas')
      .select('*')
      .eq('id', faturaId)
      .single();

    if (faturaError || !fatura) throw new Error('Fatura não encontrada: ' + faturaError?.message);

    const { data: parceiro, error: parceiroError } = await supabase
      .from('parceiros')
      .select('*')
      .eq('id', fatura.parceiroId)
      .single();

    if (parceiroError || !parceiro) throw new Error('Parceiro não encontrado para a fatura.');

    let asaasCustomerId = parceiro.asaas_customer_id;

    // 2. Criar Customer no Asaas se não existir
    if (!asaasCustomerId) {
      const customerPayload = {
        name: parceiro.nome,
        cpfCnpj: parceiro.cnpj?.replace(/\D/g, '') || '',
        email: parceiro.email || '',
        mobilePhone: parceiro.whatsapp?.replace(/\D/g, '') || '',
        notificationDisabled: true // Desabilitamos as notificações do Asaas, pois faremos a nossa via ZAP-API
      };

      const customerRes = await fetch(`${asaasUrl}/customers`, {
        method: 'POST',
        headers: {
          'access_token': asaasKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(customerPayload)
      });

      if (!customerRes.ok) {
        throw new Error(`Asaas Customer Error: ${await customerRes.text()}`);
      }

      const customerData = await customerRes.json();
      asaasCustomerId = customerData.id;

      // Salvar no banco
      await supabase.from('parceiros').update({ asaas_customer_id: asaasCustomerId }).eq('id', parceiro.id);
    }

    // 3. Criar Cobrança no Asaas
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5); // Vencimento em 5 dias
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const paymentPayload = {
      customer: asaasCustomerId,
      billingType: 'UNDEFINED', // Deixa o Asaas decidir (Boleto/Pix/Cartão conforme configurado na sua conta Asaas)
      value: fatura.valorTotal,
      dueDate: dueDateStr,
      description: `Faturamento Mensal Certive - Fatura #${fatura.codigo}`,
      externalReference: String(fatura.id)
    };

    const paymentRes = await fetch(`${asaasUrl}/payments`, {
      method: 'POST',
      headers: {
        'access_token': asaasKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentPayload)
    });

    if (!paymentRes.ok) {
      throw new Error(`Asaas Payment Error: ${await paymentRes.text()}`);
    }

    const paymentData = await paymentRes.json();
    
    // Atualizar fatura no banco com os dados da cobrança
    await supabase.from('faturas').update({
      asaas_payment_id: paymentData.id,
      asaas_url: paymentData.invoiceUrl
    }).eq('id', fatura.id);

    // 4. Enviar mensagem via ZAP-API
    let zapStatus = 'nao_enviado';
    if (parceiro.whatsapp) {
      let phone = parceiro.whatsapp.replace(/\D/g, '');
      if (phone.length === 10 || phone.length === 11) phone = '55' + phone;

      const mensagem = `Olá, somos da Certive Vistorias!\n\nSegue o link para o pagamento do seu faturamento mensal (Fatura #${fatura.codigo}) no valor de R$ ${Number(fatura.valorTotal).toLocaleString('pt-BR', {minimumFractionDigits: 2})}.\n\nVencimento: ${dueDate.toLocaleDateString('pt-BR')}\n\nLink seguro Asaas:\n${paymentData.invoiceUrl}\n\nAgradecemos a parceria!`;

      const zapResponse = await fetch(`https://api.zap-api.tech/v1/instances/${zapInstanceId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${zapToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: phone,
          type: 'text',
          body: mensagem
        })
      });

      if (zapResponse.ok) {
        await supabase.from('faturas').update({ notificacao_zap: true }).eq('id', fatura.id);
        zapStatus = 'enviado';
        
        // Se temos um PDF para anexar, enviamos em seguida!
        if (pdfUrl) {
          // Pequeno delay para a mensagem de texto chegar antes do arquivo
          await new Promise(r => setTimeout(r, 1000));
          
          await fetch(`https://api.zap-api.tech/v1/instances/${zapInstanceId}/send`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${zapToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              phone: phone,
              type: 'document',
              document: pdfUrl,
              fileName: `Demonstrativo_FAT-${fatura.codigo}.pdf`
            })
          });
        }
        
      } else {
        zapStatus = 'erro';
        console.error('ZAP-API erro (text):', await zapResponse.text());
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Cobrança gerada com sucesso!', 
        paymentId: paymentData.id, 
        url: paymentData.invoiceUrl,
        zapStatus
      }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
