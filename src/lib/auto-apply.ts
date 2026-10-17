import fs from "fs";
import path from "path";
import { query, queryOne, logEvent } from "./db";
import { generateResumePdf } from "./pdf";
import { sendDirectEmail, hasDirectEmailConfig } from "./mailer";
import { getProfile } from "./profile";
import { stripHtml } from "./text";
import type { FormFieldItem, Opportunity, Profile } from "./types";

const STD_LABELS =
  /^(first name|last name|full name|name|email|email address|phone|phone number|resume|cv|resume\/cv|attach|upload|cover letter|linkedin|github|portfolio|website|location|city|current company|pronouns)$/i;

function matchAnswer(question: string, profile: Profile, coverNote: string, opp: Opportunity): { value: string; needsReview: boolean } {
  const q = question.toLowerCase();

  // 1. Check user's explicit Q=>A pairs in profile
  for (const pair of profile.answers) {
    if (!pair.q || !pair.a) continue;
    const pq = pair.q.toLowerCase();
    const words = pq.split(/\W+/).filter((w) => w.length > 3);
    if (q.includes(pq) || (words.length > 0 && words.every((w) => q.includes(w)))) {
      return { value: pair.a, needsReview: false };
    }
  }

  // 2. Deterministic rules for common ATS custom questions
  if (/sponsor|visa|authorized|authorisation|authorization|legally|work permit|citizenship/.test(q)) {
    return { value: profile.workAuth || "Based in India; available for remote contractor or global employment.", needsReview: false };
  }
  if (/salary|compensation|pay|expectation|rate|remuneration/.test(q)) {
    return { value: `$${profile.minSalaryUsdMonthly || 2500}/month USD (flexible based on scope and equity)`, needsReview: false };
  }
  if (/notice period|start date|when can you start|earliest|availability/.test(q)) {
    return { value: "Immediate / within 1-2 weeks", needsReview: false };
  }
  if (/location|where are you based|country|city|reside/.test(q)) {
    return { value: profile.location || "India", needsReview: false };
  }
  if (/time ?zone|working hours|overlap/.test(q)) {
    return { value: `${profile.timezone || "IST (UTC+5:30)"} — flexible for US/EU overlap hours`, needsReview: false };
  }
  if (/years of.*experience|how many years/.test(q)) {
    return { value: String(profile.yearsExperience ?? 0), needsReview: false };
  }
  if (/linkedin/.test(q)) return { value: profile.linkedin || "", needsReview: !profile.linkedin };
  if (/github|code sample|repo/.test(q)) return { value: profile.github || "", needsReview: !profile.github };
  if (/portfolio|website|personal site|blog/.test(q)) return { value: profile.portfolio || profile.github || "", needsReview: false };
  if (/why .*want to work|why .*interested|why .*apply|cover|anything else|additional information|tell us about yourself/.test(q)) {
    return { value: coverNote, needsReview: false };
  }
  if (/project|built|proud of|technical challenge/.test(q) && profile.projects[0]) {
    const p = profile.projects[0];
    return {
      value: `${p.name} (${p.tech.join(", ")}): ${p.description}${p.url ? ` — ${p.url}` : ""}`,
      needsReview: false,
    };
  }
  if (/hear about|how did you find/.test(q)) {
    return { value: `${opp.company_name} careers / job board`, needsReview: false };
  }

  return { value: coverNote, needsReview: true };
}

/** Fetches the portal HTML (when accessible) to discover custom questions and pre-fills all standard + custom fields. */
export async function inspectAndPrefillForm(
  opp: Opportunity,
  profile: Profile,
  coverNote: string
): Promise<FormFieldItem[]> {
  const parts = (profile.name || "").trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ") || firstName;

  const fields: FormFieldItem[] = [
    { name: "first_name", label: "First Name", value: firstName, required: true, kind: "text" },
    { name: "last_name", label: "Last Name", value: lastName, required: true, kind: "text" },
    { name: "email", label: "Email", value: profile.email, required: true, kind: "text", needsReview: !profile.email },
    { name: "phone", label: "Phone", value: profile.phone, required: true, kind: "text", needsReview: !profile.phone },
    { name: "location", label: "Location", value: profile.location || "India", required: false, kind: "text" },
    { name: "linkedin", label: "LinkedIn URL", value: profile.linkedin, required: false, kind: "text" },
    { name: "github", label: "GitHub URL", value: profile.github, required: false, kind: "text" },
    { name: "portfolio", label: "Portfolio / Website", value: profile.portfolio || profile.github, required: false, kind: "text" },
    { name: "work_auth", label: "Work Authorization", value: profile.workAuth, required: false, kind: "text" },
    { name: "cover_letter", label: "Cover Note / Why Us", value: coverNote, required: false, kind: "textarea" },
  ];

  // Try to scrape custom <label> questions from the live application form
  try {
    let targetUrl = opp.url;
    if (/jobs\.lever\.co\/[^/]+\/[^/]+\/?$/i.test(targetUrl)) {
      targetUrl = targetUrl.replace(/\/?$/, "/apply");
    }
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (res.ok) {
      const html = await res.text();
      const seenLabels = new Set<string>();
      for (const m of html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/gi)) {
        const clean = stripHtml(m[1]).replace(/\*/g, "").replace(/\s+/g, " ").trim();
        if (clean.length < 4 || clean.length > 160) continue;
        if (STD_LABELS.test(clean)) continue;
        const key = clean.toLowerCase();
        if (seenLabels.has(key)) continue;
        seenLabels.add(key);
        const ans = matchAnswer(clean, profile, coverNote, opp);
        fields.push({
          name: `custom_${seenLabels.size}`,
          label: clean,
          value: ans.value,
          required: m[1].includes("*"),
          needsReview: ans.needsReview,
          kind: ans.value.length > 90 ? "textarea" : "text",
        });
        if (seenLabels.size >= 8) break;
      }
    }
  } catch {
    // Portal blocked server-side fetch or timed out; standard fields + Playwright live inspection will handle it
  }

  return fields;
}

