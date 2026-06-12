import { bounds, config } from "../../config/index.js";
import {
  rosterAffordable,
  rosterCost,
  statsWithinBand,
} from "../../engine/enemies/cost.js";
import { placementLethalityCheck } from "../../engine/systems/traps.js";
import { PROTOCOL_VERSION } from "../../schemas/protocol.js";
import type {
  FloorManifest,
  ManifestPlacementHint,
  ManifestRosterEntry,
} from "../../schemas/manifest.js";
import type {
  NpcDefinition,
  QuestDefinition,
  QuestObjective,
} from "../../schemas/entities/index.js";
import {
  buildGateReport,
  failCheck,
  passCheck,
  type GateCheck,
  type GateReport,
} from "./report.js";

export type Gate1Context = {
  readonly signatureUsedThisRun: boolean;
};

const defaultGate1Context = (): Gate1Context => ({
  signatureUsedThisRun: false,
});

export const runGate1 = (
  manifest: FloorManifest,
  context: Gate1Context = defaultGate1Context(),
): GateReport =>
  buildGateReport(1, [
    checkProtocolVersion(manifest),
    checkReferentialIntegrity(manifest),
    checkCallbackRefs(manifest),
    checkPlacementHints(manifest),
    checkEnemyStats(manifest),
    checkRosterBudget(manifest),
    checkItemValues(manifest),
    checkTrapLethality(manifest),
    checkEntityCaps(manifest),
    checkTextCaps(manifest),
    checkSignature(manifest, context),
  ]);

const checkProtocolVersion = (manifest: FloorManifest): GateCheck => {
  if (manifest.protocolVersion !== PROTOCOL_VERSION) {
    return failCheck(
      "G1_PROTOCOL_VERSION",
      `expected protocolVersion ${PROTOCOL_VERSION}, got ${manifest.protocolVersion}`,
    );
  }

  return passCheck(
    "G1_PROTOCOL_VERSION",
    `protocolVersion ${PROTOCOL_VERSION}`,
  );
};

const checkReferentialIntegrity = (manifest: FloorManifest): GateCheck => {
  const itemIds = new Set(manifest.items.map((item) => item.id));
  const rosterIds = new Set(manifest.roster.map((enemy) => enemy.id));
  const npcIds = new Set(manifest.npcs.map((npc) => npc.id));
  const failures: string[] = [];

  const requireItem = (itemId: string, label: string): void => {
    if (!itemIds.has(itemId)) {
      failures.push(`${label} references missing item "${itemId}"`);
    }
  };

  const requireNpc = (npcId: string, label: string): void => {
    if (!npcIds.has(npcId)) {
      failures.push(`${label} references missing npc "${npcId}"`);
    }
  };

  const requireRoster = (enemyId: string, label: string): void => {
    if (!rosterIds.has(enemyId)) {
      failures.push(`${label} references missing roster id "${enemyId}"`);
    }
  };

  const validateQuest = (quest: QuestDefinition, label: string): void => {
    validateQuestObjective(quest.objective, label, {
      requireItem,
      requireNpc,
      requireRoster,
    });

    for (const itemId of quest.reward.itemIds) {
      requireItem(itemId, `${label} reward.itemIds`);
    }

    for (const itemId of quest.reward.identifyItemIds) {
      requireItem(itemId, `${label} reward.identifyItemIds`);
    }
  };

  if (manifest.quest !== null) {
    validateQuest(manifest.quest, "quest");
  }

  for (const npc of manifest.npcs) {
    for (const itemId of npc.merchantInventoryItemIds) {
      requireItem(itemId, `npc ${npc.id} merchantInventoryItemIds`);
    }

    if (npc.questHook !== null) {
      validateQuest(npc.questHook, `npc ${npc.id} questHook`);
    }

    validateNpcDialogue(npc, manifest.quest?.id ?? null, failures);
  }

  if (failures.length > 0) {
    return failCheck("G1_REF_INTEGRITY", failures.join("; "));
  }

  return passCheck("G1_REF_INTEGRITY", "entity references resolve within manifest");
};

