import type {
  FloorContent,
  FloorContentProvider,
} from "../../../src/engine/run/index.js";
import type {
  EnemyDefinition,
  ItemDefinition,
  NpcDefinition,
  TrapDefinition,
} from "../../../src/schemas/entities/index.js";
import { validShallowsManifestFixture } from "../../../src/schemas/fixtures/manifest.js";

export type FallbackFloorContentProviderOptions = {
  readonly root?: URL;
  readonly hoard?: unknown;
};

export class FallbackFloorContentProvider implements FloorContentProvider {
  getFloor(_depth: number, seed: string): FloorContent {
    return {
      params: {
        ...validShallowsManifestFixture.params,
        seed,
      },
      roster: validShallowsManifestFixture.roster.map(stripPlacementHint),
      items: validShallowsManifestFixture.items.map(stripPlacementHint),
      traps: validShallowsManifestFixture.traps.map(stripPlacementHint),
      npcs: validShallowsManifestFixture.npcs.map(stripPlacementHint),
      ...(validShallowsManifestFixture.quest === null
        ? {}
        : { quest: validShallowsManifestFixture.quest }),
    };
  }
}

export const createFallbackFloorContentProvider =
  (): FallbackFloorContentProvider => new FallbackFloorContentProvider();

const stripPlacementHint = <
  Entry extends EnemyDefinition | ItemDefinition | TrapDefinition | NpcDefinition,
>(
  entry: Entry & { readonly placementHint?: unknown },
): Entry => {
  const definition: Record<string, unknown> = { ...entry };
  delete definition.placementHint;

  return definition as Entry;
};
