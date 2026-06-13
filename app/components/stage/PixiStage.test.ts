import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createFogMixGridFixtureState,
  createMidActionGridFixtureState,
  createPrecedenceFixtureState,
} from "@/components/grid/fixtures";
import { createGridViewModel } from "@/components/grid/model";

import { StageA11yMirror } from "./a11y-mirror";
import { resolveStageCamera } from "./camera";
import { createStageDrawList } from "./draw-list";
import { fogPaintForCell } from "./fog";
import { WALL_MASK } from "./tilemap";
import {
  createInitialState,
  type EnemyEntityInstance,
  type GameState,
} from "@engine/state";
import {
  createTile,
  createTileGrid,
  Terrain,
} from "@engine/map";

describe("PixiStage draw-list seam", () => {
  it("emits deterministic sprite draws with resolver-backed atlas keys", () => {
    const state = createMidActionGridFixtureState();
    const model = createGridViewModel(state);
    const drawList = createStageDrawList(model, { state, cameraLerp: 1 });

    expect(drawList.width).toBe(5);
    expect(drawList.height).toBe(3);
    expect(drawList.sprites.filter((sprite) => sprite.layer === "terrain"))
      .toHaveLength(15);
    expect(drawList.sprites.find((sprite) => sprite.key === "1:1:entity:actor.player"))
      .toMatchObject({
        spriteId: "actor.player",
        atlasKeyString: "torchlit-limestone|actor.player|art-batch-shallows",
        reason: "actor.player",
      });
    expect(drawList.sprites.find((sprite) => sprite.key === "2:1:entity:item.consumable"))
      .toMatchObject({
        spriteId: "item.consumable",
        atlasKeyString: "torchlit-limestone|item.consumable|art-batch-shallows",
        reason: "item.draught",
      });
    expect(drawList.sprites.find((sprite) => sprite.key === "3:1:entity:enemy.brute"))
      .toMatchObject({
        spriteId: "enemy.brute",
        atlasKeyString: "torchlit-limestone|enemy.brute|art-batch-shallows",
        reason: "enemy.behavior.default",
      });
    expect(drawList.sprites.find((sprite) => sprite.key === "3:2:terrain:terrain.water"))
      .toMatchObject({
        spriteId: "terrain.water",
        atlasKeyString: "torchlit-limestone|terrain.water|art-batch-shallows",
      });
    expect(drawList.sprites.find((sprite) => sprite.key === "3:2:entity:trap.revealed"))
      .toMatchObject({
        spriteId: "trap.revealed",
        reason: "trap.revealed",
      });
  });

  it("resolves middle-band caster enemies to the ferrous-fungal generated sprite", () => {
    const grid = createTileGrid({
      width: 3,
      height: 3,
      tiles: Array.from({ length: 9 }, () => createTile(Terrain.Floor)),
    });
    const state: GameState = {
      ...createInitialState("middle-band-caster"),
      run: {
        ...createInitialState("middle-band-caster").run,
        depth: 5,
        band: "middle",
      },
      floor: {
        ...createInitialState("middle-band-caster").floor,
        depth: 5,
        geometry: {
          refId: "middle-band-caster-floor",
          opaque: grid,
        },
      },
      player: {
        ...createInitialState("middle-band-caster").player,
        position: { x: 0, y: 0 },
      },
      entities: {
        "enemy#1": {
          id: "enemy#1",
          kind: "enemy",
          definition: {
            id: "middle-band-caster-enemy",
            name: "Fungal Channeler",
            glyph: "e",
            origin: "fallback",
            stats: {
              band: "middle",
              hp: 8,
              attack: 2,
              defense: 0,
              xpYield: 2,
            },
            behaviors: [{ kind: "caster" }],
            abilities: [],
          } as unknown as EnemyEntityInstance["definition"],
          position: { x: 1, y: 0 },
          currentHP: 8,
          statuses: [],
          behaviorRuntime: {},
        },
      },
      ids: {
        entityCounters: {
          enemy: 1,
          item: 0,
          npc: 0,
          trap: 0,
        },
      },
    };
    const model = createGridViewModel(state);
    const drawList = createStageDrawList(model, { state, cameraLerp: 1 });

    expect(model.band).toBe("middle");
    expect(
      drawList.sprites.find((sprite) => sprite.key === "1:0:entity:enemy.caster"),
    ).toMatchObject({
      spriteId: "enemy.caster",
      atlasKeyString: "ferrous-fungal-middle|enemy.caster|art-batch-middle",
      reason: "enemy.behavior.caster",
    });
  });

  it("adds auto-tile wall masks and depth overlays for exposed wall edges", () => {
    const state = createMidActionGridFixtureState();
    const model = createGridViewModel(state);
    const drawList = createStageDrawList(model, { state, cameraLerp: 1 });
    const topLeftWall = drawList.sprites.find(
      (sprite) => sprite.key === "0:0:terrain:terrain.wall",
    );

    expect(topLeftWall?.wallMask).not.toBeNull();
    expect((topLeftWall?.wallMask ?? 0) & WALL_MASK.east).toBe(WALL_MASK.east);
    expect((topLeftWall?.wallMask ?? 0) & WALL_MASK.south).toBe(WALL_MASK.south);
    expect(drawList.tileOverlays.some((overlay) => overlay.kind === "wall-shadow"))
      .toBe(true);
    expect(drawList.tileOverlays.some((overlay) => overlay.kind === "wall-edge"))
      .toBe(true);
  });

  it("keeps the draw-list a pure function of the view-model and state", () => {
    const state = createPrecedenceFixtureState();
    const model = createGridViewModel(state);
    const first = createStageDrawList(model, { state, cameraLerp: 1 });
    const second = createStageDrawList(model, { state, cameraLerp: 1 });

    expect(second).toEqual(first);
  });
});

