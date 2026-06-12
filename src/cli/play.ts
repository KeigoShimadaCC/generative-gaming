import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import "../engine/items/triggers.js";
import "../engine/npc/dialogue.js";
import "../engine/systems/combat.js";
import "../engine/systems/inventory.js";
import "../engine/systems/movement.js";
import { config } from "../config/index.js";
import { itemCardKnowledge } from "../engine/items/identify.js";
import {
  dialogueTurnHooks,
  freezeTurnCount,
  getCurrentDialogueNode,
  isWorldPaused,
  resolveDialogueChoice,
  resolveEndConversation,
} from "../engine/npc/index.js";
import { buildQuestLog } from "../engine/quests/log.js";
import { render, renderHudLine, formatLogEvent } from "../engine/render/index.js";
import { enemyGlyph } from "../engine/render/glyphs.js";
import { summarizeRun } from "../engine/run/endings.js";
import type { RunEvent } from "../engine/run/events.js";
import {
  currentFloorRuntime,
  startRun,
  stepRun,
  type FloorContentProvider,
  type RunAction,
  type RunLoopResult,
} from "../engine/run/loop.js";
import type { ItemDefinition } from "../schemas/entities/index.js";
import {
  dropItem,
  equipItem,
  type EquipTarget,
} from "../engine/systems/inventory.js";
import { getTile, inBounds, Terrain, type TerrainKind } from "../engine/map/index.js";
import type {
  EntityInstance,
  GameState,
  InventorySlot,
  PlayerItemStack,
  Position,
} from "../engine/state/index.js";
import { ACTIVE_TERMINAL_STATUS } from "../engine/state/index.js";
import {
  checkActionLegality,
  destinationForMove,
  gridFromState,
  type MoveDirection,
} from "../engine/turn/actions.js";
import { createFallbackFloorContentProvider } from "../harness/fallback-provider.js";
import {
  createFileTraceWriter,
  record,
  type RecordedSession,
  type TraceContentRef,
  type TraceFsAdapter,
  type TraceRecorderOptions,
} from "../harness/trace/recorder.js";
import {
  createScriptedInputSource,
  createTerminalInputSource,
  DEFAULT_DEV_SEED,
  parsePlayArgs,
  PLAY_HELP_TEXT,
  type InputSource,
  type ParsedPlayArgs,
} from "./input-util.js";

export { DEFAULT_DEV_SEED, parsePlayArgs, PLAY_HELP_TEXT };
export type { InputSource, ParsedPlayArgs };

export const FALLBACK_CONTENT_REF = {
  providerId: "fallback:old-stock",
  packVersion: "0.0.0",
} as const satisfies TraceContentRef;

const LOG_LINES = 6;

export type PlayOutput = {
  readonly write: (line: string) => void;
  readonly clear: () => void;
};

export type PlayOptions = {
  readonly seed?: string;
  readonly input?: InputSource;
  readonly output?: PlayOutput;
  readonly provider?: FloorContentProvider;
  readonly traceRootDir?: string;
  readonly traceFs?: TraceFsAdapter;
  readonly createdAt?: string;
  readonly recordTrace?: boolean;
  readonly interactive?: boolean;
};

export type PlayResult = {
  readonly summary: ReturnType<typeof summarizeRun>;
  readonly tracePath: string | null;
  readonly output: string;
};

type UiMode =
  | { readonly kind: "play" }
  | { readonly kind: "confirm"; readonly prompt: string; readonly onYes: () => void }
  | { readonly kind: "inventory"; readonly selected: number | null }
  | { readonly kind: "inventory_item"; readonly itemId: string }
  | { readonly kind: "throw_direction"; readonly itemId: string }
  | { readonly kind: "inspect"; readonly cursor: Position }
  | { readonly kind: "quest_log" }
  | { readonly kind: "keymap" };

type InventoryRow = {
  readonly label: string;
  readonly itemId: string | null;
  readonly definition: ItemDefinition | null;
  readonly identified: boolean;
  readonly equipTarget: EquipTarget | null;
};

type PlayContext = {
  readonly seed: string;
  readonly provider: FloorContentProvider;
  readonly input: InputSource;
  readonly output: PlayOutput;
  readonly lines: string[];
  readonly session: PlaySession;
  mode: UiMode;
  recentEvents: EngineLogSlice[];
  abortedBySignal: boolean;
};

