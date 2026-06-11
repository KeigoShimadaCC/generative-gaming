import { z } from "zod";

import { bounds } from "../../config/index.js";
import { glyphSchema, nonEmptyString } from "../common.js";
import {
  DescriptionDialogueTextSchema,
  EntityNameSchema,
} from "./common.js";
import { QuestDefinitionSchema } from "./quests.js";

export const DialogueChoiceSchema = z.strictObject({
  id: nonEmptyString,
  label: DescriptionDialogueTextSchema,
  nextNodeId: nonEmptyString.nullable(),
  closesDialogue: z.boolean(),
  questHookId: nonEmptyString.nullable(),
});

export const DialogueNodeSchema = z.strictObject({
  id: nonEmptyString,
  text: DescriptionDialogueTextSchema,
  choices: z
    .array(DialogueChoiceSchema)
    .min(bounds.trapsNpcsQuests.npcs.dialogueChoicesPerNode.min)
    .max(bounds.trapsNpcsQuests.npcs.dialogueChoicesPerNode.max),
});

export const DialogueTreeSchema = z
  .strictObject({
    rootNodeId: nonEmptyString,
    nodes: z.array(DialogueNodeSchema).min(1),
  })
  .superRefine((tree, ctx) => {
    enforceDialogueTree(tree, ctx);
  });

// Provider-facing: finite Kept dialogue, bounded inventory, nullable quest hook.
export const NpcDefinitionSchema = z.strictObject({
  id: nonEmptyString,
  name: EntityNameSchema,
  glyph: glyphSchema,
  origin: z.literal("kept"),
  dialogue: DialogueTreeSchema,
  merchantInventoryItemIds: z
    .array(nonEmptyString)
    .max(bounds.trapsNpcsQuests.npcs.merchantInventoryMaxItems),
  questHook: QuestDefinitionSchema.nullable(),
});

export type NpcDefinition = z.infer<typeof NpcDefinitionSchema>;

type DialogueTree = z.infer<typeof DialogueTreeSchema>;

const enforceDialogueTree = (
  tree: DialogueTree,
  ctx: z.RefinementCtx,
): void => {
  const nodesById = new Map(tree.nodes.map((node) => [node.id, node]));

  if (!nodesById.has(tree.rootNodeId)) {
    ctx.addIssue({
      code: "custom",
      path: ["rootNodeId"],
      message: "rootNodeId must reference an existing dialogue node",
    });
    return;
  }

  for (const [nodeIndex, node] of tree.nodes.entries()) {
    for (const [choiceIndex, choice] of node.choices.entries()) {
      if (choice.nextNodeId !== null && !nodesById.has(choice.nextNodeId)) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", nodeIndex, "choices", choiceIndex, "nextNodeId"],
          message: "nextNodeId must reference an existing dialogue node",
        });
      }
    }
  }

  const visit = (
    nodeId: string,
    depth: number,
    path: string[],
  ): void => {
    if (depth > bounds.trapsNpcsQuests.npcs.dialogueMaxDepth) {
      ctx.addIssue({
        code: "custom",
        path,
        message: `dialogue tree depth must be at most ${bounds.trapsNpcsQuests.npcs.dialogueMaxDepth}`,
      });
      return;
    }

    const node = nodesById.get(nodeId);
    if (node === undefined) {
      return;
    }

    for (const choice of node.choices) {
      if (choice.nextNodeId !== null) {
        visit(choice.nextNodeId, depth + 1, [...path, choice.nextNodeId]);
      }
    }
  };

  visit(tree.rootNodeId, 1, ["rootNodeId"]);
};
