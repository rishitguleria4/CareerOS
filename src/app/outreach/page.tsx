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
import { Empty, PageHeader, Pill, fieldCls, linkBtn } from "@/components/bits";
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
    <div>
      <PageHeader
        title="Outreach — 1-Tap Preview & Send"
        sub={
          emailConfigured
            ? "Direct SMTP is active. Review any draft and tap 'Approve & Send Email Now' to send immediately and schedule follow-ups (Day 4 → Day 10 → Dormant)."
            : "Add your Gmail + 16-char App Password in Profile for 1-tap direct sending, or use 'Open in mail app'."
        }
      />
      {items.length === 0 ? (
        <Empty>
          No outreach drafts yet. Click <b>⚡ Auto-Prepare Top Matches</b> on the{" "}
          <Link href="/dashboard" className="underline">
            Dashboard
          </Link>{" "}
          or draft one from any job page.
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
                className="space-y-3 rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{o.company_name}</span>
                    <Pill tone={o.status === "REPLIED" ? "good" : o.status === "SENT" ? "info" : "muted"}>
                      {o.status}
                    </Pill>
                    {o.sent_at && <span className="text-xs text-muted-foreground">sent {fmtDate(o.sent_at)}</span>}
                    {o.next_followup_at && o.status === "SENT" && (
                      <span className={`text-xs ${due ? "font-medium text-orange-600" : "text-muted-foreground"}`}>
                        follow-up {fmtDate(o.next_followup_at)}
                      </span>
                    )}
                  </div>
                  {o.opportunity_id && (
                    <a className="text-xs underline" href={`/jobs/${o.opportunity_id}`}>
                      view job
                    </a>
                  )}
                </div>

                {o.send_log && (
                  <div className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-900">{o.send_log}</div>
                )}

                <div className="grid gap-2 md:grid-cols-4">
                  <input
                    name="contact_name"
                    defaultValue={o.contact_name ?? ""}
                    placeholder="Name"
                    className={fieldCls}
                  />
                  <input
                    name="contact_role"
                    defaultValue={o.contact_role ?? ""}
                    placeholder="Role"
                    className={fieldCls}
                  />
                  <input
                    name="contact_email"
                    defaultValue={o.contact_email ?? ""}
                    placeholder="Email (required for 1-tap send)"
                    className={fieldCls}
                  />
                  <input
                    name="contact_url"
                    defaultValue={o.contact_url ?? ""}
                    placeholder="LinkedIn URL"
                    className={fieldCls}
                  />
                </div>
                <input name="subject" defaultValue={o.subject ?? ""} className={fieldCls} />
                <textarea name="body" defaultValue={o.body ?? ""} rows={8} className={fieldCls} />
                <div className="flex flex-wrap items-center gap-2">
                  {o.status === "DRAFT" && (
                    <>
                      <Submit className="bg-sky-600 text-white hover:bg-sky-700" pendingText="Sending email…">
                        📨 Approve & Send Email Now
                      </Submit>
                      <label className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                        <input type="checkbox" name="attach_resume" defaultChecked className="rounded" />
                        Attach tailored PDF resume
                      </label>
                    </>
                  )}
                  <button formAction={saveOutreachAction.bind(null, o.id)} className={linkBtn}>
                    Save edits
                  </button>
                  <CopyButton text={o.body ?? ""} label="Copy body" />
                  <a href={mailto} className={linkBtn}>
                    Open in mail app ↗
                  </a>
                  {o.status === "DRAFT" && (
                    <button formAction={markOutreachSentAction.bind(null, o.id)} className={linkBtn}>
                      Mark sent manually
                    </button>
                  )}
                  {o.status === "SENT" && (
                    <>
                      <button
                        formAction={approveAndSendFollowupAction.bind(null, o.id)}
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-orange-600 px-3 text-sm font-medium text-white hover:bg-orange-700"
                      >
                        📨 Approve & Auto-Send {o.followup_count === 0 ? "Follow-up #1" : "Final Follow-up"}
                      </button>
                      <button
                        formAction={regenerateOutreachAction.bind(
                          null,
                          o.id,
                          o.followup_count === 0 ? "followup" : "final"
                        )}
                        className={linkBtn}
                      >
                        Preview {o.followup_count === 0 ? "follow-up" : "final note"} text
                      </button>
                      <button formAction={outreachFollowupSentAction.bind(null, o.id)} className={linkBtn}>
                        Logged follow-up #{o.followup_count + 1}
                      </button>
                      <button formAction={setOutreachStatusAction.bind(null, o.id, "REPLIED")} className={linkBtn}>
                        Got reply
                      </button>
                    </>
                  )}
                  {o.status !== "DORMANT" && (
                    <button
                      formAction={setOutreachStatusAction.bind(null, o.id, "DORMANT")}
                      className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Dormant
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
