import type { GameBounds, GameConfig } from "../../config/index.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import type { TraceSummaryResult } from "./summarize.js";

export type RunContext = {
  readonly seed: string;
  readonly runId?: string;
};

export type AssemblePromptInput = {
  readonly band: DepthBand;
  readonly depth: number;
  readonly config: GameConfig;
  readonly bounds: GameBounds;
  readonly traceFacts: TraceSummaryResult;
  readonly memoryBlock?: string | null;
  readonly runContext: RunContext;
};

/** Character budget guard for assembled Director prompts (~8k tokens). */
export const PROMPT_MAX_CHAR_LENGTH = 32_000;
