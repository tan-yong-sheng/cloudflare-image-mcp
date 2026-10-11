// Single runtime source for the release version.
//
// workers/package.json remains the declared release source (tag-release.yml
// reads it to mint tags). This constant mirrors it for runtime surfaces
// (/health, MCP server metadata) that cannot import package.json through
// the wrangler bundle. Bump procedure: update this file in the same PR as
// workers/package.json; the version-consistency CI job fails the PR if
// they disagree. Root/e2e manifest versions are intentionally independent.
export const WORKER_VERSION = "0.1.0";
