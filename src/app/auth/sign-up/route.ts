import { NextResponse, type NextRequest } from "next/server";
import { getRequestOrigin } from "@/lib/supabase/cookieOptions";
import { createClient, hasSupabaseServerEnv } from "@/lib/supabase/server";

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

  const supabase = await createClient();
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

  return noStoreJson({
    hasSession: Boolean(data.session),
    next: data.session ? "/onboarding" : "/login",
  });
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
