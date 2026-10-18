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
import {
  columnsOf,
  freshDb,
  migrationFiles,
  migrationSql,
} from "../test-utils/migration-fixtures.js";

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

function indexesOf(db: DatabaseSync, table: string): string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?" +
          " AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all(table) as { name: string }[]
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

  test("0002 adds the admin audit table (R2)", () => {
    expect(userTables(freshDb())).toContain("admin_audit");
    expect(columnsOf(freshDb(), "admin_audit")).toEqual([
      "id",
      "actor",
      "action",
      "provider_id",
      "key_id",
      "key_label",
      "created_at",
    ]);
  });

  test("0003's rebuild keeps the audit key index (R2 follow-up)", () => {
    // 0003 rebuilds admin_audit to widen the action CHECK; the rebuilt table
    // must not silently lose the index 0002 created on it.
    expect(indexesOf(freshDb(), "admin_audit")).toContain(
      "idx_admin_audit_key"
    );
  });

  test("0003's rebuild keeps the audit autoincrement high-water mark (R2 follow-up)", () => {
    // An id deleted above the surviving rows must not be reissued by the
    // rebuild: AUTOINCREMENT's no-reuse guarantee is the whole reason an
    // audit ledger takes it.
    const db = freshDb("0002_admin_audit.sql");
    db.exec(
      "INSERT INTO admin_audit (actor, action, provider_id, key_id, key_label)" +
        " VALUES ('op', 'add', 'cloudflare', NULL, 'a')," +
        " ('op', 'add', 'cloudflare', NULL, 'b')," +
        " ('op', 'add', 'cloudflare', NULL, 'c')"
    );
    db.exec("DELETE FROM admin_audit WHERE id = 3");
    db.exec(migrationSql("0003_admin_audit_update_action.sql"));
    db.exec(
      "INSERT INTO admin_audit (actor, action, provider_id, key_id, key_label)" +
        " VALUES ('op', 'update', 'cloudflare', NULL, 'd')"
    );
    const row = db.prepare("SELECT MAX(id) AS id FROM admin_audit").get() as {
      id: number;
    };
    expect(row.id).toBe(4);
  });

  test("0004 admits the delete action and keeps the audit key index (#102)", () => {
    // The hard-delete path records action 'delete'; 0003's CHECK does not
    // admit it, so the widening has to survive as its own forward-only
    // migration (a database that already ran 0003 never re-reads that file).
    const db = freshDb();
    db.exec(
      "INSERT INTO admin_audit (actor, action, provider_id, key_id, key_label)" +
        " VALUES ('op', 'delete', 'cloudflare', NULL, 'gone')"
    );
    expect(indexesOf(db, "admin_audit")).toContain("idx_admin_audit_key");
  });

  test("0004 rejects an action outside the ledger vocabulary (#102)", () => {
    const db = freshDb();
    expect(() =>
      db.exec(
        "INSERT INTO admin_audit (actor, action, provider_id, key_id, key_label)" +
          " VALUES ('op', 'purge', 'cloudflare', NULL, 'gone')"
      )
    ).toThrow();
  });

  test("0004's rebuild keeps the audit autoincrement high-water mark (#102)", () => {
    // Same no-reuse guarantee 0003 had to preserve: 0004 rebuilds the table
    // again, so an id deleted above the surviving rows must still not be
    // reissued.
    const db = freshDb("0003_admin_audit_update_action.sql");
    db.exec(
      "INSERT INTO admin_audit (actor, action, provider_id, key_id, key_label)" +
        " VALUES ('op', 'add', 'cloudflare', NULL, 'a')," +
        " ('op', 'add', 'cloudflare', NULL, 'b')," +
        " ('op', 'add', 'cloudflare', NULL, 'c')"
    );
    db.exec("DELETE FROM admin_audit WHERE id = 3");
    db.exec(migrationSql("0004_audit_delete_action.sql"));
    db.exec(
      "INSERT INTO admin_audit (actor, action, provider_id, key_id, key_label)" +
        " VALUES ('op', 'delete', 'cloudflare', NULL, 'd')"
    );
    const row = db.prepare("SELECT MAX(id) AS id FROM admin_audit").get() as {
      id: number;
    };
    expect(row.id).toBe(4);
  });

  test("provider catalog is seeded with Cloudflare and Agnes", () => {
    // 0005 seeds the Agnes row (R3-Agnes, #75). Its transport value is the
    // registry key TRANSPORT_FACTORIES serves (ADR-002), which is what makes
    // a published Agnes credential reachable by the dispatcher.
    const db = freshDb();
    const rows = db
      .prepare(
        "SELECT id, display_name, transport FROM providers ORDER BY rowid"
      )
      .all() as { id: string; display_name: string; transport: string }[];
    expect(rows).toEqual([
      {
        id: "cloudflare",
        display_name: "Cloudflare Workers AI",
        transport: "cloudflare-rest",
      },
      {
        id: "agnes",
        display_name: "Agnes AI",
        transport: "openai-compat",
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
