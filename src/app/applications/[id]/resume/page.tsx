import { notFound } from "next/navigation";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Minimal markdown → HTML for the resume subset we generate (headings, bold, italics, bullets). */
function md(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/_(.+?)_/g, "<i>$1</i>");
  const out: string[] = [];
  let inList = false;
  for (const raw of src.split("\n")) {
    const line = raw.trimEnd();
    const li = line.match(/^- (.*)/);
    if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (line.startsWith("# ")) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

export default async function ResumePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await queryOne<{ tailored_resume: string | null }>("SELECT tailored_resume FROM applications WHERE id=$1", [Number(id)]);
  if (!a?.tailored_resume) notFound();
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white text-black">
      <style>{`
        .resume{max-width:780px;margin:0 auto;padding:40px;font-family:Georgia,serif;font-size:13px;line-height:1.5}
        .resume h1{font-size:26px;margin:0}
        .resume h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #999;margin:18px 0 6px;padding-bottom:2px}
        .resume p{margin:4px 0}.resume ul{margin:4px 0 4px 18px;padding:0}
        .bar{position:sticky;top:0;background:#111;color:#fff;padding:8px 16px;font:13px sans-serif}
        @media print{.bar{display:none}.resume{padding:0}}
      `}</style>
      <div className="bar">Use your browser’s Print → “Save as PDF”.</div>
      <div className="resume" dangerouslySetInnerHTML={{ __html: md(a.tailored_resume) }} />
    </div>
  );
}

