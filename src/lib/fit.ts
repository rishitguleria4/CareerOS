import type { ExpKind, FitReport, Profile, RawJob, RemoteClass, Tier, Verdict } from "./types";
import { expandSkills, extractSkills } from "./skills";

// ---------- role relevance ----------
const REL_TITLE =
  /(ai|ml|llm|machine learning|backend|back-end|full[- ]?stack|python|software|founding|product engineer|platform|api|data engineer|applied|genai|generative|developer|engineer(ing)?\b)/i;
const NON_ENG_TITLE =
  /(sales|account exec|marketing|recruit|designer|design lead|customer success|support|finance|legal|counsel|hr\b|people ops|operations manager|content|writer|copywriter|social media|business development|bdr|sdr|accountant|mechanical|electrical|hardware|firmware|embedded|security guard|nurse)/i;
const SENIOR_TITLE =
  /(senior|\bsr\.?\b|staff|principal|lead\b|manager|director|head of|vp\b|architect|distinguished)/i;
const JUNIOR_TITLE = /(junior|\bjr\.?\b|intern|new grad|graduate|entry|associate|trainee|early career)/i;

export function isRelevantTitle(title: string): boolean {
  return REL_TITLE.test(title) && !NON_ENG_TITLE.test(title);
}

// ---------- remote / location ----------
const US_ONLY =
  /(\bus\b|u\.s\.|usa|united states)[- ]?(only|based|residents?|citizens?)|(must|need to|required to) (be )?(reside|located|based|live)[^.\n]{0,40}(us\b|u\.s\.|united states|usa)|(authori[sz]ed|eligible|legally entitled) to work (in|within) the (us|u\.s\.|united states)|work authori[sz]ation[^.\n]{0,40}(us|united states)|us citizens?|security clearance|remote[^.\n]{0,15}\((us|usa|united states)\)|remote[- ]?(us|usa)\b|us[- ]remote/i;
const OTHER_REGION =
  /(europe|\beu\b|emea|\buk\b|united kingdom|canada|latam|latin america|australia|germany|france|brazil|mexico)[- ]?(only|based|residents?)|(must|need to) (be )?(located|based|reside)[^.\n]{0,40}(europe|\beu\b|\buk\b|canada|germany|australia|emea)|(remote|remote in)[ -]?\(?(europe|eu|uk|emea|canada|germany|latam)\)?(?!.*(india|worldwide|anywhere))/i;
const WORLDWIDE =
  /worldwide|anywhere( in the world)?|global(ly)? remote|work from anywhere|remote[- ]?(global|first)|any ?time ?zone|international candidates|all countries|globally distributed|distributed team/i;
const INDIA = /\bindia\b|bangalore|bengaluru|hyderabad|mumbai|pune|delhi|gurgaon|gurugram|noida|chennai|kolkata|\bist\b|apac|asia/i;
const REMOTE_WORD = /\bremote\b|work from home|wfh|fully distributed/i;
const HYBRID_ONSITE = /\bhybrid\b|on-?site|in[- ]office|in the office|relocat/i;

