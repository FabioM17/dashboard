import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge Function: delete-user-data
 * 
 * Handles 4 levels of data deletion:
 * 
 *  Level 1 - "anonymize"        : Anonymize personal data (any user for themselves)
 *  Level 2 - "delete_member"    : Remove member from org (delete auth only if user has no other org memberships)
 *  Level 3 - "delete_organization" : Delete entire organization data (never deletes auth accounts)
 *  Level 4 - "preview"          : Dry-run preview of what would be deleted (org creator only)
 * 
 * Additionally deletes files from Supabase Storage buckets tied to the org.
 * 
 * Authentication: Bearer token from the requesting user's session.
 * Authorization: DB functions enforce org-creator checks.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: extract user from JWT ─────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Authorization header requerido", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // User client (respects RLS)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client (bypasses RLS, can delete auth.users)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonError("Usuario no autenticado", 401);
    }

    console.log(`🔵 [DELETE-USER-DATA] Request from user: ${user.email} (${user.id})`);

    // ── Parse body ──────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { level, target_user_id, organization_id } = body;

    if (!level) {
      return jsonError("El campo 'level' es requerido (anonymize | delete_member | delete_organization | preview)", 400);
    }

    if (!organization_id) {
      return jsonError("El campo 'organization_id' es requerido", 400);
    }

    console.log(`📋 Level: ${level}, Org: ${organization_id}, Target: ${target_user_id || "N/A"}`);

    // ── Verify requesting user belongs to this org ──────────
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, organization_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.organization_id !== organization_id) {
      return jsonError("No tienes acceso a esta organización", 403);
    }

    // ── Get user role from organization_members (role column no longer in profiles) ──
    const { data: membership, error: membershipError } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)
      .single();

    if (membershipError || !membership) {
      return jsonError("No tienes acceso a esta organización", 403);
    }

    const userRole = membership.role;

    // ── Handle each level ───────────────────────────────────
    switch (level) {
      // ─────────────────────────────────────────────────────
      // LEVEL 1: Anonymize personal data
      // ─────────────────────────────────────────────────────
      case "anonymize": {
        const targetId = target_user_id || user.id;

        // Non-admins can only anonymize themselves
        if (targetId !== user.id && userRole !== "admin") {
          return jsonError("Solo puedes anonimizar tus propios datos", 403);
        }

        const { data: result, error } = await adminClient.rpc("anonymize_user_data", {
          target_user_id: targetId,
        });

        if (error) {
          console.error("❌ anonymize_user_data error:", error);
          return jsonError("Error al anonimizar datos: " + error.message, 500);
        }

        console.log("✅ Anonymize result:", JSON.stringify(result));
        return jsonOk(result);
      }

      // ─────────────────────────────────────────────────────
      // LEVEL 2: Delete a team member
      // ─────────────────────────────────────────────────────
      case "delete_member": {
        if (!target_user_id) {
          return jsonError("El campo 'target_user_id' es requerido para eliminar un miembro", 400);
        }

        // Call DB function (validates creator permissions internally)
        const { data: result, error } = await adminClient.rpc("delete_team_member_data", {
          requesting_user_id: user.id,
          target_user_id: target_user_id,
          target_org_id: organization_id,
        });

        if (error) {
          console.error("❌ delete_team_member_data error:", error);
          return jsonError("Error al eliminar miembro: " + error.message, 500);
        }

        if (!result.success) {
          return jsonError(result.message, 403);
        }

        // Delete auth user only when DB confirms there are no memberships left.
        if (result.delete_auth_user && result.auth_user_id) {
          try {
            const { error: authError } = await adminClient.auth.admin.deleteUser(result.auth_user_id);
            if (authError) {
              console.warn("⚠️ Could not delete auth user:", authError.message);
            } else {
              console.log(`✅ Auth user ${result.auth_user_id} deleted`);
            }
          } catch (e) {
            console.warn("⚠️ Auth deletion failed:", e);
          }
        } else {
          console.log("ℹ️ Auth user preserved (member still belongs to other organizations)");
        }

        // Clean up storage files for this user (best effort)
        await cleanupUserStorage(adminClient, target_user_id, organization_id);

        return jsonOk(result);
      }

      // ─────────────────────────────────────────────────────
      // LEVEL 3: Delete entire organization
      // ─────────────────────────────────────────────────────
      case "delete_organization": {
        // Call DB function (validates creator permissions internally)
        const { data: result, error } = await adminClient.rpc("delete_organization_data", {
          requesting_user_id: user.id,
          target_org_id: organization_id,
        });

        if (error) {
          console.error("❌ delete_organization_data error:", error);
          return jsonError("Error al eliminar organización: " + error.message, 500);
        }

        if (!result.success) {
          return jsonError(result.message, 403);
        }

        // Multi-org safe mode: organization deletion NEVER deletes auth users.
        console.log("ℹ️ Skipping auth deletion for organization delete (multi-org safe mode)");

        // Clean up all storage for this organization (best effort)
        await cleanupOrgStorage(adminClient, organization_id);

        console.log(`✅ Organization ${organization_id} deleted (users preserved)`);
        return jsonOk(result);
      }

      // ─────────────────────────────────────────────────────
      // LEVEL 4: Preview (dry run)
      // ─────────────────────────────────────────────────────
      case "preview": {
        const { data: result, error } = await adminClient.rpc("preview_organization_deletion", {
          requesting_user_id: user.id,
          target_org_id: organization_id,
        });

        if (error) {
          console.error("❌ preview_organization_deletion error:", error);
          return jsonError("Error al obtener vista previa: " + error.message, 500);
        }

        if (!result.success) {
          return jsonError(result.message, 403);
        }

        return jsonOk(result);
      }

      default:
        return jsonError(
          `Nivel '${level}' no reconocido. Usa: anonymize, delete_member, delete_organization, preview`,
          400
        );
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    return jsonError("Error interno del servidor", 500);
  }
});

