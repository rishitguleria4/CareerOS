import { query, queryOne, logEvent } from "./db";
import { analyzeJob, isRelevantTitle } from "./fit";
import { getProfile, getSources } from "./profile";
import { fetchSource } from "./sources";
import { canonicalUrl, fingerprint, normCompany } from "./text";
import type { FitReport, Profile, RawJob } from "./types";

const SENIOR = /(senior|\bsr\.?\b|staff|principal|\blead\b|manager|director|head of|vp\b|architect)/i;

const CLOSED_JOB_PATTERNS =
  /\b(job (is|you are looking for is) no longer (available|open|active)|no longer accepting applications|this (position|job|role|opening) has been (filled|closed|removed)|this job posting has expired|opening is closed)\b/i;

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
    // Cheap pre-filter: obviously irrelevant or senior titles never enter the DB
    if (!isRelevantTitle(job.title) || (SENIOR.test(job.title) && !/(junior|intern|associate|early)/i.test(job.title))) {
      r.skippedNoise++;
      continue;
    }

    const fp = fingerprint(job.company, job.title);
    const cleanUrl = canonicalUrl(job.url);

    // Match by either canonical fingerprint OR exact/canonical URL so duplicates never occur across boards
    const existing = await queryOne<{
      id: number;
      seen_on: string[];
      description: string | null;
      status: string;
      verdict: string | null;
    }>(
      "SELECT id, seen_on, description, status, verdict FROM opportunities WHERE fingerprint = $1 OR url = $2 OR url = $3 LIMIT 1",
      [fp, cleanUrl, job.url]
    );

    if (existing) {
      const seen = new Set<string>(existing.seen_on ?? []);
      seen.add(job.source);
      // Never delete or overwrite existing user state (APPLIED, APPLYING, REVIEWING, SKIPPED);
      // only refresh last_seen, merge seen_on, and revive if previously UNAVAILABLE.
      await query(
        `UPDATE opportunities SET
           last_seen = NOW(),
           seen_on = $2::jsonb,
           description = COALESCE(NULLIF(description,''), $3),
           salary_text = COALESCE(NULLIF(salary_text,''), $4),
           status = CASE
             WHEN status = 'UNAVAILABLE' AND verdict <> 'SKIP' THEN 'NEW'
             ELSE status
           END
         WHERE id = $1`,
        [existing.id, JSON.stringify([...seen]), job.description ?? null, job.salaryText ?? null]
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
       ON CONFLICT (fingerprint) DO UPDATE SET
         last_seen = NOW(),
         description = COALESCE(NULLIF(opportunities.description,''), EXCLUDED.description)`,
      [
        companyId,
        job.company,
        job.title,
        cleanUrl,
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

/**
 * Checks whether a job posting URL is still live and accepting applications.
 * Marks the opportunity as UNAVAILABLE (without deleting history) only when the posting is confirmed dead (404/410 or closed text).
 */
export async function verifyOpportunityAvailable(oppId: number, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CareerOS/1.0)",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });

    if (res.status === 404 || res.status === 410) {
      await markOpportunityUnavailable(oppId, `Posting returned HTTP ${res.status}`);
      return false;
    }

    if (res.ok) {
      const snippet = (await res.text()).slice(0, 12000);
      if (CLOSED_JOB_PATTERNS.test(snippet)) {
        await markOpportunityUnavailable(oppId, "Posting page indicates role is closed/no longer available");
        return false;
      }
    }
    return true;
  } catch {
    // Network timeouts or rate-limits are treated as still available (never false-expire on transient network errors)
    return true;
  }
}

async function markOpportunityUnavailable(oppId: number, reason: string) {
  await query(
    `UPDATE opportunities SET status = 'UNAVAILABLE'
     WHERE id = $1 AND status IN ('NEW', 'REVIEWING', 'APPLYING')
       AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.opportunity_id = $1 AND a.status IN ('APPLIED','INTERVIEW','OFFER'))`,
    [oppId]
  );
  // Clean up any unsubmitted draft/ready kit so closed jobs don't clutter the approval queue
  await query(
    `DELETE FROM applications WHERE opportunity_id = $1 AND status IN ('READY', 'DRAFT', 'PREPARING')`,
    [oppId]
  );
  await query(
    `DELETE FROM outreach WHERE opportunity_id = $1 AND status = 'DRAFT'`,
    [oppId]
  );
  await logEvent("availability", oppId, reason);
}

export interface DiscoveryReport {
  sources: { name: string; found: number; inserted: number; error?: string }[];
  inserted: number;
  duplicates: number;
  markedUnavailable: number;
}

export async function runDiscovery(): Promise<DiscoveryReport> {
  const profile = await getProfile();
  const sources = (await getSources()).filter((s) => s.enabled);
  const report: DiscoveryReport = { sources: [], inserted: 0, duplicates: 0, markedUnavailable: 0 };
  const scanStart = new Date().toISOString();

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

      // Direct ATS board reconciliation: if a company's live ATS board (ashby/greenhouse/lever/workable)
      // returned jobs, any unapplied role from that exact board that wasn't seen in this scan was taken down by the company.
      if (["ashby", "greenhouse", "lever", "workable"].includes(s.kind) && res.value.length > 0) {
        const stale = await query<{ id: number }>(
          `SELECT id FROM opportunities
           WHERE source = $1
             AND status IN ('NEW', 'REVIEWING')
             AND last_seen < $2::timestamptz`,
          [label, scanStart]
        );
        for (const row of stale) {
          await markOpportunityUnavailable(row.id, `Removed from ${label} ATS board`);
          report.markedUnavailable++;
        }
      }
    }
  }

  await logEvent(
    "discovery",
    null,
    `Inserted ${report.inserted}, merged ${report.duplicates} dupes, marked ${report.markedUnavailable} unavailable`
  );
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
