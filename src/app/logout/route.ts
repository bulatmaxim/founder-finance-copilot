import { NextResponse, type NextRequest } from "next/server";
import { createClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (hasSupabaseServerEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
