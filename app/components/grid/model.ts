import {
  GLYPH_TRAP,
  defaultVisibleFog,
  floorKnowledge,
  fogFromState,
  gridFromState,
  render,
} from "@engine/render";
import type {
  EntityId,
  EntityInstance,
  GameState,
  Position,
  SerializableRecord,
} from "@engine/state";

export type GridFogState = "visible" | "remembered" | "unseen";

export type GridLayer =
  | "player"
  | "enemy"
  | "npc"
  | "item"
  | "trap"
  | "terrain"
  | "empty";

export type GridShape =
  | "none"
  | "circle"
  | "diamond"
  | "square"
  | "dot"
  | "triangle";

export type GridPulseKind = "damage" | "heal";

export type GridPulse = {
  readonly id: string;
  readonly kind: GridPulseKind;
  readonly text: string;
};

export type GridMotion = {
  readonly dx: number;
  readonly dy: number;
};

export type GridOverlayMarker = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly tone: "quest";
};

export type GridCellView = {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
  readonly terrain: string;
  readonly fog: GridFogState;
  readonly layer: GridLayer;
  readonly featureKind: string;
  readonly featureId: string;
  readonly hasItem: boolean;
  readonly label: string;
  readonly badge: string;
  readonly shape: GridShape;
  readonly markers: readonly GridOverlayMarker[];
  readonly pulses: readonly GridPulse[];
  readonly hitFlash: boolean;
  readonly motion: GridMotion | null;
  readonly renderKey: string;
};

export type GridRenderCursor = {
  readonly runId: string;
  readonly floorId: string;
  readonly logLength: number;
};

export type GridViewModel = {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly GridCellView[];
  readonly rows: readonly (readonly GridCellView[])[];
  readonly cursor: GridRenderCursor;
};

type CellEffects = {
  readonly pulses: readonly GridPulse[];
  readonly hitFlash: boolean;
  readonly motion: GridMotion | null;
};

type MutableCellEffects = {
  pulses: GridPulse[];
  hitFlash: boolean;
  motion: GridMotion | null;
};

type RuntimeLogEvent = {
  readonly turn?: unknown;
  readonly type?: unknown;
  readonly data?: unknown;
};

type RuntimeRecord = {
  readonly [key: string]: unknown;
};

type GridFeatureView = {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
};

const EMPTY_EFFECTS: CellEffects = {
  pulses: [],
  hitFlash: false,
  motion: null,
};

const ENTITY_KIND_ORDER: Readonly<Record<EntityInstance["kind"], number>> = {
  enemy: 0,
  item: 1,
  npc: 2,
  trap: 3,
};

export const hasRenderableGrid = (state: GameState): boolean =>
  renderedGridLines(state).length > 0;

export const createGridViewModel = (
  state: GameState,
  previousCursor?: GridRenderCursor,
  markers: readonly GridOverlayMarker[] = [],
): GridViewModel => {
  const lines = renderedGridLines(state);
  const width = lines[0]?.length ?? 0;
  const height = lines.length;
  const cursor = cursorForState(state);
  const grid = gridFromState(state);
  const entitiesByPosition = entitiesByCell(state);
  const featuresByPosition = featuresByCell(state);
  const fogStates = fogStatesForState(state, width, height);
  const effectsByPosition = effectsSinceLastRender(state, previousCursor);
  const markersByPosition = overlayMarkersByCell(markers);
  const cells: GridCellView[] = [];

  for (let y = 0; y < height; y += 1) {
    const line = lines[y] ?? "";

    for (let x = 0; x < width; x += 1) {
      const glyph = line.charAt(x) || " ";
      const positionKey = keyForPosition({ x, y });
      const fog = fogStates[y * width + x] ?? "unseen";
      const entities = entitiesByPosition.get(positionKey) ?? [];
      const layer = layerAt(
        state,
        { x, y },
        glyph,
        fog,
        entities,
      );
      const terrain = terrainAt(grid, width, height, x, y);
      const effects = effectsByPosition.get(positionKey) ?? EMPTY_EFFECTS;
      const feature = fog === "unseen"
        ? null
        : featuresByPosition.get(positionKey) ?? null;
      cells.push(
        createCell({
          x,
          y,
          glyph,
          terrain,
          fog,
          layer,
          feature,
          hasItem: entities.some((entity) => entity.kind === "item"),
          markers: markersByPosition.get(positionKey) ?? [],
          effects,
        }),
      );
    }
  }

  return {
    width,
    height,
    cells,
    rows: rowsForCells(cells, width),
    cursor,
  };
};

const renderedGridLines = (state: GameState): readonly string[] => {
  const lines = render(state).split("\n");

  return lines.length > 1 ? lines.slice(0, -1) : [];
};

const cursorForState = (state: GameState): GridRenderCursor => ({
  runId: state.run.runId,
  floorId: state.floor.floorId,
  logLength: state.log.length,
});

