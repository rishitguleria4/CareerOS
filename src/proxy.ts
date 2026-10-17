import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionToken } from "@/lib/auth";

/** Single-user gate. Local dev (no APP_PASSWORD) is open; on Vercel the app refuses to serve without a password. */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/cron")) return NextResponse.next(); // protected by CRON_SECRET in the route
  const token = await sessionToken();
  if (!token) {
    if (process.env.VERCEL) {
      return new NextResponse("Set APP_PASSWORD in your Vercel project environment variables, then redeploy.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }
  if (pathname === "/login") return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value === token) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

