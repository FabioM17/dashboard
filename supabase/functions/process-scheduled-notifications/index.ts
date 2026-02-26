import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmailEmail } from "../_shared/emailMessaging.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Obtener pendientes (solo no enviados y no fallidos), ordenados por send_at
    const { data: items, error } = await supabase
      .from('scheduled_notifications')
      .select('*')
      .lte('send_at', new Date().toISOString())
      .eq('sent', false)
      .eq('failed', false)
      .order('send_at', { ascending: true })
      .limit(15);

    if (error) throw error;
    if (!items?.length) {
      return successResponse(0, 0);
    }

    let successCount = 0;
    let failedCount = 0;

    for (const item of items) {
      try {
        // Incrementar intento ANTES de procesar
        await supabase
          .from('scheduled_notifications')
          .update({ attempts: (item.attempts || 0) + 1 })
          .eq('id', item.id);

        if (item.payload?.type !== 'task_due_reminder' || !item.task_id) {
          throw new Error('Invalid payload or missing task_id');
        }

        const { data: task, error: taskErr } = await supabase
          .from('tasks')
          .select('title, due_date, assignee_id, organization_id')
          .eq('id', item.task_id)
          .single();

        if (taskErr || !task?.assignee_id) throw taskErr || new Error('Task not found');

        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', task.assignee_id)
          .single();

        if (profileErr || !profile?.email) throw profileErr || new Error('Profile/email not found');

        const orgId = task.organization_id || item.organization_id;

        // Verificar que Gmail esté configurado para la organización
        const { data: gmailCfg } = await supabase
          .from('integration_settings')
          .select('credentials')
          .eq('organization_id', orgId)
          .eq('service_name', 'gmail')
          .single();

        if (!gmailCfg?.credentials?.access_token) {
          throw new Error('Gmail no configurado para esta organización. Conecta Gmail en Configuración > Channels.');
        }

        // Enviar email usando Gmail API
        const emailResult = await sendGmailEmail(supabase, {
          organizationId: orgId,
          to: profile.email,
          subject: `Recordatorio: ${task.title} vence pronto`,
          body: `
            <p>Hola ${profile.full_name || 'usuario'},</p>
            <p>La tarea <strong>${task.title}</strong> vence el ${new Date(task.due_date).toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
            <p>¡No la dejes para última hora!</p>
          `,
          isHtml: true,
        });

        if (!emailResult.success) {
          throw new Error(emailResult.error || 'Error al enviar email via Gmail');
        }

        // Éxito → marcar enviado
        await supabase
          .from('scheduled_notifications')
          .update({
            sent: true,
            sent_at: new Date().toISOString(),
            failed: false,
            last_error: null,
          })
          .eq('id', item.id);

        successCount++;

      } catch (err: any) {
        const errorMsg = err.message || String(err);

        const attempts = (item.attempts || 0) + 1;
        const maxAttempts = 4;

        await supabase
          .from('scheduled_notifications')
          .update({
            last_error: errorMsg,
            failed: attempts >= maxAttempts,
          })
          .eq('id', item.id);

        if (attempts >= maxAttempts) {
          console.error(`Notificación ${item.id} fallida permanentemente tras ${attempts} intentos: ${errorMsg}`);
        }

        failedCount++;
      }
    }

    return successResponse(successCount, failedCount);

  } catch (err: any) {
    console.error('Error crítico en procesador de recordatorios:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function successResponse(success: number, failed: number) {
  return new Response(
    JSON.stringify({
      success: true,
      processed: success + failed,
      sent: success,
      failed,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}