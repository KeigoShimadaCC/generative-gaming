import { config as defaultConfig, type GameConfig } from "../../config/index.js";
import { createRng, type Rng } from "../rng/index.js";
import type { Position } from "../state/index.js";
import {
  createTileGrid,
  getTile,
  idx,
  inBounds,
  line,
  neighbors8,
  type MapDepthBand,
  type TileGrid,
  withTile,
} from "../map/index.js";
import { createTile, isWalkableTile, Terrain } from "../map/terrain.js";
import {
  flavorProfile,
  resolveRoomCount,
  type FloorBandOrSize,
  type FloorParams,
  type FlavorProfile,
  type LayoutFlavor,
  type RoomCountRange,
} from "./flavors.js";

export const MAX_GENERATION_RETRIES = 5;
export const ROOM_PLACEMENT_ITERATION_CAP = 2_000;
export const CONNECTIVITY_ITERATION_CAP = 50_000;

export type GenerationErrorCode =
  | "placement_exhausted"
  | "connectivity_failed"
  | "retry_exhausted";

export type GenerationError = {
  readonly kind: "generation-error";
  readonly code: GenerationErrorCode;
  readonly message: string;
  readonly attempts: number;
};

export type RoomRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly center: Position;
};

export type GeneratedFloor = {
  readonly grid: TileGrid;
  readonly entrance: Position;
  readonly stairsDown: Position;
  readonly entranceRoomIndex: number;
  readonly stairsRoomIndex: number;
  readonly rooms: readonly RoomRect[];
};

export type GenerateFloorResult =
  | { readonly ok: true; readonly floor: GeneratedFloor }
  | { readonly ok: false; readonly error: GenerationError };

type ResolvedGeometry = {
  readonly width: number;
  readonly height: number;
};

const CARDINAL_OFFSETS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const satisfies readonly Position[];

const roomsOverlap = (a: RoomRect, b: RoomRect, padding: number): boolean =>
  a.x - padding < b.x + b.width + padding &&
  a.x + a.width + padding > b.x - padding &&
  a.y - padding < b.y + b.height + padding &&
  a.y + a.height + padding > b.y - padding;

const roomCenter = (room: RoomRect): Position => ({
  x: room.x + Math.floor(room.width / 2),
  y: room.y + Math.floor(room.height / 2),
});

const resolveGeometry = (
  bandOrSize: FloorBandOrSize,
  gameConfig: GameConfig,
): ResolvedGeometry => {
  if (typeof bandOrSize === "string") {
    const geometry = gameConfig.runStructure.floorGeometry[bandOrSize].grid;
    return { width: geometry.width, height: geometry.height };
  }

  return { width: bandOrSize.width, height: bandOrSize.height };
};

const makeError = (
  code: GenerationErrorCode,
  message: string,
  attempts: number,
): GenerateFloorResult => ({
  ok: false,
  error: {
    kind: "generation-error",
    code,
    message,
    attempts,
  },
});

const carveRoom = (grid: TileGrid, room: RoomRect): TileGrid => {
  let next = grid;

  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      next = withTile(next, { x, y }, createTile(Terrain.Floor));
    }
  }

  return next;
};

const carveCorridorSegment = (grid: TileGrid, start: Position, end: Position): TileGrid => {
  let next = grid;

  for (const cell of line(start, end)) {
    next = withTile(next, cell, createTile(Terrain.Floor));
  }

  return next;
};

