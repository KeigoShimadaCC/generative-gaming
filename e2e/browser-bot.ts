import { expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { deserialize, type GameState, type PlayerItemStack } from "../src/engine/state/index.js";
import type { RunAction } from "../src/engine/run/loop.js";
import type { MoveDirection } from "../src/engine/turn/index.js";
import { balancedPolicy } from "../src/harness/bots/policies/index.js";
import {
  actionKey,
  fallbackAction,
  hasAction
} from "../src/harness/bots/policies/helpers.js";
import {
  createBotStateView,
  createEmptyBotMemory,
  updateBotMemory,
  type BotMemory,
  type BotStateView
} from "../src/harness/bots/index.js";

export const MAX_TURN_CAP = 3_000;
export const FINAL_DEPTH = 12;
const FLOOR_TRANSITION_TIMEOUT_MS = 90_000;
const FLOOR_TRANSITION_POLL_MS = 250;
const TELEMETRY_INTERVAL_TURNS = 250;
const NO_VISITED_PROGRESS_TURNS = 150;
const NO_PROGRESS_REPEAT_CAP = 24;
const NO_OBSERVABLE_CHANGE_ACTION_CAP = 12;
const LOOP_BREAK_AVOID_TURNS = 30;
const PICKUP_LOOP_THRESHOLD = 3;
const PICKUP_LOOP_WINDOW_TURNS = 10;
const DIAGNOSTICS_DIR = path.join("test-results", "fullclear-diagnostics");
const ACTION_HISTORY_LIMIT = 20;
const MAX_CONSOLE_MESSAGES = 300;

const PREFERRED_INVENTORY_ACTION_IDS = [
  "quaff",
  "use",
  "read",
  "equip",
  "unequip"
] as const;

export type GridCell = {
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
  readonly terrain: string;
  readonly fog: "visible" | "remembered" | "unseen";
  readonly layer: string;
  readonly featureKind: string;
  readonly featureId: string;
  readonly hasItem: boolean;
};

export type HudSnapshot = {
  readonly hpCurrent: number;
  readonly hpMax: number;
  readonly hpRatio: number;
};

export type ShellSnapshot = {
  readonly screen: string;
  readonly depth: number;
  readonly turn: number;
  readonly terminalStatus: string;
  readonly inputLocked: boolean;
  readonly panelMode: string;
  readonly diaryOpen: boolean;
  readonly transitionPhase: string;
};

export type BotDiagnosis = {
  readonly reason: string;
  readonly shell: ShellSnapshot;
  readonly hud: HudSnapshot | null;
  readonly player: { readonly x: number; readonly y: number } | null;
  readonly gameStateAttributes: Record<string, string>;
  readonly recentLogLines: readonly string[];
  readonly botState: BotStateSnapshot;
  readonly consoleMessages: readonly ConsoleMessageRecord[];
};

type Direction = MoveDirection;

type GridPosition = {
  readonly x: number;
  readonly y: number;
};

type BotOptions = {
  readonly seed?: string;
  readonly log?: (message: string) => void;
};

type BotDecision = {
  readonly keys: readonly string[];
  readonly action: string;
  readonly policyAction: string;
  readonly inventoryExec?: InventoryExecRequest;
};

type InventoryExecRequest = {
  readonly itemId: string;
  readonly direction?: MoveDirection;
};

export type BrowserBotViewDiagnostics = {
  readonly adjacentEnemyCount: number;
  readonly visibleEnemyCount: number;
  readonly inventoryCount: number;
  readonly equipmentCount: number;
  readonly hp: {
    readonly current: number;
    readonly max: number;
    readonly ratio: number;
  };
  readonly playerLevel: number;
  readonly playerXp: number;
  readonly mapCellCount: number;
  readonly visibleMapCellCount: number;
  readonly rememberedMapCellCount: number;
  readonly serializedEntityCount: number;
  readonly serializedInventorySlotCount: number;
  readonly serializedCarriedInventoryCount: number;
  readonly serializedEquipmentCount: number;
  readonly serializedFog:
    | {
        readonly present: true;
        readonly visible: number;
        readonly remembered: number;
        readonly unseen: number;
      }
    | {
        readonly present: false;
        readonly visible: 0;
        readonly remembered: 0;
        readonly unseen: 0;
      };
  readonly availableActionKinds: readonly string[];
};

export type BrowserBotViewConstruction = {
  readonly state: GameState;
  readonly view: BotStateView;
  readonly nextMemory: BotMemory;
  readonly diagnostics: BrowserBotViewDiagnostics;
};

type PickupLoopBreakerState = {
  readonly recentPickups: Array<{ readonly posKey: string; readonly turn: number }>;
  readonly blacklistedPositions: Set<string>;
};

type BotPolicyState = {
  readonly visitedByDepth: Map<number, Set<string>>;
  botMemory: BotMemory;
  readonly rng: () => number;
  readonly log: (message: string) => void;
  readonly lastActions: string[];
  loopBreaker: LoopBreakerState;
  pickupLoopBreaker: PickupLoopBreakerState;
  failedItemIds: Set<string>;
  descendIntent: DescendIntentState | null;
  inventoryIndex: number;
  lastAction: string | null;
  lastPolicyAction: string | null;
  lastViewDiagnostics: BrowserBotViewDiagnostics | null;
};

type DescendIntentState = {
  readonly depth: number;
  readonly stairsKey: string;
};

type LoopBreakerState = {
  previousAction: string | null;
  previousSignature: string | null;
  repeatCount: number;
  avoidEnemyKey: string | null;
  avoidUntilTurn: number;
};

export type BotStateSnapshot = {
  readonly depth: number | null;
  readonly turn: number | null;
  readonly visitedCount: number;
  readonly lastAction: string | null;
  readonly lastPolicyAction: string | null;
  readonly lastViewDiagnostics: BrowserBotViewDiagnostics | null;
  readonly last20Actions: readonly string[];
  readonly noProgressTurns: number;
};

export type ConsoleMessageRecord = {
  readonly timestamp: string;
  readonly type: string;
  readonly text: string;
  readonly location: {
    readonly url: string;
    readonly lineNumber: number;
    readonly columnNumber: number;
  };
};

type PageDiagnostics = {
  readonly consoleMessages: ConsoleMessageRecord[];
  botState: BotStateSnapshot;
};

type FloorTransitionPollResult =
  | {
      readonly timedOut: false;
      readonly shell: ShellSnapshot;
      readonly depthChanged: boolean;
      readonly phaseCleared: boolean;
    }
  | {
      readonly timedOut: true;
      readonly shell: ShellSnapshot;
    };

export type DiagnosticArtifactPaths = {
  readonly screenshot: string;
  readonly html: string;
  readonly console: string;
  readonly state: string;
};

type WalkableOptions = {
  readonly allowEnemyBlockers?: boolean;
  readonly blockedCells?: ReadonlySet<string>;
  readonly avoidEnemyAdjacency?: boolean;
  readonly allowedUnsafeCells?: ReadonlySet<string>;
};

const DIRECTION_KEYS: Record<Direction, string> = {
  north: "ArrowUp",
  south: "ArrowDown",
  west: "ArrowLeft",
  east: "ArrowRight",
  northwest: "y",
  northeast: "u",
  southwest: "b",
  southeast: "n"
};

const DIRECTION_DELTAS: Record<Direction, GridPosition> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  east: { x: 1, y: 0 },
  northwest: { x: -1, y: -1 },
  northeast: { x: 1, y: -1 },
  southwest: { x: -1, y: 1 },
  southeast: { x: 1, y: 1 }
};

const DIRECTIONS: readonly Direction[] = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest"
];

const WALKABLE_TERRAIN = new Set([
  "floor",
  "door",
  "water",
  "stairs_down",
  "entrance"
]);

const pageDiagnostics = new WeakMap<Page, PageDiagnostics>();

export function prepareFullClearDiagnostics(page: Page): void {
  ensurePageDiagnostics(page);
}

function ensurePageDiagnostics(page: Page): PageDiagnostics {
  const existing = pageDiagnostics.get(page);
  if (existing !== undefined) {
    return existing;
  }

  const diagnostics: PageDiagnostics = {
    consoleMessages: [],
    botState: emptyBotStateSnapshot()
  };

  page.on("console", (message) => {
    diagnostics.consoleMessages.push({
      timestamp: new Date().toISOString(),
      type: message.type(),
      text: message.text(),
      location: message.location()
    });
    trimConsoleMessages(diagnostics.consoleMessages);
  });

  page.on("pageerror", (error) => {
    diagnostics.consoleMessages.push({
      timestamp: new Date().toISOString(),
      type: "pageerror",
      text: error instanceof Error ? error.stack ?? error.message : String(error),
      location: {
        url: "",
        lineNumber: 0,
        columnNumber: 0
      }
    });
    trimConsoleMessages(diagnostics.consoleMessages);
  });

  pageDiagnostics.set(page, diagnostics);
  return diagnostics;
}

function trimConsoleMessages(messages: ConsoleMessageRecord[]): void {
  if (messages.length > MAX_CONSOLE_MESSAGES) {
    messages.splice(0, messages.length - MAX_CONSOLE_MESSAGES);
  }
}

function emptyBotStateSnapshot(): BotStateSnapshot {
  return {
    depth: null,
    turn: null,
    visitedCount: 0,
    lastAction: null,
    lastPolicyAction: null,
    lastViewDiagnostics: null,
    last20Actions: [],
    noProgressTurns: 0
  };
}

