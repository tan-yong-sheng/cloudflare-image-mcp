// ============================================================================
// Secret scanner - shared no-plaintext tripwire for committed artifacts
// ============================================================================
// Reused by R1a (migration SQL), R1b (envelope fixtures), and R2 (admin-API
// fixtures) so a credential can never be committed by accident. Findings
// are masked: the scanner reports where a secret-shaped value is, never the
// value itself, so a failing assertion cannot leak the secret into logs.

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
  const patterns: [string, RegExp][] = [
    ["cf-api-token", CF_TOKEN],
    ["bearer-token", BEARER],
    ["long-string-literal", LONG_LITERAL],
  ];

  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  for (const [pattern, regex] of patterns) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const line = lineAt(text, match.index ?? 0);
      // One literal can trip more than one pattern (a Cloudflare token is
      // also a long quoted literal). Compare without the surrounding quotes,
      // which is the only difference between those two matches, so a secret
      // is reported once.
      const bare = match[0].replace(/^['"]|['"]$/g, "");
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
