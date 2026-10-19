"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, sessionToken } from "@/lib/auth";
import { executeApplicationSubmit, inspectAndPrefillForm } from "@/lib/auto-apply";
import { query, queryOne, logEvent } from "@/lib/db";
import {
  draftCoverNote,
  draftOutreach,
  extractProfile,
  fallbackCoverNote,
  fallbackOutreach,
  hasGemini,
  tailorPlan,
} from "@/lib/gemini";
import { inferOutreachTarget, sendDirectEmail } from "@/lib/mailer";
import { ingest, rescoreAll, runDiscovery, verifyOpportunityAvailable } from "@/lib/opportunities";
import { generateResumePdf } from "@/lib/pdf";
import { DEFAULT_PROFILE, getProfile, saveProfile } from "@/lib/profile";
import { pickVariant, renderResume, VARIANTS, type TailorPlan, type VariantKey } from "@/lib/resume";
import { extractSkills } from "@/lib/skills";
import { automationSettings, BEST_FIT_ORDER, clampApps, clampOutreach, qualifyingWhere } from "@/lib/automation";
import type { FormFieldItem, Opportunity, Profile } from "@/lib/types";

const DAY = 86400000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const list = (v: string) => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const lines = (f: FormData, k: string) =>
  String(f.get(k) ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

async function getOpp(id: number): Promise<Opportunity> {
  const o = await queryOne<Opportunity>("SELECT * FROM opportunities WHERE id=$1", [id]);
  if (!o) throw new Error("Opportunity not found");
  return o;
}

// ---------------- auth ----------------
export async function loginAction(formData: FormData) {
  const token = await sessionToken();
  if (token && s(formData, "password") === process.env.APP_PASSWORD) {
    (await cookies()).set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: !!process.env.VERCEL,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    redirect("/dashboard");
  }
  redirect("/login?error=1");
}

export async function logoutAction() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

// ---------------- kit & outreach builders ----------------
async function buildKit(profile: Profile, opp: Opportunity, variant: VariantKey) {
  const jobText = `${opp.title}\n${opp.description ?? ""}`;
  let plan: TailorPlan | undefined;
  let cover = fallbackCoverNote(profile, opp);
  let aiNote = "";
  if (hasGemini() && profile.projects.length + profile.skills.length > 0) {
    try {
      plan = await tailorPlan(profile, opp);
      cover = await draftCoverNote(profile, opp);
    } catch (e: any) {
      aiNote = `AI tailoring fallback (${e?.message ?? e}); used deterministic reordering.`;
    }
  }
  const resume = renderResume(profile, variant, jobText, plan);
  const formFields = await inspectAndPrefillForm(opp, profile, cover);
  return { resume, cover, aiNote, formFields };
}

export async function prepareOpportunityKit(oppId: number, profile?: Profile): Promise<number> {
  const existing = await queryOne<{ id: number }>("SELECT id FROM applications WHERE opportunity_id=$1", [oppId]);
  if (existing) return existing.id;
  const [p, opp] = await Promise.all([profile ? Promise.resolve(profile) : getProfile(), getOpp(oppId)]);
  const variant = pickVariant(opp);
  const kit = await buildKit(p, opp, variant);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO applications (opportunity_id, status, resume_variant, tailored_resume, cover_note, form_fields, notes)
     VALUES ($1,'READY',$2,$3,$4,$5::jsonb,$6) RETURNING id`,
    [oppId, variant, kit.resume, kit.cover, JSON.stringify(kit.formFields), kit.aiNote || null]
  );
  await query("UPDATE opportunities SET status='APPLYING' WHERE id=$1 AND status='NEW'", [oppId]);
  await logEvent("application", row!.id, `Auto-prepared kit (${VARIANTS[variant].label})`);
  return row!.id;
}

export async function prepareOutreachDraft(oppId: number, profile?: Profile): Promise<number> {
  const [p, opp] = await Promise.all([profile ? Promise.resolve(profile) : getProfile(), getOpp(oppId)]);
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM outreach WHERE opportunity_id=$1 OR LOWER(company_name)=LOWER($2) LIMIT 1",
    [oppId, opp.company_name]
  );
  if (existing) return existing.id;
  const target = inferOutreachTarget(opp);
  let draft;
  try {
    draft = hasGemini()
      ? await draftOutreach(p, opp, { name: target.name, role: target.role })
      : fallbackOutreach(p, opp, { name: target.name });
  } catch {
    draft = fallbackOutreach(p, opp, { name: target.name });
  }
  const verifiedEmail = target.inferred ? null : target.email || null;
  const row = await queryOne<{ id: number }>(
    `INSERT INTO outreach (opportunity_id, company_name, contact_name, contact_role, contact_email, subject, body, send_log)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      oppId,
      opp.company_name,
      target.name,
      target.role,
      verifiedEmail,
      draft.subject,
      draft.body,
      verifiedEmail
        ? "Recipient email extracted directly from the job description."
        : "Paste the verified founder/hiring manager email before tapping Send.",
    ]
  );
  await logEvent("outreach", row!.id, `Auto-drafted outreach for ${opp.company_name}`);
  return row!.id;
}

