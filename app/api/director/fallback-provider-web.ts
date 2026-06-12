import type {
  FloorContent,
  FloorContentProvider,
} from "../../../src/engine/run/index.js";
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
      roster: validShallowsManifestFixture.roster,
      items: validShallowsManifestFixture.items,
      traps: validShallowsManifestFixture.traps,
      npcs: validShallowsManifestFixture.npcs,
      ...(validShallowsManifestFixture.quest === null
        ? {}
        : { quest: validShallowsManifestFixture.quest }),
    };
  }
}

export const createFallbackFloorContentProvider =
  (): FallbackFloorContentProvider => new FallbackFloorContentProvider();
