import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { generateResumePdf } from "@/lib/pdf";
import { getProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [app, profile] = await Promise.all([
    queryOne<{ tailored_resume: string | null; company_name: string }>(
      `SELECT a.tailored_resume, o.company_name FROM applications a
       JOIN opportunities o ON o.id = a.opportunity_id WHERE a.id = $1`,
      [Number(id)]
    ),
    getProfile(),
  ]);
  if (!app?.tailored_resume) return new NextResponse("Resume not found", { status: 404 });
  const pdf = await generateResumePdf(app.tailored_resume);
  const safeName = (profile.name || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeCo = (app.company_name || "Role").replace(/[^a-zA-Z0-9_-]/g, "_");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}_Resume_${safeCo}.pdf"`,
    },
  });
}
