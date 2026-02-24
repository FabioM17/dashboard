// supabase/functions/validate-permissions/index.ts
// 
// Edge Function que valida permisos de usuario en BACKEND
// Esto es crítico para seguridad - nunca confiar solo en frontend

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  // Validar que es POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { action, userId, targetUserId, organizationId, newRole } = await req.json();

    // Obtener perfil del usuario que hace la acción
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('role, organization_id')
      .eq('id', userId)
      .single();

    if (userError || !userProfile) {
      return new Response(
        JSON.stringify({ error: 'User not found', authorized: false }),
        { status: 401 }
      );
    }

    // Validar que pertenece a la organización
    if (userProfile.organization_id !== organizationId) {
      return new Response(
        JSON.stringify({ error: 'Organization mismatch', authorized: false }),
        { status: 403 }
      );
    }

    // VALIDACIONES ESPECÍFICAS POR ACCIÓN
    switch (action) {
      case 'delete_user':
        // Solo ADMIN puede eliminar usuarios
        if (userProfile.role !== 'admin') {
          return new Response(
            JSON.stringify({ 
              error: 'Only admins can delete users', 
              authorized: false 
            }),
            { status: 403 }
          );
        }

        // Validar que el target user existe en la organización
        const { data: target } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', targetUserId)
          .eq('organization_id', organizationId)
          .single();

        if (!target) {
          return new Response(
            JSON.stringify({ 
              error: 'Target user not found', 
              authorized: false 
            }),
            { status: 404 }
          );
        }

        return new Response(
          JSON.stringify({ authorized: true, action: 'delete_user' }),
          { status: 200 }
        );

      case 'change_role':
        // Solo ADMIN puede cambiar roles
        if (userProfile.role !== 'admin') {
          return new Response(
            JSON.stringify({ 
              error: 'Only admins can change roles', 
              authorized: false 
            }),
            { status: 403 }
          );
        }

        // Validar que el nuevo rol es válido
        const validRoles = ['admin', 'manager', 'community'];
        if (!validRoles.includes(newRole)) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid role', 
              authorized: false 
            }),
            { status: 400 }
          );
        }

        return new Response(
          JSON.stringify({ authorized: true, action: 'change_role' }),
          { status: 200 }
        );

      case 'view_conversation':
        // Admin: puede ver todas
        if (userProfile.role === 'admin') {
          return new Response(
            JSON.stringify({ authorized: true, action: 'view_conversation' }),
            { status: 200 }
          );
        }

        // Manager: puede ver conversaciones de su equipo
        if (userProfile.role === 'manager') {
          // Validar que la conversación está asignada a su equipo
          const { data: conv } = await supabase
            .from('conversations')
            .select('team_lead_id')
            .eq('id', targetUserId)
            .single();

          if (conv?.team_lead_id === userId) {
            return new Response(
              JSON.stringify({ authorized: true, action: 'view_conversation' }),
              { status: 200 }
            );
          }
        }

        // Community: solo puede ver sus leads asignados
        if (userProfile.role === 'community') {
          const { data: assigned } = await supabase
            .from('user_assigned_leads')
            .select('contact_id')
            .eq('user_id', userId);

          if (assigned && assigned.length > 0) {
            return new Response(
              JSON.stringify({ authorized: true, action: 'view_conversation' }),
              { status: 200 }
            );
          }
        }

        return new Response(
          JSON.stringify({ 
            error: 'Not authorized to view conversation', 
            authorized: false 
          }),
          { status: 403 }
        );

      case 'create_campaign':
        // Solo ADMIN puede crear campañas
        if (userProfile.role !== 'admin') {
          return new Response(
            JSON.stringify({ 
              error: 'Only admins can create campaigns', 
              authorized: false 
            }),
            { status: 403 }
          );
        }

        return new Response(
          JSON.stringify({ authorized: true, action: 'create_campaign' }),
          { status: 200 }
        );

      case 'download_data':
        // Solo ADMIN puede descargar datos
        if (userProfile.role !== 'admin') {
          return new Response(
            JSON.stringify({ 
              error: 'Only admins can download data', 
              authorized: false 
            }),
            { status: 403 }
          );
        }

        return new Response(
          JSON.stringify({ authorized: true, action: 'download_data' }),
          { status: 200 }
        );

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action', authorized: false }),
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in validate-permissions:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', authorized: false }),
      { status: 500 }
    );
  }
});
