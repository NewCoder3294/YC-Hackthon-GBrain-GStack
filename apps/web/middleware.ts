import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");
  // Routes anyone (even logged-out SF residents) can read. The dashboard's
  // pure OSINT views — anything that doesn't write or pull restricted data.
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/about" ||
    pathname === "/map" ||
    pathname === "/live" ||
    pathname.startsWith("/live/") ||
    pathname === "/feed" ||
    pathname.startsWith("/feed/") ||
    pathname === "/alerts" ||
    pathname === "/privacy";

  if (!user && !isAuthRoute && !isPublicRoute) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && pathname === "/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron|api/hls|api/camera-frame|api/dispatch|api/live|api/openclaw|api/seed|api/contribute|api/contributor-waitlist|api/alerts|api/bridge|c/|contribute|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
