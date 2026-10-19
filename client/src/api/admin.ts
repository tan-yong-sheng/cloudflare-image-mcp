import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ApiResult } from "./client";
import { modelsQueryKey } from "./models";
import type { AdminHealth } from "./types";

/**
 * The admin API client.
 *
 * The management key is the second gate on these routes: the bearer key
 * proves the caller may reach the admin surface, the management key
 * proves it may read the credentials behind it. The management key is
 * never written to a cache key or to storage.
 *
 * Every cache entry is scoped to the unlock session rather than to the
 * key itself, so a cache hit can never carry one operator's health
 * payload into another operator's session.
 */
export const healthQueryKey = (sessionId: number) =>
  ["admin", "health", sessionId] as const;

/** An error the admin API returned, with the status and code it carried. */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Read the server's error envelope. The message is what the operator
 * sees; the status and code let the workbench tell a rejected key from
 * a disabled admin gate.
 */
function toError(result: ApiResult): AdminApiError {
  const envelope = (
    result.data as { error?: { message?: unknown; code?: unknown } } | null
  )?.error;
  const message = typeof envelope?.message === "string" ? envelope.message : "";
  const code = typeof envelope?.code === "string" ? envelope.code : undefined;
  return new AdminApiError(
    message || `Request failed (${result.status})`,
    result.status,
    code
  );
}

export interface AdminSession {
  /** The management key, or null while the panel is locked. */
  adminKey: string | null;
  /** The bearer key, or null when the operator is not signed in. */
  bearerToken: string | null;
  /**
   * Identifies one unlock session. It changes on every unlock, so a
   * locked panel's cached data is never reused by the next one.
   */
  sessionId: number;
}

export async function fetchHealth(
  session: AdminSession,
  signal?: AbortSignal
): Promise<AdminHealth> {
  const result = await apiFetch<AdminHealth>("/api/admin/health", {
    adminKey: session.adminKey,
    authToken: session.bearerToken,
    signal,
  });
  if (!result.ok) throw toError(result);
  return result.data as AdminHealth;
}

export function useHealth(session: AdminSession) {
  return useQuery({
    queryKey: healthQueryKey(session.sessionId),
    queryFn: ({ signal }) => fetchHealth(session, signal),
    // The health route is only readable with a management key, so the
    // query is off until the operator unlocks the panel.
    enabled: session.adminKey !== null,
    retry: false,
  });
}

export interface AddKeyVariables {
  providerId: string;
  label: string;
  apiToken: string;
  accountId: string;
  weight: number;
  enabled: boolean;
}

export interface UpdateKeyVariables {
  keyId: number;
  accountId: string;
  weight: number;
  enabled: boolean;
  /** Omitted keeps the stored version; a value rotates it. */
  apiToken?: string;
}

export interface ToggleKeyVariables {
  keyId: number;
  enabled: boolean;
}

/**
 * The key mutations, sharing one invalidation rule: a key change can
 * change which providers can serve, so both the health payload and the
 * model registry are refetched afterwards.
 */
export function useAdminMutations(session: AdminSession) {
  const queryClient = useQueryClient();
  const healthKey = healthQueryKey(session.sessionId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: healthKey });
    queryClient.invalidateQueries({ queryKey: modelsQueryKey });
  };

  const addKey = useMutation({
    mutationFn: async (variables: AddKeyVariables) => {
      const result = await apiFetch("/api/admin/keys", {
        method: "POST",
        body: variables,
        adminKey: session.adminKey,
        authToken: session.bearerToken,
      });
      if (!result.ok) throw toError(result);
    },
    onSuccess: invalidate,
  });

  const updateKey = useMutation({
    mutationFn: async (variables: UpdateKeyVariables) => {
      const body: Record<string, unknown> = {
        accountId: variables.accountId,
        weight: variables.weight,
        enabled: variables.enabled,
      };
      if (variables.apiToken) body.apiToken = variables.apiToken;
      const result = await apiFetch(`/api/admin/keys/${variables.keyId}`, {
        method: "PATCH",
        body,
        adminKey: session.adminKey,
        authToken: session.bearerToken,
      });
      if (!result.ok) throw toError(result);
    },
    onSuccess: invalidate,
  });

  const deleteKey = useMutation({
    mutationFn: async (keyId: number) => {
      const result = await apiFetch(`/api/admin/keys/${keyId}/delete`, {
        method: "POST",
        adminKey: session.adminKey,
        authToken: session.bearerToken,
      });
      if (!result.ok) throw toError(result);
    },
    onSuccess: invalidate,
  });

  const toggleKey = useMutation({
    mutationFn: async (variables: ToggleKeyVariables) => {
      const result = await apiFetch(`/api/admin/keys/${variables.keyId}`, {
        method: "PATCH",
        body: { enabled: variables.enabled },
        adminKey: session.adminKey,
        authToken: session.bearerToken,
      });
      if (!result.ok) throw toError(result);
    },
    // The switch shows the operator's choice immediately, and the cache
    // is corrected from the server's answer. A second toggle while the
    // first is in flight would otherwise leave the row disagreeing with
    // the stored state, whichever order the two answers land in.
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: healthKey });
      const previous = queryClient.getQueryData<AdminHealth>(healthKey);
      queryClient.setQueryData<AdminHealth>(healthKey, (current) =>
        current
          ? {
              ...current,
              keys: current.keys.map((key) =>
                key.id === variables.keyId
                  ? { ...key, enabled: variables.enabled }
                  : key
              ),
            }
          : current
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(healthKey, context.previous);
      }
    },
    onSettled: invalidate,
  });

  return { addKey, updateKey, deleteKey, toggleKey };
}
