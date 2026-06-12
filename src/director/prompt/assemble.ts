import {
  HARD_CANON_BLOCK,
  buildPersonaBlock,
  buildTaskBlock,
} from "./blocks.js";
import type { AssemblePromptInput } from "./types.js";
import { PROMPT_MAX_CHAR_LENGTH } from "./types.js";

export const assemblePrompt = (input: AssemblePromptInput): string => {
  const sections = [
    HARD_CANON_BLOCK,
    buildPersonaBlock(input.band),
    input.traceFacts.textBlock,
  ];

  if (input.memoryBlock && input.memoryBlock.trim().length > 0) {
    sections.push(`CROSS-RUN MEMORY\n${input.memoryBlock.trim()}`);
  }

  sections.push(
    buildTaskBlock({
      band: input.band,
      depth: input.depth,
      config: input.config,
      bounds: input.bounds,
      seed: input.runContext.seed,
      playerSummary: input.traceFacts.textBlock,
    }),
  );

  const prompt = sections.join("\n\n");

  if (prompt.length > PROMPT_MAX_CHAR_LENGTH) {
    throw new Error(
      `assembled prompt exceeds budget (${prompt.length} > ${PROMPT_MAX_CHAR_LENGTH} chars)`,
    );
  }

  return prompt;
};

export const promptCharLength = (prompt: string): number => prompt.length;
