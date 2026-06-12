import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL(".", import.meta.url).pathname;
const prompt = readFileSync(join(root, "prompt.txt"), "utf8");
const cursorPrompt = readFileSync(join(root, "cursor-prompt.txt"), "utf8");
const attemptsDir = join(root, "attempts");
mkdirSync(attemptsDir, { recursive: true });

const runTimed = (label, command, args, timeoutMs) => {
  const startedAt = new Date().toISOString();
  const start = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  const end = process.hrtime.bigint();
  const latencyMs = Number(end - start) / 1_000_000;
  const timedOut = result.error?.code === "ETIMEDOUT";

  return {
    label,
    command,
    args,
    startedAt,
    endedAt: new Date().toISOString(),
    latencyMs,
    exitCode: result.status,
    signal: result.signal,
    timedOut,
    error: result.error
      ? {
          name: result.error.name,
          message: result.error.message,
          code: result.error.code,
        }
      : null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

const writeAttempt = (dir, result) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "stdout.txt"), result.stdout);
  writeFileSync(join(dir, "stderr.txt"), result.stderr);
  const { stdout, stderr, ...meta } = result;
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
};

const summary = [];

for (let index = 1; index <= 5; index += 1) {
  const result = runTimed(
    `codex-${index}`,
    "codex",
    ["exec", "--sandbox", "read-only", "-c", "approval_policy=never", prompt],
    120_000,
  );
  const dir = join(attemptsDir, `codex-${index}`);
  writeAttempt(dir, result);
  summary.push({
    label: result.label,
    latencyMs: result.latencyMs,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    stdoutBytes: Buffer.byteLength(result.stdout),
    stderrBytes: Buffer.byteLength(result.stderr),
  });
}

const cursorResult = runTimed(
  "cursor-composer-2.5",
  "cursor-agent",
  ["--print", "--model", "composer-2.5", cursorPrompt],
  120_000,
);
writeAttempt(join(attemptsDir, "cursor-composer-2.5"), cursorResult);
summary.push({
  label: cursorResult.label,
  latencyMs: cursorResult.latencyMs,
  exitCode: cursorResult.exitCode,
  signal: cursorResult.signal,
  timedOut: cursorResult.timedOut,
  stdoutBytes: Buffer.byteLength(cursorResult.stdout),
  stderrBytes: Buffer.byteLength(cursorResult.stderr),
});

writeFileSync(join(root, "run-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
