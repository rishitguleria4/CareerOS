import type { RawJob } from "./types";
import { slugToName, stripHtml } from "./text";

const UA = {
  "User-Agent": "career-os/1.0 (+personal job workbench)",
  Accept: "application/json, text/xml, */*",
};

async function getJson(url: string, timeoutMs = 12000): Promise<any> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function getText(url: string, timeoutMs = 12000): Promise<string> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// ============================================================================
// 1. DIRECT STARTUP ATS CONNECTORS (Greenhouse, Lever, Ashby, Workable)
// ============================================================================

export async function fetchGreenhouse(slug: string): Promise<RawJob[]> {
  const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  const company = slugToName(slug);
  return (d.jobs ?? []).map((j: any) => {
    const loc: string = j.location?.name ?? "";
    return {
      company,
      title: j.title,
      url: j.absolute_url,
      source: `greenhouse:${slug}`,
      location: loc,
      description: stripHtml(j.content ?? ""),
      postedAt: j.updated_at,
      remoteFlag: /\b(remote|anywhere|worldwide|global|wfh|work from home)\b/i.test(`${loc} ${j.title}`) ? true : undefined,
    };
  });
}

export async function fetchLever(slug: string): Promise<RawJob[]> {
  const d = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  const company = slugToName(slug);
  return (Array.isArray(d) ? d : []).map((j: any) => {
    const wp = j.workplaceType ? String(j.workplaceType) : "";
    const loc = [j.categories?.location, wp].filter(Boolean).join(" · ");
    return {
      company,
      title: j.text,
      url: j.hostedUrl,
      source: `lever:${slug}`,
      location: loc,
      description: [j.descriptionPlain, ...(j.lists ?? []).map((l: any) => `${l.text}\n${stripHtml(l.content ?? "")}`)]
        .filter(Boolean)
        .join("\n"),
      salaryText: j.salaryRange ? `${j.salaryRange.currency ?? "$"}${j.salaryRange.min}-${j.salaryRange.max}` : undefined,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
      remoteFlag:
        wp.toLowerCase() === "remote" || /\b(remote|anywhere|worldwide|global)\b/i.test(`${loc} ${j.text}`)
          ? true
          : undefined,
    };
  });
}

export async function fetchAshby(slug: string): Promise<RawJob[]> {
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  const company = slugToName(slug);
  return (d.jobs ?? [])
    .filter((j: any) => j.isListed !== false)
    .map((j: any) => {
      const baseLoc = [j.location, ...(j.secondaryLocations ?? []).map((s: any) => s.location)]
        .filter(Boolean)
        .join(" · ");
      const wp = j.workplaceType || (j.isRemote === true ? "Remote" : "");
      const loc = wp && !new RegExp(wp, "i").test(baseLoc) ? [baseLoc, wp].filter(Boolean).join(" · ") : baseLoc;
      return {
        company,
        title: j.title,
        url: j.jobUrl ?? j.applyUrl,
        source: `ashby:${slug}`,
        location: loc,
        description: j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? ""),
        salaryText: j.compensation?.compensationTierSummary,
        postedAt: j.publishedAt,
        remoteFlag:
          j.isRemote === true ||
          j.workplaceType === "Remote" ||
          /\b(remote|anywhere|worldwide|global)\b/i.test(`${loc} ${j.title}`)
            ? true
            : undefined,
      };
    });
}