const carveCorridor = (
  grid: TileGrid,
  from: Position,
  to: Position,
  style: FlavorProfile["corridorStyle"],
  rng: Rng,
): TileGrid => {
  if (style === "direct") {
    return carveCorridorSegment(grid, from, to);
  }

  if (style === "long") {
    const horizontalFirst = rng.percent(50);
    const elbow = horizontalFirst
      ? { x: to.x, y: from.y }
      : { x: from.x, y: to.y };
    let next = carveCorridorSegment(grid, from, elbow);
    next = carveCorridorSegment(next, elbow, to);
    return next;
  }

  const horizontalFirst = rng.percent(50);
  const elbow = horizontalFirst
    ? { x: to.x, y: from.y }
    : { x: from.x, y: to.y };
  let next = carveCorridorSegment(grid, from, elbow);

  const bend = horizontalFirst
    ? {
        x: clamp(elbow.x + rng.int(-2, 2), 1, grid.width - 2),
        y: clamp(elbow.y + rng.int(-4, 4), 1, grid.height - 2),
      }
    : {
        x: clamp(elbow.x + rng.int(-4, 4), 1, grid.width - 2),
        y: clamp(elbow.y + rng.int(-2, 2), 1, grid.height - 2),
      };

  next = carveCorridorSegment(next, elbow, bend);
  return carveCorridorSegment(next, bend, to);
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const fitsGeometry = (
  geometry: ResolvedGeometry,
  width: number,
  height: number,
): boolean =>
  width >= 3 &&
  height >= 3 &&
  width + 2 < geometry.width &&
  height + 2 < geometry.height;

const randomRoomSize = (
  geometry: ResolvedGeometry,
  profile: FlavorProfile,
  rng: Rng,
): { width: number; height: number } | null => {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const width = rng.int(profile.roomWidthMin, profile.roomWidthMax);
    const height = rng.int(profile.roomHeightMin, profile.roomHeightMax);
    if (fitsGeometry(geometry, width, height)) {
      return { width, height };
    }
  }

  return null;
};

const tryPlaceScatterRoom = (
  geometry: ResolvedGeometry,
  profile: FlavorProfile,
  rooms: RoomRect[],
  rng: Rng,
): RoomRect | null => {
  const size = randomRoomSize(geometry, profile, rng);
  if (size === null) {
    return null;
  }

  const { width, height } = size;
  const maxX = geometry.width - width - 2;
  const maxY = geometry.height - height - 2;
  if (maxX < 1 || maxY < 1) {
    return null;
  }

  for (let attempt = 0; attempt < ROOM_PLACEMENT_ITERATION_CAP; attempt += 1) {
    const x = rng.int(1, maxX);
    const y = rng.int(1, maxY);
    const candidate: RoomRect = {
      x,
      y,
      width,
      height,
      center: { x: x + Math.floor(width / 2), y: y + Math.floor(height / 2) },
    };

    if (rooms.every((room) => !roomsOverlap(candidate, room, profile.roomPadding))) {
      return candidate;
    }
  }

  return null;
};

const placeRingRooms = (
  geometry: ResolvedGeometry,
  profile: FlavorProfile,
  targetCount: number,
  rng: Rng,
): RoomRect[] | null => {
  const rooms: RoomRect[] = [];
  const centerX = Math.floor(geometry.width / 2);
  const centerY = Math.floor(geometry.height / 2);
  const radiusX = Math.floor(geometry.width * 0.32);
  const radiusY = Math.floor(geometry.height * 0.32);

  for (let index = 0; index < targetCount; index += 1) {
    const angle = (index / targetCount) * Math.PI * 2;
    const size = randomRoomSize(geometry, profile, rng);
    if (size === null) {
      return null;
    }
    const center = {
      x: clamp(
        Math.round(centerX + Math.cos(angle) * radiusX),
        1 + Math.floor(size.width / 2),
        geometry.width - 2 - Math.floor(size.width / 2),
      ),
      y: clamp(
        Math.round(centerY + Math.sin(angle) * radiusY),
        1 + Math.floor(size.height / 2),
        geometry.height - 2 - Math.floor(size.height / 2),
      ),
    };
    const candidate: RoomRect = {
      x: center.x - Math.floor(size.width / 2),
      y: center.y - Math.floor(size.height / 2),
      width: size.width,
      height: size.height,
      center,
    };

    if (rooms.some((room) => roomsOverlap(candidate, room, profile.roomPadding))) {
      const scattered = tryPlaceScatterRoom(geometry, profile, rooms, rng);
      if (scattered === null) {
        return null;
      }
      rooms.push(scattered);
      continue;
    }

    rooms.push(candidate);
  }

  return rooms;
};

