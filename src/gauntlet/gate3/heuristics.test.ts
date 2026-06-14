import { describe, expect, it } from "vitest";

import { bounds } from "../../config/index.js";
import {
  type DirectorProvider,
  type GenerateManifestOptions,
  type JudgeOptions,
  type JudgeResult,
  type ProviderResult,
} from "../../director/provider/index.js";
import { loadFallbackContentPack } from "../../harness/content-loader.js";
import {
  MemoryArtifactFs,
  loadGenerationChain,
} from "../../harness/artifacts/index.js";
import {
  validMiddleManifestFixture,
  validShallowsManifestFixture,
} from "../../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import {
  defaultGate2Config,
  type Gate2Config,
} from "../gate2/run.js";
import { generateFloor } from "../repair.js";
import {
  type Gate3Report,
  GATE3_REASON_CODES,
  loadBannedVocabulary,
  runGate3Heuristics,
} from "./heuristics.js";

const USAGE = { latencyMs: 5, tokens: null };

describe("Gate 3 heuristics", () => {
  it("keeps a frozen G3 reason-code surface and valid banned regex data", () => {
    const bannedVocabulary = loadBannedVocabulary();

    expect(GATE3_REASON_CODES).toEqual([
      "G3_BANNED_VOCAB",
      "G3_TEXT_CAP",
      "G3_NARRATION_SECOND_PERSON",
      "G3_NAME_FORMAT",
      "G3_NARRATION_NEAR_DUPLICATE",
      "G3_JUDGE",
    ]);
    expect(bannedVocabulary.patterns.length).toBeGreaterThanOrEqual(60);
    for (const pattern of bannedVocabulary.patterns) {
      expect(pattern.pattern).toContain("\\b");
      expect(() => new RegExp(pattern.pattern, "iu")).not.toThrow();
    }
  });

  it("catches the violation corpus with expected reason codes", () => {
    const cases = violationCorpus();

    expect(cases).toHaveLength(27);
    for (const entry of cases) {
      const report = runGate3Heuristics(entry.manifest, entry.context ?? {});
      const codes = failedCodes(report);

      expect(codes, entry.label).toEqual(expect.arrayContaining([...entry.codes]));
    }
  });

  it("has zero false positives on an on-canon fallback corpus", () => {
    const corpus = onCanonCorpus();

    expect(corpus).toHaveLength(24);
    for (const entry of corpus) {
      const report = runGate3Heuristics(manifestForCanonEntry(entry));

      expect(report.pass, `${entry.path}: ${entry.value}`).toBe(true);
    }
  });

  it("reports malformed banned-vocab regex entries without throwing", () => {
    const report = runGate3Heuristics(validShallowsManifestFixture, {
      bannedVocabulary: {
        version: "malformed-regex-test",
        patterns: [
          {
            id: "broken-pattern",
            pattern: "[",
            reason: "test malformed regex guard",
          },
        ],
      },
    });

    expect(report.pass).toBe(false);
    expect(failedCodes(report)).toEqual(["G3_BANNED_VOCAB"]);
    expect(report.checks[0]?.detail).toContain("broken-pattern");
    expect(report.checks[0]?.detail).toContain("invalid banned-vocab regex");
  });

  it("feeds Gate 3 failures into the repair chain", async () => {
    const fs = new MemoryArtifactFs();
    const bad = withNarration("You click the inventory button.");
    const provider = new SequenceDirectorProvider([
      providerSuccess(bad),
      providerSuccess(validShallowsManifestFixture),
    ]);
    const result = await generateFloor({
      prompt: "Generate floor 3 for gate 3 repair test.",
      provider,
      runId: "gate3-repair",
      depth: validShallowsManifestFixture.depth,
      seed: "gate3-repair-seed",
      modelId: "mock-gate3-provider",
      createdAt: "2026-06-12T00:00:00.000Z",
      recordedAt: "2026-06-12T00:00:01.000Z",
      artifacts: { fs, rootDir: "runs" },
      gate2: passingGate2(validShallowsManifestFixture),
    });
    const loaded = loadGenerationChain("gate3-repair", 3, {
      fs,
      rootDir: "runs",
    });
    const firstGate3 = gate3Report(loaded.attempts[0]?.gateReports);

    expect(provider.prompts).toHaveLength(2);
    expect(provider.prompts[1]).toContain("Gate 3 G3_BANNED_VOCAB");
    expect(provider.prompts[1]).toContain("Gate 3 G3_NARRATION_SECOND_PERSON");
    expect(firstGate3?.pass).toBe(false);
    expect(firstGate3?.checks.some((check) => check.code === "G3_BANNED_VOCAB")).toBe(
      true,
    );
    expect(loaded.outcome.kind).toBe("manifest");
    expect("manifest" in result.floor ? result.floor.manifest.depth : null).toBe(3);
  });
});

