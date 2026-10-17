export type Verdict = "PASS" | "MAYBE" | "SKIP";
export type Tier = "S" | "A" | "B" | "C" | "SKIP";
export type RemoteClass =
  | "worldwide"
  | "india"
  | "remote"
  | "regional"
  | "restricted"
  | "onsite"
  | "unknown";
export type ExpKind = "none" | "preferred" | "required";

export interface Project {
  name: string;
  description: string;
  tech: string[];
  url?: string;
}

export interface Profile {
  name: string;
  email: string;
  phone: string;
  location: string;
  timezone: string;
  github: string;
  linkedin: string;
  portfolio: string;
  headline: string;
  summary: string;
  targetRoles: string[];
  skills: string[];
  projects: Project[];
  education: string[];
  experience: string[];
  achievements: string[];
  workAuth: string;
  yearsExperience: number;
  minSalaryUsdMonthly: number;
  answers: { q: string; a: string }[];
  resumeText: string;
  // Direct 1-tap Email / SMTP settings (optional in UI or env)
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

export interface FormFieldItem {
  name: string;
  label: string;
  value: string;
  required?: boolean;
  needsReview?: boolean;
  kind?: "text" | "textarea" | "select" | "file";
}

export interface FitReport {
  verdict: Verdict;
  tier: Tier;
  score: number;
  action: string;
  hardReasons: string[];
  remote: { cls: RemoteClass; indiaEligible: "yes" | "likely" | "unknown" | "no"; note: string };
  experience: { kind: ExpKind; years: number | null; note: string };
  skills: { name: string; level: "strong" | "partial" | "missing" }[];
  salary: { min: number | null; max: number | null; currency: string | null; note: string };
  breakdown: {
    technical: number;
    experience: number;
    remote: number;
    location: number;
    compensation: number;
    friction: number;
    outreach: number;
  };
  signals: string[];
}

export interface Opportunity {
  id: number;
  company_id: number | null;
  company_name: string;
  title: string;
  url: string;
  source: string;
  seen_on: string[];
  location: string | null;
  description: string | null;
  salary_text: string | null;
  posted_at: Date | null;
  fit: FitReport | null;
  score: number | null;
  verdict: Verdict | null;
  tier: Tier | null;
  status: string;
  notes: string | null;
  first_seen: Date;
  last_seen: Date;
}

export interface Application {
  id: number;
  opportunity_id: number;
  status: string;
  resume_variant: string | null;
  tailored_resume: string | null;
  cover_note: string | null;
  form_fields: FormFieldItem[] | null;
  submit_log: string | null;
  applied_at: Date | null;
  next_followup_at: Date | null;
  followup_count: number;
  notes: string | null;
  created_at: Date;
}

export interface OutreachItem {
  id: number;
  opportunity_id: number | null;
  company_name: string;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_url: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  send_log: string | null;
  sent_at: Date | null;
  next_followup_at: Date | null;
  followup_count: number;
  created_at: Date;
}

export interface Source {
  id: number;
  kind: string;
  slug: string;
  name: string | null;
  enabled: boolean;
  last_run: Date | null;
  last_found: number | null;
}

export interface RawJob {
  company: string;
  title: string;
  url: string;
  source: string;
  location?: string;
  description?: string;
  salaryText?: string;
  postedAt?: string;
  remoteFlag?: boolean;
}