const placeSanctumRooms = (
  geometry: ResolvedGeometry,
  profile: FlavorProfile,
  targetCount: number,
  rng: Rng,
): RoomRect[] | null => {
  const sanctumWidth = clamp(
    Math.floor(geometry.width * 0.42),
    profile.roomWidthMin + 2,
    geometry.width - 6,
  );
  const sanctumHeight = clamp(
    Math.floor(geometry.height * 0.38),
    profile.roomHeightMin + 2,
    geometry.height - 6,
  );
  const sanctumX = Math.floor((geometry.width - sanctumWidth) / 2);
  const sanctumY = Math.floor((geometry.height - sanctumHeight) / 2);
  const sanctum: RoomRect = {
    x: sanctumX,
    y: sanctumY,
    width: sanctumWidth,
    height: sanctumHeight,
    center: {
      x: sanctumX + Math.floor(sanctumWidth / 2),
      y: sanctumY + Math.floor(sanctumHeight / 2),
    },
  };

  const rooms: RoomRect[] = [sanctum];
  const satellites = Math.max(0, targetCount - 1);

  for (let index = 0; index < satellites; index += 1) {
    const placed = tryPlaceScatterRoom(geometry, profile, rooms, rng);
    if (placed === null) {
      return null;
    }
    rooms.push(placed);
  }

  return rooms;
};

const placeRoomsWithCount = (
  geometry: ResolvedGeometry,
  profile: FlavorProfile,
  targetCount: number,
  rng: Rng,
): RoomRect[] | null => {
  if (targetCount < 2) {
    return null;
  }

  if (profile.placementMode === "ring") {
    return placeRingRooms(geometry, profile, targetCount, rng);
  }

  if (profile.placementMode === "sanctum") {
    return placeSanctumRooms(geometry, profile, targetCount, rng);
  }

  const rooms: RoomRect[] = [];

  for (let index = 0; index < targetCount; index += 1) {
    const placed = tryPlaceScatterRoom(geometry, profile, rooms, rng);
    if (placed === null) {
      return null;
    }
    rooms.push(placed);
  }

  return rooms;
};

const placeRooms = (
  geometry: ResolvedGeometry,
  profile: FlavorProfile,
  targetCount: number,
  rng: Rng,
): RoomRect[] | null => {
  for (let count = targetCount; count >= 2; count -= 1) {
    const rooms = placeRoomsWithCount(geometry, profile, count, rng);
    if (rooms !== null) {
      return rooms;
    }
  }

  return null;
};

const connectRooms = (
  grid: TileGrid,
  rooms: readonly RoomRect[],
  profile: FlavorProfile,
  rng: Rng,
): TileGrid => {
  if (rooms.length <= 1) {
    return grid;
  }

  const connected = new Set<number>([0]);
  let next = grid;

  while (connected.size < rooms.length) {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestFrom = -1;
    let bestTo = -1;

    for (const fromIndex of connected) {
      for (let toIndex = 0; toIndex < rooms.length; toIndex += 1) {
        if (connected.has(toIndex)) {
          continue;
        }

        const fromRoom = rooms[fromIndex];
        const toRoom = rooms[toIndex];
        if (fromRoom === undefined || toRoom === undefined) {
          continue;
        }

        const fromCenter = roomCenter(fromRoom);
        const toCenter = roomCenter(toRoom);
        const distance =
          Math.abs(fromCenter.x - toCenter.x) + Math.abs(fromCenter.y - toCenter.y);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestFrom = fromIndex;
          bestTo = toIndex;
        }
      }
    }

    if (bestFrom < 0 || bestTo < 0) {
      break;
    }

    const fromRoom = rooms[bestFrom];
    const toRoom = rooms[bestTo];
    if (fromRoom === undefined || toRoom === undefined) {
      break;
    }

    next = carveCorridor(
      next,
      roomCenter(fromRoom),
      roomCenter(toRoom),
      profile.corridorStyle,
      rng,
    );
    connected.add(bestTo);
  }

  if (profile.placementMode === "ring" && rooms.length > 2) {
    const first = rooms[0];
    const last = rooms[rooms.length - 1];
    if (first !== undefined && last !== undefined) {
      next = carveCorridor(
        next,
        roomCenter(first),
        roomCenter(last),
        profile.corridorStyle,
        rng,
      );
    }
  }

  return next;
};

const positionInRoom = (room: RoomRect, rng: Rng): Position => ({
  x: rng.int(room.x + 1, room.x + room.width - 2),
  y: rng.int(room.y + 1, room.y + room.height - 2),
});