type ViolationCase = {
  readonly label: string;
  readonly manifest: FloorManifest;
  readonly codes: readonly Gate3Report["checks"][number]["code"][];
  readonly context?: Parameters<typeof runGate3Heuristics>[1];
};

type CanonCorpusEntry = {
  readonly path: string;
  readonly kind: "name" | "description_dialogue";
  readonly value: string;
};

const violationCorpus = (): readonly ViolationCase[] => [
  banned("smartphone", "the goblin checks his smartphone"),
  banned("click inventory button", "click the inventory button"),
  banned("inventory button", "press the inventory button"),
  banned("slang", "lol nice"),
  banned("laptop", "a laptop hums under the altar"),
  banned("internet", "the kept one asks for the internet"),
  banned("laser", "a laser opens the old lock"),
  banned("rifle", "a rifle waits beside the stair"),
  banned("bullet", "a silver bullet rolls underfoot"),
  banned("car", "a car idles in the dark"),
  banned("elevator", "the elevator arrives below"),
  banned("camera", "a camera watches you"),
  banned("email", "send the Deep an email"),
  banned("app", "open the mapping app"),
  banned("google", "google the old door"),
  banned("brand logo", "the brand logo"),
  banned("tokyo", "the tunnel points toward Tokyo"),
  banned("meme", "the goblin repeats a meme"),
  banned("hashtag", "a hashtag is scratched in chalk"),
  banned("dollar", "the merchant asks for dollars"),
  banned("taser", "a taser waits in the dust"),
  banned("tv", "the cave shows a tv"),
  {
    label: "first person narration",
    manifest: withNarration("I think you should leave this place."),
    codes: ["G3_NARRATION_SECOND_PERSON"],
  },
  {
    label: "over cap name",
    manifest: withEnemyName("x".repeat(bounds.directorManifest.textCaps.nameMaxChars + 1)),
    codes: ["G3_TEXT_CAP"],
  },
  {
    label: "over cap dialogue",
    manifest: withDialogue("x".repeat(bounds.directorManifest.textCaps.descriptionDialogueLineMaxChars + 1)),
    codes: ["G3_TEXT_CAP"],
  },
  {
    label: "item name format",
    manifest: withTwoItemsOfY(),
    codes: ["G3_NAME_FORMAT"],
  },
  {
    label: "near duplicate narration",
    manifest: validShallowsManifestFixture,
    context: {
      recentNarration: [validShallowsManifestFixture.narration.floorIntro],
    },
    codes: ["G3_NARRATION_NEAR_DUPLICATE"],
  },
];

const banned = (label: string, text: string): ViolationCase => ({
  label,
  manifest: withDialogue(text),
  codes: ["G3_BANNED_VOCAB"],
});

const failedCodes = (report: Gate3Report): readonly string[] =>
  report.checks.filter((check) => !check.pass).map((check) => check.code);

const onCanonCorpus = (): readonly CanonCorpusEntry[] => [
  ...fallbackCanonCorpus().slice(0, 20),
  {
    path: "verifier.landmines.oldLockClicks",
    kind: "description_dialogue",
    value: "old lock clicks",
  },
  {
    path: "verifier.landmines.apple",
    kind: "description_dialogue",
    value: "apple",
  },
  {
    path: "verifier.landmines.bug",
    kind: "description_dialogue",
    value: "bug",
  },
  {
    path: "verifier.landmines.pressYourPalm",
    kind: "description_dialogue",
    value: "press your palm",
  },
];

const withNarration = (floorIntro: string): FloorManifest =>
  ({
    ...validShallowsManifestFixture,
    narration: {
      floorIntro,
      observations: [],
    },
    metadata: {
      ...validShallowsManifestFixture.metadata,
      callbacks: [],
    },
  }) as FloorManifest;

const withEnemyName = (name: string): FloorManifest =>
  ({
    ...validShallowsManifestFixture,
    roster: [
      {
        ...validShallowsManifestFixture.roster[0]!,
        name,
      },
      ...validShallowsManifestFixture.roster.slice(1),
    ],
  }) as FloorManifest;

const withDialogue = (text: string): FloorManifest =>
  ({
    ...validMiddleManifestFixture,
    npcs: [
      {
        ...validMiddleManifestFixture.npcs[0]!,
        dialogue: {
          ...validMiddleManifestFixture.npcs[0]!.dialogue,
          nodes: [
            {
              ...validMiddleManifestFixture.npcs[0]!.dialogue.nodes[0]!,
              text,
            },
            ...validMiddleManifestFixture.npcs[0]!.dialogue.nodes.slice(1),
          ],
        },
      },
    ],
  }) as FloorManifest;

