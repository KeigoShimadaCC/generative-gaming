import { describe, expect, it } from "vitest";

import {
  AmbientArtDirectorProvider,
  type ArtProviderExec,
  type ArtProviderExecOptions,
  type ArtProviderProcess,
} from "./provider.js";
import type { SpriteManifest } from "../art/sprite-manifest.js";

describe("AmbientArtDirectorProvider", () => {
  it("runs codex exec with stdin ignored and parses a sprite manifest", async () => {
    const manifest = boxSprite();
    const harness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit(["sprite", JSON.stringify(manifest)].join("\n"));
        child.stderr.emit("diagnostic");
        child.emitClose(0, null);
      });
    });
    const provider = new AmbientArtDirectorProvider({
      exec: harness.exec,
      now: makeClock([100, 145]),
      command: "codex",
    });

    const result = await provider.generateSprite("draw a cave slug");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.manifest).toEqual(manifest);
    expect(result.usage).toEqual({ latencyMs: 45, tokens: null });
    expect(harness.calls).toHaveLength(1);

    const call = onlyCall(harness.calls);
    expect(call.command).toBe("codex");
    expect(call.args).toEqual([
      "exec",
      "--sandbox",
      "read-only",
      "-c",
      "approval_policy=never",
      "draw a cave slug",
    ]);
    expect(call.options).toEqual({ stdin: "ignore" });
  });

  it("maps nonzero exit and parser failures into provider taxonomy", async () => {
    const processHarness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit("partial");
        child.stderr.emit("failed");
        child.emitClose(2, null);
      });
    });
    const processProvider = new AmbientArtDirectorProvider({
      exec: processHarness.exec,
      now: makeClock([10, 25]),
    });

    const processResult = await processProvider.generateSprite("prompt");
    expect(processResult.ok).toBe(false);
    if (!processResult.ok) {
      expect(processResult.error.code).toBe("process_error");
      expect(processResult.raw).toBe("partial");
      expect(processResult.usage.latencyMs).toBe(15);
    }

    const parseHarness = createExecHarness((child) => {
      queueMicrotask(() => {
        child.stdout.emit("not json");
        child.emitClose(0, null);
      });
    });
    const parseProvider = new AmbientArtDirectorProvider({
      exec: parseHarness.exec,
    });

    const parseResult = await parseProvider.generateSprite("prompt");
    expect(parseResult.ok).toBe(false);
    if (!parseResult.ok) {
      expect(parseResult.error.code).toBe("parse_fail");
      expect(parseResult.raw).toBe("not json");
    }
  });

  it("kills a hanging codex process on timeout", async () => {
    const harness = createExecHarness(() => {});
    const provider = new AmbientArtDirectorProvider({
      exec: harness.exec,
      now: makeClock([200, 260]),
    });

    const result = await provider.generateSprite("hang", { timeoutMs: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("timeout");
      expect(result.usage.latencyMs).toBe(60);
      expect(onlyCall(harness.calls).child.killSignals).toEqual(["SIGTERM"]);
    }
  });
});

type ExecCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: ArtProviderExecOptions;
  readonly child: FakeProcess;
};

const createExecHarness = (
  behavior: (child: FakeProcess) => void,
): { readonly exec: ArtProviderExec; readonly calls: ExecCall[] } => {
  const calls: ExecCall[] = [];
  const exec: ArtProviderExec = (command, args, options) => {
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

class FakeProcess implements ArtProviderProcess {
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

  emitClose(code: number | null, signal: string | null): void {
    for (const listener of this.closeListeners) {
      listener(code, signal);
    }
  }

  emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }
}

const boxSprite = (): SpriteManifest => ({
  w: 16,
  h: 16,
  palette: ["#ffffff", "#000000"],
  px: Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) =>
      x >= 4 && x <= 11 && y >= 4 && y <= 11
        ? x === 4 || x === 11 || y === 4 || y === 11
          ? 2
          : 1
        : 0,
    ),
  ),
});
