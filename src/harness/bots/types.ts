import type { ItemCategory } from "../../schemas/entities/index.js";
import type { Effect, StatusId } from "../../schemas/vocab/index.js";
import type { RunAction } from "../../engine/run/loop.js";
import type {
  EntityId,
  Position,
  TerminalStatus,
} from "../../engine/state/index.js";
import type { TerrainKind } from "../../engine/map/index.js";

export type BotPolicyName = "cautious" | "balanced" | "aggressive";

export type BotPolicy = {
  readonly name: BotPolicyName;
  readonly description: string;
  readonly decide: (view: BotStateView) => RunAction;
};

export type BotKnownCell = {
  readonly position: Position;
  readonly terrain: TerrainKind;
  readonly door: "open" | "closed" | null;
  readonly visibility: "visible" | "remembered";
};

export type BotKnownEffect = Pick<
  Effect,
  | "kind"
  | "damage"
  | "heal"
  | "applyStatus"
  | "cureStatus"
  | "buffStat"
  | "nutrition"
  | "teleportSelf"
  | "teleportTarget"
  | "blink"
  | "knockback"
  | "reveal"
  | "identify"
  | "enchant"
  | "summon"
  | "transform"
  | "dig"
>;

export type BotVisibleEnemy = {
  readonly id: EntityId;
  readonly name: string;
  readonly glyph: string;
  readonly position: Position;
  readonly hp: {
    readonly current: number;
    readonly max: number;
    readonly ratio: number;
  };
  readonly attack: number;
  readonly defense: number;
  readonly statuses: readonly StatusId[];
};

export type BotVisibleNpc = {
  readonly id: EntityId;
  readonly name: string;
  readonly position: Position;
};

export type BotKnownItem = {
  readonly itemInstanceId: string | null;
  readonly entityId: EntityId | null;
  readonly definitionId: string;
  readonly category: ItemCategory;
  readonly displayName: string;
  readonly position: Position | null;
  readonly quantity: number;
  readonly identified: boolean;
  readonly effectsKnown: boolean;
  readonly effects: readonly BotKnownEffect[];
  readonly bonusKnown: boolean;
  readonly bonus: number | null;
  readonly equipped: boolean;
};

export type BotKnownTrap = {
  readonly id: EntityId;
  readonly name: string;
  readonly position: Position;
};

export type BotKnownFeature = {
  readonly id: string;
  readonly kind: "hoard";
  readonly name: string;
  readonly position: Position;
  readonly depth: number;
};

export type BotStateView = {
  readonly policyName: BotPolicyName;
  readonly availableActions: readonly RunAction[];
  readonly rendered: string;
  readonly run: {
    readonly seed: string;
    readonly turn: number;
    readonly depth: number;
    readonly terminalStatus: TerminalStatus;
  };
  readonly floor: {
    readonly width: number;
    readonly height: number;
    readonly turn: number;
  };
  readonly player: {
    readonly position: Position;
    readonly hp: {
      readonly current: number;
      readonly max: number;
      readonly ratio: number;
    };
    readonly fullness: {
      readonly current: number;
      readonly max: number;
      readonly ratio: number;
    };
    readonly level: number;
    readonly statuses: readonly StatusId[];
    readonly inventory: readonly BotKnownItem[];
    readonly equipment: {
      readonly weapon: BotKnownItem | null;
      readonly armor: BotKnownItem | null;
      readonly charms: readonly BotKnownItem[];
    };
  };
  readonly map: {
    readonly cells: readonly BotKnownCell[];
    readonly visited: readonly Position[];
  };
  readonly visible: {
    readonly enemies: readonly BotVisibleEnemy[];
    readonly npcs: readonly BotVisibleNpc[];
    readonly groundItems: readonly BotKnownItem[];
    readonly traps: readonly BotKnownTrap[];
    readonly features: readonly BotKnownFeature[];
  };
  readonly chooseIndex: (label: string, size: number) => number;
};

export type BotMemory = {
  readonly visitedByDepth: ReadonlyMap<number, ReadonlySet<string>>;
  readonly depthStartTurn: ReadonlyMap<number, number>;
  readonly knownFeaturesByDepth: ReadonlyMap<number, readonly BotKnownFeature[]>;
  readonly recentPositionsByDepth: ReadonlyMap<number, readonly string[]>;
};
