import { describe, expect, it } from "vitest";

import { config, type GameConfig } from "../../config/index.js";
import { validShallowsManifestFixture } from "../../schemas/fixtures/manifest.js";
import {
  AmbientDirectorProvider,
  MockDirectorProvider,
  createDirectorProvider,
  type ProviderExec,
  type ProviderExecOptions,
  type ProviderProcess,
  type ProviderFailureCode,
} from "./index.js";

const failureCodes = [
  "timeout",
  "process_error",
  "parse_fail",
  "validate_fail",
] as const satisfies readonly ProviderFailureCode[];

describe("MockDirectorProvider", () => {
  it("returns a deterministic fixture-backed manifest with usage", async () => {
    const provider = new MockDirectorProvider({
      tokens: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
      latencyMs: 7,
    });

    const result = await provider.generateManifest("ignored");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.manifest).toEqual(validShallowsManifestFixture);
    expect(result.raw).toBe(JSON.stringify(validShallowsManifestFixture));
    expect(result.usage).toEqual({
      latencyMs: 7,
      tokens: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
    });
  });

  it("can inject every manifest failure taxonomy entry", async () => {
    for (const code of failureCodes) {
      const provider = new MockDirectorProvider({ failureMode: code });
      const result = await provider.generateManifest("ignored");

      expect(result.ok, code).toBe(false);
      if (result.ok) {
        continue;
      }

      expect(result.error.code).toBe(code);
      expect(result.usage).toEqual({ latencyMs: 0, tokens: null });
    }
  });

  it("can inject every judge failure taxonomy entry", async () => {
    for (const code of failureCodes) {
      const provider = new MockDirectorProvider({ judgeFailureMode: code });
      const result = await provider.judge("ignored");

      expect(result.ok, code).toBe(false);
      if (result.ok) {
        continue;
      }

      expect(result.error.code).toBe(code);
    }
  });
});

describe("AmbientDirectorProvider", () => {
  it("runs codex exec with stdin ignored and parses a manifest", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit(
          ["manifest", JSON.stringify(validShallowsManifestFixture)].join("\n"),
        );
        child.stderr.emit("diagnostic");
        child.emitClose(0, null);
      });
    });
    const provider = new AmbientDirectorProvider({
      exec: harness.exec,
      now: makeClock([100, 145]),
    });

    const result = await provider.generateManifest("make a manifest");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.manifest.depth).toBe(validShallowsManifestFixture.depth);
    expect(result.usage).toEqual({ latencyMs: 45, tokens: null });
    expect(harness.calls).toHaveLength(1);

    const call = onlyCall(harness.calls);
    expect(call.command).toBe(config.director.ambient.manifestCommand);
    expect(call.args).toEqual([
      "exec",
      "--sandbox",
      "read-only",
      "-c",
      "approval_policy=never",
      "make a manifest",
    ]);
    expect(call.options).toEqual({ stdin: "ignore" });
  });

  it("maps a nonzero process exit to process_error", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit("partial");
        child.stderr.emit("failed");
        child.emitClose(2, null);
      });
    });
    const provider = new AmbientDirectorProvider({
      exec: harness.exec,
      now: makeClock([10, 25]),
    });

    const result = await provider.generateManifest("prompt");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("process_error");
    expect(result.raw).toBe("partial");
    expect(result.usage.latencyMs).toBe(15);
  });

  it("maps JSON extraction failures to parse_fail", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit("not json");
        child.emitClose(0, null);
      });
    });
    const provider = new AmbientDirectorProvider({ exec: harness.exec });

    const result = await provider.generateManifest("prompt");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("parse_fail");
    expect(result.raw).toBe("not json");
  });

  it("maps manifest schema failures to validate_fail", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit(JSON.stringify({ protocolVersion: "bad" }));
        child.emitClose(0, null);
      });
    });
    const provider = new AmbientDirectorProvider({ exec: harness.exec });

    const result = await provider.generateManifest("prompt");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("validate_fail");
    expect(result.error.details?.join("\n")).toContain("$.protocolVersion");
  });

  it("kills a hanging process on timeout", async () => {
    const harness = createExecHarness(() => {});
    const provider = new AmbientDirectorProvider({
      exec: harness.exec,
      now: makeClock([200, 260]),
    });

    const result = await provider.generateManifest("hang", { timeoutMs: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("timeout");
    expect(result.usage.latencyMs).toBe(60);
    expect(onlyCall(harness.calls).child.killSignals).toEqual(["SIGTERM"]);
  });

  it("parses cursor-agent JSON judge verdicts", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit(
          JSON.stringify({
            verdict: "uncertain",
            reason: "needs gate context",
            score: null,
          }),
        );
        child.emitClose(0, null);
      });
    });
    const provider = new AmbientDirectorProvider({
      exec: harness.exec,
      now: makeClock([0, 11]),
    });

    const result = await provider.judge("judge this");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.verdict).toEqual({
      verdict: "uncertain",
      reason: "needs gate context",
      score: null,
    });
    expect(result.usage.latencyMs).toBe(11);

    const call = onlyCall(harness.calls);
    expect(call.command).toBe(config.director.ambient.judgeCommand);
    expect(call.args.slice(0, 3)).toEqual([
      "--print",
      "--model",
      config.director.ambient.judgeModel,
    ]);
    expect(call.args[3]).toContain("Return ONLY one JSON object");
  });

  it("maps a nonzero judge process exit to process_error", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit("partial judge");
        child.stderr.emit("judge failed");
        child.emitClose(2, null);
      });
    });
    const provider = new AmbientDirectorProvider({
      exec: harness.exec,
      now: makeClock([50, 63]),
    });

    const result = await provider.judge("judge prompt");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("process_error");
    expect(result.raw).toBe("partial judge");
    expect(result.usage.latencyMs).toBe(13);
  });

  it("maps judge JSON extraction failures to parse_fail", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit("not json");
        child.emitClose(0, null);
      });
    });
    const provider = new AmbientDirectorProvider({ exec: harness.exec });

    const result = await provider.judge("judge prompt");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("parse_fail");
    expect(result.raw).toBe("not json");
  });

  it("maps judge verdict schema failures to validate_fail", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit(
          JSON.stringify({
            verdict: "maybe",
            reason: "",
            score: 2,
          }),
        );
        child.emitClose(0, null);
      });
    });
    const provider = new AmbientDirectorProvider({ exec: harness.exec });

    const result = await provider.judge("judge prompt");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("validate_fail");
    expect(result.error.details?.length).toBeGreaterThan(0);
  });

  it("kills a hanging judge process on timeout", async () => {
    const harness = createExecHarness(() => {});
    const provider = new AmbientDirectorProvider({
      exec: harness.exec,
      now: makeClock([300, 340]),
    });

    const result = await provider.judge("judge hang", { timeoutMs: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("timeout");
    expect(result.usage.latencyMs).toBe(40);
    expect(onlyCall(harness.calls).child.killSignals).toEqual(["SIGTERM"]);
  });
});

