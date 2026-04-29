import { NextResponse, type NextRequest } from "next/server";
import { cookieNamesFromRequest, logAuthDebug } from "@/lib/authDebug";
import { safeInternalPath } from "@/lib/authRedirects";
import { createRouteClient } from "@/lib/supabase/route";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!hasSupabaseServerEnv()) {
    return noStoreJson(
      { error: "Supabase is not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    next?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return noStoreJson(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  const next = safeInternalPath(
    typeof body?.next === "string" ? body.next : null,
    "/dashboard",
  );

  if (error) {
    logAuthDebug("sign-in failed", {
      pathname: request.nextUrl.pathname,
      requestCookieNames: cookieNamesFromRequest(request),
      responseCookieNames: routeClient.getCookieNamesToSet(),
      reason: error.message,
      redirectTarget: null,
    });
    return noStoreJson({ error: error.message }, { status: 401 });
  }

  const response = noStoreJson({
    next,
  });

  routeClient.applyCookies(response);
  logAuthDebug("sign-in succeeded", {
    pathname: request.nextUrl.pathname,
    requestCookieNames: cookieNamesFromRequest(request),
    responseCookieNames: routeClient.getCookieNamesToSet(),
    hasResponseCookies: routeClient.getCookieNamesToSet().length > 0,
    redirectTarget: next,
  });

  return response;
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
