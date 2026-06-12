import { mkdirSync, writeFileSync } from "node:fs";

import { validShallowsManifestFixture } from "../../src/schemas/fixtures/manifest.js";
import type {
  FloorManifest,
  ManifestItemEntry,
  ManifestNpcEntry,
  ManifestRosterEntry,
  ManifestTrapEntry,
} from "../../src/schemas/manifest.js";
import type {
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  TrapDefinition,
} from "../../src/schemas/entities/index.js";
import { path as findPath } from "../../src/engine/map/path.js";
import {
  currentFloorRuntime,
  startRun,
  stepRun,
  type FloorContent,
  type FloorContentProvider,
  type RunAction,
} from "../../src/engine/run/loop.js";
import type { GameState, Position } from "../../src/engine/state/index.js";
import {
  gridFromState,
  type MoveDirection,
} from "../../src/engine/turn/actions.js";
import { createMockDirectorProvider } from "../../src/director/provider/index.js";
import { createFallbackFloorContentProvider } from "../../src/harness/fallback-provider.js";
import {
  recordAndVerifyRoundTrip,
  verifyTraceContent,
} from "../../src/harness/replay/index.js";
import {
  runBot,
  type BotPolicy,
} from "../../src/harness/bots/index.js";
import {
  aggressivePolicy,
  balancedPolicy,
  cautiousPolicy,
} from "../../src/harness/bots/policies/index.js";
import type {
  TraceContentRef,
  TraceHeader,
  TraceTurnLine,
  TraceWriter,
} from "../../src/harness/trace/recorder.js";

const OUT_DIR = "tests/golden";
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const FALLBACK_CONTENT_REF = {
  providerId: "fallback:old-stock",
  packVersion: "0.0.0",
} as const satisfies TraceContentRef;
const MOCK_CONTENT_REF = {
  providerId: "mock:valid-shallows-manifest",
  packVersion: "0.0.0",
} as const satisfies TraceContentRef;
const PERSONA_MAX_TURNS = 8000;

type GeneratedTrace = {
  readonly fileName: string;
  readonly verifyStatus: string;
};

const main = async (): Promise<void> => {
  mkdirSync(OUT_DIR, { recursive: true });
  const generated: GeneratedTrace[] = [];

  generated.push(
    writeScriptedFallbackTrace(
      "replay-mini-wait.ndjson",
      "golden-mini-wait",
      [{ kind: "wait" }, { kind: "wait" }],
    ),
  );
  generated.push(
    writeScriptedFallbackTrace(
      "band-shallows.ndjson",
      "golden-band-shallows",
      [{ kind: "wait" }],
    ),
  );
  generated.push(
    writeScriptedFallbackTrace(
      "band-middle.ndjson",
      "golden-band-middle",
      [...actionsToDepth("golden-band-middle", 5), { kind: "wait" }],
    ),
  );
  generated.push(
    writeScriptedFallbackTrace(
      "band-lowest.ndjson",
      "golden-band-lowest",
      [...actionsToDepth("golden-band-lowest", 10), { kind: "wait" }],
    ),
  );

  for (const policy of [cautiousPolicy, balancedPolicy, aggressivePolicy]) {
    generated.push(writePersonaFallbackTrace(policy));
  }

  generated.push(await writeMockDirectorTrace());

  process.stdout.write(
    generated
      .map((trace) => `${trace.fileName}: ${trace.verifyStatus}`)
      .join("\n") + "\n",
  );
};

const writeScriptedFallbackTrace = (
  fileName: string,
  seed: string,
  actions: readonly RunAction[],
): GeneratedTrace => {
  const tracePath = `${OUT_DIR}/${fileName}`;
  const result = recordAndVerifyRoundTrip({
    seed,
    actions,
    provider: createFallbackFloorContentProvider(),
    contentRef: FALLBACK_CONTENT_REF,
    createdAt: CREATED_AT,
    modelId: "none",
    tracePath,
  });

  assertIdentical(fileName, result.verify.status);
  return { fileName, verifyStatus: result.verify.status };
};

const writePersonaFallbackTrace = (policy: BotPolicy): GeneratedTrace => {
  const seed = `golden-persona-${policy.name}`;
  const fileName = `persona-${policy.name}.ndjson`;
  const tracePath = `${OUT_DIR}/${fileName}`;
  const run = runBot(
    policy,
    seed,
    createFallbackFloorContentProvider(),
    PERSONA_MAX_TURNS,
    {
      createdAt: CREATED_AT,
      modelId: `persona:${policy.name}`,
      contentRef: FALLBACK_CONTENT_REF,
      runId: `golden-persona-${policy.name}`,
      writer: memoryTraceWriter(`memory://${fileName}`),
    },
  );
  const verify = verifyTraceContent(run.trace.content);

  assertIdentical(fileName, verify.status);
  writeFileSync(tracePath, run.trace.content, "utf8");

  return { fileName, verifyStatus: verify.status };
};

