import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const QUEM = 'Asaas (automático)';
const EVENTOS_PAGO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
const EVENTOS_ESTORNO = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE'];

// Dia de hoje em Brasília (YYYY-MM-DD)
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formaDoAsaas(billingType?: string): string {
  const t = String(billingType || '').toUpperCase();
  if (t === 'PIX') return 'pix';
  if (t === 'CREDIT_CARD' || t === 'DEBIT_CARD') return 'cartao';
  return 'transferencia';
}

function brl(v: number): string {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function auditar(acao: string, descricao: string, unidadeId: number | null) {
  const { error } = await supabase.from('auditoria').insert({ operador: QUEM, data: new Date().toISOString(), acao, descricao, unidadeId });
  if (error) console.error('Falha ao registrar auditoria:', error.message);
}

// Fatura da cobrança: pelo id da cobrança e, se ele já tiver sido trocado,
// pela referência externa (id da fatura) que a Certive envia ao Asaas.
async function acharFatura(payment: Record<string, unknown>) {
  const campos = 'id, codigo, "unidadeId", "parceiroId", "valorTotal", "ordensIds", pago, asaas_payment_id';
  const porId = await supabase.from('faturas').select(campos).eq('asaas_payment_id', String(payment.id)).maybeSingle();
  if (porId.data) return porId.data;
  const ref = Number(payment.externalReference);
  if (Number.isFinite(ref) && ref > 0) {
    const porRef = await supabase.from('faturas').select(campos).eq('id', ref).maybeSingle();
    if (porRef.data) return porRef.data;
  }
  return null;
}

async function caixaDeHoje(unidadeId: number) {
  const { data } = await supabase.from('caixa_diario').select('id, status').eq('unidadeId', unidadeId).eq('data', hojeSP()).maybeSingle();
  return data;
}

async function registrarRecebimento(fatura: any, payment: Record<string, unknown>) {
  // Só quem vira a fatura de "em aberto" para "paga" segue: o Asaas manda
  // CONFIRMED e RECEIVED para o mesmo pagamento, e pode repetir o envio.
  const agora = new Date().toISOString();
  const { data: virou, error } = await supabase.from('faturas')
    .update({ pago: true, pagoEm: agora, pagoPor: QUEM })
    .eq('id', fatura.id).eq('pago', false).select('id');
  if (error) throw new Error('Erro ao atualizar fatura: ' + error.message);
  if (!virou || virou.length === 0) return 'ja_estava_paga';

  if (fatura.ordensIds && fatura.ordensIds.length > 0) {
    const { error: e2 } = await supabase.from('ordens_servico').update({ pago: true }).in('id', fatura.ordensIds);
    if (e2) throw new Error('Erro ao atualizar OSs: ' + e2.message);
  }

  const { data: parceiro } = await supabase.from('parceiros').select('nome').eq('id', fatura.parceiroId).maybeSingle();
  const forma = formaDoAsaas(payment.billingType as string);
  const descricao = `Recebimento Fatura ${fatura.codigo} — ${parceiro?.nome || ''} (Asaas)`;

  // Já existe entrada desta fatura (baixa manual antes do aviso)? Não duplica.
  const { data: jaLancada } = await supabase.from('caixa_movimentos').select('id').eq('faturaId', fatura.id).eq('tipo', 'entrada').limit(1);
  if (jaLancada && jaLancada.length) return 'paga_ja_lancada';

  const caixa = await caixaDeHoje(fatura.unidadeId);
  if (caixa && caixa.status === 'aberto') {
    const { error: e3 } = await supabase.from('caixa_movimentos').insert({
      caixaId: caixa.id, tipo: 'entrada', valor: fatura.valorTotal, descricao, formaPagamento: forma,
      data: agora, operador: QUEM, osId: null, faturaId: fatura.id,
    });
    if (e3) throw new Error('Erro ao lançar no caixa: ' + e3.message);
    await auditar('Faturamento Baixa', `Fatura ${fatura.codigo} (${brl(fatura.valorTotal)}) paga pelo Asaas; entrada lançada no caixa de hoje.`, fatura.unidadeId);
    return 'paga_lancada';
  }

  // Caixa de hoje fechado ou não aberto: fica pendente para o Master lançar
  const { error: e4 } = await supabase.from('baixas_faturas_pendentes').insert({
    faturaId: fatura.id, caixaId: caixa ? caixa.id : null, unidadeId: fatura.unidadeId,
    valor: fatura.valorTotal, dataPagamento: hojeSP(), formaPagamento: forma,
    descricao: descricao + ' — caixa fechado na hora do aviso', resolvido: false,
    criadoEm: agora, criadoPor: QUEM,
  });
  if (e4) throw new Error('Erro ao registrar pendência: ' + e4.message);
  await auditar('Faturamento Baixa', `Fatura ${fatura.codigo} (${brl(fatura.valorTotal)}) paga pelo Asaas com o caixa fechado; pendência criada para lançamento.`, fatura.unidadeId);
  return 'paga_pendente';
}

async function registrarEstorno(fatura: any, evento: string) {
  if (!fatura.pago) {
    await auditar('Faturamento Estorno', `Asaas avisou ${evento} da fatura ${fatura.codigo}, que não constava paga.`, fatura.unidadeId);
    return 'nao_estava_paga';
  }
  const { data: voltou, error } = await supabase.from('faturas')
    .update({ pago: false, pagoEm: null, pagoPor: null })
    .eq('id', fatura.id).eq('pago', true).select('id');
  if (error) throw new Error('Erro ao reabrir fatura: ' + error.message);
  if (!voltou || voltou.length === 0) return 'ja_estornada';
  if (fatura.ordensIds && fatura.ordensIds.length > 0) {
    await supabase.from('ordens_servico').update({ pago: false }).in('id', fatura.ordensIds);
  }
  // Pendência de lançamento ainda não resolvida perde o sentido
  await supabase.from('baixas_faturas_pendentes')
    .update({ resolvido: true, resolvidoEm: new Date().toISOString(), resolvidoPor: QUEM + ' — estornada' })
    .eq('faturaId', fatura.id).eq('resolvido', false);

  const { data: entrada } = await supabase.from('caixa_movimentos').select('id, formaPagamento').eq('faturaId', fatura.id).eq('tipo', 'entrada').limit(1);
  if (entrada && entrada.length) {
    const caixa = await caixaDeHoje(fatura.unidadeId);
    if (caixa && caixa.status === 'aberto') {
      await supabase.from('caixa_movimentos').insert({
        caixaId: caixa.id, tipo: 'saida', valor: fatura.valorTotal,
        descricao: `Estorno Asaas da Fatura ${fatura.codigo} (${evento})`, formaPagamento: entrada[0].formaPagamento,
        data: new Date().toISOString(), operador: QUEM, osId: null, faturaId: fatura.id,
      });
      await auditar('Faturamento Estorno', `Fatura ${fatura.codigo} estornada no Asaas (${evento}); saída de ${brl(fatura.valorTotal)} lançada no caixa de hoje e fatura reaberta.`, fatura.unidadeId);
      return 'estornada_lancada';
    }
    await auditar('Faturamento Estorno', `Fatura ${fatura.codigo} estornada no Asaas (${evento}) com o caixa fechado: lançar a saída de ${brl(fatura.valorTotal)} manualmente. Fatura reaberta.`, fatura.unidadeId);
    return 'estornada_sem_caixa';
  }
  await auditar('Faturamento Estorno', `Fatura ${fatura.codigo} estornada no Asaas (${evento}); fatura reaberta.`, fatura.unidadeId);
  return 'estornada';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Validação do token do Asaas
    const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
    if (expectedToken) {
      const receivedToken = req.headers.get('asaas-access-token');
      if (receivedToken !== expectedToken) {
        console.warn('Tentativa de acesso negada: Token do Asaas inválido.');
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const payload = await req.json();
    const evento = String(payload.event || '');
    const payment = payload.payment || {};
    console.log('Webhook Asaas Recebido:', evento, payment.id);

    const interessa = EVENTOS_PAGO.includes(evento) || EVENTOS_ESTORNO.includes(evento) || evento === 'PAYMENT_DELETED';
    if (!interessa) return json({ received: true, ignorado: evento });
    if (!payment.id) return json({ received: true, ignorado: 'sem id de pagamento' });

    const fatura = await acharFatura(payment);
    if (!fatura) {
      // 200 para o Asaas não ficar repetindo (e travar a fila) por uma cobrança
      // que não é de fatura da Certive
      console.warn('Fatura não encontrada para o payment:', payment.id);
      return json({ received: true, ignorado: 'fatura não encontrada' });
    }

    let resultado = '';
    if (EVENTOS_PAGO.includes(evento)) {
      resultado = await registrarRecebimento(fatura, payment);
    } else if (EVENTOS_ESTORNO.includes(evento)) {
      resultado = await registrarEstorno(fatura, evento);
    } else if (evento === 'PAYMENT_DELETED') {
      // Cobrança apagada no Asaas: a fatura em aberto fica sem cobrança
      if (!fatura.pago && fatura.asaas_payment_id === String(payment.id)) {
        await supabase.from('faturas').update({ asaas_payment_id: null, asaas_url: null }).eq('id', fatura.id);
        await auditar('Faturamento Asaas', `Cobrança da fatura ${fatura.codigo} foi excluída no Asaas; a fatura segue em aberto, sem cobrança.`, fatura.unidadeId);
        resultado = 'cobranca_removida';
      } else {
        resultado = 'nada_a_fazer';
      }
    }

    console.log(`Fatura ${fatura.id}: ${evento} -> ${resultado}`);
    return json({ received: true, resultado });
  } catch (err: any) {
    console.error('Erro no processamento do webhook:', err);
    // Erro de banco: 500 para o Asaas tentar de novo depois
    return json({ error: err.message }, 500);
  }
});
