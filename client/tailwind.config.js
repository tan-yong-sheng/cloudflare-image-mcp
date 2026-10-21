// Tailwind 3, not 4: the legacy page was built on Tailwind 2.2.19 and
// DESIGN.md's token table is expressed as CSS custom properties. v3 keeps
// the same utility semantics and the same default palette, so the ported
// markup renders identically; the version bump is a separate decision.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // The legacy page toggled a "dark" class on <html>.
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [],
};
