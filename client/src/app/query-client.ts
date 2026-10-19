import { QueryClient } from "@tanstack/react-query";

/**
 * The query client.
 *
 * The generator and the workbench are operator-facing tools, not a live
 * dashboard: refetching on every window focus would re-run credential
 * reads the operator did not ask for. A failed request is retried once,
 * because a single dropped response should not leave the operator with
 * an empty picker.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
