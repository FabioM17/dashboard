
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

    // ── Check if user already exists in auth ──
    // Search by email to see if they already have an account
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    )

    let userId: string
    let isExistingUser = false

    if (existingUser) {
      // ── EXISTING USER: Just add membership, don't re-invite ──
      userId = existingUser.id
      isExistingUser = true
      console.log(`👤 User already exists: ${email} (${userId}), adding to org ${organization_id}`)

      // Create organization_members record (the key part for multi-org)
      const { error: memberError } = await supabaseAdmin
        .from('organization_members')
        .upsert({
          user_id: userId,
          organization_id: organization_id,
          role: role || 'community',
          is_default: false  // Not default since they already have another org
        }, {
          onConflict: 'user_id,organization_id'
        })

      if (memberError) {
        console.error("Organization member Error:", memberError)
        throw new Error(`Failed to add user to organization: ${memberError.message}`)
      }

      console.log(`✅ Existing user ${email} added to organization ${organization_id}`)

    } else {
      // ── NEW USER: Invite via Supabase Auth (sends email with magic link) ──
      const inviteOptions: InviteOptions = {
        data: { 
          full_name: name,
          organization_id: organization_id,
          role: role || 'community'
        }
      }

      // Agregar redirect_to solo si está en allowlist
      // ?invite=1 signals the frontend that the user came from an invitation
      // (needed because Supabase JS v2 uses PKCE with ?code= instead of ?token_hash=)
      if (redirect_to && isAllowedRedirect(redirect_to, allowedRedirects)) {
        const separator = redirect_to.includes('?') ? '&' : '?'
        inviteOptions.redirectTo = `${redirect_to}${separator}invite=1`
      } else if (defaultRedirect) {
        inviteOptions.redirectTo = `${defaultRedirect}?invite=1`
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

      userId = authData.user.id

      // Create profile for the new user
      const profileData: ProfileData = {
        id: userId,
        email: email,
        full_name: name || email.split('@')[0],
        organization_id: organization_id,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email)}&background=random`
      }

      if (phone) {
        profileData.phone = phone
      }

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' })

      if (profileError) {
        console.error("Profile Error:", profileError)
        throw new Error(`Failed to create profile: ${profileError.message}`)
      }

      // Create organization_members record
      const { error: memberError } = await supabaseAdmin
        .from('organization_members')
        .upsert({
          user_id: userId,
          organization_id: organization_id,
          role: role || 'community',
          is_default: true
        }, {
          onConflict: 'user_id,organization_id'
        })

      if (memberError) {
        console.error("Organization member Error:", memberError)
        // Non-fatal: profile was created
      }
    }

    // ✅ SEGURIDAD: Log de auditoría para invitaciones
    console.log(`✅ User invited successfully: ${email} (${userId}) to organization: ${organization_id} [existing=${isExistingUser}]`)

    return new Response(
      JSON.stringify({ 
          message: isExistingUser 
            ? "Existing user added to organization successfully" 
            : "New user invited successfully",
          userId: userId,
          email: email,
          name: name,
          phone: phone || null,
          organization_id: organization_id,
          isExistingUser: isExistingUser
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