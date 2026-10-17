/** Canonical skill -> regex aliases. Deterministic, no LLM. */
const D: Record<string, string> = {
  Python: "python",
  FastAPI: "fast-?api",
  Django: "django",
  Flask: "flask",
  "Node.js": "node\\.?js|nodejs|express\\.js",
  TypeScript: "typescript",
  JavaScript: "javascript|\\bjs\\b|ecmascript",
  React: "react(\\.js|js)?\\b",
  "Next.js": "next\\.?js",
  Go: "\\bgolang\\b|\\bgo\\b(?= (developer|engineer|services|backend))",
  Java: "\\bjava\\b(?!script)",
  "C++": "c\\+\\+",
  Rust: "\\brust\\b",
  PostgreSQL: "postgres(ql)?|psql",
  MySQL: "mysql",
  MongoDB: "mongo(db)?",
  Redis: "redis",
  SQL: "\\bsql\\b",
  SQLAlchemy: "sqlalchemy",
  Docker: "docker",
  Kubernetes: "kubernetes|\\bk8s\\b",
  AWS: "\\baws\\b|amazon web services|\\bec2\\b|\\bs3\\b|lambda",
  GCP: "\\bgcp\\b|google cloud",
  Azure: "azure",
  Vercel: "vercel",
  "CI/CD": "ci/cd|github actions|continuous integration",
  Git: "\\bgit\\b|github",
  LLM: "\\bllms?\\b|large language model|gpt|openai|anthropic|gemini|claude|llama",
  RAG: "\\brag\\b|retrieval[- ]augmented",
  Agents: "\\bagents?\\b|agentic|langgraph|autogen|crewai|tool[- ]calling|function[- ]calling",
  LangChain: "langchain|llamaindex|llama[- ]index",
  "Prompt Engineering": "prompt engineering|prompting",
  "Vector DB": "vector (db|database|store|search)|pinecone|weaviate|qdrant|pgvector|chroma|faiss",
  "Machine Learning": "machine learning|\\bml\\b|deep learning|neural net",
  PyTorch: "pytorch|torch",
  TensorFlow: "tensorflow",
  "scikit-learn": "scikit-?learn|sklearn",
  NLP: "\\bnlp\\b|natural language",
  Pandas: "pandas|numpy",
  "REST APIs": "rest(ful)?( apis?)?|\\bapis?\\b|openapi",
  GraphQL: "graphql",
  Microservices: "microservices?",
  Celery: "celery",
  Kafka: "kafka",
  Tailwind: "tailwind",
  HTML_CSS: "\\bhtml\\b|\\bcss\\b",
  Testing: "pytest|jest|unit tests?|testing|tdd",
  Linux: "linux|bash",
  "Async/Concurrency": "asyncio|async|concurren",
  WebSockets: "websockets?",
  Terraform: "terraform",
  Firebase: "firebase|supabase",
};

export const SKILL_PATTERNS: [string, RegExp][] = Object.entries(D).map(([name, src]) => [
  name === "HTML_CSS" ? "HTML/CSS" : name,
  new RegExp(src, "i"),
]);

export function extractSkills(text: string): string[] {
  const found: string[] = [];
  for (const [name, re] of SKILL_PATTERNS) if (re.test(text)) found.push(name);
  return found;
}

/** Skills that imply each other so a profile listing FastAPI also covers "REST APIs", etc. */
export const IMPLIES: Record<string, string[]> = {
  FastAPI: ["Python", "REST APIs", "Async/Concurrency"],
  Django: ["Python", "REST APIs"],
  Flask: ["Python", "REST APIs"],
  "Next.js": ["React", "JavaScript", "HTML/CSS"],
  React: ["JavaScript", "HTML/CSS"],
  TypeScript: ["JavaScript"],
  "Node.js": ["JavaScript", "REST APIs"],
  PostgreSQL: ["SQL"],
  MySQL: ["SQL"],
  SQLAlchemy: ["SQL", "Python"],
  RAG: ["LLM", "Vector DB", "NLP"],
  Agents: ["LLM"],
  LangChain: ["LLM"],
  PyTorch: ["Machine Learning"],
  TensorFlow: ["Machine Learning"],
  "scikit-learn": ["Machine Learning", "Python"],
  Docker: ["Linux"],
  Vercel: ["CI/CD"],
};

export function expandSkills(skills: string[]): Set<string> {
  const out = new Set<string>(skills);
  for (const s of skills) for (const i of IMPLIES[s] ?? []) out.add(i);
  return out;
}

