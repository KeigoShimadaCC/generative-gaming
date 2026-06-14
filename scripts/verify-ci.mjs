#!/usr/bin/env node
/**
 * Mirrors the CI check job's vitest sequence locally:
 * typecheck → lint → root vitest → every vitest.config.ts under tests/ and app/.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function discoverVitestConfigs(dir) {
  const configs = [];
  if (!existsSync(dir)) {
    return configs;
  }

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

export function runStep(
  label,
  command,
  args,
  { cwd = root, log = console.log, spawn = spawnSync } = {},
) {
  log(`\n=== ${label} ===`);
  const result = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  const error = result.error === undefined ? null : formatSpawnError(result.error);
  const ok = result.status === 0 && error === null;
  log(`${ok ? "PASS" : "FAIL"}: ${label}${error === null ? "" : ` (${error})`}`);
  return { label, ok, error };
}

export function runVerifyCi({
  cwd = root,
  log = console.log,
  spawn = spawnSync,
} = {}) {
  const rootVitestConfig = resolve(cwd, "vitest.config.ts");
  const discovered = [
    ...discoverVitestConfigs(join(cwd, "tests")),
    ...discoverVitestConfigs(join(cwd, "app")),
  ]
    .map((configPath) => resolve(configPath))
    .filter((configPath) => configPath !== rootVitestConfig)
    .sort();

  log("Discovered vitest configs:");
  for (const configPath of discovered) {
    log(`  - ${relative(cwd, configPath)}`);
  }

  const results = [];
  const baseSteps = [
    ["typecheck", "pnpm", ["run", "typecheck"]],
    ["lint", "pnpm", ["run", "lint"]],
    ["root vitest", "pnpm", ["exec", "vitest", "run"]],
  ];

  for (const [label, command, args] of baseSteps) {
    const result = runStep(label, command, args, { cwd, log, spawn });
    results.push(result);
    if (!result.ok) {
      break;
    }
  }

  if (results.every((step) => step.ok)) {
    for (const configPath of discovered) {
      const rel = relative(cwd, configPath);
      const label = `vitest: ${rel}`;
      const result = runStep(label, "pnpm", [
        "exec",
        "vitest",
        "run",
        "--config",
        rel,
      ], { cwd, log, spawn });
      results.push(result);
      if (!result.ok) {
        break;
      }
    }
  }

  log("\n=== Summary ===");
  for (const { label, ok, error } of results) {
    log(`${ok ? "PASS" : "FAIL"}: ${label}${error === null ? "" : ` (${error})`}`);
  }

  const allOk = results.length > 0 && results.every((step) => step.ok);
  log(allOk ? "\nAll steps passed." : "\nOne or more steps failed.");
  return allOk ? 0 : 1;
}

const formatSpawnError = (error) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const isMainModule = () => {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
};

if (isMainModule()) {
  process.exit(runVerifyCi());
}
