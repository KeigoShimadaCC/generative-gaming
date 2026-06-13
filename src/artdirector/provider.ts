import { spawn } from "node:child_process";

import { parseArtDirectorSpriteManifest } from "./parse.js";
import {
  artProviderFailure,
  type ArtDirectorGenerateOptions,
  type ArtDirectorProviderResult,
  type ArtDirectorProviderUsage,
  type ArtDirectorSpriteProvider,
} from "./types.js";

export type ArtProviderDataStream = {
  setEncoding?(encoding: "utf8"): void;
  on(event: "data", listener: (chunk: string) => void): void;
};

export type ArtProviderProcess = {
  readonly stdout: ArtProviderDataStream;
  readonly stderr: ArtProviderDataStream;
  on(event: "error", listener: (error: Error) => void): void;
  on(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): void;
  kill(signal: "SIGTERM"): boolean;
};

export type ArtProviderExecOptions = {
  readonly stdin: "ignore";
};

export type ArtProviderExec = (
  command: string,
  args: readonly string[],
  options: ArtProviderExecOptions,
) => ArtProviderProcess;

export type AmbientArtDirectorProviderOptions = {
  readonly exec?: ArtProviderExec;
  readonly now?: () => number;
  readonly command?: string;
  readonly timeoutMs?: number;
};

type ProcessRunResult =
  | {
      readonly ok: true;
      readonly stdout: string;
      readonly stderr: string;
      readonly usage: ArtDirectorProviderUsage;
    }
  | {
      readonly ok: false;
      readonly code: "timeout" | "process_error";
      readonly message: string;
      readonly stdout: string;
      readonly stderr: string;
      readonly usage: ArtDirectorProviderUsage;
    };

const DEFAULT_COMMAND = "codex";
const DEFAULT_TIMEOUT_MS = 45_000;

const wallClockNow = (): number => new Date().getTime();

export const defaultArtProviderExec: ArtProviderExec = (command, args) =>
  spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

export class AmbientArtDirectorProvider implements ArtDirectorSpriteProvider {
  private readonly exec: ArtProviderExec;
  private readonly now: () => number;
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(options: AmbientArtDirectorProviderOptions = {}) {
    this.exec = options.exec ?? defaultArtProviderExec;
    this.now = options.now ?? wallClockNow;
    this.command = options.command ?? DEFAULT_COMMAND;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generateSprite(
    prompt: string,
    options: ArtDirectorGenerateOptions = {},
  ): Promise<ArtDirectorProviderResult> {
    const result = await runProcess({
      command: this.command,
      args: [
        "exec",
        "--sandbox",
        "read-only",
        "-c",
        "approval_policy=never",
        prompt,
      ],
      timeoutMs: options.timeoutMs ?? this.timeoutMs,
      exec: this.exec,
      now: this.now,
    });

    if (!result.ok) {
      return artProviderFailure(
        result.code,
        result.message,
        result.usage,
        result.stdout,
      );
    }

    return parseArtDirectorSpriteManifest(result.stdout, result.usage);
  }
}

export const createAmbientArtDirectorProvider = (
  options: AmbientArtDirectorProviderOptions = {},
): AmbientArtDirectorProvider => new AmbientArtDirectorProvider(options);

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
  readonly exec: ArtProviderExec;
  readonly now: () => number;
}): Promise<ProcessRunResult> =>
  new Promise((resolve) => {
    const startedAt = now();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let settled = false;
    let child: ArtProviderProcess;

    const usage = (): ArtDirectorProviderUsage => ({
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