type EngineLogSlice = {
  readonly turn: number;
  readonly type: string;
  readonly line: string;
};

type RunStepSlice = {
  readonly state: GameState;
  readonly events: readonly RunEvent[];
};

export type PlaySession = {
  readonly getState: () => GameState;
  readonly setState: (state: GameState) => void;
  readonly step: (action: RunAction) => RunStepSlice;
  readonly tracePath: string | null;
};

export const createStringOutput = (options: { readonly accumulate?: boolean } = {}): {
  output: PlayOutput;
  text: () => string;
} => {
  const lines: string[] = [];

  return {
    output: {
      write: (line) => {
        lines.push(line);
      },
      clear: () => {
        if (!options.accumulate) {
          lines.length = 0;
        }
      },
    },
    text: () => lines.join("\n"),
  };
};

export const runPlay = async (options: PlayOptions = {}): Promise<PlayResult> => {
  const seed = options.seed ?? DEFAULT_DEV_SEED;
  const provider = options.provider ?? createFallbackFloorContentProvider();
  const sink = options.output ?? createStringOutput().output;
  const input = options.input ?? createScriptedInputSource("");
  const recordTrace = options.recordTrace ?? true;
  const createdAt = options.createdAt ?? new Date().toISOString();

  const session = createSession({
    seed,
    provider,
    recordTrace,
    createdAt,
    traceRootDir: options.traceRootDir,
    traceFs: options.traceFs,
  });

  const context: PlayContext = {
    seed,
    provider,
    input,
    output: sink,
    lines: [],
    session,
    mode: { kind: "play" },
    recentEvents: [],
    abortedBySignal: false,
  };

  const onSigint = (): void => {
    context.abortedBySignal = true;
  };

  if (options.interactive !== false && process.stdin.isTTY && options.input === undefined) {
    process.once("SIGINT", onSigint);
  }

  try {
    paint(context);

    while (context.session.getState().run.terminalStatus === ACTIVE_TERMINAL_STATUS) {
      const key = await input.readKey();

      if (key === null) {
        if (context.abortedBySignal) {
          stepRecorded(context, { kind: "abort" });
        }
        break;
      }

      if (key === "Ctrl-C") {
        context.abortedBySignal = true;
        stepRecorded(context, { kind: "abort" });
        break;
      }

      const keepPlaying = await handleKey(context, key);
      paint(context);

      if (!keepPlaying) {
        break;
      }
    }
  } finally {
    input.close();
    process.off("SIGINT", onSigint);
  }

  const summary = summarizeRun(context.session.getState());
  const summaryText = formatRunSummary(summary, context.session.tracePath);
  sink.write("");
  sink.write(summaryText);

  return {
    summary,
    tracePath: context.session.tracePath,
    output: context.lines.join("\n"),
  };
};

const createSession = (options: {
  readonly seed: string;
  readonly provider: FloorContentProvider;
  readonly recordTrace: boolean;
  readonly createdAt: string;
  readonly traceRootDir?: string;
  readonly traceFs?: TraceFsAdapter;
}): PlaySession => {
  const started = startRun(options.seed, options.provider);
  if (!started.ok) {
    throw new Error(started.error.message);
  }

  let state = started.state;

  const baseStep = (action: RunAction): RunStepSlice => {
    const result = stepPlayerAction(state, action, options.provider);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    state = result.state;
    return {
      state: result.state,
      events: result.events,
    };
  };

  if (!options.recordTrace) {
    return {
      getState: () => state,
      setState: (next) => {
        state = next;
      },
      step: baseStep,
      tracePath: null,
    };
  }

  const traceOptions: TraceRecorderOptions = {
    seed: options.seed,
    createdAt: options.createdAt,
    modelId: "none",
    contentRef: FALLBACK_CONTENT_REF,
    writer: createFileTraceWriter({
      runId: `run-${options.seed}`,
      rootDir: options.traceRootDir,
      ...(options.traceFs === undefined ? {} : { fs: options.traceFs }),
    }),
  };

  const recorded: RecordedSession<RunAction, RunEvent> = record(
    {
      get state() {
        return state;
      },
      step: baseStep,
    },
    traceOptions,
  );

  return {
    getState: () => recorded.state,
    setState: (next) => {
      state = next;
    },
    step: (action) => recorded.step(action),
    tracePath: recorded.trace.path,
  };
};

