import type { APIRoute } from "astro";
import { getForwardedRequestUrl } from "../../../lib/auth/http";
import { getCurrentPortalProfile } from "../../../lib/portal/admin";
import { withPortalBasePath } from "../../../lib/portal/base-path";
import { getCurrentPortalModule } from "../../../lib/portal/hosts";
import {
  isManagedClientLogo,
  removeManagedClientLogo,
  storeClientLogoUpload
} from "../../../lib/portal/client-logo-upload";
import { getModuleContentSection } from "../../../lib/portal/modules";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function parseBoolean(value: FormDataEntryValue | null, fallback = false) {
  if (value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["true", "1", "on", "yes"].includes(normalized);
}

function getBooleanField(formData: FormData, name: string, fallback = false) {
  const values = formData.getAll(name);
  if (values.length === 0) return fallback;
  return parseBoolean(values[values.length - 1], fallback);
}

function normalizeSlug(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function splitTags(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDateTimeField(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

function getRedirectTarget(request: Request, formData: FormData) {
  const fallback = "/admin";
  const requestedPath = String(formData.get("redirect_to") ?? "").trim();
  if (requestedPath.startsWith("/")) return requestedPath;

  const referer = request.headers.get("referer");
  if (!referer) return fallback;

  try {
    const refererUrl = new URL(referer);
    return `${refererUrl.pathname}${refererUrl.search}`;
  } catch {
    return fallback;
  }
}

function buildRedirect(request: Request, path: string, message: string, tone: "success" | "error") {
  const url = new URL(withPortalBasePath(path), getForwardedRequestUrl(request));
  url.searchParams.set("message", message);
  url.searchParams.set("tone", tone);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.toString()
    }
  });
}

function getTextField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function ensureAdmin(context: Parameters<APIRoute>[0]) {
  const supabase = createSupabaseServerClient(context);
  const portalModule = getCurrentPortalModule(getForwardedRequestUrl(context.request));
  const contentSection = getModuleContentSection(portalModule);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: buildRedirect(context.request, "/login", "Inicia sesion para continuar.", "error")
    };
  }

  const profile = await getCurrentPortalProfile(supabase, user.id);
  if (!profile || profile.role !== "admin" || !profile.portalModules.includes(portalModule)) {
    return {
      ok: false as const,
      response: buildRedirect(
        context.request,
        "/clientes/aplicaciones",
        "No tienes permisos de administracion.",
        "error"
      )
    };
  }

  return { ok: true as const, supabase, user, profile, portalModule, contentSection };
}

