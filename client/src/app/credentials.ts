import { useHealth } from "../api/admin";
import { useModels } from "../api/models";
import { useAdminSession } from "./admin-key";

/**
 * Whether the deployment can serve an image right now.
 *
 * The workbench's health payload is the authoritative answer when the
 * panel is unlocked: it carries the same "servable" predicate the
 * dispatcher picks with (enabled, weighted, envelope opens). Locked,
 * the only public signal is the model registry, whose per-model
 * `available` flag is that same predicate applied to one model.
 */
export function useCredentialsConfigured(): boolean {
  const session = useAdminSession();
  const health = useHealth(session);
  const models = useModels();

  if (health.data) return health.data.hasServableCredential;
  return (models.data ?? []).some((model) => model.available === true);
}
