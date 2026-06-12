import { expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

export const MAX_TURN_CAP = 3_000;
export const FINAL_DEPTH = 12;
const FLOOR_SETTLE_TIMEOUT_MS = 130_000;

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

const DIRECTION_KEYS: Record<Direction, string> = {
  north: "ArrowUp",
  south: "ArrowDown",
  west: "ArrowLeft",
  east: "ArrowRight",
  northwest: "y",
  northeast: "u",
  southwest: "b",
  southeast: "n",
};

const BLOCKED_TERRAIN = new Set(["wall", ""]);

export async function driveRunToWin(page: Page): Promise<void> {
  const state = page.getByTestId("game-state");
  const visitedByDepth = new Map<number, Set<string>>();
  let turns = 0;
  let lastSignature = "";
  let stuckRepeats = 0;

  while (turns < MAX_TURN_CAP) {
    await settleUi(page);

    const shell = await readShellSnapshot(state);
    if (shell.screen !== "playing") {
      if (shell.terminalStatus === "WIN") {
        return;
      }
      await dumpStuckState(page, "left playing screen before WIN");
      throw new BotFailure("left playing screen before WIN", {
        shell,
        hud: await readHudSnapshot(page),
        player: null,
        gameStateAttributes: await readGameStateAttributes(page),
        recentLogLines: await readRecentLogLines(page),
        reason: `screen=${shell.screen} terminal=${shell.terminalStatus}`,
      });
    }

    if (shell.terminalStatus === "WIN") {
      return;
    }

    const beforeTurn = shell.turn;
    const key = await choosePolicyKey(page, shell, visitedByDepth);
    if (key === null) {
      await waitForUiFrame(page);
    } else {
      await pressGameplayKey(page, key);
    }

    const after = await readShellSnapshot(state);
    if (after.turn === beforeTurn && after.screen === "playing") {
      const signature = await progressSignature(page, after);
      stuckRepeats = signature === lastSignature ? stuckRepeats + 1 : 0;
      lastSignature = signature;
      if (stuckRepeats >= 24) {
        await dumpStuckState(page, "no turn progress for 24 identical states");
        throw new Error("bot stuck: no turn progress");
      }
      continue;
    }

    stuckRepeats = 0;
    lastSignature = "";
    turns += 1;
  }

  await dumpStuckState(page, `turn cap ${MAX_TURN_CAP} exceeded`);
  throw new Error(`bot exceeded turn cap (${MAX_TURN_CAP})`);
}

export async function dumpStuckState(
  page: Page,
  reason: string,
): Promise<void> {
  const dir = path.join("test-results", "full-clear-stuck");
  await fs.mkdir(dir, { recursive: true });
  const stamp = Date.now();
  const shell = await readShellSnapshot(page.getByTestId("game-state"));
  const hud = await readHudSnapshot(page);
  const player = await readPlayerPosition(page);
  const gameStateAttributes = await readGameStateAttributes(page);
  const recentLogLines = await readRecentLogLines(page);

  await page.screenshot({
    path: path.join(dir, `stuck-${stamp}.png`),
    fullPage: true,
  });

  const payload = {
    reason,
    shell,
    hud,
    player,
    gameStateAttributes,
    recentLogLines,
  };

  await fs.writeFile(
    path.join(dir, `stuck-${stamp}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

async function settleUi(page: Page): Promise<void> {
  const state = page.getByTestId("game-state");
  const shell = await readShellSnapshot(state);

  if (shell.screen !== "playing") {
    return;
  }

  const transition = page.getByTestId("transition-overlay");
  if (await transition.isVisible().catch(() => false)) {
    const skipEnabled = await transition.getAttribute("data-skip-enabled");
    if (skipEnabled === "true") {
      await page.keyboard.press("Space");
    }
    await expect(state).toHaveAttribute("data-input-locked", "false", {
      timeout: FLOOR_SETTLE_TIMEOUT_MS,
    });
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
    timeout: 30_000,
  });
}

async function choosePolicyKey(
  page: Page,
  shell: ShellSnapshot,
  visitedByDepth: Map<number, Set<string>>,
): Promise<string | null> {
  const cells = await readGridCells(page);
  const player = findPlayer(cells);
  const hud = await readHudSnapshot(page);

  if (player === null) {
    return ".";
  }

  markVisited(visitedByDepth, shell.depth, player);

  const adjacentEnemy = findAdjacentEnemy(cells, player);
  if (adjacentEnemy !== null) {
    return directionKeyToward(player, adjacentEnemy);
  }

  if (hasItemUnderfoot(cells, player)) {
    return "g";
  }

  if (hud !== null && hud.hpRatio <= 0.45) {
    const healed = await tryHeal(page);
    if (healed) {
      return null;
    }
  }

  if (shell.depth >= FINAL_DEPTH) {
    if (isOnHoard(cells, player)) {
      return "t";
    }

    const hoard = findTargetCells(
      cells,
      (cell) => cell.featureKind === "hoard",
    );
    const hoardRoute = greedyStep(
      player,
      hoard,
      cells,
      visitedByDepth.get(shell.depth),
    );
    if (hoardRoute !== null) {
      return hoardRoute;
    }
  }

  if (isOnStairs(cells, player)) {
    return ">";
  }

  const stairs = findTargetCells(
    cells,
    (cell) => cell.glyph === ">" || cell.terrain === "stairs_down",
  );
  const stairsRoute = greedyStep(player, stairs, cells, visitedByDepth.get(shell.depth));
  if (stairsRoute !== null) {
    return stairsRoute;
  }

  const exploreTarget = findExploreTarget(cells, visitedByDepth.get(shell.depth) ?? new Set());
  const exploreStep = greedyStep(player, exploreTarget, cells, visitedByDepth.get(shell.depth));
  if (exploreStep !== null) {
    return exploreStep;
  }

  if (shell.depth >= FINAL_DEPTH) {
    return "t";
  }

  return ".";
}

async function tryHeal(page: Page): Promise<boolean> {
  const state = page.getByTestId("game-state");
  const shell = await readShellSnapshot(state);
  if (shell.panelMode !== "inspect") {
    await page.keyboard.press("i");
    await expect(state).toHaveAttribute("data-panel-mode", "inventory");
  }

  const panel = page.getByTestId("inventory-panel");
  const slots = panel.locator("[data-inventory-slot]");
  const count = await slots.count();
  for (let index = 0; index < count; index += 1) {
    const slot = slots.nth(index);
    const label = ((await slot.textContent()) ?? "").toLowerCase();
    if (label.includes("empty") || label.trim().length === 0) {
      continue;
    }

    await slot.click();
    const quaff = panel.locator('[data-action-id="quaff"]:not([disabled])');
    if (await quaff.isVisible().catch(() => false)) {
      await quaff.click();
      await page.keyboard.press("i");
      await expect(state).toHaveAttribute("data-panel-mode", "inspect");
      return true;
    }

    const use = panel.locator('[data-action-id="use"]:not([disabled])');
    if (await use.isVisible().catch(() => false)) {
      await use.click();
      await page.keyboard.press("i");
      await expect(state).toHaveAttribute("data-panel-mode", "inspect");
      return true;
    }
  }

  await page.keyboard.press("i");
  await expect(state).toHaveAttribute("data-panel-mode", "inspect");
  return false;
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
      }),
  );
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
      (await state.getAttribute("data-transition-phase")) ?? "none",
  };
}

async function readHudSnapshot(page: Page): Promise<HudSnapshot | null> {
  const meter = page.locator('[data-hud-field="hp"] .value');
  if (!(await meter.isVisible().catch(() => false))) {
    return null;
  }

  const text = ((await meter.textContent()) ?? "").trim();
  const match = /^(\d+)\/(\d+)$/.exec(text);
  if (match === null) {
    return null;
  }

  const hpCurrent = Number.parseInt(match[1] ?? "0", 10);
  const hpMax = Number.parseInt(match[2] ?? "1", 10);
  return {
    hpCurrent,
    hpMax,
    hpRatio: hpMax <= 0 ? 0 : hpCurrent / hpMax,
  };
}

async function readGridCells(page: Page): Promise<readonly GridCell[]> {
  const grid = page.getByTestId("game-grid");
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
      hasItem: node.getAttribute("data-has-item") === "true",
    })),
  );

  return raw.flatMap((cell) => {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)) {
      return [];
    }

    if (cell.fog !== "visible" && cell.fog !== "remembered" && cell.fog !== "unseen") {
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
        hasItem: cell.hasItem,
      },
    ];
  });
}

async function readPlayerPosition(
  page: Page,
): Promise<{ readonly x: number; readonly y: number } | null> {
  const cells = await readGridCells(page);
  return findPlayer(cells);
}

async function readRecentLogLines(page: Page): Promise<readonly string[]> {
  const lines = await page
    .getByTestId("message-log")
    .locator("[data-log-line]")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-log-line") ?? "")
        .filter((line) => line.length > 0),
    );

  return lines.slice(-20);
}

async function readGameStateAttributes(
  page: Page,
): Promise<Record<string, string>> {
  const state = page.getByTestId("game-state");
  return state.evaluate((node) =>
    [...node.attributes].reduce<Record<string, string>>((attributes, attr) => {
      attributes[attr.name] = attr.value;
      return attributes;
    }, {}),
  );
}

function findPlayer(
  cells: readonly GridCell[],
): { readonly x: number; readonly y: number } | null {
  const player = cells.find((cell) => cell.layer === "player");
  return player === undefined ? null : { x: player.x, y: player.y };
}

function findAdjacentEnemy(
  cells: readonly GridCell[],
  player: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } | null {
  for (const cell of cells) {
    if (cell.layer !== "enemy" || cell.fog !== "visible") {
      continue;
    }
    if (chebyshev(player, cell) <= 1) {
      return { x: cell.x, y: cell.y };
    }
  }
  return null;
}

function hasItemUnderfoot(
  cells: readonly GridCell[],
  player: { readonly x: number; readonly y: number },
): boolean {
  const cell = cells.find(
    (candidate) => candidate.x === player.x && candidate.y === player.y,
  );
  return cell?.hasItem === true;
}

function isOnStairs(
  cells: readonly GridCell[],
  player: { readonly x: number; readonly y: number },
): boolean {
  const cell = cells.find((candidate) => candidate.x === player.x && candidate.y === player.y);
  return cell?.terrain === "stairs_down";
}

function isOnHoard(
  cells: readonly GridCell[],
  player: { readonly x: number; readonly y: number },
): boolean {
  const cell = cells.find((candidate) => candidate.x === player.x && candidate.y === player.y);
  return cell?.featureKind === "hoard";
}

function findTargetCells(
  cells: readonly GridCell[],
  predicate: (cell: GridCell) => boolean,
): Array<{ readonly x: number; readonly y: number }> {
  return cells
    .filter((cell) => cell.fog === "visible" && predicate(cell))
    .map((cell) => ({ x: cell.x, y: cell.y }));
}

function findExploreTarget(
  cells: readonly GridCell[],
  visited: ReadonlySet<string>,
): Array<{ readonly x: number; readonly y: number }> {
  const unvisited = cells
    .filter(
      (cell) =>
        cell.fog === "visible" &&
        isWalkable(cell) &&
        !visited.has(posKey(cell.x, cell.y)),
    )
    .map((cell) => ({ x: cell.x, y: cell.y }));

  if (unvisited.length > 0) {
    return unvisited;
  }

  const unseen = new Set(
    cells
      .filter((cell) => cell.fog === "unseen")
      .map((cell) => posKey(cell.x, cell.y)),
  );

  return cells
    .filter(
      (cell) =>
        cell.fog === "visible" &&
        isWalkable(cell) &&
        neighbors(cell).some((neighbor) =>
          unseen.has(posKey(neighbor.x, neighbor.y)),
        ),
    )
    .map((cell) => ({ x: cell.x, y: cell.y }));
}

function greedyStep(
  player: { readonly x: number; readonly y: number },
  targets: readonly { readonly x: number; readonly y: number }[],
  cells: readonly GridCell[],
  visited: ReadonlySet<string> | undefined,
): string | null {
  if (targets.length === 0) {
    return null;
  }

  const walkable = new Set(
    cells
      .filter((cell) => isWalkable(cell) && cell.fog !== "unseen")
      .map((cell) => posKey(cell.x, cell.y)),
  );

  const route = bfsRoute(player, targets, walkable);
  if (route === null || route.length < 2) {
    return null;
  }

  const next = route[1];
  if (next === undefined) {
    return null;
  }

  if (visited !== undefined && route.length === 2 && visited.has(posKey(next.x, next.y))) {
    const alternate = bfsRoute(player, targets, walkable, visited);
    const altNext = alternate?.[1];
    if (altNext !== undefined) {
      return directionKeyBetween(player, altNext);
    }
  }

  return directionKeyBetween(player, next);
}

function bfsRoute(
  start: { readonly x: number; readonly y: number },
  targets: readonly { readonly x: number; readonly y: number }[],
  walkable: ReadonlySet<string>,
  avoidVisited?: ReadonlySet<string>,
): Array<{ readonly x: number; readonly y: number }> | null {
  const targetKeys = new Set(targets.map((target) => posKey(target.x, target.y)));
  if (targetKeys.has(posKey(start.x, start.y))) {
    return [start];
  }

  const queue: Array<Array<{ readonly x: number; readonly y: number }>> = [[start]];
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

      if (
        avoidVisited !== undefined &&
        avoidVisited.has(key) &&
        !targetKeys.has(key)
      ) {
        continue;
      }

      const nextRoute = [...route, neighbor];
      if (targetKeys.has(key)) {
        return nextRoute;
      }

      seen.add(key);
      queue.push(nextRoute);
    }
  }

  return null;
}

function neighbors(position: {
  readonly x: number;
  readonly y: number;
}): Array<{ readonly x: number; readonly y: number }> {
  const deltas = [
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
  ];

  return deltas.map((delta) => ({
    x: position.x + delta.x,
    y: position.y + delta.y,
  }));
}

function directionKeyToward(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): string {
  return directionKeyBetween(from, to);
}

function directionKeyBetween(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
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

function isWalkable(cell: GridCell): boolean {
  if (cell.fog === "unseen") {
    return false;
  }

  if (cell.layer === "enemy" || cell.layer === "npc") {
    return false;
  }

  return !BLOCKED_TERRAIN.has(cell.terrain);
}

function markVisited(
  visitedByDepth: Map<number, Set<string>>,
  depth: number,
  player: { readonly x: number; readonly y: number },
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
  right: { readonly x: number; readonly y: number },
): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

async function progressSignature(
  page: Page,
  shell: ShellSnapshot,
): Promise<string> {
  const player = await readPlayerPosition(page);
  return JSON.stringify({
    depth: shell.depth,
    turn: shell.turn,
    panel: shell.panelMode,
    player,
  });
}

class BotFailure extends Error {
  constructor(
    message: string,
    readonly diagnosis: BotDiagnosis,
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
