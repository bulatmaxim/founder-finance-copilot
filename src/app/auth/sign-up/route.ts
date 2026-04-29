import { NextResponse, type NextRequest } from "next/server";
import { cookieNamesFromRequest, logAuthDebug } from "@/lib/authDebug";
import { getRequestOrigin } from "@/lib/supabase/cookieOptions";
import { createRouteClient } from "@/lib/supabase/route";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await readSignUpBody(request);

  if (!hasSupabaseServerEnv()) {
    return authErrorRedirect(request, "Supabase is not configured.");
  }

  if (!body.email || !body.password) {
    return authErrorRedirect(request, "Email and password are required.");
  }

  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;
  const origin = getRequestOrigin(request);
  const { data, error } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: {
      data: { full_name: body.fullName },
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
    return authErrorRedirect(request, error.message);
  }

  if (data.user && data.session) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      email: body.email,
      full_name: body.fullName,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      return authErrorRedirect(request, profileError.message);
    }
  }

  const next = data.session ? "/onboarding" : "/login";
  const response = noStoreRedirect(new URL(next, request.url));

  routeClient.applyCookies(response);
  const responseCookieNames = routeClient.getCookieNamesToSet();
  logAuthDebug("sign-up succeeded", {
    pathname: request.nextUrl.pathname,
    requestCookieNames: cookieNamesFromRequest(request),
    responseCookieNames,
    hasResponseCookies: responseCookieNames.length > 0,
    hasSetCookieHeader: response.headers.has("set-cookie"),
    hasSession: Boolean(data.session),
    redirectTarget: next,
  });

  return response;
}

async function readSignUpBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
      fullName?: unknown;
    } | null;

    return {
      email: typeof body?.email === "string" ? body.email : "",
      password: typeof body?.password === "string" ? body.password : "",
      fullName: typeof body?.fullName === "string" ? body.fullName : "",
    };
  }

  const formData = await request.formData();

  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
  };
}

function authErrorRedirect(request: NextRequest, message: string) {
  const url = new URL("/signup", request.url);
  url.searchParams.set("authError", message);

  return noStoreRedirect(url);
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
