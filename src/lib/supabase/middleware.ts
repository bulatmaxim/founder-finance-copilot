import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { logAuthDebug } from "@/lib/authDebug";
import { supabaseCookieOptions } from "@/lib/supabase/cookieOptions";

const protectedRoutes = [
  "/dashboard",
  "/account-mapping",
  "/budget-vs-actuals",
  "/company-profile",
  "/data-entry",
  "/data-room",
  "/decision-center",
  "/forecast-versions",
  "/forecasts",
  "/mapping",
  "/onboarding",
  "/reports",
  "/settings",
  "/uploads",
];

const authRoutes = ["/login", "/signup"];

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    logProxy(request, {
      hasUser: false,
      responseCookieNames: [],
      redirectReason: "missing Supabase environment",
    });
    return withAuthResponseHeaders(NextResponse.next({ request }));
  }

  let response = withAuthResponseHeaders(NextResponse.next({ request }));
  const responseCookieNames = new Set<string>();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: supabaseCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = withAuthResponseHeaders(NextResponse.next({ request }));
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
          responseCookieNames.add(name);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute =
    pathname === "/" ||
    protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", safeNextPath(request));
    logProxy(request, {
      hasUser: false,
      responseCookieNames: [...responseCookieNames].sort(),
      redirectReason: "protected route without Supabase user",
      redirectTarget: `${url.pathname}${url.search}`,
    });
    return redirectWithCookies(url, response);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    logProxy(request, {
      hasUser: true,
      responseCookieNames: [...responseCookieNames].sort(),
      redirectReason: "authenticated user on auth route",
      redirectTarget: url.pathname,
    });
    return redirectWithCookies(url, response);
  }

  if (user && isProtectedRoute && pathname !== "/onboarding") {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (!company) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      logProxy(request, {
        hasUser: true,
        responseCookieNames: [...responseCookieNames].sort(),
        redirectReason: "authenticated user missing company",
        redirectTarget: url.pathname,
      });
      return redirectWithCookies(url, response);
    }
  }

  if (user && pathname === "/onboarding") {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (company) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      logProxy(request, {
        hasUser: true,
        responseCookieNames: [...responseCookieNames].sort(),
        redirectReason: "onboarding complete",
        redirectTarget: url.pathname,
      });
      return redirectWithCookies(url, response);
    }
  }

  logProxy(request, {
    hasUser: Boolean(user),
    responseCookieNames: [...responseCookieNames].sort(),
    redirectReason: null,
  });

  return response;
}

function safeNextPath(request: NextRequest) {
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  return path.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
}

function redirectWithCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);

  response.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return withAuthResponseHeaders(redirectResponse);
}

function withAuthResponseHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Vary", "Cookie");

  return response;
}

function logProxy(
  request: NextRequest,
  {
    hasUser,
    responseCookieNames,
    redirectReason,
    redirectTarget = null,
  }: {
    hasUser: boolean;
    responseCookieNames: string[];
    redirectReason: string | null;
    redirectTarget?: string | null;
  },
) {
  logAuthDebug("proxy route check", {
    pathname: request.nextUrl.pathname,
    requestCookieNames: request.cookies
      .getAll()
      .map((cookie) => cookie.name)
      .sort(),
    responseCookieNames,
    hasUser,
    redirectReason,
    redirectTarget,
  });
}
