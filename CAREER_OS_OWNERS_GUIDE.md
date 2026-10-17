# Career OS — Action Checklist & Complete Owner's Engineering Manual

This document has two parts:
1. **Part 1 — Action Checklist:** Every concrete step you need to take to configure, use, and deploy Career OS.
2. **Part 2 — Engineering Owner's Manual:** A deep architectural and code-level breakdown of every subsystem so you understand and own every line of the system.

---

# Part 1: What You Need to Do to Make Everything Work

## 1. Local Setup (Running Right Now at `http://localhost:3000`)

The app is already running with an embedded PostgreSQL database (`PGlite` stored in `frontend/.data/pglite`). You do **not** need Docker or a local Postgres server.

### Step 1.1 — Populate Your Master Candidate Profile (5 minutes)
1. Open **http://localhost:3000/profile**.
2. In **1 · Upload resume**, select your `resume.pdf` or `resume.docx` and click **Import**.
3. In **2 · Master profile**, verify and fill in:
   - **Identity & Links:** Full name, email, phone, location (`India`), timezone (`IST (UTC+5:30)`), GitHub, LinkedIn, Portfolio URL.
   - **Skills:** Comma-separated list of every skill you can defend in an interview (e.g. `Python, FastAPI, PostgreSQL, Redis, Docker, Next.js, TypeScript, React, LLM, RAG, Agents`).
   - **Projects:** One project per line using the pipe format:
     ```text
     OpsPilot | Python, FastAPI, PostgreSQL, RAG, Next.js | Built an AI incident copilot indexing runbooks with hybrid pgvector retrieval and tool-calling | https://github.com/you/opspilot
     AgentForge | Python, FastAPI, Redis, Agents, Docker | Multi-agent workflow runner with deterministic retries and structured outputs | https://github.com/you/agentforge
     ```
   - **Standard Application Answers:** Pre-written answers for common portal questions (`Question => Answer` per line) so you can copy them in one click when applying.
4. Click **Save profile & re-score opportunities**. Every open opportunity in your database is immediately re-evaluated against your updated profile.

### Step 1.2 — Enable Gemini AI (Optional but Recommended — 2 minutes)
Without an API key, Career OS still works 100% using its deterministic keyword parser, deterministic resume reordering, and template emails. Adding a free Gemini key unlocks **AI resume extraction, job-specific bullet emphasis, tailored cover notes, and personalized cold emails**.

1. Get a free API key from **https://aistudio.google.com/apikey**.
2. Create `c:\Users\mehak\opportunity-tracker\frontend\.env.local`:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```
3. Restart `npm run dev`. On the Profile page, you will see `AI parsing: on`.

### Step 1.3 — Run Job Discovery & Curate Your Sources
1. Go to **http://localhost:3000/dashboard** and click **Run discovery now** (takes ~15–30 seconds).
2. Career OS queries 22+ live sources in parallel (Ashby, Greenhouse, Lever, WeWorkRemotely, RemoteOK, Remotive), strips noise, deduplicates identical jobs across boards, and runs the Fit Engine.
3. Want to track more companies? Whenever you see a job URL like:
   - `https://jobs.ashbyhq.com/linear/...` -> slug is `linear` (`Ashby`)
   - `https://boards.greenhouse.io/vercel/...` -> slug is `vercel` (`Greenhouse`)
   - `https://jobs.lever.co/palantir/...` -> slug is `palantir` (`Lever`)
   Add the slug at the bottom of **http://localhost:3000/profile** under **3 · Discovery sources**.
4. Found a job on YC Work at a Startup, LinkedIn, or X/Twitter? Open **http://localhost:3000/jobs** -> click **+ Add a job manually** at the bottom, paste the JD, and it will be scored and deduplicated identically to automated jobs.

---

## 2. Deploying to Vercel (Zero-Hassle Production in 5 Minutes)

Because the entire backend is consolidated into Next.js App Router (`src/app/actions.ts` + `src/lib/db.ts`), there is **no separate FastAPI/Docker/Redis server to host**.

