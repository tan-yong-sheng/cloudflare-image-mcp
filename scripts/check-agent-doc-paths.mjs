#!/usr/bin/env node
// ============================================================================
// Assert that the repo paths named in agent docs actually exist
// ============================================================================
// Agent docs are context pointers: a line in AGENTS.md (or a doc it points
// at) names a path and states when to read it. A pointer at a path that does
// not exist fails silently — the agent follows it, finds nothing, and
// concludes the material is absent rather than mis-filed. That is exactly
// how `docs/adr/` survived in docs/agents/domain.md after the ADRs moved to
// `docs/decisions/`, hiding ADR-001 from every agent that could have used it.
//
// So the rule this enforces: every backticked repo path in the agent-facing
// docs resolves. It scans AGENTS.md and docs/agents/*.md, skips fenced code
// blocks (those hold illustrative trees, not pointers), and ignores tokens
// that are not paths (identifiers, commands, globs, URLs, placeholders).
//
// Run: node scripts/check-agent-doc-paths.mjs
// Exits 1 and lists every miss when a pointer is broken.
// ============================================================================

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Pointers whose target is legitimately absent from a fresh checkout.
 *
 * Each entry is a deliberate exception, not a way to silence a finding:
 * `GLOSSARY-MAP.md` is documented as "if it exists", `workers/wrangler.toml`
 * and `client/dist` are gitignored local/build state. Anything else that
 * fails to resolve is a broken pointer and must be fixed, not listed here.
 */
const OPTIONAL_TARGETS = new Set([
  "GLOSSARY-MAP.md",
  "workers/wrangler.toml",
  "client/dist",
]);

/** Docs that carry agent-facing pointers. */
function pointerDocs() {
  const docs = ["AGENTS.md"];
  const agentsDir = join(repoRoot, "docs", "agents");
  for (const name of readdirSync(agentsDir)) {
    if (name.endsWith(".md")) docs.push(join("docs", "agents", name));
  }
  return docs;
}

/**
 * Is this backticked token meant as a repo path?
 *
 * Deliberately narrow: a false positive makes the check untrustworthy, so
 * only tokens that look like paths AND either contain a slash or end in a
 * file extension are considered. Identifiers (`requiresAuth`), commands
 * (`npm ci`), globs (`workers/migrations/*.sql`), placeholders
 * (`src/<context>/docs/adr/`) and URLs all fall out here.
 */
function asRepoPath(token) {
  if (token.length === 0) return null;
  // A repo path is relative: a leading slash means an HTTP route
  // (`/mcp`, `/admin`) or a slash-command (`/triage`) — never a file here.
  if (token.startsWith("/")) return null;
  if (!/^[A-Za-z0-9._@/-]+$/.test(token)) return null;
  const withoutSlash = token.replace(/\/+$/, "");
  if (withoutSlash.length === 0) return null;
  const looksLikePath =
    withoutSlash.includes("/") ||
    /\.(md|json|ya?ml|ts|tsx|js|mjs|toml|sql|html|css)$/.test(withoutSlash);
  if (!looksLikePath) return null;
  return withoutSlash;
}

/** Every backticked token on a line that is not inside a fenced code block. */
function pointersIn(text) {
  const found = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      found.push(match[1]);
    }
  }
  return found;
}

function existsInRepo(path) {
  try {
    statSync(join(repoRoot, path));
    return true;
  } catch {
    return false;
  }
}

const missing = [];
const checked = new Set();

for (const doc of pointerDocs()) {
  const text = readFileSync(join(repoRoot, doc), "utf8");
  for (const pointer of pointersIn(text)) {
    const path = asRepoPath(pointer);
    if (path === null) continue;
    if (OPTIONAL_TARGETS.has(path)) continue;
    checked.add(path);
    if (!existsInRepo(path)) {
      missing.push({ doc, pointer: path });
    }
  }
}

const unique = [...new Map(missing.map((m) => [m.pointer, m])).values()];

if (unique.length === 0) {
  console.log(
    `agent doc paths: ${checked.size} pointers resolve across ${pointerDocs().length} docs`
  );
  process.exit(0);
}

console.error(
  `agent doc paths: ${unique.length} broken pointer(s) — a path named in an agent doc does not exist:`
);
for (const { doc, pointer } of unique) {
  console.error(`  ${doc} -> ${pointer}`);
}
console.error(
  "\nFix the pointer, or add the target to OPTIONAL_TARGETS in scripts/check-agent-doc-paths.mjs if it is legitimately absent from a fresh checkout."
);
process.exit(1);
