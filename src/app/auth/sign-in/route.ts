import { NextResponse, type NextRequest } from "next/server";
import { cookieNamesFromRequest, logAuthDebug } from "@/lib/authDebug";
import { safeInternalPath } from "@/lib/authRedirects";
import { createRouteClient } from "@/lib/supabase/route";
import { hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await readSignInBody(request);
  const next = safeInternalPath(body.next, "/dashboard");

  if (!hasSupabaseServerEnv()) {
    return authErrorRedirect(request, "Supabase is not configured.", next);
  }

  if (!body.email || !body.password) {
    return authErrorRedirect(request, "Email and password are required.", next);
  }

  const routeClient = createRouteClient(request);
  const { supabase } = routeClient;
  const { error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });
  const response = error
    ? authErrorRedirect(request, error.message, next)
    : noStoreRedirect(new URL(next, request.url));

  routeClient.applyCookies(response);
  const responseCookieNames = routeClient.getCookieNamesToSet();
  const hasSetCookieHeader = response.headers.has("set-cookie");

  logAuthDebug(error ? "sign-in failed" : "sign-in succeeded", {
    pathname: request.nextUrl.pathname,
    requestCookieNames: cookieNamesFromRequest(request),
    responseCookieNames,
    hasResponseCookies: responseCookieNames.length > 0,
    hasSetCookieHeader,
    reason: error?.message ?? null,
    redirectTarget: error ? "/login" : next,
  });

  return response;
}

async function readSignInBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
      next?: unknown;
    } | null;

    return {
      email: typeof body?.email === "string" ? body.email : "",
      password: typeof body?.password === "string" ? body.password : "",
      next: typeof body?.next === "string" ? body.next : null,
    };
  }

  const formData = await request.formData();

  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? "") || null,
  };
}

function authErrorRedirect(request: NextRequest, message: string, next: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("authError", message);
  url.searchParams.set("next", next);

  return noStoreRedirect(url);
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
