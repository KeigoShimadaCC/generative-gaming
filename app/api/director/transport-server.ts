import {
  defaultGate2Config,
  type Gate2Config,
  type Gate2RunOptions
} from "../../../src/gauntlet/gate2/run.js";
import {
  createRunControllerRegistry,
  createTransportHandlers,
  type TransportHandlers
} from "../../../src/director/orchestration/transport.js";
import { AmbientDirectorProvider } from "../../../src/director/provider/ambient.js";
import { MockDirectorProvider } from "../../../src/director/provider/mock.js";
import type {
  DirectorProvider,
  GenerateManifestOptions,
  JudgeOptions,
  JudgeResult,
  ProviderResult
} from "../../../src/director/provider/types.js";
import { depthBandForDepth } from "../../../src/engine/state/init.js";
import {
  MemoryArtifactFs,
  type ArtifactReadOptions
} from "../../../src/harness/artifacts/index.js";
import type {
  DepthBand,
  QuestDefinition
} from "../../../src/schemas/entities/index.js";
import {
  validLowestManifestFixture,
  validMiddleManifestFixture,
  validShallowsManifestFixture
} from "../../../src/schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../../src/schemas/manifest.js";

const ROOT_DIR = "runs";
const SEED = "web-transport";
const MODEL_ID = "mock-web-transport";
const CREATED_AT = "2026-06-12T00:00:00.000Z";
const USE_AMBIENT = process.env.AMBIENT === "1";

const relaxHp = (
  threshold: Gate2Config["thresholdsByBand"]["shallows"]
): Gate2Config["thresholdsByBand"]["shallows"] => ({
  ...threshold,
  medianHpRetentionPercent: {
    ...threshold.medianHpRetentionPercent,
    max: 100
  }
});

const passingGate2 = (): Gate2RunOptions => {
  const base = defaultGate2Config(validShallowsManifestFixture);

  return {
    config: {
      ...base,
      policies: ["balanced", "aggressive"],
      seeds: ["web-gate2-a", "web-gate2-b"],
      maxTurns: 120,
      wallClockBudgetMs: 1_000,
      thresholdsByBand: {
        shallows: relaxHp(base.thresholdsByBand.shallows),
        middle: relaxHp(base.thresholdsByBand.middle),
        lowest: relaxHp(base.thresholdsByBand.lowest)
      }
    }
  };
};

const fixtureByBand = {
  shallows: validShallowsManifestFixture,
  middle: validMiddleManifestFixture,
  lowest: validLowestManifestFixture
} satisfies Readonly<Record<DepthBand, FloorManifest>>;

class DepthAwareFixtureProvider implements DirectorProvider {
  private readonly judgeProvider = new MockDirectorProvider({ latencyMs: 0 });

  async generateManifest(
    prompt: string,
    options: GenerateManifestOptions = {}
  ): Promise<ProviderResult> {
    void options;
    const depth = requestedDepth(prompt);
    const manifest = manifestForDepth(depth);

    return {
      ok: true,
      raw: JSON.stringify(manifest),
      manifest,
      usage: { latencyMs: 0, tokens: null }
    };
  }

  async judge(
    prompt: string,
    options: JudgeOptions = {}
  ): Promise<JudgeResult> {
    return this.judgeProvider.judge(prompt, options);
  }
}

const requestedDepth = (prompt: string): number => {
  const match = /Generate a new floor manifest for depth (\d+) in the/u.exec(
    prompt
  );
  if (match === null) {
    return validShallowsManifestFixture.depth;
  }

  return Number.parseInt(match[1] ?? "", 10);
};

const manifestForDepth = (depth: number): FloorManifest => {
  const band = depthBandForDepth(depth);
  const fixture = fixtureByBand[band];

  return withFloorLocalRefs({
    ...fixture,
    depth,
    band,
    params: {
      ...fixture.params,
      bandOrSize: band,
      seed: `web-transport-${band}-${depth}`
    }
  } satisfies FloorManifest);
};

const withFloorLocalRefs = (manifest: FloorManifest): FloorManifest => {
  if (manifest.items.length < 2) {
    return manifest;
  }

  const [primaryItem, secondaryItem] = manifest.items;
  const patchQuest = (quest: QuestDefinition): QuestDefinition => {
    if (quest.objective.kind !== "fetch" || quest.objective.fetch === null) {
      return quest;
    }

    return {
      ...quest,
      objective: {
        ...quest.objective,
        fetch: {
          ...quest.objective.fetch,
          itemId: primaryItem!.id
        }
      }
    };
  };

  return {
    ...manifest,
    quest: manifest.quest === null ? null : patchQuest(manifest.quest),
    npcs: manifest.npcs.map((npc) => ({
      ...npc,
      merchantInventoryItemIds: [primaryItem!.id, secondaryItem!.id],
      questHook: npc.questHook === null ? null : patchQuest(npc.questHook)
    }))
  };
};

const createWebProvider = (): DirectorProvider =>
  USE_AMBIENT ? new AmbientDirectorProvider() : new DepthAwareFixtureProvider();

type WebTransportState = {
  readonly handlers: TransportHandlers;
  readonly artifacts: ArtifactReadOptions;
};

export const createWebTransportState = (): WebTransportState => {
  const registry = createRunControllerRegistry();
  const fs = new MemoryArtifactFs();
  const artifacts = { fs, rootDir: ROOT_DIR };

  return {
    artifacts,
    handlers: createTransportHandlers(registry, {
      seed: SEED,
      modelId: USE_AMBIENT ? "ambient-web-transport" : MODEL_ID,
      provider: createWebProvider(),
      gate2: passingGate2(),
      artifacts,
      now: () => CREATED_AT
    })
  };
};

const transportGlobal = globalThis as typeof globalThis & {
  __ggWebTransportState?: WebTransportState;
};

const getWebTransportState = (): WebTransportState => {
  transportGlobal.__ggWebTransportState ??= createWebTransportState();
  return transportGlobal.__ggWebTransportState;
};

export const getTransportHandlers = (): TransportHandlers =>
  getWebTransportState().handlers;

export const getArtifactReadOptions = (): ArtifactReadOptions =>
  getWebTransportState().artifacts;
