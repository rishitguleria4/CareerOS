export function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const COMPANY_NOISE =
  /\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|pvt|private|technologies|technology|labs|hq|ai\s+inc)\b\.?/g;

export function normCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(yc\s+[wsf]\d{2}\)/gi, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(COMPANY_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(remote|worldwide|global|hybrid|contract|full[- ]?time|part[- ]?time|all\s+genders|m\/f\/d)\b/g, " ")
    .replace(/[-–—|,/]+.*$/g, (m) =>
      /\b(remote|india|us|usa|eu|europe|uk|emea|apac|worldwide|global|anywhere)\b/i.test(m) ? "" : m
    )
    .replace(/[^a-z0-9+# ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same job on YC + Greenhouse + company site + WWR => same fingerprint => one record. */
export function fingerprint(company: string, title: string): string {
  return `${normCompany(company)}|${normTitle(title)}`;
}

/** Strips tracking parameters (utm_*, ref, gh_src, etc.) so identical posting URLs always match. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    const drop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
      "gh_src",
      "lever-source",
      "ashby_jid",
    ];
    for (const k of drop) u.searchParams.delete(k);
    const s = u.toString().replace(/\/+$/, "");
    return s;
  } catch {
    return raw.trim().replace(/\/+$/, "");
  }
}

export function slugToName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
