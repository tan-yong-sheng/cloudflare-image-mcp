// ============================================================================
// Migration fixtures - shared harness for the D1 schema tests
// ============================================================================
// Applies workers/migrations/*.sql to an in-memory SQLite database so the
// migration contract can be asserted without a remote D1. Lives outside a
// *.test.ts file on purpose: test files must not import each other, or a
// helper import re-registers the other file's tests inside this one.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

/** migrations/ sits at the workers/ package root, beside src/. */
export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

/** Migration files in apply order (wrangler applies lexicographically). */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Raw SQL of one migration file. */
export function migrationSql(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}

/** Empty database with every migration applied, in order. */
export function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  // D1 enforces foreign keys by default (PRAGMA foreign_keys = 1); mirror
  // that here so FK constraints are exercised, not silently skipped.
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of migrationFiles()) {
    db.exec(migrationSql(file));
  }
  return db;
}

/** Column names of one table, in declaration order. */
export function columnsOf(db: DatabaseSync, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map((r) => r.name);
}