/**
 * Prepares application kits and outreach drafts for the best-fitting roles so they wait for approval.
 * How many, and how strict the match must be, come from the user's automation settings (Profile → Automation).
 */
export async function autoPrepareQueue(
  override?: { apps?: number; outreach?: number }
): Promise<{ appsPrepared: number; outreachPrepared: number; quality: string }> {
  const profile = await getProfile();
  const settings = automationSettings(profile);
  const appsTarget = override?.apps ?? settings.appsPerRun;
  const outreachTarget = override?.outreach ?? settings.outreachPerRun;

  // Remove any unsubmitted kits tied to opportunities that were skipped or became unavailable
  await query(
    `DELETE FROM applications WHERE status IN ('READY', 'DRAFT')
     AND opportunity_id IN (SELECT id FROM opportunities WHERE status IN ('SKIPPED', 'UNAVAILABLE') OR tier = 'SKIP')`
  );
  await query(
    `DELETE FROM outreach WHERE status = 'DRAFT'
     AND (contact_email LIKE 'founders@%' OR opportunity_id IN (SELECT id FROM opportunities WHERE status IN ('SKIPPED', 'UNAVAILABLE') OR tier = 'SKIP'))`
  );

  // Upgrade any existing READY/DRAFT applications that were rendered before the LaTeX engine upgrade
  const legacyApps = await query<{ id: number; opportunity_id: number; resume_variant: string | null }>(
    `SELECT id, opportunity_id, resume_variant FROM applications
     WHERE status IN ('READY', 'DRAFT') AND (tailored_resume IS NULL OR tailored_resume NOT LIKE '%\\\\documentclass%')`
  );
  await Promise.all(
    legacyApps.map(async (la) => {
      const opp = await getOpp(la.opportunity_id);
      const variant = (la.resume_variant as VariantKey) || pickVariant(opp);
      const kit = await buildKit(profile, opp, variant in VARIANTS ? variant : "backend-ai");
      await query(
        "UPDATE applications SET tailored_resume=$2, cover_note=$3, form_fields=$4::jsonb WHERE id=$1",
        [la.id, kit.resume, kit.cover, JSON.stringify(kit.formFields)]
      );
    })
  );

  const where = qualifyingWhere(settings.preset);

  // Applications: best-fit first (tier → confirmed India eligibility → fit score), verified live before staging
  let appsPrepared = 0;
  if (appsTarget > 0) {
    const candidates = await query<Opportunity>(
      `SELECT o.* FROM opportunities o
       LEFT JOIN applications a ON a.opportunity_id = o.id
       WHERE o.status = 'NEW' AND a.id IS NULL AND ${where}
       ORDER BY ${BEST_FIT_ORDER} LIMIT $1`,
      [appsTarget * 2]
    );
    const liveApps: Opportunity[] = [];
    for (const opp of candidates) {
      if (liveApps.length >= appsTarget) break;
      const alive = await verifyOpportunityAvailable(opp.id, opp.url);
      if (alive) liveApps.push(opp);
    }
    await Promise.all(liveApps.map((opp) => prepareOpportunityKit(opp.id, profile)));
    appsPrepared = liveApps.length;
  }

  // Outreach: one draft per company, founder-led / outreach-first roles first, verified live before staging
  let outreachPrepared = 0;
  if (outreachTarget > 0) {
    const outreachOpps = await query<Opportunity>(
      `SELECT o.* FROM opportunities o
       WHERE o.status IN ('NEW','APPLYING') AND ${where}
         AND NOT EXISTS (
           SELECT 1 FROM outreach r
           WHERE r.opportunity_id = o.id OR LOWER(r.company_name) = LOWER(o.company_name)
         )
       ORDER BY (CASE WHEN o.fit->>'action' LIKE '%OUTREACH%' THEN 0 ELSE 1 END), ${BEST_FIT_ORDER}
       LIMIT $1`,
      [outreachTarget * 3]
    );
    const seen = new Set<string>();
    const chosen: Opportunity[] = [];
    for (const opp of outreachOpps) {
      if (chosen.length >= outreachTarget) break;
      const key = opp.company_name.toLowerCase();
      if (seen.has(key)) continue;
      const alive = await verifyOpportunityAvailable(opp.id, opp.url);
      if (!alive) continue;
      seen.add(key);
      chosen.push(opp);
    }
    await Promise.all(chosen.map((opp) => prepareOutreachDraft(opp.id, profile)));
    outreachPrepared = chosen.length;
  }

  await logEvent(
    "automation",
    null,
    `Prepared ${appsPrepared} application(s) and ${outreachPrepared} outreach draft(s) · ${settings.preset.label}`
  );
  return { appsPrepared: appsPrepared + legacyApps.length, outreachPrepared, quality: settings.quality };
}