const withTwoItemsOfY = (): FloorManifest =>
  ({
    ...validShallowsManifestFixture,
    items: validShallowsManifestFixture.items.map((item, index) =>
      index === 0
        ? { ...item, name: "knife of dawn" }
        : index === 1
          ? { ...item, name: "bell of night" }
          : item,
    ),
  }) as FloorManifest;

const fallbackCanonCorpus = (): readonly CanonCorpusEntry[] => {
  const pack = loadFallbackContentPack();
  const entries: CanonCorpusEntry[] = [];

  for (const [index, item] of [...pack.items.values()].entries()) {
    entries.push({
      path: `items[${index}].name`,
      kind: "name",
      value: item.name,
    });
  }
  for (const [index, enemy] of [...pack.enemies.values()].entries()) {
    entries.push({
      path: `enemies[${index}].name`,
      kind: "name",
      value: enemy.name,
    });
  }
  for (const [index, trap] of [...pack.traps.values()].entries()) {
    entries.push({
      path: `traps[${index}].name`,
      kind: "name",
      value: trap.name,
    });
  }
  for (const [npcIndex, npc] of [...pack.npcs.values()].entries()) {
    entries.push({
      path: `npcs[${npcIndex}].name`,
      kind: "name",
      value: npc.name,
    });
    for (const [nodeIndex, node] of npc.dialogue.nodes.entries()) {
      entries.push({
        path: `npcs[${npcIndex}].dialogue.nodes[${nodeIndex}].text`,
        kind: "description_dialogue",
        value: node.text,
      });
      for (const [choiceIndex, choice] of node.choices.entries()) {
        entries.push({
          path: `npcs[${npcIndex}].dialogue.nodes[${nodeIndex}].choices[${choiceIndex}].label`,
          kind: "description_dialogue",
          value: choice.label,
        });
      }
    }
  }
  for (const [index, quest] of [...pack.quests.values()].entries()) {
    entries.push({
      path: `quests[${index}].title`,
      kind: "name",
      value: quest.title,
    });
  }

  return entries;
};

const manifestForCanonEntry = (entry: CanonCorpusEntry): FloorManifest =>
  entry.kind === "name" ? withEnemyName(entry.value) : withDialogue(entry.value);

class SequenceDirectorProvider implements DirectorProvider {
  readonly prompts: string[] = [];
  readonly options: GenerateManifestOptions[] = [];
  private readonly results: ProviderResult[];

  constructor(results: readonly ProviderResult[]) {
    this.results = [...results];
  }

  async generateManifest(
    prompt: string,
    options: GenerateManifestOptions = {},
  ): Promise<ProviderResult> {
    this.prompts.push(prompt);
    this.options.push(options);

    return this.results.shift() ?? providerSuccess(validShallowsManifestFixture);
  }

  async judge(
    prompt: string,
    options: JudgeOptions = {},
  ): Promise<JudgeResult> {
    void prompt;
    void options;

    return {
      ok: false,
      error: {
        code: "process_error",
        message: "judge unused in gate 3 tests",
      },
      usage: USAGE,
    };
  }
}

const providerSuccess = (manifest: FloorManifest): ProviderResult => ({
  ok: true,
  raw: JSON.stringify(manifest),
  manifest,
  usage: USAGE,
});

const passingGate2 = (manifest: FloorManifest) => ({
  config: currentBotRealityConfig(manifest),
});

const currentBotRealityConfig = (manifest: FloorManifest): Gate2Config => {
  const base = defaultGate2Config(manifest);

  return {
    ...base,
    policies: ["balanced", "aggressive"],
    seeds: ["gate3-gate2-a", "gate3-gate2-b"],
    maxTurns: 120,
    wallClockBudgetMs: 1_000,
    thresholdsByBand: {
      shallows: allowCurrentHpRetention(base.thresholdsByBand.shallows),
      middle: allowCurrentHpRetention(base.thresholdsByBand.middle),
      lowest: allowCurrentHpRetention(base.thresholdsByBand.lowest),
    },
  };
};

const allowCurrentHpRetention = (
  threshold: Gate2Config["thresholdsByBand"]["shallows"],
): Gate2Config["thresholdsByBand"]["shallows"] => ({
  ...threshold,
  medianHpRetentionPercent: {
    ...threshold.medianHpRetentionPercent,
    max: 100,
  },
});

const gate3Report = (
  gateReports: unknown,
): Gate3Report | undefined =>
  gateReports !== null &&
  typeof gateReports === "object" &&
  "gate3" in gateReports
    ? (gateReports.gate3 as Gate3Report | undefined)
    : undefined;
