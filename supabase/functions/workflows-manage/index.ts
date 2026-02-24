import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: workflows-manage
 * CRUD + enrollment para workflows automáticos
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  console.log(`[workflows-manage] ▶ Action: ${action}, Method: ${req.method}`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = req.method === 'POST' ? await req.json() : {};
    console.log(`[workflows-manage] Body keys: ${Object.keys(body).join(', ')}`);

    switch (action) {
      case 'create':
        return await createWorkflow(supabase, body);
      case 'update':
        return await updateWorkflow(supabase, body);
      case 'delete':
        return await deleteWorkflow(supabase, body);
      case 'list':
        return await listWorkflows(supabase, body);
      case 'details':
        return await getWorkflowDetails(supabase, url.searchParams.get('id'));
      case 'enroll':
        return await enrollContacts(supabase, body);
      case 'unenroll':
        return await unenrollContact(supabase, body);
      case 'sync-list':
        return await syncListEnrollments(supabase, body);
      default:
        console.error(`[workflows-manage] Invalid action: ${action}`);
        return errorResponse(`Invalid action: ${action}`, 400);
    }

  } catch (err: any) {
    console.error('[workflows-manage] Unhandled error:', err);
    return errorResponse(String(err), 500);
  }
});

// ============================================================
// CREATE WORKFLOW
// ============================================================
async function createWorkflow(supabase: any, body: any) {
  const { organization_id, name, list_id, steps, is_active, created_by } = body;

  console.log(`[workflows-manage:create] org=${organization_id}, name="${name}", list=${list_id}, steps=${steps?.length}, active=${is_active}`);

  if (!organization_id || !name || !list_id || !steps || !Array.isArray(steps)) {
    return errorResponse('Campos requeridos: organization_id, name, list_id, steps', 400);
  }
  if (steps.length === 0) {
    return errorResponse('El workflow debe tener al menos un paso', 400);
  }

  // Validate list exists
  const { data: list, error: listError } = await supabase
    .from('lists')
    .select('id, name')
    .eq('id', list_id)
    .eq('organization_id', organization_id)
    .single();

  if (listError || !list) {
    console.error(`[workflows-manage:create] Lista no encontrada: ${list_id}`, listError);
    return errorResponse('Lista no encontrada', 404);
  }
  console.log(`[workflows-manage:create] Lista válida: "${list.name}"`);

  // Validate steps based on channel
  for (const step of steps) {
    const channel = step.channel || 'whatsapp';

    if (channel === 'whatsapp') {
      // WhatsApp steps require an approved template
      const { data: template, error: templateError } = await supabase
        .from('meta_templates')
        .select('id, name, status')
        .eq('id', step.template_id)
        .eq('organization_id', organization_id)
        .single();

      if (templateError || !template) {
        console.error(`[workflows-manage:create] Template no encontrado: ${step.template_id}`);
        return errorResponse(`Template ${step.template_id} no encontrado`, 404);
      }
      if (template.status !== 'approved') {
        console.error(`[workflows-manage:create] Template "${template.name}" no aprobado (status: ${template.status})`);
        return errorResponse(`Template "${template.name}" no está aprobado por Meta`, 400);
      }
      console.log(`[workflows-manage:create] Template válido: "${template.name}" (approved)`);
    } else if (channel === 'email') {
      // Email steps require subject and body
      if (!step.email_subject || !step.email_body) {
        return errorResponse(`Email step ${step.step_order}: se requiere email_subject y email_body`, 400);
      }
      console.log(`[workflows-manage:create] Email step ${step.step_order} válido`);
    } else {
      return errorResponse(`Canal no soportado: ${channel}`, 400);
    }
  }

  // Create workflow (initially inactive)
  const { data: workflow, error: workflowError } = await supabase
    .from('workflows')
    .insert({
      organization_id,
      name,
      list_id,
      is_active: false,
      created_by
    })
    .select()
    .single();

  if (workflowError) {
    console.error(`[workflows-manage:create] Error creando workflow:`, workflowError);
    return errorResponse(`Error creando workflow: ${workflowError.message}`, 500);
  }
  console.log(`[workflows-manage:create] Workflow creado: ${workflow.id}`);

  // Create steps
  const stepInserts = steps.map((step: any) => {
    const channel = step.channel || 'whatsapp';
    return {
      workflow_id: workflow.id,
      step_order: step.step_order,
      channel,
      template_id: channel === 'whatsapp' ? step.template_id : null,
      template_name: channel === 'whatsapp' ? step.template_name : null,
      email_subject: channel === 'email' ? step.email_subject : null,
      email_body: channel === 'email' ? step.email_body : null,
      variable_mappings: step.variable_mappings || [],
      delay_days: step.delay_days || 0,
      send_time: step.send_time || null
    };
  });

  const { error: stepsError } = await supabase
    .from('workflow_steps')
    .insert(stepInserts);

  if (stepsError) {
    console.error(`[workflows-manage:create] Error creando pasos:`, stepsError);
    await supabase.from('workflows').delete().eq('id', workflow.id);
    return errorResponse(`Error creando pasos: ${stepsError.message}`, 500);
  }
  console.log(`[workflows-manage:create] ${stepInserts.length} pasos creados`);

  // If should be active, activate now (triggers enrollment)
  let enrollResult = null;
  if (is_active) {
    console.log(`[workflows-manage:create] Activando workflow y enrollando contactos...`);
    enrollResult = await activateAndEnroll(supabase, workflow.id, organization_id, list_id);
    console.log(`[workflows-manage:create] Enrollment result: ${JSON.stringify(enrollResult)}`);
  }

  const { data: finalWorkflow } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflow.id)
    .single();

  return jsonResponse({ 
    workflow: finalWorkflow || workflow,
    enrollment: enrollResult,
    message: `Workflow creado${is_active ? ` - ${enrollResult?.enrolled || 0} contactos enrolados` : ' (inactivo)'}` 
  }, 201);
}

