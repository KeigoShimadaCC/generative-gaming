import { idx, type Tile } from "../map/index.js";
import type {
  EntityId,
  EntityInstance,
  GameState,
  Position,
} from "../state/index.js";
import {
  defaultVisibleFog,
  fogFromState,
  floorKnowledge,
  gridFromState,
  isTrapRevealed,
} from "./floor-runtime.js";
import {
  enemyGlyph,
  GLYPH_NPC,
  GLYPH_PLAYER,
  GLYPH_TRAP,
  itemGlyph,
  rememberedTerrainGlyph,
  terrainGlyph,
} from "./glyphs.js";

export const renderHudLine = (state: GameState): string => {
  const statuses = state.player.statuses
    .map((application) => application.status)
    .join(",");
  const statusSuffix = statuses.length > 0 ? ` ${statuses}` : "";

  return [
    `d${state.run.depth}`,
    `t${state.run.turn}`,
    `HP ${state.player.hp.current}/${state.player.hp.max}`,
    `full ${state.player.fullness.current}/${state.player.fullness.max}`,
    `L${state.player.level}`,
    `xp ${state.player.xp}${statusSuffix}`,
  ].join(" ");
};

export const render = (state: GameState): string => {
  const grid = gridFromState(state);

  if (grid === null) {
    return renderHudLine(state);
  }

  const fog = fogFromState(state, grid) ?? defaultVisibleFog(grid);
  const knowledge = floorKnowledge(state);
  const mapRevealed = knowledge.mapRevealed === true;
  const lines: string[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    let row = "";

    for (let x = 0; x < grid.width; x += 1) {
      const position = { x, y };
      const index = idx(grid, position);
      const memory = fog.tiles[index];

      if (memory === undefined) {
        row += " ";
        continue;
      }

      if (!mapRevealed && memory.state === "unseen") {
        row += " ";
        continue;
      }

      if (!mapRevealed && memory.state === "remembered") {
        const tile = memory.rememberedTile;

        row += tile === null ? " " : rememberedTerrainGlyph(tile);
        continue;
      }

      const tile = grid.tiles[index];

      row +=
        tile === undefined ? " " : glyphAt(state, position, tile);
    }

    lines.push(row);
  }

  lines.push(renderHudLine(state));

  return lines.join("\n");
};

const glyphAt = (state: GameState, position: Position, tile: Tile): string => {
  if (
    state.player.position.x === position.x &&
    state.player.position.y === position.y
  ) {
    return GLYPH_PLAYER;
  }

  const entities = entitiesAt(state, position);

  const enemy = entities.find((entity) => entity.kind === "enemy");

  if (enemy !== undefined) {
    return enemyGlyph(enemy.definition.glyph);
  }

  const npc = entities.find((entity) => entity.kind === "npc");

  if (npc !== undefined) {
    return GLYPH_NPC;
  }

  const item = entities.find((entity) => entity.kind === "item");

  if (item !== undefined) {
    return itemGlyph(item.definition, item.identified);
  }

  const trap = entities.find((entity) => entity.kind === "trap");

  if (
    trap !== undefined &&
    isTrapRevealed(state, trap.id, trap.behaviorRuntime)
  ) {
    return GLYPH_TRAP;
  }

  return terrainGlyph(tile);
};

const entitiesAt = (
  state: GameState,
  position: Position,
): readonly EntityInstance[] =>
  Object.values(state.entities)
    .filter(
      (entity) =>
        entity.position.x === position.x && entity.position.y === position.y,
    )
    .sort((left, right) => compareEntityIds(left.id, right.id));

const compareEntityIds = (left: EntityId, right: EntityId): number => {
  const parsedLeft = parseEntityId(left);
  const parsedRight = parseEntityId(right);
  const kindOrder = parsedLeft.kind.localeCompare(parsedRight.kind);

  return kindOrder === 0
    ? parsedLeft.index - parsedRight.index
    : kindOrder;
};

const parseEntityId = (
  id: EntityId,
): { readonly kind: string; readonly index: number } => {
  const [kind, rawIndex] = id.split("#");

  return {
    kind: kind ?? "",
    index: Number.parseInt(rawIndex ?? "0", 10),
  };
};
