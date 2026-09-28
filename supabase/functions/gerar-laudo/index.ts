import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FORMATO_RESPOSTA, INSTRUCOES_AGENTE } from "./agente.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PINTURA_ITENS = [
  ["para_choque_diant", "Para-choque dianteiro"], ["capo", "Capô"],
  ["paralama_diant_esq", "Paralama dianteiro esquerdo"], ["coluna_diant_esq", "Coluna dianteira esquerda"],
  ["porta_diant_esq", "Porta dianteira esquerda"], ["coluna_central_esq", "Coluna central esquerda"],
  ["porta_tras_esq", "Porta traseira esquerda"], ["coluna_tras_esq", "Coluna traseira esquerda"],
  ["paralama_tras_esq", "Paralama traseiro esquerdo"], ["tampa_traseira", "Tampa traseira"],
  ["para_choque_tras", "Para-choque traseiro"], ["paralama_tras_dir", "Paralama traseiro direito"],
  ["coluna_tras_dir", "Coluna traseira direita"], ["porta_tras_dir", "Porta traseira direita"],
  ["coluna_central_dir", "Coluna central direita"], ["porta_diant_dir", "Porta dianteira direita"],
  ["coluna_diant_dir", "Coluna dianteira direita"], ["paralama_diant_dir", "Paralama dianteiro direito"],
  ["teto", "Teto"],
] as const;

const CLASSIFICACOES = new Set(["ORIGINAL", "REPINTURA", "REPINTURA COM MASSA", "AVARIADO", "NÃO SE APLICA", "NÃO AVALIADO"]);
const STATUS = new Set(["sucesso", "bloqueado"]);
// O schema do prompt devolve em MAIÚSCULAS (HATCH, SEDAN...); compara sem caixa
const SILHUETAS = new Set(["hatch", "sedan", "suv", "pickup", "van", "minivan", "cupe"]);

// Slots das seções 3 (estrutura) e 5 (vidros), na ordem da captura (app_v8.js)
const SLOTS_ESTRUTURA = [
  "longarina_diant_esq", "torre_amort_diant_esq", "painel_corta_fogo", "torre_amort_diant_dir", "longarina_diant_dir",
  "torre_amort_tras_dir", "longarina_tras_dir", "assoalho_porta_malas", "longarina_tras_esq", "torre_amort_tras_esq",
];
const SLOTS_VIDROS = [
  "vidro_parabrisa", "vidro_porta_diant_esq", "vidro_porta_tras_esq", "vidro_traseiro", "vidro_porta_tras_dir", "vidro_porta_diant_dir",
];
// Fotos em que o agente precisa LER números/etiquetas. Só as de identificação vão em
// alta resolução (custo e tempo); a gravação dos vidros já vem lida pelo vistoriador.
const SLOTS_LEITURA = new Set([
  "placa_dianteira", "painel_hodometro", "crlv_documento", "chassi_gravado", "chassi_secundario", "motor_gravado", "etiqueta_eta",
  ...SLOTS_VIDROS,
]);
const SLOTS_ALTA = new Set(["placa_dianteira", "painel_hodometro", "crlv_documento", "chassi_gravado", "chassi_secundario", "motor_gravado", "etiqueta_eta"]);
// Sem estas o laudo não pode sair: a conferência do servidor bloqueia a emissão
const SLOTS_OBRIGATORIOS: Record<string, string> = {
  placa_dianteira: "placa dianteira", painel_hodometro: "painel com hodômetro", crlv_documento: "documento do veículo",
  chassi_gravado: "número do chassi gravado", motor_gravado: "número do motor",
};

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Limite de duração da Edge Function (~150 s no plano gratuito). O prazo vale para a
// requisição inteira (inclusive a troca de prompt salvo para o local), não por chamada.
const PRAZO_TOTAL_MS = 135_000;