// ============================================================
// UPDATE WORKFLOW
// ============================================================
async function updateWorkflow(supabase: any, body: any) {
  const { workflow_id, organization_id, name, is_active } = body;

  console.log(`[workflows-manage:update] workflow=${workflow_id}, org=${organization_id}, name=${name}, is_active=${is_active}`);

  if (!workflow_id || !organization_id) {
    return errorResponse('Campos requeridos: workflow_id, organization_id', 400);
  }

  // Get current state
  const { data: current, error: currentError } = await supabase
    .from('workflows')
    .select('id, name, is_active, list_id')
    .eq('id', workflow_id)
    .eq('organization_id', organization_id)
    .single();

  if (currentError || !current) {
    console.error(`[workflows-manage:update] Workflow no encontrado:`, currentError);
    return errorResponse('Workflow no encontrado', 404);
  }

  console.log(`[workflows-manage:update] Estado actual: active=${current.is_active}, name="${current.name}"`);

  const wasActive = current.is_active;
  const willBeActive = is_active !== undefined ? is_active : current.is_active;

  // Build updates
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No hay campos para actualizar', 400);
  }

  // If activating, verify steps exist
  if (!wasActive && willBeActive) {
    console.log(`[workflows-manage:update] 🔄 Verificando pasos antes de activar...`);
    const { count: stepCount } = await supabase
      .from('workflow_steps')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_id', workflow_id);

    if (!stepCount || stepCount === 0) {
      console.error(`[workflows-manage:update] ❌ No hay pasos definidos`);
      return errorResponse('No se puede activar: el workflow no tiene pasos definidos', 400);
    }
    console.log(`[workflows-manage:update] ✅ ${stepCount} pasos encontrados`);
  }

  // Update workflow
  const { data: updated, error: updateError } = await supabase
    .from('workflows')
    .update(updates)
    .eq('id', workflow_id)
    .eq('organization_id', organization_id)
    .select()
    .single();

  if (updateError) {
    console.error(`[workflows-manage:update] Error:`, updateError);
    return errorResponse(`Error actualizando: ${updateError.message}`, 500);
  }

  // ACTIVATING: enroll contacts from list
  if (!wasActive && willBeActive) {
    console.log(`[workflows-manage:update] 🟢 ACTIVACIÓN - Reactivando pausados y enrollando nuevos de lista ${current.list_id}...`);

    // 1. Reactivate paused enrollments
    const reactivated = await reactivatePausedEnrollments(supabase, workflow_id);

    // 2. Enroll new contacts from list
    const enrollResult = await activateAndEnroll(supabase, workflow_id, organization_id, current.list_id);
    console.log(`[workflows-manage:update] 📊 Reactivados: ${reactivated}, Nuevos: ${enrollResult.enrolled}`);

    return jsonResponse({ 
      workflow: updated, 
      enrollment: enrollResult,
      reactivated,
      message: `Workflow activado. ${reactivated} reactivados, ${enrollResult.enrolled} nuevos enrolados.`
    });
  }

  // DEACTIVATING: pause active enrollments
  if (wasActive && !willBeActive) {
    console.log(`[workflows-manage:update] 🔴 DESACTIVACIÓN - Pausando enrollments...`);
    const { data: paused } = await supabase
      .from('workflow_enrollments')
      .update({ status: 'paused' })
      .eq('workflow_id', workflow_id)
      .eq('status', 'active')
      .select('id');

    const pausedCount = paused?.length || 0;
    console.log(`[workflows-manage:update] ⏸️ ${pausedCount} enrollments pausados`);
    return jsonResponse({ workflow: updated, message: `Workflow desactivado. ${pausedCount} enrollments pausados.` });
  }

  return jsonResponse({ workflow: updated, message: 'Workflow actualizado' });
}