const stepRecorded = (context: PlayContext, action: RunAction): void => {
  const result = context.session.step(action);
  pushEvents(context, result.events);
};

const pushEvents = (context: PlayContext, events: readonly RunEvent[]): void => {
  for (const event of events) {
    const line = formatLogEvent(event);
    context.recentEvents.push({
      turn: event.turn,
      type: event.type,
      line,
    });
  }

  while (context.recentEvents.length > LOG_LINES * 4) {
    context.recentEvents.shift();
  }
};

const stepPlayerAction = (
  state: GameState,
  action: RunAction,
  provider: FloorContentProvider,
): RunLoopResult => {
  const turnBefore = state.run.turn;
  const result = stepRun(state, action, provider, { hooks: dialogueTurnHooks() });

  if (!result.ok) {
    return result;
  }

  let nextState = result.state;
  let events = [...result.events];

  if (action.kind === "talk" || isWorldPaused(state) || isWorldPaused(nextState)) {
    nextState = freezeTurnCount(nextState, turnBefore);
  }

  return {
    ok: true,
    state: nextState,
    events,
  };
};

const paint = (context: PlayContext): void => {
  const state = context.session.getState();
  const frame = renderFrame(state, context.mode, context.recentEvents);
  context.output.clear();
  context.output.write(frame);
  context.lines.length = 0;
  context.lines.push(frame);
};

const renderFrame = (
  state: GameState,
  mode: UiMode,
  recentEvents: readonly EngineLogSlice[],
): string => {
  const sections: string[] = [render(state), "", "--- CONTEXT ---", renderContextPanel(state, mode), "", "--- LOG ---"];

  const logLines = recentEvents.slice(-LOG_LINES).map((entry) => entry.line);
  if (logLines.length === 0) {
    sections.push("(no events yet)");
  } else {
    sections.push(...logLines);
  }

  sections.push("", renderHudLine(state));
  return sections.join("\n");
};

const renderContextPanel = (state: GameState, mode: UiMode): string => {
  const dialogue = getCurrentDialogueNode(state);
  if (dialogue !== null) {
    return renderDialoguePanel(dialogue.npc.definition.name, dialogue.node.text, dialogue.node.choices);
  }

  switch (mode.kind) {
    case "inventory":
    case "inventory_item":
      return renderInventoryPanel(state, mode);
    case "inspect":
      return renderInspectPanel(state, mode.cursor);
    case "quest_log":
      return renderQuestLogPanel(state);
    case "keymap":
      return KEYMAP_TEXT;
    case "confirm":
      return `${mode.prompt}\nReally? y/n`;
    case "throw_direction":
      return `Throw direction? (arrows / WASD / hjkl, Esc cancel)`;
    case "play":
      return "(press ? for keys)";
  }
};

const renderDialoguePanel = (
  npcName: string,
  text: string,
  choices: ReadonlyArray<{ readonly id: string; readonly label: string }>,
): string => {
  const lines = [`DIALOGUE — ${npcName}`, text, "", "Replies:"];

  choices.forEach((choice, index) => {
    lines.push(`  ${index + 1}. ${choice.label}`);
  });
  lines.push("", "Enter number, Esc to leave.");

  return lines.join("\n");
};

const renderInventoryPanel = (state: GameState, mode: UiMode): string => {
  const rows = inventoryRows(state);
  const lines = ["INVENTORY", ""];

  if (rows.length === 0) {
    lines.push("(empty)");
    return lines.join("\n");
  }

  rows.forEach((row, index) => {
    lines.push(`  ${index + 1}. ${row.label}`);
  });

  if (mode.kind === "inventory_item") {
    lines.push("", `Selected: ${mode.itemId}`, "  u use  e equip  d drop  Esc back");
  } else {
    lines.push("", "Enter item number, Esc to close.");
  }

  return lines.join("\n");
};

const renderInspectPanel = (state: GameState, cursor: Position): string => {
  const lines = ["INSPECT", `Cursor (${cursor.x}, ${cursor.y})`, "", ...formatInspectCard(state, cursor), "", "Move cursor; Esc to exit."];
  return lines.join("\n");
};

