/**
 * The shapes the Worker's API returns.
 *
 * These mirror the server's own types (workers/src/types.ts and
 * workers/src/services/admin-store.ts). The client reads them at runtime
 * from JSON, so nothing here is checked against the server at build
 * time — the shapes are kept honest by the e2e suite, which exercises
 * the same endpoints the client calls.
 */

export interface ModelParameter {
  cfParam: string;
  type: "string" | "number" | "integer" | "boolean";
  required?: boolean;
  default?: number | string | boolean | null;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

export interface ModelLimits {
  maxPromptLength: number;
  defaultSteps: number;
  maxSteps: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  supportedSizes: string[];
}

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  capabilities?: string[];
  taskTypes: string[];
  parameters: Record<string, ModelParameter>;
  limits: ModelLimits;
  provider: string;
  inferenceProvider: string;
  available?: boolean;
}

export interface AdminProvider {
  id: string;
  displayName: string;
  /**
   * The registry key ADR-002 binds to a transport. external_account_id is
   * meaningful only for cloudflare-rest, which addresses
   * /accounts/{id}/ai/run, so the workbench keys the account field off
   * this and not off the provider's name.
   */
  transport: string;
}

export interface AdminKey {
  id: number;
  providerId: string;
  label: string;
  weight: number;
  enabled: boolean;
  activeVersion: number | null;
  accountId: string | null;
}

export interface AdminHealth {
  providers: AdminProvider[];
  keys: AdminKey[];
  exposure: unknown[];
  configVersion: number | null;
  /**
   * The same "servable" predicate inference picks with (enabled, weight
   * > 0, envelope opens). The key list cannot answer this on its own: a
   * key can be listed, enabled and weighted yet still be parked by an
   * unopenable envelope.
   */
  hasServableCredential: boolean;
  hasServableCredentialByProvider: Record<string, boolean>;
}

/**
 * A caller key: the bearer token a client sends to reach /v1/* and /mcp*.
 *
 * A different kind of secret from the provider keys above — this one
 * authenticates the caller, not the Worker. The server never sends the
 * secret, so the only form of it here is the masked hint.
 */
export interface AdminCallerKey {
  id: number;
  name: string;
  /** The masked hint, e.g. `sk-mgmt-…a1b2`. Never the secret. */
  maskedKey: string;
  enabled: boolean;
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds. */
  updatedAt: number;
}

export interface AdminCallerKeys {
  keys: AdminCallerKey[];
}

/** One image from a generation response. */
export interface GenerationImage {
  url?: string;
  b64_json?: string;
}

export interface GenerationResponse {
  created?: number;
  data: GenerationImage[];
}
