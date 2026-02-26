import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppTemplate } from "../_shared/workflowMessaging.ts";
import { sendGmailEmail, replaceMergeTags } from "../_shared/emailMessaging.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: process-workflows
 * 
 * Triggered by pg_cron every minute.
 * Processes pending workflow enrollments where next_send_at <= NOW and status = 'active'.
 * 
 * Status codes:
 * - 204: Nothing to process (idle)
 * - 200: Processed enrollments successfully
 * - 207: Partial success (some failed)
 * - 500: Critical error
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // ==========================================
    // 1. FETCH PENDING ENROLLMENTS
    // ==========================================
    const now = new Date().toISOString();
    
    const { data: enrollments, error: fetchError } = await supabase
      .from('workflow_enrollments')
      .select(`
        id,
        workflow_id,
        contact_id,
        organization_id,
        current_step,
        status,
        enrolled_at,
        next_send_at,
        retry_count,
        workflows:workflow_id (
          id, name, is_active, list_id
        )
      `)
      .eq('status', 'active')
      .lte('next_send_at', now)
      .order('next_send_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error(`[process-workflows] ❌ Error fetching enrollments:`, fetchError);
      throw fetchError;
    }

    // ==========================================
    // 2. NOTHING TO DO → 204
    // ==========================================
    if (!enrollments || enrollments.length === 0) {
      // 204 No Content — must have null body (HTTP spec / Deno enforced)
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    // ==========================================
    // 3. PROCESS EACH ENROLLMENT
    // ==========================================
    console.log(`\n[process-workflows] ▶▶▶ PROCESSING ${enrollments.length} enrollments at ${now}`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const results: Array<{ enrollment_id: string; contact_id: string; status: string; detail: string }> = [];

    for (const enrollment of enrollments) {
      const workflow = enrollment.workflows as any;
      const wfName = workflow?.name || 'desconocido';
      const logPrefix = `[enrollment:${enrollment.id.slice(0,8)}][wf:"${wfName}"]`;

      try {
        // ---- Check workflow is still active ----
        if (!workflow?.is_active) {
          const reason = `Workflow "${wfName}" (${enrollment.workflow_id}) está inactivo (is_active=false). El enrollment fue pausado.`;
          console.warn(`${logPrefix} ⏸️ SKIPPED — ${reason}`);
          await supabase
            .from('workflow_enrollments')
            .update({ status: 'paused', last_error: reason })
            .eq('id', enrollment.id);
          skipped++;
          results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'paused', detail: reason });
          continue;
        }

        // ---- Get current step ----
        const { data: step, error: stepError } = await supabase
          .from('workflow_steps')
          .select(`
            id, step_order, delay_days, send_time, template_name, channel,
            email_subject, email_body, variable_mappings,
            meta_templates:template_id (id, name, body, language, status)
          `)
          .eq('workflow_id', enrollment.workflow_id)
          .eq('step_order', enrollment.current_step)
          .single();

        if (stepError || !step) {
          const reason = `Paso ${enrollment.current_step} no encontrado en workflow "${wfName}". Puede que se hayan eliminado los pasos.`;
          console.error(`${logPrefix} ❌ ${reason}`);
          await markFailed(supabase, enrollment.id, reason);
          failed++;
          results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'failed', detail: reason });
          continue;
        }

        const stepChannel = step.channel || 'whatsapp';
        const template = step.meta_templates as any;
        console.log(`${logPrefix} 📋 Step ${enrollment.current_step}: channel=${stepChannel}, template=${template?.name || 'N/A'}, email_subject=${step.email_subject ? 'yes' : 'no'}`);

        // Validate channel-specific requirements
        if (stepChannel === 'whatsapp' && (!template || template.status !== 'approved')) {
          const reason = `Template "${template?.name || 'no asignado'}" no está aprobado (status=${template?.status || 'null'}). Ve a Settings → Sync Templates.`;
          console.error(`${logPrefix} ❌ ${reason}`);
          await markFailed(supabase, enrollment.id, reason);
          failed++;
          results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'failed', detail: reason });
          continue;
        }
        if (stepChannel === 'email' && (!step.email_subject || !step.email_body)) {
          const reason = `Paso ${enrollment.current_step} de email sin asunto o cuerpo configurado.`;
          console.error(`${logPrefix} ❌ ${reason}`);
          await markFailed(supabase, enrollment.id, reason);
          failed++;
          results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'failed', detail: reason });
          continue;
        }

        // ---- Get contact ----
        const { data: contact, error: contactError } = await supabase
          .from('crm_contacts')
          .select('id, name, email, phone, company, custom_properties')
          .eq('id', enrollment.contact_id)
          .single();

        if (contactError || !contact) {
          console.error(`${logPrefix} ❌ Contact not found: ${enrollment.contact_id}`);
          await markFailed(supabase, enrollment.id, 'Contacto no encontrado');
          failed++;
          results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'failed', detail: 'Contact not found' });
          continue;
        }

        if (!contact.phone && stepChannel === 'whatsapp') {
          const reason = `Contacto "${contact.name}" (${contact.id}) no tiene teléfono. Se requiere para envío WhatsApp.`;
          console.error(`${logPrefix} ❌ ${reason}`);
          await markFailed(supabase, enrollment.id, reason);
          failed++;
          results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'failed', detail: reason });
          continue;
        }

        if (!contact.email && stepChannel === 'email') {
          const reason = `Contacto "${contact.name}" (${contact.id}) no tiene email. Se requiere para envío por correo.`;
          console.error(`${logPrefix} ❌ ${reason}`);
          await markFailed(supabase, enrollment.id, reason);
          failed++;
          results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'failed', detail: reason });
          continue;
        }

        // Verificar que Gmail esté configurado antes de intentar enviar email
        if (stepChannel === 'email') {
          const { data: gmailCfg } = await supabase
            .from('integration_settings')
            .select('credentials')
            .eq('organization_id', enrollment.organization_id)
            .eq('service_name', 'gmail')
            .single();

          if (!gmailCfg?.credentials?.access_token) {
            const reason = 'Gmail no está configurado para esta organización. Conecta tu cuenta de Google en Configuración > Channels > Gmail.';
            console.error(`${logPrefix} ❌ ${reason}`);
            await markFailed(supabase, enrollment.id, reason);
            failed++;
            results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'failed', detail: reason });
            continue;
          }
        }

        // ---- SEND MESSAGE (WhatsApp or Email) ----
        let sendResult: { success: boolean; messageId?: string; error?: string };

        if (stepChannel === 'email') {
          console.log(`${logPrefix} 📧 Sending EMAIL step ${enrollment.current_step} to ${contact.name} (${contact.email})`);
          const personalizedSubject = replaceMergeTags(step.email_subject!, contact);
          const personalizedBody = replaceMergeTags(step.email_body!, contact);
          sendResult = await sendGmailEmail(supabase, {
            organizationId: enrollment.organization_id,
            to: contact.email,
            subject: personalizedSubject,
            body: personalizedBody,
            isHtml: true,
          });
        } else {
          console.log(`${logPrefix} 📤 Sending WA step ${enrollment.current_step} to ${contact.name} (${contact.phone}) - template: "${template.name}"`);
          const stepMappings = Array.isArray(step.variable_mappings) ? step.variable_mappings : [];
          sendResult = await sendWhatsAppTemplate(supabase, {
            organizationId: enrollment.organization_id,
            contact: {
              id: contact.id,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              company: contact.company,
              custom_properties: contact.custom_properties
            },
            template: {
              id: template.id,
              name: template.name,
              body: template.body,
              language: template.language
            },
            variableMappings: stepMappings,
            metadata: {
              workflow_id: enrollment.workflow_id,
              workflow_name: workflow.name,
              enrollment_id: enrollment.id,
              step_order: enrollment.current_step
            }
          });
        }

        if (sendResult.success) {
          console.log(`${logPrefix} ✅ SENT! wamid=${sendResult.messageId}`);

          // Check for next step
          const { data: nextStep } = await supabase
            .from('workflow_steps')
            .select('step_order, delay_days, send_time')
            .eq('workflow_id', enrollment.workflow_id)
            .eq('step_order', enrollment.current_step + 1)
            .single();

          if (nextStep) {
            // Advance to next step
            const nextSendAt = calculateNextSendAt(nextStep.delay_days || 0, nextStep.send_time);

            await supabase
              .from('workflow_enrollments')
              .update({
                current_step: nextStep.step_order,
                next_send_at: nextSendAt.toISOString(),
                retry_count: 0,
                last_error: null
              })
              .eq('id', enrollment.id);

            console.log(`${logPrefix} ➡️ Advanced to step ${nextStep.step_order}, next send: ${nextSendAt.toISOString()}`);
            results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'sent_advanced', detail: `Step ${enrollment.current_step} sent, advancing to ${nextStep.step_order}` });
          } else {
            // Last step - mark completed
            await supabase
              .from('workflow_enrollments')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                last_error: null
              })
              .eq('id', enrollment.id);

            console.log(`${logPrefix} 🏁 COMPLETED - All steps done`);
            results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'completed', detail: `Last step ${enrollment.current_step} sent - workflow complete` });
          }

          sent++;

        } else {
          // ---- SEND FAILED - Handle retry ----
          console.error(`${logPrefix} ❌ Send failed: ${sendResult.error}`);

          const newRetryCount = (enrollment.retry_count || 0) + 1;
          const maxRetries = 3;

          if (newRetryCount >= maxRetries) {
            await markFailed(supabase, enrollment.id, `Max reintentos (${maxRetries}): ${sendResult.error}`);
            console.log(`${logPrefix} ☠️ MAX RETRIES (${maxRetries}) - Marking failed`);
            results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'max_retries', detail: sendResult.error || 'Unknown' });
          } else {
            // Exponential backoff: 5min, 15min, 30min
            const retryMinutes = [5, 15, 30][newRetryCount - 1] || 30;
            const nextRetry = new Date();
            nextRetry.setMinutes(nextRetry.getMinutes() + retryMinutes);

            await supabase
              .from('workflow_enrollments')
              .update({
                retry_count: newRetryCount,
                next_send_at: nextRetry.toISOString(),
                last_error: sendResult.error || 'Send failed'
              })
              .eq('id', enrollment.id);

            console.log(`${logPrefix} 🔄 Retry ${newRetryCount}/${maxRetries} scheduled at ${nextRetry.toISOString()} (+${retryMinutes}min)`);
            results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'retry_scheduled', detail: `Retry ${newRetryCount} in ${retryMinutes}min` });
          }

          failed++;
        }

      } catch (err: any) {
        console.error(`${logPrefix} ❌ Exception:`, err);
        await markFailed(supabase, enrollment.id, String(err));
        failed++;
        results.push({ enrollment_id: enrollment.id, contact_id: enrollment.contact_id, status: 'exception', detail: String(err) });
      }
    }

    // ==========================================
    // 4. SUMMARY
    // ==========================================
    const elapsed = Date.now() - startTime;
    const summary = {
      status: failed > 0 && sent > 0 ? 'partial' : (failed > 0 ? 'failed' : 'success'),
      processed: enrollments.length,
      sent,
      failed,
      skipped,
      elapsed_ms: elapsed,
      timestamp: new Date().toISOString(),
      results
    };

    console.log(`\n[process-workflows] ◀◀◀ DONE in ${elapsed}ms: sent=${sent}, failed=${failed}, skipped=${skipped}`);
    if (results.length > 0) {
      console.log(`[process-workflows] 📊 Detalle de cada enrollment:`);
      for (const r of results) {
        console.log(`  → [${r.status}] enrollment=${r.enrollment_id.slice(0,8)} contact=${r.contact_id.slice(0,8)}: ${r.detail}`);
      }
    }

    // Use different status codes so pg_cron invocations show distinction
    const httpStatus = failed > 0 && sent > 0 ? 207 : (failed > 0 && sent === 0 ? 422 : 200);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: httpStatus }
    );

  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[process-workflows] 💥 CRITICAL ERROR (${elapsed}ms):`, err);
    return new Response(
      JSON.stringify({ status: 'error', error: String(err), elapsed_ms: elapsed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Mark enrollment as failed with error message
 */
async function markFailed(supabase: any, enrollmentId: string, errorMsg: string) {
  await supabase
    .from('workflow_enrollments')
    .update({ 
      status: 'failed', 
      last_error: errorMsg 
    })
    .eq('id', enrollmentId);
}

/**
 * Calculate next_send_at based on delay_days and optional send_time (HH:MM in UTC).
 * send_time is the hour of day (UTC) to send. delay_days is added from now.
 * If send_time is null, send ASAP after delay_days.
 */
function calculateNextSendAt(delayDays: number, sendTime?: string | null): Date {
  const now = new Date();

  if (!sendTime || !/^\d{2}:\d{2}$/.test(sendTime)) {
    if (delayDays > 0) now.setDate(now.getDate() + delayDays);
    console.log(`[calculateNextSendAt] delay=${delayDays}d, no time, result=${now.toISOString()}`);
    return now;
  }

  const [h, m] = sendTime.split(':').map(Number);
  const target = new Date(now);
  target.setDate(target.getDate() + delayDays);
  target.setUTCHours(h, m, 0, 0);

  if (delayDays === 0 && target <= now) {
    target.setDate(target.getDate() + 1);
  }

  console.log(`[calculateNextSendAt] delay=${delayDays}d, time=${sendTime} UTC, result=${target.toISOString()}`);
  return target;
}