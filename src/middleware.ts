import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/types";

/**
 * Helper to construct redirect response preserving modified cookies
 */
function createRedirectResponse(targetPath: string, request: NextRequest, baseResponse: NextResponse): NextResponse {
  const url = new URL(targetPath, request.url);
  const redirectResponse = NextResponse.redirect(url);
  
  // Forward cookies to prevent session state desynchronization
  baseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value);
  });
  
  return redirectResponse;
}

/**
 * Task 12: Role-Based Security Middleware, Route Guards & Profile Verification
 * 
 * Enforces strict server-side path interception using @supabase/ssr across:
 * - Unauthenticated session redirects
 * - Profile onboarding verification
 * - Approval state gatekeeping (is_approved === true)
 * - Strict role boundaries (/admin/*, /staff/*, /manager/*, /student/*)
 * - Auth loop suppression for active sessions
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Initialize Response
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

  // 2. Initialize Supabase SSR Client with cookie adapter
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

  // 3. Authenticate User Session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedPath =
    pathname.startsWith("/student") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/counter") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/manager");

  const isAuthPath =
    pathname === "/auth/login" ||
    pathname === "/auth/onboarding" ||
    pathname === "/auth/profile-setup" ||
    pathname === "/auth/pending";

  // 4. Rule: Unauthenticated Users
  if (!user) {
    if (isProtectedPath) {
      const redirectUrl = `/auth/login?redirect=${encodeURIComponent(pathname)}`;
      return createRedirectResponse(redirectUrl, request, response);
    }
    return response;
  }

  // 5. Fetch Profile Row from public.users
  const { data: profile } = await supabase
    .from("users")
    .select("id, role, is_approved, student_id, room_number")
    .eq("id", user.id)
    .maybeSingle();

  // 6. Rule: Profile Setup Check (User in auth.users but has not completed profile)
  if (!profile || !profile.student_id) {
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

  // 7. Rule: Approval Check (Profile exists but is_approved === false)
  if (profile.is_approved === false) {
    if (pathname !== "/auth/pending" && !pathname.startsWith("/api") && !pathname.startsWith("/auth/logout")) {
      return createRedirectResponse("/auth/pending", request, response);
    }
    return response;
  }

  // Determine user's designated landing route based on role
  const userRole: UserRole = (profile.role as UserRole) || "student";
  let defaultDashboard = "/student/dashboard";
  if (userRole === "admin") {
    defaultDashboard = "/admin/users";
  } else if (userRole === "staff" || userRole === "manager") {
    defaultDashboard = "/counter";
  }

  // 8. Rule: Auth Flow Loop Prevention
  if (isAuthPath) {
    return createRedirectResponse(defaultDashboard, request, response);
  }

  // 9. Rule: Role-Based Route Boundaries
  if (pathname.startsWith("/admin")) {
    if (userRole !== "admin") {
      return createRedirectResponse("/student/dashboard", request, response);
    }
  }

  if (pathname.startsWith("/staff") || pathname.startsWith("/counter")) {
    if (userRole !== "staff" && userRole !== "manager" && userRole !== "admin") {
      return createRedirectResponse("/student/dashboard", request, response);
    }
  }

  // /manager/*: Accessible only by role IN ('manager', 'admin')
  if (pathname.startsWith("/manager")) {
    if (userRole !== "manager" && userRole !== "admin") {
      return createRedirectResponse("/student/dashboard", request, response);
    }
  }

  // /student/*: Student views
  if (pathname.startsWith("/student")) {
    // If staff or manager accesses /student/dashboard, allow view or redirect to landing screen
    // Students trying to access admin/staff routes are already blocked above
    return response;
  }

  return response;
}

/**
 * Matcher Optimization
 * Bypasses static assets, Next.js internal chunks, favicon, manifest, and image formats
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
