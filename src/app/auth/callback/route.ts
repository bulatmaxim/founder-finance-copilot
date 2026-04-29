import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/authRedirects";
import { createClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

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

      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
