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
const GOV_CLEARANCE =
  /\b(us citizens? only|u\.s\. citizens? only|security clearance|top secret|ts\/sci|itar|dod clearance|fedramp|public trust clearance)\b/i;

const JD_REGIONAL_LOCK =
  /\b(w-?2 only|no (international )?contractors|no c2c|(must|need to|required to) (currently )?(reside|live|be physically located|be based) in (the )?(us\b|u\.s\.|united states|uk\b|united kingdom|canada|europe|\beu\b|north america|americas)|(authori[sz]ed|legally entitled|eligible) to work in (the )?(us|u\.s\.|united states|uk|united kingdom|canada|eu|europe) without (visa )?sponsorship|remote\s*[-–(:]\s*(us|u\.s\.|usa|uk|canada|eu|europe|north america|latam|americas)\b|\b(us|u\.s\.|usa|eu|uk|canada)[- ]only\b|united states only|candidates (based|located) in (the )?(us|united states|uk|eu|europe|north america|canada) only)\b/i;

const WORLDWIDE =
  /worldwide|anywhere( in the world)?|global(ly)? remote|work from anywhere|remote[- ]?(global|first)|any ?time ?zone|international (candidates|contractors)|all countries|globally distributed|\b(deel|rippling|b2b contract|independent contractor)\b/i;
const INDIA = /\bindia\b|bangalore|bengaluru|hyderabad|mumbai|pune|delhi|gurgaon|gurugram|noida|chennai|kolkata|\bist\b|apac|south asia/i;
const REMOTE_WORD = /\b(remote|work from home|wfh|fully distributed|telecommut)\b/i;
const HYBRID_ONSITE = /\b(hybrid|on-?site|in[- ]office|in the office|office[- ]based|relocat)\b/i;

const NON_INDIA_LOC =
  /\b(united states|u\.s\.a?\.?|\bus\b|\busa\b|canada|uk\b|united kingdom|england|london|germany|berlin|munich|france|paris|europe|\beu\b|emea|amer\b|americas|north america|latam|latin america|australia|sydney|melbourne|japan|tokyo|dublin|ireland|amsterdam|netherlands|spain|madrid|barcelona|italy|poland|sweden|stockholm|switzerland|zurich|israel|tel aviv|brazil|mexico|singapore|san francisco|bay area|silicon valley|new york|nyc|brooklyn|manhattan|foster city|mountain view|palo alto|menlo park|sunnyvale|san jose|santa clara|redwood city|san mateo|seattle|bellevue|austin|boston|cambridge|chicago|los angeles|santa monica|irvine|san diego|denver|boulder|atlanta|washington|arlington|miami|philadelphia|pittsburgh|toronto|vancouver|montreal|waterloo)\b|,\s*(ca|ny|wa|tx|ma|il|co|ga|va|dc|fl|pa|oh|nc|nj|mi|mn|az|or|ut|md|tn|on|bc)\b/i;

const GLOBAL_REMOTE_SOURCES = new Set([
  "himalayas",
  "jobicy",
  "workingnomads",
  "weworkremotely",
  "remoteok",
  "remotive",
]);

export function analyzeRemote(job: RawJob) {
  const loc = (job.location ?? "").trim();
  const titleAndLoc = `${loc}\n${job.title}`;
  const head = `${titleAndLoc}\n${(job.description ?? "").slice(0, 6000)}`;
  const reasons: string[] = [];

  const mentionsIndiaInLoc = INDIA.test(loc);
  const mentionsIndiaInJd = INDIA.test(head);
  const locWorldwide = /\b(worldwide|anywhere|global|all countries|international)\b/i.test(loc);
  const worldwide = WORLDWIDE.test(head) || locWorldwide;

  const locExplicitRemote = REMOTE_WORD.test(titleAndLoc) || locWorldwide;
  const locExplicitOnsite = HYBRID_ONSITE.test(loc) && !locExplicitRemote;
  const locHasPhysicalPlace =
    (NON_INDIA_LOC.test(loc) || INDIA.test(loc) || (loc !== "" && !/^(yc startup|startup|engineering)$/i.test(loc))) &&
    !locExplicitRemote;

  // Strict Remote-Only gate:
  // A role is remote ONLY if its location/title explicitly says Remote/Worldwide/Anywhere,
  // OR it comes from a dedicated remote feed, OR it has no physical city/country in `loc` and states 100% remote in JD.
  const remote =
    !locExplicitOnsite &&
    (locExplicitRemote ||
      GLOBAL_REMOTE_SOURCES.has(job.source.toLowerCase()) ||
      (!locHasPhysicalPlace &&
        (job.remoteFlag === true ||
          /\b(100% remote|fully remote|work from anywhere|remote[- ]first)\b/i.test(head))));

  const locHasNonIndia = NON_INDIA_LOC.test(loc) && !mentionsIndiaInLoc && !locWorldwide;
  const govClearance = GOV_CLEARANCE.test(head);
  const jdRegionalLock = JD_REGIONAL_LOCK.test(head);

  let cls: RemoteClass = "unknown";
  let eligible: "yes" | "likely" | "unknown" | "no" = "unknown";
  let note = "";

  if (!remote) {
    // Hard Reject: On-site or hybrid roles (whether in US, EU, India, or anywhere else)
    cls = "onsite";
    eligible = "no";
    note = loc
      ? `On-site / hybrid (${loc}) — Remote-only filter`
      : "On-site / non-remote role — Remote-only filter";
  } else if (govClearance) {
    // Hard Reject: Defense / security clearance roles
    cls = "restricted";
    eligible = "no";
    note = "Requires US citizenship / government security clearance";
  } else if (mentionsIndiaInLoc || (mentionsIndiaInJd && !locHasNonIndia && !jdRegionalLock)) {
    // Lane 1A: Explicitly open to Remote from India / APAC
    cls = "india";
    eligible = "yes";
    note = "Remote · Eligible from India / APAC";
  } else if (locWorldwide || (worldwide && !locHasNonIndia && !jdRegionalLock)) {
    // Lane 1B: Explicitly Worldwide / Global Remote
    cls = "worldwide";
    eligible = "yes";
    note = "Remote · Worldwide / India-eligible";
  } else if (!locHasNonIndia && !jdRegionalLock) {
    // Lane 1C: Pure location-agnostic Remote with no US/EU residency lock
    cls = "remote";
    eligible = "likely";
    note = "Remote · Location-agnostic (India eligible)";
  } else {
    // Lane 2: Genuinely Remote work, but currently restricted to US/EU/non-India -> Founder Outreach target!
    cls = "regional";
    eligible = "no";
    const regionLabel = loc ? loc.replace(/^Remote\s*[-–·(]?\s*/i, "").replace(/\)$/, "").trim() : "US/EU";
    note = `Remote (${regionLabel || "US/EU only right now"}) · Not India-eligible → Outreach target`;
  }

  if (jdRegionalLock && (worldwide || mentionsIndiaInJd)) {
    reasons.push("Mentions regional work auth alongside global/India keywords");
  }
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
  if (remote.cls === "onsite") hardReasons.push(remote.note);
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

  const escapeRole = (r: string) =>
    r
      .replace(/[+]/g, " ")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .trim()
      .split(/\s+/)
      .join(".*");
  const primaryRolePattern =
    /\b(founding engineer|early[- ]stage engineer|early engineer|first engineer|0[- ]?to[- ]?1|ai product engineer|ai full[- ]?stack|full[- ]?stack ai|backend\s*(\+|and|&)?\s*ai|ai\s*(\+|and|&)?\s*backend|product engineer)\b/i;
  const roleHit =
    primaryRolePattern.test(job.title) ||
    profile.targetRoles.some((r) => new RegExp(escapeRole(r), "i").test(job.title));
  if (roleHit) technical = Math.min(100, technical + 10);

  if (remote.cls === "regional" && technical < 52) {
    hardReasons.push("Non-India remote role with low technical stack overlap");
  }

  // ---- component scores ----
  const experience =
    exp.kind === "none" ? 100 : exp.kind === "preferred" ? 85 : (exp.years ?? 0) <= 1 ? 90 : (exp.years ?? 0) === 2 ? 60 : 10;
  const remoteScore =
    remote.cls === "india"
      ? 100
      : remote.cls === "worldwide"
      ? 100
      : remote.cls === "remote"
      ? 92
      : remote.cls === "regional"
      ? 72
      : 0;
  const location =
    remote.eligible === "yes" ? 100 : remote.eligible === "likely" ? 94 : remote.cls === "regional" ? 35 : 0;

  const src = job.source.toLowerCase();
  const startup = STARTUP.test(text) || /yc|hn|workatastartup|ashby|workable|arbeitnow/.test(src);
  const broadOwnership = /(own|end[- ]to[- ]end|wear many hats|ship|full[- ]stack|0 ?(to|→) ?1|product[- ]minded)/i.test(text);

  // ---- 4-tier compensation hierarchy ----
  const minFloor = profile.minSalaryUsdMonthly || 2500;
  const targetFloor = profile.targetSalaryUsdMonthly || 3000;
  const idealFloor = profile.idealSalaryUsdMonthly || 3500;
  const upsideFloor = profile.upsideSalaryUsdMonthly || 5000;
  const credibleFit = technical >= 65 && (startup || roleHit || exp.kind !== "required");

  let compensation = startup ? 82 : 72;
  let salaryNote = startup ? "Not stated (US/EU startup · target $3k–$3.5k/mo)" : "Not stated";

  if (sal.monthlyUsd !== null) {
    const m = Math.round(sal.monthlyUsd);
    const fmt = `≈ $${m.toLocaleString()}/mo`;
    if (m >= upsideFloor) {
      if (credibleFit) {
        compensation = 100;
        salaryNote = `${fmt} · Upside ($5k+/mo, credible fit)`;
        signals.push("Upside comp ($5k+/mo) with credible fit");
      } else {
        compensation = 70;
        salaryNote = `${fmt} · Upside ($5k+/mo, stretch fit)`;
      }
    } else if (m >= idealFloor) {
      compensation = 100;
      salaryNote = `${fmt} · Ideal ($3.5k+/mo)`;
      signals.push("Meets Ideal comp ($3.5k+/mo)");
    } else if (m >= targetFloor) {
      compensation = 92;
      salaryNote = `${fmt} · Target ($3k+/mo)`;
      signals.push("Meets Target comp ($3k+/mo)");
    } else if (m >= minFloor) {
      compensation = 78;
      salaryNote = `${fmt} · Minimum acceptable ($2.5k+/mo)`;
    } else {
      compensation = Math.max(15, Math.round((m / minFloor) * 55));
      salaryNote = `${fmt} · Below $2.5k/mo minimum`;
    }
  }

  const friction = /greenhouse|lever|ashby|workable|yc|hn/.test(src) ? 95 : /himalayas|arbeitnow|remotive|remoteok/.test(src) ? 85 : 70;

  let outreach = 40;
  if (startup) outreach += 35;
  if (broadOwnership) outreach += 10;
  if (exp.kind === "none") outreach += 10;
  if (juniorTitle) outreach += 5;
  if (remote.cls === "regional") outreach = Math.min(100, outreach + 10);
  outreach = Math.min(100, outreach);

  if (startup) signals.push("Early-stage / startup signals");
  if (broadOwnership) signals.push("0→1 end-to-end ownership");
  if (juniorTitle) signals.push("Early-career / junior title");
  if (exp.kind === "none") signals.push("No years-of-experience gate");
  if (roleHit) signals.push("Matches primary target role");
  if (remote.cls === "regional") signals.push("Remote (Non-India) → Pitch founder as India remote contractor");
  if (remote.mixed) signals.push("US auth mentioned alongside worldwide/India — verify");

  const blended =
    technical * 0.35 + experience * 0.15 + remoteScore * 0.2 + compensation * 0.1 + friction * 0.05 + outreach * 0.15;
  let score = Math.round(blended);
  if (juniorTitle || primaryRolePattern.test(job.title)) score = Math.min(100, score + 3);

  // ---- verdict / tier ----
  let verdict: Verdict;
  let tier: Tier;
  let action: string;
  if (hardReasons.length > 0) {
    verdict = "SKIP";
    tier = "SKIP";
    action = "SKIP";
  } else if (remote.cls === "regional") {
    // Lane 2: Remote work exists, but currently not for India -> Founder Outreach Only (never direct portal apply)
    verdict = "MAYBE";
    tier = score >= 74 ? "A" : "B";
    action = "OUTREACH ONLY";
  } else {
    // Lane 1: Remote & Eligible from India (yes / likely)
    const uncertain = remote.eligible !== "yes" && remote.eligible !== "likely";
    if (score >= 82 && startup && !uncertain) tier = "S";
    else if (score >= 72 && !uncertain) tier = "A";
    else if (score >= 55) tier = "B";
    else tier = "C";
    verdict = tier === "S" || tier === "A" ? "PASS" : "MAYBE";
    const weakTitle = !roleHit && !juniorTitle;
    const outreachFirst = startup && (weakTitle || exp.kind === "required") && technical >= 55;
    if (tier === "S") action = "APPLY + OUTREACH";
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
      note: salaryNote,
    },
    breakdown: { technical, experience, remote: remoteScore, location, compensation, friction, outreach },
    signals,
  };
}

