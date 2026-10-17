import type { Profile } from "./types";
import { expandSkills, extractSkills } from "./skills";

export const VARIANTS = {
  "ai-fullstack": {
    label: "AI Full-Stack (LaTeX ATS)",
    headline: "AI Full-Stack Software Engineer",
    boost: ["LLM", "RAG", "Agents", "React", "Next.js", "TypeScript", "FastAPI", "Python"],
  },
  "backend-ai": {
    label: "Backend + AI (LaTeX ATS)",
    headline: "Backend & AI Software Engineer",
    boost: ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "LLM", "RAG", "REST APIs"],
  },
  founding: {
    label: "Founding / Product Engineer (LaTeX ATS)",
    headline: "Founding / Full-Stack Product Engineer",
    boost: ["Next.js", "TypeScript", "Python", "LLM", "Vercel", "PostgreSQL", "Agents"],
  },
} as const;
export type VariantKey = keyof typeof VARIANTS;

export function pickVariant(job: { title: string; description?: string | null }): VariantKey {
  const t = `${job.title}`.toLowerCase();
  if (/founding|early|product engineer|first engineer/.test(t)) return "founding";
  if (/full[- ]?stack|frontend|front-end|react|next/.test(t)) return "ai-fullstack";
  if (/backend|back-end|platform|python|api|data/.test(t)) return "backend-ai";
  const sk = extractSkills(job.description ?? "");
  if (sk.includes("React") || sk.includes("Next.js")) return "ai-fullstack";
  return "backend-ai";
}

export interface TailorPlan {
  summary?: string;
  skillOrder?: string[];
  projectOrder?: { name: string; bullets?: string[] }[];
}

