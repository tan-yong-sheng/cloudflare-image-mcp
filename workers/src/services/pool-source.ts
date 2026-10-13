// ============================================================================
// Pool source resolution - dual-read precedence (R1b, #72)
// ============================================================================
// One module answering "where do credentials come from": D1 rows when
// present (envelopes stay sealed — opening them is the pool's job, not this
// module's), AI_ACCOUNTS with a deprecation warning when D1 is empty, and
// bootstrap deploy credentials last. No flag day: every previously working
// configuration keeps working, only the warning is new. The db reader is
// injected (production D1 vs in-memory double); labels only in logs.

import type { Env } from "../types.js";

/** One D1 credential row as the resolver sees it (envelope still sealed). */
export interface PoolRow {
  label: string;
  accountId: string;
  envelope: string;
  weight: number;
  enabled: boolean;
}

/** One resolved credential: plaintext only from env paths, never from D1. */
export interface ResolvedKey {
  label: string;
  accountId: string;
  /** Present for env-sourced keys; absent for D1 rows (still sealed). */
  apiToken?: string;
  /** Present for D1 rows; absent for env-sourced keys. */
  envelope?: string;
  weight: number;
  enabled: boolean;
}

export interface PoolSource {
  source: "d1" | "AI_ACCOUNTS" | "fallback";
  keys: ResolvedKey[];
}

export function resolvePoolSource(
  env: Env,
  readD1?: () => PoolRow[]
): PoolSource {
  const d1Rows = readD1?.() ?? [];
  if (d1Rows.length > 0) {
    return {
      source: "d1",
      keys: d1Rows.map((r) => ({
        label: r.label,
        accountId: r.accountId,
        envelope: r.envelope,
        weight: r.weight,
        enabled: r.enabled,
      })),
    };
  }

  // Legacy blob: still honored, now with a deprecation warning (labels and
  // counts only — never values). Parsing semantics unchanged from R0.
  if (env.AI_ACCOUNTS) {
    try {
      const parsed = JSON.parse(env.AI_ACCOUNTS) as {
        account_id: string;
        api_token: string;
      }[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.every((a) => a.account_id && a.api_token);
        if (valid) {
          console.warn(
            "AI_ACCOUNTS is deprecated and will be removed in R1c; migrate " +
              `with the one-shot import (serving ${parsed.length} account(s) from AI_ACCOUNTS in the meantime)`
          );
          return {
            source: "AI_ACCOUNTS",
            keys: parsed.map((a, i) => ({
              label: `AI_ACCOUNTS[${i}]`,
              accountId: a.account_id,
              apiToken: a.api_token,
              weight: 1,
              enabled: true,
            })),
          };
        }
        console.warn(
          "AI_ACCOUNTS entries missing account_id/api_token, falling back to deploy credentials"
        );
      } else {
        console.warn(
          "AI_ACCOUNTS is empty or not an array, falling back to deploy credentials"
        );
      }
    } catch {
      console.warn(
        "AI_ACCOUNTS is not valid JSON, falling back to deploy credentials"
      );
    }
  }

  return {
    source: "fallback",
    keys: [
      {
        label: "fallback deploy credential",
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.CLOUDFLARE_API_TOKEN,
        weight: 1,
        enabled: true,
      },
    ],
  };
}
