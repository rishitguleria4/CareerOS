import fs from "fs";
import path from "path";
import { SCHEMA } from "./schema";

type Row = Record<string, any>;
interface Driver {
  query(sql: string, params: any[]): Promise<Row[]>;
}

const g = globalThis as unknown as { __cos_db?: Promise<Driver> };

async function createDriver(): Promise<Driver> {
  let driver: Driver;
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    driver = { query: async (sql, params) => (await pool.query(sql, params)).rows };
  } else {
    if (process.env.VERCEL) {
      throw new Error(
        "DATABASE_URL is not set. On Vercel, add a Postgres database (Neon via Vercel Storage) and redeploy."
      );
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = path.join(process.cwd(), ".data", "pglite");
    fs.mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    await db.waitReady;
    driver = { query: async (sql, params) => (await db.query(sql, params)).rows as Row[] };
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

