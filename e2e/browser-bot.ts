import { expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export const MAX_TURN_CAP = 3_000;
export const FINAL_DEPTH = 12;
const FLOOR_TRANSITION_TIMEOUT_MS = 90_000;
const FLOOR_TRANSITION_POLL_MS = 250;
const TELEMETRY_INTERVAL_TURNS = 250;
const NO_VISITED_PROGRESS_TURNS = 150;
const NO_PROGRESS_REPEAT_CAP = 24;
const NO_OBSERVABLE_CHANGE_ACTION_CAP = 12;
const LOOP_BREAK_AVOID_TURNS = 30;
const DIAGNOSTICS_DIR = path.join("test-results", "fullclear-diagnostics");
const ACTION_HISTORY_LIMIT = 20;
const MAX_CONSOLE_MESSAGES = 300;

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

type Direction =
  | "north"
  | "south"
  | "east"
  | "west"
  | "northeast"
  | "northwest"
  | "southeast"
  | "southwest";

type GridPosition = {
  readonly x: number;
  readonly y: number;
};

type BotOptions = {
  readonly seed?: string;
  readonly log?: (message: string) => void;
};

type BotDecision = {
  readonly key: string | null;
  readonly action: string;
};

type BotPolicyState = {
  readonly visitedByDepth: Map<number, Set<string>>;
  readonly rng: () => number;
  readonly log: (message: string) => void;
  readonly lastActions: string[];
  loopBreaker: LoopBreakerState;
  descendIntent: DescendIntentState | null;
  lastAction: string | null;
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

export async function driveRunToWin(
  page: Page,
  options: BotOptions = {}
): Promise<void> {
  ensurePageDiagnostics(page);
  const state = page.getByTestId("game-state");
  const policyState: BotPolicyState = {
    visitedByDepth: new Map<number, Set<string>>(),
    rng: seededRandom(options.seed ?? resolveCampaignSeed()),
    log: options.log ?? console.log,
    lastActions: [],
    loopBreaker: emptyLoopBreakerState(),
    descendIntent: null,
    lastAction: null
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
      if (decision.key === null) {
        await waitForUiFrame(page);
      } else {
        await pressGameplayKey(page, decision.key);
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
  const cells = await readGridCells(page);
  const player = findPlayer(cells);
  const hud = await readHudSnapshot(page);

  if (player === null) {
    return botDecision(".", "wait:player-not-found");
  }

  resetDescendIntentIfStairsVisitChanged(policyState, shell, cells, player);
  markVisited(policyState.visitedByDepth, shell.depth, player);
  await updateLoopBreaker(page, shell, policyState, cells, player, hud);
  const visited = policyState.visitedByDepth.get(shell.depth) ?? new Set();
  const blockedCells = blockedCellsForLoopBreak(policyState, shell, cells);

  const adjacentEnemies = findAdjacentEnemies(cells, player);
  const adjacentEnemy = adjacentEnemies.find(
    (enemy) => !blockedCells.has(posKey(enemy.x, enemy.y))
  ) ?? null;

  if (shell.depth >= FINAL_DEPTH && isOnHoard(cells, player)) {
    return botDecision("T", "take-hoard");
  }

  if (shell.depth < FINAL_DEPTH && isOnStairs(cells, player)) {
    const stairsKey = posKey(player.x, player.y);
    if (hasPendingDescendIntent(policyState, shell.depth, stairsKey)) {
      return botDecision(null, "wait:descend-pending");
    }

    policyState.descendIntent = { depth: shell.depth, stairsKey };
    return botDecision(">", "descend-on-stairs");
  }

  if (hud !== null && shouldUseHealingItem(hud, adjacentEnemies.length)) {
    const healed = await tryHeal(page);
    if (healed) {
      return botDecision(null, "use-healing-item");
    }
  }

  if (hud !== null && shouldRetreat(hud, adjacentEnemies.length)) {
    const retreat = retreatStep(player, cells, blockedCells);
    if (retreat !== null) {
      return botDecision(
        retreat,
        `retreat-from-enemies:${adjacentEnemies.length}`
      );
    }
  }

  if (adjacentEnemies.length === 0 && hasItemUnderfoot(cells, player)) {
    return botDecision("g", "pickup-underfoot");
  }

  if (shell.depth >= FINAL_DEPTH) {
    const hoard = findTargetCells(
      cells,
      (cell) => cell.featureKind === "hoard"
    );
    const hoardRoute = routeStep(player, hoard, cells, blockedCells);
    if (hoardRoute !== null) {
      return botDecision(hoardRoute, "route-to-hoard");
    }
  }

  if (shell.depth < FINAL_DEPTH) {
    const stairs = findTargetCells(
      cells,
      (cell) => cell.glyph === ">" || cell.terrain === "stairs_down"
    );
    const stairsRoute = routeStep(player, stairs, cells, blockedCells);
    if (stairsRoute !== null) {
      return botDecision(stairsRoute, "route-to-stairs");
    }
  }

  const exploreStep = frontierStep(player, cells, visited, blockedCells);
  if (exploreStep !== null) {
    return botDecision(exploreStep, "explore-frontier");
  }

  if (adjacentEnemy !== null) {
    return botDecision(
      directionKeyToward(player, adjacentEnemy),
      `attack-adjacent-enemy:${posKey(adjacentEnemy.x, adjacentEnemy.y)}`
    );
  }

  if (hasItemUnderfoot(cells, player)) {
    return botDecision("g", "pickup-underfoot");
  }

  return botDecision(
    boxedBreakKey(player, cells, policyState.rng, blockedCells),
    "boxed-break"
  );
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
  const hud = await readHudSnapshot(page);
  const hp = hud === null ? "unknown" : `${hud.hpCurrent}/${hud.hpMax}`;
  const lastAction = policyState.lastAction ?? "none";

  policyState.log(
    `[full-clear bot] depth=${shell.depth} turn=${shell.turn} visited=${visitedPercent.toFixed(
      1
    )}% hp=${hp} lastAction=${lastAction}`
  );
}

function botDecision(key: string | null, action: string): BotDecision {
  return { key, action };
}

function recordAction(
  policyState: BotPolicyState,
  shell: ShellSnapshot,
  decision: BotDecision
): void {
  const renderedKey = decision.key ?? "none";
  const entry = `d${shell.depth} t${shell.turn} ${decision.action} key=${renderedKey}`;
  policyState.lastAction = decision.action;
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

async function closeInventoryPanel(page: Page, state: Locator): Promise<void> {
  const shell = await readShellSnapshot(state);
  if (shell.screen === "playing" && shell.panelMode === "inventory") {
    await page.keyboard.press("Escape");
    await expect(state).toHaveAttribute("data-panel-mode", "inspect");
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
