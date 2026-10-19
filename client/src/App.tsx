import { AdminView } from "./components/Workbench/AdminView";
import { LoginDialog } from "./components/Auth/LoginDialog";
import { GeneratorView } from "./components/Playground/GeneratorView";
import { AuthProvider, useAuth } from "./app/auth";
import { useHashRoute } from "./app/hash-route";
import { ThemeProvider } from "./app/theme";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppShell() {
  const route = useHashRoute();
  const { isAuthenticated } = useAuth();

  return (
    <>
      {route === "admin" ? <AdminView /> : <GeneratorView />}
      {!isAuthenticated ? <LoginDialog /> : null}
    </>
  );
}