// ---------------- discovery ----------------
export async function runDiscoveryAction() {
  const r = await runDiscovery();
  const prep = await autoPrepareQueue();
  revalidatePath("/", "layout");
  redirect(
    `/dashboard?discovered=${r.inserted}&dupes=${r.duplicates}&apps=${prep.appsPrepared}&emails=${prep.outreachPrepared}`
  );
}

export async function autoPrepareBatchAction() {
  const prep = await autoPrepareQueue();
  revalidatePath("/", "layout");
  redirect(`/dashboard?apps=${prep.appsPrepared}&emails=${prep.outreachPrepared}`);
}

/** Saves only the automation preferences (fast — no re-scoring). */
export async function saveAutomationAction(formData: FormData) {
  const prev = await getProfile();
  const quality = s(formData, "matchQuality");
  await saveProfile({
    ...prev,
    prepAppsPerRun: clampApps(Number(s(formData, "prepAppsPerRun"))),
    prepOutreachPerRun: clampOutreach(Number(s(formData, "prepOutreachPerRun"))),
    matchQuality: quality === "strong" || quality === "broad" ? quality : "best",
  });
  revalidatePath("/", "layout");
  const back = s(formData, "back");
  redirect(back === "dashboard" ? "/dashboard?settings=1" : "/profile?automation=1");
}

export async function rescoreAction() {
  await rescoreAll();
  revalidatePath("/", "layout");
}

