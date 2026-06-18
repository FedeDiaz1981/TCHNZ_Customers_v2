import type { APIRoute } from "astro";
import { getCurrentPortalProfile } from "../../../lib/portal/admin";
import { createRedirectResponse, getForwardedRequestUrl, redirectWithFlash } from "../../../lib/auth/http";
import { getSectionHrefForPath } from "../../../lib/portal/hosts";
import { verifyTurnstileToken } from "../../../lib/auth/turnstile";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

function maskEmail(email: string) {
  const [localPart, domainPart] = email.split("@");
  if (!localPart || !domainPart) return email;

  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.slice(-2);
  return `${visibleStart}***${visibleEnd}@${domainPart}`;
}

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const captchaToken = String(formData.get("cf-turnstile-response") ?? "");
  const requestUrl = getForwardedRequestUrl(context.request);

  console.info("[auth/login] start", {
    path: requestUrl.pathname,
    email: email ? maskEmail(email) : null
  });

  if (!email || !password) {
    console.info("[auth/login] missing credentials", {
      path: requestUrl.pathname,
      email: email ? maskEmail(email) : null
    });
    return redirectWithFlash(context.request, "/login", "error", "Completa email y contrasena.");
  }

  const captchaResult = await verifyTurnstileToken(context.request, captchaToken);

  if (!captchaResult.success) {
    console.info("[auth/login] captcha failed", {
      path: requestUrl.pathname,
      email: maskEmail(email)
    });
    return redirectWithFlash(
      context.request,
      "/login",
      "error",
      "No pudimos validar el captcha. Intenta nuevamente."
    );
  }

  const supabase = createSupabaseServerClient(context);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error("[auth/login] Supabase signInWithPassword failed", {
      email,
      message: error.message,
      status: error.status,
      code: "code" in error ? error.code : null,
      name: error.name
    });

    let userMessage = "No pudimos iniciar sesion. Revisa tus credenciales.";

    if (/email not confirmed/i.test(error.message)) {
      userMessage = "Tu email todavia no fue confirmado en Supabase.";
    } else if (/invalid login credentials/i.test(error.message)) {
      userMessage = "Email o contrasena incorrectos.";
    }

    return redirectWithFlash(context.request, "/login", "error", userMessage);
  }

  const authenticatedUser = data.user;
  let authenticatedProfile = null;

  if (authenticatedUser) {
    authenticatedProfile = await getCurrentPortalProfile(supabase, authenticatedUser.id);

    console.info("[auth/login] profile resolved", {
      userId: authenticatedUser.id,
      email: maskEmail(email),
      role: authenticatedProfile?.role ?? null,
      isActive: authenticatedProfile?.isActive ?? null,
      portalModules: authenticatedProfile?.portalModules ?? []
    });

    if (!authenticatedProfile || !authenticatedProfile.isActive) {
      await supabase.auth.signOut();
      console.info("[auth/login] profile inactive or missing", {
        userId: authenticatedUser.id,
        email: maskEmail(email)
      });
      return redirectWithFlash(
        context.request,
        "/login",
        "error",
        "Tu usuario ya no se encuentra habilitado en el portal."
      );
    }
  }

  const redirectTarget =
    authenticatedProfile?.role === "admin"
      ? getSectionHrefForPath(getForwardedRequestUrl(context.request), "/admin")
      : getSectionHrefForPath(getForwardedRequestUrl(context.request), "/clientes/aplicaciones");

  console.info("[auth/login] redirect", {
    email: maskEmail(email),
    role: authenticatedProfile?.role ?? null,
    redirectTarget
  });

  return createRedirectResponse(redirectTarget);
};