export function analyzeRemote(job: RawJob) {
  const loc = job.location ?? "";
  const head = `${loc}\n${job.title}\n${(job.description ?? "").slice(0, 6000)}`;
  const reasons: string[] = [];
  const mentionsIndia = INDIA.test(head);
  const worldwide = WORLDWIDE.test(head) || /\b(worldwide|anywhere|global)\b/i.test(loc);
  const remote = job.remoteFlag === true || REMOTE_WORD.test(head);
  const usOnly = US_ONLY.test(head);
  const otherRegion = OTHER_REGION.test(head);
  const onsite = !remote && (HYBRID_ONSITE.test(head) || (loc !== "" && !/remote/i.test(loc)));

  let cls: RemoteClass = "unknown";
  let eligible: "yes" | "likely" | "unknown" | "no" = "unknown";
  let note = "";

  if (usOnly && !worldwide && !mentionsIndia) {
    cls = "restricted";
    eligible = "no";
    note = "US-only / US work authorization required";
  } else if (otherRegion && !worldwide && !mentionsIndia) {
    cls = "restricted";
    eligible = "no";
    note = "Restricted to a region that excludes India";
  } else if (remote && mentionsIndia) {
    cls = "india";
    eligible = "yes";
    note = "Remote and India/APAC mentioned";
  } else if (remote && worldwide) {
    cls = "worldwide";
    eligible = "likely";
    note = "Worldwide / location-agnostic remote";
  } else if (remote) {
    cls = "remote";
    eligible = "unknown";
    note = "Remote, but eligibility for India is not stated";
  } else if (mentionsIndia) {
    cls = "onsite";
    eligible = "likely";
    note = `On-site/hybrid in India (${loc || "see JD"})`;
  } else if (onsite) {
    cls = "onsite";
    eligible = "no";
    note = `On-site/hybrid: ${loc || "unspecified location"}`;
  } else {
    note = "Location unclear";
  }
  if (usOnly && (worldwide || mentionsIndia)) reasons.push("Mentions US authorization but also worldwide/India");
  return { cls, eligible, note, mixed: reasons.length > 0 };
}