// ============================================================
// REACTIVATE PAUSED ENROLLMENTS
// ============================================================
async function reactivatePausedEnrollments(supabase: any, workflowId: string): Promise<number> {
  try {
    // Get paused enrollments for this workflow
    const { data: paused, error: fetchError } = await supabase
      .from('workflow_enrollments')
      .select('id, current_step')
      .eq('workflow_id', workflowId)
      .eq('status', 'paused');

    if (fetchError || !paused || paused.length === 0) {
      console.log(`[reactivatePaused] No hay enrollments pausados para reactivar`);
      return 0;
    }

    console.log(`[reactivatePaused] 🔄 ${paused.length} enrollments pausados encontrados`);

    // For each paused enrollment, get its current step to recalculate next_send_at
    let reactivated = 0;
    for (const enrollment of paused) {
      const { data: step } = await supabase
        .from('workflow_steps')
        .select('delay_days, send_time')
        .eq('workflow_id', workflowId)
        .eq('step_order', enrollment.current_step)
        .single();

      // If step no longer exists, mark as failed
      if (!step) {
        await supabase
          .from('workflow_enrollments')
          .update({ status: 'failed', last_error: 'Paso ya no existe al reactivar' })
          .eq('id', enrollment.id);
        continue;
      }

      // Recalculate next_send_at: send ASAP (delay=0 relative to now) but respect send_time if set
      const nextSendAt = calculateNextSendAt(0, step.send_time);

      const { error: updateError } = await supabase
        .from('workflow_enrollments')
        .update({
          status: 'active',
          next_send_at: nextSendAt.toISOString(),
          last_error: null
        })
        .eq('id', enrollment.id);

      if (!updateError) {
        reactivated++;
      } else {
        console.error(`[reactivatePaused] Error reactivando ${enrollment.id}:`, updateError);
      }
    }

    console.log(`[reactivatePaused] ✅ ${reactivated}/${paused.length} reactivados`);
    return reactivated;
  } catch (err: any) {
    console.error(`[reactivatePaused] Exception:`, err);
    return 0;
  }
}

