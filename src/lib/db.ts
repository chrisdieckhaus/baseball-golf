import "server-only";
import { Pool } from "pg";

/**
 * Postgres connection (Neon in production, via the Vercel Marketplace integration).
 * Returns null when no database is configured; callers then fall back to the
 * original stateless behavior, so the game still works without a database.
 */
const globalForDb = globalThis as unknown as { bgPool?: Pool };

export function getDb(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForDb.bgPool) {
    globalForDb.bgPool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  }
  return globalForDb.bgPool;
}