const rowsForCells = (
  cells: readonly GridCellView[],
  width: number,
): readonly (readonly GridCellView[])[] => {
  if (width <= 0) {
    return [];
  }

  const rows: GridCellView[][] = [];

  for (let offset = 0; offset < cells.length; offset += width) {
    rows.push(cells.slice(offset, offset + width));
  }

  return rows;
};

const createCell = ({
  x,
  y,
  glyph,
  terrain,
  fog,
  layer,
  feature,
  hasItem,
  markers,
  effects,
}: {
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
  readonly terrain: string;
  readonly fog: GridFogState;
  readonly layer: GridLayer;
  readonly feature: GridFeatureView | null;
  readonly hasItem: boolean;
  readonly markers: readonly GridOverlayMarker[];
  readonly effects: CellEffects;
}): GridCellView => {
  const affordance = affordanceForLayer(layer);

  return {
    key: `${x}:${y}`,
    x,
    y,
    glyph,
    terrain,
    fog,
    layer,
    featureKind: feature?.kind ?? "",
    featureId: feature?.id ?? "",
    hasItem,
    label: labelForLayer(layer, fog),
    badge: affordance.badge,
    shape: affordance.shape,
    markers,
    pulses: effects.pulses,
    hitFlash: effects.hitFlash,
    motion: effects.motion,
    renderKey: [
      glyph,
      terrain,
      fog,
      layer,
      feature?.kind ?? "",
      feature?.id ?? "",
      hasItem ? "item" : "",
      affordance.badge,
      affordance.shape,
      effects.hitFlash ? "hit" : "",
      effects.motion === null
        ? ""
        : `${effects.motion.dx},${effects.motion.dy}`,
      ...markers.map((marker) => `marker:${marker.id}:${marker.tone}`),
      ...effects.pulses.map((pulse) => `${pulse.id}:${pulse.kind}:${pulse.text}`),
    ].join("|"),
  };
};

const terrainAt = (
  grid: ReturnType<typeof gridFromState>,
  width: number,
  height: number,
  x: number,
  y: number,
): string => {
  if (
    grid === null ||
    grid.width !== width ||
    grid.height !== height
  ) {
    return "";
  }

  const tile = grid.tiles[y * width + x];
  return typeof tile?.terrain === "string" ? tile.terrain : "";
};

const overlayMarkersByCell = (
  markers: readonly GridOverlayMarker[],
): ReadonlyMap<string, readonly GridOverlayMarker[]> => {
  const grouped = new Map<string, GridOverlayMarker[]>();

  for (const marker of markers) {
    const key = keyForPosition(marker);
    const existing = grouped.get(key);

    if (existing === undefined) {
      grouped.set(key, [marker]);
    } else {
      existing.push(marker);
    }
  }

  return grouped;
};

const featuresByCell = (
  state: GameState,
): ReadonlyMap<string, GridFeatureView> => {
  const grouped = new Map<string, GridFeatureView>();

  for (const feature of decorativeFeatures(state)) {
    grouped.set(keyForPosition(feature), feature);
  }

  return grouped;
};

const decorativeFeatures = (state: GameState): readonly GridFeatureView[] => {
  const opaque = asRecord(state.floor.geometry.opaque);
  const knowledge = asRecord(opaque?.knowledge);
  const features = knowledge?.decorativeFeatures;

  if (!Array.isArray(features)) {
    return [];
  }

  return features.flatMap((feature: SerializableRecord) => {
    const parsed = parseFeature(feature);
    return parsed === null ? [] : [parsed];
  });
};

const parseFeature = (feature: SerializableRecord): GridFeatureView | null => {
  const record = asRecord(feature);
  const id = stringValue(record?.id);
  const kind = stringValue(record?.kind);
  const name = stringValue(record?.name);
  const x = numberValue(record?.x);
  const y = numberValue(record?.y);

  if (id === null || kind === null || name === null || x === null || y === null) {
    return null;
  }

  return { id, kind, name, x, y };
};

const affordanceForLayer = (
  layer: GridLayer,
): { readonly badge: string; readonly shape: GridShape } => {
  switch (layer) {
    case "player":
      return { badge: "YOU", shape: "circle" };
    case "enemy":
      return { badge: "FOE", shape: "diamond" };
    case "npc":
      return { badge: "NPC", shape: "square" };
    case "item":
      return { badge: "ITM", shape: "dot" };
    case "trap":
      return { badge: "TRP", shape: "triangle" };
    case "terrain":
    case "empty":
      return { badge: "", shape: "none" };
  }
};

