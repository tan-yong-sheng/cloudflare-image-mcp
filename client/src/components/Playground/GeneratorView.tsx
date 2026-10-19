import {
  AdminWorkbenchButton,
  LogoutButton,
  ThemeToggleButton,
} from "../AppHeader";

/**
 * The image generator. The controls land in the next slice of the
 * migration; this slice proves the client builds, ships, and serves.
 */
export function GeneratorView() {
  return (
    <main id="generatorView" className="container mx-auto px-4 py-4 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <i className="fa-solid fa-image mr-2" />
          AI Image Generator
        </h1>
        <div className="flex items-center space-x-2">
          <AdminWorkbenchButton />
          <LogoutButton id="logoutButton" />
          <ThemeToggleButton id="themeToggle" />
        </div>
      </div>
      <div className="card p-6 space-y-2">
        <h2 className="text-lg font-semibold flex items-center">
          <i className="fa-solid fa-sliders mr-2 text-primary" />
          The React client is live
        </h2>
        <p className="text-sm opacity-75">
          The image generator controls arrive in the next slice of this
          migration.
        </p>
      </div>
    </main>
  );
}
