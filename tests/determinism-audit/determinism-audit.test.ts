import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { replayHashSpot } from "./replay-hash-spot.js";

const ENGINE_PATH = "src/engine";
const TIME_AND_RANDOM_PATTERN =
  /Math\.random|Date\.now|new Date\(|performance\.now/;
const OBJECT_ITERATION_PATTERN =
  /Object\.(keys|values|entries)|for \(const .* in /;

const KNOWN_ENGINE_OBJECT_ITERATION_SITES = [
  "src/engine/npc/barter.ts:280:  for (const entity of Object.values(state.entities)) {",
  "src/engine/npc/runtime.ts:117:  Object.values(state.entities)",
  "src/engine/effects/core.ts:75:  const unregisterers = Object.entries(CORE_EXECUTORS).map(([verb, executor]) =>",
  "src/engine/effects/spatial.ts:113:  const unregisterers = Object.entries(SPATIAL_EXECUTORS).map(",
  "src/engine/effects/spatial.ts:783:    Object.entries(state.entities).map(([id, entity]) => {",
  "src/engine/effects/spatial.ts:1099:  Object.values(state.entities).sort((left, right) =>",
  "src/engine/effects/geometry.ts:220:  Object.values(state.entities).sort((left, right) =>",
  "src/engine/systems/combat.ts:725:  for (const entity of Object.values(state.entities).sort((a, b) =>",
  "src/engine/systems/traps.ts:136:  Object.values(state.entities).filter((entity) => entity.kind === \"trap\")",
  "src/engine/systems/traps.ts:489:  Object.values(state.entities)",
  "src/engine/systems/traps.ts:505:    Object.entries(state.entities).map(([id, entity]) => {",
  "src/engine/systems/movement.ts:311:  ...Object.values(state.entities)",
  "src/engine/systems/status.ts:316:  ...Object.keys(state.entities)",
  "src/engine/systems/inventory.ts:145:  for (const entity of Object.values(state.entities)) {",
  "src/engine/systems/inventory.ts:410:  const items = Object.values(state.entities)",
  "src/engine/run/loop.ts:1029:    ...Object.values(state.entities).map((entity) =>",
  "src/engine/render/grid.ts:136:  Object.values(state.entities)",
  "src/engine/quests/machine.ts:205:    Object.entries(state.quests.quests).filter(([id]) => id !== questId),",
  "src/engine/quests/machine.ts:513:  const ward = Object.values(state.entities).find(",
  "src/engine/items/triggers.ts:895:  const entries = Object.entries(",
  "src/engine/items/triggers.ts:1019:  Object.values(state.entities).sort((left, right) =>",
  "src/engine/turn/actions.ts:405:  Object.values(state.entities).sort((a, b) => a.id.localeCompare(b.id));",
  "src/engine/state/serialize.ts:242:    for (const [id, entity] of Object.entries(entities)) {",
  "src/engine/state/serialize.ts:274:    for (const [id, quest] of Object.entries(questState.quests)) {",
  "src/engine/state/serialize.ts:304:    for (const [streamId, stream] of Object.entries(rng.streams)) {",
  "src/engine/state/serialize.ts:426:    for (const key of Object.keys(objectValue).sort()) {",
  "src/engine/behaviors/movement.ts:708:    return Object.values(state.entities).some(",
  "src/engine/quests/objectives.ts:420:    for (const entity of Object.values(state.entities)) {",
  "src/engine/quests/log.ts:61:    ...Object.keys(state.quests.quests),",
  "src/engine/state/init.ts:202:  Object.entries(gameConfig.runStructure.depthBands) as readonly [",
  "src/engine/turn/loop.ts:550:  Object.values(state.entities)",
  "src/engine/behaviors/special.ts:246:    const bodyguard = Object.values(state.entities)",
  "src/engine/behaviors/perception.ts:87:  const allies = Object.values(state.entities).filter(",
  "src/engine/items/identify.ts:298:    Object.entries(state.entities).map(([id, entity]) => {",
] as const;

describe("determinism audit", () => {
  it("keeps engine code free of ambient time and process random APIs", () => {
    expect(engineLinesMatching(TIME_AND_RANDOM_PATTERN)).toEqual([]);
  });

  it("pins engine object-iteration sites for deterministic review", () => {
    expect(
      engineLinesMatching(OBJECT_ITERATION_PATTERN, {
        includeTestFiles: false,
      }).toSorted(),
    ).toEqual([...KNOWN_ENGINE_OBJECT_ITERATION_SITES].toSorted());
  });

  it("replays a golden trace twice to the same final hash", () => {
    const first = replayHashSpot();
    const second = replayHashSpot();

    expect(first).toBe(second);
    expect(JSON.parse(first) as { terminalStatus: string }).toMatchObject({
      terminalStatus: "LOSS",
    });
  }, 120_000);
});

const engineLinesMatching = (
  pattern: RegExp,
  options: { readonly includeTestFiles?: boolean } = {},
): readonly string[] =>
  engineFiles({ includeTestFiles: options.includeTestFiles ?? true }).flatMap(
    (path) => {
      const relativePath = toPosixPath(relative(process.cwd(), path));
      return readFileSync(path, "utf8")
        .split("\n")
        .flatMap((rawLine, index) => {
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          return pattern.test(line)
            ? [`${relativePath}:${index + 1}:${line}`]
            : [];
        });
    },
  );

const engineFiles = (options: {
  readonly includeTestFiles: boolean;
}): readonly string[] => {
  const root = join(process.cwd(), ENGINE_PATH);
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const relativePath = toPosixPath(relative(process.cwd(), path));
      if (!options.includeTestFiles && relativePath.endsWith(".test.ts")) {
        continue;
      }
      files.push(path);
    }
  };

  visit(root);
  return files;
};

const toPosixPath = (path: string): string => path.split(sep).join("/");
