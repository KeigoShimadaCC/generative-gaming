import { createInterface, type Interface } from "node:readline";

export type ParsedPlayArgs = {
  readonly seed: string;
  readonly help: boolean;
};

export const DEFAULT_DEV_SEED = "cli-dev";

export const parsePlayArgs = (
  argv: readonly string[] = process.argv.slice(2),
): ParsedPlayArgs => {
  let seed = DEFAULT_DEV_SEED;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === undefined) {
      continue;
    }

    if (arg === "--seed") {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new Error("--seed requires a value");
      }
      seed = next;
      index += 1;
      continue;
    }

    if (arg.startsWith("--seed=")) {
      const value = arg.slice("--seed=".length);
      if (value.length === 0) {
        throw new Error("--seed requires a value");
      }
      seed = value;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return { seed, help };
};

export const PLAY_HELP_TEXT = `Generative Gaming — terminal play (reference client)

Usage: pnpm run play [--seed <seed>]

Keys (playing):
  arrows / WASD / hjkl  move (into enemy attacks, into NPC talks)
  g                     pick up
  i                     inventory menu
  q                     quest log
  x                     inspect mode (cursor + card)
  .                     wait
  >                     descend stairs
  ?                     keymap
  Enter                 confirm
  Esc / Ctrl-C          cancel / abort run

Dangerous actions may prompt: y/n`;

export type InputSource = {
  readonly readKey: () => Promise<string | null>;
  readonly close: () => void;
};

export const createScriptedInputSource = (script: string): InputSource => {
  const keys = [...expandScript(script)];
  let index = 0;

  return {
    readKey: async () => {
      if (index >= keys.length) {
        return null;
      }

      const key = keys[index];
      index += 1;
      return key ?? null;
    },
    close: () => {},
  };
};

export const createTerminalInputSource = (): InputSource => {
  if (!process.stdin.isTTY) {
    return createScriptedInputSource("");
  }

  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  const queue: string[] = [];
  const waiters: Array<(key: string | null) => void> = [];
  let closed = false;

  const flush = (): void => {
    while (queue.length > 0 && waiters.length > 0) {
      const key = queue.shift();
      const resolve = waiters.shift();
      resolve?.(key ?? null);
    }
  };

  const onData = (chunk: string): void => {
    for (const key of chunkKeys(chunk)) {
      queue.push(key);
    }
    flush();
  };

  stdin.on("data", onData);

  return {
    readKey: () =>
      new Promise((resolve) => {
        if (closed) {
          resolve(null);
          return;
        }

        if (queue.length > 0) {
          resolve(queue.shift() ?? null);
          return;
        }

        waiters.push(resolve);
      }),
    close: () => {
      if (closed) {
        return;
      }

      closed = true;
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();

      for (const resolve of waiters.splice(0)) {
        resolve(null);
      }
    },
  };
};

export const createLineInputSource = (lines: readonly string[]): InputSource => {
  const rl: Interface = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  const queue = [...lines];
  let closed = false;

  return {
    readKey: () =>
      new Promise((resolve) => {
        if (closed) {
          resolve(null);
          return;
        }

        if (queue.length === 0) {
          closed = true;
          rl.close();
          resolve(null);
          return;
        }

        const line = queue.shift();
        if (line === undefined) {
          resolve(null);
          return;
        }

        resolve(line.length === 0 ? "\r" : line[0] ?? null);
      }),
    close: () => {
      if (!closed) {
        closed = true;
        rl.close();
      }
    },
  };
};

export const chunkKeys = (chunk: string): string[] => {
  const keys: string[] = [];

  for (let index = 0; index < chunk.length; index += 1) {
    const char = chunk[index];

    if (char === "\u001b" && chunk[index + 1] === undefined) {
      keys.push("Escape");
      continue;
    }

    if (char === "\u001b" && chunk[index + 1] === "[") {
      const code = chunk[index + 2];
      if (code === "A") {
        keys.push("ArrowUp");
        index += 2;
        continue;
      }
      if (code === "B") {
        keys.push("ArrowDown");
        index += 2;
        continue;
      }
      if (code === "C") {
        keys.push("ArrowRight");
        index += 2;
        continue;
      }
      if (code === "D") {
        keys.push("ArrowLeft");
        index += 2;
        continue;
      }
    }

    if (char === "\u0003") {
      keys.push("Ctrl-C");
      continue;
    }

    if (char === "\u0004") {
      keys.push("Ctrl-D");
      continue;
    }

    if (char === "\r" || char === "\n") {
      keys.push("Enter");
      continue;
    }

    if (char === "\u007f") {
      keys.push("Backspace");
      continue;
    }

    if (char !== undefined) {
      keys.push(char);
    }
  }

  return keys;
};

const expandScript = function* (script: string): Generator<string> {
  for (const chunk of script) {
    if (chunk === "\n" || chunk === "\r") {
      yield "Enter";
      continue;
    }

    if (chunk.length > 0) {
      yield chunk;
    }
  }
};
