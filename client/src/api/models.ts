import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { ModelConfig } from "./types";

export const modelsQueryKey = ["models"] as const;

/**
 * The model registry, from the backend's source of truth.
 *
 * The route is public on purpose: the picker has to be readable before
 * the operator signs in. Each entry carries the `available` flag the
 * dispatcher uses, so the client never offers a model the request path
 * would refuse.
 */
export async function fetchModels(): Promise<ModelConfig[]> {
  const result = await apiFetch<ModelConfig[]>("/api/internal/models");
  if (!result.ok) {
    throw new Error("HTTP " + result.status);
  }
  // The route answers with a list. A shape that is not a list is a
  // broken answer, not an empty registry, and treating it as empty
  // would silently offer the operator nothing.
  if (!Array.isArray(result.data)) {
    throw new Error("Unexpected model registry response");
  }
  return result.data;
}

export function useModels() {
  return useQuery({
    queryKey: modelsQueryKey,
    queryFn: fetchModels,
    // The registry changes when models.json changes or the exposure
    // overlay moves; the workbench invalidates it after a key mutation,
    // so a short stale window is enough.
    staleTime: 30_000,
    retry: 1,
  });
}
