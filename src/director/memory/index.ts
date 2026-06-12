import {
  DEFAULT_MEMORY_SELECTION_CONFIG,
  approxMemoryTokens,
  renderMemoryBlock,
  selectMemories,
  type MemorySelectionOptions,
} from "./select.js";
import {
  renderRunCallbackBlock,
  type RunCallbackSnapshot,
  type RunCallbackTracker,
} from "./callbacks.js";
import type { MemoryEventsRepository } from "../../harness/persistence/index.js";

export {
  DEFAULT_MEMORY_SELECTION_CONFIG,
  DEFAULT_MEMORY_TYPE_WEIGHTS,
  approxMemoryTokens,
  renderMemoryBlock,
  selectMemories,
  type MemorySelectionConfig,
  type MemorySelectionOptions,
  type MemoryTypeWeights,
  type SelectedMemory,
} from "./select.js";
export {
  buildLearnedSummary,
  createRunCallbackTracker,
  renderRunCallbackBlock,
  type CallbackReference,
  type CallbackReferenceKind,
  type CallbackRunEvent,
  type RunCallbackRenderOptions,
  type RunCallbackSnapshot,
  type RunCallbackTracker,
} from "./callbacks.js";

export type BuildPromptMemoryBlockOptions = {
  readonly profileId: string;
  readonly currentRunId: string;
  readonly repo: Pick<MemoryEventsRepository, "eventsBySalience" | "recentEvents">;
  readonly callbacks?: RunCallbackSnapshot | RunCallbackTracker;
  readonly selection?: MemorySelectionOptions;
  readonly tokenBudget?: number;
};

export const buildPromptMemoryBlock = (
  options: BuildPromptMemoryBlockOptions,
): string | null => {
  const totalBudget =
    options.tokenBudget
    ?? options.selection?.tokenBudget
    ?? DEFAULT_MEMORY_SELECTION_CONFIG.tokenBudget;
  const callbackBlock = renderCallbacks(options.callbacks, totalBudget);
  const remainingBudget = Math.max(
    0,
    totalBudget - approxMemoryTokens(callbackBlock) - (callbackBlock.length > 0 ? 2 : 0),
  );
  const selection = {
    ...options.selection,
    tokenBudget: remainingBudget,
  } satisfies MemorySelectionOptions;
  const memories = selectMemories(
    options.profileId,
    options.currentRunId,
    options.repo,
    selection,
  );
  const memoryBlock = renderMemoryBlock(memories, selection);
  const block = [callbackBlock, memoryBlock]
    .filter((section) => section.length > 0)
    .join("\n\n");

  return block.length === 0 ? null : block;
};

const renderCallbacks = (
  callbacks: RunCallbackSnapshot | RunCallbackTracker | undefined,
  totalBudget: number,
): string => {
  if (callbacks === undefined) {
    return "";
  }

  const snapshot = "snapshot" in callbacks ? callbacks.snapshot() : callbacks;
  return renderRunCallbackBlock(snapshot, {
    tokenBudget: Math.min(totalBudget, 70),
  });
};