export const POST: APIRoute = async (context) => {
  const authorization = await ensureAdmin(context);
  if (!authorization.ok) return authorization.response;

  const { supabase, user, portalModule, contentSection } = authorization;
  const formData = await context.request.formData();
  const action = String(formData.get("intent") ?? formData.get("action") ?? "").trim();
  const redirectTo = getRedirectTarget(context.request, formData);

  try {
    switch (action) {
      case "create-client": {
        const name = String(formData.get("name") ?? "").trim();
        const slug = normalizeSlug(formData.get("slug"));
        const isActive = getBooleanField(formData, "is_active", true);

        if (!name || !slug) {
          return buildRedirect(context.request, redirectTo, "Completa nombre y slug del cliente.", "error");
        }

        const uploadedLogoUrl = await storeClientLogoUpload(formData.get("logo_file"), { slug });

        const { error } = await supabase
          .from("clients")
          .insert({
            name,
            slug,
            portal_module: portalModule,
            logo_url: uploadedLogoUrl,
            is_active: isActive
          })
          .select("id")
          .single();

        if (error) {
          if (uploadedLogoUrl) {
            await removeManagedClientLogo(uploadedLogoUrl);
          }

          throw error;
        }

        return buildRedirect(context.request, redirectTo, "Cliente creado correctamente.", "success");
      }

      case "update-client": {
        const clientId = String(formData.get("client_id") ?? "").trim();
        const name = String(formData.get("name") ?? "").trim();
        const slug = normalizeSlug(formData.get("slug"));
        const currentLogoUrl = String(formData.get("current_logo_url") ?? "").trim() || null;
        const isActive = getBooleanField(formData, "is_active", false);

        if (!clientId || !name || !slug) {
          return buildRedirect(context.request, redirectTo, "Faltan datos para actualizar el cliente.", "error");
        }

        const uploadedLogoUrl = await storeClientLogoUpload(formData.get("logo_file"), {
          slug,
          clientId
        });
        const logoUrl = uploadedLogoUrl ?? currentLogoUrl;

        const { error } = await supabase
          .from("clients")
          .update({
            name,
            slug,
            logo_url: logoUrl,
            is_active: isActive
          })
          .eq("id", clientId)
          .eq("portal_module", portalModule)
          .is("deleted_at", null);

        if (error) {
          if (uploadedLogoUrl) {
            await removeManagedClientLogo(uploadedLogoUrl);
          }

          throw error;
        }

        if (currentLogoUrl && currentLogoUrl !== logoUrl && isManagedClientLogo(currentLogoUrl)) {
          await removeManagedClientLogo(currentLogoUrl);
        }

        return buildRedirect(context.request, redirectTo, "Cliente actualizado.", "success");
      }

      case "delete-client": {
        const clientId = getTextField(formData, "client_id");
        const currentLogoUrl = getTextField(formData, "current_logo_url") || null;

        if (!clientId) {
          return buildRedirect(
            context.request,
            redirectTo,
            "No pudimos identificar el cliente a eliminar.",
            "error"
          );
        }

        const { data: clientToDelete, error: clientLookupError } = await supabase
          .from("clients")
          .select("id, slug")
          .eq("id", clientId)
          .eq("portal_module", portalModule)
          .is("deleted_at", null)
          .maybeSingle();

        if (clientLookupError) throw clientLookupError;

        if (!clientToDelete) {
          return buildRedirect(
            context.request,
            redirectTo,
            "No encontramos el cliente a eliminar.",
            "error"
          );
        }

        const deletedAt = new Date().toISOString();
        const archivedSlug = `${clientToDelete.slug}--deleted-${Date.now()}`;

        const [
          { error: membershipsError },
          { error: accessError },
          { error: archiveError }
        ] = await Promise.all([
          supabase.from("client_memberships").update({ is_active: false }).eq("client_id", clientId),
          supabase
            .from("client_application_access")
            .update({ is_enabled: false })
            .eq("client_id", clientId),
          supabase
            .from("clients")
            .update({
              is_active: false,
              deleted_at: deletedAt,
              slug: archivedSlug
            })
            .eq("id", clientId)
            .eq("portal_module", portalModule)
        ]);

        if (membershipsError) throw membershipsError;
        if (accessError) throw accessError;
        if (archiveError) throw archiveError;

        if (currentLogoUrl && isManagedClientLogo(currentLogoUrl)) {
          try {
            await removeManagedClientLogo(currentLogoUrl);
          } catch (logoCleanupError) {
            console.error("El cliente se elimino, pero no pudimos limpiar su logo gestionado.", logoCleanupError);
          }
        }

        return buildRedirect(
          context.request,
          redirectTo,
          "Cliente eliminado de la lista correctamente.",
          "success"
        );
      }

      case "update-profile": {
        const profileId = String(formData.get("profile_id") ?? "").trim();
        const fullName = String(formData.get("full_name") ?? "").trim() || null;
        const role = String(formData.get("role") ?? "").trim();
        const isActive = getBooleanField(formData, "is_active", false);

        if (!profileId || !role) {
          return buildRedirect(context.request, redirectTo, "Faltan datos para actualizar el usuario.", "error");
        }

        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            role,
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq("id", profileId);

        if (error) throw error;
        return buildRedirect(context.request, redirectTo, "Usuario actualizado.", "success");
      }

      case "create-user": {
        const email = getTextField(formData, "email").toLowerCase();
        const fullName = getTextField(formData, "full_name") || null;
        const isActive = getBooleanField(formData, "is_active", true);
        const isAdmin = getBooleanField(formData, "is_admin", false);
        const clientId = getTextField(formData, "client_id");
        const membershipIsActive = getBooleanField(formData, "membership_is_active", true);
        const password = String(formData.get("password") ?? "");
        const confirmPassword = String(formData.get("confirm_password") ?? "");

        if (!email || !email.includes("@")) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Ingresa un email valido para crear el usuario.",
            "error"
          );
        }

        if (!password || !confirmPassword) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Completa y confirma la contrasena inicial del usuario.",
            "error"
          );
        }

        if (password.length < 8) {
          return buildRedirect(
            context.request,
            redirectTo,
            "La contrasena debe tener al menos 8 caracteres.",
            "error"
          );
        }

        if (password !== confirmPassword) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Las contrasenas no coinciden.",
            "error"
          );
        }

        if (!isAdmin && !clientId) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Selecciona un cliente o marca la opcion de administrador.",
            "error"
          );
        }

        const nextRole = isAdmin ? "admin" : "client_user";
        const adminSupabase = createSupabaseAdminClient();
        let createdUserId: string | null = null;

        try {
          const { data: createdUserData, error: createUserError } =
            await adminSupabase.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: {
                portal_password_defined: true,
                ...(fullName ? { full_name: fullName } : {})
              }
            });

          if (createUserError) throw createUserError;

          const createdUser = createdUserData.user;
          if (!createdUser) {
            throw new Error("No pudimos crear el usuario en Auth.");
          }

          createdUserId = createdUser.id;

          const { error: profileError } = await adminSupabase.from("profiles").upsert(
            {
              id: createdUserId,
              email,
              full_name: fullName,
              role: nextRole,
              is_active: isActive,
              updated_at: new Date().toISOString()
            },
            { onConflict: "id" }
          );

          if (profileError) throw profileError;

          if (clientId) {
            const { error: membershipError } = await adminSupabase
              .from("client_memberships")
              .upsert(
                {
                  client_id: clientId,
                  user_id: createdUserId,
                  role: "member",
                  is_active: membershipIsActive
                },
                { onConflict: "client_id,user_id" }
              );

            if (membershipError) throw membershipError;
          }
        } catch (error) {
          if (createdUserId) {
            const { error: cleanupError } = await adminSupabase.auth.admin.deleteUser(createdUserId);
            if (cleanupError) {
              console.error("No pudimos revertir el usuario creado tras un error.", cleanupError);
            }
          }

          throw error;
        }

        return buildRedirect(context.request, redirectTo, "Usuario creado.", "success");
      }

      case "save-user-settings": {
        const profileId = getTextField(formData, "profile_id");
        const fullName = getTextField(formData, "full_name") || null;
        const isActive = getBooleanField(formData, "is_active", false);
        const isAdmin = getBooleanField(formData, "is_admin", false);
        const clientId = getTextField(formData, "client_id");
        const membershipRole = "member";
        const membershipIsActive = getBooleanField(formData, "membership_is_active", true);

        if (!profileId) {
          return buildRedirect(context.request, redirectTo, "Faltan datos para actualizar el usuario.", "error");
        }

        const nextRole = isAdmin ? "admin" : "client_user";

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            role: nextRole,
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq("id", profileId);

        if (profileError) throw profileError;

        if (!clientId && !isAdmin) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Selecciona el cliente del usuario o marca la opcion de administrador.",
            "error"
          );
        }

        if (!clientId) {
          return buildRedirect(context.request, redirectTo, "Usuario actualizado.", "success");
        }

        const { data: existingMemberships, error: existingMembershipsError } = await supabase
          .from("client_memberships")
          .select("id, client_id")
          .eq("user_id", profileId);

        if (existingMembershipsError) throw existingMembershipsError;

        const selectedMembership = (existingMemberships ?? []).find(
          (membership) => membership.client_id === clientId
        );

        if (selectedMembership) {
          const { error } = await supabase
            .from("client_memberships")
            .update({
              role: membershipRole,
              is_active: membershipIsActive
            })
            .eq("id", selectedMembership.id);

          if (error) throw error;
        } else {
          const { error } = await supabase.from("client_memberships").insert({
            client_id: clientId,
            user_id: profileId,
            role: membershipRole,
            is_active: membershipIsActive
          });

          if (error) throw error;
        }

        const membershipsToDeactivate = (existingMemberships ?? [])
          .filter((membership) => membership.client_id !== clientId)
          .map((membership) => membership.id);

        if (membershipsToDeactivate.length > 0) {
          const { error } = await supabase
            .from("client_memberships")
            .update({ is_active: false })
            .in("id", membershipsToDeactivate);

          if (error) throw error;
        }

        return buildRedirect(context.request, redirectTo, "Usuario actualizado.", "success");
      }

      case "delete-user": {
        const profileId = getTextField(formData, "profile_id");

        if (!profileId) {
          return buildRedirect(
            context.request,
            redirectTo,
            "No pudimos identificar el usuario a eliminar.",
            "error"
          );
        }

        if (profileId === user.id) {
          return buildRedirect(
            context.request,
            redirectTo,
            "No puedes eliminar tu propio usuario desde la sesion actual.",
            "error"
          );
        }

        const { data: profileToDelete, error: profileLookupError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", profileId)
          .is("deleted_at", null)
          .maybeSingle();

        if (profileLookupError) throw profileLookupError;

        if (!profileToDelete) {
          return buildRedirect(
            context.request,
            redirectTo,
            "No encontramos el usuario a eliminar.",
            "error"
          );
        }

        const deletedAt = new Date().toISOString();

        const [{ error: membershipsError }, { error: profileError }] = await Promise.all([
          supabase.from("client_memberships").update({ is_active: false }).eq("user_id", profileId),
          supabase
            .from("profiles")
            .update({
              is_active: false,
              deleted_at: deletedAt,
              updated_at: deletedAt
            })
            .eq("id", profileId)
        ]);

        if (membershipsError) throw membershipsError;
        if (profileError) throw profileError;

        return buildRedirect(
          context.request,
          redirectTo,
          "Usuario eliminado de la lista correctamente.",
          "success"
        );
      }

      case "update-user-password": {
        const profileId = getTextField(formData, "profile_id");
        const password = String(formData.get("password") ?? "");
        const confirmPassword = String(formData.get("confirm_password") ?? "");

        if (!profileId || !password || !confirmPassword) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Completa y confirma la contrasena del usuario.",
            "error"
          );
        }

        if (password.length < 8) {
          return buildRedirect(
            context.request,
            redirectTo,
            "La contrasena debe tener al menos 8 caracteres.",
            "error"
          );
        }

        if (password !== confirmPassword) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Las contrasenas no coinciden.",
            "error"
          );
        }

        const adminSupabase = createSupabaseAdminClient();
        const { data: userData, error: getUserError } = await adminSupabase.auth.admin.getUserById(profileId);

        if (getUserError) throw getUserError;

        const { error } = await adminSupabase.auth.admin.updateUserById(profileId, {
          password,
          user_metadata: {
            ...(userData.user?.user_metadata ?? {}),
            portal_password_defined: true
          }
        });

        if (error) throw error;

        return buildRedirect(context.request, redirectTo, "Contrasena actualizada.", "success");
      }

      case "upsert-membership": {
        const clientId = String(formData.get("client_id") ?? "").trim();
        const userId = String(formData.get("user_id") ?? "").trim();
        const role = "member";
        const isActive = getBooleanField(formData, "is_active", true);

        if (!clientId || !userId) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Selecciona cliente y usuario para guardar la membresia.",
            "error"
          );
        }

        const { data: existingMembership } = await supabase
          .from("client_memberships")
          .select("id")
          .eq("client_id", clientId)
          .eq("user_id", userId)
          .maybeSingle();

        const operation = existingMembership
          ? supabase
              .from("client_memberships")
              .update({ role, is_active: isActive })
              .eq("id", existingMembership.id)
          : supabase.from("client_memberships").insert({
              client_id: clientId,
              user_id: userId,
              role,
              is_active: isActive
            });

        const { error } = await operation;
        if (error) throw error;

        return buildRedirect(context.request, redirectTo, "Membresia guardada.", "success");
      }

      case "create-application": {
        const name = String(formData.get("name") ?? "").trim();
        const slug = normalizeSlug(formData.get("slug"));
        const url = String(formData.get("url") ?? "").trim();
        const description = String(formData.get("description") ?? "").trim() || null;
        const icon = String(formData.get("icon") ?? "").trim() || null;
        const category = String(formData.get("category") ?? "").trim() || "General";
        const areaTags = splitTags(formData.get("area_tags"));
        const accessTier = String(formData.get("access_tier") ?? "").trim() || "included";
        const availabilityStatus =
          String(formData.get("availability_status") ?? "").trim() || "available";
        const badgeLabel = String(formData.get("badge_label") ?? "").trim() || null;
        const sortOrder = Number(formData.get("sort_order") ?? 0) || 0;
        const isActive = getBooleanField(formData, "is_active", true);

        if (!name || !slug || !url) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Completa nombre, slug y URL de la aplicacion.",
            "error"
          );
        }

        const { error } = await supabase.from("applications").insert({
          name,
          slug,
          url,
          description,
          icon,
          category,
          area_tags: areaTags,
          access_tier: accessTier,
          availability_status: availabilityStatus,
          badge_label: badgeLabel,
          sort_order: sortOrder,
          is_active: isActive
        });

        if (error) throw error;
        return buildRedirect(context.request, redirectTo, "Aplicacion creada.", "success");
      }

      case "update-application": {
        const applicationId = String(formData.get("application_id") ?? "").trim();
        const name = String(formData.get("name") ?? "").trim();
        const slug = normalizeSlug(formData.get("slug"));
        const url = String(formData.get("url") ?? "").trim();
        const description = String(formData.get("description") ?? "").trim() || null;
        const icon = String(formData.get("icon") ?? "").trim() || null;
        const category = String(formData.get("category") ?? "").trim() || "General";
        const areaTags = splitTags(formData.get("area_tags"));
        const accessTier = String(formData.get("access_tier") ?? "").trim() || "included";
        const availabilityStatus =
          String(formData.get("availability_status") ?? "").trim() || "available";
        const badgeLabel = String(formData.get("badge_label") ?? "").trim() || null;
        const sortOrder = Number(formData.get("sort_order") ?? 0) || 0;
        const isActive = getBooleanField(formData, "is_active", false);

        if (!applicationId || !name || !slug || !url) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Faltan datos para actualizar la aplicacion.",
            "error"
          );
        }

        const { error } = await supabase
          .from("applications")
          .update({
            name,
            slug,
            url,
            description,
            icon,
            category,
            area_tags: areaTags,
            access_tier: accessTier,
            availability_status: availabilityStatus,
            badge_label: badgeLabel,
            sort_order: sortOrder,
            is_active: isActive
          })
          .eq("id", applicationId)
          .is("deleted_at", null);

        if (error) throw error;
        return buildRedirect(context.request, redirectTo, "Aplicacion actualizada.", "success");
      }

      case "delete-application": {
        const applicationId = String(formData.get("application_id") ?? "").trim();

        if (!applicationId) {
          return buildRedirect(
            context.request,
            redirectTo,
            "No pudimos resolver la aplicacion a eliminar.",
            "error"
          );
        }

        const { data: application, error: applicationError } = await supabase
          .from("applications")
          .select("id, slug")
          .eq("id", applicationId)
          .is("deleted_at", null)
          .maybeSingle();

        if (applicationError) throw applicationError;

        if (!application) {
          return buildRedirect(
            context.request,
            redirectTo,
            "La aplicacion ya no se encuentra disponible en la lista.",
            "error"
          );
        }

        const deletedAt = new Date().toISOString();
        const archivedSlug = `${application.slug}--deleted-${Date.now()}`;

        const { error: disableAccessError } = await supabase
          .from("client_application_access")
          .update({ is_enabled: false })
          .eq("application_id", applicationId);

        if (disableAccessError) throw disableAccessError;

        const { error: deleteError } = await supabase
          .from("applications")
          .update({
            slug: archivedSlug,
            is_active: false,
            availability_status: "disabled",
            deleted_at: deletedAt
          })
          .eq("id", applicationId)
          .is("deleted_at", null);

        if (deleteError) throw deleteError;

        return buildRedirect(
          context.request,
          redirectTo,
          "Aplicacion eliminada de la lista correctamente.",
          "success"
        );
      }

      case "create-blog-post": {
        const title = getTextField(formData, "title");
        const slug = normalizeSlug(formData.get("slug"));
        const content = getTextField(formData, "content");
        const summary = getTextField(formData, "summary") || content.slice(0, 220) || null;
        const coverImageUrl = getTextField(formData, "cover_image_url") || null;
        const authorName = getTextField(formData, "author_name") || "Equipo Technized";
        const tags = splitTags(formData.get("tags"));
        const status = getTextField(formData, "status") === "published" ? "published" : "draft";
        const isFeatured = getBooleanField(formData, "is_featured", false);
        const publishedAt =
          status === "published"
            ? getDateTimeField(formData, "published_at") ?? new Date().toISOString()
            : null;

        if (!title || !slug || !content) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Completa titulo, slug y contenido del articulo.",
            "error"
          );
        }

        const { error } = await supabase.from("blog_posts").insert({
          title,
          slug,
          summary,
          content,
          cover_image_url: coverImageUrl,
          author_name: authorName,
          tags,
          status,
          is_featured: isFeatured,
          published_at: publishedAt,
          portal_module: portalModule,
          content_section: contentSection ?? "blog",
          created_by: user.id,
          updated_at: new Date().toISOString()
        });

        if (error) throw error;

        return buildRedirect(context.request, redirectTo, "Articulo guardado.", "success");
      }

      case "update-blog-post": {
        const blogPostId = getTextField(formData, "blog_post_id");
        const title = getTextField(formData, "title");
        const slug = normalizeSlug(formData.get("slug"));
        const content = getTextField(formData, "content");
        const summary = getTextField(formData, "summary") || content.slice(0, 220) || null;
        const coverImageUrl = getTextField(formData, "cover_image_url") || null;
        const authorName = getTextField(formData, "author_name") || "Equipo Technized";
        const tags = splitTags(formData.get("tags"));
        const status = getTextField(formData, "status") === "published" ? "published" : "draft";
        const isFeatured = getBooleanField(formData, "is_featured", false);
        const currentPublishedAt = getTextField(formData, "current_published_at") || null;
        const publishedAt =
          status === "published"
            ? getDateTimeField(formData, "published_at") ??
              currentPublishedAt ??
              new Date().toISOString()
            : null;

        if (!blogPostId || !title || !slug || !content) {
          return buildRedirect(
            context.request,
            redirectTo,
            "Faltan datos para actualizar el articulo.",
            "error"
          );
        }

        const { error } = await supabase
          .from("blog_posts")
          .update({
            title,
            slug,
            summary,
            content,
            cover_image_url: coverImageUrl,
            author_name: authorName,
            tags,
            status,
            is_featured: isFeatured,
            published_at: publishedAt,
            updated_at: new Date().toISOString()
          })
          .eq("id", blogPostId)
          .eq("portal_module", portalModule)
          .eq("content_section", contentSection ?? "blog")
          .is("deleted_at", null);

        if (error) throw error;

        return buildRedirect(context.request, redirectTo, "Articulo actualizado.", "success");
      }

      case "delete-blog-post": {
        const blogPostId = getTextField(formData, "blog_post_id");

        if (!blogPostId) {
          return buildRedirect(
            context.request,
            redirectTo,
            "No pudimos resolver el articulo a eliminar.",
            "error"
          );
        }

        const { data: blogPost, error: blogPostLookupError } = await supabase
          .from("blog_posts")
          .select("id, slug")
          .eq("id", blogPostId)
          .eq("portal_module", portalModule)
          .eq("content_section", contentSection ?? "blog")
          .is("deleted_at", null)
          .maybeSingle();

        if (blogPostLookupError) throw blogPostLookupError;

        if (!blogPost) {
          return buildRedirect(
            context.request,
            redirectTo,
            "No encontramos el articulo a eliminar.",
            "error"
          );
        }

        const deletedAt = new Date().toISOString();
        const archivedSlug = `${blogPost.slug}--deleted-${Date.now()}`;

        const { error } = await supabase
          .from("blog_posts")
          .update({
            slug: archivedSlug,
            status: "draft",
            is_featured: false,
            deleted_at: deletedAt,
            updated_at: deletedAt
          })
          .eq("id", blogPostId)
          .eq("portal_module", portalModule)
          .eq("content_section", contentSection ?? "blog")
          .is("deleted_at", null);

        if (error) throw error;

        return buildRedirect(
          context.request,
          redirectTo,
          "Articulo eliminado de la lista correctamente.",
          "success"
        );
      }

      case "upsert-access": {
        const clientId = String(formData.get("client_id") ?? "").trim();
        const applicationId = String(formData.get("application_id") ?? "").trim();
        const isEnabled = getBooleanField(formData, "is_enabled", false);

        if (!clientId || !applicationId) {
          return buildRedirect(context.request, redirectTo, "No pudimos resolver el acceso solicitado.", "error");
        }

        const { data: existingAccess } = await supabase
          .from("client_application_access")
          .select("id")
          .eq("client_id", clientId)
          .eq("application_id", applicationId)
          .maybeSingle();

        const operation = existingAccess
          ? supabase
              .from("client_application_access")
              .update({ is_enabled: isEnabled })
              .eq("id", existingAccess.id)
          : supabase.from("client_application_access").insert({
              client_id: clientId,
              application_id: applicationId,
              is_enabled: isEnabled
            });

        const { error } = await operation;
        if (error) throw error;

        return buildRedirect(context.request, redirectTo, "Acceso actualizado.", "success");
      }

      default:
        return buildRedirect(context.request, redirectTo, "Accion no reconocida.", "error");
    }
  } catch (error) {
    console.error("No pudimos completar la accion de administracion.", error);

    const customMessage =
      error instanceof Error
        ? /^El logo /i.test(error.message) || /^Missing SUPABASE_SERVICE_ROLE_KEY/i.test(error.message)
          ? error.message
          : /already been registered/i.test(error.message) || /already registered/i.test(error.message)
            ? "Ya existe un usuario registrado con ese email."
            : null
        : null;

    return buildRedirect(
      context.request,
      redirectTo,
      customMessage ?? "Ocurrio un error guardando los cambios. Revisa los datos e intenta nuevamente.",
      "error"
    );
  }
};
