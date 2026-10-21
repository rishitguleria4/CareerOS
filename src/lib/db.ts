import fs from "fs";
import path from "path";
import { SCHEMA } from "./schema";

type Row = Record<string, any>;
interface Driver {
  query(sql: string, params: any[]): Promise<Row[]>;
}

const g = globalThis as unknown as {
  __cos_db?: Promise<Driver>;
  __cos_pglite_mutex?: Promise<any>;
};

export function getPostgresUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

export function isEphemeralVercelDb(): boolean {
  return Boolean(process.env.VERCEL && !getPostgresUrl());
}

async function initPGlite(dir: string) {
  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync(dir, { recursive: true });
  // Remove stale postmaster.pid if left over from an interrupted dev server or CLI process
  const pidFile = path.join(dir, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    try {
      fs.unlinkSync(pidFile);
    } catch {
      /* ignore */
    }
  }
  const db = new PGlite(dir);
  await db.waitReady;
  return db;
}

async function createDriver(): Promise<Driver> {
  let driver: Driver;
  const pgUrl = getPostgresUrl();
  if (pgUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: pgUrl,
      max: 5,
      ssl: pgUrl.includes("localhost") || pgUrl.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    });
    driver = { query: async (sql, params) => (await pool.query(sql, params)).rows };
  } else {
    // On Vercel without DATABASE_URL/POSTGRES_URL yet, use writable /tmp so the app never 500s before Storage is attached
    const baseDir = process.env.VERCEL ? "/tmp" : path.join(process.cwd(), ".data");
    const dir = path.join(baseDir, "pglite");
    let db;
    try {
      db = await initPGlite(dir);
    } catch {
      const backupDir = path.join(baseDir, `pglite.corrupt-${Date.now()}`);
      try {
        fs.renameSync(dir, backupDir);
      } catch {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      db = await initPGlite(dir);
    }

    // Serialize all PGlite WASM queries through a mutex so Promise.all() in Server Components never collides
    driver = {
      query: async (sql, params) => {
        const prev = g.__cos_pglite_mutex ?? Promise.resolve();
        const next = prev
          .catch(() => {})
          .then(async () => {
            const res = await db.query(sql, params);
            return res.rows as Row[];
          });
        g.__cos_pglite_mutex = next;
        return next;
      },
    };
  }
  for (const stmt of SCHEMA) await driver.query(stmt, []);
  return driver;
}

function getDriver(): Promise<Driver> {
  if (!g.__cos_db) {
    g.__cos_db = createDriver().catch((e) => {
      g.__cos_db = undefined;
      throw e;
    });
  }
  return g.__cos_db;
}

export async function query<T = Row>(sql: string, params: any[] = []): Promise<T[]> {
  const d = await getDriver();
  return (await d.query(sql, params)) as T[];
}

export async function queryOne<T = Row>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function logEvent(kind: string, ref: string | number | null, message: string) {
  await query("INSERT INTO events (kind, ref, message) VALUES ($1,$2,$3)", [
    kind,
    ref === null ? null : String(ref),
    message,
  ]);
}