const renderQuestLogPanel = (state: GameState): string => {
  const log = buildQuestLog(state);
  const lines = ["QUEST LOG", ""];

  if (log.active.length === 0 && log.completed.length === 0 && log.failed.length === 0) {
    lines.push("(no quests yet)");
  } else {
    for (const entry of log.active) {
      lines.push(`[ ] ${entry.title} — ${entry.objective.hint}`);
    }
    for (const entry of log.completed) {
      lines.push(`[x] ${entry.title} (completed)`);
    }
    for (const entry of log.failed) {
      lines.push(`[!] ${entry.title} (failed)`);
    }
  }

  lines.push("", "Esc to close.");
  return lines.join("\n");
};

const formatInspectCard = (state: GameState, cell: Position): string[] => {
  const grid = gridFromState(state);
  if (grid === null) {
    return ["(no floor loaded)"];
  }

  const lines: string[] = [];

  if (inBounds(grid, cell)) {
    const tile = getTile(grid, cell);
    lines.push(`Terrain: ${terrainLabel(tile.terrain)}`);
  }

  const entities = entitiesAt(state, cell);
  if (entities.length === 0) {
    lines.push("Empty.");
    return lines;
  }

  for (const entity of entities) {
    lines.push(...formatEntityCard(state, entity));
  }

  return lines;
};

const formatEntityCard = (state: GameState, entity: EntityInstance): string[] => {
  switch (entity.kind) {
    case "enemy":
      return [
        `Enemy ${entity.definition.name} (${enemyGlyph(entity.definition.glyph)})`,
        `HP ${entity.currentHP}/${entity.definition.stats.hp}`,
      ];
    case "npc":
      return [`NPC ${entity.definition.name} (${entity.definition.glyph})`];
    case "item": {
      const card = itemCardKnowledge(state, entity.definition, {
        itemInstanceId: entity.id,
        identified: entity.identified,
      });
      return [
        `Item ${card.displayName}`,
        card.unknown.length > 0 ? `Unknown: ${card.unknown.join(", ")}` : "Known item.",
      ];
    }
    case "trap":
      return [`Trap (${entity.definition.id})`];
  }
};

const terrainLabel = (terrain: TerrainKind): string => {
  switch (terrain) {
    case Terrain.Wall:
      return "wall";
    case Terrain.Floor:
      return "floor";
    case Terrain.Door:
      return "door";
    case Terrain.Water:
      return "water";
    case Terrain.StairsDown:
      return "stairs down";
    case Terrain.Entrance:
      return "entrance";
  }
};

const normalizeKey = (key: string): string => {
  if (key === "\u001b") {
    return "Escape";
  }

  return key;
};

const handleKey = async (context: PlayContext, key: string): Promise<boolean> => {
  key = normalizeKey(key);
  if (getCurrentDialogueNode(context.session.getState()) !== null) {
    return handleDialogueKey(context, key);
  }

  switch (context.mode.kind) {
    case "confirm":
      return handleConfirmKey(context, key);
    case "inventory":
      return handleInventoryListKey(context, key);
    case "inventory_item":
      return handleInventoryItemKey(context, key);
    case "throw_direction":
      return handleThrowDirectionKey(context, key);
    case "inspect":
      return handleInspectKey(context, key);
    case "quest_log":
      return handleOverlayDismissKey(context, key);
    case "keymap":
      return handleOverlayDismissKey(context, key);
    case "play":
      return handlePlayKey(context, key);
  }
};

const handleDialogueKey = (context: PlayContext, key: string): boolean => {
  if (key === "Escape") {
    const ended = resolveEndConversation(context.session.getState());
    if ("illegal" in ended) {
      context.recentEvents.push({
        turn: context.session.getState().run.turn,
        type: "dialogue_error",
        line: ended.reason,
      });
    } else {
      context.session.setState(ended.state);
      for (const event of ended.events) {
        context.recentEvents.push({
          turn: event.turn,
          type: event.type,
          line: formatLogEvent(event),
        });
      }
    }
    return true;
  }

  const choiceIndex = parseMenuIndex(key);
  const dialogue = getCurrentDialogueNode(context.session.getState());
  if (choiceIndex === null || dialogue === null) {
    return true;
  }

  const choice = dialogue.node.choices[choiceIndex - 1];
  if (choice === undefined) {
    return true;
  }

  const resolved = resolveDialogueChoice(context.session.getState(), choice.id);
  if ("illegal" in resolved) {
    context.recentEvents.push({
      turn: context.session.getState().run.turn,
      type: "dialogue_error",
      line: resolved.reason,
    });
    return true;
  }

  context.session.setState(resolved.state);
  for (const event of resolved.events) {
    context.recentEvents.push({
      turn: event.turn,
      type: event.type,
      line: formatLogEvent(event),
    });
  }

  return true;
};

