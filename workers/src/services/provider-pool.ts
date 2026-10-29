// ============================================================================
// Provider credential pool - weighted selection + failure cooldown (R1b, #72)
// ============================================================================
// One module owning which credential serves next: enabled keys weighted by
// their D1 weight, failures parking a key until its cooldown ends. Time and
// randomness are injected so tests assert deterministically; production
// passes Date.now/Math.random. Observability is labels only — account ids
// and tokens never leave this module except inside the sealed pick result
// handed to the transport.

/** One credential as the pool sees it: identity plus policy knobs. */
export interface PoolKey {
  label: string;
  accountId: string;
  apiToken: string;
  weight: number;
  enabled: boolean;
}

/**
 * Credential source is always "d1" (ADR-001: database-only).
 * Observability metadata only, never a secret value.
 */
export type CredentialSource = "d1";

/** The credential handed to the transport for one attempt. */
export interface PoolPick {
  label: string;
  accountId: string;
  apiToken: string;
}

export class ProviderPool {
  /** Which source actually serves these keys (see CredentialSource). */
  readonly source: CredentialSource;
  private keys: PoolKey[];
  private cooledUntil = new Map<string, number>();
  private random: () => number;

  constructor(
    keys: PoolKey[],
    deps?: { random?: () => number; source?: CredentialSource }
  ) {
    this.keys = keys;
    this.random = deps?.random ?? Math.random;
    this.source = deps?.source ?? "d1";
  }

  /** Labels of all known keys, in order. Labels only — never values. */
  labels(): string[] {
    return this.keys.map((k) => k.label);
  }

  /**
   * The enabled, positively-weighted keys in order — the servable set for
   * transport wiring (cooldowns are runtime state the transport's own
   * per-request failover handles). Copies; callers cannot mutate the pool.
   */
  entries(): PoolKey[] {
    return this.keys
      .filter((k) => k.enabled && k.weight > 0)
      .map((k) => ({ ...k }));
  }

  /**
   * Pick the next credential: among enabled, positively-weighted, cooled-
   * down keys, proportionally to weight. Null when nothing is servable.
   */
  pick(now: number = Date.now()): PoolPick | null {
    const live = this.keys.filter(
      (k) =>
        k.enabled && k.weight > 0 && (this.cooledUntil.get(k.label) ?? 0) <= now
    );
    const total = live.reduce((sum, k) => sum + k.weight, 0);
    if (total <= 0) return null;
    let roll = this.random() * total;
    for (const k of live) {
      roll -= k.weight;
      if (roll < 0) {
        return { label: k.label, accountId: k.accountId, apiToken: k.apiToken };
      }
    }
    const last = live[live.length - 1];
    return {
      label: last.label,
      accountId: last.accountId,
      apiToken: last.apiToken,
    };
  }

  /** Park a key until now + cooldownMs. Unknown labels warn, label only. */
  reportFailure(label: string, now: number, cooldownMs = 60_000): void {
    if (!this.keys.some((k) => k.label === label)) {
      console.warn(
        `provider pool: failure reported for unknown key "${label}"`
      );
      return;
    }
    this.cooledUntil.set(label, now + cooldownMs);
  }

  /**
   * Milliseconds until at least one enabled, positively-weighted key becomes
   * servable, or null when none are currently cooling down. Used by the
   * transport to surface an honest "retry later" message instead of a
   * misleading "no servable credential" when every key is parked on cooldown.
   */
  timeUntilServable(now: number = Date.now()): number | null {
    const soonest = this.keys
      .filter((k) => k.enabled && k.weight > 0)
      .map((k) => this.cooledUntil.get(k.label) ?? 0)
      .filter((expiry) => expiry > now)
      .reduce((min, expiry) => Math.min(min, expiry), Infinity);
    return soonest === Infinity ? null : soonest - now;
  }
}