// ============================================================
// ACTIVATE & ENROLL: Resolve list contacts with filters
// ============================================================
async function activateAndEnroll(
  supabase: any, 
  workflowId: string, 
  organizationId: string, 
  listId: string
): Promise<{ enrolled: number; skipped: number; total_in_list: number; errors: string[] }> {
  const errors: string[] = [];
  
  try {
    // 1. Get first step
    const { data: firstStep, error: stepError } = await supabase
      .from('workflow_steps')
      .select('delay_days, send_time')
      .eq('workflow_id', workflowId)
      .eq('step_order', 1)
      .single();

    if (stepError || !firstStep) {
      console.error(`[activateAndEnroll] ❌ Paso 1 no encontrado:`, stepError);
      return { enrolled: 0, skipped: 0, total_in_list: 0, errors: ['No se encontró el primer paso'] };
    }

    console.log(`[activateAndEnroll] Paso 1: delay_days=${firstStep.delay_days}, send_time=${firstStep.send_time}`);

    // 2. Get list
    const { data: list, error: listError } = await supabase
      .from('lists')
      .select('id, name, filters, manual_contact_ids, inactive_contact_ids')
      .eq('id', listId)
      .eq('organization_id', organizationId)
      .single();

    if (listError || !list) {
      console.error(`[activateAndEnroll] ❌ Lista no encontrada:`, listError);
      return { enrolled: 0, skipped: 0, total_in_list: 0, errors: ['Lista no encontrada'] };
    }

    console.log(`[activateAndEnroll] Lista "${list.name}": filtros=${(list.filters || []).length}, manual=${(list.manual_contact_ids || []).length}`);

    // 3. Resolve contacts
    const contactIds = await resolveListContacts(supabase, list, organizationId);
    console.log(`[activateAndEnroll] 📋 Contactos resueltos de la lista: ${contactIds.length}`);

    // Always activate the workflow, regardless of contact count
    await supabase.from('workflows').update({ is_active: true }).eq('id', workflowId);
    console.log(`[activateAndEnroll] ✅ Workflow marcado como is_active=true`);

    if (contactIds.length === 0) {
      return { enrolled: 0, skipped: 0, total_in_list: 0, errors: ['No hay contactos en la lista'] };
    }

    // 4. Skip already enrolled
    const { data: existing } = await supabase
      .from('workflow_enrollments')
      .select('contact_id')
      .eq('workflow_id', workflowId);

    const alreadyEnrolled = new Set((existing || []).map((e: any) => e.contact_id));
    const newIds = contactIds.filter((id: string) => !alreadyEnrolled.has(id));
    const skipped = contactIds.length - newIds.length;

    console.log(`[activateAndEnroll] Nuevos: ${newIds.length}, Ya enrolados: ${skipped}`);

    if (newIds.length === 0) {
      return { enrolled: 0, skipped, total_in_list: contactIds.length, errors: [] };
    }

    // 5. Create enrollments
    const nextSendAt = calculateNextSendAt(firstStep.delay_days, firstStep.send_time);

    const enrollments = newIds.map((contactId: string) => ({
      workflow_id: workflowId,
      contact_id: contactId,
      organization_id: organizationId,
      current_step: 1,
      status: 'active',
      enrolled_at: new Date().toISOString(),
      next_send_at: nextSendAt.toISOString()
    }));

    // Insert in batches
    let totalEnrolled = 0;
    for (let i = 0; i < enrollments.length; i += 100) {
      const batch = enrollments.slice(i, i + 100);
      const { data: inserted, error: insertError } = await supabase
        .from('workflow_enrollments')
        .insert(batch)
        .select('id');

      if (insertError) {
        console.error(`[activateAndEnroll] ❌ Error batch ${i}:`, insertError);
        errors.push(`Batch ${i}: ${insertError.message}`);
      } else {
        totalEnrolled += inserted?.length || 0;
        console.log(`[activateAndEnroll] Batch ${i}: ${inserted?.length} insertados`);
      }
    }

    console.log(`[activateAndEnroll] ✅ Enrolados: ${totalEnrolled}, next_send_at: ${nextSendAt.toISOString()}`);
    return { enrolled: totalEnrolled, skipped, total_in_list: contactIds.length, errors };

  } catch (err: any) {
    console.error(`[activateAndEnroll] Exception:`, err);
    return { enrolled: 0, skipped: 0, total_in_list: 0, errors: [String(err)] };
  }
}