const handleConfirmKey = (context: PlayContext, key: string): boolean => {
  if (context.mode.kind !== "confirm") {
    return true;
  }

  if (key === "y" || key === "Y") {
    const onYes = context.mode.onYes;
    context.mode = { kind: "play" };
    onYes();
    return true;
  }

  if (key === "n" || key === "N" || key === "Escape") {
    context.mode = { kind: "play" };
    context.recentEvents.push({
      turn: context.session.getState().run.turn,
      type: "confirm_cancelled",
      line: "Cancelled.",
    });
  }

  return true;
};

const handleInventoryListKey = (context: PlayContext, key: string): boolean => {
  if (key === "Escape") {
    context.mode = { kind: "play" };
    return true;
  }

  const index = parseMenuIndex(key);
  if (index === null) {
    return true;
  }

  const row = inventoryRows(context.session.getState())[index - 1];
  if (row === undefined || row.itemId === null) {
    return true;
  }

  context.mode = { kind: "inventory_item", itemId: row.itemId };
  return true;
};

const handleInventoryItemKey = (context: PlayContext, key: string): boolean => {
  if (context.mode.kind !== "inventory_item") {
    return true;
  }

  if (key === "Escape") {
    context.mode = { kind: "inventory", selected: null };
    return true;
  }

  const itemId = context.mode.itemId;
  const row = inventoryRows(context.session.getState()).find((entry) => entry.itemId === itemId);

  if (key === "u" || key === "U") {
    if (row?.definition?.kind === "throwable") {
      context.mode = { kind: "throw_direction", itemId };
      return true;
    }

    withConfirmIfNeeded(context, { kind: "use_item", itemId }, () => {
      stepRecorded(context, { kind: "use_item", itemId });
    });
    context.mode = { kind: "play" };
    return true;
  }

  if (key === "e" || key === "E") {
    const equipped = equipItem(context.session.getState(), itemId, row?.equipTarget ?? undefined);
    if ("illegal" in equipped) {
      context.recentEvents.push({
        turn: context.session.getState().run.turn,
        type: "inventory_error",
        line: equipped.reason,
      });
    } else {
      context.session.setState(equipped.state);
      for (const event of equipped.events) {
        context.recentEvents.push({
          turn: event.turn,
          type: event.type,
          line: formatLogEvent(event),
        });
      }
    }
    context.mode = { kind: "play" };
    return true;
  }

  if (key === "d" || key === "D") {
    const dropped = dropItem(context.session.getState(), itemId);
    if ("illegal" in dropped) {
      context.recentEvents.push({
        turn: context.session.getState().run.turn,
        type: "inventory_error",
        line: dropped.reason,
      });
    } else {
      context.session.setState(dropped.state);
      for (const event of dropped.events) {
        context.recentEvents.push({
          turn: event.turn,
          type: event.type,
          line: formatLogEvent(event),
        });
      }
    }
    context.mode = { kind: "play" };
    return true;
  }

  return true;
};

const handleThrowDirectionKey = (context: PlayContext, key: string): boolean => {
  if (context.mode.kind !== "throw_direction") {
    return true;
  }

  if (key === "Escape") {
    context.mode = { kind: "play" };
    return true;
  }

  const direction = keyToDirection(key);
  const itemId = context.mode.itemId;

  if (direction === null) {
    return true;
  }

  withConfirmIfNeeded(
    context,
    { kind: "use_item", itemId, direction },
    () => {
      stepRecorded(context, { kind: "use_item", itemId, direction });
    },
  );
  context.mode = { kind: "play" };
  return true;
};

