import { Pool } from "pg";

// Single shared pool. Reused across hot-reloads in dev.
const g = globalThis as unknown as { _pool?: Pool };
export const pool =
  g._pool ?? new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") g._pool = pool;

export async function q(text: string, params?: unknown[]) {
  const res = await pool.query(text, params as never);
  return res.rows;
}

// VULNERABLE helper: runs an interpolated SQL string (no params) — used by the
// search/login endpoints on purpose to make SQL injection reachable.
export async function rawUnsafe(text: string) {
  const res = await pool.query(text);
  return res.rows;
}