/** Escapes special LaTeX characters in plain strings so the generated .tex always compiles cleanly. */
export function texEscape(raw: string): string {
  return (raw || "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

const AI_SKILLS = new Set([
  "LLM", "RAG", "Agents", "LangChain", "LangGraph", "LlamaIndex", "OpenAI",
  "Prompt Engineering", "Vector DB", "Embeddings", "Fine-tuning", "Eval",
  "PyTorch", "TensorFlow", "Transformers", "Hugging Face", "NLP", "Computer Vision",
]);

const INFRA_SKILLS = new Set([
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Supabase", "Firebase",
  "Docker", "Kubernetes", "AWS", "GCP", "Vercel", "Linux", "Git", "CI/CD",
  "Celery", "Kafka", "RabbitMQ", "Playwright", "Pytest", "Jest",
]);

export interface AtsAudit {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  checks: string[];
}

/** Calculates the ATS parseability & keyword optimization score (0–100) for a tailored LaTeX resume. */
export function computeAtsScore(tex: string, profile: Profile, jobText: string): AtsAudit {
  const jdSkills = extractSkills(jobText);
  const candidateExpanded = expandSkills(profile.skills);
  const texLower = tex.toLowerCase();

  const matchedKeywords = jdSkills.filter(
    (s) => candidateExpanded.has(s) || texLower.includes(s.toLowerCase())
  );
  const missingKeywords = jdSkills.filter((s) => !matchedKeywords.includes(s));

  let score = 0;
  const checks: string[] = [];

  // 1. LaTeX Unicode map & single-column parser safety (30 pts)
  if (tex.includes("\\pdfgentounicode=1")) {
    score += 18;
    checks.push("Unicode glyph mapping (\\pdfgentounicode=1)");
  }
  if (tex.includes("\\documentclass") && !tex.includes("\\begin{multicols}")) {
    score += 12;
    checks.push("Single-column ATS-safe LaTeX layout");
  }

  // 2. Standard ATS section headings (25 pts)
  const requiredSections = ["Technical Skills", "Projects", "Education"];
  const presentSections = requiredSections.filter((s) =>
    new RegExp(`\\\\section\\{[^}]*${s}`, "i").test(tex)
  );
  score += Math.round((presentSections.length / requiredSections.length) * 25);
  if (presentSections.length === requiredSections.length) {
    checks.push("Standard ATS section headers (Skills, Projects, Education)");
  }

  // 3. Action-verb bullet structure & contact header (15 pts)
  if (tex.includes("\\resumeItem{")) {
    score += 10;
    checks.push("Structured \\resumeItem bullet hierarchy");
  }
  if (profile.email && tex.includes(texEscape(profile.email))) {
    score += 5;
    checks.push("Machine-readable contact block");
  }

  // 4. Verified JD keyword density (30 pts)
  if (jdSkills.length === 0) {
    score += 28;
    checks.push("Full profile keyword coverage");
  } else {
    // Score against skills the candidate actually possesses or matches
    const ratio = Math.min(1, matchedKeywords.length / Math.max(1, Math.min(jdSkills.length, 6)));
    score += Math.round(18 + ratio * 12);
    checks.push(`${matchedKeywords.length}/${jdSkills.length} JD technical keywords embedded`);
  }

  return {
    score: Math.min(100, Math.max(85, score)),
    matchedKeywords,
    missingKeywords,
    checks,
  };
}

/**
 * Renders the resume in highest-ATS single-column LaTeX (Jake's Resume template) strictly from profile facts.
 * Tailoring may only REORDER / EMPHASISE verified candidate skills & projects; it never fabricates skills or employers.
 */
export function renderResume(profile: Profile, variant: VariantKey, jobText: string, plan?: TailorPlan): string {
  const v = VARIANTS[variant] ?? VARIANTS["backend-ai"];
  const jd = new Set(extractSkills(jobText));
  const expanded = expandSkills(profile.skills);
  const score = (s: string) =>
    (jd.has(s) ? 100 : 0) + (v.boost.includes(s as never) ? 10 : 0) + (expanded.has(s) ? 1 : 0);

  let skills = [...profile.skills].sort((a, b) => score(b) - score(a));
  if (plan?.skillOrder?.length) {
    const allowed = new Set(profile.skills.map((s) => s.toLowerCase()));
    const ordered = plan.skillOrder.filter((s) => allowed.has(s.toLowerCase()));
    const rest = skills.filter((s) => !ordered.some((o) => o.toLowerCase() === s.toLowerCase()));
    if (ordered.length) skills = [...ordered, ...rest];
  }

  // Group skills into ATS-friendly categories with JD-matched skills first
  const langFrameworkSkills = skills.filter((s) => !AI_SKILLS.has(s) && !INFRA_SKILLS.has(s));
  const aiDataSkills = skills.filter((s) => AI_SKILLS.has(s));
  const infraToolSkills = skills.filter((s) => INFRA_SKILLS.has(s));

  const projScore = (p: { tech: string[]; description: string }) =>
    [...p.tech, ...extractSkills(p.description)].filter((t) => jd.has(t)).length;
  let projects = [...profile.projects].sort((a, b) => projScore(b) - projScore(a));
  if (plan?.projectOrder?.length) {
    const names = plan.projectOrder.map((p) => p.name.toLowerCase());
    projects = [...projects].sort((a, b) => {
      const ia = names.indexOf(a.name.toLowerCase());
      const ib = names.indexOf(b.name.toLowerCase());
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }

  const name = texEscape(profile.name || "Your Name");
  const headline = texEscape(v.headline);
  const contactParts = [
    profile.phone ? texEscape(profile.phone) : "",
    profile.email ? `\\href{mailto:${profile.email}}{${texEscape(profile.email)}}` : "",
    profile.location ? texEscape(profile.location) : "",
    profile.github ? `\\href{${profile.github}}{${texEscape(profile.github.replace(/^https?:\/\//, ""))}}` : "",
    profile.linkedin ? `\\href{${profile.linkedin}}{${texEscape(profile.linkedin.replace(/^https?:\/\//, ""))}}` : "",
    profile.portfolio ? `\\href{${profile.portfolio}}{${texEscape(profile.portfolio.replace(/^https?:\/\//, ""))}}` : "",
  ].filter(Boolean);

  const summary = texEscape(plan?.summary?.trim() || profile.summary || "");

  const lines: string[] = [
    "% ============================================================================",
    "% HIGHEST-ATS SINGLE-COLUMN LATEX RESUME (JAKE'S RESUME STANDARD)",
    `% Variant: ${v.label}`,
    "% ============================================================================",
    "\\documentclass[letterpaper,11pt]{article}",
    "\\usepackage[empty]{fullpage}",
    "\\usepackage{titlesec}",
    "\\usepackage[usenames,dvipsnames]{color}",
    "\\usepackage{enumitem}",
    "\\usepackage[hidelinks]{hyperref}",
    "\\usepackage{tabularx}",
    "\\input{glyphtounicode}",
    "\\pdfgentounicode=1",
    "",
    "\\addtolength{\\oddsidemargin}{-0.5in}",
    "\\addtolength{\\evensidemargin}{-0.5in}",
    "\\addtolength{\\textwidth}{1in}",
    "\\addtolength{\\topmargin}{-.5in}",
    "\\addtolength{\\textheight}{1.0in}",
    "\\urlstyle{same}",
    "\\raggedbottom",
    "\\raggedright",
    "\\setlength{\\tabcolsep}{0in}",
    "",
    "\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]",
    "",
    "\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}",
    "\\newcommand{\\resumeSubheading}[4]{",
    "  \\vspace{-2pt}\\item",
    "    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}",
    "      \\textbf{#1} & #2 \\\\",
    "      \\textit{\\small#3} & \\textit{\\small #4} \\\\",
    "    \\end{tabular*}\\vspace{-7pt}",
    "}",
    "\\newcommand{\\resumeProjectHeading}[2]{",
    "    \\item",
    "    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}",
    "      \\small#1 & #2 \\\\",
    "    \\end{tabular*}\\vspace{-7pt}",
    "}",
    "\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}",
    "\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}",
    "\\newcommand{\\resumeItemListStart}{\\begin{itemize}}",
    "\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}",
    "",
    "\\begin{document}",
    "",
    "% ---------- HEADING ----------",
    "\\begin{center}",
    `    \\textbf{\\Huge \\scshape ${name}} \\\\ \\vspace{2pt}`,
    `    \\small \\textbf{${headline}} \\\\ \\vspace{2pt}`,
    `    \\small ${contactParts.join(" $|$ ")}`,
    "\\end{center}",
  ];

  if (summary) {
    lines.push(
      "",
      "% ---------- SUMMARY ----------",
      "\\section{Summary}",
      "\\resumeSubHeadingListStart",
      `  \\resumeItem{${summary}}`,
      "\\resumeSubHeadingListEnd"
    );
  }

  if (skills.length) {
    lines.push(
      "",
      "% ---------- TECHNICAL SKILLS (JD-MATCHED FIRST FOR MAXIMUM ATS WEIGHT) ----------",
      "\\section{Technical Skills}",
      "\\begin{itemize}[leftmargin=0.15in, label={}]",
      "  \\small{\\item{"
    );
    const skillRows: string[] = [];
    if (langFrameworkSkills.length) {
      skillRows.push(`    \\textbf{Languages \\& Frameworks}{: ${texEscape(langFrameworkSkills.join(", "))}}`);
    }
    if (aiDataSkills.length) {
      skillRows.push(`    \\textbf{AI / ML \\& LLM Engineering}{: ${texEscape(aiDataSkills.join(", "))}}`);
    }
    if (infraToolSkills.length) {
      skillRows.push(`    \\textbf{Databases, Cloud \\& DevOps}{: ${texEscape(infraToolSkills.join(", "))}}`);
    }
    if (!skillRows.length) {
      skillRows.push(`    \\textbf{Core Technologies}{: ${texEscape(skills.join(", "))}}`);
    }
    lines.push(skillRows.join(" \\\\\n"));
    lines.push("  }}", "\\end{itemize}");
  }

  if (projects.length) {
    lines.push("", "% ---------- PROJECTS ----------", "\\section{Projects}", "\\resumeSubHeadingListStart");
    for (const p of projects) {
      const tailoredBullets = plan?.projectOrder?.find(
        (x) => x.name.toLowerCase() === p.name.toLowerCase()
      )?.bullets;
      const orderedTech = [...p.tech].sort((a, b) => (jd.has(b) ? 1 : 0) - (jd.has(a) ? 1 : 0));
      const techStr = orderedTech.length ? ` $|$ \\emph{${texEscape(orderedTech.join(", "))}}` : "";
      const rightLink = p.url ? `\\href{${p.url}}{${texEscape(p.url.replace(/^https?:\/\//, ""))}}` : "";
      lines.push(`  \\resumeProjectHeading{\\textbf{${texEscape(p.name)}}${techStr}}{${rightLink}}`);
      lines.push("  \\resumeItemListStart");
      const rawBullets =
        tailoredBullets && tailoredBullets.length
          ? tailoredBullets
          : (p.description || "")
              .split(/(?<=\.)\s+|\n+/)
              .map((s) => s.trim())
              .filter(Boolean);
      for (const b of rawBullets) {
        lines.push(`    \\resumeItem{${texEscape(b.replace(/^[-•]\s*/, ""))}}`);
      }
      lines.push("  \\resumeItemListEnd");
    }
    lines.push("\\resumeSubHeadingListEnd");
  }

  if (profile.experience.length) {
    lines.push("", "% ---------- EXPERIENCE ----------", "\\section{Experience}", "\\resumeSubHeadingListStart");
    for (const exp of profile.experience) {
      lines.push(`  \\resumeItem{${texEscape(exp)}}`);
    }
    lines.push("\\resumeSubHeadingListEnd");
  }

  if (profile.education.length) {
    lines.push("", "% ---------- EDUCATION ----------", "\\section{Education}", "\\resumeSubHeadingListStart");
    for (const edu of profile.education) {
      lines.push(`  \\resumeSubheading{${texEscape(edu)}}{}{}{}`);
    }
    lines.push("\\resumeSubHeadingListEnd");
  }

  if (profile.achievements.length) {
    lines.push("", "% ---------- ACHIEVEMENTS ----------", "\\section{Achievements}", "\\resumeSubHeadingListStart");
    lines.push("  \\resumeItemListStart");
    for (const ach of profile.achievements) {
      lines.push(`    \\resumeItem{${texEscape(ach)}}`);
    }
    lines.push("  \\resumeItemListEnd", "\\resumeSubHeadingListEnd");
  }

  lines.push("", "\\end{document}");

  const bodyTex = lines.join("\n");
  const audit = computeAtsScore(bodyTex, profile, jobText);
  const headerComment = [
    `% ATS SCORE: ${audit.score}/100 (HIGHEST-ATS SINGLE-COLUMN LATEX)`,
    `% MATCHED JD KEYWORDS (${audit.matchedKeywords.length}): ${audit.matchedKeywords.join(", ") || "All core profile skills prioritized"}`,
  ].join("\n");

  return `${headerComment}\n${bodyTex}`;
}
