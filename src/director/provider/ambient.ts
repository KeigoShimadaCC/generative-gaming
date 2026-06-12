import { spawn } from "node:child_process";
import { z } from "zod";

import { config as defaultConfig } from "../../config/index.js";
import { parseManifest } from "../../schemas/manifest.js";
import {
  type DirectorProvider,
  type GenerateManifestOptions,
  type JudgeOptions,
  type JudgeResult,
  type JudgeVerdict,
  type ProviderClock,
  type ProviderFailureCode,
  type ProviderResult,
  type ProviderUsage,
  failure,
  manifestFailureCodeFor,
} from "./types.js";

export type ProviderDataStream = {
  setEncoding?(encoding: "utf8"): void;
  on(event: "data", listener: (chunk: string) => void): void;
};

export type ProviderProcess = {
  readonly stdout: ProviderDataStream;
  readonly stderr: ProviderDataStream;
  on(event: "error", listener: (error: Error) => void): void;
  on(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): void;
  kill(signal: "SIGTERM"): boolean;
};

export type ProviderExecOptions = {
  readonly stdin: "ignore";
};

export type ProviderExec = (
  command: string,
  args: readonly string[],
  options: ProviderExecOptions,
) => ProviderProcess;

export type AmbientDirectorProviderOptions = {
  readonly exec?: ProviderExec;
  readonly now?: ProviderClock;
  readonly manifestCommand?: string;
  readonly judgeCommand?: string;
  readonly judgeModel?: string;
  readonly manifestTimeoutMs?: number;
  readonly judgeTimeoutMs?: number;
};

type ProcessRunResult =
  | {
      readonly ok: true;
      readonly stdout: string;
      readonly stderr: string;
      readonly usage: ProviderUsage;
    }
  | {
      readonly ok: false;
      readonly code: Extract<ProviderFailureCode, "timeout" | "process_error">;
      readonly message: string;
      readonly stdout: string;
      readonly stderr: string;
      readonly usage: ProviderUsage;
    };

const JudgeVerdictSchema = z.strictObject({
  verdict: z.enum(["pass", "fail", "uncertain"]),
  reason: z.string().min(1),
  score: z.number().min(0).max(1).nullable(),
});

const wallClockNow = (): number => new Date().getTime();

export const defaultProviderExec: ProviderExec = (
  command,
  args,
) => spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

export class AmbientDirectorProvider implements DirectorProvider {
  private readonly exec: ProviderExec;
  private readonly now: ProviderClock;
  private readonly manifestCommand: string;
  private readonly judgeCommand: string;
  private readonly judgeModel: string;
  private readonly manifestTimeoutMs: number;
  private readonly judgeTimeoutMs: number;

  constructor(options: AmbientDirectorProviderOptions = {}) {
    this.exec = options.exec ?? defaultProviderExec;
    this.now = options.now ?? wallClockNow;
    this.manifestCommand =
      options.manifestCommand ?? defaultConfig.director.ambient.manifestCommand;
    this.judgeCommand =
      options.judgeCommand ?? defaultConfig.director.ambient.judgeCommand;
    this.judgeModel =
      options.judgeModel ?? defaultConfig.director.ambient.judgeModel;
    this.manifestTimeoutMs =
      options.manifestTimeoutMs ?? defaultConfig.director.manifestTimeoutMs;
    this.judgeTimeoutMs =
      options.judgeTimeoutMs ?? defaultConfig.director.judgeTimeoutMs;
  }

  async generateManifest(
    prompt: string,
    options: GenerateManifestOptions = {},
  ): Promise<ProviderResult> {
    const result = await runProcess({
      command: this.manifestCommand,
      args: [
        "exec",
        "--sandbox",
        "read-only",
        "-c",
        "approval_policy=never",
        prompt,
      ],
      timeoutMs: options.timeoutMs ?? this.manifestTimeoutMs,
      exec: this.exec,
      now: this.now,
    });

    if (!result.ok) {
      return failure(result.code, result.message, result.usage, result.stdout);
    }

    const parsed = parseManifest(result.stdout);
    if (!parsed.ok) {
      return failure(
        manifestFailureCodeFor(parsed.errors),
        "manifest output did not parse or validate",
        result.usage,
        result.stdout,
        parsed.errors.map((error) => `${error.path}: ${error.message}`),
      );
    }

    return {
      ok: true,
      raw: result.stdout,
      manifest: parsed.manifest,
      usage: result.usage,
    };
  }

