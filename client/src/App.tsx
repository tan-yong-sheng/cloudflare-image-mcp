import { useEffect, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AdminView } from "./components/Workbench/AdminView";
import { LoginDialog } from "./components/Auth/LoginDialog";
import { GeneratorView } from "./components/Playground/GeneratorView";
import { AdminKeyProvider, useAdminKey } from "./app/admin-key";
import { AuthProvider, useAuth } from "./app/auth";
import { useHashRoute } from "./app/hash-route";
import { queryClient } from "./app/query-client";
import { ThemeProvider } from "./app/theme";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AdminKeyProvider>
            <AppShell />
          </AdminKeyProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AppShell() {
  const route = useHashRoute();
  const { isAuthenticated } = useAuth();
  const { lock } = useAdminKey();

  // Signing out ends the admin session too: the management key must not
  // outlive the operator's own session, and the workbench is a surface
  // only a signed-in operator may open.
  //
  // The route is left alone until the operator actually signs out. The
  // legacy shell reacted to an auth change, not to the first render, so
  // an operator who opened `/admin` before signing in landed in the
  // workbench once they did.
  const wasAuthenticated = useRef(isAuthenticated);
  useEffect(() => {
    if (!isAuthenticated) {
      lock();
      if (wasAuthenticated.current && window.location.hash === "#admin") {
        window.location.hash = "";
      }
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, lock]);

  // Leaving the workbench ends the admin session as well. The legacy
  // cleared the management key whenever it showed the generator, so the
  // key lived exactly as long as the workbench was open; the key is
  // asked for again on the way back in.
  useEffect(() => {
    if (route !== "admin") lock();
  }, [route, lock]);

  return (
    <>
      {route === "admin" ? <AdminView /> : <GeneratorView />}
      {!isAuthenticated ? <LoginDialog /> : null}
    </>
  );
}