// ============================================================
// SYNC LIST ENROLLMENTS: Called when a list changes (contact added/removed/filter change)
// Finds all active workflows whose list_id matches the given list, then enrolls missing contacts
// ============================================================
async function syncListEnrollments(supabase: any, body: any) {
  const { list_id, organization_id } = body;
  console.log(`[workflows-manage:sync-list] list=${list_id}, org=${organization_id}`);

  if (!list_id || !organization_id) {
    return errorResponse('Campos requeridos: list_id, organization_id', 400);
  }

  // Find all ACTIVE workflows that use this list
  const { data: workflows, error: wfError } = await supabase
    .from('workflows')
    .select('id, name')
    .eq('list_id', list_id)
    .eq('organization_id', organization_id)
    .eq('is_active', true);

  if (wfError) {
    console.error(`[sync-list] Error buscando workflows:`, wfError);
    return errorResponse(`Error: ${wfError.message}`, 500);
  }

  if (!workflows || workflows.length === 0) {
    console.log(`[sync-list] No hay workflows activos para la lista ${list_id}`);
    return jsonResponse({ synced_workflows: 0, total_enrolled: 0 });
  }

  console.log(`[sync-list] ${workflows.length} workflows activos encontrados para la lista`);

  let totalEnrolled = 0;
  const results: Array<{ workflow_id: string; name: string; enrolled: number; skipped: number }> = [];

  for (const wf of workflows) {
    try {
      const result = await activateAndEnroll(supabase, wf.id, organization_id, list_id);
      totalEnrolled += result.enrolled;
      results.push({ workflow_id: wf.id, name: wf.name, enrolled: result.enrolled, skipped: result.skipped });
      console.log(`[sync-list] Workflow "${wf.name}": +${result.enrolled} nuevos, ${result.skipped} ya enrolados`);
    } catch (err: any) {
      console.error(`[sync-list] Error en workflow ${wf.id}:`, err);
      results.push({ workflow_id: wf.id, name: wf.name, enrolled: 0, skipped: 0 });
    }
  }

  console.log(`[sync-list] ✅ Completado: ${totalEnrolled} nuevos enrolados en ${workflows.length} workflows`);
  return jsonResponse({ synced_workflows: workflows.length, total_enrolled: totalEnrolled, results });
}

// ============================================================
// RESOLVE LIST CONTACTS: Evaluate dynamic filters
// ============================================================
async function resolveListContacts(
  supabase: any, 
  list: any, 
  organizationId: string
): Promise<string[]> {
  const filters = list.filters || [];
  const manualIds = list.manual_contact_ids || [];
  const inactiveIds = list.inactive_contact_ids || [];

  let query = supabase
    .from('crm_contacts')
    .select('id')
    .eq('organization_id', organizationId);

  // Apply dynamic filters
  if (filters.length > 0) {
    for (const filter of filters) {
      console.log(`[resolveListContacts] Filtro: ${filter.field} ${filter.comparison} "${filter.value}"`);

      switch (filter.comparison) {
        case 'equals':
          query = query.eq(filter.field, filter.value);
          break;
        case 'contains':
          query = query.ilike(filter.field, `%${filter.value}%`);
          break;
        case 'starts_with':
          query = query.ilike(filter.field, `${filter.value}%`);
          break;
        case 'ends_with':
          query = query.ilike(filter.field, `%${filter.value}`);
          break;
        case 'not_equals':
          query = query.neq(filter.field, filter.value);
          break;
        case 'greater_than':
          query = query.gt(filter.field, filter.value);
          break;
        case 'less_than':
          query = query.lt(filter.field, filter.value);
          break;
        default:
          console.warn(`[resolveListContacts] Comparación desconocida: ${filter.comparison}`);
      }
    }
  }

  const { data: filteredContacts, error } = await query;

  if (error) {
    console.error(`[resolveListContacts] Error query:`, error);
    return [];
  }

  const contactIds = new Set((filteredContacts || []).map((c: any) => c.id));

  // Add manual contacts
  for (const id of manualIds) {
    contactIds.add(id);
  }

  // Remove inactive
  for (const id of inactiveIds) {
    contactIds.delete(id);
  }

  console.log(`[resolveListContacts] Total: ${contactIds.size} (filtro: ${filteredContacts?.length || 0}, manual: ${manualIds.length}, excluidos: ${inactiveIds.length})`);
  return Array.from(contactIds);
}

