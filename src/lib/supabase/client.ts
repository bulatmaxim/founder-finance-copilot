"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseCookieOptions } from "@/lib/supabase/cookieOptions";

export function hasSupabaseBrowserEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase browser environment variables are not configured.");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: supabaseCookieOptions,
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}
