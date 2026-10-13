// ============================================================================
// Secret scanner - shared no-plaintext tripwire for committed artifacts
// ============================================================================
// Reused by R1a (migration SQL), R1b (envelope fixtures), and R2 (admin-API
// fixtures) so a credential can never be committed by accident. Findings
// are masked: the scanner reports where a secret-shaped value is, never the
// value itself, so a failing assertion cannot leak the secret into logs.
//
// WHAT IT CATCHES
//   - Cloudflare API tokens (`v1.0-…`)
//   - Authorization: Bearer credentials, with or without digits
//   - quoted opaque literals of 24+ chars that look random (base64, hex, JWT)
//   - unquoted `KEY=value` / `key: value` assignments that look random
//
// WHAT IT DELIBERATELY DOES NOT CATCH
//   - long alphabetic credentials in the broad patterns (a 32-character
//     all-letters API token). Detecting those means dropping the digit rule,
//     which makes the scanner fire on ordinary configuration such as
//     `cloudflare-image-workers` and `workers/package-lock.json`. A tripwire
//     that cries wolf is switched off, so precision wins here. The specific
//     bearer pattern still catches alphabetic credentials.
//   - secrets shorter than 24 chars.
//
// The false-positive side of that trade is pinned by a test that scans this
// repo's real workflows and docs and requires zero findings, so widening
// detection into noise fails loudly rather than silently.

/** One secret-shaped value found in scanned text. */
export interface SecretFinding {
  /** Which pattern matched. */
  pattern: string;
  /** 1-based line number of the match. */
  line: number;
  /** Redacted preview: enough to locate the value, never the value. */
  masked: string;
}

/** Cloudflare API tokens: `v1.0-` plus a long opaque suffix. */
const CF_TOKEN = /v1\.0-[A-Za-z0-9_-]{20,}/g;

/** Authorization headers carrying a token. */
const BEARER = /bearer\s+[A-Za-z0-9._~-]{20,}/gi;

/**
 * Long opaque string literals (base64/hex/JWT-shaped). The floor is 24
 * chars: short enough to catch a truncated or padded credential blob, long
 * enough to stay clear of ordinary enum values ('cloudflare',
 * 'cloudflare-rest'). Dots are in the charset so JWT-style
 * `header.payload.signature` values are caught too.
 */
const LONG_LITERAL = /(['"])[A-Za-z0-9+/=_\-.]{24,}\1/g;

/**
 * Unquoted assignment values (`API_KEY=<opaque>`, `token: <opaque>`), which
 * the quoted-literal pattern misses. Values containing `://` or starting with
 * `//` are excluded by the negative lookahead, so ordinary documentation URLs
 * do not read as secrets.
 */
const ASSIGNMENT_VALUE =
  /\b[A-Za-z_][A-Za-z0-9_-]{2,}\s*[=:]\s*(?!\/\/)(?![^\s]*:\/\/)([A-Za-z0-9+/=_\-.]{24,})/g;

/**
 * Whether a broad match looks like a credential rather than ordinary config.
 *
 * Calibration matters more than reach here: a tripwire that fires on
 * `workers/package-lock.json` or `cloudflare-image-workers` gets switched
 * off, which is worse than not having it. Two rules, both checked against
 * this repo's real docs and workflows:
 *
 * - a credential practically always carries several digits, while config
 *   values (`cloudflare-image-workers`, `src/test-utils/**`) are letters,
 *   slashes and dots only. Two digits, not one: a single digit is what a
 *   key name contributes inside a quoted echo such as
 *   `WORKERS_NAME=cloudflare-image-workers-staging`, which is
 *   configuration, not a secret;
 * - in a `key: value` context a slash means a file path, not a secret.
 *
 * The specific Cloudflare and bearer patterns are narrow enough not to need
 * the heuristic and skip it: their own character classes already exclude
 * ordinary config, and an all-alphabetic bearer credential is still a
 * credential.
 *
 * A slash is only evidence of a path in a `key: value` context, so quoted
 * literals keep allowing it - base64 secrets legitimately contain slashes.
 */
function looksSecret(
  value: string,
  opts: { skipHeuristic?: boolean; allowSlash?: boolean } = {}
): boolean {
  if (opts.skipHeuristic) return true;
  const digits = value.match(/\d/g)?.length ?? 0;
  if (digits < 2) return false;
  if (!opts.allowSlash && value.includes("/")) return false;
  return true;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

/**
 * Report every secret-shaped literal in `text`, ordered by line. An empty
 * result is the pass condition for every artifact this guards.
 */
export function scanForSecrets(text: string): SecretFinding[] {
  const patterns: [
    string,
    RegExp,
    { skipHeuristic?: boolean; allowSlash?: boolean },
  ][] = [
    ["cf-api-token", CF_TOKEN, { skipHeuristic: true }],
    ["bearer-token", BEARER, { skipHeuristic: true }],
    ["long-string-literal", LONG_LITERAL, { allowSlash: true }],
    ["assignment-value", ASSIGNMENT_VALUE, {}],
  ];

  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  for (const [pattern, regex, opts] of patterns) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const line = lineAt(text, match.index ?? 0);
      // One literal can trip more than one pattern (a Cloudflare token is
      // also a long quoted literal). Compare without the surrounding quotes,
      // which is the only difference between those two matches, so a secret
      // is reported once.
      const bare = match[0].replace(/^['"]|['"]$/g, "");
      if (!looksSecret(bare, opts)) continue;
      const key = `${line}:${bare}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        pattern,
        line,
        masked: `${bare.slice(0, 3)}…(${bare.length})`,
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}
