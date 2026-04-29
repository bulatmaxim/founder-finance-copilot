import { NextResponse, type NextRequest } from "next/server";
import { cookieNamesFromRequest, logAuthDebug } from "@/lib/authDebug";
import { createRouteClient } from "@/lib/supabase/route";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = noStoreRedirect(new URL("/login", request.url));

  if (!hasSupabaseServerEnv()) {
    logAuthDebug("sign-out skipped", {
      pathname: request.nextUrl.pathname,
      requestCookieNames: cookieNamesFromRequest(request),
      responseCookieNames: [],
      reason: "missing Supabase environment",
      redirectTarget: "/login",
    });

    return response;
  }

  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;
  const { error } = await supabase.auth.signOut();

  routeClient.applyCookies(response);
  const responseCookieNames = routeClient.getCookieNamesToSet();

  logAuthDebug(error ? "sign-out failed" : "sign-out succeeded", {
    pathname: request.nextUrl.pathname,
    requestCookieNames: cookieNamesFromRequest(request),
    responseCookieNames,
    hasResponseCookies: responseCookieNames.length > 0,
    hasSetCookieHeader: response.headers.has("set-cookie"),
    reason: error?.message ?? null,
    redirectTarget: "/login",
  });

  return response;
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