const handleInspectKey = (context: PlayContext, key: string): boolean => {
  if (context.mode.kind !== "inspect") {
    return true;
  }

  if (key === "Escape" || key === "x" || key === "X") {
    context.mode = { kind: "play" };
    return true;
  }

  const direction = keyToDirection(key);
  if (direction === null) {
    return true;
  }

  const grid = gridFromState(context.session.getState());
  if (grid === null) {
    return true;
  }

  const next = destinationForMove(context.mode.cursor, direction);
  if (!inBounds(grid, next)) {
    return true;
  }

  context.mode = { kind: "inspect", cursor: next };
  return true;
};

const handleOverlayDismissKey = (context: PlayContext, key: string): boolean => {
  if (key === "Escape" || key === "q" || key === "Q" || key === "?") {
    context.mode = { kind: "play" };
  }

  return true;
};

const handlePlayKey = (context: PlayContext, key: string): boolean => {
  if (key === "Escape") {
    stepRecorded(context, { kind: "abort" });
    return false;
  }

  if (key === "?" ) {
    context.mode = { kind: "keymap" };
    return true;
  }

  if (key === "i" || key === "I") {
    context.mode = { kind: "inventory", selected: null };
    return true;
  }

  if (key === "q" || key === "Q") {
    context.mode = { kind: "quest_log" };
    return true;
  }

  if (key === "x" || key === "X") {
    context.mode = {
      kind: "inspect",
      cursor: { ...context.session.getState().player.position },
    };
    return true;
  }

  if (key === "." ) {
    stepRecorded(context, { kind: "wait" });
    return true;
  }

  if (key === "g" || key === "G") {
    stepRecorded(context, { kind: "pickup" });
    return true;
  }

  if (key === ">" ) {
    withConfirmIfNeeded(context, { kind: "descend" }, () => {
      stepRecorded(context, { kind: "descend" });
    });
    return true;
  }

  const direction = keyToDirection(key);
  if (direction !== null) {
    const action = movementActionFor(context.session.getState(), direction);
    withConfirmIfNeeded(context, action, () => {
      stepRecorded(context, action);
    });
    return true;
  }

  return true;
};

const withConfirmIfNeeded = (
  context: PlayContext,
  action: RunAction,
  onYes: () => void,
): void => {
  if (action.kind === "take_hoard") {
    onYes();
    return;
  }

  const legality = checkActionLegality(context.session.getState(), action);
  if (legality.status === "legal") {
    if (needsDangerConfirm(context.session.getState(), action)) {
      context.mode = {
        kind: "confirm",
        prompt: dangerPrompt(action),
        onYes,
      };
      return;
    }

    onYes();
    return;
  }

  context.recentEvents.push({
    turn: context.session.getState().run.turn,
    type: "action_illegal",
    line: legality.reason,
  });
};

const needsDangerConfirm = (state: GameState, action: RunAction): boolean => {
  if (action.kind !== "descend") {
    return false;
  }

  const runtime = currentFloorRuntime(state);
  if (runtime === null) {
    return false;
  }

  return state.run.depth < config.runStructure.depthFloors;
};

const dangerPrompt = (action: RunAction): string => {
  if (action.kind === "descend") {
    return "Descend to the next floor?";
  }

  return "Continue?";
};

const movementActionFor = (state: GameState, direction: MoveDirection): RunAction => {
  const grid = gridFromState(state);
  if (grid === null) {
    return { kind: "move", direction };
  }

  const destination = destinationForMove(state.player.position, direction);
  if (!inBounds(grid, destination)) {
    return { kind: "move", direction };
  }

  const occupant = entitiesAt(state, destination).find(
    (entity) => entity.kind === "enemy" || entity.kind === "npc",
  );

  if (occupant?.kind === "enemy") {
    return { kind: "attack", targetId: occupant.id };
  }

  if (occupant?.kind === "npc") {
    return { kind: "talk", npcId: occupant.id };
  }

  return { kind: "move", direction };
};

