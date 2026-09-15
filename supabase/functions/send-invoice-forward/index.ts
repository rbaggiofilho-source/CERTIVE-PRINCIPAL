import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

// ==========================================================
// ENCAMINHAR FATURA (passo 2) — envia o PDF + texto padrão por
// E-MAIL (Resend) e/ou WhatsApp (ZAP-API). NÃO cria cobrança no
// Asaas: esse é o passo 3, feito por generate-asaas-billing.
// ==========================================================

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const zapToken = Deno.env.get('ZAP_API_TOKEN') || '';
const zapInstanceId = Deno.env.get('ZAP_INSTANCE_ID') || '';

const resendKey = Deno.env.get('RESEND_API_KEY') || '';
// Remetente precisa ser de um domínio verificado no Resend.
const emailFrom = Deno.env.get('INVOICE_EMAIL_FROM') || 'Certive Vistorias <faturas@certive.com.br>';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { faturaId, pdfUrl, canais, assunto, corpo } = await req.json();
    if (!faturaId) {
      return new Response(JSON.stringify({ error: 'faturaId é obrigatório' }), { status: 400, headers: CORS });
    }
    const channels: string[] = Array.isArray(canais) && canais.length ? canais : ['email', 'whatsapp'];

    const { data: fatura, error: faturaError } = await supabase
      .from('faturas').select('*').eq('id', faturaId).single();
    if (faturaError || !fatura) throw new Error('Fatura não encontrada: ' + (faturaError?.message || ''));

    const { data: parceiro, error: parceiroError } = await supabase
      .from('parceiros').select('*').eq('id', fatura.parceiroId).single();
    if (parceiroError || !parceiro) throw new Error('Parceiro não encontrado para a fatura.');

    const result: Record<string, string> = { email: 'nao_enviado', whatsapp: 'nao_enviado' };

    // ---- E-MAIL (Resend) ----
    if (channels.includes('email')) {
      if (!resendKey) {
        result.email = 'sem_config';
      } else if (!parceiro.email) {
        result.email = 'sem_email';
      } else {
        const attachments = pdfUrl ? [{ filename: `Fatura_${fatura.codigo}.pdf`, path: pdfUrl }] : [];
        const emailBody = {
          from: emailFrom,
          to: [parceiro.email],
          subject: (assunto || `Fatura ${fatura.codigo} — Certive Vistorias`),
          text: (corpo || `Segue em anexo a fatura ${fatura.codigo}.`),
          attachments
        };
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emailBody)
        });
        result.email = r.ok ? 'enviado' : 'erro';
        if (!r.ok) console.error('Resend erro:', await r.text());
      }
    }

    // ---- WHATSAPP (ZAP-API) — sem cobrança Asaas ----
    if (channels.includes('whatsapp')) {
      if (!zapToken || !zapInstanceId) {
        result.whatsapp = 'sem_config';
      } else if (!parceiro.whatsapp) {
        result.whatsapp = 'sem_whatsapp';
      } else {
        let phone = String(parceiro.whatsapp).replace(/\D/g, '');
        if (phone.length === 10 || phone.length === 11) phone = '55' + phone;

        const mensagem = corpo
          ? corpo
          : `Olá! Segue a fatura ${fatura.codigo} da Certive Vistorias no valor de R$ ${Number(fatura.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Obrigado!`;

        const rTxt = await fetch(`https://api.zap-api.tech/v1/instances/${zapInstanceId}/send`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${zapToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, type: 'text', body: mensagem })
        });

        if (rTxt.ok) {
          result.whatsapp = 'enviado';
          if (pdfUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await fetch(`https://api.zap-api.tech/v1/instances/${zapInstanceId}/send`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${zapToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, type: 'document', document: pdfUrl, fileName: `Fatura_${fatura.codigo}.pdf` })
            });
          }
        } else {
          result.whatsapp = 'erro';
          console.error('ZAP-API erro:', await rTxt.text());
        }
      }
    }

    return new Response(JSON.stringify({ message: 'ok', ...result }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
