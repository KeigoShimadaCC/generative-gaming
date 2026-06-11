import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  validDraughtItemFixture,
  validEnemyDefinitionFixture,
  validNpcDefinitionFixture,
} from "../../schemas/fixtures/entities.js";
import {
  createTile,
  createTileGrid,
  Terrain,
} from "../map/index.js";
import { createInitialState } from "../state/index.js";
import type {
  EnemyEntityInstance,
  EntityId,
  GameState,
  GroundItemEntityInstance,
  NpcEntityInstance,
} from "../state/index.js";
import { fogMixFixtureState, midActionFixtureState } from "./fixtures.js";
import { render } from "./grid.js";

const readGolden = (name: string): string =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8").trimEnd();

describe("render grid", () => {
  it("matches the mid-action golden snapshot", () => {
    expect(render(midActionFixtureState())).toBe(
      readGolden("mid-action.golden.txt"),
    );
  });

  it("matches the fog-mix golden snapshot", () => {
    expect(render(fogMixFixtureState())).toBe(
      readGolden("fog-mix.golden.txt"),
    );
  });

  it("is deterministic across repeated renders", () => {
    const state = midActionFixtureState();
    const first = render(state);
    const second = render(state);

    expect(first).toBe(second);
    expect(first).toBe(readGolden("mid-action.golden.txt"));
  });

  it("renders fog unseen, remembered, and visible states", () => {
    const rendered = render(fogMixFixtureState());
    const grid = rendered.split("\n").slice(0, -1).join("\n");

    expect(grid).toContain("@");
    expect(grid).toContain(":");
    expect(grid).toContain(",");
    expect(grid).toContain(" ");
    expect(rendered).toBe(readGolden("fog-mix.golden.txt"));
  });

  it("prefers stacked glyphs by precedence", () => {
    const grid = createTileGrid({
      width: 3,
      height: 1,
      tiles: [
        createTile(Terrain.Floor),
        createTile(Terrain.Floor),
        createTile(Terrain.Floor),
      ],
    });

    const state = stackedState(grid);

    expect(render(state).split("\n")[0]).toBe("@e.");
  });
});

const stackedState = (
  grid: ReturnType<typeof createTileGrid>,
): GameState => {
  const base = createInitialState("stacked-glyphs");
  const stackPosition = { x: 1, y: 0 };

  return {
    ...base,
    floor: {
      ...base.floor,
      geometry: {
        refId: base.floor.geometry.refId,
        opaque: {
          ...grid,
          fog: {
            ownerId: "player",
            width: grid.width,
            height: grid.height,
            tiles: grid.tiles.map((tile) => ({
              state: "visible" as const,
              rememberedTile: tile,
            })),
          },
        },
      },
    },
    player: {
      ...base.player,
      position: { x: 0, y: 0 },
    },
    entities: {
      "enemy#1": enemy("enemy#1", stackPosition),
      "npc#1": npc("npc#1", stackPosition),
      "item#1": groundItem("item#1", stackPosition),
    },
    ids: {
      entityCounters: {
        enemy: 1,
        item: 1,
        npc: 1,
        trap: 0,
      },
    },
  };
};

const enemy = (
  id: EntityId,
  position: { readonly x: number; readonly y: number },
): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition:
    validEnemyDefinitionFixture as unknown as EnemyEntityInstance["definition"],
  position,
  currentHP: validEnemyDefinitionFixture.stats.hp,
  statuses: [],
  behaviorRuntime: {},
});

const npc = (
  id: EntityId,
  position: { readonly x: number; readonly y: number },
): NpcEntityInstance => ({
  id,
  kind: "npc",
  definition: validNpcDefinitionFixture,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  dialogueRuntime: {},
});

const groundItem = (
  id: EntityId,
  position: { readonly x: number; readonly y: number },
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition: validDraughtItemFixture,
  position,
  currentHP: null,
  quantity: 1,
  identified: false,
  statuses: [],
  behaviorRuntime: {},
});
