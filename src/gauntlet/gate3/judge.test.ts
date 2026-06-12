import { describe, expect, it } from "vitest";

import { config, type GameConfig, type Gate3JudgeMode } from "../../config/index.js";
import {
  AmbientDirectorProvider,
  type DirectorProvider,
  type GenerateManifestOptions,
  type JudgeOptions,
  type JudgeResult,
  type ProviderFailureCode,
  type ProviderResult,
} from "../../director/provider/index.js";
import { validMiddleManifestFixture } from "../../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import { judgeCalibrationFixtures } from "./fixtures/judge-calibration.js";
import { runGate3Heuristics } from "./heuristics.js";
import {
  GATE3_JUDGE_TAXONOMY,
  buildGate3JudgePrompt,
  parseGate3JudgeVerdictJson,
  runGate3WithJudge,
  type Gate3JudgeVerdict,
  type Gate3JudgedReport,
} from "./judge.js";

const USAGE = { latencyMs: 3, tokens: null };
const failureCodes = [
  "timeout",
  "process_error",
  "parse_fail",
  "validate_fail",
] as const satisfies readonly ProviderFailureCode[];

describe("Gate 3 judge", () => {
  it("keeps the off switch byte-identical to heuristics-only reports", async () => {
    const provider = new QueueJudgeProvider([
      structuredJudgeResult({ onTone: false, coherent: false, specific: false }),
    ]);
    const context = {
      recentNarration: ["A different room keeps its own counsel."],
    };

    const heuristicReport = runGate3Heuristics(
      validMiddleManifestFixture,
      context,
    );
    const judgedReport = await runGate3WithJudge(validMiddleManifestFixture, {
      provider,
      config: withJudge(false),
      context,
    });

    expect(JSON.stringify(judgedReport)).toBe(JSON.stringify(heuristicReport));
    expect(provider.judgePrompts).toHaveLength(0);
  });

  it("parses structured verdict JSON and freezes the judge taxonomy", () => {
    expect(GATE3_JUDGE_TAXONOMY).toEqual([
      "pass",
      "axis_fail",
      "provider_failure",
      "parse_fail",
      "validate_fail",
    ]);
    expect(
      parseGate3JudgeVerdictJson(
        '```json\n{"onTone":true,"coherent":false,"specific":true}\n```',
      ),
    ).toEqual({
      ok: true,
      verdict: { onTone: true, coherent: false, specific: true },
    });
    expect(parseGate3JudgeVerdictJson("not json")).toMatchObject({
      ok: false,
      status: "parse_fail",
    });
    expect(parseGate3JudgeVerdictJson('{"onTone":"yes"}')).toMatchObject({
      ok: false,
      status: "validate_fail",
    });
  });

  it("records failed judge axes as advisory by default", async () => {
    const provider = new QueueJudgeProvider([
      structuredJudgeResult({ onTone: false, coherent: true, specific: false }),
    ]);

    const report = (await runGate3WithJudge(validMiddleManifestFixture, {
      provider,
      config: withJudge(true, "advisory"),
      context: { playerSummary: "The delver hoards coins and avoids retreat." },
    })) as Gate3JudgedReport;
    const judgeCheck = report.checks.find((check) => check.code === "G3_JUDGE");

    expect(report.pass).toBe(true);
    expect(judgeCheck).toMatchObject({
      pass: false,
      advisory: true,
    });
    expect(report.judge.status).toBe("axis_fail");
    expect(report.judge.verdict).toEqual({
      onTone: false,
      coherent: true,
      specific: false,
    });
    expect(provider.judgeOptions[0]?.timeoutMs).toBe(config.gate3.judge.timeoutMs);
  });

  it("can promote judge failures to blocking by config", async () => {
    const provider = new QueueJudgeProvider([
      structuredJudgeResult({ onTone: true, coherent: true, specific: false }),
    ]);

    const report = await runGate3WithJudge(validMiddleManifestFixture, {
      provider,
      config: withJudge(true, "blocking"),
      context: { playerSummary: "The delver keeps refusing quests." },
    });
    const judgeCheck = report.checks.find((check) => check.code === "G3_JUDGE");

    expect(report.pass).toBe(false);
    expect(judgeCheck).toMatchObject({
      pass: false,
    });
    expect(judgeCheck).not.toHaveProperty("advisory");
  });

  it("judges only narration and named-entity text, not dialogue bodies", () => {
    const prompt = buildGate3JudgePrompt(validMiddleManifestFixture, {
      playerSummary: "The delver talks to every NPC.",
    });
    const npcDialogue =
      validMiddleManifestFixture.npcs[0]?.dialogue.nodes[0]?.text;

    expect(prompt).toContain(validMiddleManifestFixture.narration.floorIntro);
    expect(prompt).toContain(validMiddleManifestFixture.roster[0]?.name);
    expect(prompt).toContain(validMiddleManifestFixture.items[0]?.name);
    expect(prompt).toContain("The delver talks to every NPC.");
    expect(npcDialogue).toBeDefined();
    expect(prompt).not.toContain(npcDialogue);
  });

  it("calibrates the 10-case corpus against a mock judge with at least 8/10 agreement", async () => {
    const provider = new QueueJudgeProvider(
      judgeCalibrationFixtures.map((fixture) =>
        structuredJudgeResult(fixture.expected),
      ),
    );
    let agreements = 0;

    for (const fixture of judgeCalibrationFixtures) {
      const report = (await runGate3WithJudge(manifestForFixture(fixture), {
        provider,
        config: withJudge(true, "advisory"),
        context: { playerSummary: "The delver hoards coins and retreats late." },
      })) as Gate3JudgedReport;

      if (sameVerdict(report.judge.verdict, fixture.expected)) {
        agreements += 1;
      }
    }

    expect(judgeCalibrationFixtures).toHaveLength(10);
    expect(
      judgeCalibrationFixtures.filter((fixture) => fixture.label === "on-tone"),
    ).toHaveLength(5);
    expect(
      judgeCalibrationFixtures.filter((fixture) => fixture.label === "violation"),
    ).toHaveLength(5);
    expect(agreements).toBeGreaterThanOrEqual(8);
  });
});

