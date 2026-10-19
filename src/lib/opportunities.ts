import { query, queryOne, logEvent } from "./db";
import { analyzeJob, isRelevantTitle } from "./fit";
import { getProfile, getSources } from "./profile";
import { fetchSource } from "./sources";
import { fingerprint, normCompany } from "./text";
import type { FitReport, Profile, RawJob } from "./types";

const SENIOR = /(senior|\bsr\.?\b|staff|principal|\blead\b|manager|director|head of|vp\b|architect)/i;

async function ensureCompany(name: string): Promise<number> {
  const norm = normCompany(name) || name.toLowerCase();
  const row = await queryOne<{ id: number }>(
    `INSERT INTO companies (name, norm_name) VALUES ($1,$2)
     ON CONFLICT (norm_name) DO UPDATE SET name = companies.name RETURNING id`,
    [name, norm]
  );
  return row!.id;
}

export interface IngestResult {
  inserted: number;
  duplicates: number;
  skippedNoise: number;
}

export async function ingest(jobs: RawJob[], profile: Profile): Promise<IngestResult> {
  const r: IngestResult = { inserted: 0, duplicates: 0, skippedNoise: 0 };
  for (const job of jobs) {
    if (!job.title || !job.url || !job.company) continue;
    // cheap pre-filter: obviously irrelevant or senior titles never enter the DB
    if (!isRelevantTitle(job.title) || (SENIOR.test(job.title) && !/(junior|intern|associate)/i.test(job.title))) {
      r.skippedNoise++;
      continue;
    }
    const fp = fingerprint(job.company, job.title);
    const existing = await queryOne<{ id: number; seen_on: string[]; description: string | null }>(
      "SELECT id, seen_on, description FROM opportunities WHERE fingerprint = $1",
      [fp]
    );
    if (existing) {
      const seen = new Set<string>(existing.seen_on ?? []);
      seen.add(job.source);
      await query(
        `UPDATE opportunities SET last_seen = NOW(), seen_on = $2::jsonb,
           description = COALESCE(NULLIF(description,''), $3) WHERE id = $1`,
        [existing.id, JSON.stringify([...seen]), job.description ?? null]
      );
      r.duplicates++;
      continue;
    }
    const fit = analyzeJob(job, profile);
    const companyId = await ensureCompany(job.company);
    await query(
      `INSERT INTO opportunities
        (company_id, company_name, title, url, source, seen_on, fingerprint, location, description,
         salary_text, posted_at, fit, score, verdict, tier, status)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
       ON CONFLICT (fingerprint) DO NOTHING`,
      [
        companyId,
        job.company,
        job.title,
        job.url,
        job.source,
        JSON.stringify([job.source]),
        fp,
        job.location ?? null,
        (job.description ?? "").slice(0, 20000),
        job.salaryText ?? null,
        job.postedAt && !isNaN(Date.parse(job.postedAt)) ? job.postedAt : null,
        JSON.stringify(fit),
        fit.score,
        fit.verdict,
        fit.tier,
        fit.verdict === "SKIP" ? "SKIPPED" : "NEW",
      ]
    );
    r.inserted++;
  }
  return r;
}

export interface DiscoveryReport {
  sources: { name: string; found: number; inserted: number; error?: string }[];
  inserted: number;
  duplicates: number;
}

export async function runDiscovery(): Promise<DiscoveryReport> {
  const profile = await getProfile();
  const sources = (await getSources()).filter((s) => s.enabled);
  const report: DiscoveryReport = { sources: [], inserted: 0, duplicates: 0 };

  const BATCH = 8;
  for (let start = 0; start < sources.length; start += BATCH) {
    const chunk = sources.slice(start, start + BATCH);
    const fetched = await Promise.allSettled(chunk.map((s) => fetchSource(s.kind, s.slug)));
    for (let i = 0; i < chunk.length; i++) {
      const s = chunk[i];
      const res = fetched[i];
      const label = `${s.kind}:${s.slug}`;
      if (res.status === "rejected") {
        report.sources.push({ name: label, found: 0, inserted: 0, error: String(res.reason?.message ?? res.reason) });
        await query("UPDATE sources SET last_run = NOW(), last_found = 0 WHERE id = $1", [s.id]);
        continue;
      }
      const r = await ingest(res.value, profile);
      report.inserted += r.inserted;
      report.duplicates += r.duplicates;
      report.sources.push({ name: label, found: res.value.length, inserted: r.inserted });
      await query("UPDATE sources SET last_run = NOW(), last_found = $2 WHERE id = $1", [s.id, res.value.length]);
    }
  }
  await logEvent("discovery", null, `Inserted ${report.inserted}, duplicates merged ${report.duplicates}`);
  return report;
}

/** Re-run the fit engine on open opportunities (e.g. after the profile changes). */
export async function rescoreAll(): Promise<number> {
  const profile = await getProfile();
  const rows = await query<any>(
    "SELECT id, company_name, title, url, source, location, description, salary_text FROM opportunities WHERE status IN ('NEW','REVIEWING','SKIPPED','APPLYING')"
  );
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((o) => {
        const fit: FitReport = analyzeJob(
          {
            company: o.company_name,
            title: o.title,
            url: o.url,
            source: o.source,
            location: o.location ?? undefined,
            description: o.description ?? undefined,
            salaryText: o.salary_text ?? undefined,
          },
          profile
        );
        return query(
          `UPDATE opportunities SET fit=$2::jsonb, score=$3, verdict=$4, tier=$5,
             status = CASE
               WHEN status='SKIPPED' AND $4 <> 'SKIP' THEN 'NEW'
               WHEN $4='SKIP' AND status IN ('NEW','APPLYING','REVIEWING') THEN 'SKIPPED'
               ELSE status
             END
           WHERE id=$1`,
          [o.id, JSON.stringify(fit), fit.score, fit.verdict, fit.tier]
        );
      })
    );
  }
  return rows.length;
}

