import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  discoverVitestConfigs,
  runStep,
  runVerifyCi,
} from "./verify-ci.mjs";

const okSpawnResult = () => ({
  status: 0,
  signal: null,
  error: undefined,
  pid: 0,
  output: [],
  stdout: null,
  stderr: null,
});

describe("verify-ci script", () => {
  it("treats absent tests and app directories as empty discovery roots", () => {
    const root = mkdtempSync(join(tmpdir(), "gg-verify-ci-missing-"));
    const logs = [];
    const commands = [];
    const exitCode = runVerifyCi({
      cwd: root,
      log: (line) => logs.push(line),
      spawn: (command, args) => {
        commands.push([command, args]);
        return okSpawnResult();
      },
    });

    expect(discoverVitestConfigs(join(root, "tests"))).toEqual([]);
    expect(discoverVitestConfigs(join(root, "app"))).toEqual([]);
    expect(commands).toHaveLength(3);
    expect(logs.join("\n")).toContain("All steps passed.");
    expect(exitCode).toBe(0);
  });

  it("discovers nested non-root vitest configs when directories exist", () => {
    const root = mkdtempSync(join(tmpdir(), "gg-verify-ci-discovery-"));
    mkdirSync(join(root, "tests", "golden"), { recursive: true });
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "tests", "golden", "vitest.config.ts"), "", "utf8");
    writeFileSync(join(root, "app", "vitest.config.ts"), "", "utf8");

    expect(discoverVitestConfigs(join(root, "tests")).sort()).toEqual([
      join(root, "tests", "golden", "vitest.config.ts"),
    ]);
    expect(discoverVitestConfigs(join(root, "app"))).toEqual([
      join(root, "app", "vitest.config.ts"),
    ]);
  });

  it("prints spawn errors in the step failure output", () => {
    const logs = [];
    const result = runStep("missing command", "missing-command", [], {
      cwd: process.cwd(),
      log: (line) => logs.push(line),
      spawn: () => ({
        status: null,
        signal: null,
        error: new Error("spawn missing-command ENOENT"),
        pid: 0,
        output: [],
        stdout: null,
        stderr: null,
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("spawn missing-command ENOENT");
    expect(logs.join("\n")).toContain(
      "FAIL: missing command (spawn missing-command ENOENT)",
    );
  });
});
