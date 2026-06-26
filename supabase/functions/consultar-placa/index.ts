import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { placa } = await req.json()

    if (!placa) {
      return new Response(JSON.stringify({ error: 'Placa é obrigatória' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = '08a4e9465a96f471e10a9484d0e14f63';
    const email = 'eddpa18@gmail.com';
    const authBase64 = btoa(`${email}:${token}`);

    const response = await fetch(`https://api.consultarplaca.com.br/v2/consultarPlaca?placa=${placa}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authBase64}`
      }
    });

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