export async function fetchWorkable(slug: string): Promise<RawJob[]> {
  const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}`);
  const company = d.name || slugToName(slug);
  return (d.jobs ?? []).map((j: any) => {
    const loc = [j.city, j.country, j.telecommuting ? "Remote" : ""].filter(Boolean).join(", ");
    return {
      company,
      title: j.title,
      url: j.url || j.shortlink,
      source: `workable:${slug}`,
      location: loc || "Remote",
      description: stripHtml(j.description ?? `${j.title} at ${company} (${j.department ?? "Engineering"})`),
      postedAt: j.published_on,
      remoteFlag: j.telecommuting === true || /remote/i.test(loc) ? true : undefined,
    };
  });
}

// ============================================================================
// 2. LOW-TRAFFIC / HIGH-SIGNAL STARTUP & FOUNDER CHANNELS
// ============================================================================

/**
 * Hacker News monthly "Ask HN: Who is hiring?" thread via Algolia HN API.
 * Direct founder/CTO comments with low competition, stack details, and often direct founder emails.
 */
async function fetchHNWhoIsHiring(): Promise<RawJob[]> {
  const search = await getJson(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Who+is+hiring&hitsPerPage=4"
  );
  const thread = (search.hits ?? []).find((h: any) => /who is hiring/i.test(h.title ?? ""));
  if (!thread?.objectID) return [];

  const comments = await getJson(
    `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${thread.objectID}&hitsPerPage=250`
  );

  const out: RawJob[] = [];
  for (const c of comments.hits ?? []) {
    const rawHtml: string = c.comment_text ?? "";
    if (!rawHtml || rawHtml.length < 80) continue;
    const plain = stripHtml(rawHtml);
    const lines = plain.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // Standard HN format: "Company Name | Role Title | Location / Remote | Comp | https://..."
    const firstLine = lines[0];
    const parts = firstLine.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const company = parts[0].replace(/^(hiring:?|\*+)\s*/i, "").slice(0, 80);
    if (!company || company.length < 2) continue;

    // Find which pipe segment looks like the engineering role title vs location
    const rolePart =
      parts.slice(1).find((p) => /(engineer|developer|ai|ml|full[- ]?stack|backend|founding|software|python|typescript|product)/i.test(p)) ||
      parts[1];
    const locPart =
      parts.slice(1).find((p) => /(remote|worldwide|global|onsite|hybrid|us|eu|europe|uk|india|anywhere|utc|est|cet)/i.test(p) && p !== rolePart) ||
      (plain.match(/\b(remote[^\n.|]{0,35}|worldwide|work from anywhere)/i)?.[0] ?? "Remote (see post)");
    const salPart = parts.find((p) => /(\$|€|£|usd|eur|\d{2,3}k)/i.test(p));

    const urlMatch = rawHtml.match(/https?:\/\/[^\s"'<>]+/i);
    const hnUrl = `https://news.ycombinator.com/item?id=${c.objectID}`;

    out.push({
      company,
      title: rolePart.slice(0, 110),
      url: urlMatch ? urlMatch[0].replace(/[).,;]+$/, "") : hnUrl,
      source: "yc-hn-hiring",
      location: locPart.slice(0, 90),
      description: `${plain}\n\nHN Thread Permalink: ${hnUrl}`,
      salaryText: salPart,
      postedAt: c.created_at,
      remoteFlag: /\b(remote|worldwide|anywhere|global|distributed|wfh)\b/i.test(firstLine + "\n" + plain.slice(0, 400)),
    });
  }
  return out;
}

/**
 * Y Combinator Official Job Posts stream (news.ycombinator.com/jobs via Algolia `tags=job`).
 * 100% YC portfolio companies hiring engineers directly.
 */
async function fetchYCJobsStream(): Promise<RawJob[]> {
  const d = await getJson("https://hn.algolia.com/api/v1/search_by_date?tags=job&hitsPerPage=100");
  const out: RawJob[] = [];
  for (const h of d.hits ?? []) {
    const rawTitle: string = (h.title ?? "").trim();
    if (!rawTitle) continue;
    // Typical format: "Acme (YC S24) Is Hiring a Founding AI Engineer (Remote)"
    const m = rawTitle.match(/^(.+?)\s+is hiring(?:\s+an?|\s+for)?\s+(.+)$/i);
    const company = m ? m[1].trim() : rawTitle.split(/\(YC [^)]+\)/i)[0]?.trim() || "YC Startup";
    const title = m ? m[2].trim() : rawTitle;
    const body = stripHtml(h.job_text ?? h.story_text ?? rawTitle);
    const isRemote = /\b(remote|worldwide|anywhere|global|distributed)\b/i.test(`${rawTitle} ${body}`);
    out.push({
      company: company.slice(0, 80),
      title: title.slice(0, 110),
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      source: "yc-jobs",
      location: isRemote ? "Remote (YC Startup)" : "YC Startup",
      description: `${rawTitle}\n\n${body}`,
      postedAt: h.created_at,
      remoteFlag: isRemote || undefined,
    });
  }
  return out;
}

// ============================================================================
// 3. GLOBAL & EU/US REMOTE ENGINEERING PLATFORMS
// ============================================================================

