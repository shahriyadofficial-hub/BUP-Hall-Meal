import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Helper to construct redirect response preserving modified cookies
 */
function createRedirectResponse(targetPath: string, request: NextRequest, baseResponse: NextResponse): NextResponse {
  const url = new URL(targetPath, request.url);
  const redirectResponse = NextResponse.redirect(url);
  
  // Forward cookies to maintain session state integrity
  baseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value);
  });
  
  return redirectResponse;
}

/**
 * Role-Based Access Control (RBAC) & Onboarding Gatekeeper Middleware
 * 
 * Routes:
 * - student -> /student/dashboard
 * - staff   -> /counter
 * - admin   -> /admin
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  // Initialize Supabase SSR Client
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedPath =
    pathname.startsWith("/student") ||
    pathname.startsWith("/counter") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/manager") ||
    pathname === "/auth/profile-setup";

  const isAuthPath =
    pathname === "/auth/login" ||
    pathname === "/auth/profile-setup" ||
    pathname === "/auth/onboarding";

  // 1. Unauthenticated users accessing protected routes
  if (!user) {
    if (isProtectedPath) {
      const loginUrl = `/auth/login?redirect=${encodeURIComponent(pathname)}`;
      return createRedirectResponse(loginUrl, request, response);
    }
    return response;
  }

  // 2. Fetch user's profile from public.users
  const { data: profile } = await supabase
    .from("users")
    .select("id, role, is_onboarded, student_id, room_number")
    .eq("id", user.id)
    .maybeSingle();

  const isOnboarded = Boolean(
    profile?.is_onboarded === true ||
    (profile?.is_onboarded !== false && profile?.student_id && profile?.room_number)
  );

  const role = (profile?.role as "student" | "staff" | "admin") || "student";

  // Determine home landing page by role
  let homePage = "/student/dashboard";
  if (role === "admin") {
    homePage = "/admin";
  } else if (role === "staff") {
    homePage = "/counter";
  }

  // 3. If NOT onboarded and not currently on /auth/profile-setup
  if (!isOnboarded) {
    if (
      pathname !== "/auth/profile-setup" &&
      pathname !== "/auth/onboarding" &&
      !pathname.startsWith("/api") &&
      !pathname.startsWith("/auth/logout") &&
      !pathname.startsWith("/auth/callback")
    ) {
      return createRedirectResponse("/auth/profile-setup", request, response);
    }
    return response;
  }

  // 4. If ONBOARDED and visiting auth pages (/auth/login or /auth/profile-setup)
  if (isAuthPath) {
    return createRedirectResponse(homePage, request, response);
  }

  // 5. Role-based route restrictions
  // /admin/* requires role === 'admin'
  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return createRedirectResponse(homePage, request, response);
    }
  }

  // /counter/* requires role IN ('staff', 'admin')
  if (pathname.startsWith("/counter") || pathname.startsWith("/staff")) {
    if (role !== "staff" && role !== "admin") {
      return createRedirectResponse(homePage, request, response);
    }
  }

  // /student/* requires valid authenticated onboarded user (students, staff, admin can view)
  if (pathname.startsWith("/student")) {
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
