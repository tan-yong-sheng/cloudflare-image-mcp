import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ADMIN_HEALTH_PATH,
  ADMIN_KEYS_PATH,
} from "../../../workers/src/routes";
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
  const result = await apiFetch<AdminHealth>(ADMIN_HEALTH_PATH, {
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
    // The payload is fetched when it is missing, not when it is stale:
    // the generator reads the same query, and a mount there would
    // otherwise send the management key once more after the operator
    // left the workbench.
    refetchOnMount: false,
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
 * The mutation key every key mutation shares.
 *
 * A row must not be actionable while its own request is open, and two
 * rows can be acted on at once. The mutation hook only knows about the
 * call it was handed last, so the rows ask the mutation cache instead:
 * every request still in flight is listed, each with the key it is
 * about.
 */
const ADMIN_MUTATION_KEY = ["admin", "mutation"] as const;

/**
 * The key ids whose request is in flight.
 *
 * The workbench marks those rows busy so the operator cannot send a
 * second request for a key the server has not answered yet.
 */
export function usePendingAdminKeyIds(): number[] {
  const ids = useMutationState({
    filters: { mutationKey: ADMIN_MUTATION_KEY, status: "pending" },
    select: (mutation) => {
      const variables = mutation.state.variables as
        { keyId?: number } | undefined;
      return variables?.keyId;
    },
  });
  return ids.filter((id): id is number => typeof id === "number");
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
    mutationKey: [...ADMIN_MUTATION_KEY, "add"],
    mutationFn: async (variables: AddKeyVariables) => {
      const result = await apiFetch(ADMIN_KEYS_PATH, {
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
    mutationKey: [...ADMIN_MUTATION_KEY, "update"],
    mutationFn: async (variables: UpdateKeyVariables) => {
      const body: Record<string, unknown> = {
        accountId: variables.accountId,
        weight: variables.weight,
        enabled: variables.enabled,
      };
      if (variables.apiToken) body.apiToken = variables.apiToken;
      const result = await apiFetch(`${ADMIN_KEYS_PATH}/${variables.keyId}`, {
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
    mutationKey: [...ADMIN_MUTATION_KEY, "delete"],
    mutationFn: async (variables: { keyId: number }) => {
      const result = await apiFetch(
        `${ADMIN_KEYS_PATH}/${variables.keyId}/delete`,
        {
          method: "POST",
          adminKey: session.adminKey,
          authToken: session.bearerToken,
        }
      );
      if (!result.ok) throw toError(result);
    },
    onSuccess: invalidate,
  });

  const toggleKey = useMutation({
    mutationKey: [...ADMIN_MUTATION_KEY, "toggle"],
    mutationFn: async (variables: ToggleKeyVariables) => {
      const result = await apiFetch(`${ADMIN_KEYS_PATH}/${variables.keyId}`, {
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
      const key = previous?.keys.find((entry) => entry.id === variables.keyId);
      queryClient.setQueryData<AdminHealth>(healthKey, (current) =>
        current
          ? {
              ...current,
              keys: current.keys.map((entry) =>
                entry.id === variables.keyId
                  ? { ...entry, enabled: variables.enabled }
                  : entry
              ),
            }
          : current
      );
      return { key, previousEnabled: key?.enabled, healthKey };
    },
    onError: (_error, variables, context) => {
      if (!context) return;
      // The operator may have locked the panel while this request was
      // open. Locking drops the credential payload on purpose, so a
      // late failure must not put it back: a locked panel has no cached
      // health entry, and there is nothing to correct.
      const current = queryClient.getQueryData<AdminHealth>(context.healthKey);
      if (!current) return;
      const previousEnabled = context.previousEnabled;
      if (previousEnabled === undefined) return;
      queryClient.setQueryData<AdminHealth>(context.healthKey, (data) =>
        data
          ? {
              ...data,
              keys: data.keys.map((entry) =>
                entry.id === variables.keyId
                  ? { ...entry, enabled: previousEnabled }
                  : entry
              ),
            }
          : data
      );
    },
    onSettled: invalidate,
  });

  return { addKey, updateKey, deleteKey, toggleKey };
}
