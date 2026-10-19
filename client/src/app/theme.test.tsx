import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

/**
 * The theme.
 *
 * The legacy page stored a theme only when the operator chose one: the
 * system preference was consulted while the storage key was absent, and
 * a stored key was an explicit choice that won over the system.
 * Storing the resolved theme on the first visit would freeze the system
 * preference into a choice the operator never made.
 */

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
}

/** Make the system report the given colour-scheme preference. */
function systemPrefersDark(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("the theme", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.documentElement.classList.remove("dark");
  });

  it("follows the system preference while nothing is stored", () => {
    systemPrefersDark(true);
    renderTheme();

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("stores no theme the operator never chose", () => {
    systemPrefersDark(true);
    renderTheme();

    // The system preference is not a choice, so nothing is written.
    // Otherwise the first visit would freeze it and the client would
    // stop following the system for good.
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("prefers a stored choice over the system preference", () => {
    window.localStorage.setItem("theme", "light");
    systemPrefersDark(true);
    renderTheme();

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("stores the choice when the operator toggles", async () => {
    systemPrefersDark(false);
    const user = userEvent.setup();
    renderTheme();

    await user.click(screen.getByRole("button", { name: "toggle" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("keeps the stored choice when the client is loaded again", async () => {
    systemPrefersDark(false);
    const user = userEvent.setup();
    const first = renderTheme();

    await user.click(screen.getByRole("button", { name: "toggle" }));
    first.unmount();

    // The system still says light, but the operator chose dark.
    renderTheme();
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("answers a second press from the first one", async () => {
    // Two presses that land in the same render must not both read the
    // theme that was on screen before them: the second press is
    // answered from the first one, so the theme returns to where it
    // started.
    systemPrefersDark(false);
    renderTheme();

    const button = screen.getByRole("button", { name: "toggle" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });
});