const writeMockDirectorTrace = async (): Promise<GeneratedTrace> => {
  const seed = "golden-mock-director-shallows";
  const fileName = "mock-director-shallows.ndjson";
  const tracePath = `${OUT_DIR}/${fileName}`;
  const provider = await mockDirectorFloorProvider(seed);
  const trace = recordAndVerifyRoundTrip({
    seed,
    actions: [{ kind: "wait" }, { kind: "wait" }],
    provider,
    contentRef: MOCK_CONTENT_REF,
    createdAt: CREATED_AT,
    modelId: "mock-director",
  });

  writeFileSync(tracePath, trace.trace, "utf8");
  return { fileName, verifyStatus: "recorded" };
};

const mockDirectorFloorProvider = async (
  seed: string,
): Promise<FloorContentProvider> => {
  const provider = createMockDirectorProvider({
    manifest: {
      ...validShallowsManifestFixture,
      params: {
        ...validShallowsManifestFixture.params,
        seed,
      },
    },
  });
  const generated = await provider.generateManifest("golden mocked director");
  if (!generated.ok) {
    throw new Error(generated.message);
  }

  return {
    getFloor: (_depth, floorSeed) =>
      manifestToFloorContent(generated.manifest, floorSeed),
  };
};

const manifestToFloorContent = (
  manifest: FloorManifest,
  seed: string,
): FloorContent => ({
  params: {
    ...manifest.params,
    seed,
  },
  roster: manifest.roster.map(stripPlacementHint),
  items: manifest.items.map(stripPlacementHint),
  traps: manifest.traps.map(stripPlacementHint),
  npcs: manifest.npcs.map(stripPlacementHint),
  ...(manifest.quest === null ? {} : { quest: manifest.quest }),
});

function stripPlacementHint(entry: ManifestRosterEntry): EnemyDefinition;
function stripPlacementHint(entry: ManifestItemEntry): ItemDefinition;
function stripPlacementHint(entry: ManifestTrapEntry): TrapDefinition;
function stripPlacementHint(entry: ManifestNpcEntry): NpcDefinition;
function stripPlacementHint(
  entry:
    | ManifestRosterEntry
    | ManifestItemEntry
    | ManifestTrapEntry
    | ManifestNpcEntry,
): EnemyDefinition | ItemDefinition | TrapDefinition | NpcDefinition {
  const copy = { ...entry } as {
    placementHint?: unknown;
  } & Record<string, unknown>;
  delete copy.placementHint;
  return copy as EnemyDefinition | ItemDefinition | TrapDefinition | NpcDefinition;
}

const actionsToDepth = (seed: string, targetDepth: number): readonly RunAction[] => {
  const provider = createFallbackFloorContentProvider();
  const started = startRun(seed, provider);
  if (!started.ok) {
    throw new Error(started.error.message);
  }

  let state = started.state;
  const actions: RunAction[] = [];

  while (state.run.depth < targetDepth) {
    const runtime = currentFloorRuntime(state);
    if (runtime === null) {
      throw new Error("missing floor runtime");
    }

    while (!samePosition(state.player.position, runtime.stairsDown)) {
      const action = nextMoveToward(state, runtime.stairsDown);
      actions.push(action);
      state = stepOk(state, action, provider);
    }

    const descend = { kind: "descend" } as const;
    actions.push(descend);
    state = stepOk(state, descend, provider);
  }

  return actions;
};

const stepOk = (
  state: GameState,
  action: RunAction,
  provider: FloorContentProvider,
): GameState => {
  const result = stepRun(state, action, provider);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.state;
};

const nextMoveToward = (state: GameState, target: Position): RunAction => {
  const grid = gridFromState(state);
  if (grid === null) {
    throw new Error("missing grid");
  }

  const route = findPath(grid, state.player.position, target, {
    openDoors: true,
    isOccupied: (position) => isActorAt(state, position),
  });
  const next = route?.[1];
  if (next === undefined) {
    throw new Error("no route to target");
  }

  return {
    kind: "move",
    direction: directionBetween(state.player.position, next),
  };
};

const isActorAt = (state: GameState, position: Position): boolean =>
  Object.values(state.entities).some(
    (entity) =>
      (entity.kind === "enemy" || entity.kind === "npc") &&
      samePosition(entity.position, position),
  );

const directionBetween = (from: Position, to: Position): MoveDirection => {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  if (dx === -1 && dy === -1) {
    return "northwest";
  }
  if (dx === 0 && dy === -1) {
    return "north";
  }
  if (dx === 1 && dy === -1) {
    return "northeast";
  }
  if (dx === -1 && dy === 0) {
    return "west";
  }
  if (dx === 1 && dy === 0) {
    return "east";
  }
  if (dx === -1 && dy === 1) {
    return "southwest";
  }
  if (dx === 0 && dy === 1) {
    return "south";
  }
  if (dx === 1 && dy === 1) {
    return "southeast";
  }

  throw new Error(`positions are not adjacent: ${JSON.stringify({ from, to })}`);
};

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const assertIdentical = (fileName: string, status: string): void => {
  if (status !== "identical") {
    throw new Error(`${fileName} replay was ${status}`);
  }
};

const memoryTraceWriter = (path: string): TraceWriter => ({
  path,
  writeHeader: (_header: TraceHeader) => {},
  appendTurn: <Action, Event>(_line: TraceTurnLine<Action, Event>) => {},
});

await main();
