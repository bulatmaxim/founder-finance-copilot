import { createServerClient } from "@supabase/ssr";
import { type NextRequest, type NextResponse } from "next/server";
import { supabaseCookieOptions } from "@/lib/supabase/cookieOptions";

export function createRouteClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookiesToSet: {
    name: string;
    value: string;
    options?: Parameters<NextResponse["cookies"]["set"]>[2];
  }[] = [];

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase route environment variables are not configured.");
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: supabaseCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies) {
        nextCookies.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          cookiesToSet.push({ name, value, options });
        });
      },
    },
  });

  return {
    supabase,
    getCookieNamesToSet() {
      return cookiesToSet.map((cookie) => cookie.name).sort();
    },
    applyCookies(response: NextResponse) {
      cookiesToSet.forEach((cookie) => {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      });

      return response;
    },
  };
}
