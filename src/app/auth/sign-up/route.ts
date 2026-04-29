import { NextResponse, type NextRequest } from "next/server";
import { cookieNamesFromRequest, logAuthDebug } from "@/lib/authDebug";
import { getRequestOrigin } from "@/lib/supabase/cookieOptions";
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
    fullName?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName : "";

  if (!email || !password) {
    return noStoreJson(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;
  const origin = getRequestOrigin(request);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    logAuthDebug("sign-up failed", {
      pathname: request.nextUrl.pathname,
      requestCookieNames: cookieNamesFromRequest(request),
      responseCookieNames: routeClient.getCookieNamesToSet(),
      reason: error.message,
      redirectTarget: null,
    });
    return noStoreJson({ error: error.message }, { status: 400 });
  }

  if (data.user && data.session) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      return noStoreJson({ error: profileError.message }, { status: 400 });
    }
  }

  const next = data.session ? "/onboarding" : "/login";
  const response = noStoreJson({
    hasSession: Boolean(data.session),
    next,
  });

  routeClient.applyCookies(response);
  logAuthDebug("sign-up succeeded", {
    pathname: request.nextUrl.pathname,
    requestCookieNames: cookieNamesFromRequest(request),
    responseCookieNames: routeClient.getCookieNamesToSet(),
    hasResponseCookies: routeClient.getCookieNamesToSet().length > 0,
    hasSession: Boolean(data.session),
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