const labelForLayer = (layer: GridLayer, fog: GridFogState): string => {
  if (fog === "unseen") {
    return "unseen";
  }

  if (fog === "remembered") {
    return "remembered terrain";
  }

  switch (layer) {
    case "player":
      return "you";
    case "enemy":
      return "enemy";
    case "npc":
      return "npc";
    case "item":
      return "item";
    case "trap":
      return "revealed trap";
    case "terrain":
      return "terrain";
    case "empty":
      return "empty";
  }
};

const layerAt = (
  state: GameState,
  position: Position,
  glyph: string,
  fog: GridFogState,
  entities: readonly EntityInstance[],
): GridLayer => {
  if (fog === "unseen" || glyph === " ") {
    return "empty";
  }

  if (fog === "remembered") {
    return "terrain";
  }

  if (samePosition(state.player.position, position)) {
    return "player";
  }

  if (entities.some((entity) => entity.kind === "enemy")) {
    return "enemy";
  }

  if (entities.some((entity) => entity.kind === "npc")) {
    return "npc";
  }

  if (entities.some((entity) => entity.kind === "item")) {
    return "item";
  }

  if (entities.some((entity) => entity.kind === "trap") && glyph === GLYPH_TRAP) {
    return "trap";
  }

  return "terrain";
};

const entitiesByCell = (
  state: GameState,
): ReadonlyMap<string, readonly EntityInstance[]> => {
  const grouped = new Map<string, EntityInstance[]>();
  const entities = Object.values(state.entities).sort(compareEntities);

  for (const entity of entities) {
    const key = keyForPosition(entity.position);
    const existing = grouped.get(key);

    if (existing === undefined) {
      grouped.set(key, [entity]);
    } else {
      existing.push(entity);
    }
  }

  return grouped;
};

const compareEntities = (
  left: EntityInstance,
  right: EntityInstance,
): number => {
  const kindDelta = ENTITY_KIND_ORDER[left.kind] - ENTITY_KIND_ORDER[right.kind];

  if (kindDelta !== 0) {
    return kindDelta;
  }

  return compareEntityIds(left.id, right.id);
};

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

const fogStatesForState = (
  state: GameState,
  width: number,
  height: number,
): readonly GridFogState[] => {
  const count = width * height;

  if (count <= 0) {
    return [];
  }

  const grid = gridFromState(state);

  if (
    grid === null ||
    grid.width !== width ||
    grid.height !== height ||
    grid.tiles.length !== count
  ) {
    return Array.from({ length: count }, () => "visible");
  }

  if (floorKnowledge(state).mapRevealed === true) {
    return Array.from({ length: count }, () => "visible");
  }

  const fog = fogFromState(state, grid) ?? defaultVisibleFog(grid);

  return fog.tiles.map((tile) => {
    switch (tile.state) {
      case "visible":
      case "remembered":
      case "unseen":
        return tile.state;
      default:
        return "unseen";
    }
  });
};

const effectsSinceLastRender = (
  state: GameState,
  previousCursor?: GridRenderCursor,
): ReadonlyMap<string, CellEffects> => {
  const cursor = cursorForState(state);
  const canDiff =
    previousCursor !== undefined &&
    previousCursor.runId === cursor.runId &&
    previousCursor.floorId === cursor.floorId &&
    previousCursor.logLength <= cursor.logLength;

  if (!canDiff) {
    return new Map();
  }

  const events = (state.log as readonly RuntimeLogEvent[]).slice(
    previousCursor.logLength,
  );

  if (events.length === 0) {
    return new Map();
  }

  const positionsByActorId = actorPositions(state);
  const effectsByPosition = new Map<string, MutableCellEffects>();

  events.forEach((event, eventIndex) => {
    applyPulseEvent(event, eventIndex, positionsByActorId, effectsByPosition);
    applyMovementEvent(event, positionsByActorId, effectsByPosition);
  });

  return new Map(
    [...effectsByPosition.entries()].map(([key, effects]) => [
      key,
      {
        pulses: effects.pulses,
        hitFlash: effects.hitFlash,
        motion: effects.motion,
      },
    ]),
  );
};