const validateQuestObjective = (
  objective: QuestObjective,
  label: string,
  refs: {
    readonly requireItem: (itemId: string, detail: string) => void;
    readonly requireNpc: (npcId: string, detail: string) => void;
    readonly requireRoster: (enemyId: string, detail: string) => void;
  },
): void => {
  switch (objective.kind) {
    case "fetch":
      if (objective.fetch?.floorScope === "this_floor") {
        refs.requireItem(objective.fetch.itemId, `${label} fetch`);
      }
      break;
    case "kill":
      refs.requireRoster(objective.kill!.targetTag, `${label} kill targetTag`);
      break;
    case "deliver":
      refs.requireItem(objective.deliver!.itemId, `${label} deliver itemId`);
      refs.requireNpc(objective.deliver!.npcId, `${label} deliver npcId`);
      break;
    case "escort":
      refs.requireNpc(objective.escort!.npcId, `${label} escort npcId`);
      break;
    case "reach":
    case "constraint":
      break;
    default:
      break;
  }
};

const validateNpcDialogue = (
  npc: NpcDefinition,
  questId: string | null,
  failures: string[],
): void => {
  const nodeIds = new Set(npc.dialogue.nodes.map((node) => node.id));

  if (!nodeIds.has(npc.dialogue.rootNodeId)) {
    failures.push(`npc ${npc.id} dialogue rootNodeId is missing`);
  }

  for (const node of npc.dialogue.nodes) {
    for (const choice of node.choices) {
      if (
        choice.nextNodeId !== null &&
        !nodeIds.has(choice.nextNodeId)
      ) {
        failures.push(
          `npc ${npc.id} dialogue choice ${choice.id} references missing node ${choice.nextNodeId}`,
        );
      }

      if (choice.questHookId === null) {
        continue;
      }

      const hookIds = new Set(
        [questId, npc.questHook?.id].filter((id): id is string => id !== null),
      );

      if (!hookIds.has(choice.questHookId)) {
        failures.push(
          `npc ${npc.id} dialogue choice ${choice.id} references missing quest ${choice.questHookId}`,
        );
      }
    }
  }
};

const checkCallbackRefs = (manifest: FloorManifest): GateCheck => {
  const observationTags = new Set(
    manifest.narration.observations.map((beat) => beat.triggerTag),
  );
  const failures: string[] = [];

  for (const [index, callback] of manifest.metadata.callbacks.entries()) {
    if (typeof callback !== "string" || callback.trim().length === 0) {
      failures.push(`metadata.callbacks[${index}] must be a non-empty string`);
      continue;
    }

    if (!observationTags.has(callback)) {
      failures.push(
        `metadata.callbacks[${index}] "${callback}" has no matching narration observation triggerTag`,
      );
    }
  }

  if (failures.length > 0) {
    return failCheck("G1_CALLBACK_REF", failures.join("; "));
  }

  return passCheck(
    "G1_CALLBACK_REF",
    "callback tags match narration observation triggerTags",
  );
};

const checkPlacementHints = (manifest: FloorManifest): GateCheck => {
  const maxRoomIndex = manifest.params.roomCountRange.max - 1;
  const failures: string[] = [];

  const validateHint = (
    label: string,
    hint: ManifestPlacementHint | null,
  ): void => {
    if (hint === null || hint.roomIndex === null) {
      return;
    }

    if (hint.roomIndex > maxRoomIndex) {
      failures.push(
        `${label} placementHint.roomIndex ${hint.roomIndex} exceeds params.roomCountRange.max - 1 (${maxRoomIndex})`,
      );
    }
  };

  for (const enemy of manifest.roster) {
    validateHint(`roster ${enemy.id}`, enemy.placementHint);
  }

  for (const item of manifest.items) {
    validateHint(`item ${item.id}`, item.placementHint);
  }

  for (const trap of manifest.traps) {
    validateHint(`trap ${trap.id}`, trap.placementHint);
  }

  for (const npc of manifest.npcs) {
    validateHint(`npc ${npc.id}`, npc.placementHint);
  }

  if (failures.length > 0) {
    return failCheck("G1_PLACEMENT_HINT", failures.join("; "));
  }

  return passCheck(
    "G1_PLACEMENT_HINT",
    "placement hint room indexes fit params.roomCountRange",
  );
};

