import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/authRedirects";
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return noStoreJson({ error: error.message }, { status: 401 });
  }

  return noStoreJson({
    next: safeInternalPath(
      typeof body?.next === "string" ? body.next : null,
      "/dashboard",
    ),
  });
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}
