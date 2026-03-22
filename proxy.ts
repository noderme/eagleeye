import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Check mock mode directly from env (can't import from lib/config in middleware context)
const MOCK_MODE =
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" ||
  (process.env.NODE_ENV === "development" &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL === "http://localhost:8000" ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")));

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  // In mock mode, skip all auth checks and allow access to all routes
  if (MOCK_MODE) {
    return res;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth check failed — proceed without redirecting
    return res;
  }

  const path = req.nextUrl.pathname;

  if (!user && path.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (user && path === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