const checkEnemyStats = (manifest: FloorManifest): GateCheck => {
  const failures: string[] = [];

  for (const enemy of manifest.roster) {
    if (!statsWithinBand(enemy, manifest.band)) {
      failures.push(
        `roster ${enemy.id} stats are outside the ${manifest.band} band`,
      );
    }
  }

  if (failures.length > 0) {
    return failCheck("G1_ENEMY_STATS", failures.join("; "));
  }

  return passCheck(
    "G1_ENEMY_STATS",
    `all roster stats within ${manifest.band} band`,
  );
};

const checkRosterBudget = (manifest: FloorManifest): GateCheck => {
  const roster = manifest.roster as readonly ManifestRosterEntry[];

  if (!roster.every((enemy) => statsWithinBand(enemy, manifest.band))) {
    return passCheck(
      "G1_ROSTER_BUDGET",
      "skipped because roster stats are invalid",
    );
  }

  const budget = config.enemyDesign.spawnBudgetPoints[manifest.band];
  const cost = rosterCost(roster);

  if (!rosterAffordable(roster, manifest.band)) {
    return failCheck(
      "G1_ROSTER_BUDGET",
      `roster cost ${cost} exceeds ${manifest.band} spawn budget ${budget}`,
    );
  }

  return passCheck(
    "G1_ROSTER_BUDGET",
    `roster cost ${cost} within ${manifest.band} spawn budget ${budget}`,
  );
};

const checkItemValues = (manifest: FloorManifest): GateCheck => {
  const failures: string[] = [];
  const bandBounds = config.itemsEconomy.valueBandsCoin[manifest.band];

  for (const item of manifest.items) {
    if (item.value.band !== manifest.band) {
      failures.push(
        `item ${item.id} value.band ${item.value.band} does not match manifest band ${manifest.band}`,
      );
      continue;
    }

    if (item.value.coin < bandBounds.min || item.value.coin > bandBounds.max) {
      failures.push(
        `item ${item.id} coin ${item.value.coin} outside ${manifest.band} value band ${bandBounds.min}-${bandBounds.max}`,
      );
    }
  }

  if (failures.length > 0) {
    return failCheck("G1_ITEM_VALUE", failures.join("; "));
  }

  return passCheck(
    "G1_ITEM_VALUE",
    `all item values match ${manifest.band} economy band`,
  );
};

const checkTrapLethality = (manifest: FloorManifest): GateCheck => {
  const failures: string[] = [];

  for (const trap of manifest.traps) {
    const result = placementLethalityCheck(trap, manifest.band);

    if (!result.ok) {
      failures.push(
        `trap ${trap.id} worst-case damage ${result.worstCaseDamage} can reach band-typical full HP ${result.bandFullHp}`,
      );
    }
  }

  if (failures.length > 0) {
    return failCheck("G1_TRAP_LETHALITY", failures.join("; "));
  }

  return passCheck(
    "G1_TRAP_LETHALITY",
    "trap bundles are non-lethal from band-typical full HP",
  );
};

