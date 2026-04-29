import { NextResponse, type NextRequest } from "next/server";
import { cookieNamesFromRequest, logAuthDebug } from "@/lib/authDebug";
import { safeInternalPath } from "@/lib/authRedirects";
import { createRouteClient } from "@/lib/supabase/route";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeInternalPath(requestUrl.searchParams.get("next"), "/dashboard");

  if (code && hasSupabaseServerEnv()) {
    const routeClient = createRouteClient(request);
    const { supabase } = routeClient;
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("authError", error.message);
      const response = noStoreRedirect(loginUrl);

      routeClient.applyCookies(response);
      logAuthDebug("auth callback exchange failed", {
        pathname: request.nextUrl.pathname,
        requestCookieNames: cookieNamesFromRequest(request),
        responseCookieNames: routeClient.getCookieNamesToSet(),
        reason: error.message,
        redirectTarget: "/login",
      });

      return response;
    }

    const response = noStoreRedirect(new URL(next, request.url));

    routeClient.applyCookies(response);
    logAuthDebug("auth callback exchange succeeded", {
      pathname: request.nextUrl.pathname,
      requestCookieNames: cookieNamesFromRequest(request),
      responseCookieNames: routeClient.getCookieNamesToSet(),
      hasResponseCookies: routeClient.getCookieNamesToSet().length > 0,
      redirectTarget: next,
    });

    return response;
  }

  logAuthDebug("auth callback without code", {
    pathname: request.nextUrl.pathname,
    requestCookieNames: cookieNamesFromRequest(request),
    responseCookieNames: [],
    redirectTarget: next,
  });

  return noStoreRedirect(new URL(next, request.url));
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