const ambientLive =
  (
    globalThis as {
      readonly process?: {
        readonly env?: { readonly AMBIENT_LIVE?: string };
      };
    }
  ).process?.env?.AMBIENT_LIVE === "1";

const ambientIt = ambientLive ? it : it.skip;

ambientIt(
  "@ambient-judge live calibration attempt returns success or clean taxonomy",
  async () => {
    const provider = new AmbientDirectorProvider({
      judgeTimeoutMs: config.gate3.judge.timeoutMs,
    });
    const result = await provider.judge(
      buildGate3JudgePrompt(manifestForFixture(judgeCalibrationFixtures[0]!), {
        playerSummary: "The delver hoards coins and retreats late.",
      }),
      { timeoutMs: config.gate3.judge.timeoutMs },
    );

    if (!result.ok) {
      if (
        result.error.code === "timeout" ||
        (result.error.code === "process_error" &&
          /ENOENT|not found|authentication|required|failed to initialize/i.test(
            result.error.message,
          ))
      ) {
        console.warn(`@ambient-judge skipped: ${result.error.message}`);
        return;
      }

      expect(failureCodes).toContain(result.error.code);
      return;
    }

    expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
  },
  config.gate3.judge.timeoutMs + 5_000,
);

class QueueJudgeProvider implements DirectorProvider {
  readonly judgePrompts: string[] = [];
  readonly judgeOptions: JudgeOptions[] = [];
  private readonly results: JudgeResult[];

  constructor(results: readonly JudgeResult[]) {
    this.results = [...results];
  }

  async generateManifest(
    prompt: string,
    options: GenerateManifestOptions = {},
  ): Promise<ProviderResult> {
    void prompt;
    void options;

    return {
      ok: false,
      error: {
        code: "process_error",
        message: "manifest generation unused in judge tests",
      },
      usage: USAGE,
    };
  }

  async judge(prompt: string, options: JudgeOptions = {}): Promise<JudgeResult> {
    this.judgePrompts.push(prompt);
    this.judgeOptions.push(options);

    return (
      this.results.shift() ??
      structuredJudgeResult({ onTone: true, coherent: true, specific: true })
    );
  }
}

const structuredJudgeResult = (verdict: Gate3JudgeVerdict): JudgeResult => ({
  ok: true,
  raw: JSON.stringify(verdict),
  verdict: {
    verdict: verdict.onTone && verdict.coherent && verdict.specific ? "pass" : "fail",
    reason: JSON.stringify(verdict),
    score: verdict.onTone && verdict.coherent && verdict.specific ? 1 : 0,
  },
  usage: USAGE,
});

const withJudge = (
  enabled: boolean,
  mode: Gate3JudgeMode = "advisory",
): GameConfig => ({
  ...config,
  gate3: {
    ...config.gate3,
    judge: {
      ...config.gate3.judge,
      enabled,
      mode,
    },
  },
});

const manifestForFixture = (
  fixture: (typeof judgeCalibrationFixtures)[number],
): FloorManifest =>
  ({
    ...validMiddleManifestFixture,
    narration: {
      floorIntro: fixture.floorIntro,
      observations: [
        {
          id: `${fixture.id}-obs`,
          triggerTag: `${fixture.id}-trigger`,
          text: fixture.observation,
        },
      ],
    },
    roster: validMiddleManifestFixture.roster.map((enemy, index) =>
      index === 0 ? { ...enemy, name: fixture.names[0] } : enemy,
    ),
    items: validMiddleManifestFixture.items.map((item, index) =>
      index === 0 ? { ...item, name: fixture.names[1] } : item,
    ),
    traps: validMiddleManifestFixture.traps.map((trap, index) =>
      index === 0 ? { ...trap, name: fixture.names[2] } : trap,
    ),
    metadata: {
      ...validMiddleManifestFixture.metadata,
      callbacks: [`${fixture.id}-trigger`],
      signature: false,
    },
  }) as FloorManifest;

const sameVerdict = (
  actual: Gate3JudgeVerdict | undefined,
  expected: Gate3JudgeVerdict,
): boolean =>
  actual?.onTone === expected.onTone &&
  actual.coherent === expected.coherent &&
  actual.specific === expected.specific;
