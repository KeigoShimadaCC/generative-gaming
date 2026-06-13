#!/usr/bin/env node
/**
 * Mirrors the CI check job's vitest sequence locally:
 * typecheck → lint → root vitest → every vitest.config.ts under tests/ and app/.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ROOT_VITEST_CONFIG = resolve(root, "vitest.config.ts");

function discoverVitestConfigs(dir) {
  const configs = [];

  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "vitest.config.ts") {
        configs.push(full);
      }
    }
  }

  walk(dir);
  return configs;
}

function runStep(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  const ok = result.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  return ok;
}

const discovered = [
  ...discoverVitestConfigs(join(root, "tests")),
  ...discoverVitestConfigs(join(root, "app")),
]
  .map((configPath) => resolve(configPath))
  .filter((configPath) => configPath !== ROOT_VITEST_CONFIG)
  .sort();

console.log("Discovered vitest configs:");
for (const configPath of discovered) {
  console.log(`  - ${relative(root, configPath)}`);
}

const results = [];
const baseSteps = [
  ["typecheck", "pnpm", ["run", "typecheck"]],
  ["lint", "pnpm", ["run", "lint"]],
  ["root vitest", "pnpm", ["exec", "vitest", "run"]],
];

for (const [label, command, args] of baseSteps) {
  const ok = runStep(label, command, args);
  results.push({ label, ok });
  if (!ok) {
    break;
  }
}

if (results.every((step) => step.ok)) {
  for (const configPath of discovered) {
    const rel = relative(root, configPath);
    const label = `vitest: ${rel}`;
    const ok = runStep(label, "pnpm", ["exec", "vitest", "run", "--config", rel]);
    results.push({ label, ok });
    if (!ok) {
      break;
    }
  }
}

console.log("\n=== Summary ===");
for (const { label, ok } of results) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

const allOk = results.length > 0 && results.every((step) => step.ok);
console.log(allOk ? "\nAll steps passed." : "\nOne or more steps failed.");
process.exit(allOk ? 0 : 1);
