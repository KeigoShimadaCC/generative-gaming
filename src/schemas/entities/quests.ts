import { z } from "zod";

import { bounds, config } from "../../config/index.js";
import {
  boundedNumber,
  enforceActivePayload,
  nonEmptyString,
} from "../common.js";

export const QUEST_OBJECTIVE_IDS =
  bounds.trapsNpcsQuests.quests.objectiveClosedList;

export const QuestObjectiveKindSchema = z.enum(QUEST_OBJECTIVE_IDS);

export type QuestObjectiveKind = z.infer<typeof QuestObjectiveKindSchema>;

export const FetchQuestObjectivePayloadSchema = z.strictObject({
  itemId: nonEmptyString,
  floorScope: z.enum(["this_floor", "next_floor"]),
});

export const KillQuestObjectivePayloadSchema = z.strictObject({
  targetTag: nonEmptyString,
});

export const ReachQuestObjectivePayloadSchema = z.strictObject({
  featureId: nonEmptyString,
});

export const DeliverQuestObjectivePayloadSchema = z.strictObject({
  itemId: nonEmptyString,
  npcId: nonEmptyString,
});

export const EscortQuestObjectivePayloadSchema = z.strictObject({
  npcId: nonEmptyString,
});

export const ConstraintQuestObjectivePayloadSchema = z.strictObject({
  engineFlag: nonEmptyString,
});

const QUEST_OBJECTIVE_PAYLOAD_KEYS = [
  "fetch",
  "kill",
  "reach",
  "deliver",
  "escort",
  "constraint",
] as const;

const QUEST_OBJECTIVE_PAYLOAD_FIELD_BY_KIND = {
  fetch: "fetch",
  kill: "kill",
  reach: "reach",
  deliver: "deliver",
  escort: "escort",
  constraint: "constraint",
} as const satisfies Record<
  QuestObjectiveKind,
  (typeof QUEST_OBJECTIVE_PAYLOAD_KEYS)[number]
>;

// Provider-facing: tagged objective with required nullable payload fields.
export const QuestObjectiveSchema = z
  .strictObject({
    kind: QuestObjectiveKindSchema,
    fetch: FetchQuestObjectivePayloadSchema.nullable(),
    kill: KillQuestObjectivePayloadSchema.nullable(),
    reach: ReachQuestObjectivePayloadSchema.nullable(),
    deliver: DeliverQuestObjectivePayloadSchema.nullable(),
    escort: EscortQuestObjectivePayloadSchema.nullable(),
    constraint: ConstraintQuestObjectivePayloadSchema.nullable(),
  })
  .superRefine((objective, ctx) => {
    enforceActivePayload(
      objective,
      ctx,
      QUEST_OBJECTIVE_PAYLOAD_KEYS,
      QUEST_OBJECTIVE_PAYLOAD_FIELD_BY_KIND[objective.kind],
    );
  });

export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;

export const QuestRewardSchema = z.strictObject({
  valueMultiplier: boundedNumber(config.itemsEconomy.questRewardValueMultiplier),
  coin: z.number().int().nonnegative().nullable(),
  itemIds: z.array(nonEmptyString),
  identifyItemIds: z.array(nonEmptyString),
});

// Provider-facing: one closed objective plus bounded reward value.
export const QuestDefinitionSchema = z.strictObject({
  id: nonEmptyString,
  title: nonEmptyString,
  objective: QuestObjectiveSchema,
  reward: QuestRewardSchema,
});

export type QuestDefinition = z.infer<typeof QuestDefinitionSchema>;