/** Resolves the direct application form URL for known ATS platforms. */
export function resolveApplyUrl(url: string): string {
  if (/jobs\.lever\.co\/[^/]+\/[^/]+\/?$/i.test(url)) return url.replace(/\/?$/, "/apply");
  if (/jobs\.ashbyhq\.com\/[^/]+\/[^/]+\/?$/i.test(url)) return url.replace(/\/?$/, "/application");
  return url;
}

/**
 * 1-Tap Execution Engine:
 * - Mode "submit": auto-fills the form, uploads the generated PDF resume, and clicks Submit (if no CAPTCHA blocks).
 * - Mode "fill": opens a visible Chrome/Edge window, fills every field + uploads the PDF, and pauses at Submit.
 */
export async function executeApplicationSubmit(
  appId: number,
  mode: "submit" | "fill" = "submit"
): Promise<{ ok: boolean; status: string; log: string }> {
  const app = await queryOne<any>(
    `SELECT a.*, o.title, o.company_name, o.url, o.description, o.id AS opp_id
     FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE a.id = $1`,
    [appId]
  );
  if (!app) return { ok: false, status: "ERROR", log: "Application not found" };

  const profile = await getProfile();
  const formFields: FormFieldItem[] = Array.isArray(app.form_fields) ? app.form_fields : [];
  const pdfBytes = await generateResumePdf(app.tailored_resume || `# ${profile.name || "Candidate"}`);
  const safeName = (profile.name || "Candidate").replace(/[^a-zA-Z0-9_-]/g, "_");

  // Path 1: If the posting URL is a mailto: link and SMTP is configured, send email with PDF attachment
  if (app.url.startsWith("mailto:") && hasDirectEmailConfig(profile)) {
    const emailTo = app.url.replace(/^mailto:/i, "").split("?")[0];
    const res = await sendDirectEmail({
      to: emailTo,
      subject: `Application: ${app.title} — ${profile.name}`,
      body: app.cover_note || `Hi ${app.company_name} team,\n\nPlease find my resume attached for the ${app.title} role.\n\nBest,\n${profile.name}`,
      profile,
      attachmentPdf: { filename: `${safeName}_Resume.pdf`, content: pdfBytes },
    });
    if (res.ok) {
      await markSubmittedInDb(appId, app.opp_id, `Auto-submitted via Email with PDF resume: ${res.log}`);
      return { ok: true, status: "APPLIED", log: res.log };
    }
  }

  // Path 2: Automated Browser Form Fill & Submit via Playwright (uses installed Chrome or Edge on local machine)
  if (process.env.VERCEL) {
    return {
      ok: false,
      status: "READY",
      log: "Browser auto-fill runs on your local machine (serverless functions cannot launch Chrome). Use the 1-Tap Auto-Fill Script or run locally.",
    };
  }

  const tmpDir = path.join(process.cwd(), ".data", "tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const pdfPath = path.join(tmpDir, `${safeName}_Resume_${appId}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));

  const logs: string[] = [];
  try {
    const { chromium } = await import("playwright-core");
    let browser;
    for (const channel of ["chrome", "msedge"] as const) {
      try {
        // Keep browser visible (headless: false) so if a CAPTCHA appears or mode==="fill", the user sees it immediately
        browser = await chromium.launch({ channel, headless: false });
        logs.push(`Launched ${channel}`);
        break;
      } catch {
        continue;
      }
    }
    if (!browser) {
      return {
        ok: false,
        status: "READY",
        log: "Could not launch Chrome or Edge via Playwright. Make sure Google Chrome or Microsoft Edge is installed.",
      };
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const targetUrl = resolveApplyUrl(app.url);
    logs.push(`Opened ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // If on a page with an "Apply" button that opens the form (e.g. Ashby / Greenhouse), click it if no form is visible yet
    const fileInputCount = await page.locator('input[type="file"]').count();
    const textInputCount = await page.locator('input[type="text"], input[type="email"]').count();
    if (fileInputCount === 0 && textInputCount === 0) {
      const applyTrigger = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
      if ((await applyTrigger.count()) > 0) {
        await applyTrigger.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    // 1. Upload tailored PDF resume to the first file input
    const fileInputs = page.locator('input[type="file"]');
    if ((await fileInputs.count()) > 0) {
      await fileInputs.first().setInputFiles(pdfPath).catch((e) => logs.push(`Resume upload warning: ${e.message}`));
      logs.push(`Uploaded tailored PDF resume (${path.basename(pdfPath)})`);
    }

    // 2. Build lookup map from form_fields + profile
    const lookup: [RegExp, string][] = [];
    for (const f of formFields) {
      if (f.value) {
        const escaped = f.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        lookup.push([new RegExp(escaped, "i"), f.value]);
      }
    }
    const parts = (profile.name || "").trim().split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ") || first;
    lookup.push(
      [/first\s*name|given\s*name/i, first],
      [/last\s*name|family\s*name|surname/i, last],
      [/^(full\s*)?name\b/i, profile.name],
      [/e-?mail/i, profile.email],
      [/phone|mobile|tel/i, profile.phone],
      [/location|city|address/i, profile.location || "India"],
      [/linkedin/i, profile.linkedin],
      [/github/i, profile.github],
      [/portfolio|website|personal\s*url|blog/i, profile.portfolio || profile.github],
      [/current\s*company|organization|employer/i, "Independent"],
      [/cover\s*letter|additional\s*info|why\s*do\s*you|note/i, app.cover_note || ""]
    );

    // 3. Fill all visible inputs & textareas in the page
    const filledCount = await page.evaluate(
      ({ pairs }) => {
        let count = 0;
        const setVal = (el: HTMLInputElement | HTMLTextAreaElement, val: string) => {
          if (!val || el.value) return false;
          const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) setter.call(el, val);
          else el.value = val;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("blur", { bubbles: true }));
          return true;
        };

        const els = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), textarea'
          )
        );

        for (const el of els) {
          const labelEl =
            (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label") || el.closest("div, fieldset, li")?.querySelector("label");
          const descriptor = [
            labelEl?.textContent ?? "",
            el.getAttribute("aria-label") ?? "",
            el.getAttribute("placeholder") ?? "",
            el.getAttribute("name") ?? "",
            el.getAttribute("id") ?? "",
          ].join(" ");

          for (const [pattern, sourceVal] of pairs) {
            if (!sourceVal) continue;
            const re = new RegExp(pattern, "i");
            if (re.test(descriptor)) {
              if (setVal(el, sourceVal)) count++;
              break;
            }
          }
        }
        return count;
      },
      { pairs: lookup.map(([re, v]) => [re.source, v] as [string, string]) }
    );
    logs.push(`Auto-filled ${filledCount} form fields`);

    // Check for CAPTCHA
    const hasCaptcha =
      (await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha').count()) > 0;

    const submitBtn = page
      .locator('button[type="submit"], input[type="submit"], button:has-text("Submit Application"), button:has-text("Submit")')
      .first();

    if ((await submitBtn.count()) > 0) {
      await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
    }

    if (mode === "submit" && !hasCaptcha && (await submitBtn.count()) > 0) {
      await submitBtn.click({ timeout: 5000 });
      logs.push("Clicked Submit button");
      await page.waitForTimeout(4000);
      await browser.close().catch(() => {});
      const summary = logs.join(" · ");
      await markSubmittedInDb(appId, app.opp_id, summary);
      return { ok: true, status: "APPLIED", log: summary };
    } else {
      const reason =
        mode === "fill"
          ? "Pre-filled in Chrome/Edge and paused at Submit as requested."
          : hasCaptcha
          ? "Pre-filled all fields + uploaded PDF! Paused at Submit because the page has a CAPTCHA — click Submit in the open browser window."
          : "Pre-filled all fields + uploaded PDF in the open browser window — review and click Submit.";
      logs.push(reason);
      const summary = logs.join(" · ");
      await query("UPDATE applications SET submit_log = $2 WHERE id = $1", [appId, summary]);
      return { ok: true, status: "FILLED_OPEN", log: summary };
    }
  } catch (e: any) {
    const errLog = [...logs, `Automation note: ${e?.message ?? String(e)}`].join(" · ");
    await query("UPDATE applications SET submit_log = $2 WHERE id = $1", [appId, errLog]);
    return { ok: false, status: "READY", log: errLog };
  }
}

async function markSubmittedInDb(appId: number, oppId: number, log: string) {
  const nextFollowup = new Date(Date.now() + 4 * 86400000).toISOString();
  await query(
    `UPDATE applications SET status='APPLIED', applied_at=NOW(), next_followup_at=$2, followup_count=0, submit_log=$3 WHERE id=$1`,
    [appId, nextFollowup, log]
  );
  await query("UPDATE opportunities SET status='APPLIED' WHERE id=$1", [oppId]);
  await logEvent("application", appId, log);
}
