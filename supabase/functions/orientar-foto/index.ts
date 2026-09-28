// Orientação das fotos de identificação (chassi, motor, etiquetas, vidros, placa, painel, documento).
// O celular já grava a foto em pé pelo sensor de posição; esta função é a checagem redundante:
// duas análises independentes da imagem, e a rotação só é indicada quando as duas concordam.
// A chave da OpenAI fica só no servidor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROTACOES = [0, 90, 180, 270];

const INSTRUCOES = `Você confere a orientação de fotos de vistoria veicular que contêm informação de identificação
(número de chassi gravado, número do motor, etiquetas, gravação nos vidros, placa, painel, documento do veículo).
Olhe o texto/número principal da foto e diga quantos graus a IMAGEM precisa ser girada no sentido HORÁRIO para
que esse texto fique na horizontal, de cabeça para cima e legível da esquerda para a direita:
- 0: já está correto;
- 90: o texto está deitado, lido de baixo para cima (topo das letras apontando para a esquerda);
- 180: o texto está de cabeça para baixo;
- 270: o texto está deitado, lido de cima para baixo (topo das letras apontando para a direita).
Informe em "texto_lido" o trecho que você conseguiu ler (ou vazio) e em "confianca" o quanto tem certeza.
Se não houver texto legível, responda rotacao 0 e confianca "baixa".`;

const FORMATO = {
  type: "json_schema",
  name: "orientacao_foto",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["rotacao", "confianca", "texto_lido"],
    properties: {
      rotacao: { type: "integer", enum: ROTACOES },
      confianca: { type: "string", enum: ["alta", "media", "baixa"] },
      texto_lido: { type: "string" },
    },
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function analisar(apiKey: string, imagem: string, slot: string, detalhe: "high" | "low") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL_ORIENTACAO") || Deno.env.get("OPENAI_MODEL") || "gpt-6-luna",
        instructions: INSTRUCOES,
        reasoning: { effort: "low" },
        text: { format: FORMATO },
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: `Foto do slot ${slot}. Qual rotação horária deixa o texto principal na horizontal e legível?` },
            { type: "input_image", image_url: imagem, detail: detalhe },
          ],
        }],
      }),
    });
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${texto.slice(0, 300)}`);
    const api = JSON.parse(texto);
    const saida = api.output_text || api.output?.flatMap((o: Record<string, unknown>) => Array.isArray(o.content) ? o.content : [])
      .find((c: Record<string, unknown>) => c.type === "output_text")?.text;
    const r = JSON.parse(saida || "{}");
    if (!ROTACOES.includes(Number(r.rotacao))) throw new Error("Resposta sem rotação válida");
    return { rotacao: Number(r.rotacao), confianca: String(r.confianca || "baixa"), texto_lido: String(r.texto_lido || "") };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    const usuarioClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await usuarioClient.auth.getUser();
    if (authError || !user) return json({ erro: "Usuário não autenticado." }, 401);

    const { imagem, slot } = await req.json();
    if (typeof imagem !== "string" || !/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(imagem)) {
      return json({ erro: "Envie a imagem como data URL (jpeg/png/webp) ou URL https." }, 400);
    }
    if (imagem.length > 4_000_000) return json({ erro: "Imagem grande demais para a checagem de orientação." }, 413);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ erro: "Chave do serviço de análise não configurada no servidor." }, 500);

    // Duas análises independentes (resolução alta e baixa): só indica rotação se concordarem
    const [a, b] = await Promise.all([
      analisar(apiKey, imagem, String(slot || ""), "high"),
      analisar(apiKey, imagem, String(slot || ""), "low").catch(() => null),
    ]);
    const concordam = !!b && a.rotacao === b.rotacao;
    const confiavel = a.confianca !== "baixa" && (!b || b.confianca !== "baixa");
    const rotacao = concordam && confiavel ? a.rotacao : 0;
    const incerta = !concordam || !confiavel;
    return json({ rotacao, incerta, analises: [a, b], texto_lido: a.texto_lido });
  } catch (erro) {
    console.error(erro);
    return json({ erro: erro instanceof Error ? erro.message : String(erro) }, 500);
  }
});
