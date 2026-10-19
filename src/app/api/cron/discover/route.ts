import { NextResponse, type NextRequest } from "next/server";
import { rescoreAll, runDiscovery } from "@/lib/opportunities";
import { autoPrepareQueue } from "@/app/actions";
import { getProfile, saveProfile } from "@/lib/profile";
import { query } from "@/lib/db";

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
  const doRescore = req.nextUrl.searchParams.get("rescore") === "1";

  // Ensure default positioning/stack/compensation tiers are persisted
  const profile = await getProfile();
  await saveProfile(profile);

  const rescored = doRescore ? await rescoreAll() : 0;
  const report = prepOnly ? null : await runDiscovery();
  const prep = await autoPrepareQueue();
  const tiers = await query<{ tier: string; count: number }>(
    "SELECT tier, COUNT(*)::int AS count FROM opportunities GROUP BY tier ORDER BY tier"
  );
  return NextResponse.json({ rescored, tiers, report, prep });
}