export async function addManualJobAction(formData: FormData) {
  const profile = await getProfile();
  const description = s(formData, "description");
  const r = await ingest(
    [
      {
        company: s(formData, "company"),
        title: s(formData, "title"),
        url: s(formData, "url"),
        source: "manual",
        location: s(formData, "location") || undefined,
        description,
        salaryText: s(formData, "salary") || undefined,
        remoteFlag: /remote/i.test(`${s(formData, "location")} ${description.slice(0, 2000)}`) || undefined,
      },
    ],
    profile
  );
  const row = await queryOne<{ id: number }>(
    "SELECT id FROM opportunities WHERE url=$1 OR (company_name=$2 AND title=$3) ORDER BY id DESC LIMIT 1",
    [s(formData, "url"), s(formData, "company"), s(formData, "title")]
  );
  revalidatePath("/jobs");
  if (row) redirect(`/jobs/${row.id}${r.duplicates ? "?dupe=1" : ""}`);
  redirect("/jobs?rejected=1");
}

export async function setOppStatusAction(id: number, status: string) {
  await query("UPDATE opportunities SET status=$2 WHERE id=$1", [id, status]);
  await logEvent("status", id, `Opportunity → ${status}`);
  revalidatePath("/", "layout");
}

export async function saveOppNotesAction(id: number, formData: FormData) {
  await query("UPDATE opportunities SET notes=$2 WHERE id=$1", [id, s(formData, "notes")]);
  revalidatePath(`/jobs/${id}`);
}

// ---------------- applications ----------------
export async function startApplicationAction(oppId: number) {
  const appId = await prepareOpportunityKit(oppId);
  revalidatePath("/", "layout");
  redirect(`/applications/${appId}`);
}

export async function regenerateKitAction(appId: number, formData: FormData) {
  const app = await queryOne<{ opportunity_id: number }>("SELECT opportunity_id FROM applications WHERE id=$1", [appId]);
  if (!app) return;
  const variant = (s(formData, "variant") || "backend-ai") as VariantKey;
  const [profile, opp] = await Promise.all([getProfile(), getOpp(app.opportunity_id)]);
  const kit = await buildKit(profile, opp, variant in VARIANTS ? variant : "backend-ai");
  await query(
    "UPDATE applications SET resume_variant=$2, tailored_resume=$3, cover_note=$4, form_fields=$5::jsonb, notes=$6 WHERE id=$1",
    [appId, variant, kit.resume, kit.cover, JSON.stringify(kit.formFields), kit.aiNote || null]
  );
  revalidatePath("/", "layout");
}

export async function saveApplicationAction(appId: number, formData: FormData) {
  const existing = await queryOne<{ form_fields: FormFieldItem[] | null }>(
    "SELECT form_fields FROM applications WHERE id=$1",
    [appId]
  );
  const updatedFields = (existing?.form_fields ?? []).map((f, idx) => {
    const k = `field_${idx}`;
    return formData.has(k) ? { ...f, value: s(formData, k), needsReview: false } : f;
  });
  await query(
    "UPDATE applications SET tailored_resume=$2, cover_note=$3, form_fields=$4::jsonb, notes=$5 WHERE id=$1",
    [
      appId,
      s(formData, "tailored_resume"),
      s(formData, "cover_note"),
      JSON.stringify(updatedFields),
      s(formData, "notes"),
    ]
  );
  revalidatePath("/", "layout");
}

/** 1-Tap Approve & Auto-Submit (or Auto-Fill in Chrome/Edge) */
export async function approveAndSubmitApplicationAction(appId: number, formData: FormData) {
  // Persist any inline edits the user made inside the preview first
  if (formData.has("tailored_resume") || formData.has("cover_note")) {
    await saveApplicationAction(appId, formData);
  }
  const mode = (s(formData, "mode") || "submit") as "submit" | "fill";
  await executeApplicationSubmit(appId, mode);
  revalidatePath("/", "layout");
}

export async function markAppliedAction(appId: number) {
  const a = await queryOne<{ opportunity_id: number }>(
    "UPDATE applications SET status='APPLIED', applied_at=NOW(), next_followup_at=$2, followup_count=0, submit_log='Marked submitted manually' WHERE id=$1 RETURNING opportunity_id",
    [appId, inDays(4)]
  );
  if (a) await query("UPDATE opportunities SET status='APPLIED' WHERE id=$1", [a.opportunity_id]);
  await logEvent("application", appId, "Submitted by user");
  revalidatePath("/", "layout");
}

