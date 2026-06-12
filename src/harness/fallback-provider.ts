import { config } from "../config/index.js";
import type {
  FloorContent,
  FloorContentProvider,
  HoardFeatureParams,
} from "../engine/run/loop.js";
import {
  FallbackContentValidationError,
  getFallbackFloor,
  loadFallbackContentPack,
  type FallbackContentPack,
  type ResolvedFallbackFloor,
} from "./content-loader.js";

export type FallbackProviderErrorCode =
  | "fallback_content_invalid"
  | "fallback_depth_unavailable";

export class FallbackProviderError extends Error {
  readonly kind = "fallback-provider-error";
  readonly code: FallbackProviderErrorCode;
  readonly depth: number | null;
  readonly file: string | null;
  readonly entityId: string | null;
  readonly source: unknown;

  constructor(
    code: FallbackProviderErrorCode,
    depth: number | null,
    message: string,
    source: unknown,
  ) {
    super(message);
    this.name = "FallbackProviderError";
    this.code = code;
    this.depth = depth;
    this.source = source;

    if (source instanceof FallbackContentValidationError) {
      this.file = source.file;
      this.entityId = source.entityId;
      return;
    }

    this.file = null;
    this.entityId = null;
  }
}

export type FallbackFloorContentProviderOptions = {
  readonly root?: URL;
  readonly hoard?: HoardFeatureParams;
};

const DEFAULT_HOARD: HoardFeatureParams = {
  id: "hoard",
  name: "The Hoard",
  hint: { distance: "far_from_entrance" },
};

export class FallbackFloorContentProvider implements FloorContentProvider {
  readonly pack: FallbackContentPack;
  private readonly floors: ReadonlyMap<number, ResolvedFallbackFloor>;
  private readonly hoard: HoardFeatureParams;

  constructor(options: FallbackFloorContentProviderOptions = {}) {
    this.hoard = options.hoard ?? DEFAULT_HOARD;

    try {
      this.pack = loadFallbackContentPack(options.root);
      this.floors = validateFloors(this.pack);
    } catch (error) {
      if (error instanceof FallbackProviderError) {
        throw error;
      }

      throw wrapProviderError("fallback_content_invalid", null, error);
    }
  }

  getFloor(depth: number, seed: string): FloorContent {
    const floor = this.floors.get(depth);
    if (floor === undefined) {
      throw new FallbackProviderError(
        "fallback_depth_unavailable",
        depth,
        `fallback floor ${depth} is not available`,
        null,
      );
    }

    return {
      params: {
        ...floor.params,
        seed,
        ...(depth === config.runStructure.depthFloors
          ? { hoard: this.hoard }
          : {}),
      },
      roster: floor.roster,
      items: floor.items,
      traps: floor.traps,
      npcs: floor.npcs,
      ...(floor.quest === null ? {} : { quest: floor.quest }),
    };
  }
}

export const createFallbackFloorContentProvider = (
  options: FallbackFloorContentProviderOptions = {},
): FallbackFloorContentProvider => new FallbackFloorContentProvider(options);

const validateFloors = (
  pack: FallbackContentPack,
): ReadonlyMap<number, ResolvedFallbackFloor> => {
  const floors = new Map<number, ResolvedFallbackFloor>();

  for (let depth = 1; depth <= config.runStructure.depthFloors; depth += 1) {
    try {
      floors.set(depth, getFallbackFloor(pack, depth));
    } catch (error) {
      throw wrapProviderError("fallback_content_invalid", depth, error);
    }
  }

  return floors;
};

const wrapProviderError = (
  code: FallbackProviderErrorCode,
  depth: number | null,
  source: unknown,
): FallbackProviderError => {
  const sourceMessage = source instanceof Error ? source.message : String(source);
  const message =
    depth === null
      ? `fallback content pack is invalid: ${sourceMessage}`
      : `fallback floor ${depth} is invalid: ${sourceMessage}`;

  return new FallbackProviderError(code, depth, message, source);
};
