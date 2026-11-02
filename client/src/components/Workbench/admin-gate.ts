import { AdminApiError } from "../../api/admin";

/**
 * The refusal an admin read can carry, if any.
 *
 * Both admin screens answer a refusal the same way: a 401 means the
 * session itself is refused, a 403 means the gate says no. Both return
 * the error itself so the caller can read its status without narrowing
 * a second time. Anything that is not a refusal returns null, and what
 * that means is the caller's business — a screen decides whether a
 * failure ends it or is only reported beside it.
 */
export function adminRefusal(failure: unknown): AdminApiError | null {
  if (!(failure instanceof AdminApiError)) return null;
  return failure.status === 401 || failure.status === 403 ? failure : null;
}

/**
 * Why the gate says no.
 *
 * A disabled admin gate is not the operator's key being wrong, so the
 * server's own reason is shown when it says which it was.
 */
export function gateErrorFor(failure: AdminApiError): string {
  return failure.code === "admin_disabled"
    ? failure.message
    : "Management key rejected.";
}
