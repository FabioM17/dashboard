import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve((_req) => {
  // Inform users that this function was renamed
  return new Response(JSON.stringify({
    error: 'This function has been deprecated. Use the new function `app-notifications` for sending app notification emails.'
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 410 });
});