describe("createDirectorProvider", () => {
  it("uses the mock provider for keyless default config", async () => {
    const provider = createDirectorProvider();

    const result = await provider.generateManifest("prompt");

    expect(result.ok).toBe(true);
  });

  it("switches to ambient by config alone", async () => {
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit(JSON.stringify(validShallowsManifestFixture));
        child.emitClose(0, null);
      });
    });
    const provider = createDirectorProvider({
      config: withProvider("ambient"),
      ambient: { exec: harness.exec },
    });

    const result = await provider.generateManifest("prompt");

    expect(result.ok).toBe(true);
    expect(onlyCall(harness.calls).command).toBe(
      config.director.ambient.manifestCommand,
    );
  });

  it("keeps api-future deferred without throwing through calls", async () => {
    const provider = createDirectorProvider({ config: withProvider("api-future") });

    const result = await provider.generateManifest("prompt");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("process_error");
  });
});

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
  "@ambient generateManifest real codex call returns success or taxonomy",
  async () => {
    const provider = new AmbientDirectorProvider();
    const result = await provider.generateManifest(ambientPrompt);

    if (result.ok) {
      expect(result.manifest.protocolVersion).toBe(
        validShallowsManifestFixture.protocolVersion,
      );
      expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
      return;
    }

    if (
      result.error.code === "process_error" &&
      /ENOENT|not found|failed to initialize/.test(result.error.message)
    ) {
      console.warn("@ambient skipped: codex executable unavailable or sandboxed");
      return;
    }

    expect(failureCodes).toContain(result.error.code);
    expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
  },
  config.director.manifestTimeoutMs + 10_000,
);

type ExecCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: ProviderExecOptions;
  readonly child: FakeProcess;
};

const createExecHarness = (
  behavior: (child: FakeProcess) => void,
): { readonly exec: ProviderExec; readonly calls: ExecCall[] } => {
  const calls: ExecCall[] = [];
  const exec: ProviderExec = (command, args, options) => {
    const child = new FakeProcess();
    calls.push({ command, args, options, child });
    behavior(child);
    return child;
  };

  return { exec, calls };
};

const onlyCall = (calls: readonly ExecCall[]): ExecCall => {
  const call = calls[0];
  if (call === undefined) {
    throw new Error("expected one exec call");
  }

  return call;
};

const makeClock = (values: readonly number[]) => {
  let index = 0;

  return (): number => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    if (value === undefined) {
      throw new Error("clock requires at least one value");
    }

    return value;
  };
};

const withProvider = (
  provider: GameConfig["director"]["provider"],
): GameConfig => ({
  ...config,
  director: {
    ...config.director,
    provider,
  },
});

const ambientPrompt = [
  "You are the Director for a deterministic turn-based roguelike.",
  "Reply with ONLY one JSON object, no prose and no markdown.",
  "Return a floor manifest for depth 3 in the shallows band.",
  "Use this compact valid manifest as the exact field-shape example.",
  JSON.stringify(validShallowsManifestFixture),
].join("\n");

class FakeStream {
  private readonly listeners: Array<(chunk: string) => void> = [];

  setEncoding(): void {}

  on(event: "data", listener: (chunk: string) => void): void {
    if (event === "data") {
      this.listeners.push(listener);
    }
  }

  emit(chunk: string): void {
    for (const listener of this.listeners) {
      listener(chunk);
    }
  }
}

class FakeProcess implements ProviderProcess {
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  readonly killSignals: string[] = [];
  private readonly errorListeners: Array<(error: Error) => void> = [];
  private readonly closeListeners: Array<
    (code: number | null, signal: string | null) => void
  > = [];

  on(event: "error", listener: (error: Error) => void): void;
  on(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): void;
  on(
    event: "error" | "close",
    listener:
      | ((error: Error) => void)
      | ((code: number | null, signal: string | null) => void),
  ): void {
    if (event === "error") {
      this.errorListeners.push(listener as (error: Error) => void);
      return;
    }

    this.closeListeners.push(
      listener as (code: number | null, signal: string | null) => void,
    );
  }

  kill(signal: "SIGTERM"): boolean {
    this.killSignals.push(signal);
    return true;
  }

  emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  emitClose(code: number | null, signal: string | null): void {
    for (const listener of this.closeListeners) {
      listener(code, signal);
    }
  }
}