const checkEntityCaps = (manifest: FloorManifest): GateCheck => {
  const failures: string[] = [];
  const npcCap = bounds.trapsNpcsQuests.npcs.perFloor.max;
  const trapCap = bounds.trapsNpcsQuests.traps.perFloor.max;
  const observationCap =
    config.directorManifest.narrationBeats.triggeredObservationLinesMax;
  const rosterCap =
    bounds.enemyDesign.statBudgetsByBand[manifest.band].maxEnemiesAlivePerFloor;

  if (manifest.npcs.length > npcCap) {
    failures.push(`npc count ${manifest.npcs.length} exceeds cap ${npcCap}`);
  }

  if (manifest.traps.length > trapCap) {
    failures.push(`trap count ${manifest.traps.length} exceeds cap ${trapCap}`);
  }

  if (manifest.narration.observations.length > observationCap) {
    failures.push(
      `observation count ${manifest.narration.observations.length} exceeds cap ${observationCap}`,
    );
  }

  if (manifest.roster.length > rosterCap) {
    failures.push(
      `roster size ${manifest.roster.length} exceeds ${manifest.band} cap ${rosterCap}`,
    );
  }

  if (failures.length > 0) {
    return failCheck("G1_ENTITY_CAP", failures.join("; "));
  }

  return passCheck("G1_ENTITY_CAP", "entity counts within configured caps");
};

const checkTextCaps = (manifest: FloorManifest): GateCheck => {
  const failures: string[] = [];
  const narrationCap = bounds.directorManifest.textCaps.narrationLineMaxChars;
  const nameCap = bounds.directorManifest.textCaps.nameMaxChars;
  const dialogueCap =
    bounds.directorManifest.textCaps.descriptionDialogueLineMaxChars;

  if (manifest.narration.floorIntro.length > narrationCap) {
    failures.push(
      `narration.floorIntro length ${manifest.narration.floorIntro.length} exceeds cap ${narrationCap}`,
    );
  }

  for (const beat of manifest.narration.observations) {
    if (beat.text.length > narrationCap) {
      failures.push(
        `observation ${beat.id} text length ${beat.text.length} exceeds cap ${narrationCap}`,
      );
    }
  }

  for (const enemy of manifest.roster) {
    if (enemy.name.length > nameCap) {
      failures.push(`roster ${enemy.id} name exceeds cap ${nameCap}`);
    }
  }

  for (const item of manifest.items) {
    if (item.name.length > nameCap) {
      failures.push(`item ${item.id} name exceeds cap ${nameCap}`);
    }
  }

  for (const trap of manifest.traps) {
    if (trap.name.length > nameCap) {
      failures.push(`trap ${trap.id} name exceeds cap ${nameCap}`);
    }
  }

  for (const npc of manifest.npcs) {
    if (npc.name.length > nameCap) {
      failures.push(`npc ${npc.id} name exceeds cap ${nameCap}`);
    }

    for (const node of npc.dialogue.nodes) {
      if (node.text.length > dialogueCap) {
        failures.push(`npc ${npc.id} node ${node.id} text exceeds dialogue cap`);
      }

      for (const choice of node.choices) {
        if (choice.label.length > dialogueCap) {
          failures.push(
            `npc ${npc.id} choice ${choice.id} label exceeds dialogue cap`,
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    return failCheck("G1_TEXT_CAP", failures.join("; "));
  }

  return passCheck("G1_TEXT_CAP", "text fields within configured caps");
};

const checkSignature = (
  manifest: FloorManifest,
  context: Gate1Context,
): GateCheck => {
  if (!manifest.metadata.signature) {
    return passCheck("G1_SIGNATURE", "signature flag not set");
  }

  if (manifest.band !== bounds.directorManifest.signatureMomentBand) {
    return failCheck(
      "G1_SIGNATURE",
      `signature floors must be in the ${bounds.directorManifest.signatureMomentBand} band`,
    );
  }

  if (context.signatureUsedThisRun) {
    return failCheck(
      "G1_SIGNATURE",
      "signature already used earlier in this run",
    );
  }

  return passCheck(
    "G1_SIGNATURE",
    `signature allowed in ${bounds.directorManifest.signatureMomentBand} band`,
  );
};
