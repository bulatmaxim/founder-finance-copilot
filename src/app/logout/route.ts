import { NextResponse, type NextRequest } from "next/server";
import { createClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (hasSupabaseServerEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
