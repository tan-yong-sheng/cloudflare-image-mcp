#!/usr/bin/env node

/**
 * Automate CircleCI trigger setup for cloudflare-image-mcp
 *
 * This script:
 * 1. Waits for CircleCI to auto-discover pipeline definitions from setup.yml
 * 2. Gets the pipeline definition ID
 * 3. Gets the GitHub repo ID
 * 4. Creates three triggers:
 *    - only-open-prs → pr-checks workflow
 *    - only-ready-for-review-prs → e2e-full workflow
 *    - only-merged-prs → tag-release workflow
 *
 * Usage: node scripts/setup-circleci-triggers.mjs
 */

import { execSync } from "child_process";
import { setTimeout as sleep } from "timers/promises";

const PROJECT_SLUG = "gh/tan-yong-sheng/cloudflare-image-mcp";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 minutes total

function runCommand(cmd, { silent = false, json = false } = {}) {
  try {
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      stdio: silent ? "pipe" : "inherit",
    });
    if (json) {
      return JSON.parse(stdout);
    }
    return stdout.trim();
  } catch (error) {
    if (silent && error.stdout) {
      if (json) {
        try {
          return JSON.parse(error.stdout);
        } catch {
          // JSON parse failed, throw original error
        }
      }
      return error.stdout.trim();
    }
    throw error;
  }
}

async function waitForPipelineDefinitions() {
  console.log(
    "⏳ Waiting for CircleCI to auto-discover pipeline definitions..."
  );
  console.log("   (This may take a minute after pushing setup.yml)");

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const projectList = runCommand("circleci project list --json", {
        silent: true,
        json: true,
      });
      if (!projectList || projectList.length === 0) {
        console.log("   No projects found. Attempting to link project...");
        runCommand("circleci project link", { silent: false });
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const projectId = projectList[0].id;
      console.log(
        `   Found project: ${projectList[0].name} (ID: ${projectId})`
      );

      const pipelines = runCommand(
        `circleci pipeline list --project-id ${projectId} --json`,
        { silent: true, json: true }
      );

      if (pipelines && pipelines.length > 0) {
        console.log(`✅ Found ${pipelines.length} pipeline definition(s)`);
        return { projectId, pipelines };
      }

      console.log(
        `   No pipeline definitions yet (attempt ${attempt}/${MAX_POLL_ATTEMPTS})...`
      );
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      console.log(
        `   Error checking pipelines (attempt ${attempt}/${MAX_POLL_ATTEMPTS}): ${error.message}`
      );
      await sleep(POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    "Timed out waiting for pipeline definitions. Push setup.yml and try again."
  );
}

function getRepoId(projectId) {
  console.log("🔍 Getting GitHub repo ID...");

  // Use CircleCI API to get project details including repo ID
  try {
    const projectDetails = runCommand(
      `circleci api get /project/${projectId}`,
      { silent: true, json: true }
    );
    const repoId = projectDetails?.vcs_info?.repo_id;

    if (!repoId) {
      throw new Error("repo_id not found in project details");
    }

    console.log(`✅ Repo ID: ${repoId}`);
    return repoId;
  } catch (error) {
    throw new Error(`Failed to get repo ID: ${error.message}`);
  }
}

function getExistingTriggers(pipelineId) {
  try {
    const triggers = runCommand(
      `circleci project trigger list --pipeline-definition-id ${pipelineId} --json`,
      { silent: true, json: true }
    );
    return triggers || [];
  } catch (error) {
    // If no triggers exist, the command might return an error
    return [];
  }
}

function createTrigger(pipelineId, repoId, eventPreset, description) {
  console.log(`🔧 Creating trigger: ${description} (${eventPreset})...`);

  try {
    const result = runCommand(
      `circleci project trigger create --pipeline-definition-id ${pipelineId} --repo-id ${repoId} --event-preset ${eventPreset} --json`,
      { silent: true, json: true }
    );

    console.log(`✅ Created trigger: ${result.id}`);
    return result;
  } catch (error) {
    const stderr = error.stderr || error.message;
    if (stderr.includes("already exists") || stderr.includes("duplicate")) {
      console.log(`⚠️  Trigger already exists, skipping`);
      return null;
    }
    throw new Error(`Failed to create trigger: ${stderr}`);
  }
}

async function main() {
  try {
    console.log("🚀 Setting up CircleCI triggers for cloudflare-image-mcp\n");

    // Step 1: Wait for pipeline definitions
    const { projectId, pipelines } = await waitForPipelineDefinitions();

    // We expect setup.yml to be discovered as a pipeline definition
    const setupPipeline = pipelines.find(
      (p) => p.config_file_path === ".circleci/setup.yml"
    );
    if (!setupPipeline) {
      console.warn(
        "⚠️  setup.yml not found in pipeline definitions. Using first available pipeline."
      );
    }
    const pipelineId = setupPipeline?.id || pipelines[0].id;
    console.log(`   Using pipeline ID: ${pipelineId}\n`);

    // Step 2: Get repo ID
    const repoId = getRepoId(projectId);
    console.log();

    // Step 3: Check existing triggers
    console.log("🔍 Checking existing triggers...");
    const existingTriggers = getExistingTriggers(pipelineId);
    console.log(`   Found ${existingTriggers.length} existing trigger(s)\n`);

    // Step 4: Create triggers
    const triggers = [
      { preset: "only-open-prs", desc: "Fast PR checks (pr-checks workflow)" },
      {
        preset: "only-ready-for-review-prs",
        desc: "Full E2E (e2e-full workflow)",
      },
      { preset: "only-merged-prs", desc: "Release (tag-release workflow)" },
    ];

    for (const { preset, desc } of triggers) {
      const existing = existingTriggers.find((t) => t.event_preset === preset);
      if (existing) {
        console.log(`⏭️  Trigger already exists: ${desc} (${preset})`);
      } else {
        createTrigger(pipelineId, repoId, preset, desc);
      }
    }

    console.log("\n✨ CircleCI trigger setup complete!");
    console.log("\nNext steps:");
    console.log(
      "1. Verify triggers in CircleCI web UI: Project Settings > Triggers"
    );
    console.log("2. Configure the github-release context with GH_TOKEN");
    console.log(
      "3. Configure project environment variables (CLOUDFLARE_API_TOKEN, etc.)"
    );
    console.log("4. Push a test commit to verify pr-checks trigger");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
