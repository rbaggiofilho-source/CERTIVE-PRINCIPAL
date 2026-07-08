import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// Formata data de YYYY-MM-DD para DD/MM/YYYY
function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

serve(async (req) => {
  try {
    // Apenas permitir método POST (usado pelo pg_cron)
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // ZAP-API credentials from secrets
    const zapToken = Deno.env.get('ZAP_API_TOKEN');
    const zapInstanceId = Deno.env.get('ZAP_INSTANCE_ID');

    if (!zapToken || !zapInstanceId) {
      throw new Error("Missing ZAP_API credentials in Secrets");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Pegar configurações de envio
    const { data: config, error: configError } = await supabase
      .from('configuracoes')
      .select('*')
      .limit(1)
      .single();

    if (configError || !config) {
      throw new Error("Failed to fetch configuracoes ou tabela vazia");
    }

    const { zap_responsavel, zap_dias_aviso, zap_template } = config;

    if (!zap_responsavel) {
      return new Response(JSON.stringify({ message: "Nenhum responsável configurado para receber notificações." }), { status: 200 });
    }

    // 2. Calcular a data de vencimento alvo (Hoje + zap_dias_aviso)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (zap_dias_aviso || 3));
    const targetDateString = targetDate.toISOString().split('T')[0];

    // 3. Buscar contas a pagar que:
    // - vencimento == targetDateString
    // - pago == FALSE
    // - notificacao_enviada == FALSE
    const { data: contas, error: contasError } = await supabase
      .from('contas_pagar')
      .select('*')
      .eq('vencimento', targetDateString)
      .eq('pago', false)
      .eq('notificacao_enviada', false);

    if (contasError) {
      throw new Error(`Erro ao buscar contas: ${contasError.message}`);
    }

    if (!contas || contas.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhuma conta elegível para notificação hoje." }), { status: 200 });
    }

    const results = [];

    // 4. Para cada conta, enviar mensagem via ZAP-API
    for (const conta of contas) {
      try {
        // Tratar as variáveis do template
        let mensagem = zap_template || 'Atenção: A conta {descricao} no valor de R$ {valor} vence no dia {vencimento}';
        mensagem = mensagem.replace(/{descricao}/g, conta.descricao);
        mensagem = mensagem.replace(/{valor}/g, Number(conta.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        mensagem = mensagem.replace(/{vencimento}/g, formatDate(conta.vencimento));
        mensagem = mensagem.replace(/{codigoBarras}/g, conta.codigoBarras || '');

        let limpo = zap_responsavel.replace(/\D/g, '');
        if (limpo.length === 10 || limpo.length === 11) {
          limpo = '55' + limpo;
        }

        // Enviar mensagem principal para a ZAP-API
        const zapResponse = await fetch(`https://api.zap-api.tech/v1/instances/${zapInstanceId}/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${zapToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: limpo,
            type: 'text',
            body: mensagem
          })
        });

        if (!zapResponse.ok) {
          const errorText = await zapResponse.text();
          throw new Error(`ZAP-API Error: ${zapResponse.status} - ${errorText}`);
        }

        // Se houver código de barras, mandar como uma SEGUNDA mensagem isolada (facilita o copiar/colar no banco)
        if (conta.codigoBarras && conta.codigoBarras.trim() !== '') {
          // Pausa de 1 seg para garantir a ordem das mensagens
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const barcodeResponse = await fetch(`https://api.zap-api.tech/v1/instances/${zapInstanceId}/send`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${zapToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              phone: limpo,
              type: 'text',
              body: conta.codigoBarras.trim()
            })
          });
          
          if (!barcodeResponse.ok) {
            console.error(`Falha ao enviar código de barras para a conta ${conta.id}`);
          }
        }

        // Marcar como enviada no Supabase
        await supabase
          .from('contas_pagar')
          .update({ notificacao_enviada: true })
          .eq('id', conta.id);

        results.push({ id: conta.id, status: 'sucesso' });
      } catch (err) {
        console.error(`Erro ao notificar conta ${conta.id}:`, err);
        results.push({ id: conta.id, status: 'erro', error: err.message });
      }
    }

    return new Response(JSON.stringify({ message: "Processamento concluído", results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error("Erro geral na função notify-bills:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
