import Link from "next/link";
import {
  approveAndSendFollowupAction,
  approveAndSendOutreachAction,
  markOutreachSentAction,
  outreachFollowupSentAction,
  regenerateOutreachAction,
  saveOutreachAction,
  setOutreachStatusAction,
} from "@/app/actions";
import { Empty, PageHeader, Pill, fieldCls, ghostBtn, linkBtn } from "@/components/bits";
import { CopyButton, Submit } from "@/components/client-bits";
import { query } from "@/lib/db";
import { hasDirectEmailConfig } from "@/lib/mailer";
import { getProfile } from "@/lib/profile";
import type { OutreachItem } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const [items, profile] = await Promise.all([
    query<OutreachItem>("SELECT * FROM outreach ORDER BY (status='DORMANT'), created_at DESC"),
    getProfile(),
  ]);
  const emailConfigured = hasDirectEmailConfig(profile);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Direct Founder &amp; CTO Channel · Automated Cadence"
        title="Founder Outreach"
        sub={
          emailConfigured
            ? "Direct SMTP is active. Approve any draft to send immediately with your tailored ATS PDF resume and schedule Day +4 and Day +10 follow-ups."
            : "Configure your Gmail App Password in Mandate & Sources for 1-tap sending, or open any draft directly in your mail client."
        }
      />

      {items.length === 0 ? (
        <Empty>
          No founder outreach drafts staged yet. Click <b>Prepare Batch</b> on the{" "}
          <Link href="/dashboard" className="font-medium text-foreground underline">
            Command Queue
          </Link>{" "}
          or generate one from any Opportunity dossier.
        </Empty>
      ) : (
        <div className="space-y-4">
          {items.map((o) => {
            const due = o.status === "SENT" && o.next_followup_at && new Date(o.next_followup_at) <= new Date();
            const mailto = `mailto:${o.contact_email ?? ""}?subject=${encodeURIComponent(o.subject ?? "")}&body=${encodeURIComponent(o.body ?? "")}`;
            return (
              <form
                key={o.id}
                id={`o${o.id}`}
                action={approveAndSendOutreachAction.bind(null, o.id)}
                className="space-y-3.5 rounded-lg border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-xl text-foreground">{o.company_name}</span>
                    <Pill tone={o.status === "REPLIED" ? "good" : o.status === "SENT" ? "info" : "muted"}>
                      {o.status}
                    </Pill>
                    {o.sent_at && (
                      <span className="font-mono text-[11px] text-muted-foreground">sent {fmtDate(o.sent_at)}</span>
                    )}
                    {o.next_followup_at && o.status === "SENT" && (
                      <Pill tone={due ? "warn" : "muted"}>follow-up {fmtDate(o.next_followup_at)}</Pill>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(o.company_name)}%20founder%20OR%20CTO`}
                      target="_blank"
                      rel="noreferrer"
                      className={linkBtn}
                    >
                      LinkedIn Founder Search ↗
                    </a>
                    {o.opportunity_id && (
                      <Link className={ghostBtn} href={`/jobs/${o.opportunity_id}`}>
                        Role Dossier →
                      </Link>
                    )}
                  </div>
                </div>

                {o.send_log && (
                  <div className="rounded border border-border bg-muted/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {o.send_log}
                  </div>
                )}

                <div className="grid gap-2.5 md:grid-cols-4">
                  <input
                    name="contact_name"
                    defaultValue={o.contact_name ?? ""}
                    placeholder="Recipient Name"
                    className={fieldCls}
                  />
                  <input
                    name="contact_role"
                    defaultValue={o.contact_role ?? ""}
                    placeholder="Role (Founder / CTO)"
                    className={fieldCls}
                  />
                  <input
                    name="contact_email"
                    defaultValue={o.contact_email ?? ""}
                    placeholder="Verified email (required to send)"
                    className={fieldCls + " font-mono text-xs"}
                  />
                  <input
                    name="contact_url"
                    defaultValue={o.contact_url ?? ""}
                    placeholder="LinkedIn URL"
                    className={fieldCls}
                  />
                </div>
                <input name="subject" defaultValue={o.subject ?? ""} placeholder="Subject line" className={fieldCls} />
                <textarea name="body" defaultValue={o.body ?? ""} rows={7} className={fieldCls} />

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {o.status === "DRAFT" && (
                    <>
                      <Submit
                        className="bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-95"
                        pendingText="Sending email…"
                      >
                        Approve &amp; Send Email
                      </Submit>
                      <label className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                        <input type="checkbox" name="attach_resume" defaultChecked className="rounded border-border" />
                        Attach tailored ATS PDF resume
                      </label>
                    </>
                  )}
                  <button formAction={saveOutreachAction.bind(null, o.id)} className={linkBtn}>
                    Save Edits
                  </button>
                  <CopyButton text={o.body ?? ""} label="Copy Body" />
                  <a href={mailto} className={linkBtn}>
                    Open in Mail App ↗
                  </a>
                  {o.status === "DRAFT" && (
                    <button formAction={markOutreachSentAction.bind(null, o.id)} className={linkBtn}>
                      Mark Sent Manually
                    </button>
                  )}
                  {o.status === "SENT" && (
                    <>
                      <button
                        formAction={approveAndSendFollowupAction.bind(null, o.id)}
                        className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-[var(--brand-ink)] hover:opacity-95"
                      >
                        Approve &amp; Send {o.followup_count === 0 ? "Follow-Up #1" : "Final Follow-Up"}
                      </button>
                      <button
                        formAction={regenerateOutreachAction.bind(
                          null,
                          o.id,
                          o.followup_count === 0 ? "followup" : "final"
                        )}
                        className={linkBtn}
                      >
                        Draft {o.followup_count === 0 ? "Follow-Up #1" : "Final Note"} Copy
                      </button>
                      <button formAction={outreachFollowupSentAction.bind(null, o.id)} className={linkBtn}>
                        Log Follow-Up #{o.followup_count + 1}
                      </button>
                      <button formAction={setOutreachStatusAction.bind(null, o.id, "REPLIED")} className={linkBtn}>
                        Mark Replied
                      </button>
                    </>
                  )}
                  {o.status !== "DORMANT" && (
                    <button formAction={setOutreachStatusAction.bind(null, o.id, "DORMANT")} className={ghostBtn}>
                      Archive
                    </button>
                  )}
                </div>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
