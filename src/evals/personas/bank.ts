import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createFallbackFloorContentProvider } from "../../harness/fallback-provider.js";
import type { TraceWriter } from "../../harness/trace/recorder.js";
import { personaPolicies } from "./policies/index.js";
import { runPersonaBot } from "./driver.js";
import {
  PERSONA_BANK_MAX_TURNS,
  PERSONA_BANK_SEEDS,
  type PersonaBankSeed,
  type PersonaName,
} from "./types.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
export const EVAL_BANK_DIR = join(repoRoot, "tests/eval-bank");

const memoryTraceWriter = (path: string): TraceWriter => ({
  path,
  writeHeader: () => {},
  appendTurn: () => {},
});

export type PersonaBankFixture = {
  readonly persona: PersonaName;
  readonly seed: PersonaBankSeed;
  readonly relativePath: string;
  readonly absolutePath: string;
};

export const personaBankFixturePath = (
  persona: PersonaName,
  seed: PersonaBankSeed,
): string => join(EVAL_BANK_DIR, `${persona}-${seed}.ndjson`);

export const generatePersonaBankFixtures = (): readonly PersonaBankFixture[] => {
  mkdirSync(EVAL_BANK_DIR, { recursive: true });
  const fixtures: PersonaBankFixture[] = [];

  for (const persona of personaPolicies) {
    for (const seed of PERSONA_BANK_SEEDS) {
      const absolutePath = personaBankFixturePath(persona.name, seed);
      const run = runPersonaBot(
        persona,
        seed,
        createFallbackFloorContentProvider(),
        PERSONA_BANK_MAX_TURNS,
        {
          runId: `eval-bank-${persona.name}-${seed}`,
          writer: memoryTraceWriter(`memory://${persona.name}/${seed}.ndjson`),
        },
      );
      writeFileSync(absolutePath, run.trace.content, "utf8");
      fixtures.push({
        persona: persona.name,
        seed,
        relativePath: join("tests/eval-bank", `${persona.name}-${seed}.ndjson`),
        absolutePath,
      });
    }
  }

  return fixtures;
};

export const readPersonaBankFixture = (
  persona: PersonaName,
  seed: PersonaBankSeed,
): string => readFileSync(personaBankFixturePath(persona, seed), "utf8");

export const writePersonaBankFixture = (
  persona: PersonaName,
  seed: PersonaBankSeed,
  content: string,
): void => {
  const path = personaBankFixturePath(persona, seed);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
};