// ============================================================
// DELETE / LIST / DETAILS / ENROLL / UNENROLL
// ============================================================
async function deleteWorkflow(supabase: any, body: any) {
  const { workflow_id, organization_id } = body;
  console.log(`[workflows-manage:delete] workflow=${workflow_id}`);

  if (!workflow_id || !organization_id) return errorResponse('Faltan campos', 400);

  const { error } = await supabase
    .from('workflows').delete()
    .eq('id', workflow_id).eq('organization_id', organization_id);

  if (error) return errorResponse(`Error: ${error.message}`, 500);

  console.log(`[workflows-manage:delete] ✅ Eliminado`);
  return jsonResponse({ message: 'Workflow eliminado' });
}

async function listWorkflows(supabase: any, body: any) {
  const { organization_id } = body;
  console.log(`[workflows-manage:list] org=${organization_id}`);

  if (!organization_id) return errorResponse('Falta organization_id', 400);

  const { data, error } = await supabase
    .from('workflows')
    .select(`*, lists:list_id (id, name), workflow_steps (count)`)
    .eq('organization_id', organization_id)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(`Error: ${error.message}`, 500);

  const workflowsWithStats = await Promise.all(
    (data || []).map(async (wf: any) => {
      const [activeRes, completedRes, failedRes] = await Promise.all([
        supabase.from('workflow_enrollments').select('id', { count: 'exact', head: true }).eq('workflow_id', wf.id).eq('status', 'active'),
        supabase.from('workflow_enrollments').select('id', { count: 'exact', head: true }).eq('workflow_id', wf.id).eq('status', 'completed'),
        supabase.from('workflow_enrollments').select('id', { count: 'exact', head: true }).eq('workflow_id', wf.id).eq('status', 'failed')
      ]);
      return {
        ...wf,
        stats: {
          active_enrollments: activeRes.count || 0,
          completed_enrollments: completedRes.count || 0,
          failed_enrollments: failedRes.count || 0
        }
      };
    })
  );

  console.log(`[workflows-manage:list] ✅ ${workflowsWithStats.length} workflows`);
  return jsonResponse({ workflows: workflowsWithStats });
}

async function getWorkflowDetails(supabase: any, workflowId: string | null) {
  console.log(`[workflows-manage:details] id=${workflowId}`);
  if (!workflowId) return errorResponse('Falta id', 400);

  const { data: workflow, error } = await supabase
    .from('workflows')
    .select(`*, lists:list_id (id, name, filters, manual_contact_ids), workflow_steps (id, step_order, channel, template_id, template_name, email_subject, email_body, variable_mappings, delay_days, send_time, meta_templates:template_id (id, name, body, language, status))`)
    .eq('id', workflowId).single();

  if (error) return errorResponse('Workflow no encontrado', 404);

  const { data: enrollments } = await supabase
    .from('workflow_enrollments')
    .select(`
      id, workflow_id, contact_id, organization_id, current_step, status, 
      enrolled_at, next_send_at, completed_at, retry_count, last_error,
      crm_contacts:contact_id (id, name, email, phone, company, avatar_url, custom_properties)
    `)
    .eq('workflow_id', workflowId)
    .order('enrolled_at', { ascending: false })
    .limit(200);

  console.log(`[workflows-manage:details] ✅ ${enrollments?.length || 0} enrollments`);
  return jsonResponse({ workflow: { ...workflow, enrollments: enrollments || [] } });
}