const inventoryRows = (state: GameState): InventoryRow[] => {
  const rows: InventoryRow[] = [];

  for (const slot of state.player.inventory) {
    if (slot === null) {
      continue;
    }

    rows.push({
      label: formatInventoryLabel(slot),
      itemId: slot.itemInstanceId,
      definition: slot.definition,
      identified: slot.identified,
      equipTarget: defaultEquipTarget(slot.definition, state.player.equipment.charms),
    });
  }

  const equipmentEntries: Array<{ readonly label: string; readonly stack: PlayerItemStack; readonly target: EquipTarget }> = [];

  if (state.player.equipment.weapon !== null) {
    equipmentEntries.push({
      label: `wielding ${state.player.equipment.weapon.definition.name}`,
      stack: state.player.equipment.weapon,
      target: { kind: "weapon" },
    });
  }

  if (state.player.equipment.armor !== null) {
    equipmentEntries.push({
      label: `wearing ${state.player.equipment.armor.definition.name}`,
      stack: state.player.equipment.armor,
      target: { kind: "armor" },
    });
  }

  state.player.equipment.charms.forEach((charm, index) => {
    if (charm !== null) {
      equipmentEntries.push({
        label: `charm ${index + 1}: ${charm.definition.name}`,
        stack: charm,
        target: { kind: "charm", index },
      });
    }
  });

  for (const entry of equipmentEntries) {
    rows.push({
      label: entry.label,
      itemId: entry.stack.itemInstanceId,
      definition: entry.stack.definition,
      identified: entry.stack.identified,
      equipTarget: entry.target,
    });
  }

  return rows;
};

const formatInventoryLabel = (slot: NonNullable<InventorySlot>): string => {
  const name = slot.identified ? slot.definition.name : "unknown item";
  return slot.quantity > 1 ? `${name} x${slot.quantity}` : name;
};

const defaultEquipTarget = (
  definition: ItemDefinition,
  charms: readonly (PlayerItemStack | null)[],
): EquipTarget | null => {
  switch (definition.kind) {
    case "weapon":
      return { kind: "weapon" };
    case "armor":
      return { kind: "armor" };
    case "charm": {
      const index = charms.findIndex((charm) => charm === null);
      return index === -1 ? null : { kind: "charm", index };
    }
    default:
      return null;
  }
};

const entitiesAt = (state: GameState, position: Position): EntityInstance[] =>
  Object.values(state.entities)
    .filter(
      (entity) =>
        entity.position.x === position.x && entity.position.y === position.y,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

const parseMenuIndex = (key: string): number | null => {
  if (!/^[1-9]$/.test(key)) {
    return null;
  }

  return Number.parseInt(key, 10);
};

export const keyToDirection = (key: string): MoveDirection | null => {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
    case "k":
    case "K":
      return "north";
    case "ArrowDown":
    case "s":
    case "S":
    case "j":
    case "J":
      return "south";
    case "ArrowLeft":
    case "a":
    case "A":
    case "h":
    case "H":
      return "west";
    case "ArrowRight":
    case "d":
    case "D":
    case "l":
    case "L":
      return "east";
    case "b":
    case "B":
      return "southwest";
    case "u":
    case "U":
      return "northwest";
    default:
      return null;
  }
};

const KEYMAP_TEXT = `KEYMAP
  move      arrows / WASD / hjkl (+ u y b n diagonals)
  pickup    g
  inventory i
  quest log q
  inspect   x (cursor keys in inspect mode)
  wait      .
  descend   >
  keymap    ?
  confirm   Enter
  cancel    Esc`;

export const formatRunSummary = (
  summary: ReturnType<typeof summarizeRun>,
  tracePath: string | null,
): string => {
  const lines = [
    "=== RUN SUMMARY ===",
    `Outcome: ${summary.terminalStatus}`,
    `Depth: ${summary.depth}`,
    `Turns: ${summary.turns}`,
    `Kills: ${summary.kills}`,
    `Discoveries: ${summary.discoveries.length}`,
    `Quests completed: ${summary.quests.completed.length}`,
  ];

  if (tracePath !== null) {
    lines.push(`Trace: ${tracePath}`);
  }

  return lines.join("\n");
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(resolve(entry)).href;
};

const main = async (): Promise<void> => {
  let args: ParsedPlayArgs;

  try {
    args = parsePlayArgs();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    process.stdout.write(`${PLAY_HELP_TEXT}\n`);
    return;
  }

  const input = createTerminalInputSource();
  const { output, text } = createStringOutput();

  await runPlay({
    seed: args.seed,
    input,
    output,
    interactive: true,
    recordTrace: true,
  });

  process.stdout.write(`${text()}\n`);
};

if (isMainModule()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
