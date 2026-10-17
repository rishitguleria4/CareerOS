# Career OS — What I Need From You

Career OS is a single Next.js app (UI + server actions + 1-tap browser automation + direct email sender + cron + database access). There is **no separate backend**.

## A. How the 1-Tap Approval Workflow Works

Everything is now automated up to a **single approval tap with an inline preview**:

1. **Click `⚡ Auto-Prepare Top Matches` on `/dashboard`** (or click `Run discovery now`, which automatically runs discovery **and** auto-prepares your top matches).
   - Career OS selects the best resume variant (`ai-fullstack`, `backend-ai`, or `founding`), tailors it without inventing skills, generates a real **ATS-ready PDF resume** (`/applications/[id]/resume.pdf`), writes a tailored cover note, inspects the live Greenhouse/Lever/Ashby application form to pre-fill standard & custom portal questions, and creates a cold outreach draft with inferred target email.
2. **Review Inline Previews in the `1-Tap Approval Center` (`/dashboard`)**:
   - Expand **`👁 Preview Form Answers, Cover Note & Tailored Resume`** on any application card to inspect or edit every pre-filled field, cover note, or tailored resume before submitting.
   - Expand **`👁 Preview / Edit Email Subject & Body`** on any outreach card to inspect or edit the recipient email, subject, and message body.
3. **Tap Once to Execute**:
   - **`✅ Approve & Auto-Submit Application`**:
     - If the job accepts email applications (`mailto:` or an apply email in the JD), Career OS sends your application email **with your tailored PDF resume attached** in 1 tap.
     - If the job uses a web portal (Greenhouse, Lever, Ashby, etc.), Career OS launches your local Chrome/Edge browser via Playwright, **uploads your generated PDF resume** to the file input, **fills every text field and custom question**, and clicks Submit (automatically pausing if a CAPTCHA requires your tap).
   - **`🪄 Auto-Fill Only (Pause Before Submit)`**: Opens Chrome/Edge, uploads the PDF resume, fills every field, scrolls to the Submit button, and leaves the window open for your manual click.
   - **`📨 Approve & Send Email Now`**: Sends the outreach or follow-up email directly from your email account (with optional PDF resume attachment) and automatically schedules a 4-day follow-up reminder.

---

## B. Things You Can Give Me (Optional Locally, 3 Required for Vercel)

| What | Where it goes | Needed for | Required? |
|---|---|---|---|
| **Gmail App Password** (16 chars from Google Account → Security → 2-Step Verification → App passwords) | **Profile page → Direct 1-Tap Email Sender (SMTP)** (or `SMTP_PASS` in `.env.local`) | Sending `📨 Approve & Send Email Now` and email applications directly in 1 tap | Recommended for 1-tap email sending. (Without it, you can still use the `↗ Mail App` fallback button.) |
| **Gemini API key** (free from https://aistudio.google.com/apikey) | `GEMINI_API_KEY` in `frontend/.env.local` | AI resume parsing, AI resume tailoring (grounded reorder/emphasis), cover notes, outreach + follow-up drafts | Optional. Without it you get deterministic keyword parsing, skill-prioritized resume tailoring, and high-converting template emails. |
| **Your resume file** (PDF/DOCX) + **real profile details** | **Profile page** (`/profile`) | Master profile, skill matching, pre-filling application forms, PDF resume generation | Yes, do this in the `/profile` UI. |
| **Vercel account** + **Neon Postgres** (via Vercel → Storage, free tier) | `DATABASE_URL` (auto-added by Vercel) | Persisting data in production | **Required only when deploying to Vercel.** Locally, Career OS uses embedded PGlite in `frontend/.data/pglite`. |
| **Dashboard Password** | `APP_PASSWORD` | Protects your private dashboard on Vercel | **Required on Vercel.** |
| **Cron Secret** | `CRON_SECRET` | Authorizes the daily 08:00 IST discovery + auto-prep cron | **Required on Vercel.** |

---