  async judge(
    prompt: string,
    options: JudgeOptions = {},
  ): Promise<JudgeResult> {
    const result = await runProcess({
      command: this.judgeCommand,
      args: [
        "--print",
        "--model",
        this.judgeModel,
        buildJudgePrompt(prompt),
      ],
      timeoutMs: options.timeoutMs ?? this.judgeTimeoutMs,
      exec: this.exec,
      now: this.now,
    });

    if (!result.ok) {
      return failure(result.code, result.message, result.usage, result.stdout);
    }

    return parseJudgeResult(result.stdout, result.usage);
  }
}

export const createAmbientDirectorProvider = (
  options: AmbientDirectorProviderOptions = {},
): AmbientDirectorProvider => new AmbientDirectorProvider(options);

const runProcess = ({
  command,
  args,
  timeoutMs,
  exec,
  now,
}: {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly exec: ProviderExec;
  readonly now: ProviderClock;
}): Promise<ProcessRunResult> =>
  new Promise((resolve) => {
    const startedAt = now();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let settled = false;
    let child: ProviderProcess;

    const usage = (): ProviderUsage => ({
      latencyMs: Math.max(0, now() - startedAt),
      tokens: null,
    });

    const finish = (result: ProcessRunResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");
      const killed = child.kill("SIGTERM");
      finish({
        ok: false,
        code: "timeout",
        message: `process timed out after ${timeoutMs}ms; killed=${killed}`,
        stdout,
        stderr,
        usage: usage(),
      });
    }, timeoutMs);

    try {
      child = exec(command, args, { stdin: "ignore" });
    } catch (error) {
      finish({
        ok: false,
        code: "process_error",
        message: error instanceof Error ? error.message : String(error),
        stdout: "",
        stderr: "",
        usage: usage(),
      });
      return;
    }

    child.stdout.setEncoding?.("utf8");
    child.stderr.setEncoding?.("utf8");

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(String(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(String(chunk));
    });

    child.on("error", (error) => {
      finish({
        ok: false,
        code: "process_error",
        message: error.message,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        usage: usage(),
      });
    });

    child.on("close", (code, signal) => {
      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");

      if (code === 0) {
        finish({
          ok: true,
          stdout,
          stderr,
          usage: usage(),
        });
        return;
      }

      finish({
        ok: false,
        code: "process_error",
        message: `process exited with code ${code ?? "null"} signal ${
          signal ?? "null"
        }${stderr.length === 0 ? "" : `: ${stderr}`}`,
        stdout,
        stderr,
        usage: usage(),
      });
    });
  });

const buildJudgePrompt = (prompt: string): string =>
  [
    "Return ONLY one JSON object with this exact shape:",
    '{"verdict":"pass|fail|uncertain","reason":"short reason","score":0.5}',
    "Use a numeric score from 0 to 1, or null when no score applies.",
    prompt,
  ].join("\n");

const parseJudgeResult = (raw: string, usage: ProviderUsage): JudgeResult => {
  const extracted = extractFirstJsonObject(raw);
  if (!extracted.ok) {
    return failure("parse_fail", extracted.message, usage, raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.json);
  } catch (error) {
    return failure(
      "parse_fail",
      error instanceof Error ? `invalid JSON: ${error.message}` : "invalid JSON",
      usage,
      raw,
    );
  }

  const verdict = JudgeVerdictSchema.safeParse(parsed);
  if (!verdict.success) {
    return failure(
      "validate_fail",
      "judge output did not match verdict schema",
      usage,
      raw,
      verdict.error.issues.map((issue) => issue.message),
    );
  }

  return {
    ok: true,
    raw,
    verdict: verdict.data satisfies JudgeVerdict,
    usage,
  };
};

const extractFirstJsonObject = (
  raw: string,
):
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly message: string } => {
  const text = stripMarkdownFence(raw);
  const start = text.indexOf("{");
  if (start === -1) {
    return { ok: false, message: "no JSON object found" };
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { ok: true, json: text.slice(start, index + 1) };
      }
    }
  }

  return { ok: false, message: "unterminated JSON object" };
};

const stripMarkdownFence = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/);
  return fenced?.[1]?.trim() ?? trimmed;
};
