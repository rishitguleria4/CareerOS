import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appId = Number(id);
  const [app, profile] = await Promise.all([
    queryOne<{ tailored_resume: string | null; company_name: string }>(
      `SELECT a.tailored_resume, o.company_name
       FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
       WHERE a.id = $1`,
      [appId]
    ),
    getProfile(),
  ]);
  if (!app) return new NextResponse("Application not found", { status: 404 });

  const safeName = (profile.name || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeCompany = (app.company_name || "Role").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeName}_Resume_${safeCompany}.tex`;

  return new NextResponse(app.tailored_resume || "", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
