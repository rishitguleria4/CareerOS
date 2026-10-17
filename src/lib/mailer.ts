import nodemailer from "nodemailer";
import type { Opportunity, Profile } from "./types";

export function hasDirectEmailConfig(profile?: Profile): boolean {
  const user = profile?.smtpUser || process.env.SMTP_USER;
  const pass = profile?.smtpPass || process.env.SMTP_PASS;
  const resend = process.env.RESEND_API_KEY;
  return Boolean((user && pass) || resend);
}

export interface SendMailInput {
  to: string;
  subject: string;
  body: string;
  profile: Profile;
  attachmentPdf?: { filename: string; content: Uint8Array };
}

export async function sendDirectEmail(input: SendMailInput): Promise<{ ok: boolean; log: string }> {
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, log: "Missing recipient email address — enter the recipient email first." };
  }

  const user = input.profile.smtpUser || process.env.SMTP_USER;
  const pass = input.profile.smtpPass || process.env.SMTP_PASS;
  const host = input.profile.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(input.profile.smtpPort || process.env.SMTP_PORT || 465);

  if (user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass: pass.replace(/\s+/g, "") },
      });
      const fromName = input.profile.name || "Candidate";
      const info = await transporter.sendMail({
        from: `"${fromName}" <${user}>`,
        to,
        subject: input.subject,
        text: input.body,
        attachments: input.attachmentPdf
          ? [{ filename: input.attachmentPdf.filename, content: Buffer.from(input.attachmentPdf.content) }]
          : undefined,
      });
      return { ok: true, log: `Sent via SMTP (${user}) → ${to} [${info.messageId}]` };
    } catch (e: any) {
      return { ok: false, log: `SMTP error: ${e?.message ?? String(e)}` };
    }
  }

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || `${input.profile.name || "Career OS"} <onboarding@resend.dev>`,
          to: [to],
          subject: input.subject,
          text: input.body,
        }),
      });
      if (!res.ok) return { ok: false, log: `Resend HTTP ${res.status}: ${await res.text()}` };
      const data = await res.json();
      return { ok: true, log: `Sent via Resend → ${to} [${data.id}]` };
    } catch (e: any) {
      return { ok: false, log: `Resend error: ${e?.message ?? String(e)}` };
    }
  }

  return {
    ok: false,
    log: "Direct email not configured yet. Add your Gmail + 16-char App Password under Profile → 1-Tap Email Automation (or SMTP_USER / SMTP_PASS in .env.local).",
  };
}

const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const IGNORE_EMAIL = /(example\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workday\.com|sentry\.io|noreply|no-reply|privacy@|legal@|support@|accommodation|accessibility|eeoc|press@)/i;

/** Extracts a real hiring/founder email from the JD if present, or infers a clean domain guess. */
export function inferOutreachTarget(opp: Opportunity): {
  name: string;
  role: string;
  email: string;
  inferred: boolean;
} {
  const matches = (opp.description ?? "").match(EMAIL_RE) ?? [];
  const valid = matches.find((e) => !IGNORE_EMAIL.test(e));
  if (valid) {
    return { name: `${opp.company_name} Hiring / Engineering`, role: "Founder / Hiring Lead", email: valid, inferred: false };
  }
  const cleanDomain = opp.company_name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|ai|labs|technologies|hq|corp)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  const domain = cleanDomain ? `${cleanDomain}.com` : "";
  return {
    name: `${opp.company_name} Team`,
    role: "Founder / CTO",
    email: domain ? `founders@${domain}` : "",
    inferred: true,
  };
}
