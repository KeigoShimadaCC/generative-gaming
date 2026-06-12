import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { summarizeTrace } from "../../director/prompt/summarize.js";
import { parseTraceNdjson } from "../../harness/replay/parse.js";
import { createFallbackFloorContentProvider } from "../../harness/fallback-provider.js";
import {
  EVAL_BANK_DIR,
  generatePersonaBankFixtures,
  readPersonaBankFixture,
} from "./bank.js";
import { runPersonaBot } from "./driver.js";
import { personaPolicies } from "./policies/index.js";
import {
  aggregatePersonaFacts,
  buildSeparationMatrix,
  formatSeparationMatrix,
  passesMajority,
  personaSignatureProfiles,
  traceActionFingerprint,
  traceActionKinds,
  verifyChaosTrace,
} from "./signatures.js";
import {
  PERSONA_BANK_MAX_TURNS,
  PERSONA_BANK_SEEDS,
  type PersonaBankSeed,
  type PersonaName,
} from "./types.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const loadBankTrace = (persona: PersonaName, seed: PersonaBankSeed) =>
  parseTraceNdjson(readPersonaBankFixture(persona, seed));

describe("persona policies", () => {
  it("defines five personas with documented signatures", () => {
    expect(personaPolicies.map((persona) => persona.name)).toEqual([
      "hoarder",
      "pacifist",
      "speedrunner",
      "completionist",
      "chaos",
    ]);
    for (const persona of personaPolicies) {
      expect(persona.signatureComment.length).toBeGreaterThan(10);
      expect(persona.description.length).toBeGreaterThan(10);
    }
  });
});

describe("persona bank fixtures", () => {
  it("loads committed traces for personas x seeds", () => {
    for (const persona of personaPolicies) {
      for (const seed of PERSONA_BANK_SEEDS) {
        const trace = loadBankTrace(persona.name, seed);
        expect(trace.header.modelId).toBe(persona.name);
        expect(trace.header.seed).toBe(seed);
        expect(trace.turns.length).toBeGreaterThan(0);
        expect(trace.turns.length).toBeLessThanOrEqual(PERSONA_BANK_MAX_TURNS + 1);
      }
    }
  });
});

describe("persona signature verification", () => {
  it("hoarder: pickups dominate uses across bank traces", () => {
    const facts = PERSONA_BANK_SEEDS.map((seed) =>
      summarizeTrace(loadBankTrace("hoarder", seed)).facts,
    );
    const failed = passesMajority(
      personaSignatureProfiles.hoarder.checks,
      facts,
      2,
    );
    expect(failed, failed.join(", ")).toEqual([]);
    for (const sample of facts) {
      expect(sample.itemPickups).toBeGreaterThan(sample.itemUses);
      expect(sample.hoardingSignal).toBeGreaterThanOrEqual(2);
    }
  });

  it("pacifist: zero voluntary combat engagement", () => {
    const facts = PERSONA_BANK_SEEDS.map((seed) =>
      summarizeTrace(loadBankTrace("pacifist", seed)).facts,
    );
    const failed = passesMajority(
      personaSignatureProfiles.pacifist.checks,
      facts,
      3,
    );
    expect(failed, failed.join(", ")).toEqual([]);
    for (const sample of facts) {
      expect(sample.fightsPicked).toBe(0);
      expect(sample.combatEngagementRate).toBe(0);
    }
  });

  it("speedrunner: low pickup and per-floor exploration footprint", () => {
    const facts = PERSONA_BANK_SEEDS.map((seed) =>
      summarizeTrace(loadBankTrace("speedrunner", seed)).facts,
    );
    const failed = passesMajority(
      personaSignatureProfiles.speedrunner.checks,
      facts,
      2,
    );
    expect(failed, failed.join(", ")).toEqual([]);
    const aggregates = aggregatePersonaFacts(
      "speedrunner",
      facts,
      PERSONA_BANK_SEEDS.map((seed) => loadBankTrace("speedrunner", seed)),
    );
    expect(aggregates.floorsEntered).toBeGreaterThanOrEqual(2);
  });

  it("completionist: NPC engagement and broad coverage in bank aggregate", () => {
    const traces = PERSONA_BANK_SEEDS.map((seed) =>
      loadBankTrace("completionist", seed),
    );
    const facts = traces.map((trace) => summarizeTrace(trace).facts);
    const aggregate = aggregatePersonaFacts("completionist", facts, traces);

    expect(aggregate.facts.npcTalksInitiated).toBeGreaterThan(0);
    expect(aggregate.facts.cellsVisited).toBeGreaterThanOrEqual(35);
    const failed = passesMajority(
      personaSignatureProfiles.completionist.checks,
      facts,
      1,
    );
    expect(failed, failed.join(", ")).toEqual([]);
  });

  it("chaos: seeded action diversity with per-seed determinism", () => {
    const traces = PERSONA_BANK_SEEDS.map((seed) => loadBankTrace("chaos", seed));
    for (const trace of traces) {
      expect(verifyChaosTrace(trace)).toEqual([]);
      expect(traceActionKinds(trace).length).toBeGreaterThanOrEqual(3);
    }

    const fingerprints = traces.map((trace) => traceActionFingerprint(trace));
    expect(new Set(fingerprints).size).toBeGreaterThanOrEqual(2);
  });
});

describe("persona pairwise separation matrix", () => {
  it("distinguishes all five personas on at least two summarizer facts", () => {
    const aggregates = personaPolicies.map((persona) => {
      const traces = PERSONA_BANK_SEEDS.map((seed) =>
        loadBankTrace(persona.name, seed),
      );
      const facts = traces.map((trace) => summarizeTrace(trace).facts);
      return aggregatePersonaFacts(persona.name, facts, traces);
    });

    const matrix = buildSeparationMatrix(aggregates);
    expect(matrix).toHaveLength(10);

    for (const entry of matrix) {
      expect(
        entry.facts.length,
        `${entry.left} vs ${entry.right}: ${entry.facts.join(", ")}`,
      ).toBeGreaterThanOrEqual(2);
    }

    const printMatrix = (): boolean => {
      const host = globalThis as {
        readonly process?: { readonly env?: { readonly PRINT_SEPARATION_MATRIX?: string } };
      };
      return host.process?.env?.PRINT_SEPARATION_MATRIX === "1";
    };

    if (printMatrix()) {
      console.log(`\n${formatSeparationMatrix(matrix)}`);
    }
  });
});

describe("persona bank determinism", () => {
  it("generatePersonaBankFixtures writes under tests/eval-bank", () => {
    const fixtures = generatePersonaBankFixtures();
    expect(fixtures).toHaveLength(15);
    for (const fixture of fixtures) {
      expect(fixture.absolutePath.startsWith(EVAL_BANK_DIR)).toBe(true);
      expect(readFileSync(join(repoRoot, fixture.relativePath), "utf8").length).toBeGreaterThan(
        0,
      );
    }
  });

  it("regenerates byte-identical fixtures for the same seeds", () => {
    const provider = createFallbackFloorContentProvider();
    for (const persona of personaPolicies) {
      for (const seed of PERSONA_BANK_SEEDS) {
        const run = runPersonaBot(persona, seed, provider, PERSONA_BANK_MAX_TURNS, {
          runId: `eval-bank-${persona.name}-${seed}`,
          writer: {
            path: `memory://${persona.name}/${seed}.ndjson`,
            writeHeader: () => {},
            appendTurn: () => {},
          },
        });
        const committed = readPersonaBankFixture(persona.name, seed);
        expect(run.trace.content).toBe(committed);
      }
    }
  });
});
