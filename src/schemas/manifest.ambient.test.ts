import { spawn } from "node:child_process";

import { expect, it } from "vitest";

import { validShallowsManifestFixture } from "./fixtures/manifest.js";
import { parseManifest } from "./manifest.js";

const ambientLive =
  (
    globalThis as {
      readonly process?: {
        readonly env?: { readonly AMBIENT_LIVE?: string };
      };
    }
  ).process?.env?.AMBIENT_LIVE === "1";

const ambientIt = ambientLive ? it : it.skip;

ambientIt(
  "@ambient parses one real codex exec manifest attempt when AMBIENT_LIVE=1",
  async () => {
    const codexVersion = await runCommand("codex", ["--version"], 5_000);
    if (!codexVersion.ok) {
      console.warn(
        "@ambient skipped: codex executable is unavailable in this environment",
      );
      return;
    }

    const result = await runCommand(
      "codex",
      [
        "exec",
        "--sandbox",
        "read-only",
        "-c",
        "approval_policy=never",
        ambientPrompt,
      ],
      120_000,
    );

    if (!result.ok) {
      console.warn(
        `@ambient skipped: codex exec failed in this environment (${result.summary})`,
      );
      return;
    }

    const parsed = parseManifest(result.stdout);
    if (parsed.ok) {
      console.info("@ambient manifest validity: valid");
      expect(parsed.manifest.protocolVersion).toBe(
        validShallowsManifestFixture.protocolVersion,
      );
      return;
    }

    console.info(
      `@ambient manifest validity: invalid (${parsed.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ")})`,
    );
    expect(parsed.errors.length).toBeGreaterThan(0);
  },
  130_000,
);

const ambientPrompt = [
  "You are the Director for a deterministic turn-based roguelike.",
  "Reply with ONLY one JSON object, no prose and no markdown.",
  "Return a floor manifest for depth 3 in the shallows band.",
  "Use this compact valid manifest as the exact field-shape example; change names and seeds if you want, but keep every required field present.",
  JSON.stringify(validShallowsManifestFixture),
].join("\n");

type CommandResult = {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly summary: string;
};

const runCommand = (
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<CommandResult> =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        summary: `timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        summary: error.message,
      });
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      resolve({
        ok: code === 0,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr,
        summary:
          code === 0
            ? "exit 0"
            : `exit ${code ?? "null"} signal ${signal ?? "null"} ${stderr}`,
      });
    });
  });
