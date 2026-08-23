// Envia notificações push (Web Push) para os dispositivos dos administradores.
// Recebe { titulo, corpo, url } e dispara para todas as inscrições isAdmin=true.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chaves VAPID (par público/privado deste projeto)
const VAPID_PUBLIC = "BJwcPrBYbxtqLjAiiz3ukOGa-fg9MdpXQDwATjJCCvnb7yRo9DINEYRXvJlmuKaTEHksvTn6mjpuAA2z-LSCsGM";
const VAPID_PRIVATE = "WRoZ_lyE4gS2CuAHsfaZwv8327jXvacg67Ym5O4f4lI";

webpush.setVapidDetails("mailto:rbaggiofilho@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const titulo = body.titulo || "Certive Vistorias";
    const corpo = body.corpo || "";
    const url = body.url || "/app.html";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("isAdmin", true);

    if (error) throw error;

    const payload = JSON.stringify({ title: titulo, body: corpo, url });
    let enviados = 0, falhas = 0;

    for (const s of subs || []) {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(subscription, payload);
        enviados++;
      } catch (e) {
        falhas++;
        const code = (e && (e.statusCode || e.status)) || 0;
        if (code === 404 || code === 410) {
          // inscrição expirada/inválida -> remove
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("Falha ao enviar push:", code, e?.body || e?.message || String(e));
        }
      }
    }

    return new Response(JSON.stringify({ enviados, falhas, total: (subs || []).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