// ---------- experience ----------
const YEARS_RE = /(\d{1,2})\s*(?:\+|plus)?\s*(?:[-–to]+\s*(\d{1,2}))?\s*(?:\+|plus)?\s*(?:years?|yrs?)/i;
const SEC_REQ = /^(requirements?|qualifications?|what you('ll| will) (need|bring)|must[- ]have|minimum|you have|who you are|about you|basic qualifications)/i;
const SEC_PREF = /^(nice[- ]to[- ]have|preferred|bonus|pluses|plus|good to have|extra credit|desirable)/i;
const PREF_WORDS = /(prefer|nice to have|bonus|ideal(ly)?|a plus|is a plus|desirable|good to have|not required|helpful)/i;
const REQ_WORDS = /(required|must|minimum|at least|need|requirement|you have|you've|you have\s)/i;

export function analyzeExperience(text: string): { kind: ExpKind; years: number | null; note: string } {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let section: "req" | "pref" | null = null;
  let maxReq: number | null = null;
  let maxPref: number | null = null;
  for (const line of lines) {
    const clean = line.replace(/^[-*•\s]+/, "");
    if (clean.length < 60 && /[:：]?$/.test(clean)) {
      if (SEC_PREF.test(clean)) section = "pref";
      else if (SEC_REQ.test(clean)) section = "req";
    }
    for (const sentence of clean.split(/(?<=[.;])\s+/)) {
      const m = sentence.match(YEARS_RE);
      if (!m) continue;
      // ignore things like "10 years of funding" / "founded 5 years ago"
      if (/(ago|founded|funded|old|history|since|growth|track record of|company)/i.test(sentence) && !/experience/i.test(sentence)) continue;
      const years = parseInt(m[1], 10);
      if (years > 15) continue;
      let kind: "req" | "pref";
      if (PREF_WORDS.test(sentence)) kind = "pref";
      else if (REQ_WORDS.test(sentence) && !PREF_WORDS.test(sentence)) kind = "req";
      else kind = section ?? "req";
      if (kind === "req") maxReq = Math.max(maxReq ?? 0, years);
      else maxPref = Math.max(maxPref ?? 0, years);
    }
  }
  if (maxReq !== null && maxReq > 0)
    return { kind: "required", years: maxReq, note: `${maxReq}+ years REQUIRED` };
  if (maxPref !== null && maxPref > 0)
    return { kind: "preferred", years: maxPref, note: `${maxPref} years PREFERRED (not blocking for a fresher)` };
  return { kind: "none", years: null, note: "Experience not stated (high opportunity)" };
}

// ---------- salary ----------
export function parseSalary(text: string): { min: number | null; max: number | null; currency: string | null; monthlyUsd: number | null } {
  const re = /(\$|usd|₹|inr|rs\.?|€|eur|£|gbp)\s?(\d{1,3}(?:[,.]\d{3})*|\d+(?:\.\d+)?)\s?(k|lpa|lakhs?|l)?\s*(?:[-–to]+\s*(?:\$|usd|₹|inr|rs\.?|€|eur|£|gbp)?\s?(\d{1,3}(?:[,.]\d{3})*|\d+(?:\.\d+)?)\s?(k|lpa|lakhs?|l)?)?/i;
  const m = text.match(re);
  if (!m) return { min: null, max: null, currency: null, monthlyUsd: null };
  const cur = m[1].toLowerCase();
  const toNum = (v: string | undefined, suf: string | undefined, fallbackSuf?: string) => {
    if (!v) return null;
    let n = parseFloat(v.replace(/,/g, ""));
    const s = (suf ?? fallbackSuf ?? "").toLowerCase();
    if (s === "k") n *= 1000;
    else if (/^(lpa|l|lakhs?)$/.test(s)) n *= 100000;
    return n;
  };
  const min = toNum(m[2], m[3], m[5]);
  const max = toNum(m[4], m[5], m[3]) ?? min;
  const currency = /\$|usd/.test(cur) ? "USD" : /₹|inr|rs/.test(cur) ? "INR" : /€|eur/.test(cur) ? "EUR" : "GBP";
  if (min === null) return { min: null, max: null, currency: null, monthlyUsd: null };
  const rate = currency === "USD" ? 1 : currency === "INR" ? 1 / 84 : currency === "EUR" ? 1.08 : 1.27;
  const top = (max ?? min) * rate;
  const isMonthly = top < 20000; // heuristic: small numbers => per month
  const monthlyUsd = isMonthly ? top : top / 12;
  return { min, max, currency, monthlyUsd };
}

// ---------- company-stage signals ----------
const STARTUP = /(early[- ]stage|seed|series a|pre-seed|yc\b|y combinator|startup|founding|small team|founder|0 ?(to|→) ?1|first engineer|early engineer|stealth)/i;

// ---------- the engine ----------
export function analyzeJob(job: RawJob, profile: Profile): FitReport {
  const text = `${job.title}\n${job.description ?? ""}`;
  const hardReasons: string[] = [];
  const signals: string[] = [];

  const remote = analyzeRemote(job);
  const exp = analyzeExperience(job.description ?? "");
  const sal = parseSalary(`${job.salaryText ?? ""} ${(job.description ?? "").slice(0, 4000)}`);

  const seniorTitle = SENIOR_TITLE.test(job.title) && !JUNIOR_TITLE.test(job.title);
  const juniorTitle = JUNIOR_TITLE.test(job.title);

  // ---- hard constraints (never rescued by score) ----
  if (remote.cls === "restricted") hardReasons.push(remote.note);
  if (remote.cls === "onsite" && remote.eligible === "no") hardReasons.push(remote.note);
  if (exp.kind === "required" && (exp.years ?? 0) >= 3) hardReasons.push(`${exp.years}+ years required`);
  if (seniorTitle) hardReasons.push(`Senior-level title: "${job.title}"`);
  if (!isRelevantTitle(job.title)) hardReasons.push("Not an engineering role you target");

  // ---- skills ----
  const jdSkills = extractSkills(text);
  const mine = expandSkills(profile.skills.length ? profile.skills : []);
  const skills = jdSkills.map((name) => ({
    name,
    level: (mine.has(name) ? "strong" : profile.skills.length ? "missing" : "partial") as "strong" | "partial" | "missing",
  }));
  let technical = 50;
  if (jdSkills.length > 0 && profile.skills.length > 0) {
    const strong = skills.filter((s) => s.level === "strong").length;
    technical = Math.round((strong / jdSkills.length) * 100);
    // JD skill lists are often long wishlists; don't over-penalise
    technical = Math.min(100, Math.round(technical * 1.15 + 8));
  } else if (jdSkills.length === 0) technical = 55;

  const roleHit = profile.targetRoles.some((r) => new RegExp(r.split(/\s+/).join(".*"), "i").test(job.title));
  if (roleHit) technical = Math.min(100, technical + 8);

  // ---- component scores ----
  const experience =
    exp.kind === "none" ? 100 : exp.kind === "preferred" ? 85 : (exp.years ?? 0) <= 1 ? 90 : (exp.years ?? 0) === 2 ? 60 : 10;
  const remoteScore =
    remote.cls === "india" ? 100 : remote.cls === "worldwide" ? 100 : remote.cls === "remote" ? 70 : remote.cls === "onsite" ? (remote.eligible === "likely" ? 45 : 0) : remote.cls === "restricted" ? 0 : 40;
  const location = remote.eligible === "yes" ? 100 : remote.eligible === "likely" ? 90 : remote.eligible === "unknown" ? 55 : 0;

  let compensation = 70;
  if (sal.monthlyUsd !== null) {
    const floor = profile.minSalaryUsdMonthly || 2500;
    compensation = sal.monthlyUsd >= floor ? 100 : Math.max(10, Math.round((sal.monthlyUsd / floor) * 100));
  }
  const src = job.source.toLowerCase();
  const friction = /greenhouse|lever|ashby/.test(src) ? 95 : /yc|workatastartup/.test(src) ? 85 : /email/.test(src) ? 80 : 65;

  const startup = STARTUP.test(text) || /yc|workatastartup/.test(src);
  const broadOwnership = /(own|end[- ]to[- ]end|wear many hats|ship|full[- ]stack|0 ?to ?1)/i.test(text);
  let outreach = 40;
  if (startup) outreach += 35;
  if (broadOwnership) outreach += 10;
  if (exp.kind === "none") outreach += 10;
  if (juniorTitle) outreach += 5;
  outreach = Math.min(100, outreach);

  if (startup) signals.push("Startup / founder-led signals");
  if (juniorTitle) signals.push("Junior/entry-level title");
  if (exp.kind === "none") signals.push("No experience stated");
  if (roleHit) signals.push("Title matches a target role");
  if (remote.mixed) signals.push("US auth mentioned alongside worldwide/India — verify");

  const blended =
    technical * 0.35 + experience * 0.15 + remoteScore * 0.2 + compensation * 0.1 + friction * 0.05 + outreach * 0.15;
  let score = Math.round(blended);
  if (juniorTitle) score = Math.min(100, score + 3);

  // ---- verdict / tier ----
  let verdict: Verdict;
  let tier: Tier;
  let action: string;
  if (hardReasons.length > 0) {
    verdict = "SKIP";
    tier = "SKIP";
    action = "SKIP";
  } else {
    const uncertain = remote.eligible === "unknown" || remote.cls === "onsite" || remote.mixed;
    if (score >= 82 && startup && !uncertain) tier = "S";
    else if (score >= 72) tier = "A";
    else if (score >= 55) tier = "B";
    else tier = "C";
    verdict = tier === "S" || (tier === "A" && !uncertain) ? "PASS" : "MAYBE";
    const weakTitle = !roleHit && !juniorTitle;
    const outreachFirst = startup && (weakTitle || exp.kind === "required") && technical >= 55;
    if (tier === "S") action = "🔥 APPLY + OUTREACH";
    else if (outreachFirst) action = "OUTREACH FIRST";
    else if (tier === "A") action = "APPLY";
    else if (tier === "B") action = "REVIEW";
    else action = "LOW PRIORITY";
  }

  return {
    verdict,
    tier,
    score,
    action,
    hardReasons,
    remote: { cls: remote.cls, indiaEligible: remote.eligible, note: remote.note },
    experience: exp,
    skills,
    salary: {
      min: sal.min,
      max: sal.max,
      currency: sal.currency,
      note: sal.monthlyUsd !== null ? `≈ $${Math.round(sal.monthlyUsd).toLocaleString()}/mo` : "Not stated",
    },
    breakdown: { technical, experience, remote: remoteScore, location, compensation, friction, outreach },
    signals,
  };
}

