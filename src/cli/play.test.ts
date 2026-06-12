import { describe, expect, it } from "vitest";

import { path as findPath } from "../engine/map/path.js";
import {
  currentFloorRuntime,
  startRun,
  stepRun,
} from "../engine/run/loop.js";
import type { GameState, Position } from "../engine/state/index.js";
import { gridFromState, type MoveDirection } from "../engine/turn/actions.js";
import { createFallbackFloorContentProvider } from "../harness/fallback-provider.js";
import type { TraceFsAdapter } from "../harness/trace/recorder.js";
import {
  chunkKeys,
  createScriptedInputSource,
  DEFAULT_DEV_SEED,
  parsePlayArgs,
} from "./input-util.js";
import {
  createStringOutput,
  formatRunSummary,
  keyToDirection,
  runPlay,
} from "./play.js";

const FIXTURE_SEED = "cli-play-fixture";
const CREATED_AT = "2026-06-12T12:00:00.000Z";

describe("input-util", () => {
  it("parses seed args and expands arrow chunks", () => {
    expect(parsePlayArgs(["--seed", "abc"])).toEqual({ seed: "abc", help: false });
    expect(parsePlayArgs(["--seed=xyz"])).toEqual({ seed: "xyz", help: false });
    expect(parsePlayArgs(["--help"])).toEqual({ seed: DEFAULT_DEV_SEED, help: true });
    expect(chunkKeys("\u001b[A")).toEqual(["ArrowUp"]);
  });

  it("maps movement keys consistently", () => {
    expect(keyToDirection("w")).toBe("north");
    expect(keyToDirection("ArrowDown")).toBe("south");
  });
});

describe("cli play", () => {
  it("runs a scripted fixture session with expected beats and trace", async () => {
    const fs = new MemoryTraceFs();
    const script = buildFixtureScript(FIXTURE_SEED);
    expect(script.length).toBeGreaterThanOrEqual(40);

    const { output, text } = createStringOutput({ accumulate: true });
    const result = await runPlay({
      seed: FIXTURE_SEED,
      input: createScriptedInputSource(script),
      output,
      traceFs: fs,
      createdAt: CREATED_AT,
      interactive: false,
    });

    const rendered = text();

    expect(rendered).toContain("d1");
    expect(rendered).toContain("INVENTORY");
    expect(rendered).toContain("INSPECT");
    expect(rendered).toContain("QUEST LOG");
    expect(rendered).toContain("KEYMAP");
    expect(rendered).toMatch(/moved|wait|pickup|cannot pickup|entered d2|descend/i);
    expect(rendered).toContain("=== RUN SUMMARY ===");
    expect(result.summary.depth).toBeGreaterThanOrEqual(1);
    expect(result.tracePath).toMatch(/trace\.ndjson$/);
    expect(fs.read(result.tracePath ?? "")).toContain('"recordType":"header"');

  });

  it("aborts cleanly with Esc and reports ABORTED", async () => {
    const { output, text } = createStringOutput({ accumulate: true });
    const result = await runPlay({
      seed: FIXTURE_SEED,
      input: createScriptedInputSource("...\u001b"),
      output,
      recordTrace: false,
      interactive: false,
    });

    expect(result.summary.terminalStatus).toBe("ABORTED");
    expect(text()).toContain("Outcome: ABORTED");
    expect(formatRunSummary(result.summary, null)).toContain("Turns:");
  });
});

const buildFixtureScript = (seed: string): string => {
  const provider = createFallbackFloorContentProvider();
  const started = startRun(seed, provider);
  if (!started.ok) {
    throw new Error(started.error.message);
  }

  let state = started.state;
  const keys: string[] = [];

  const tryWalkTo = (target: Position): boolean => {
    for (let guard = 0; guard < 80; guard += 1) {
      if (samePosition(state.player.position, target)) {
        return true;
      }

      const direction = nextDirectionToward(state, target);
      if (direction === null) {
        return false;
      }

      keys.push(directionToKey(direction));
      state = advanceState(state, direction, provider);
    }

    return samePosition(state.player.position, target);
  };

  const item = Object.values(state.entities).find((entity) => entity.kind === "item");
  if (item !== undefined && tryWalkTo(item.position)) {
    keys.push("g");
    state = advanceState(state, { kind: "pickup" }, provider);
  }

  keys.push("i", "1", "u", "\u001b", "x", "l", "j", "\u001b", "q", "\u001b", "?", "\u001b");

  for (let index = 0; index < 12; index += 1) {
    keys.push(".");
    state = advanceState(state, { kind: "wait" }, provider);
  }

  const runtime = currentFloorRuntime(state);
  if (runtime !== null) {
    if (tryWalkTo(runtime.stairsDown)) {
      keys.push(">", "y");
      state = advanceState(state, { kind: "descend" }, provider);
    } else {
      keys.push(">");
    }
  }

  while (keys.length < 40) {
    keys.push("h");
    state = advanceState(state, "west", provider);
  }

  return keys.join("");
};

const advanceState = (
  state: GameState,
  action: { readonly kind: "pickup" | "wait" | "descend" } | MoveDirection,
  provider: ReturnType<typeof createFallbackFloorContentProvider>,
): GameState => {
  const runAction =
    typeof action === "string"
      ? { kind: "move" as const, direction: action }
      : action;

  const result = stepRun(state, runAction, provider);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.state;
};

const nextDirectionToward = (
  state: GameState,
  target: Position,
): MoveDirection | null => {
  const grid = gridFromState(state);
  if (grid === null) {
    return null;
  }

  const route = findPath(grid, state.player.position, target, {
    openDoors: true,
    isOccupied: (position) =>
      Object.values(state.entities).some(
        (entity) =>
          (entity.kind === "enemy" || entity.kind === "npc") &&
          samePosition(entity.position, position),
      ),
  });

  const next = route?.[1];
  if (next === undefined) {
    return null;
  }

  return directionBetween(state.player.position, next);
};

const directionBetween = (from: Position, to: Position): MoveDirection => {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  const pairs: Record<string, MoveDirection> = {
    "-1,-1": "northwest",
    "0,-1": "north",
    "1,-1": "northeast",
    "-1,0": "west",
    "1,0": "east",
    "-1,1": "southwest",
    "0,1": "south",
    "1,1": "southeast",
  };

  const key = `${dx},${dy}`;
  const direction = pairs[key];
  if (direction === undefined) {
    throw new Error(`not adjacent: ${JSON.stringify({ from, to })}`);
  }

  return direction;
};

const directionToKey = (direction: MoveDirection): string => {
  switch (direction) {
    case "north":
      return "k";
    case "south":
      return "j";
    case "west":
      return "h";
    case "east":
      return "l";
    case "northwest":
      return "u";
    case "northeast":
      return "l";
    case "southwest":
      return "b";
    case "southeast":
      return "j";
  }
};

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

class MemoryTraceFs implements TraceFsAdapter {
  private readonly files = new Map<string, string>();

  makeDir(): void {}

  writeNewFile(path: string, contents: string): void {
    if (this.files.has(path)) {
      throw new Error(`file exists: ${path}`);
    }
    this.files.set(path, contents);
  }

  appendFile(path: string, contents: string): void {
    const current = this.files.get(path);
    if (current === undefined) {
      throw new Error(`missing file: ${path}`);
    }
    this.files.set(path, current + contents);
  }

  read(path: string): string {
    const contents = this.files.get(path);
    if (contents === undefined) {
      throw new Error(`missing file: ${path}`);
    }
    return contents;
  }
}