const placeSpecials = (
  grid: TileGrid,
  rooms: readonly RoomRect[],
  rng: Rng,
): {
  grid: TileGrid;
  entrance: Position;
  stairsDown: Position;
  entranceRoomIndex: number;
  stairsRoomIndex: number;
} | null => {
  if (rooms.length < 2) {
    return null;
  }

  const entranceRoomIndex = rng.int(0, rooms.length - 1);
  let stairsRoomIndex = rng.int(0, rooms.length - 1);
  let guard = 0;

  while (stairsRoomIndex === entranceRoomIndex && guard < rooms.length * 4) {
    stairsRoomIndex = rng.int(0, rooms.length - 1);
    guard += 1;
  }

  if (stairsRoomIndex === entranceRoomIndex) {
    return null;
  }

  const entranceRoom = rooms[entranceRoomIndex];
  const stairsRoom = rooms[stairsRoomIndex];
  if (entranceRoom === undefined || stairsRoom === undefined) {
    return null;
  }

  const entrance = positionInRoom(entranceRoom, rng);
  let stairsDown = positionInRoom(stairsRoom, rng);
  guard = 0;
  while (
    (stairsDown.x === entrance.x && stairsDown.y === entrance.y) &&
    guard < 32
  ) {
    stairsDown = positionInRoom(stairsRoom, rng);
    guard += 1;
  }

  let next = withTile(grid, entrance, createTile(Terrain.Entrance));
  next = withTile(next, stairsDown, createTile(Terrain.StairsDown));

  return {
    grid: next,
    entrance,
    stairsDown,
    entranceRoomIndex,
    stairsRoomIndex,
  };
};

const isJunctionTile = (grid: TileGrid, position: Position): boolean => {
  if (!inBounds(grid, position)) {
    return false;
  }

  const tile = getTile(grid, position);
  if (tile.terrain !== Terrain.Floor) {
    return false;
  }

  let wallNeighbors = 0;
  let floorNeighbors = 0;

  for (const offset of CARDINAL_OFFSETS) {
    const neighbor = { x: position.x + offset.x, y: position.y + offset.y };
    if (!inBounds(grid, neighbor)) {
      wallNeighbors += 1;
      continue;
    }

    const neighborTile = getTile(grid, neighbor);
    if (neighborTile.terrain === Terrain.Wall) {
      wallNeighbors += 1;
    } else if (isWalkableTile(neighborTile)) {
      floorNeighbors += 1;
    }
  }

  return wallNeighbors >= 1 && floorNeighbors >= 1;
};

const placeDoors = (
  grid: TileGrid,
  doorChancePercent: number,
  rng: Rng,
): TileGrid => {
  let next = grid;
  const candidates: Position[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const position = { x, y };
      if (isJunctionTile(grid, position)) {
        candidates.push(position);
      }
    }
  }

  const ordered = rng.shuffle(candidates);

  for (const position of ordered) {
    if (!rng.percent(doorChancePercent)) {
      continue;
    }

    const tile = getTile(next, position);
    if (tile.terrain !== Terrain.Floor) {
      continue;
    }

    next = withTile(next, position, createTile(Terrain.Door, "closed"));
  }

  return next;
};

const countWalkableCells = (grid: TileGrid): number => {
  let count = 0;

  for (const tile of grid.tiles) {
    if (isWalkableTile(tile)) {
      count += 1;
    }
  }

  return count;
};

const bfsReachableCount = (grid: TileGrid, origin: Position): number | null => {
  const startIndex = idx(grid, origin);
  const startTile = grid.tiles[startIndex];
  if (startTile === undefined || !isWalkableTile(startTile)) {
    return null;
  }

  const visited = new Set<number>([startIndex]);
  const queue: number[] = [startIndex];
  let iterations = 0;

  while (queue.length > 0) {
    iterations += 1;
    if (iterations > CONNECTIVITY_ITERATION_CAP) {
      return null;
    }

    const currentIndex = queue.shift();
    if (currentIndex === undefined) {
      break;
    }

    const current = {
      x: currentIndex % grid.width,
      y: Math.floor(currentIndex / grid.width),
    };

    for (const neighbor of neighbors8(grid, current)) {
      const neighborIndex = idx(grid, neighbor);
      if (visited.has(neighborIndex)) {
        continue;
      }

      const tile = grid.tiles[neighborIndex];
      if (tile === undefined || !isWalkableTile(tile)) {
        continue;
      }

      visited.add(neighborIndex);
      queue.push(neighborIndex);
    }
  }

  return visited.size;
};

const assertConnectivity = (grid: TileGrid, entrance: Position): boolean => {
  const reachable = bfsReachableCount(grid, entrance);
  if (reachable === null) {
    return false;
  }

  return reachable === countWalkableCells(grid);
};

