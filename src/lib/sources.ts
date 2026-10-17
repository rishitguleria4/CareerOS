import type { RawJob } from "./types";
import { slugToName, stripHtml } from "./text";

const UA = { "User-Agent": "career-os/1.0 (+personal job tracker)", Accept: "application/json, text/xml, */*" };

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

export async function fetchGreenhouse(slug: string): Promise<RawJob[]> {
  const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  const company = slugToName(slug);
  return (d.jobs ?? []).map((j: any) => ({
    company,
    title: j.title,
    url: j.absolute_url,
    source: "greenhouse",
    location: j.location?.name,
    description: stripHtml(j.content ?? ""),
    postedAt: j.updated_at,
  }));
}

export async function fetchLever(slug: string): Promise<RawJob[]> {
  const d = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  const company = slugToName(slug);
  return (Array.isArray(d) ? d : []).map((j: any) => ({
    company,
    title: j.text,
    url: j.hostedUrl,
    source: "lever",
    location: [j.categories?.location, j.workplaceType].filter(Boolean).join(" · "),
    description: [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${stripHtml(l.content ?? "")}`)]
      .filter(Boolean)
      .join("\n"),
    salaryText: j.salaryRange ? `${j.salaryRange.currency ?? "$"}${j.salaryRange.min}-${j.salaryRange.max}` : undefined,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
    remoteFlag: j.workplaceType === "remote" ? true : undefined,
  }));
}

export async function fetchAshby(slug: string): Promise<RawJob[]> {
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  const company = slugToName(slug);
  return (d.jobs ?? [])
    .filter((j: any) => j.isListed !== false)
    .map((j: any) => ({
      company,
      title: j.title,
      url: j.jobUrl ?? j.applyUrl,
      source: "ashby",
      location: [j.location, ...(j.secondaryLocations ?? []).map((s: any) => s.location)].filter(Boolean).join(" · "),
      description: j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? ""),
      salaryText: j.compensation?.compensationTierSummary,
      postedAt: j.publishedAt,
      remoteFlag: j.isRemote === true || j.workplaceType === "Remote" ? true : undefined,
    }));
}

async function fetchWWR(): Promise<RawJob[]> {
  const cats = ["remote-programming-jobs", "remote-back-end-programming-jobs", "remote-full-stack-programming-jobs"];
  const out: RawJob[] = [];
  for (const c of cats) {
    try {
      const xml = await getText(`https://weworkremotely.com/categories/${c}.rss`);
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const it = m[1];
        const tag = (n: string) =>
          (it.match(new RegExp(`<${n}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${n}>`)) ?? [])[1]?.trim() ?? "";
        const full = tag("title");
        const idx = full.indexOf(":");
        out.push({
          company: idx > 0 ? full.slice(0, idx).trim() : "Unknown",
          title: idx > 0 ? full.slice(idx + 1).trim() : full,
          url: tag("link"),
          source: "weworkremotely",
          location: tag("region") || "Remote",
          description: stripHtml(tag("description")),
          postedAt: tag("pubDate") ? new Date(tag("pubDate")).toISOString() : undefined,
          remoteFlag: true,
        });
      }
    } catch {
      /* one category failing shouldn't kill the rest */
    }
  }
  return out;
}

async function fetchRemoteOK(): Promise<RawJob[]> {
  const d = await getJson("https://remoteok.com/api");
  return (Array.isArray(d) ? d : [])
    .filter((j: any) => j.position)
    .map((j: any) => ({
      company: j.company,
      title: j.position,
      url: j.url,
      source: "remoteok",
      location: j.location || "Remote",
      description: stripHtml(j.description ?? ""),
      salaryText: j.salary_min ? `$${j.salary_min}-${j.salary_max}` : undefined,
      postedAt: j.date,
      remoteFlag: true,
    }));
}

async function fetchRemotive(): Promise<RawJob[]> {
  const d = await getJson("https://remotive.com/api/remote-jobs?category=software-dev&limit=200");
  return (d.jobs ?? []).map((j: any) => ({
    company: j.company_name,
    title: j.title,
    url: j.url,
    source: "remotive",
    location: j.candidate_required_location || "Remote",
    description: stripHtml(j.description ?? ""),
    salaryText: j.salary || undefined,
    postedAt: j.publication_date,
    remoteFlag: true,
  }));
}

export async function fetchSource(kind: string, slug: string): Promise<RawJob[]> {
  switch (kind) {
    case "greenhouse":
      return fetchGreenhouse(slug);
    case "lever":
      return fetchLever(slug);
    case "ashby":
      return fetchAshby(slug);
    case "feed":
      if (slug === "weworkremotely") return fetchWWR();
      if (slug === "remoteok") return fetchRemoteOK();
      if (slug === "remotive") return fetchRemotive();
      return [];
    default:
      return [];
  }
}