/** Application cadence: applied → +4d follow-up → +5d second follow-up → dormant. */
export async function followupSentAction(appId: number) {
  const a = await queryOne<{ followup_count: number }>("SELECT followup_count FROM applications WHERE id=$1", [appId]);
  if (!a) return;
  const n = a.followup_count + 1;
  if (n >= 2)
    await query("UPDATE applications SET followup_count=$2, status='DORMANT', next_followup_at=NULL WHERE id=$1", [
      appId,
      n,
    ]);
  else
    await query("UPDATE applications SET followup_count=$2, next_followup_at=$3 WHERE id=$1", [
      appId,
      n,
      inDays(5),
    ]);
  await logEvent("application", appId, `Follow-up #${n} sent`);
  revalidatePath("/", "layout");
}

export async function setApplicationStatusAction(appId: number, status: string) {
  await query(
    "UPDATE applications SET status=$2, next_followup_at = CASE WHEN $2 IN ('INTERVIEW','OFFER') THEN NULL ELSE next_followup_at END WHERE id=$1",
    [appId, status]
  );
  await logEvent("application", appId, `Status → ${status}`);
  revalidatePath("/", "layout");
}

// ---------------- outreach ----------------
export async function createOutreachAction(oppId: number, formData: FormData) {
  const [profile, opp] = await Promise.all([getProfile(), getOpp(oppId)]);
  const inferred = inferOutreachTarget(opp);
  const contact = {
    name: s(formData, "contact_name") || inferred.name,
    role: s(formData, "contact_role") || inferred.role,
  };
  let draft;
  try {
    draft = hasGemini() ? await draftOutreach(profile, opp, contact) : fallbackOutreach(profile, opp, contact);
  } catch {
    draft = fallbackOutreach(profile, opp, contact);
  }
  const row = await queryOne<{ id: number }>(
    `INSERT INTO outreach (opportunity_id, company_name, contact_name, contact_role, contact_email, contact_url, subject, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      oppId,
      opp.company_name,
      contact.name || null,
      contact.role || null,
      s(formData, "contact_email") || inferred.email || null,
      s(formData, "contact_url") || null,
      draft.subject,
      draft.body,
    ]
  );
  await query(
    "UPDATE opportunities SET status = CASE WHEN status IN ('NEW','REVIEWING') THEN 'OUTREACH' ELSE status END WHERE id=$1",
    [oppId]
  );
  await logEvent("outreach", row!.id, "Draft created");
  revalidatePath("/", "layout");
  redirect(`/outreach#o${row!.id}`);
}

export async function saveOutreachAction(id: number, formData: FormData) {
  await query(
    "UPDATE outreach SET contact_name=$2, contact_role=$3, contact_email=$4, contact_url=$5, subject=$6, body=$7 WHERE id=$1",
    [
      id,
      s(formData, "contact_name") || null,
      s(formData, "contact_role") || null,
      s(formData, "contact_email") || null,
      s(formData, "contact_url") || null,
      s(formData, "subject"),
      String(formData.get("body") ?? ""),
    ]
  );
  revalidatePath("/", "layout");
}

/** 1-Tap Approve & Send Outreach Email directly via SMTP / Resend (optionally attaching tailored PDF resume). */
export async function approveAndSendOutreachAction(id: number, formData: FormData) {
  if (formData.has("subject") || formData.has("body") || formData.has("contact_email")) {
    await saveOutreachAction(id, formData);
  }
  const o = await queryOne<any>("SELECT * FROM outreach WHERE id=$1", [id]);
  if (!o) return;
  const profile = await getProfile();

  let attachmentPdf: { filename: string; content: Uint8Array } | undefined;
  if (formData.get("attach_resume") === "on") {
    const app = o.opportunity_id
      ? await queryOne<{ tailored_resume: string | null }>(
          "SELECT tailored_resume FROM applications WHERE opportunity_id=$1",
          [o.opportunity_id]
        )
      : null;
    const md =
      app?.tailored_resume ||
      renderResume(profile, "founding", `${o.company_name}\n${o.subject ?? ""}`);
    const pdfBytes = await generateResumePdf(md);
    const safeName = (profile.name || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_");
    attachmentPdf = { filename: `${safeName}_Resume.pdf`, content: pdfBytes };
  }

  const res = await sendDirectEmail({
    to: o.contact_email ?? "",
    subject: o.subject ?? "",
    body: o.body ?? "",
    profile,
    attachmentPdf,
  });

  if (res.ok) {
    await query(
      "UPDATE outreach SET status='SENT', sent_at=NOW(), next_followup_at=$2, followup_count=0, send_log=$3 WHERE id=$1",
      [id, inDays(4), res.log]
    );
    await logEvent("outreach", id, res.log);
  } else {
    await query("UPDATE outreach SET send_log=$2 WHERE id=$1", [id, res.log]);
  }
  revalidatePath("/", "layout");
}

/** 1-Tap Approve & Send Due Follow-Up Email directly via SMTP / Resend. */
export async function approveAndSendFollowupAction(id: number) {
  const o = await queryOne<any>("SELECT * FROM outreach WHERE id=$1", [id]);
  if (!o) return;
  const profile = await getProfile();
  const stage = o.followup_count === 0 ? "followup" : "final";
  let subject = o.subject?.startsWith("Re:") ? o.subject : `Re: ${o.subject ?? o.company_name}`;
  let body = `Hi ${o.contact_name || "there"},\n\nJust floating this to the top of your inbox in case useful — happy to share a quick demo or do a small trial task if ${o.company_name} is adding engineering bandwidth.\n\nBest,\n${profile.name}`;

  if (o.opportunity_id && hasGemini()) {
    try {
      const opp = await getOpp(o.opportunity_id);
      const d = await draftOutreach(profile, opp, { name: o.contact_name, role: o.contact_role }, stage);
      subject = d.subject;
      body = d.body;
    } catch {
      /* fallback above */
    }
  }

  const res = await sendDirectEmail({ to: o.contact_email ?? "", subject, body, profile });
  if (res.ok) {
    const n = (o.followup_count ?? 0) + 1;
    if (n >= 2) {
      await query(
        "UPDATE outreach SET followup_count=$2, status='DORMANT', next_followup_at=NULL, subject=$3, body=$4, send_log=$5 WHERE id=$1",
        [id, n, subject, body, res.log]
      );
    } else {
      await query(
        "UPDATE outreach SET followup_count=$2, next_followup_at=$3, subject=$4, body=$5, send_log=$6 WHERE id=$1",
        [id, n, inDays(6), subject, body, res.log]
      );
    }
    await logEvent("outreach", id, `Follow-up #${n} sent: ${res.log}`);
  } else {
    await query("UPDATE outreach SET send_log=$2 WHERE id=$1", [id, res.log]);
  }
  revalidatePath("/", "layout");
}

export async function regenerateOutreachAction(id: number, stage: "initial" | "followup" | "final") {
  const o = await queryOne<any>("SELECT * FROM outreach WHERE id=$1", [id]);
  if (!o?.opportunity_id) return;
  const [profile, opp] = await Promise.all([getProfile(), getOpp(o.opportunity_id)]);
  const contact = { name: o.contact_name ?? undefined, role: o.contact_role ?? undefined };
  let d;
  try {
    d = hasGemini() ? await draftOutreach(profile, opp, contact, stage) : fallbackOutreach(profile, opp, contact);
  } catch {
    d = fallbackOutreach(profile, opp, contact);
  }
  await query("UPDATE outreach SET subject=$2, body=$3 WHERE id=$1", [id, d.subject, d.body]);
  revalidatePath("/", "layout");
}

export async function markOutreachSentAction(id: number) {
  await query(
    "UPDATE outreach SET status='SENT', sent_at=NOW(), next_followup_at=$2, followup_count=0, send_log='Marked sent manually' WHERE id=$1",
    [id, inDays(4)]
  );
  await logEvent("outreach", id, "Initial email sent");
  revalidatePath("/", "layout");
}

export async function outreachFollowupSentAction(id: number) {
  const o = await queryOne<{ followup_count: number }>("SELECT followup_count FROM outreach WHERE id=$1", [id]);
  if (!o) return;
  const n = o.followup_count + 1;
  if (n >= 2)
    await query("UPDATE outreach SET followup_count=$2, status='DORMANT', next_followup_at=NULL WHERE id=$1", [
      id,
      n,
    ]);
  else
    await query("UPDATE outreach SET followup_count=$2, next_followup_at=$3 WHERE id=$1", [id, n, inDays(6)]);
  await logEvent("outreach", id, `Follow-up #${n} sent`);
  revalidatePath("/", "layout");
}

export async function setOutreachStatusAction(id: number, status: string) {
  await query(
    "UPDATE outreach SET status=$2, next_followup_at = CASE WHEN $2 IN ('REPLIED','DORMANT') THEN NULL ELSE next_followup_at END WHERE id=$1",
    [id, status]
  );
  revalidatePath("/", "layout");
}

// ---------------- profile ----------------
function parseProjects(text: string): Profile["projects"] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, tech, description, url] = l.split("|").map((x) => x.trim());
      return { name: name ?? "", tech: list(tech ?? ""), description: description ?? "", url: url || undefined };
    })
    .filter((p) => p.name);
}

