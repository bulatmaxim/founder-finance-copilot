import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/authRedirects";
import { createClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeInternalPath(requestUrl.searchParams.get("next"), "/dashboard");

  if (code && hasSupabaseServerEnv()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("authError", error.message);

      return noStoreRedirect(loginUrl);
    }
  }

  return noStoreRedirect(new URL(next, request.url));
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
