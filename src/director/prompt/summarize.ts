import { config } from "../../config/index.js";
import type { ParsedTrace } from "../../harness/replay/types.js";
import type { DepthBand } from "../../schemas/entities/index.js";

export type BehavioralFacts = {
  readonly combatEngagementRate: number;
  readonly fightsPicked: number;
  readonly fightsAvoided: number;
  readonly retreatCount: number;
  readonly retreatFrequency: number;
  readonly itemPickups: number;
  readonly itemUses: number;
  readonly itemUsesByCategory: Readonly<Record<string, number>>;
  readonly hoardingSignal: number;
  readonly npcTalksInitiated: number;
  readonly explorationRatio: number;
  readonly cellsVisited: number;
  readonly floorCellsEstimate: number;
  readonly closeCallCount: number;
  readonly killsByEnemyType: Readonly<Record<string, number>>;
  readonly questAccepted: number;
  readonly questRefused: number;
  readonly questCompleted: number;
  readonly totalTurns: number;
};

export type TraceSummaryResult = {
  readonly facts: BehavioralFacts;
  readonly textBlock: string;
};

const ITEM_USE_EVENTS = new Set([
  "item_consumed",
  "item_triggered",
  "item_charge_used",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

const readNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const cellKey = (x: number, y: number): string => `${x},${y}`;

const categoryFromDefinitionId = (definitionId: string): string => {
  const prefix = definitionId.split("-")[0] ?? definitionId;
  return prefix.length > 0 ? prefix : "unknown";
};

const floorCellsForBand = (band: DepthBand): number => {
  const geometry = config.runStructure.floorGeometry[band];
  return geometry.grid.width * geometry.grid.height;
};

const capWords = (text: string, maxWords: number): string => {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return text.trim();
  }

  return `${words.slice(0, maxWords).join(" ")}…`;
};

export const summarizeTrace = (
  trace: ParsedTrace,
  options?: { readonly band?: DepthBand },
): TraceSummaryResult => {
  const band = options?.band ?? "shallows";
  const floorCellsEstimate = floorCellsForBand(band);
  const visitedCells = new Set<string>();
  const itemUsesByCategory: Record<string, number> = {};
  const killsByEnemyType: Record<string, number> = {};
  const enemyDefinitionById = new Map<string, string>();

  let fightsPicked = 0;
  let fightsAvoided = 0;
  let retreatCount = 0;
  let itemPickups = 0;
  let itemUses = 0;
  let npcTalksInitiated = 0;
  let questAccepted = 0;
  let questRefused = 0;
  let questCompleted = 0;
  let closeCallCount = 0;

  let playerMaxHp: number = config.playerCharacter.stats.hp.start;
  let playerHp: number = playerMaxHp;
  let recentlyDamaged = false;
  let enemyPresentThisTurn = false;

  for (const turn of trace.turns) {
    const action = turn.action as Record<string, unknown>;
    const actionKind = readString(action, "kind");

    if (actionKind === "attack") {
      fightsPicked += 1;
      recentlyDamaged = false;
    } else if (actionKind === "move" && recentlyDamaged) {
      retreatCount += 1;
      recentlyDamaged = false;
    } else if (actionKind === "talk") {
      npcTalksInitiated += 1;
    } else if (actionKind === "pickup") {
      // pickup counted from events
    }

    enemyPresentThisTurn = false;

    for (const event of turn.events) {
      const rawData = event.data;
      if (!isRecord(rawData)) {
        continue;
      }
      const data: Record<string, unknown> = rawData;

      switch (event.type) {
        case "moved": {
          if (readString(data, "actorId") === "player") {
            const toValue = data["to"];
            const to = isRecord(toValue) ? toValue : null;
            const x = to ? readNumber(to, "x") : null;
            const y = to ? readNumber(to, "y") : null;
            if (x !== null && y !== null) {
              visitedCells.add(cellKey(x, y));
            }
          }
          break;
        }
        case "attack_hit": {
          const defenderId = readString(data, "defenderId");
          if (defenderId === "player") {
            const hpAfter = readNumber(data, "defenderHpAfter");
            if (hpAfter !== null) {
              playerHp = hpAfter;
              if (playerHp / playerMaxHp < 0.25) {
                closeCallCount += 1;
              }
            }
            recentlyDamaged = true;
          } else if (readString(data, "actorId") === "player") {
            const targetId = defenderId;
            if (targetId) {
              enemyDefinitionById.set(targetId, targetId);
            }
          }
          break;
        }
        case "entity_died": {
          if (readString(data, "kind") === "enemy") {
            const entityId = readString(data, "entityId") ?? "enemy";
            const label = enemyDefinitionById.get(entityId) ?? entityId;
            killsByEnemyType[label] = (killsByEnemyType[label] ?? 0) + 1;
          }
          break;
        }
        case "item_picked_up": {
          itemPickups += 1;
          const definitionId = readString(data, "definitionId");
          if (definitionId) {
            const category = categoryFromDefinitionId(definitionId);
            itemUsesByCategory[`pickup:${category}`] =
              (itemUsesByCategory[`pickup:${category}`] ?? 0) + 1;
          }
          break;
        }
        case "item_consumed":
        case "item_triggered":
        case "item_charge_used": {
          if (ITEM_USE_EVENTS.has(event.type)) {
            itemUses += 1;
            const definitionId = readString(data, "definitionId") ?? "unknown";
            const category = categoryFromDefinitionId(definitionId);
            itemUsesByCategory[category] = (itemUsesByCategory[category] ?? 0) + 1;
          }
          break;
        }
        case "level_up": {
          if (readString(data, "actorId") === "player") {
            const maxHpAfter = readNumber(data, "maxHpAfter");
            const currentHpAfter = readNumber(data, "currentHpAfter");
            if (maxHpAfter !== null) {
              playerMaxHp = maxHpAfter;
            }
            if (currentHpAfter !== null) {
              playerHp = currentHpAfter;
              if (playerHp / playerMaxHp < 0.25) {
                closeCallCount += 1;
              }
            }
          }
          break;
        }
        case "quest_accepted":
          questAccepted += 1;
          break;
        case "quest_refused":
          questRefused += 1;
          break;
        case "quest_completed":
          questCompleted += 1;
          break;
        case "talk_intent":
        case "dialogue_opened":
          npcTalksInitiated += 1;
          break;
        case "actor_turn": {
          const actorId = readString(data, "actorId");
          if (actorId?.startsWith("enemy")) {
            enemyPresentThisTurn = true;
          }
          break;
        }
        default:
          break;
      }
    }

    if (enemyPresentThisTurn && actionKind === "move") {
      fightsAvoided += 1;
    }
  }

  const totalTurns = trace.turns.length;
  const combatDenominator = Math.max(1, fightsPicked + fightsAvoided);
  const combatEngagementRate = fightsPicked / combatDenominator;
  const hoardingSignal = itemPickups / Math.max(1, itemUses);
  const explorationRatio =
    visitedCells.size / Math.max(1, floorCellsEstimate);
  const retreatFrequency = retreatCount / Math.max(1, totalTurns);

  const facts: BehavioralFacts = {
    combatEngagementRate,
    fightsPicked,
    fightsAvoided,
    retreatCount,
    retreatFrequency,
    itemPickups,
    itemUses,
    itemUsesByCategory,
    hoardingSignal,
    npcTalksInitiated,
    explorationRatio,
    cellsVisited: visitedCells.size,
    floorCellsEstimate,
    closeCallCount,
    killsByEnemyType,
    questAccepted,
    questRefused,
    questCompleted,
    totalTurns,
  };

  const textBlock = capWords(formatSummaryText(facts), 150);

  return { facts, textBlock };
};

const formatSummaryText = (facts: BehavioralFacts): string => {
  const killSummary =
    Object.keys(facts.killsByEnemyType).length === 0
      ? "no kills recorded"
      : Object.entries(facts.killsByEnemyType)
          .map(([type, count]) => `${type}:${count}`)
          .join(", ");

  const useSummary =
    Object.keys(facts.itemUsesByCategory).length === 0
      ? "none"
      : Object.entries(facts.itemUsesByCategory)
          .map(([category, count]) => `${category}:${count}`)
          .join(", ");

  return [
    "PLAYER TRACE SUMMARY",
    `Combat: engagement ${(facts.combatEngagementRate * 100).toFixed(0)}% (${facts.fightsPicked} fights picked, ${facts.fightsAvoided} avoided); retreats ${facts.retreatCount} (${(facts.retreatFrequency * 100).toFixed(1)}% of turns).`,
    `Items: ${facts.itemPickups} pickups, ${facts.itemUses} uses; hoarding signal ${facts.hoardingSignal.toFixed(2)}; profile ${useSummary}.`,
    `Exploration: ${facts.cellsVisited} cells seen (~${(facts.explorationRatio * 100).toFixed(1)}% of floor); close calls ${facts.closeCallCount}.`,
    `Social: ${facts.npcTalksInitiated} talks initiated; quests accepted ${facts.questAccepted}, refused ${facts.questRefused}, completed ${facts.questCompleted}.`,
    `Kills: ${killSummary}.`,
    `Turns recorded: ${facts.totalTurns}.`,
  ].join("\n");
};