function emptyLoopBreakerState(): LoopBreakerState {
  return {
    previousAction: null,
    previousSignature: null,
    repeatCount: 0,
    avoidEnemyKey: null,
    avoidUntilTurn: 0
  };
}

function emptyPickupLoopBreakerState(): PickupLoopBreakerState {
  return {
    recentPickups: [],
    blacklistedPositions: new Set()
  };
}

export function selectPreferredInventoryActionId(
  actionIds: readonly string[]
): string | null {
  for (const preferred of PREFERRED_INVENTORY_ACTION_IDS) {
    if (actionIds.includes(preferred)) {
      return preferred;
    }
  }

  return null;
}

export function resolveItemEntryIndex(
  state: GameState,
  itemId: string
): number | null {
  const slotIndex = state.player.inventory.findIndex(
    (slot) => slot?.itemInstanceId === itemId
  );
  if (slotIndex >= 0) {
    return slotIndex;
  }

  const equipmentBase = state.player.inventory.length;
  if (state.player.equipment.weapon?.itemInstanceId === itemId) {
    return equipmentBase;
  }
  if (state.player.equipment.armor?.itemInstanceId === itemId) {
    return equipmentBase + 1;
  }

  for (let index = 0; index < state.player.equipment.charms.length; index += 1) {
    if (state.player.equipment.charms[index]?.itemInstanceId === itemId) {
      return equipmentBase + 2 + index;
    }
  }

  return null;
}

export function inventoryNavigationKeys(
  currentIndex: number,
  targetIndex: number,
  entryCount: number
): readonly string[] {
  if (entryCount <= 0 || currentIndex === targetIndex) {
    return [];
  }

  const normalizedCurrent =
    ((currentIndex % entryCount) + entryCount) % entryCount;
  const normalizedTarget =
    ((targetIndex % entryCount) + entryCount) % entryCount;
  const down = (normalizedTarget - normalizedCurrent + entryCount) % entryCount;
  const up = (normalizedCurrent - normalizedTarget + entryCount) % entryCount;

  return Array.from(
    { length: Math.min(down, up) },
    () => (down <= up ? "ArrowDown" : "ArrowUp")
  );
}

export function recordPickupForLoopBreaker(
  breaker: PickupLoopBreakerState,
  position: GridPosition,
  turn: number,
  log: (message: string) => void
): PickupLoopBreakerState {
  const posKeyValue = posKey(position.x, position.y);
  const recentPickups = [
    ...breaker.recentPickups.filter(
      (entry) => turn - entry.turn <= PICKUP_LOOP_WINDOW_TURNS
    ),
    { posKey: posKeyValue, turn }
  ];
  const samePositionCount = recentPickups.filter(
    (entry) => entry.posKey === posKeyValue
  ).length;
  const blacklistedPositions = new Set(breaker.blacklistedPositions);

  if (samePositionCount >= PICKUP_LOOP_THRESHOLD) {
    blacklistedPositions.add(posKeyValue);
    log(
      `[full-clear bot] pickup loop-breaker blacklisted position ${posKeyValue} after ${samePositionCount} pickups in ${PICKUP_LOOP_WINDOW_TURNS} turns`
    );
  }

  return {
    recentPickups,
    blacklistedPositions
  };
}

export function isPickupBlacklisted(
  breaker: PickupLoopBreakerState,
  position: GridPosition
): boolean {
  return breaker.blacklistedPositions.has(posKey(position.x, position.y));
}

export function verifyInventoryItemActionSucceeded(
  before: GameState,
  after: GameState,
  itemId: string
): boolean {
  const beforeQty = inventoryItemQuantity(before, itemId);
  const afterQty = inventoryItemQuantity(after, itemId);
  if (afterQty < beforeQty) {
    return true;
  }

  const beforeEquipped = isItemEquipped(before, itemId);
  const afterEquipped = isItemEquipped(after, itemId);
  if (!beforeEquipped && afterEquipped) {
    return true;
  }

  if (beforeQty > 0 && afterQty === 0 && !isItemInInventorySlots(after, itemId)) {
    return true;
  }

  return false;
}

function inventoryItemQuantity(state: GameState, itemId: string): number {
  const inInventory = state.player.inventory.find(
    (slot) => slot?.itemInstanceId === itemId
  );
  if (inInventory !== undefined && inInventory !== null) {
    return inInventory.quantity;
  }

  const equipped = findEquippedStack(state, itemId);
  return equipped?.quantity ?? 0;
}

function isItemInInventorySlots(state: GameState, itemId: string): boolean {
  return state.player.inventory.some((slot) => slot?.itemInstanceId === itemId);
}

function isItemEquipped(state: GameState, itemId: string): boolean {
  return findEquippedStack(state, itemId) !== null;
}

function findEquippedStack(
  state: GameState,
  itemId: string
): PlayerItemStack | null {
  if (state.player.equipment.weapon?.itemInstanceId === itemId) {
    return state.player.equipment.weapon;
  }
  if (state.player.equipment.armor?.itemInstanceId === itemId) {
    return state.player.equipment.armor;
  }

  for (const charm of state.player.equipment.charms) {
    if (charm?.itemInstanceId === itemId) {
      return charm;
    }
  }

  return null;
}

