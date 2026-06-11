import type { EnemyDefinition } from "../../schemas/entities/index.js";
import type {
  EnemyEntityInstance,
  EntityId,
  Position,
  SerializableRecord,
  SerializableValue,
} from "../state/index.js";

export interface AssembleEnemyOptions {
  readonly id?: EntityId;
  readonly position?: Position;
  readonly currentHP?: number;
  readonly behaviorRuntime?: SerializableRecord;
}

const DEFAULT_ENEMY_ID = "enemy#1" as const satisfies EntityId;
const DEFAULT_POSITION = { x: 0, y: 0 } as const satisfies Position;

export const assemble = (
  definition: EnemyDefinition,
  options: AssembleEnemyOptions = {},
): EnemyEntityInstance => {
  const position = options.position ?? DEFAULT_POSITION;

  return {
    id: options.id ?? DEFAULT_ENEMY_ID,
    kind: "enemy",
    definition,
    position,
    currentHP: options.currentHP ?? definition.stats.hp,
    statuses: [],
    behaviorRuntime: {
      ...initialBehaviorRuntime(definition, position),
      ...(options.behaviorRuntime ?? {}),
    },
  };
};

export const assembleEnemy = assemble;

const initialBehaviorRuntime = (
  definition: EnemyDefinition,
  position: Position,
): SerializableRecord => {
  const runtime: Record<string, SerializableValue> = {};

  if (definition.abilities.length > 0) {
    runtime.abilityCooldowns = definition.abilities.map(() => 0);
  }

  for (const behavior of definition.behaviors) {
    switch (behavior.kind) {
      case "ambusher":
        runtime.hidden = true;
        runtime.ambusherAwake = false;
        break;
      case "guard":
        runtime.post = serializablePosition(position);
        break;
      case "patrol":
        runtime.patrolIndex = 0;
        runtime.patrolEngaged = false;
        break;
      case "mimic":
        runtime.disguisedAsItem = true;
        runtime.mimicRevealed = false;
        break;
      case "pack_hunter":
        runtime.packHunterEngaged = false;
        break;
      case "approach_melee":
      case "keep_range":
      case "flee_low_hp":
      case "territorial":
      case "thief":
      case "caster":
      case "bodyguard":
        break;
      default:
        assertNever(behavior.kind);
    }
  }

  return runtime;
};

const serializablePosition = (position: Position): SerializableRecord => ({
  x: position.x,
  y: position.y,
});

const assertNever = (value: never): never => {
  throw new RangeError(`unsupported enemy behavior ${String(value)}`);
};