export async function saveProfileAction(formData: FormData) {
  const prev = await getProfile();
  const p: Profile = {
    ...prev,
    name: s(formData, "name"),
    email: s(formData, "email"),
    phone: s(formData, "phone"),
    location: s(formData, "location"),
    timezone: s(formData, "timezone"),
    github: s(formData, "github"),
    linkedin: s(formData, "linkedin"),
    portfolio: s(formData, "portfolio"),
    headline: s(formData, "headline"),
    summary: s(formData, "summary"),
    targetRoles: list(s(formData, "targetRoles")),
    skills: list(s(formData, "skills")),
    projects: parseProjects(String(formData.get("projects") ?? "")),
    education: lines(formData, "education"),
    experience: lines(formData, "experience"),
    achievements: lines(formData, "achievements"),
    workAuth: s(formData, "workAuth"),
    yearsExperience: Number(s(formData, "yearsExperience")) || 0,
    minSalaryUsdMonthly: Number(s(formData, "minSalaryUsdMonthly")) || DEFAULT_PROFILE.minSalaryUsdMonthly,
    targetSalaryUsdMonthly: Number(s(formData, "targetSalaryUsdMonthly")) || prev.targetSalaryUsdMonthly || 3000,
    idealSalaryUsdMonthly: Number(s(formData, "idealSalaryUsdMonthly")) || prev.idealSalaryUsdMonthly || 3500,
    upsideSalaryUsdMonthly: Number(s(formData, "upsideSalaryUsdMonthly")) || prev.upsideSalaryUsdMonthly || 5000,
    prepAppsPerRun: formData.has("prepAppsPerRun")
      ? clampApps(Number(s(formData, "prepAppsPerRun")))
      : prev.prepAppsPerRun,
    prepOutreachPerRun: formData.has("prepOutreachPerRun")
      ? clampOutreach(Number(s(formData, "prepOutreachPerRun")))
      : prev.prepOutreachPerRun,
    matchQuality: formData.has("matchQuality")
      ? (["best", "strong", "broad"].includes(s(formData, "matchQuality"))
          ? (s(formData, "matchQuality") as Profile["matchQuality"])
          : prev.matchQuality)
      : prev.matchQuality,
    answers: String(formData.get("answers") ?? "")
      .split("\n")
      .map((l) => l.split("=>").map((x) => x.trim()))
      .filter((a) => a[0])
      .map(([q, a]) => ({ q, a: a ?? "" })),
    smtpHost: s(formData, "smtpHost") || "smtp.gmail.com",
    smtpPort: Number(s(formData, "smtpPort")) || 465,
    smtpUser: s(formData, "smtpUser") || prev.smtpUser,
    smtpPass: s(formData, "smtpPass") ? s(formData, "smtpPass") : prev.smtpPass,
  };
  await saveProfile(p);
  await rescoreAll();
  await query("UPDATE applications SET tailored_resume = NULL WHERE status IN ('READY', 'DRAFT')");
  await autoPrepareQueue();
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

async function readResume(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: Buffer.from(buf) })).value;
  }
  return new TextDecoder().decode(buf);
}

