// Cópia das instruções e do formato de resposta do Agente de Laudo Certive.
// Fonte: docs/prompts/agente_laudo_cautelar.md (seções 4 e 5) — mantenha os dois iguais.
// Usada quando não há prompt salvo na OpenAI (OPENAI_PROMPT_ID) ou quando ele deixa
// de existir (a OpenAI anunciou a descontinuação dos "prompt objects").

import agente from "./agente.json" with { type: "json" };

export const INSTRUCOES_AGENTE: string = agente.instrucoes;
export const FORMATO_RESPOSTA = agente.formato as { name: string; strict: boolean; schema: Record<string, unknown> };
