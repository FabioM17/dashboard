
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface InviteRequestBody {
  email: string;
  name: string;
  role?: string;
  organization_id: string;
  phone?: string;
  redirect_to?: string;
}

interface InviteOptions {
  data: {
    full_name: string;
    organization_id: string;
    role: string;
  };
  redirectTo?: string;
}

interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  organization_id: string;
  role: string;
  avatar_url: string;
  phone?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const parseAllowedRedirects = (): string[] => {
  return ['https://dashboardchat.docreativelatam.com']
}

const isAllowedRedirect = (url: string, allowed: string[]): boolean => {
  try {
    const candidate = new URL(url)
    return allowed.some((value) => {
      try {
        const allowedUrl = new URL(value)
        return candidate.origin === allowedUrl.origin && candidate.pathname.startsWith(allowedUrl.pathname)
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Necesario para invitar usuarios
    )

    const { email, name, role, organization_id, phone, redirect_to } = await req.json()
    const allowedRedirects = parseAllowedRedirects()
    const defaultRedirect = allowedRedirects[0]

    // ✅ SEGURIDAD: Validaciones requeridas
    if (!email || !organization_id) {
        throw new Error("Email and Organization ID are required")
    }

    // ✅ SEGURIDAD: Validar que organization_id sea un UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(organization_id)) {
        throw new Error("Invalid organization ID format")
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
        throw new Error("Invalid email format")
    }

    // Validar formato de teléfono si se proporciona (debe ser E.164)
    if (phone) {
        const phoneRegex = /^\+[1-9]\d{1,14}$/
        if (!phoneRegex.test(phone)) {
            throw new Error("Invalid phone format. Use international format (E.164), e.g., +54911...")
        }
    }

    // ✅ SEGURIDAD: Validar que el role sea válido
    const validRoles = ['admin', 'manager', 'community']
    if (role && !validRoles.includes(role)) {
        throw new Error("Invalid role. Must be admin, manager, or community")
    }

    // 1. Invitar usuario en Supabase Auth
    // Esto envía un email al usuario con un link mágico para establecer su contraseña
    const inviteOptions: InviteOptions = {
        data: { 
            full_name: name,
            organization_id: organization_id,
            role: role || 'community'
        }
    }

    // Agregar redirect_to solo si está en allowlist
    if (redirect_to && isAllowedRedirect(redirect_to, allowedRedirects)) {
      inviteOptions.redirectTo = redirect_to
    } else if (defaultRedirect) {
      inviteOptions.redirectTo = defaultRedirect
    }

    const { data: authData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email, 
        inviteOptions
    )

    if (inviteError) {
        console.error("Auth Invite Error:", inviteError)
        throw new Error(`Failed to invite user: ${inviteError.message}`)
    }

    if (!authData?.user) {
        throw new Error("No user data returned from auth invite")
    }

    const newUserId = authData.user.id

    // 2. Crear o Actualizar el Perfil en la tabla 'profiles'
    // ✅ SEGURIDAD: El perfil incluye organization_id que se usa para RLS policies
    const profileData: ProfileData = {
        id: newUserId,
        email: email,
        full_name: name || email.split('@')[0],
        organization_id: organization_id,  // ✅ Crucial: vinculado a la organización
        role: role || 'community',
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email)}&background=random`
    }

    // Agregar teléfono si se proporciona
    if (phone) {
        profileData.phone = phone
    }

    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profileData, {
            onConflict: 'id'
        })

    if (profileError) {
        console.error("Profile Error:", profileError)
        throw new Error(`Failed to create profile: ${profileError.message}`)
    }

    // ✅ SEGURIDAD: Log de auditoría para invitaciones
    console.log(`✅ User invited successfully: ${email} (${newUserId}) to organization: ${organization_id}`)

    return new Response(
      JSON.stringify({ 
          message: "User invited successfully", 
          userId: newUserId,
          email: email,
          name: name,
          phone: phone || null,
          organization_id: organization_id  // Confirmamos la organización en respuesta
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error) {
    console.error("Invite User Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to invite user"
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    )
  }
})