export async function uploadResumeAction(formData: FormData) {
  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) redirect("/profile?error=nofile");
  let text = "";
  try {
    text = (await readResume(file as File)).trim();
  } catch {
    redirect("/profile?error=unreadable");
  }
  if (text.length < 80) redirect("/profile?error=unreadable");

  const prev = await getProfile();
  let extracted: Partial<Profile> = {};
  let mode = "basic";
  if (hasGemini()) {
    try {
      extracted = await extractProfile(text);
      mode = "ai";
    } catch {
      mode = "basic";
    }
  }
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  const github = text.match(/github\.com\/[\w-]+/i)?.[0];
  const linkedin = text.match(/linkedin\.com\/in\/[\w-]+/i)?.[0];
  const merged: Profile = {
    ...prev,
    resumeText: text,
    name: prev.name || extracted.name || "",
    email: prev.email || extracted.email || email,
    phone: prev.phone || extracted.phone || "",
    github: prev.github || extracted.github || (github ? `https://${github}` : ""),
    linkedin: prev.linkedin || extracted.linkedin || (linkedin ? `https://${linkedin}` : ""),
    portfolio: prev.portfolio || extracted.portfolio || "",
    summary: prev.summary || extracted.summary || "",
    headline: extracted.headline || prev.headline,
    skills: [...new Set([...prev.skills, ...(extracted.skills ?? []), ...extractSkills(text)])],
    projects: prev.projects.length ? prev.projects : extracted.projects ?? [],
    education: prev.education.length ? prev.education : extracted.education ?? [],
    experience: prev.experience.length ? prev.experience : extracted.experience ?? [],
    achievements: prev.achievements.length ? prev.achievements : extracted.achievements ?? [],
    yearsExperience: prev.yearsExperience || extracted.yearsExperience || 0,
  };
  await saveProfile(merged);
  await rescoreAll();
  await query("UPDATE applications SET tailored_resume = NULL WHERE status IN ('READY', 'DRAFT')");
  await autoPrepareQueue();
  revalidatePath("/", "layout");
  redirect(`/profile?imported=${mode}`);
}

// ---------------- sources ----------------
export async function addSourceAction(formData: FormData) {
  const kind = s(formData, "kind");
  const slug = s(formData, "slug").toLowerCase().replace(/^https?:\/\/[^/]+\//, "").split("/")[0];
  if (kind && slug)
    await query("INSERT INTO sources (kind, slug, name) VALUES ($1,$2,$2) ON CONFLICT DO NOTHING", [kind, slug]);
  revalidatePath("/profile");
}
export async function toggleSourceAction(id: number, enabled: boolean) {
  await query("UPDATE sources SET enabled=$2 WHERE id=$1", [id, enabled]);
  revalidatePath("/profile");
}
export async function removeSourceAction(id: number) {
  await query("DELETE FROM sources WHERE id=$1", [id]);
  revalidatePath("/profile");
}
