import { useEffect } from "react";
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
  useEffect(() => {
    if (!isAuthenticated) {
      lock();
      if (window.location.hash === "#admin") {
        window.location.hash = "";
      }
    }
  }, [isAuthenticated, lock]);

  return (
    <>
      {route === "admin" ? <AdminView /> : <GeneratorView />}
      {!isAuthenticated ? <LoginDialog /> : null}
    </>
  );
}