export async function driveRunToWin(
  page: Page,
  options: BotOptions = {}
): Promise<void> {
  ensurePageDiagnostics(page);
  const state = page.getByTestId("game-state");
  const policyState: BotPolicyState = {
    visitedByDepth: new Map<number, Set<string>>(),
    botMemory: createEmptyBotMemory(),
    rng: seededRandom(options.seed ?? resolveCampaignSeed()),
    log: options.log ?? console.log,
    lastActions: [],
    loopBreaker: emptyLoopBreakerState(),
    pickupLoopBreaker: emptyPickupLoopBreakerState(),
    failedItemIds: new Set(),
    descendIntent: null,
    inventoryIndex: 0,
    lastAction: null,
    lastPolicyAction: null,
    lastViewDiagnostics: null
  };
  let turns = 0;
  let lastSignature = "";
  let stuckRepeats = 0;
  let lastProgressDepth = 0;
  let lastProgressVisitedCount = 0;
  let noProgressTurns = 0;
  let diagnosticsWritten = false;

  try {
    while (turns < MAX_TURN_CAP) {
      await settleUi(page);

      const shell = await readShellSnapshot(state);
      if (shell.screen !== "playing" && shell.terminalStatus === "LOSS") {
        const reason = runLostReason(
          shell,
          ensurePageDiagnostics(page).botState
        );
        await dumpStuckState(page, reason);
        diagnosticsWritten = true;
        throw new BotFailure("run lost", {
          shell,
          hud: await readHudSnapshot(page),
          player: null,
          gameStateAttributes: await readGameStateAttributes(page),
          recentLogLines: await readRecentLogLines(page),
          botState: ensurePageDiagnostics(page).botState,
          consoleMessages: ensurePageDiagnostics(page).consoleMessages,
          reason
        });
      }

      updateBotDiagnostics(page, shell, policyState, noProgressTurns);
      if (isTransitionActive(shell)) {
        const transition = await pollFloorTransition(page, state, shell);
        updateBotDiagnostics(page, transition.shell, policyState, noProgressTurns);
        if (transition.timedOut) {
          await dumpStuckState(page, "floor transition wedged");
          diagnosticsWritten = true;
          throw new Error("floor transition wedged");
        }

        stuckRepeats = 0;
        lastSignature = "";
        noProgressTurns = 0;
        clearDescendIntent(policyState);
        updateBotDiagnostics(page, transition.shell, policyState, noProgressTurns);
        continue;
      }

      if (shell.screen !== "playing") {
        if (shell.terminalStatus === "WIN") {
          return;
        }
        await dumpStuckState(page, "left playing screen before WIN");
        diagnosticsWritten = true;
        throw new BotFailure("left playing screen before WIN", {
          shell,
          hud: await readHudSnapshot(page),
          player: null,
          gameStateAttributes: await readGameStateAttributes(page),
          recentLogLines: await readRecentLogLines(page),
          botState: ensurePageDiagnostics(page).botState,
          consoleMessages: ensurePageDiagnostics(page).consoleMessages,
          reason: `screen=${shell.screen} terminal=${shell.terminalStatus}`
        });
      }

      if (shell.terminalStatus === "WIN") {
        return;
      }

      const beforeTurn = shell.turn;
      const decision = await choosePolicyKey(page, shell, policyState);
      recordAction(policyState, shell, decision);
      updateBotDiagnostics(page, shell, policyState, noProgressTurns);
      if (decision.inventoryExec !== undefined) {
        const inventoryOk = await executePolicyInventoryAction(
          page,
          decision.inventoryExec,
          policyState
        );
        if (!inventoryOk) {
          policyState.failedItemIds.add(decision.inventoryExec.itemId);
        }
      } else if (decision.keys.length === 0) {
        await waitForUiFrame(page);
      } else {
        await pressGameplayKeys(page, decision.keys);
      }

      let after = await readShellSnapshot(state);
      let waitedForTransition = false;
      if (isTransitionActive(after)) {
        const transition = await pollFloorTransition(page, state, after);
        updateBotDiagnostics(page, transition.shell, policyState, noProgressTurns);
        if (transition.timedOut) {
          await dumpStuckState(page, "floor transition wedged");
          diagnosticsWritten = true;
          throw new Error("floor transition wedged");
        }

        waitedForTransition = true;
        stuckRepeats = 0;
        lastSignature = "";
        noProgressTurns = 0;
        clearDescendIntent(policyState);
        after = transition.shell;
      }

      if (after.terminalStatus === "WIN") {
        updateBotDiagnostics(page, after, policyState, noProgressTurns);
        return;
      }

      if (after.screen !== "playing") {
        if (after.terminalStatus === "LOSS") {
          updateBotDiagnostics(page, shell, policyState, noProgressTurns);
          const reason = runLostReason(
            shell,
            ensurePageDiagnostics(page).botState
          );
          await dumpStuckState(page, reason);
          diagnosticsWritten = true;
          throw new BotFailure("run lost", {
            shell: after,
            hud: await readHudSnapshot(page),
            player: null,
            gameStateAttributes: await readGameStateAttributes(page),
            recentLogLines: await readRecentLogLines(page),
            botState: ensurePageDiagnostics(page).botState,
            consoleMessages: ensurePageDiagnostics(page).consoleMessages,
            reason
          });
        }

        updateBotDiagnostics(page, after, policyState, noProgressTurns);
        await dumpStuckState(page, "left playing screen after action before WIN");
        diagnosticsWritten = true;
        throw new BotFailure("left playing screen after action before WIN", {
          shell: after,
          hud: await readHudSnapshot(page),
          player: null,
          gameStateAttributes: await readGameStateAttributes(page),
          recentLogLines: await readRecentLogLines(page),
          botState: ensurePageDiagnostics(page).botState,
          consoleMessages: ensurePageDiagnostics(page).consoleMessages,
          reason: `screen=${after.screen} terminal=${after.terminalStatus}`
        });
      }

      if (after.turn === beforeTurn && after.screen === "playing") {
        if (waitedForTransition) {
          updateBotDiagnostics(page, after, policyState, noProgressTurns);
          continue;
        }

        const signature = await progressSignature(page, after);
        stuckRepeats = signature === lastSignature ? stuckRepeats + 1 : 0;
        lastSignature = signature;
        updateBotDiagnostics(page, after, policyState, noProgressTurns);
        if (stuckRepeats >= NO_PROGRESS_REPEAT_CAP) {
          await dumpStuckState(
            page,
            `no turn progress for ${NO_PROGRESS_REPEAT_CAP} identical states`
          );
          diagnosticsWritten = true;
          throw new Error("bot stuck: no turn progress");
        }
        continue;
      }

      stuckRepeats = 0;
      lastSignature = "";
      turns += 1;
      await markPlayerVisitedFromPage(page, after.depth, policyState);
      if (decision.policyAction === "pickup") {
        const player = await readPlayerPosition(page);
        if (player !== null) {
          policyState.pickupLoopBreaker = recordPickupForLoopBreaker(
            policyState.pickupLoopBreaker,
            player,
            after.turn,
            policyState.log
          );
        }
      }

      const visitedCount = visitedCountForDepth(policyState, after.depth);
      const depthChanged = after.depth !== shell.depth;
      if (depthChanged) {
        clearDescendIntent(policyState);
      }

      const madeProgress =
        depthChanged ||
        after.depth !== lastProgressDepth ||
        visitedCount > lastProgressVisitedCount;
      if (madeProgress) {
        lastProgressDepth = after.depth;
        lastProgressVisitedCount = visitedCount;
        noProgressTurns = 0;
      } else {
        noProgressTurns += Math.max(1, after.turn - beforeTurn);
      }

      updateBotDiagnostics(page, after, policyState, noProgressTurns);

      if (noProgressTurns >= NO_VISITED_PROGRESS_TURNS) {
        await dumpStuckState(
          page,
          `no exploration progress for ${noProgressTurns} game turns at depth ${after.depth}`
        );
        diagnosticsWritten = true;
        throw new Error(
          `bot stuck: no new visited cells for ${noProgressTurns} game turns at depth ${after.depth}`
        );
      }

      if (turns % TELEMETRY_INTERVAL_TURNS === 0) {
        await logTelemetry(page, after, policyState);
      }
    }

    const shell = await readShellSnapshot(state);
    updateBotDiagnostics(page, shell, policyState, noProgressTurns);
    await dumpStuckState(
      page,
      `turn cap ${MAX_TURN_CAP} exceeded at depth ${shell.depth}`
    );
    diagnosticsWritten = true;
    throw new Error(
      `bot exceeded turn cap (${MAX_TURN_CAP}) at depth ${shell.depth}`
    );
  } catch (error) {
    if (!diagnosticsWritten) {
      await dumpStuckState(
        page,
        `driveRunToWin error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    throw error;
  }
}

function runLostReason(
  shell: ShellSnapshot,
  botState: BotStateSnapshot
): string {
  const depth = botState.depth ?? shell.depth;
  const turn = botState.turn ?? shell.turn;
  return `run lost at depth ${depth} turn ${turn}`;
}

export async function dumpStuckState(
  page: Page,
  reason: string
): Promise<DiagnosticArtifactPaths> {
  const diagnostics = ensurePageDiagnostics(page);
  const dir = DIAGNOSTICS_DIR;
  await fs.mkdir(dir, { recursive: true });
  const stamp = `${Date.now()}-${slugForReason(reason)}`;
  const screenshotPath = path.join(dir, `fullclear-${stamp}.png`);
  const htmlPath = path.join(dir, `fullclear-${stamp}.html`);
  const consolePath = path.join(dir, `fullclear-${stamp}.console.json`);
  const statePath = path.join(dir, `fullclear-${stamp}.state.json`);
  const artifactErrors: string[] = [];
  const shell = await readShellSnapshot(page.getByTestId("game-state")).catch(
    () => unknownShellSnapshot()
  );
  const hud = await readHudSnapshot(page).catch(() => null);
  const player = await readPlayerPosition(page).catch(() => null);
  const gameStateAttributes = await readGameStateAttributes(page).catch(
    () => ({})
  );
  const recentLogLines = await readRecentLogLines(page).catch(() => []);
  const rawSerializedSnapshot = await readBotBridgeSerializedSnapshot(page).catch(
    (error) => {
      artifactErrors.push(`bot-state-bridge: ${errorMessage(error)}`);
      return null;
    }
  );

  await page.screenshot({
    path: screenshotPath,
    fullPage: true
  }).catch((error) => {
    artifactErrors.push(`screenshot: ${errorMessage(error)}`);
  });

  const html = await page.content().catch((error) => {
    artifactErrors.push(`html: ${errorMessage(error)}`);
    return "";
  });
  await fs.writeFile(htmlPath, html, "utf8");

  await fs.writeFile(
    consolePath,
    `${JSON.stringify(diagnostics.consoleMessages, null, 2)}\n`,
    "utf8"
  );

  const payload = {
    reason,
    shell,
    hud,
    player,
    gameStateAttributes,
    recentLogLines,
    rawSerializedSnapshot,
    botState: diagnostics.botState,
    consoleMessages: diagnostics.consoleMessages,
    artifactErrors,
    artifacts: {
      screenshot: screenshotPath,
      html: htmlPath,
      console: consolePath,
      state: statePath
    }
  };

  await fs.writeFile(
    statePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );

  return {
    screenshot: screenshotPath,
    html: htmlPath,
    console: consolePath,
    state: statePath
  };
}

async function settleUi(page: Page): Promise<void> {
  const state = page.getByTestId("game-state");
  const shell = await readShellSnapshot(state);

  if (shell.screen !== "playing") {
    return;
  }

  if (isTransitionActive(shell)) {
    return;
  }

  const transition = page.getByTestId("transition-overlay");
  if (await transition.isVisible().catch(() => false)) {
    return;
  }

  if (shell.panelMode === "dialogue") {
    await page.keyboard.press("Escape");
    await expect(state).toHaveAttribute("data-panel-mode", "inspect");
    return;
  }

  if (shell.panelMode !== "inspect") {
    await page.keyboard.press("Escape");
    await expect(state).toHaveAttribute("data-panel-mode", "inspect");
    return;
  }

  if (shell.diaryOpen) {
    await page.keyboard.press("Tab");
    await expect(state).toHaveAttribute("data-diary-open", "false");
  }

  const confirm = page.locator('[data-confirm-prompt="true"]');
  if (await confirm.isVisible().catch(() => false)) {
    const text = (await confirm.textContent()) ?? "";
    if (text.toLowerCase().includes("descend")) {
      await page.keyboard.press("y");
    } else {
      await page.keyboard.press("n");
    }
  }

  await expect(state).toHaveAttribute("data-input-locked", "false", {
    timeout: 30_000
  });
}

async function choosePolicyKey(
  page: Page,
  shell: ShellSnapshot,
  policyState: BotPolicyState
): Promise<BotDecision> {
  const serializedSnapshot = await readRequiredBotBridgeSerializedSnapshot(page);
  const construction = constructBrowserBotStateView(
    serializedSnapshot,
    policyState.botMemory
  );
  const { state: gameState, view } = construction;
  policyState.botMemory = construction.nextMemory;
  policyState.lastViewDiagnostics = construction.diagnostics;
  markVisited(policyState.visitedByDepth, shell.depth, gameState.player.position);

  const policyAction = constrainPolicyDecision(
    view,
    legalizePolicyDecision(view, balancedPolicy.decide(view)),
    gameState,
    policyState
  );
  const mapped = mapPolicyActionToKeys(gameState, policyAction, policyState);
  if (mapped !== null) {
    if (mapped.inventoryExec !== undefined) {
      return botDecision(
        [],
        mapped.action,
        policyAction,
        mapped.inventoryExec
      );
    }
    return botDecision(mapped.keys, mapped.action, policyAction);
  }

  const retry = requeryExpressiblePolicyAction(
    gameState,
    view,
    policyAction,
    policyState
  );
  await dumpUnsupportedPolicyAction(page, shell, policyAction, retry?.action ?? null);
  policyState.log(
    `[full-clear bot] unsupported policy action ${actionKey(
      policyAction
    )}; retry=${retry === null ? "none" : actionKey(retry.action)}`
  );

  if (retry !== null) {
    return botDecision(retry.keys, retry.actionLabel, retry.action);
  }

  return botDecision(["."], "policy-fallback:wait", policyAction);
}

export function constructBrowserBotStateView(
  serializedSnapshot: string,
  memory: BotMemory
): BrowserBotViewConstruction {
  const state = deserialize(serializedSnapshot);
  const view = createBotStateView(state, {
    policyName: balancedPolicy.name,
    memory
  });

  return {
    state,
    view,
    nextMemory: updateBotMemory(memory, view),
    diagnostics: browserBotViewDiagnostics(state, view)
  };
}

function browserBotViewDiagnostics(
  state: GameState,
  view: BotStateView
): BrowserBotViewDiagnostics {
  const hp = view.player.hp;

  return {
    adjacentEnemyCount: view.visible.enemies.filter((enemy) =>
      positionsAdjacent(view.player.position, enemy.position)
    ).length,
    visibleEnemyCount: view.visible.enemies.length,
    inventoryCount: view.player.inventory.length,
    equipmentCount:
      (view.player.equipment.weapon === null ? 0 : 1) +
      (view.player.equipment.armor === null ? 0 : 1) +
      view.player.equipment.charms.length,
    hp: {
      current: hp.current,
      max: hp.max,
      ratio: hp.ratio
    },
    playerLevel: view.player.level,
    playerXp: state.player.xp,
    mapCellCount: view.map.cells.length,
    visibleMapCellCount: view.map.cells.filter(
      (cell) => cell.visibility === "visible"
    ).length,
    rememberedMapCellCount: view.map.cells.filter(
      (cell) => cell.visibility === "remembered"
    ).length,
    serializedEntityCount: Object.keys(state.entities).length,
    serializedInventorySlotCount: state.player.inventory.length,
    serializedCarriedInventoryCount: state.player.inventory.filter(
      (slot) => slot !== null
    ).length,
    serializedEquipmentCount:
      (state.player.equipment.weapon === null ? 0 : 1) +
      (state.player.equipment.armor === null ? 0 : 1) +
      state.player.equipment.charms.filter((slot) => slot !== null).length,
    serializedFog: serializedFogDiagnostics(state),
    availableActionKinds: uniqueSorted(
      view.availableActions.map((action) => action.kind)
    )
  };
}

function serializedFogDiagnostics(
  state: GameState
): BrowserBotViewDiagnostics["serializedFog"] {
  const opaque = state.floor.geometry.opaque;
  const fog =
    opaque !== null && typeof opaque === "object" && "fog" in opaque
      ? (opaque as { readonly fog?: unknown }).fog
      : undefined;

  if (fog === undefined || fog === null || typeof fog !== "object") {
    return {
      present: false,
      visible: 0,
      remembered: 0,
      unseen: 0
    };
  }

  const tiles = (fog as { readonly tiles?: unknown }).tiles;
  if (!Array.isArray(tiles)) {
    return {
      present: false,
      visible: 0,
      remembered: 0,
      unseen: 0
    };
  }

  let visible = 0;
  let remembered = 0;
  let unseen = 0;
  for (const tile of tiles) {
    const stateValue =
      tile !== null && typeof tile === "object" && "state" in tile
        ? (tile as { readonly state?: unknown }).state
        : undefined;
    if (stateValue === "visible") {
      visible += 1;
    } else if (stateValue === "remembered") {
      remembered += 1;
    } else if (stateValue === "unseen") {
      unseen += 1;
    }
  }

  return {
    present: true,
    visible,
    remembered,
    unseen
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function positionsAdjacent(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number }
): boolean {
  return (
    Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) <= 1
  );
}

type UiActionMapping = {
  readonly keys: readonly string[];
  readonly action: string;
  readonly nextInventoryIndex: number;
  readonly inventoryExec?: InventoryExecRequest;
};

function constrainPolicyDecision(
  view: BotStateView,
  action: RunAction,
  state: GameState,
  policyState: BotPolicyState
): RunAction {
  if (
    action.kind === "use_item" &&
    policyState.failedItemIds.has(action.itemId)
  ) {
    const withoutFailed = {
      ...view,
      availableActions: view.availableActions.filter(
        (candidate) =>
          !(
            candidate.kind === "use_item" &&
            policyState.failedItemIds.has(candidate.itemId)
          )
      )
    };
    return legalizePolicyDecision(withoutFailed, balancedPolicy.decide(withoutFailed));
  }

  if (action.kind === "pickup") {
    const position = state.player.position;
    if (isPickupBlacklisted(policyState.pickupLoopBreaker, position)) {
      const withoutPickup = {
        ...view,
        availableActions: view.availableActions.filter(
          (candidate) => candidate.kind !== "pickup"
        )
      };
      return legalizePolicyDecision(
        withoutPickup,
        balancedPolicy.decide(withoutPickup)
      );
    }
  }

  return action;
}

type RequeriedAction = {
  readonly action: RunAction;
  readonly actionLabel: string;
  readonly keys: readonly string[];
};

async function readBotBridgeSerializedSnapshot(
  page: Page
): Promise<string | null> {
  return page.evaluate(() => {
    const bridgeWindow = window as Window & {
      readonly __GG_BOT_STATE__?: unknown;
    };
    return typeof bridgeWindow.__GG_BOT_STATE__ === "string"
      ? bridgeWindow.__GG_BOT_STATE__
      : null;
  });
}

async function readRequiredBotBridgeSerializedSnapshot(
  page: Page
): Promise<string> {
  const serialized = await readBotBridgeSerializedSnapshot(page);
  if (serialized === null) {
    throw new Error("bot state bridge unavailable");
  }

  return serialized;
}

const legalizePolicyDecision = (
  view: BotStateView,
  action: RunAction
): RunAction => (hasAction(view, action) ? action : fallbackAction(view));

function mapPolicyActionToKeys(
  state: GameState,
  action: RunAction,
  policyState: BotPolicyState
): UiActionMapping | null {
  const mapping = keySequenceForAction(
    state,
    action,
    policyState.inventoryIndex
  );
  if (mapping !== null) {
    policyState.inventoryIndex = mapping.nextInventoryIndex;
  }
  return mapping;
}

function requeryExpressiblePolicyAction(
  state: GameState,
  view: BotStateView,
  unsupportedAction: RunAction,
  policyState: BotPolicyState
): RequeriedAction | null {
  const unsupportedKey = actionKey(unsupportedAction);
  const constrainedView: BotStateView = {
    ...view,
    availableActions: view.availableActions.filter(
      (candidate) =>
        actionKey(candidate) !== unsupportedKey &&
        keySequenceForAction(state, candidate, policyState.inventoryIndex) !== null
    )
  };

  if (constrainedView.availableActions.length === 0) {
    return null;
  }

  const retryAction = legalizePolicyDecision(
    constrainedView,
    balancedPolicy.decide(constrainedView)
  );
  const retryMapping = mapPolicyActionToKeys(state, retryAction, policyState);
  if (retryMapping === null) {
    return null;
  }

  return {
    action: retryAction,
    actionLabel: `policy-requery:${retryMapping.action}`,
    keys: retryMapping.keys
  };
}

function keySequenceForAction(
  state: GameState,
  action: RunAction,
  inventoryIndex: number
): UiActionMapping | null {
  switch (action.kind) {
    case "move":
      return actionMapping([DIRECTION_KEYS[action.direction]], action, inventoryIndex);
    case "attack":
      return attackActionMapping(state, action, inventoryIndex);
    case "pickup":
      return actionMapping(["g"], action, inventoryIndex);
    case "wait":
      return actionMapping(["."], action, inventoryIndex);
    case "descend":
      return actionMapping([">"], action, inventoryIndex);
    case "take_hoard":
      return actionMapping(["T"], action, inventoryIndex);
    case "use_item":
      return useItemActionMapping(state, action, inventoryIndex);
    case "abort":
      return actionMapping(["Escape", "y"], action, inventoryIndex);
    case "inspect":
    case "talk":
      return null;
  }
}

function actionMapping(
  keys: readonly string[],
  action: RunAction,
  inventoryIndex: number
): UiActionMapping {
  return {
    keys,
    action: `policy:${actionKey(action)}`,
    nextInventoryIndex: inventoryIndex
  };
}

function attackActionMapping(
  state: GameState,
  action: Extract<RunAction, { readonly kind: "attack" }>,
  inventoryIndex: number
): UiActionMapping | null {
  const target = state.entities[action.targetId];
  if (target === undefined || target.kind !== "enemy") {
    return null;
  }

  const direction = directionBetweenPositions(state.player.position, target.position);
  return direction === null
    ? null
    : actionMapping([DIRECTION_KEYS[direction]], action, inventoryIndex);
}

function useItemActionMapping(
  state: GameState,
  action: Extract<RunAction, { readonly kind: "use_item" }>,
  inventoryIndex: number
): UiActionMapping | null {
  if (resolveItemEntryIndex(state, action.itemId) === null) {
    return null;
  }

  return {
    keys: [],
    action: `policy:${actionKey(action)}`,
    nextInventoryIndex: inventoryIndex,
    inventoryExec: {
      itemId: action.itemId,
      direction: action.direction
    }
  };
}

function directionBetweenPositions(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number }
): Direction | null {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx === 0 && dy === 0) {
    return null;
  }
  if (Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1) {
    return null;
  }
  return deltaToDirection(dx, dy);
}

async function dumpUnsupportedPolicyAction(
  page: Page,
  shell: ShellSnapshot,
  unsupportedAction: RunAction,
  retryAction: RunAction | null
): Promise<void> {
  const dir = DIAGNOSTICS_DIR;
  await fs.mkdir(dir, { recursive: true });
  const statePath = path.join(
    dir,
    `policy-unsupported-${Date.now()}-${shell.depth}-${shell.turn}.json`
  );
  const payload = {
    shell,
    unsupportedAction,
    retryAction,
    rawSerializedSnapshot: await readBotBridgeSerializedSnapshot(page).catch(
      () => null
    ),
    gameStateAttributes: await readGameStateAttributes(page).catch(() => ({})),
    recentLogLines: await readRecentLogLines(page).catch(() => [])
  };

  await fs.writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function logTelemetry(
  page: Page,
  shell: ShellSnapshot,
  policyState: BotPolicyState
): Promise<void> {
  const cells = await readGridCells(page);
  const player = findPlayer(cells);
  if (player !== null) {
    markVisited(policyState.visitedByDepth, shell.depth, player);
  }

  const walkable = knownWalkableKeys(cells);
  const visited = policyState.visitedByDepth.get(shell.depth) ?? new Set();
  const visitedKnownCount = [...visited].filter((key) =>
    walkable.has(key)
  ).length;
  const visitedPercent =
    walkable.size === 0
      ? 0
      : Math.min(100, (visitedKnownCount / walkable.size) * 100);
  const viewDiagnostics = policyState.lastViewDiagnostics;
  const hp =
    viewDiagnostics === null
      ? "unknown"
      : `${viewDiagnostics.hp.current}/${viewDiagnostics.hp.max}`;
  const adjacentEnemyCount =
    viewDiagnostics === null
      ? "unknown"
      : String(viewDiagnostics.adjacentEnemyCount);
  const inventoryCount =
    viewDiagnostics === null ? "unknown" : String(viewDiagnostics.inventoryCount);
  const lastAction = policyState.lastAction ?? "none";
  const lastPolicyAction = policyState.lastPolicyAction ?? "none";

  policyState.log(
    `[full-clear bot] depth=${shell.depth} turn=${shell.turn} visited=${visitedPercent.toFixed(
      1
    )}% hp=${hp} adjacentEnemyCount=${adjacentEnemyCount} inventoryCount=${inventoryCount} policy=${lastPolicyAction} lastAction=${lastAction}`
  );
}

function botDecision(
  keys: readonly string[],
  action: string,
  policyAction: RunAction,
  inventoryExec?: InventoryExecRequest
): BotDecision {
  return {
    keys,
    action,
    policyAction: actionKey(policyAction),
    inventoryExec
  };
}

function recordAction(
  policyState: BotPolicyState,
  shell: ShellSnapshot,
  decision: BotDecision
): void {
  const renderedKeys =
    decision.keys.length === 0 ? "none" : decision.keys.join(",");
  const entry = `d${shell.depth} t${shell.turn} ${decision.action} policy=${decision.policyAction} keys=${renderedKeys}`;
  policyState.lastAction = decision.action;
  policyState.lastPolicyAction = decision.policyAction;
  policyState.lastActions.push(entry);
  if (policyState.lastActions.length > ACTION_HISTORY_LIMIT) {
    policyState.lastActions.splice(
      0,
      policyState.lastActions.length - ACTION_HISTORY_LIMIT
    );
  }
}

async function markPlayerVisitedFromPage(
  page: Page,
  depth: number,
  policyState: BotPolicyState
): Promise<void> {
  const player = await readPlayerPosition(page);
  if (player !== null) {
    markVisited(policyState.visitedByDepth, depth, player);
  }
}

function updateBotDiagnostics(
  page: Page,
  shell: ShellSnapshot,
  policyState: BotPolicyState,
  noProgressTurns: number
): void {
  const diagnostics = ensurePageDiagnostics(page);
  diagnostics.botState = {
    depth: shell.depth,
    turn: shell.turn,
    visitedCount: visitedCountForDepth(policyState, shell.depth),
    lastAction: policyState.lastAction,
    lastPolicyAction: policyState.lastPolicyAction,
    lastViewDiagnostics: policyState.lastViewDiagnostics,
    last20Actions: [...policyState.lastActions],
    noProgressTurns
  };
}

async function updateLoopBreaker(
  page: Page,
  shell: ShellSnapshot,
  policyState: BotPolicyState,
  cells: readonly GridCell[],
  player: GridPosition,
  hud: HudSnapshot | null
): Promise<void> {
  const signature = JSON.stringify({
    depth: shell.depth,
    player,
    hp: hud === null ? null : `${hud.hpCurrent}/${hud.hpMax}`,
    enemies: visibleEnemyKeys(cells),
    logTail: (await readRecentLogLines(page)).slice(-4)
  });
  const previous = policyState.loopBreaker;
  const action = policyState.lastAction;
  const repeated =
    action !== null &&
    action === previous.previousAction &&
    signature === previous.previousSignature;
  const repeatCount = repeated ? previous.repeatCount + 1 : 0;
  const activeAvoid =
    previous.avoidEnemyKey !== null &&
    shell.turn <= previous.avoidUntilTurn &&
    enemyStillVisible(cells, previous.avoidEnemyKey)
      ? {
          avoidEnemyKey: previous.avoidEnemyKey,
          avoidUntilTurn: previous.avoidUntilTurn
        }
      : {
          avoidEnemyKey: null,
          avoidUntilTurn: 0
        };
  const attackTarget = action === null ? null : attackTargetKey(action);

  if (
    repeatCount >= NO_OBSERVABLE_CHANGE_ACTION_CAP &&
    attackTarget !== null &&
    enemyStillVisible(cells, attackTarget)
  ) {
    policyState.log(
      `[full-clear bot] loop-breaker avoiding enemy ${attackTarget} after ${repeatCount} unchanged ${action} actions`
    );
    policyState.loopBreaker = {
      previousAction: action,
      previousSignature: signature,
      repeatCount: 0,
      avoidEnemyKey: attackTarget,
      avoidUntilTurn: shell.turn + LOOP_BREAK_AVOID_TURNS
    };
    return;
  }

  policyState.loopBreaker = {
    previousAction: action,
    previousSignature: signature,
    repeatCount,
    ...activeAvoid
  };
}

function blockedCellsForLoopBreak(
  policyState: BotPolicyState,
  shell: ShellSnapshot,
  cells: readonly GridCell[]
): ReadonlySet<string> {
  const avoidKey = policyState.loopBreaker.avoidEnemyKey;
  if (
    avoidKey === null ||
    shell.turn > policyState.loopBreaker.avoidUntilTurn ||
    !enemyStillVisible(cells, avoidKey)
  ) {
    return new Set();
  }

  return new Set([avoidKey]);
}

function attackTargetKey(action: string): string | null {
  const prefix = "attack-adjacent-enemy:";
  if (!action.startsWith(prefix)) {
    return null;
  }

  return action.slice(prefix.length);
}

function visibleEnemyKeys(cells: readonly GridCell[]): readonly string[] {
  return cells
    .filter((cell) => cell.layer === "enemy" && cell.fog === "visible")
    .map((cell) => posKey(cell.x, cell.y))
    .sort();
}

function visibleEnemyPositions(
  cells: readonly GridCell[]
): readonly GridPosition[] {
  return cells
    .filter((cell) => cell.layer === "enemy" && cell.fog === "visible")
    .map((cell) => ({ x: cell.x, y: cell.y }));
}

function enemyAdjacentKeys(cells: readonly GridCell[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const enemy of visibleEnemyPositions(cells)) {
    for (const neighbor of neighbors(enemy)) {
      keys.add(posKey(neighbor.x, neighbor.y));
    }
  }
  return keys;
}

function nearestEnemyDistance(
  position: GridPosition,
  enemies: readonly GridPosition[]
): number {
  return Math.min(
    ...enemies.map((enemy) => chebyshev(position, enemy))
  );
}

function enemyStillVisible(cells: readonly GridCell[], key: string): boolean {
  return visibleEnemyKeys(cells).includes(key);
}

function visitedCountForDepth(
  policyState: BotPolicyState,
  depth: number
): number {
  return policyState.visitedByDepth.get(depth)?.size ?? 0;
}

function resetDescendIntentIfStairsVisitChanged(
  policyState: BotPolicyState,
  shell: ShellSnapshot,
  cells: readonly GridCell[],
  player: GridPosition
): void {
  const pending = policyState.descendIntent;
  if (pending === null) {
    return;
  }

  if (
    pending.depth !== shell.depth ||
    !isOnStairs(cells, player) ||
    pending.stairsKey !== posKey(player.x, player.y)
  ) {
    clearDescendIntent(policyState);
  }
}

function hasPendingDescendIntent(
  policyState: BotPolicyState,
  depth: number,
  stairsKey: string
): boolean {
  const pending = policyState.descendIntent;
  return (
    pending !== null &&
    pending.depth === depth &&
    pending.stairsKey === stairsKey
  );
}

function clearDescendIntent(policyState: BotPolicyState): void {
  policyState.descendIntent = null;
}

async function tryHeal(page: Page): Promise<boolean> {
  const state = page.getByTestId("game-state");
  const shell = await readShellSnapshot(state);
  if (shell.screen !== "playing") {
    return false;
  }

  if (shell.panelMode !== "inventory") {
    await page.keyboard.press("i");
    await expect(state).toHaveAttribute("data-panel-mode", "inventory");
  }

  const panel = page.getByTestId("inventory-panel");
  const slots = panel.locator("[data-inventory-slot]");
  const count = await slots.count();
  let emergencyDraughtIndex: number | null = null;

  for (let index = 0; index < count; index += 1) {
    const slot = slots.nth(index);
    const label = ((await slot.textContent()) ?? "").toLowerCase();
    if (label.includes("empty") || label.trim().length === 0) {
      continue;
    }

    await slot.click();
    await waitForUiFrame(page);
    const selectedText = ((await panel.textContent()) ?? "").toLowerCase();
    const quaff = panel.locator('[data-action-id="quaff"]:not([disabled])');
    if (await quaff.isVisible().catch(() => false)) {
      if (isKnownHealingInventoryText(selectedText)) {
        await page.keyboard.press("Enter");
        return finishInventoryItemUse(page, state);
      }

      if (
        emergencyDraughtIndex === null &&
        isPossibleHealingDraughtText(selectedText)
      ) {
        emergencyDraughtIndex = index;
      }
    }

    const use = panel.locator('[data-action-id="use"]:not([disabled])');
    if (
      (await use.isVisible().catch(() => false)) &&
      isKnownHealingInventoryText(selectedText)
    ) {
      await page.keyboard.press("Enter");
      return finishInventoryItemUse(page, state);
    }
  }

  if (emergencyDraughtIndex !== null) {
    await slots.nth(emergencyDraughtIndex).click();
    await waitForUiFrame(page);
    await page.keyboard.press("Enter");
    return finishInventoryItemUse(page, state);
  }

  await closeInventoryPanel(page, state);
  return false;
}

function isKnownHealingInventoryText(text: string): boolean {
  return text.includes("heal") || text.includes("sour cordial");
}

function isPossibleHealingDraughtText(text: string): boolean {
  if (!text.includes("draught") && !text.includes("cordial")) {
    return false;
  }

  return !text.includes("cure_status");
}

async function finishInventoryItemUse(
  page: Page,
  state: Locator
): Promise<boolean> {
  await waitForUiFrame(page);
  await closeInventoryPanel(page, state);
  return true;
}

async function executePolicyInventoryAction(
  page: Page,
  request: InventoryExecRequest,
  policyState: BotPolicyState
): Promise<boolean> {
  const stateLocator = page.getByTestId("game-state");
  const beforeSerialized = await readRequiredBotBridgeSerializedSnapshot(page);
  const beforeState = deserialize(beforeSerialized);

  if (resolveItemEntryIndex(beforeState, request.itemId) === null) {
    policyState.log(
      `[full-clear bot] inventory action skipped: item ${request.itemId} not in pack`
    );
    return false;
  }

  await page.keyboard.press("i");
  await expect(stateLocator).toHaveAttribute("data-panel-mode", "inventory");

  const panel = page.getByTestId("inventory-panel");
  await expect(panel).toBeVisible();

  const domState = await readInventoryDomState(page);
  const targetIndex = resolveItemEntryIndex(beforeState, request.itemId);
  if (targetIndex === null) {
    await closeInventoryPanel(page, stateLocator);
    return false;
  }

  const targetRow = domState.rows[targetIndex];
  if (targetRow === undefined || targetRow.empty) {
    await dumpInventoryActionFailure(
      page,
      request,
      `target row ${targetIndex} empty in DOM`
    );
    await closeInventoryPanel(page, stateLocator);
    return false;
  }

  for (const key of inventoryNavigationKeys(
    domState.selectedIndex,
    targetIndex,
    domState.entryCount
  )) {
    await pressGameplayKey(page, key);
  }

  await waitForUiFrame(page);
  const actionIds = await readInventoryActionIds(page);
  const preferredActionId = selectPreferredInventoryActionId(actionIds);
  if (preferredActionId === null) {
    await dumpInventoryActionFailure(
      page,
      request,
      `no preferred action among [${actionIds.join(", ")}]`
    );
    await closeInventoryPanel(page, stateLocator);
    return false;
  }

  const actionIndex = actionIds.indexOf(preferredActionId);
  if (actionIndex < 0) {
    await closeInventoryPanel(page, stateLocator);
    return false;
  }

  if (preferredActionId === "throw") {
    await dumpInventoryActionFailure(page, request, "throw action not supported");
    await closeInventoryPanel(page, stateLocator);
    return false;
  }

  const actionNumberKey = String(actionIndex + 1);
  await pressGameplayKey(page, actionNumberKey);

  if (request.direction !== undefined) {
    await pressGameplayKey(page, DIRECTION_KEYS[request.direction]);
  }

  await waitForUiFrame(page);
  await closeInventoryPanel(page, stateLocator);

  const afterSerialized = await readBotBridgeSerializedSnapshot(page);
  if (afterSerialized === null) {
    return false;
  }

  const afterState = deserialize(afterSerialized);
  const succeeded = verifyInventoryItemActionSucceeded(
    beforeState,
    afterState,
    request.itemId
  );

  if (!succeeded) {
    await dumpInventoryActionFailure(
      page,
      request,
      `item ${request.itemId} still present after ${preferredActionId}`
    );
    return false;
  }

  policyState.inventoryIndex = targetIndex;
  return true;
}

type InventoryDomRow = {
  readonly index: number;
  readonly empty: boolean;
  readonly label: string;
  readonly selected: boolean;
};

type InventoryDomState = {
  readonly entryCount: number;
  readonly selectedIndex: number;
  readonly rows: readonly InventoryDomRow[];
};

async function readInventoryDomState(page: Page): Promise<InventoryDomState> {
  return page.getByTestId("inventory-panel").evaluate((panel) => {
    const slotNodes = [...panel.querySelectorAll("[data-inventory-slot]")];
    const equipmentNodes = [...panel.querySelectorAll("[data-equipment-slot]")];
    const slotRows = slotNodes.map((node, index) => ({
      index,
      empty: (node.textContent ?? "").toLowerCase().includes("empty"),
      label: (node.textContent ?? "").trim(),
      selected: node.className.includes("border-gg-accent")
    }));
    const equipmentRows = equipmentNodes.map((node, offset) => ({
      index: slotRows.length + offset,
      empty: (node.textContent ?? "").trim().length === 0,
      label: (node.textContent ?? "").trim(),
      selected: node.className.includes("border-gg-accent")
    }));
    const rows = [...slotRows, ...equipmentRows];
    const selectedIndex = rows.findIndex((row) => row.selected);

    return {
      entryCount: rows.length,
      selectedIndex: selectedIndex < 0 ? 0 : selectedIndex,
      rows
    };
  });
}

async function readInventoryActionIds(page: Page): Promise<readonly string[]> {
  const panel = page.getByTestId("inventory-panel");
  return panel
    .locator('[data-action-id]:not([disabled])')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-action-id") ?? "")
        .filter((id) => id.length > 0)
    );
}

async function dumpInventoryActionFailure(
  page: Page,
  request: InventoryExecRequest,
  reason: string
): Promise<void> {
  const dir = DIAGNOSTICS_DIR;
  await fs.mkdir(dir, { recursive: true });
  const statePath = path.join(
    dir,
    `inventory-action-failed-${Date.now()}-${slugForReason(request.itemId)}.json`
  );
  const payload = {
    reason,
    request,
    domState: await readInventoryDomState(page).catch(() => null),
    actionIds: await readInventoryActionIds(page).catch(() => []),
    rawSerializedSnapshot: await readBotBridgeSerializedSnapshot(page).catch(
      () => null
    ),
    gameStateAttributes: await readGameStateAttributes(page).catch(() => ({})),
    recentLogLines: await readRecentLogLines(page).catch(() => [])
  };

  await fs.writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function closeInventoryPanel(page: Page, state: Locator): Promise<void> {
  const shell = await readShellSnapshot(state);
  if (shell.screen === "playing" && shell.panelMode === "inventory") {
    await page.keyboard.press("Escape");
    await expect(state).toHaveAttribute("data-panel-mode", "inspect");
  }
}

async function pressGameplayKeys(
  page: Page,
  keys: readonly string[]
): Promise<void> {
  for (const key of keys) {
    await pressGameplayKey(page, key);
  }
}

async function pressGameplayKey(page: Page, key: string): Promise<void> {
  const state = page.getByTestId("game-state");
  await expect(state).toHaveAttribute("data-input-locked", "false");
  await page.keyboard.press(key);
  await waitForUiFrame(page);
}

async function waitForUiFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      })
  );
}

async function pollFloorTransition(
  page: Page,
  state: Locator,
  startShell: ShellSnapshot
): Promise<FloorTransitionPollResult> {
  const startedAtMs = Date.now();
  let shell = startShell;

  while (true) {
    const depthChanged = shell.depth !== startShell.depth;
    const phaseCleared = !isTransitionActive(shell);
    if (depthChanged || phaseCleared) {
      return {
        timedOut: false,
        shell,
        depthChanged,
        phaseCleared
      };
    }

    if (Date.now() - startedAtMs >= FLOOR_TRANSITION_TIMEOUT_MS) {
      return {
        timedOut: true,
        shell
      };
    }

    await page.waitForTimeout(FLOOR_TRANSITION_POLL_MS);
    shell = await readShellSnapshot(state);
  }
}

function isTransitionActive(shell: ShellSnapshot): boolean {
  return shell.transitionPhase !== "none";
}

async function readShellSnapshot(state: Locator): Promise<ShellSnapshot> {
  return {
    screen: (await state.getAttribute("data-screen")) ?? "unknown",
    depth: Number.parseInt((await state.getAttribute("data-depth")) ?? "0", 10),
    turn: Number.parseInt((await state.getAttribute("data-turn")) ?? "0", 10),
    terminalStatus:
      (await state.getAttribute("data-terminal-status")) ?? "unknown",
    inputLocked: (await state.getAttribute("data-input-locked")) === "true",
    panelMode: (await state.getAttribute("data-panel-mode")) ?? "inspect",
    diaryOpen: (await state.getAttribute("data-diary-open")) === "true",
    transitionPhase:
      (await state.getAttribute("data-transition-phase")) ?? "none"
  };
}

async function readHudSnapshot(page: Page): Promise<HudSnapshot | null> {
  const meter = page.locator('[data-hud-field="hp"] [role="meter"]');
  if (!(await meter.isVisible().catch(() => false))) {
    return null;
  }

  const rawCurrent = await meter.getAttribute("aria-valuenow");
  const rawMax = await meter.getAttribute("aria-valuemax");
  const hpCurrent = Number.parseInt(rawCurrent ?? "", 10);
  const hpMax = Number.parseInt(rawMax ?? "", 10);
  if (!Number.isSafeInteger(hpCurrent) || !Number.isSafeInteger(hpMax)) {
    return null;
  }

  return {
    hpCurrent,
    hpMax,
    hpRatio: hpMax <= 0 ? 0 : hpCurrent / hpMax
  };
}

async function readGridCells(page: Page): Promise<readonly GridCell[]> {
  const grid = page.getByTestId("game-grid");
  if (!(await grid.isVisible().catch(() => false))) {
    return [];
  }

  const raw = await grid.locator("[data-x][data-y]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      x: Number.parseInt(node.getAttribute("data-x") ?? "", 10),
      y: Number.parseInt(node.getAttribute("data-y") ?? "", 10),
      glyph: node.getAttribute("data-glyph") ?? " ",
      terrain: node.getAttribute("data-terrain") ?? "",
      fog: node.getAttribute("data-fog") ?? "unseen",
      layer: node.getAttribute("data-layer") ?? "empty",
      featureKind: node.getAttribute("data-feature-kind") ?? "",
      featureId: node.getAttribute("data-feature-id") ?? "",
      hasItem: node.getAttribute("data-has-item") === "true"
    }))
  );

  return raw.flatMap((cell) => {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)) {
      return [];
    }

    if (
      cell.fog !== "visible" &&
      cell.fog !== "remembered" &&
      cell.fog !== "unseen"
    ) {
      return [];
    }

    return [
      {
        x: cell.x,
        y: cell.y,
        glyph: cell.glyph,
        terrain: cell.terrain,
        fog: cell.fog,
        layer: cell.layer,
        featureKind: cell.featureKind,
        featureId: cell.featureId,
        hasItem: cell.hasItem
      }
    ];
  });
}

async function readPlayerPosition(
  page: Page
): Promise<{ readonly x: number; readonly y: number } | null> {
  const cells = await readGridCells(page);
  return findPlayer(cells);
}

async function readRecentLogLines(page: Page): Promise<readonly string[]> {
  const log = page.getByTestId("message-log");
  if (!(await log.isVisible().catch(() => false))) {
    return [];
  }

  const lines = await log
    .locator("[data-log-line]")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-log-line") ?? "")
        .filter((line) => line.length > 0)
    );

  return lines.slice(-20);
}

async function readGameStateAttributes(
  page: Page
): Promise<Record<string, string>> {
  const state = page.getByTestId("game-state");
  return state.evaluate((node) =>
    [...node.attributes].reduce<Record<string, string>>((attributes, attr) => {
      attributes[attr.name] = attr.value;
      return attributes;
    }, {})
  );
}

function unknownShellSnapshot(): ShellSnapshot {
  return {
    screen: "unknown",
    depth: 0,
    turn: 0,
    terminalStatus: "unknown",
    inputLocked: false,
    panelMode: "inspect",
    diaryOpen: false,
    transitionPhase: "none"
  };
}

function slugForReason(reason: string): string {
  const slug = reason
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length === 0 ? "diagnostic" : slug;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findPlayer(
  cells: readonly GridCell[]
): { readonly x: number; readonly y: number } | null {
  const player = cells.find((cell) => cell.layer === "player");
  return player === undefined ? null : { x: player.x, y: player.y };
}

function findAdjacentEnemies(
  cells: readonly GridCell[],
  player: { readonly x: number; readonly y: number }
): GridPosition[] {
  const enemies: GridPosition[] = [];
  for (const cell of cells) {
    if (cell.layer !== "enemy" || cell.fog !== "visible") {
      continue;
    }
    if (chebyshev(player, cell) <= 1) {
      enemies.push({ x: cell.x, y: cell.y });
    }
  }
  return enemies;
}

function shouldUseHealingItem(
  hud: HudSnapshot,
  adjacentEnemyCount: number
): boolean {
  if (adjacentEnemyCount >= 2) {
    return hud.hpRatio <= 0.6;
  }

  if (adjacentEnemyCount === 1) {
    return hud.hpRatio <= 0.5;
  }

  return hud.hpRatio <= 0.45;
}

function shouldRetreat(
  hud: HudSnapshot,
  adjacentEnemyCount: number
): boolean {
  if (adjacentEnemyCount >= 2) {
    return hud.hpRatio <= 0.6;
  }

  return adjacentEnemyCount === 1 && hud.hpRatio <= 0.5;
}

function hasItemUnderfoot(
  cells: readonly GridCell[],
  player: { readonly x: number; readonly y: number }
): boolean {
  const cell = cells.find(
    (candidate) => candidate.x === player.x && candidate.y === player.y
  );
  return cell?.hasItem === true;
}

function isOnStairs(
  cells: readonly GridCell[],
  player: { readonly x: number; readonly y: number }
): boolean {
  const cell = cells.find(
    (candidate) => candidate.x === player.x && candidate.y === player.y
  );
  return cell?.terrain === "stairs_down";
}

function isOnHoard(
  cells: readonly GridCell[],
  player: { readonly x: number; readonly y: number }
): boolean {
  const cell = cells.find(
    (candidate) => candidate.x === player.x && candidate.y === player.y
  );
  return cell?.featureKind === "hoard";
}

function findTargetCells(
  cells: readonly GridCell[],
  predicate: (cell: GridCell) => boolean
): GridPosition[] {
  return cells
    .filter((cell) => cell.fog !== "unseen" && predicate(cell))
    .map((cell) => ({ x: cell.x, y: cell.y }));
}

function routeStep(
  player: GridPosition,
  targets: readonly GridPosition[],
  cells: readonly GridCell[],
  blockedCells: ReadonlySet<string> = new Set()
): string | null {
  if (targets.length === 0) {
    return null;
  }

  const targetKeys = new Set(
    targets.map((target) => posKey(target.x, target.y))
  );
  const safeWalkable = knownWalkableKeys(cells, { blockedCells });
  const cautiousWalkable = knownWalkableKeys(cells, {
    blockedCells,
    avoidEnemyAdjacency: true,
    allowedUnsafeCells: targetKeys
  });
  const safeRoute = preferCautiousRoute(
    bfsRoute(player, targets, safeWalkable),
    bfsRoute(player, targets, cautiousWalkable)
  );
  const route =
    safeRoute ??
    bfsRoute(
      player,
      targets,
      knownWalkableKeys(cells, { allowEnemyBlockers: true, blockedCells })
    );
  return routeToDirectionKey(player, route);
}

function frontierStep(
  player: GridPosition,
  cells: readonly GridCell[],
  visited: ReadonlySet<string>,
  blockedCells: ReadonlySet<string> = new Set()
): string | null {
  const cellMap = cellsByKey(cells);
  const safeWalkable = knownWalkableKeys(cells, { blockedCells });
  const cautiousWalkable = knownWalkableKeys(cells, {
    blockedCells,
    avoidEnemyAdjacency: true
  });
  const enemyRouteWalkable = knownWalkableKeys(cells, {
    allowEnemyBlockers: true,
    blockedCells
  });
  const frontierTarget = (position: GridPosition): boolean => {
    const key = posKey(position.x, position.y);
    const cell = cellMap.get(key);
    return (
      cell !== undefined && !visited.has(key) && isFrontierCell(cell, cellMap)
    );
  };
  const anyFrontierTarget = (position: GridPosition): boolean => {
    const key = posKey(position.x, position.y);
    const cell = cellMap.get(key);
    return key !== posKey(player.x, player.y) &&
      cell !== undefined &&
      isFrontierCell(cell, cellMap);
  };
  const unvisitedKnownTarget = (position: GridPosition): boolean => {
    const key = posKey(position.x, position.y);
    return (
      key !== posKey(player.x, player.y) &&
      !visited.has(key) &&
      cellMap.has(key)
    );
  };
  const routeToFrontier = preferredRouteToPredicate(
    player,
    safeWalkable,
    cautiousWalkable,
    frontierTarget
  );
  const route =
    routeToFrontier ??
    preferredRouteToPredicate(
      player,
      safeWalkable,
      cautiousWalkable,
      unvisitedKnownTarget
    ) ??
    preferredRouteToPredicate(
      player,
      safeWalkable,
      cautiousWalkable,
      anyFrontierTarget
    ) ??
    bfsRouteToPredicate(player, enemyRouteWalkable, frontierTarget) ??
    bfsRouteToPredicate(player, enemyRouteWalkable, unvisitedKnownTarget) ??
    bfsRouteToPredicate(player, enemyRouteWalkable, anyFrontierTarget);

  return routeToDirectionKey(player, route);
}

function retreatStep(
  player: GridPosition,
  cells: readonly GridCell[],
  blockedCells: ReadonlySet<string> = new Set()
): string | null {
  const enemies = visibleEnemyPositions(cells);
  if (enemies.length === 0) {
    return null;
  }

  const cellMap = cellsByKey(cells);
  const enemyAdjacent = enemyAdjacentKeys(cells);
  const currentDistance = nearestEnemyDistance(player, enemies);
  const candidates = DIRECTIONS.flatMap((direction) => {
    const delta = DIRECTION_DELTAS[direction];
    const destination = {
      x: player.x + delta.x,
      y: player.y + delta.y
    };
    const key = posKey(destination.x, destination.y);
    const cell = cellMap.get(key);
    if (
      cell === undefined ||
      !isWalkable(cell, { blockedCells }) ||
      blockedCells.has(key)
    ) {
      return [];
    }

    const distance = nearestEnemyDistance(destination, enemies);
    return [
      {
        key: DIRECTION_KEYS[direction],
        destination,
        distance,
        enemyAdjacent: enemyAdjacent.has(key)
      }
    ];
  });

  const safer = candidates
    .filter((candidate) => candidate.distance > currentDistance)
    .sort(compareRetreatCandidates);
  if (safer.length > 0) {
    return safer[0]!.key;
  }

  const notAdjacent = candidates
    .filter((candidate) => !candidate.enemyAdjacent)
    .sort(compareRetreatCandidates);
  if (notAdjacent.length > 0) {
    return notAdjacent[0]!.key;
  }

  const fallback = [...candidates].sort(compareRetreatCandidates);
  return fallback[0]?.key ?? null;
}

function compareRetreatCandidates(
  left: {
    readonly destination: GridPosition;
    readonly distance: number;
    readonly enemyAdjacent: boolean;
  },
  right: {
    readonly destination: GridPosition;
    readonly distance: number;
    readonly enemyAdjacent: boolean;
  }
): number {
  if (left.enemyAdjacent !== right.enemyAdjacent) {
    return left.enemyAdjacent ? 1 : -1;
  }

  if (left.distance !== right.distance) {
    return right.distance - left.distance;
  }

  return posKey(left.destination.x, left.destination.y).localeCompare(
    posKey(right.destination.x, right.destination.y)
  );
}

function boxedBreakKey(
  player: GridPosition,
  cells: readonly GridCell[],
  rng: () => number,
  blockedCells: ReadonlySet<string> = new Set()
): string {
  const cellMap = cellsByKey(cells);
  const candidates = DIRECTIONS.filter((direction) => {
    const delta = DIRECTION_DELTAS[direction];
    const cell = cellMap.get(posKey(player.x + delta.x, player.y + delta.y));
    return (
      cell !== undefined &&
      isWalkable(cell, { allowEnemyBlockers: true, blockedCells })
    );
  });

  if (candidates.length === 0) {
    return ".";
  }

  return DIRECTION_KEYS[seededChoice(candidates, rng)];
}

function bfsRoute(
  start: GridPosition,
  targets: readonly GridPosition[],
  walkable: ReadonlySet<string>
): GridPosition[] | null {
  const targetKeys = new Set(
    targets.map((target) => posKey(target.x, target.y))
  );
  return bfsRouteToPredicate(start, walkable, (position) =>
    targetKeys.has(posKey(position.x, position.y))
  );
}

function preferredRouteToPredicate(
  start: GridPosition,
  walkable: ReadonlySet<string>,
  cautiousWalkable: ReadonlySet<string>,
  target: (position: GridPosition) => boolean
): GridPosition[] | null {
  return preferCautiousRoute(
    bfsRouteToPredicate(start, walkable, target),
    bfsRouteToPredicate(start, cautiousWalkable, target)
  );
}

function preferCautiousRoute(
  route: GridPosition[] | null,
  cautiousRoute: GridPosition[] | null
): GridPosition[] | null {
  if (
    cautiousRoute !== null &&
    (route === null || cautiousRoute.length <= route.length)
  ) {
    return cautiousRoute;
  }

  return route;
}

function bfsRouteToPredicate(
  start: GridPosition,
  walkable: ReadonlySet<string>,
  target: (position: GridPosition) => boolean
): GridPosition[] | null {
  if (target(start)) {
    return [start];
  }

  const queue: GridPosition[][] = [[start]];
  const seen = new Set([posKey(start.x, start.y)]);

  while (queue.length > 0) {
    const route = queue.shift();
    if (route === undefined) {
      break;
    }

    const current = route[route.length - 1];
    if (current === undefined) {
      continue;
    }

    for (const neighbor of neighbors(current)) {
      const key = posKey(neighbor.x, neighbor.y);
      if (seen.has(key) || !walkable.has(key)) {
        continue;
      }

      const nextRoute = [...route, neighbor];
      if (target(neighbor)) {
        return nextRoute;
      }

      seen.add(key);
      queue.push(nextRoute);
    }
  }

  return null;
}

function routeToDirectionKey(
  player: GridPosition,
  route: readonly GridPosition[] | null
): string | null {
  const next = route?.[1];
  return next === undefined ? null : directionKeyBetween(player, next);
}

function knownWalkableKeys(
  cells: readonly GridCell[],
  options: WalkableOptions = {}
): Set<string> {
  const enemyAdjacent =
    options.avoidEnemyAdjacency === true ? enemyAdjacentKeys(cells) : null;
  return new Set(
    cells
      .filter((cell) => {
        if (!isWalkable(cell, options)) {
          return false;
        }

        const key = posKey(cell.x, cell.y);
        return (
          enemyAdjacent === null ||
          !enemyAdjacent.has(key) ||
          options.allowedUnsafeCells?.has(key) === true
        );
      })
      .map((cell) => posKey(cell.x, cell.y))
  );
}

function cellsByKey(cells: readonly GridCell[]): Map<string, GridCell> {
  return new Map(cells.map((cell) => [posKey(cell.x, cell.y), cell]));
}

function isFrontierCell(
  cell: GridCell,
  cellMap: ReadonlyMap<string, GridCell>
): boolean {
  if (!isWalkable(cell)) {
    return false;
  }

  return neighbors(cell).some((neighbor) => {
    const next = cellMap.get(posKey(neighbor.x, neighbor.y));
    return next?.fog === "unseen";
  });
}

function neighbors(position: GridPosition): GridPosition[] {
  return DIRECTIONS.map((direction) => {
    const delta = DIRECTION_DELTAS[direction];
    return {
      x: position.x + delta.x,
      y: position.y + delta.y
    };
  });
}

function directionKeyToward(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number }
): string {
  return directionKeyBetween(from, to);
}

function directionKeyBetween(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number }
): string {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const direction = deltaToDirection(dx, dy);
  return DIRECTION_KEYS[direction];
}

function deltaToDirection(dx: number, dy: number): Direction {
  if (dx === 0 && dy === -1) return "north";
  if (dx === 1 && dy === -1) return "northeast";
  if (dx === 1 && dy === 0) return "east";
  if (dx === 1 && dy === 1) return "southeast";
  if (dx === 0 && dy === 1) return "south";
  if (dx === -1 && dy === 1) return "southwest";
  if (dx === -1 && dy === 0) return "west";
  return "northwest";
}

function isWalkable(
  cell: GridCell,
  options: WalkableOptions = {}
): boolean {
  if (options.blockedCells?.has(posKey(cell.x, cell.y)) === true) {
    return false;
  }

  if (cell.fog === "unseen") {
    return false;
  }

  if (cell.layer === "npc") {
    return false;
  }

  if (cell.layer === "enemy" && options.allowEnemyBlockers !== true) {
    return false;
  }

  return WALKABLE_TERRAIN.has(cell.terrain);
}

function markVisited(
  visitedByDepth: Map<number, Set<string>>,
  depth: number,
  player: GridPosition
): void {
  const bucket = visitedByDepth.get(depth) ?? new Set<string>();
  bucket.add(posKey(player.x, player.y));
  visitedByDepth.set(depth, bucket);
}

function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

function chebyshev(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number }
): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

async function progressSignature(
  page: Page,
  shell: ShellSnapshot
): Promise<string> {
  const player = await readPlayerPosition(page);
  return JSON.stringify({
    depth: shell.depth,
    turn: shell.turn,
    panel: shell.panelMode,
    player
  });
}

function seededChoice<T>(items: readonly T[], rng: () => number): T {
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  const item = items[index];
  if (item === undefined) {
    throw new Error("cannot choose from an empty list");
  }
  return item;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

class BotFailure extends Error {
  constructor(
    message: string,
    readonly diagnosis: BotDiagnosis
  ) {
    super(message);
    this.name = "BotFailure";
  }
}

export function seedToTitleNowMs(seed: string): number {
  if (seed.startsWith("lantern-")) {
    const suffix = seed.slice("lantern-".length);
    const parsed = Number.parseInt(suffix, 36);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Number.parseInt("test", 36);
}

export function resolveCampaignSeed(): string {
  const fromEnv = process.env.SEED?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }

  return "fullclear-1";
}