async function fetchHimalayas(): Promise<RawJob[]> {
  const d = await getJson("https://himalayas.app/jobs/api?limit=100");
  return (d.jobs ?? []).map((j: any) => {
    const locs = Array.isArray(j.locationRestrictions) && j.locationRestrictions.length > 0
      ? j.locationRestrictions.join(", ")
      : "Remote — Worldwide";
    const sal =
      j.minSalary && j.maxSalary
        ? `${j.currency ?? "$"}${j.minSalary}–${j.maxSalary}`
        : undefined;
    return {
      company: j.companyName || "Startup",
      title: j.title,
      url: j.applicationLink || j.guid || `https://himalayas.app/jobs/${j.slug ?? ""}`,
      source: "himalayas",
      location: `Remote (${locs})`,
      description: stripHtml(j.description ?? j.excerpt ?? ""),
      salaryText: sal,
      postedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : undefined,
      remoteFlag: true,
    };
  });
}

/**
 * Arbeitnow API: European & Berlin/Amsterdam/London tech startups offering remote & international roles.
 */
async function fetchArbeitnow(): Promise<RawJob[]> {
  const d = await getJson("https://www.arbeitnow.com/api/job-board-api");
  return (d.data ?? [])
    .filter((j: any) => j.remote === true || /remote|worldwide|anywhere|english/i.test(`${j.location} ${j.title}`))
    .map((j: any) => ({
      company: j.company_name,
      title: j.title,
      url: j.url,
      source: "arbeitnow-eu",
      location: j.remote ? `Remote · ${j.location || "EU"}` : j.location || "EU",
      description: stripHtml(j.description ?? ""),
      postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : undefined,
      remoteFlag: j.remote === true || /remote/i.test(j.location ?? ""),
    }));
}

/**
 * Jobicy v2 API: Curated remote engineering & AI jobs with explicit geographic scope.
 */
async function fetchJobicy(): Promise<RawJob[]> {
  const d = await getJson("https://jobicy.com/api/v2/remote-jobs?count=50&industry=engineering");
  return (d.jobs ?? []).map((j: any) => ({
    company: j.companyName,
    title: j.jobTitle,
    url: j.url,
    source: "jobicy",
    location: `Remote (${j.jobGeo || "Worldwide"})`,
    description: stripHtml(j.jobDescription ?? j.jobExcerpt ?? ""),
    salaryText:
      j.annualSalaryMin && j.annualSalaryMax
        ? `${j.salaryCurrency ?? "$"}${j.annualSalaryMin}–${j.annualSalaryMax}`
        : undefined,
    postedAt: j.pubDate,
    remoteFlag: true,
  }));
}

/**
 * Working Nomads API: Curated global remote software & AI engineering roles.
 */
async function fetchWorkingNomads(): Promise<RawJob[]> {
  const d = await getJson("https://www.workingnomads.com/api/exposed_jobs/");
  return (Array.isArray(d) ? d : [])
    .filter((j: any) => /dev|software|data|ai|system|tech/i.test(j.category_name ?? "dev"))
    .slice(0, 120)
    .map((j: any) => ({
      company: j.company_name || "Remote Team",
      title: j.title,
      url: j.url,
      source: "workingnomads",
      location: `Remote (${j.location || "Worldwide"})`,
      description: stripHtml(j.description ?? ""),
      postedAt: j.pub_date,
      remoteFlag: true,
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
          location: tag("region") || "Remote — Worldwide",
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
      location: j.location || "Remote — Worldwide",
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
    location: j.candidate_required_location ? `Remote (${j.candidate_required_location})` : "Remote — Worldwide",
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
    case "workable":
      return fetchWorkable(slug);
    case "feed":
      if (slug === "hn-whoishiring") return fetchHNWhoIsHiring();
      if (slug === "yc-jobs") return fetchYCJobsStream();
      if (slug === "himalayas") return fetchHimalayas();
      if (slug === "arbeitnow") return fetchArbeitnow();
      if (slug === "jobicy") return fetchJobicy();
      if (slug === "workingnomads") return fetchWorkingNomads();
      if (slug === "weworkremotely") return fetchWWR();
      if (slug === "remoteok") return fetchRemoteOK();
      if (slug === "remotive") return fetchRemotive();
      return [];
    default:
      return [];
  }
}
