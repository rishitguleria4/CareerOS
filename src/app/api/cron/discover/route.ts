import { NextResponse, type NextRequest } from "next/server";
import { runDiscovery } from "@/lib/opportunities";
import { autoPrepareQueue } from "@/app/actions";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Vercel Cron hits this daily (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!secret && process.env.VERCEL) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 401 });
  }
  const prepOnly = req.nextUrl.searchParams.get("prepOnly") === "1";
  const report = prepOnly ? null : await runDiscovery();
  const prep = await autoPrepareQueue(6);
  return NextResponse.json({ report, prep });
}

