import { LogoutButton, ThemeToggleButton } from "../AppHeader";

/**
 * The provider credentials workbench. The unlock gate, the family rail
 * and the key table land in the next slice of the migration; this slice
 * proves the client builds, ships, and serves.
 */
export function AdminView() {
  return (
    <main
      id="adminView"
      className="container mx-auto px-4 py-4 max-w-6xl"
      role="main"
      aria-labelledby="adminViewTitle"
    >
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <button
            id="adminBackBtn"
            type="button"
            className="btn btn-secondary p-2 h-10 flex items-center justify-center rounded"
            aria-label="Back to Image Generator"
            onClick={() => {
              window.location.hash = "";
            }}
          >
            <i className="fa-solid fa-arrow-left mr-2" />
            Back
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <span id="adminChipsActive" className="chip chip-ok hidden" />
          <span id="adminChipsFamilies" className="chip hidden" />
          <button
            id="adminLock"
            type="button"
            className="btn btn-secondary p-2 h-10 flex items-center justify-center hidden"
            aria-label="Lock provider credentials"
          >
            <i className="fa-solid fa-lock mr-2" />
            Lock
          </button>
          <ThemeToggleButton id="themeToggleAdmin" />
          <LogoutButton id="logoutButtonAdmin" />
        </div>
      </div>
      <h1
        id="adminViewTitle"
        className="text-xl font-bold flex items-center mb-4 pb-3 border-b border-gray-700"
      >
        <i className="fa-solid fa-key mr-2" />
        Provider Credentials Workbench
      </h1>
      <div className="card p-6 space-y-2">
        <h2 className="text-lg font-semibold flex items-center">
          <i className="fa-solid fa-shield-halved mr-2 text-primary" />
          The React client is live
        </h2>
        <p className="text-sm opacity-75">
          The credentials workbench arrives in the next slice of this migration.
        </p>
      </div>
    </main>
  );
}