describe("PixiStage camera", () => {
  it("centers on the player target and clamps to floor bounds", () => {
    const centered = resolveStageCamera({
      worldWidth: 1_000,
      worldHeight: 800,
      viewportWidth: 200,
      viewportHeight: 100,
      cellSize: 32,
      targetX: 500,
      targetY: 400,
      zoom: 1,
      lerp: 1,
    });

    expect(centered.scrollX).toBe(400);
    expect(centered.scrollY).toBe(350);
    expect(centered.transformX).toBe(-400);
    expect(centered.transformY).toBe(-350);

    const clamped = resolveStageCamera({
      ...centered,
      cellSize: 32,
      targetX: 980,
      targetY: 780,
      previous: centered,
      lerp: 1,
    });

    expect(clamped.scrollX).toBe(800);
    expect(clamped.scrollY).toBe(700);
    expect(clamped.transformX).toBe(-800);
    expect(clamped.transformY).toBe(-700);
  });

  it("centers small floors inside the viewport instead of scaling to whole-floor view", () => {
    const camera = resolveStageCamera({
      worldWidth: 96,
      worldHeight: 64,
      viewportWidth: 200,
      viewportHeight: 120,
      cellSize: 32,
      targetX: 48,
      targetY: 32,
      zoom: 1.5,
      lerp: 1,
    });

    expect(camera.scrollX).toBe(0);
    expect(camera.scrollY).toBe(0);
    expect(camera.transformX).toBe(28);
    expect(camera.transformY).toBe(12);
  });
});

describe("PixiStage fog mapping", () => {
  it("maps visible, remembered, and unseen cells to lit, dim, and black states", () => {
    expect(fogPaintForCell("visible", 0, { band: "shallows" })).toMatchObject({
      fog: "visible",
      overlayAlpha: 0,
      spriteAlpha: 1,
      light: 1,
    });
    expect(fogPaintForCell("remembered", 1)).toMatchObject({
      fog: "remembered",
      overlayAlpha: 0.68,
      spriteTint: 0x687180,
      spriteAlpha: 0.5,
      light: 0,
    });
    expect(fogPaintForCell("unseen", 1)).toMatchObject({
      fog: "unseen",
      overlayColor: 0x000000,
      overlayAlpha: 1,
      spriteAlpha: 0,
      light: 0,
    });
  });

  it("emits one fog overlay per fixture cell", () => {
    const state = createFogMixGridFixtureState();
    const model = createGridViewModel(state);
    const drawList = createStageDrawList(model, { state, cameraLerp: 1 });

    expect(drawList.fog).toHaveLength(15);
    expect(drawList.fog.map((fog) => fog.fog)).toEqual(
      expect.arrayContaining(["visible", "remembered", "unseen"]),
    );
  });
});

describe("PixiStage a11y mirror", () => {
  it("mirrors the DOM grid aria structure off-screen", () => {
    const model = createGridViewModel(createFogMixGridFixtureState());
    const markup = renderToStaticMarkup(
      createElement(StageA11yMirror, { model }),
    );

    expect(markup).toContain('role="grid"');
    expect(markup).toContain('aria-rowcount="3"');
    expect(markup).toContain('aria-colcount="5"');
    expect(markup.match(/role="gridcell"/g)?.length).toBe(15);
    expect(markup).toContain('aria-label="1,1 you"');
    expect(markup).toContain('data-testid="stage-a11y-mirror"');
  });
});
