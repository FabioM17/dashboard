import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const parseAllowedRedirects = (): string[] => {
  return ["https://dashboardchat.docreativelatam.com"];
};

const isAllowedRedirect = (url: string, allowed: string[]): boolean => {
  try {
    const candidate = new URL(url);
    return allowed.some((value) => {
      try {
        const allowedUrl = new URL(value);
        return candidate.origin === allowedUrl.origin && candidate.pathname.startsWith(allowedUrl.pathname);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { email, name, role, organization_id, phone, redirect_to } = await req.json();
    const allowedRedirects = parseAllowedRedirects();
    const defaultRedirect = allowedRedirects[0];

    if (!email || !organization_id) {
      throw new Error("Email and Organization ID are required");
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(organization_id)) {
      throw new Error("Invalid organization ID format");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    if (phone) {
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone)) {
        throw new Error("Invalid phone format. Use E.164, e.g. +54911...");
      }
    }

    const validRoles = ["admin", "manager", "community"];
    if (role && !validRoles.includes(role)) {
      throw new Error("Invalid role. Must be admin, manager, or community");
    }

    const { data: existingUsersData } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsersData?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let userId: string;
    let isExistingUser = false;

    if (existingUser) {
      userId = existingUser.id;
      isExistingUser = true;

      const { error: memberError } = await supabaseAdmin
        .from("organization_members")
        .upsert(
          {
            user_id: userId,
            organization_id,
            role: role || "community",
            is_default: false,
          },
          {
            onConflict: "user_id,organization_id",
          }
        );

      if (memberError) {
        throw new Error(`Failed to add user to organization: ${memberError.message}`);
      }
    } else {
      const inviteOptions: InviteOptions = {
        data: {
          full_name: name,
          organization_id,
          role: role || "community",
        },
      };

      if (redirect_to && isAllowedRedirect(redirect_to, allowedRedirects)) {
        const separator = redirect_to.includes('?') ? '&' : '?';
        inviteOptions.redirectTo = `${redirect_to}${separator}invite=1`;
      } else if (defaultRedirect) {
        inviteOptions.redirectTo = `${defaultRedirect}?invite=1`;
      }

      const { data: authData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        inviteOptions
      );

      if (inviteError) {
        throw new Error(`Failed to invite user: ${inviteError.message}`);
      }

      if (!authData?.user) {
        throw new Error("No user data returned from auth invite");
      }

      userId = authData.user.id;

      const profileData: ProfileData = {
        id: userId,
        email,
        full_name: name || email.split("@")[0],
        organization_id,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email)}&background=random`,
      };

      if (phone) {
        profileData.phone = phone;
      }

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert(profileData, { onConflict: "id" });

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      const { error: memberError } = await supabaseAdmin
        .from("organization_members")
        .upsert(
          {
            user_id: userId,
            organization_id,
            role: role || "community",
            is_default: true,
          },
          {
            onConflict: "user_id,organization_id",
          }
        );

      if (memberError) {
        console.error("Organization member Error:", memberError);
      }
    }

    return new Response(
      JSON.stringify({
        message: isExistingUser
          ? "Existing user added to organization successfully"
          : "New user invited successfully",
        userId,
        email,
        name,
        phone: phone || null,
        organization_id,
        isExistingUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to invite user";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
