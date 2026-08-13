// ============================================================
// Edge Function: gerenciar-operador
// ------------------------------------------------------------
// Programa que roda DENTRO do servidor do Supabase.
// É ele que a tela de "Operadores" do sistema chama para criar,
// editar ou trocar a senha de um operador.
//
// SEGURANÇA:
//  - A chave-mestra (service_role) fica SÓ aqui, no servidor.
//    Nunca é enviada ao navegador nem ao código público.
//  - A senha digitada é entregue direto ao Supabase Auth, que a
//    guarda CRIPTOGRAFADA. Ela nunca é gravada em tabela nem lida.
//  - Só um operador ADMIN (permissão "cadastros") consegue usar.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Domínio interno do sistema. O funcionário NUNCA vê isso —
// ele digita só o usuário (ex.: "Jkroll") e a senha.
const EMAIL_DOMAIN = "sistema.certive.com.br";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function emailDoLogin(login: string): string {
  return `${login.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 1) Quem está chamando precisa estar logado...
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ erro: "Não autenticado." }, 401);

    // ...e precisa ser ADMIN (permissão "cadastros").
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: chamador } = await admin
      .from("operadores")
      .select("permissoes, ativo")
      .eq("user_id", user.id)
      .single();

    const ehAdmin =
      chamador?.ativo === true &&
      Array.isArray(chamador?.permissoes) &&
      chamador.permissoes.includes("cadastros");

    if (!ehAdmin) {
      return json({ erro: "Sem permissão para gerenciar operadores." }, 403);
    }

    // 2) Executa a ação pedida
    const body = await req.json();

    switch (body.acao) {
      case "criar": {
        const { nome, login, senha, funcao, unidadeId, permissoes } = body;
        const email = emailDoLogin(login);

        const { data: novo, error: e1 } = await admin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: { login, nome },
        });
        if (e1) return json({ erro: e1.message }, 400);

        const { error: e2 } = await admin.from("operadores").insert({
          user_id: novo.user.id,
          nome,
          login: String(login).toLowerCase(),
          funcao,
          unidadeId: unidadeId ?? null,
          permissoes,
          ativo: true,
        });
        if (e2) {
          // desfaz o usuário do Auth se o perfil falhar
          await admin.auth.admin.deleteUser(novo.user.id);
          return json({ erro: e2.message }, 400);
        }
        return json({ ok: true, user_id: novo.user.id });
      }

      case "atualizar": {
        const { user_id, nome, funcao, unidadeId, permissoes, ativo } = body;
        const { error } = await admin
          .from("operadores")
          .update({ nome, funcao, unidadeId: unidadeId ?? null, permissoes, ativo })
          .eq("user_id", user_id);
        if (error) return json({ erro: error.message }, 400);
        return json({ ok: true });
      }

      case "resetar_senha": {
        const { user_id, senha } = body;
        const { error } = await admin.auth.admin.updateUserById(user_id, {
          password: senha,
        });
        if (error) return json({ erro: error.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