async function enrollContacts(supabase: any, body: any) {
  const { workflow_id, organization_id, contact_ids } = body;
  console.log(`[workflows-manage:enroll] workflow=${workflow_id}, contacts=${contact_ids?.length}`);

  if (!workflow_id || !organization_id || !contact_ids?.length) return errorResponse('Faltan campos', 400);

  const { data: firstStep } = await supabase
    .from('workflow_steps').select('delay_days, send_time')
    .eq('workflow_id', workflow_id).eq('step_order', 1).single();
  if (!firstStep) return errorResponse('Workflow sin pasos', 400);

  const nextSendAt = calculateNextSendAt(firstStep.delay_days, firstStep.send_time);

  const enrollments = contact_ids.map((cid: string) => ({
    workflow_id, contact_id: cid, organization_id,
    current_step: 1, status: 'active',
    enrolled_at: new Date().toISOString(), next_send_at: nextSendAt.toISOString()
  }));

  const { data, error } = await supabase
    .from('workflow_enrollments')
    .upsert(enrollments, { onConflict: 'workflow_id,contact_id', ignoreDuplicates: true })
    .select();

  if (error) return errorResponse(`Error: ${error.message}`, 500);

  console.log(`[workflows-manage:enroll] ✅ ${data?.length || 0} enrolados`);
  return jsonResponse({ enrolled: data?.length || 0 });
}

async function unenrollContact(supabase: any, body: any) {
  const { enrollment_id, organization_id } = body;
  if (!enrollment_id || !organization_id) return errorResponse('Faltan campos', 400);

  const { error } = await supabase
    .from('workflow_enrollments').delete()
    .eq('id', enrollment_id).eq('organization_id', organization_id);

  if (error) return errorResponse(`Error: ${error.message}`, 500);

  console.log(`[workflows-manage:unenroll] ✅ Removido`);
  return jsonResponse({ message: 'Contacto removido' });
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Calculate next_send_at based on delay_days and optional send_time (HH:MM in UTC).
 * send_time is the hour of day (UTC) to send. delay_days is added from now.
 * If send_time is null, send ASAP after delay_days.
 */
function calculateNextSendAt(delayDays: number, sendTime?: string | null): Date {
  const now = new Date();

  if (!sendTime || !/^\d{2}:\d{2}$/.test(sendTime)) {
    // No specific time → just add days from now (send ASAP)
    if (delayDays > 0) now.setDate(now.getDate() + delayDays);
    console.log(`[calculateNextSendAt] delay=${delayDays}d, no time, result=${now.toISOString()}`);
    return now;
  }

  const [h, m] = sendTime.split(':').map(Number);
  const target = new Date(now);
  target.setDate(target.getDate() + delayDays);
  target.setUTCHours(h, m, 0, 0); // send_time is already in UTC

  // If delay_days=0 and the time already passed today, schedule for tomorrow
  if (delayDays === 0 && target <= now) {
    target.setDate(target.getDate() + 1);
  }

  console.log(`[calculateNextSendAt] delay=${delayDays}d, time=${sendTime} UTC, result=${target.toISOString()}`);
  return target;
}

function jsonResponse(data: any, status = 200) {
  return new Response(
    JSON.stringify({ success: true, ...data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
  );
}

function errorResponse(message: string, status = 400) {
  console.error(`[workflows-manage] ❌ Error ${status}: ${message}`);
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
  );
}