1. **Push to GitHub:** Push this repository to a private GitHub repo.
2. **Import in Vercel:**
   - Go to Vercel -> **Add New Project** -> select your repository.
   - Set **Root Directory** to `frontend`.
3. **Attach Free Serverless Postgres (Neon):**
   - In your Vercel project dashboard, go to **Storage** -> **Create Database** -> select **Neon Postgres** (Free tier) and connect it to the project.
   - This automatically injects `DATABASE_URL` into your Vercel environment.
4. **Set Environment Variables** (Vercel -> **Settings** -> **Environment Variables**):
   - `DATABASE_URL` = *(Auto-set by Neon Storage)*
   - `APP_PASSWORD` = Choose a strong password (enables the login gate in `src/proxy.ts`)
   - `CRON_SECRET` = Any random 32+ char string (secures the daily automated discovery cron at `/api/cron/discover`)
   - `GEMINI_API_KEY` = Your Google AI Studio key (optional)
5. **Deploy:** Click **Deploy**.
   - On the very first request, `src/lib/db.ts` automatically runs all `CREATE TABLE IF NOT EXISTS` statements in `src/lib/schema.ts`.
   - `frontend/vercel.json` automatically schedules `/api/cron/discover` to run every day at `02:30 UTC` (**08:00 AM IST**).

---

# Part 2: Complete Engineering Owner's Manual

## 1. Architecture Overview
- **Dual-Driver Postgres (`src/lib/db.ts`):** Uses `@electric-sql/pglite` locally (`.data/pglite`) when `DATABASE_URL` is unset, and `pg.Pool` in production when `DATABASE_URL` is set. Both run the exact same PostgreSQL DDL and queries (`JSONB`, `TIMESTAMPTZ`, `ILIKE`, `ON CONFLICT`).
- **Idempotent Schema (`src/lib/schema.ts`):** 7 tables (`profile`, `sources`, `companies`, `opportunities`, `applications`, `outreach`, `events`).
- **Cross-Board Deduplication (`src/lib/text.ts` & `src/lib/opportunities.ts`):** `fingerprint(company, title)` normalizes company names (stripping `Inc`, `LLC`, `Labs`, `Technologies`) and job titles (stripping `(Remote)`, `- Worldwide`, etc.) so the same job across Ashby, Greenhouse, and WWR maps to a single `opportunities` row and merges its source into `seen_on`.
- **Fresher-Aware Fit Engine (`src/lib/fit.ts`):**
  - **Hard Constraints Separated from Scores:** `US-only`, `EU-only`, non-India onsite, `3+ years REQUIRED`, and `Senior/Staff/Lead` titles immediately trigger `verdict = "SKIP"` and cannot be rescued by a high skill score.
  - **Section-Aware Experience Parsing:** Distinguishes `REQUIRED` vs `PREFERRED` (`Nice to have` / `Bonus`) vs `NONE` (unstated). `"1-2 years preferred"` gets an 85% experience score instead of rejecting you.
  - **Implied Skill Graph (`src/lib/skills.ts`):** `FastAPI` implies `Python`, `REST APIs`, `Async/Concurrency`; `Next.js` implies `React`, `JavaScript`, `HTML/CSS`; `RAG` implies `LLM`, `Vector DB`, `NLP`.
  - **Weighted Formula:** `35% Technical + 20% Remote + 15% Experience + 15% Outreach + 10% Compensation + 5% Friction`, bucketed into `S`, `A`, `B`, `C`, or `SKIP`, plus `OUTREACH FIRST` detection for founder-led startups.
- **Grounded Resume Tailoring (`src/lib/resume.ts` & `src/lib/gemini.ts`):** Chooses between 3 variants (`ai-fullstack`, `backend-ai`, `founding`) and enforces in code that AI can only reorder skills/projects that already exist in your profile.
- **Follow-Up State Machine (`src/app/actions.ts`):**
  - **Applications:** Day 0 (`APPLIED`) -> Day 4 (Follow-up #1) -> Day 9 (Follow-up #2) -> `DORMANT`.
  - **Outreach:** Day 0 (`SENT`) -> Day 4 (Follow-up #1) -> Day 10 (Final Follow-up #2) -> `DORMANT`.

