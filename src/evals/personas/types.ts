import type { RunAction } from "../../engine/run/loop.js";
import type { BotStateView } from "../../harness/bots/types.js";
import type { BehavioralFacts } from "../../director/prompt/summarize.js";

export type PersonaName =
  | "hoarder"
  | "pacifist"
  | "speedrunner"
  | "completionist"
  | "chaos";

export type PersonaPolicy = {
  readonly name: PersonaName;
  readonly description: string;
  /**
   * Behavioral signature: measurable facts the trace summarizer should recover
   * from committed bank fixtures for this persona.
   */
  readonly signatureComment: string;
  readonly decide: (view: BotStateView) => RunAction;
};

export type PersonaSignatureCheck = {
  readonly label: string;
  readonly pass: (facts: BehavioralFacts) => boolean;
};

export type PersonaSignatureProfile = {
  readonly name: PersonaName;
  readonly checks: readonly PersonaSignatureCheck[];
};

export const PERSONA_BANK_SEEDS = [
  "persona-bank-1",
  "persona-bank-2",
  "persona-bank-3",
] as const;

export type PersonaBankSeed = (typeof PERSONA_BANK_SEEDS)[number];

/** Modest turn cap keeps bank fixtures small and fast to summarize in tests. */
export const PERSONA_BANK_MAX_TURNS = 140;
