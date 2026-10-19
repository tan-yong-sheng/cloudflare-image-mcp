#!/usr/bin/env node
// ============================================================================
// models.json -> workers/src/config/models.generated.ts
// ============================================================================
// `workers/src/config/models.json` is the declared source of truth; this
// script projects it into the TypeScript registry the Worker executes. The
// output is committed, so a model change is reviewable as a normal diff, and
// `--check` (wired into `npm run check`, which CI and the deploy workflow
// both run) refuses a stale projection.
//
// Two invariants this script enforces by itself, so the gate cannot be
// satisfied by a projection that quietly drops data:
//
//   1. Freshness  - the committed file is byte-identical to the rendering.
//   2. Round trip - the printed literal evaluates back to the JSON it came
//                   from. Only the `$comment` documentation keys are
//                   stripped; every other key of every model is carried
//                   through verbatim, so a dropped optional field (min, max,
//                   step, required, exposure, editCapabilities, ...) fails
//                   here rather than at runtime. Missing *required* fields
//                   are additionally caught by `tsc`, because the emitted
//                   literal is annotated `Record<string, ModelConfig>`.
//
// Usage:
//   node scripts/generate-models.mjs           # write the generated file
//   node scripts/generate-models.mjs --check   # fail if it is stale

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 80;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(REPO_ROOT, "workers/src/config/models.json");
const TARGET = join(REPO_ROOT, "workers/src/config/models.generated.ts");

// Documentation keys are the one thing the projection does not carry into the
// registry: they are rendered as comments instead. Top-level and model-level
// are supported; anywhere else is rejected rather than silently dropped.
const COMMENT_KEY = "$comment";

// Keys of the JSON document itself (as opposed to model entries). `$schema`
// and `description` document the file; `modelAliases` predates the registry's
// `exposure.alias` field and is currently read by nothing.
const DOCUMENT_KEYS = new Set([
  "$schema",
  "description",
  "models",
  "modelAliases",
  COMMENT_KEY,
]);

function isIdentifier(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function renderKey(key) {
  // `__proto__` would be a prototype setter in a `{ key: value }` literal,
  // not an own property, so it must be computed.
  if (key === "__proto__") return '["__proto__"]';
  return isIdentifier(key) ? key : JSON.stringify(key);
}

function renderScalar(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    // `String(-0)` is "0", which would not round-trip.
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (typeof value === "boolean") return String(value);
  throw new Error(`unsupported value type: ${typeof value}`);
}

// Emits `key: value,` on one line, breaking after the colon only when the
// flat form overflows (which is all Prettier can do for a long scalar).
function renderEntry(key, value, indent, out) {
  const pad = "  ".repeat(indent);
  const prefix = `${pad}${renderKey(key)}: `;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        throw new Error(`unsupported array of objects at ${key}`);
      }
    }
    const flat = `${prefix}[${value.map(renderScalar).join(", ")}],`;
    if (flat.length <= WIDTH) {
      out.push(flat);
      return;
    }
    out.push(`${prefix}[`);
    for (const item of value) out.push(`${pad}  ${renderScalar(item)},`);
    out.push(`${pad}],`);
    return;
  }

  if (value !== null && typeof value === "object") {
    out.push(`${prefix}{`);
    for (const [childKey, childValue] of Object.entries(value)) {
      renderEntry(childKey, childValue, indent + 1, out);
    }
    out.push(`${pad}},`);
    return;
  }

  const flat = `${prefix}${renderScalar(value)},`;
  if (flat.length <= WIDTH) {
    out.push(flat);
    return;
  }
  out.push(`${pad}${renderKey(key)}:`);
  out.push(`${pad}  ${renderScalar(value)},`);
}

function renderComment(text, indent, out) {
  const pad = "  ".repeat(indent);
  // A `//` comment ends at any JS line terminator, so a bare CR or a
  // U+2028/U+2029 in the source text would start a new line and could inject
  // code after the comment marker. Split on all of them.
  for (const line of String(text).split(/\r\n|[\n\r\u2028\u2029]/)) {
    out.push((pad + "// " + line).trimEnd());
  }
}

