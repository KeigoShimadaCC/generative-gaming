/*
 * Engine log event declaration barrel.
 *
 * New event declarers MUST be added here; the exhaustive formatter enforces it downstream.
 */
import type {} from "./behaviors/movement.js";
import type {} from "./behaviors/special.js";
import type {} from "./effects/registry.js";
import type {} from "./items/triggers.js";
import type {} from "./npc/barter.js";
import type {} from "./npc/dialogue.js";
import type {} from "./quests/machine.js";
import type {} from "./quests/objectives.js";
import type {} from "./run/events.js";
import type {} from "./systems/combat.js";
import type {} from "./systems/inventory.js";
import type {} from "./systems/movement.js";
import type {} from "./systems/player.js";
import type {} from "./systems/status.js";
import type {} from "./turn/loop.js";
import type {} from "./turn/loop.test.js";
import type {} from "./turn/tick-hook-registry.test.js";

export type {
  EngineLogEvent,
  EngineLogEventDataByType,
  EngineLogEventType,
} from "./state/index.js";