const scaledProfileForAttempt = (
  profile: FlavorProfile,
  attemptIndex: number,
): FlavorProfile => {
  if (attemptIndex === 0) {
    return profile;
  }

  const shrink = Math.min(attemptIndex, 3);
  return {
    ...profile,
    roomWidthMax: Math.max(profile.roomWidthMin, profile.roomWidthMax - shrink),
    roomHeightMax: Math.max(profile.roomHeightMin, profile.roomHeightMax - shrink),
    roomPadding: Math.max(1, profile.roomPadding - (attemptIndex > 1 ? 1 : 0)),
    corridorStyle: attemptIndex > 2 ? "direct" : profile.corridorStyle,
  };
};

const attemptGeneration = (
  params: FloorParams,
  geometry: ResolvedGeometry,
  profile: FlavorProfile,
  attemptSeed: string,
  attemptIndex: number,
): GenerateFloorResult => {
  const rng = createRng(attemptSeed).fork("floorgen");
  const attemptProfile = scaledProfileForAttempt(profile, attemptIndex);
  const targetCount = resolveRoomCount(
    params.roomCountRange,
    attemptProfile.roomCountBias,
    rng.nextUint32() / 0x1_0000_0000,
  );

  const rooms = placeRooms(geometry, attemptProfile, targetCount, rng);
  if (rooms === null) {
    return makeError(
      "placement_exhausted",
      `failed to place ${targetCount} rooms within iteration cap`,
      1,
    );
  }

  let grid = createTileGrid({
    width: geometry.width,
    height: geometry.height,
    fill: Terrain.Wall,
  });

  for (const room of rooms) {
    grid = carveRoom(grid, room);
  }

  grid = connectRooms(grid, rooms, attemptProfile, rng);

  const specials = placeSpecials(grid, rooms, rng);
  if (specials === null) {
    return makeError(
      "placement_exhausted",
      "failed to place entrance and stairs in distinct rooms",
      1,
    );
  }

  grid = placeDoors(specials.grid, attemptProfile.doorChancePercent, rng);

  if (!assertConnectivity(grid, specials.entrance)) {
    return makeError(
      "connectivity_failed",
      "post-generation connectivity assertion failed",
      1,
    );
  }

  return {
    ok: true,
    floor: {
      grid,
      entrance: specials.entrance,
      stairsDown: specials.stairsDown,
      entranceRoomIndex: specials.entranceRoomIndex,
      stairsRoomIndex: specials.stairsRoomIndex,
      rooms,
    },
  };
};

export const floorParamsForBand = (
  band: MapDepthBand,
  flavor: LayoutFlavor,
  seed: string,
  gameConfig: GameConfig = defaultConfig,
): FloorParams => {
  const geometry = gameConfig.runStructure.floorGeometry[band];
  return {
    bandOrSize: band,
    roomCountRange: geometry.rooms,
    flavor,
    seed,
  };
};

export const generateFloor = (
  params: FloorParams,
  gameConfig: GameConfig = defaultConfig,
): GenerateFloorResult => {
  const geometry = resolveGeometry(params.bandOrSize, gameConfig);
  const profile = flavorProfile(params.flavor, geometry.width, geometry.height);

  for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt += 1) {
    const attemptSeed =
      attempt === 0 ? params.seed : `${params.seed}:retry:${attempt}`;
    const result = attemptGeneration(
      params,
      geometry,
      profile,
      attemptSeed,
      attempt,
    );

    if (result.ok) {
      return result;
    }
  }

  return makeError(
    "retry_exhausted",
    `floor generation failed after ${MAX_GENERATION_RETRIES} attempts`,
    MAX_GENERATION_RETRIES,
  );
};

export const serializeGridBytes = (grid: TileGrid): string =>
  JSON.stringify(grid.tiles);

export const roomContaining = (
  rooms: readonly RoomRect[],
  position: Position,
): number | null => {
  for (let index = 0; index < rooms.length; index += 1) {
    const room = rooms[index];
    if (room === undefined) {
      continue;
    }

    if (
      position.x >= room.x &&
      position.x < room.x + room.width &&
      position.y >= room.y &&
      position.y < room.y + room.height
    ) {
      return index;
    }
  }

  return null;
};

export type { FloorParams, LayoutFlavor, RoomCountRange, FloorBandOrSize };