// Os arquivos não são públicos: a OpenAI recebe um link temporário de cada foto
const RE_STORAGE = /\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\/([^?#]+)/;
// deno-lint-ignore no-explicit-any
async function linkTemporario(db: any, url: string): Promise<string> {
  const m = url.match(RE_STORAGE);
  if (!m) return url;
  const { data } = await db.storage.from(m[1]).createSignedUrl(decodeURIComponent(m[2]), 3600);
  return data?.signedUrl || url;
}
const MIN_PARA_REPETIR_MS = 45_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function validarResposta(valor: unknown): string[] {
  const erros: string[] = [];
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return ["A resposta não é um objeto JSON."];
  const r = valor as Record<string, unknown>;
  if (!STATUS.has(String(r.status))) erros.push("status deve ser 'sucesso' ou 'bloqueado'.");
  for (const campo of ["pendencias", "inconsistencias"]) {
    if (!Array.isArray(r[campo]) || !(r[campo] as unknown[]).every((v) => typeof v === "string")) erros.push(`${campo} deve ser uma lista de textos.`);
  }
  if (!r.campos || typeof r.campos !== "object" || Array.isArray(r.campos)) erros.push("campos é obrigatório e deve ser um objeto.");
  if (!r.fotos_laudo || typeof r.fotos_laudo !== "object" || Array.isArray(r.fotos_laudo)) erros.push("fotos_laudo é obrigatório e deve ser um objeto.");
  if (!SILHUETAS.has(String(r.silhueta).toLowerCase())) erros.push("silhueta possui valor inválido.");
  else r.silhueta = String(r.silhueta).toLowerCase();
  if (!Array.isArray(r.pintura_marcadores) || r.pintura_marcadores.length !== 19) {
    erros.push("pintura_marcadores deve conter exatamente 19 itens.");
  } else {
    const numeros = new Set<number>();
    for (const item of r.pintura_marcadores as Record<string, unknown>[]) {
      const numero = Number(item?.numero);
      numeros.add(numero);
      if (!Number.isInteger(numero) || numero < 1 || numero > 19) erros.push("Número inválido em pintura_marcadores.");
      if (!CLASSIFICACOES.has(String(item?.classificacao).toUpperCase())) erros.push(`Classificação inválida no marcador ${numero || "?"}.`);
    }
    if (numeros.size !== 19) erros.push("Os marcadores de pintura devem usar os números 1 a 19 sem repetição.");
  }
  return [...new Set(erros)];
}

async function chamarOpenAI(apiKey: string, body: unknown, prazoFinal: number) {
  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const restante = prazoFinal - Date.now();
    if (restante < 5_000 || (tentativa > 1 && restante < MIN_PARA_REPETIR_MS)) {
      ultimoErro = ultimoErro || "Tempo limite excedido na geração do laudo. Tente novamente.";
      break;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), restante);
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      const texto = await response.text();
      if (response.ok) return JSON.parse(texto);
      ultimoErro = `Serviço de geração respondeu HTTP ${response.status}: ${texto.slice(0, 500)}`;
      if (response.status < 500) break;
    } catch (erro) {
      ultimoErro = erro instanceof DOMException && erro.name === "AbortError" ? "Tempo limite excedido na geração do laudo. Tente novamente." : String(erro);
    } finally { clearTimeout(timer); }
  }
  throw new Error(ultimoErro || "Não foi possível gerar o laudo.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const prazoFinal = Date.now() + PRAZO_TOTAL_MS;
  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const usuarioClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await usuarioClient.auth.getUser();
    if (authError || !user) return json({ erro: "Usuário não autenticado." }, 401);

    const { cautelarId } = await req.json();
    if (!cautelarId) return json({ erro: "cautelarId é obrigatório." }, 400);
    const db = createClient(url, serviceRole);
    const { data: cautelar, error: cautelarErro } = await db.from("cautelares").select("*").eq("id", cautelarId).single();
    if (cautelarErro || !cautelar) return json({ erro: "Vistoria cautelar não encontrada." }, 404);

    const osId = cautelar.osId ?? cautelar.os_id;
    const vistoriadorId = cautelar.vistoriadorId ?? cautelar.vistoriador_id;
    const [osResult, secoesResult, vistoriadorResult] = await Promise.all([
      db.from("ordens_servico").select("id, placa, veiculoChassi, renavam, veiculoMarcaModelo, veiculoAno, veiculoTipo, unidadeId").eq("id", osId).single(),
      db.from("cautelares_secoes").select("*").eq("cautelarId", cautelarId).order("numeroSecao"),
      vistoriadorId ? db.from("operadores").select("id, nome, funcao, unidadeId").eq("id", vistoriadorId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (osResult.error || !osResult.data) throw new Error(`Ordem de serviço indisponível: ${osResult.error?.message || "não encontrada"}`);
    if (secoesResult.error) throw new Error(`Seções indisponíveis: ${secoesResult.error.message}`);
    const secoes = secoesResult.data || [];
    const secaoIds = secoes.map((s) => s.id);
    const [{ data: fotos, error: fotosErro }, { data: unidade }] = await Promise.all([
      secaoIds.length ? db.from("cautelares_fotos").select("id, secaoId, slotCodigo, url_original, metadados").in("secaoId", secaoIds).order("id") : Promise.resolve({ data: [], error: null }),
      db.from("unidades").select("*").eq("id", osResult.data.unidadeId).maybeSingle(),
    ]);
    if (fotosErro) throw new Error(`Fotos indisponíveis: ${fotosErro.message}`);

    let consultaPlaca: unknown = null;
    const { data: pesquisas } = await db.from("cautelares_pesquisas").select("*").eq("cautelarId", cautelarId).order("id", { ascending: false }).limit(1);
    if (pesquisas?.length) consultaPlaca = pesquisas[0].dadosJson ?? pesquisas[0].dados_json ?? pesquisas[0];

    const porNumero = new Map(secoes.map((s) => [Number(s.numeroSecao), s.dadosJson || {}]));
    const d2 = porNumero.get(2) || {};
    const d4 = porNumero.get(4) || {};
    const fotosPacote = (fotos || []).map((f, i) => ({ id: `foto_${i + 1}`, fotoId: f.id, slotCodigo: f.slotCodigo, url_original: f.url_original, metadados: f.metadados || {} }));
    const pacote = {
      cautelar, ordem_servico: osResult.data, unidade, vistoriador: vistoriadorResult.data,
      secoes: Object.fromEntries(secoes.map((s) => [String(s.numeroSecao), s.dadosJson || {}])),
      consulta_placa: consultaPlaca,
      etiquetas: { eta_motor: d2.eta_motor ?? null, eta_coluna: d2.eta_coluna ?? null },
      pintura: PINTURA_ITENS.map(([codigo, nome], i) => ({ numero: i + 1, codigo, nome, micras: d4[`pint_${codigo}_um`] ?? null, classe: d4[`pint_${codigo}_classe`] ?? null, reparo: d4[`pint_${codigo}_reparo`] ?? null })),
      // Por slot, com os mesmos padrões que a tela mostra quando o vistoriador não altera
      // (estrutura "original", gravação do vidro original, sem desbaste).
      vidros: SLOTS_VIDROS.map((slot) => {
        const f = fotosPacote.find((x) => x.slotCodigo === slot);
        const m = (f?.metadados || {}) as Record<string, unknown>;
        return { slotCodigo: slot, fotoId: f?.id ?? null, fotografado: !!f, vidro_original: m.vidro_original !== false, gravacao_lida: m.gravacao_lida ?? null, desbaste: m.desbaste === true };
      }),
      fotos_faltando: [...SLOTS_ESTRUTURA, ...SLOTS_VIDROS, ...SLOTS_LEITURA].filter((slot, i, arr) => arr.indexOf(slot) === i && !fotosPacote.some((f) => f.slotCodigo === slot)),
      estrutura_por_peca: SLOTS_ESTRUTURA.map((slot) => {
        const f = fotosPacote.find((x) => x.slotCodigo === slot);
        const m = (f?.metadados || {}) as Record<string, unknown>;
        return { slotCodigo: slot, fotoId: f?.id ?? null, fotografado: !!f, status_estrutural: m.status_estrutural || "original", observacao: m.observacao_peca ?? null };
      }),
      fotos: fotosPacote.map(({ id, fotoId, slotCodigo, metadados }) => ({ id, fotoId, slotCodigo, metadados })),
    };

    const conteudo: Record<string, unknown>[] = [{ type: "input_text", text: `Gere o laudo cautelar conforme o prompt. Pacote completo da vistoria:\n${JSON.stringify(pacote)}` }];
    for (const foto of fotosPacote.filter((f) => /^https?:\/\//.test(f.url_original || ""))) {
      conteudo.push({ type: "input_text", text: `FOTO ${foto.id} — SLOT ${foto.slotCodigo}` });
      conteudo.push({ type: "input_image", image_url: await linkTemporario(db, foto.url_original), detail: SLOTS_ALTA.has(foto.slotCodigo) ? "high" : "low" });
    }

    // Fotos obrigatórias ausentes no servidor (presas no aparelho ou não tiradas):
    // bloqueia sem gastar a chamada ao gerador.
    const faltando = Object.keys(SLOTS_OBRIGATORIOS).filter((slot) => !fotosPacote.some((f) => f.slotCodigo === slot && /^https?:\/\//.test(f.url_original || "")));
    if (faltando.length) {
      const pendencias = faltando.map((slot) => `Foto obrigatória não está no servidor: ${SLOTS_OBRIGATORIOS[slot]}.`);
      return json({ status: "bloqueado", pendencias, inconsistencias: [], laudoId: null, resposta: null, fotos_faltando: faltando });
    }

    // Mesmo pacote de dados já gerado antes: devolve o registro existente em vez de
    // cobrar de novo (clique repetido, nova tentativa após a tela fechar).
    const impressao = await sha256(JSON.stringify({ pacote, fotos: fotosPacote.map((f) => [f.slotCodigo, f.url_original]) }));
    const { data: anterior } = await db.from("laudos_gerados").select("id, status, resposta")
      .eq("cautelarId", cautelarId).eq("pacoteEnviado->>impressao", impressao).order("id", { ascending: false }).limit(1);
    if (anterior && anterior.length && anterior[0].resposta) {
      const r = anterior[0].resposta as Record<string, unknown>;
      r.fotos_urls = Object.fromEntries(fotosPacote.map((f) => [f.id, f.url_original]));
      return json({ status: anterior[0].status, pendencias: r.pendencias, inconsistencias: r.inconsistencias, laudoId: anterior[0].id, resposta: r, reaproveitado: true });
    }
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("Segredos do gerador de laudos não configurados no servidor.");
    const promptSalvoId = Deno.env.get("OPENAI_PROMPT_ID");
    const promptSalvoVersao = Deno.env.get("OPENAI_PROMPT_VERSION");
    const entrada = [{ role: "user", content: conteudo }];
    // Sem prompt salvo (ou se ele deixar de existir na OpenAI), usa a cópia das
    // instruções e do formato que está no próprio sistema (agente.ts).
    const chamadaLocal = () => chamarOpenAI(apiKey, {
      model: Deno.env.get("OPENAI_MODEL") || "gpt-6-luna",
      instructions: INSTRUCOES_AGENTE,
      text: { format: { type: "json_schema", name: FORMATO_RESPOSTA.name, strict: FORMATO_RESPOSTA.strict, schema: FORMATO_RESPOSTA.schema } },
      reasoning: { effort: "low" },
      input: entrada,
    }, prazoFinal);
    let promptId = "local:agente.ts";
    let promptVersion = "repositorio";
    let respostaApi: Record<string, any>;
    if (promptSalvoId && promptSalvoVersao) {
      try {
        respostaApi = await chamarOpenAI(apiKey, { prompt: { id: promptSalvoId, version: promptSalvoVersao }, input: entrada }, prazoFinal);
        promptId = promptSalvoId;
        promptVersion = promptSalvoVersao;
      } catch (erro) {
        const msg = erro instanceof Error ? erro.message : String(erro);
        if (!/HTTP 4\d\d/.test(msg) || !/prompt/i.test(msg)) throw erro;
        console.warn("Prompt salvo indisponível; usando as instruções do sistema.", msg);
        respostaApi = await chamadaLocal();
      }
    } else {
      respostaApi = await chamadaLocal();
    }
    const texto = respostaApi.output_text || respostaApi.output?.flatMap((o: Record<string, unknown>) => Array.isArray(o.content) ? o.content : []).find((c: Record<string, unknown>) => c.type === "output_text")?.text;
    if (!texto) throw new Error("O serviço retornou uma resposta vazia.");
    let resposta: Record<string, unknown>;
    try { resposta = JSON.parse(texto); } catch { return json({ erro: "Resposta inválida: não foi retornado JSON válido." }, 422); }
    const errosValidacao = validarResposta(resposta);
    if (errosValidacao.length) return json({ erro: "Resposta inválida; o laudo não foi gerado.", detalhes: errosValidacao }, 422);

    const fotosPorId = Object.fromEntries(fotosPacote.map((f) => [f.id, f.url_original]));
    // Guarda junto as URLs das fotos: a reemissão do PDF em outro aparelho usa esta resposta
    resposta.fotos_urls = fotosPorId;
    const pacoteSemImagens = { ...pacote, fotos: pacote.fotos, impressao };
    const { data: registro, error: registroErro } = await db.from("laudos_gerados").insert({
      cautelarId, criadoPor: user.id, promptId, promptVersion,
      modelo: respostaApi.model || null, status: resposta.status,
      resposta, pacoteEnviado: pacoteSemImagens,
    }).select("id").single();
    if (registroErro) throw new Error(`Não foi possível registrar o laudo: ${registroErro.message}`);

    resposta.fotos_urls = fotosPorId;
    return json({ status: resposta.status, pendencias: resposta.pendencias, inconsistencias: resposta.inconsistencias, laudoId: registro.id, resposta });
  } catch (erro) {
    console.error(erro);
    return json({ erro: erro instanceof Error ? erro.message : String(erro) }, 500);
  }
});
