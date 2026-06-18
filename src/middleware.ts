import { defineMiddleware } from "astro:middleware";
import { getForwardedRequestUrl } from "./lib/auth/http";
import { getCurrentPortalProfile } from "./lib/portal/admin";
import {
  buildAuthUrl,
  getCurrentPortalModule,
  getCurrentPortalSection,
  getCanonicalSectionUrl,
  getPortalRequestPathname,
  getSectionHrefForPath,
  getRewritePathForSectionHost
} from "./lib/portal/hosts";
import { moduleHasManagement, moduleRequiresAuth } from "./lib/portal/modules";
import { supabaseUrl } from "./lib/supabase/env";
import { createSupabaseServerClient } from "./lib/supabase/server";

function toSafeRedirectLocation(url: URL | string) {
  if (typeof url === "string") return url;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return `${url.pathname}${url.search}`;
  }

  return url.toString();
}

function isAssetRequest(pathname: string) {
  return (
    pathname.startsWith("/_astro") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/scripts") ||
    pathname === "/favicon.png" ||
    pathname === "/favicon.svg"
  );
}

function buildContentSecurityPolicy() {
  let supabaseOrigin = "";

  try {
    supabaseOrigin = new URL(supabaseUrl).origin;
  } catch {
    supabaseOrigin = "";
  }

  const styleSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net"
  ];

  const styleSrcElem = [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net"
  ];

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://challenges.cloudflare.com",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://cdn.jsdelivr.net",
    "https://unpkg.com"
  ];

  const connectSrc = [
    "'self'",
    "https://challenges.cloudflare.com",
    "https://www.google.com",
    "https://www.gstatic.com",
    supabaseOrigin
  ].filter(Boolean);

  const fontSrc = ["'self'", "data:", "https://cdnjs.cloudflare.com"];
  const imgSrc = ["'self'", "data:", "blob:", "https:"];
  const frameSrc = [
    "'self'",
    "https://challenges.cloudflare.com",
    "https://www.google.com",
    "https://www.gstatic.com"
  ];
  const formAction = [
    "'self'",
    "https://technized.com",
    "https://www.technized.com",
    "https://formsubmit.co"
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    `style-src ${styleSrc.join(" ")}`,
    `style-src-elem ${styleSrcElem.join(" ")}`,
    `script-src ${scriptSrc.join(" ")}`,
    `script-src-elem ${scriptSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `font-src ${fontSrc.join(" ")}`,
    `img-src ${imgSrc.join(" ")}`,
    `frame-src ${frameSrc.join(" ")}`,
    `form-action ${formAction.join(" ")}`
  ].join("; ");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const requestUrl = getForwardedRequestUrl(context.request);
  const pathname = getPortalRequestPathname(requestUrl);
  const portalModule = getCurrentPortalModule(requestUrl);
  const portalSection = getCurrentPortalSection(requestUrl);
  const canonicalSectionUrl = getCanonicalSectionUrl(requestUrl);

  context.locals.portalModule = portalModule;
  context.locals.portalSection = portalSection;

  if (canonicalSectionUrl) {
    return context.redirect(toSafeRedirectLocation(canonicalSectionUrl));
  }

  const effectivePathname = getRewritePathForSectionHost(requestUrl) ?? pathname;

  if (isAssetRequest(pathname)) {
    return next();
  }

  const supabase = createSupabaseServerClient(context);
  context.locals.supabase = supabase;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  context.locals.user = user;
  context.locals.profile = null;

  if (user) {
    context.locals.profile = await getCurrentPortalProfile(supabase, user.id);
  }

  async function hasModuleMembership(userId: string) {
    const { count, error } = await supabase
      .from("client_memberships")
      .select("id, clients!inner(id)", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("clients.is_active", true)
      .eq("clients.portal_module", portalModule)
      .is("clients.deleted_at", null);

    if (error) {
      console.error("No pudimos validar la membresia del usuario para el modulo actual.", error);
      return false;
    }

    return (count ?? 0) > 0;
  }

  async function userCanAccessCurrentModule() {
    if (!user || !context.locals.profile?.isActive) return false;

    if (context.locals.profile.role === "admin") {
      return context.locals.profile.portalModules.includes(portalModule);
    }

    return hasModuleMembership(user.id);
  }

  if (user && (!context.locals.profile || !context.locals.profile.isActive)) {
    await supabase.auth.signOut();
    context.locals.user = null;
    context.locals.profile = null;

    const loginUrl = buildAuthUrl(requestUrl, "/login");
    loginUrl.searchParams.set(
      "error",
      "Tu usuario ya no se encuentra habilitado en el portal."
    );

    if (pathname !== "/login") {
      return context.redirect(toSafeRedirectLocation(loginUrl));
    }
  }

  if (effectivePathname.startsWith("/clientes") && moduleRequiresAuth(portalModule) && !user) {
    return context.redirect(toSafeRedirectLocation(buildAuthUrl(requestUrl, "/login")));
  }

  if (effectivePathname.startsWith("/clientes") && moduleRequiresAuth(portalModule) && user) {
    const hasAccess = await userCanAccessCurrentModule();
    if (!hasAccess) {
      await supabase.auth.signOut();
      return context.redirect(toSafeRedirectLocation(buildAuthUrl(requestUrl, "/login")));
    }
  }

  if (effectivePathname.startsWith("/admin")) {
    if (!moduleHasManagement(portalModule)) {
      return context.redirect(getSectionHrefForPath(requestUrl, "/clientes/aplicaciones"));
    }

    if (!user) {
      return context.redirect(toSafeRedirectLocation(buildAuthUrl(requestUrl, "/login")));
    }

    const canAccessManagement = await userCanAccessCurrentModule();

    if (
      !context.locals.profile ||
      context.locals.profile.role !== "admin" ||
      !canAccessManagement
    ) {
      return context.redirect(
        getSectionHrefForPath(requestUrl, "/clientes/aplicaciones")
      );
    }
  }

  if (!moduleRequiresAuth(portalModule) && (pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password")) {
    return context.redirect(getSectionHrefForPath(requestUrl, "/clientes/aplicaciones"));
  }

  if (pathname === "/login" && user) {
    const redirectUrl =
      context.locals.profile?.role === "admin" && context.locals.profile.portalModules.includes(portalModule) && moduleHasManagement(portalModule)
        ? getSectionHrefForPath(requestUrl, "/admin")
        : getSectionHrefForPath(requestUrl, "/clientes/aplicaciones");
    return context.redirect(redirectUrl);
  }

  if (effectivePathname !== pathname) {
    const rewriteUrl = new URL(effectivePathname + requestUrl.search, requestUrl);
    const response = await next(rewriteUrl);
    response.headers.set("Content-Security-Policy", buildContentSecurityPolicy());
    return response;
  }

  const response = await next();
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  return response;
});