// ── Helpers ─────────────────────────────────────────────────

function jsonOk(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Best-effort cleanup of storage files related to a specific user.
 */
async function cleanupUserStorage(
  adminClient: any,
  userId: string,
  orgId: string
) {
  try {
    // Try to list and delete files in common buckets with user/org prefix patterns
    const buckets = ["media", "documents", "attachments"];
    for (const bucket of buckets) {
      try {
        const { data: files } = await adminClient.storage
          .from(bucket)
          .list(`${orgId}/${userId}`);
        if (files && files.length > 0) {
          const paths = files.map(
            (f: any) => `${orgId}/${userId}/${f.name}`
          );
          await adminClient.storage.from(bucket).remove(paths);
          console.log(`🗑️ Removed ${paths.length} files from ${bucket}/${orgId}/${userId}`);
        }
      } catch (_) {
        // Bucket may not exist, skip silently
      }
    }
  } catch (err) {
    console.warn("⚠️ Storage cleanup for user failed:", err);
  }
}

/**
 * Best-effort cleanup of all storage files for an organization.
 */
async function cleanupOrgStorage(adminClient: any, orgId: string) {
  try {
    const buckets = ["media", "documents", "attachments"];
    for (const bucket of buckets) {
      try {
        const { data: files } = await adminClient.storage
          .from(bucket)
          .list(orgId, { limit: 1000 });
        if (files && files.length > 0) {
          // Recursively list nested paths
          const allPaths: string[] = [];
          for (const item of files) {
            if (item.id) {
              allPaths.push(`${orgId}/${item.name}`);
            } else {
              // It's a folder, list its contents
              const { data: subFiles } = await adminClient.storage
                .from(bucket)
                .list(`${orgId}/${item.name}`, { limit: 1000 });
              if (subFiles) {
                for (const sub of subFiles) {
                  allPaths.push(`${orgId}/${item.name}/${sub.name}`);
                }
              }
            }
          }
          if (allPaths.length > 0) {
            await adminClient.storage.from(bucket).remove(allPaths);
            console.log(`🗑️ Removed ${allPaths.length} files from ${bucket}/${orgId}`);
          }
        }
      } catch (_) {
        // Bucket may not exist
      }
    }
  } catch (err) {
    console.warn("⚠️ Storage cleanup for org failed:", err);
  }
}