function stripComment(model) {
  const { [COMMENT_KEY]: _dropped, ...rest } = model;
  return rest;
}

// `$comment` belongs to documents and model entries. Deeper nesting would be
// invisible to both the registry and the generated file.
function assertCommentPlacement(doc) {
  for (const [id, model] of Object.entries(doc.models)) {
    for (const [key, value] of Object.entries(stripComment(model))) {
      if (value !== null && typeof value === "object") {
        assertNoComments(value, `${id}.${key}`);
      }
    }
  }
}

function assertNoComments(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (item !== null && typeof item === "object") {
        assertNoComments(item, `${path}[${i}]`);
      }
    });
    return;
  }
  if (COMMENT_KEY in value) {
    throw new Error(
      `${COMMENT_KEY} is only supported on the document or a model entry, found at ${path}`
    );
  }
  for (const [key, child] of Object.entries(value)) {
    if (child !== null && typeof child === "object") {
      assertNoComments(child, `${path}.${key}`);
    }
  }
}

// The registry literal, without the module around it: the unit that has to
// survive the round trip.
export function renderRegistryLiteral(models) {
  const out = [];
  for (const [id, model] of Object.entries(models)) {
    if (model[COMMENT_KEY]) renderComment(model[COMMENT_KEY], 1, out);
    renderEntry(id, stripComment(model), 1, out);
  }
  return `{\n${out.join("\n")}\n}`;
}

export function renderModelsFile(doc) {
  for (const key of Object.keys(doc)) {
    if (!DOCUMENT_KEYS.has(key)) {
      throw new Error(
        `unknown key "${key}" at the top level of models.json; document keys are ${[...DOCUMENT_KEYS].join(", ")}`
      );
    }
  }
  const literal = renderRegistryLiteral(doc.models);

  const banner = "=".repeat(76);
  const lines = [
    `// ${banner}`,
    "// GENERATED FILE - DO NOT EDIT BY HAND.",
    "//",
    "// Source of truth: workers/src/config/models.json",
    "// Regenerate:      cd workers && npm run models:gen",
    "// Freshness gate:  npm run check (CI and the deploy workflow run it)",
    `// ${banner}`,
    "",
    'import type { ModelConfig } from "../types.js";',
    "",
  ];
  if (doc[COMMENT_KEY]) {
    renderComment(doc[COMMENT_KEY], 0, lines);
    lines.push("");
  }
  lines.push(
    "export const MODEL_CONFIGS: Record<string, ModelConfig> = " +
      literal +
      ";",
    ""
  );
  return lines.join("\n");
}

function loadDocument() {
  const doc = JSON.parse(readFileSync(SOURCE, "utf8"));
  assertCommentPlacement(doc);
  return doc;
}

// Equivalence between the generated registry and models.json is asserted by
// the test suite (workers/src/config/models.test.ts), which imports the real
// committed artifact and deep-compares it to the JSON - no code execution.
function generate() {
  return renderModelsFile(loadDocument());
}

function firstDifference(actual, expected) {
  const a = actual.split("\n");
  const b = expected.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return [
        `  first difference at line ${i + 1}:`,
        `    committed: ${JSON.stringify(a[i] ?? "<missing>")}`,
        `    generated: ${JSON.stringify(b[i] ?? "<missing>")}`,
      ].join("\n");
    }
  }
  return "  files differ only in trailing whitespace";
}

function main(argv) {
  const check = argv.includes("--check");
  const generated = generate();

  if (!check) {
    writeFileSync(TARGET, generated);
    console.log(`models: wrote ${relative(REPO_ROOT, TARGET)}`);
    return 0;
  }

  const committed = readFileSync(TARGET, "utf8");
  if (committed === generated) {
    console.log(
      `models: ${relative(REPO_ROOT, TARGET)} is up to date (${Object.keys(loadDocument().models).length} models)`
    );
    return 0;
  }

  console.error(
    [
      `models: ${relative(REPO_ROOT, TARGET)} is stale - models.json changed without regenerating.`,
      firstDifference(committed, generated),
      "  Run: cd workers && npm run models:gen",
    ].join("\n")
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`models: ${error.message}`);
    process.exitCode = 1;
  }
}