const applyPulseEvent = (
  event: RuntimeLogEvent,
  eventIndex: number,
  positionsByActorId: ReadonlyMap<string, Position>,
  effectsByPosition: Map<string, MutableCellEffects>,
): void => {
  const data = asRecord(event.data);
  const eventId = `${String(event.turn ?? "t")}:${String(event.type)}:${eventIndex}`;

  switch (event.type) {
    case "attack_hit": {
      const defenderId = stringValue(data?.defenderId);
      const damage = numberValue(data?.damage);

      if (defenderId !== null && damage !== null && damage > 0) {
        addPulseForActor(
          defenderId,
          positionsByActorId,
          effectsByPosition,
          {
            id: eventId,
            kind: "damage",
            text: `-${damage}`,
          },
        );
      }
      break;
    }
    case "status_tick": {
      const entityId = stringValue(data?.entityId);
      const hpDelta = numberValue(data?.hpDelta);

      if (entityId !== null && hpDelta !== null && hpDelta !== 0) {
        addPulseForActor(
          entityId,
          positionsByActorId,
          effectsByPosition,
          pulseForDelta(eventId, hpDelta),
        );
      }
      break;
    }
    case "starvation": {
      const hpBefore = numberValue(data?.hpBefore);
      const hpAfter = numberValue(data?.hpAfter);

      if (hpBefore !== null && hpAfter !== null && hpAfter !== hpBefore) {
        addPulseForActor(
          "player",
          positionsByActorId,
          effectsByPosition,
          pulseForDelta(eventId, hpAfter - hpBefore),
        );
      }
      break;
    }
    case "level_up": {
      const hpBefore = numberValue(data?.currentHpBefore);
      const hpAfter = numberValue(data?.currentHpAfter);

      if (hpBefore !== null && hpAfter !== null && hpAfter !== hpBefore) {
        addPulseForActor(
          "player",
          positionsByActorId,
          effectsByPosition,
          pulseForDelta(eventId, hpAfter - hpBefore),
        );
      }
      break;
    }
    case "effect_executed": {
      const verb = stringValue(data?.verb);
      const targetId = stringValue(data?.targetId);
      const details = asRecord(data?.details);
      const hpBefore = numberValue(details?.hpBefore);
      const hpAfter = numberValue(details?.hpAfter);

      if (
        targetId !== null &&
        hpBefore !== null &&
        hpAfter !== null &&
        hpAfter !== hpBefore &&
        (verb === "damage" || verb === "heal")
      ) {
        addPulseForActor(
          targetId,
          positionsByActorId,
          effectsByPosition,
          pulseForDelta(eventId, hpAfter - hpBefore),
        );
      }
      break;
    }
  }
};

const applyMovementEvent = (
  event: RuntimeLogEvent,
  positionsByActorId: ReadonlyMap<string, Position>,
  effectsByPosition: Map<string, MutableCellEffects>,
): void => {
  if (event.type !== "moved" && event.type !== "enemy_moved") {
    return;
  }

  const data = asRecord(event.data);
  const actorId = stringValue(data?.actorId);
  const from = positionValue(data?.from);
  const to = positionValue(data?.to) ?? (actorId === null
    ? null
    : positionsByActorId.get(actorId) ?? null);

  if (from === null || to === null) {
    return;
  }

  const effects = mutableEffectsAt(effectsByPosition, to);
  effects.motion = {
    dx: from.x - to.x,
    dy: from.y - to.y,
  };
};

const pulseForDelta = (id: string, delta: number): GridPulse => ({
  id,
  kind: delta < 0 ? "damage" : "heal",
  text: `${delta > 0 ? "+" : ""}${delta}`,
});

const addPulseForActor = (
  actorId: string,
  positionsByActorId: ReadonlyMap<string, Position>,
  effectsByPosition: Map<string, MutableCellEffects>,
  pulse: GridPulse,
): void => {
  const position = positionsByActorId.get(actorId);

  if (position === undefined) {
    return;
  }

  const effects = mutableEffectsAt(effectsByPosition, position);
  effects.pulses.push(pulse);

  if (pulse.kind === "damage") {
    effects.hitFlash = true;
  }
};

const mutableEffectsAt = (
  effectsByPosition: Map<string, MutableCellEffects>,
  position: Position,
): MutableCellEffects => {
  const key = keyForPosition(position);
  const existing = effectsByPosition.get(key);

  if (existing !== undefined) {
    return existing;
  }

  const created: MutableCellEffects = {
    pulses: [],
    hitFlash: false,
    motion: null,
  };
  effectsByPosition.set(key, created);

  return created;
};

const actorPositions = (state: GameState): ReadonlyMap<string, Position> => {
  const positions = new Map<string, Position>([["player", state.player.position]]);

  for (const entity of Object.values(state.entities)) {
    positions.set(entity.id, entity.position);
  }

  for (const event of state.log as readonly RuntimeLogEvent[]) {
    if (event.type !== "entity_died") {
      continue;
    }

    const data = asRecord(event.data);
    const entityId = stringValue(data?.entityId);
    const position = positionValue(data?.position);

    if (entityId !== null && position !== null && !positions.has(entityId)) {
      positions.set(entityId, position);
    }
  }

  return positions;
};

const asRecord = (value: unknown): RuntimeRecord | null =>
  value !== null && typeof value === "object"
    ? (value as RuntimeRecord)
    : null;

const numberValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringValue = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const positionValue = (value: unknown): Position | null => {
  const record = asRecord(value);
  const x = numberValue(record?.x);
  const y = numberValue(record?.y);

  return x === null || y === null ? null : { x, y };
};

const keyForPosition = (position: Position): string =>
  `${position.x},${position.y}`;

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;
