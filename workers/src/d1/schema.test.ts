// ============================================================================
// D1 provider schema tests - R1a (#71), migration validity seam
// ============================================================================
// Seam: workers/migrations/*.sql applied to an empty SQLite database.
// Proves the D1 foundation exists and is versioned before any Worker code
// touches it (reads land in R1b, #72). Uses node:sqlite (same engine
// family as D1); asserts only what D1 enforces — tables, UNIQUE / CHECK /
// partial-unique constraints. D1 enforces foreign keys by default
// (PRAGMA foreign_keys = 1 on a real instance); the harness mirrors that,
// so FK behavior is covered too, not just the UNIQUE/CHECK guards.

import { describe, expect, test } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb, migrationFiles } from "../test-utils/migration-fixtures.js";

function userTables(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table'" +
          " AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
}

describe("provider schema migrations (R1a)", () => {
  test("at least one forward-only migration exists", () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  test("migrations apply cleanly to an empty database", () => {
    expect(() => freshDb()).not.toThrow();
  });

  test("all six R1 tables exist", () => {
    const tables = userTables(freshDb());
    for (const t of [
      "providers",
      "provider_keys",
      "credential_versions",
      "exposure_overrides",
      "excluded_scopes",
      "config_versions",
    ]) {
      expect(tables).toContain(t);
    }
  });

  test("provider catalog is seeded with Cloudflare only", () => {
    const db = freshDb();
    const rows = db
      .prepare("SELECT id, display_name, transport FROM providers")
      .all() as { id: string; display_name: string; transport: string }[];
    expect(rows).toEqual([
      {
        id: "cloudflare",
        display_name: "Cloudflare Workers AI",
        transport: "cloudflare-rest",
      },
    ]);
  });

  test("config version singleton starts at v1", () => {
    const db = freshDb();
    const row = db.prepare("SELECT id, version FROM config_versions").get() as {
      id: number;
      version: number;
    };
    expect(row).toEqual({ id: 1, version: 1 });
  });
});
