import type {
  EntityInstance,
  GameState,
  Position,
} from "@engine/state";

import type { StageDrawList } from "./draw-list";

export type StageMotionPreference = "full" | "reduced";

export type StageAnimationTimings = {
  readonly movementMs: number;
  readonly attackMs: number;
  readonly hitFlashMs: number;
  readonly floatMs: number;
  readonly deathMs: number;
  readonly sparkleMs: number;
  readonly auraPulseMs: number;
  readonly idleBobPx: number;
  readonly shakeScale: number;
};

export type StageAnimationPlan = {
  readonly motionPreference: StageMotionPreference;
  readonly timings: StageAnimationTimings;
  readonly events: readonly StageAnimationEvent[];
  readonly statusAuras: readonly StageStatusAura[];
};

export type StageAnimationEvent =
  | StageMoveEvent
  | StageAttackEvent
  | StageHitEvent
  | StageFloatNumberEvent
  | StageDeathEvent
  | StagePickupEvent
  | StageEquipEvent
  | StageItemTriggerEvent
  | StageDoorOpenEvent
  | StageStatusBurstEvent;

export type StageMoveEvent = {
  readonly kind: "move";
  readonly id: string;
  readonly actorId: string;
  readonly from: Position;
  readonly to: Position;
  readonly fromCellKey: string;
  readonly toCellKey: string;
  readonly durationMs: number;
};

export type StageAttackEvent = {
  readonly kind: "attack";
  readonly id: string;
  readonly actorId: string;
  readonly targetId: string;
  readonly from: Position;
  readonly to: Position;
  readonly sourceCellKey: string;
  readonly targetCellKey: string;
  readonly durationMs: number;
};

export type StageHitEvent = {
  readonly kind: "hit";
  readonly id: string;
  readonly targetId: string;
  readonly damage: number;
  readonly position: Position;
  readonly cellKey: string;
  readonly flashMs: number;
  readonly shakePx: number;
};

export type StageFloatNumberEvent = {
  readonly kind: "float_number";
  readonly id: string;
  readonly targetId: string;
  readonly amount: number;
  readonly text: string;
  readonly tone: "damage" | "heal";
  readonly position: Position;
  readonly cellKey: string;
  readonly durationMs: number;
};

export type StageDeathEvent = {
  readonly kind: "death";
  readonly id: string;
  readonly actorId: string;
  readonly position: Position;
  readonly cellKey: string;
  readonly durationMs: number;
};

export type StagePickupEvent = {
  readonly kind: "pickup";
  readonly id: string;
  readonly itemId: string;
  readonly position: Position;
  readonly cellKey: string;
  readonly durationMs: number;
};

export type StageEquipEvent = {
  readonly kind: "equip";
  readonly id: string;
  readonly itemInstanceId: string;
  readonly position: Position;
  readonly cellKey: string;
  readonly durationMs: number;
};

export type StageItemTriggerEvent = {
  readonly kind: "item_trigger";
  readonly id: string;
  readonly itemInstanceId: string;
  readonly trigger: string;
  readonly positions: readonly Position[];
  readonly cellKeys: readonly string[];
  readonly durationMs: number;
};

export type StageDoorOpenEvent = {
  readonly kind: "door_open";
  readonly id: string;
  readonly position: Position;
  readonly cellKey: string;
  readonly durationMs: number;
};

export type StageStatusBurstEvent = {
  readonly kind: "status_burst";
  readonly id: string;
  readonly targetId: string;
  readonly status: string;
  readonly position: Position;
  readonly cellKey: string;
  readonly color: number;
  readonly durationMs: number;
};

export type StageStatusAura = {
  readonly targetId: string;
  readonly statuses: readonly string[];
  readonly position: Position;
  readonly cellKey: string;
  readonly color: number;
};

type StageAnimationPlanInput = {
  readonly previousState: GameState | null;
  readonly previousDrawList: StageDrawList | null;
  readonly state: GameState;
  readonly drawList: StageDrawList;
  readonly motionPreference?: StageMotionPreference;
};

type RuntimeLogEvent = {
  readonly turn?: unknown;
  readonly type?: unknown;
  readonly data?: unknown;
};

type RuntimeRecord = {
  readonly [key: string]: unknown;
};

type ActorSnapshot = {
  readonly id: string;
  readonly kind: "player" | EntityInstance["kind"];
  readonly position: Position;
  readonly hp: number | null;
  readonly statuses: readonly string[];
};

const FULL_TIMINGS: StageAnimationTimings = {
  movementMs: 100,
  attackMs: 110,
  hitFlashMs: 48,
  floatMs: 640,
  deathMs: 360,
  sparkleMs: 420,
  auraPulseMs: 1_200,
  idleBobPx: 1.5,
  shakeScale: 1,
};

const REDUCED_TIMINGS: StageAnimationTimings = {
  movementMs: 0,
  attackMs: 0,
  hitFlashMs: 48,
  floatMs: 420,
  deathMs: 0,
  sparkleMs: 260,
  auraPulseMs: 1_200,
  idleBobPx: 0,
  shakeScale: 0,
};

const STATUS_COLORS: Readonly<Record<string, number>> = {
  blind: 0x7f6aa5,
  burn: 0xff6b2b,
  confusion: 0xff7ad9,
  haste: 0xffd85a,
  poison: 0x58d66b,
  regen: 0x65f2c2,
  shield: 0x9dc7ff,
  slow: 0x75a7ff,
  stun: 0xfff06a,
  weaken: 0xb77aff,
};

export const stageAnimationTimings = (
  preference: StageMotionPreference = "full",
): StageAnimationTimings =>
  preference === "reduced" ? REDUCED_TIMINGS : FULL_TIMINGS;

export const createStageAnimationPlan = ({
  previousState,
  state,
  motionPreference = "full",
}: StageAnimationPlanInput): StageAnimationPlan => {
  const timings = stageAnimationTimings(motionPreference);
  const events: StageAnimationEvent[] = [];
  const currentActors = actorSnapshots(state);
  const previousActors = previousState === null
    ? new Map<string, ActorSnapshot>()
    : actorSnapshots(previousState);
  const canDiff = canDiffStates(previousState, state);
  const logEvents = canDiff
    ? (state.log as readonly RuntimeLogEvent[]).slice(
        previousState?.log.length ?? state.log.length,
      )
    : [];

  if (canDiff && previousState !== null) {
    addMovementEvents(events, previousActors, currentActors, timings);
    addDeathEvents(events, previousActors, currentActors, logEvents, timings);
    addStateDeltaEvents(events, previousActors, currentActors, logEvents, timings);
  }

  addLogDerivedEvents(events, previousActors, currentActors, state, logEvents, timings);

  return {
    motionPreference,
    timings,
    events: sortEvents(events),
    statusAuras: statusAurasForActors(currentActors),
  };
};

export const cellKeyForPosition = (position: Position): string =>
  `${position.x}:${position.y}`;

export const statusColor = (statuses: readonly string[]): number =>
  STATUS_COLORS[statuses[0] ?? ""] ?? 0xffffff;

const canDiffStates = (
  previousState: GameState | null,
  state: GameState,
): previousState is GameState =>
  previousState !== null &&
  previousState.run.runId === state.run.runId &&
  previousState.floor.floorId === state.floor.floorId &&
  previousState.log.length <= state.log.length;

const actorSnapshots = (
  state: GameState,
): ReadonlyMap<string, ActorSnapshot> => {
  const actors = new Map<string, ActorSnapshot>();

  actors.set("player", {
    id: "player",
    kind: "player",
    position: state.player.position,
    hp: state.player.hp.current,
    statuses: statusNames(state.player.statuses),
  });

  for (const entity of Object.values(state.entities)) {
    actors.set(entity.id, {
      id: entity.id,
      kind: entity.kind,
      position: entity.position,
      hp: entity.currentHP,
      statuses: statusNames(entity.statuses),
    });
  }

  return actors;
};

const addMovementEvents = (
  events: StageAnimationEvent[],
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
  timings: StageAnimationTimings,
): void => {
  for (const [actorId, actor] of currentActors.entries()) {
    const previous = previousActors.get(actorId);

    if (previous === undefined || samePosition(previous.position, actor.position)) {
      continue;
    }

    if (Math.max(
      Math.abs(previous.position.x - actor.position.x),
      Math.abs(previous.position.y - actor.position.y),
    ) > 1) {
      continue;
    }

    events.push({
      kind: "move",
      id: `move:${actorId}:${cellKeyForPosition(previous.position)}:${cellKeyForPosition(actor.position)}`,
      actorId,
      from: previous.position,
      to: actor.position,
      fromCellKey: cellKeyForPosition(previous.position),
      toCellKey: cellKeyForPosition(actor.position),
      durationMs: timings.movementMs,
    });
  }
};

const addDeathEvents = (
  events: StageAnimationEvent[],
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
  logEvents: readonly RuntimeLogEvent[],
  timings: StageAnimationTimings,
): void => {
  const loggedDeaths = new Set<string>();

  for (const event of logEvents) {
    if (event.type !== "entity_died") {
      continue;
    }

    const data = asRecord(event.data);
    const actorId = stringValue(data?.entityId);
    const position = positionValue(data?.position);

    if (actorId === null || position === null) {
      continue;
    }

    loggedDeaths.add(actorId);
    events.push({
      kind: "death",
      id: eventId(event, "death", actorId),
      actorId,
      position,
      cellKey: cellKeyForPosition(position),
      durationMs: timings.deathMs,
    });
  }

  for (const [actorId, actor] of previousActors.entries()) {
    if (
      actorId === "player" ||
      actor.hp === null ||
      currentActors.has(actorId) ||
      loggedDeaths.has(actorId)
    ) {
      continue;
    }

    events.push({
      kind: "death",
      id: `death:${actorId}:${cellKeyForPosition(actor.position)}`,
      actorId,
      position: actor.position,
      cellKey: cellKeyForPosition(actor.position),
      durationMs: timings.deathMs,
    });
  }
};

const addStateDeltaEvents = (
  events: StageAnimationEvent[],
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
  logEvents: readonly RuntimeLogEvent[],
  timings: StageAnimationTimings,
): void => {
  const actorIdsWithLoggedNumbers = new Set<string>();

  for (const event of logEvents) {
    const actorId = targetActorForPulseEvent(event);

    if (actorId !== null) {
      actorIdsWithLoggedNumbers.add(actorId);
    }
  }

  for (const [actorId, previous] of previousActors.entries()) {
    const current = currentActors.get(actorId);

    if (
      previous.hp === null ||
      current?.hp === null ||
      current === undefined ||
      actorIdsWithLoggedNumbers.has(actorId) ||
      previous.hp === current.hp
    ) {
      continue;
    }

    addHpDeltaEvents(
      events,
      {
        idPrefix: `hp-delta:${actorId}`,
        targetId: actorId,
        delta: current.hp - previous.hp,
        position: current.position,
      },
      timings,
    );
  }
};

const addLogDerivedEvents = (
  events: StageAnimationEvent[],
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
  state: GameState,
  logEvents: readonly RuntimeLogEvent[],
  timings: StageAnimationTimings,
): void => {
  const attackKeys = new Set<string>();

  logEvents.forEach((event, index) => {
    const data = asRecord(event.data);
    const idPrefix = `${eventId(event, String(event.type ?? "event"), String(index))}`;

    switch (event.type) {
      case "attack_intent": {
        const actorId = stringValue(data?.actorId);
        const targetId = stringValue(data?.targetId);
        addAttackEvent(
          events,
          attackKeys,
          idPrefix,
          actorId,
          targetId,
          previousActors,
          currentActors,
          timings,
        );
        break;
      }
      case "attack_hit":
      case "attack_missed": {
        const actorId = stringValue(data?.actorId);
        const targetId = stringValue(data?.defenderId);
        addAttackEvent(
          events,
          attackKeys,
          idPrefix,
          actorId,
          targetId,
          previousActors,
          currentActors,
          timings,
        );

        if (event.type === "attack_hit") {
          const damage = numberValue(data?.damage);
          if (targetId !== null && damage !== null && damage > 0) {
            const position = actorPosition(targetId, previousActors, currentActors);
            if (position !== null) {
              addHpDeltaEvents(
                events,
                {
                  idPrefix,
                  targetId,
                  delta: -damage,
                  position,
                },
                timings,
              );
            }
          }
        }
        break;
      }
      case "status_tick": {
        const targetId = stringValue(data?.entityId);
        const hpDelta = numberValue(data?.hpDelta);

        if (targetId !== null && hpDelta !== null && hpDelta !== 0) {
          const position = actorPosition(targetId, previousActors, currentActors);
          if (position !== null) {
            addHpDeltaEvents(
              events,
              {
                idPrefix,
                targetId,
                delta: hpDelta,
                position,
              },
              timings,
            );
          }
        }
        break;
      }
      case "effect_executed": {
        const targetId = stringValue(data?.targetId);
        const details = asRecord(data?.details);
        const hpBefore = numberValue(details?.hpBefore);
        const hpAfter = numberValue(details?.hpAfter);

        if (
          targetId !== null &&
          hpBefore !== null &&
          hpAfter !== null &&
          hpAfter !== hpBefore
        ) {
          const position = actorPosition(targetId, previousActors, currentActors);
          if (position !== null) {
            addHpDeltaEvents(
              events,
              {
                idPrefix,
                targetId,
                delta: hpAfter - hpBefore,
                position,
              },
              timings,
            );
          }
        }
        break;
      }
      case "item_picked_up": {
        const itemId = stringValue(data?.entityId) ?? stringValue(data?.itemInstanceId);
        const itemPosition = itemId === null
          ? null
          : actorPosition(itemId, previousActors, currentActors);
        const position = itemPosition ?? state.player.position;

        if (itemId !== null) {
          events.push({
            kind: "pickup",
            id: `${idPrefix}:pickup:${itemId}`,
            itemId,
            position,
            cellKey: cellKeyForPosition(position),
            durationMs: timings.sparkleMs,
          });
        }
        break;
      }
      case "item_equipped": {
        const itemInstanceId = stringValue(data?.itemInstanceId);

        if (itemInstanceId !== null) {
          events.push({
            kind: "equip",
            id: `${idPrefix}:equip:${itemInstanceId}`,
            itemInstanceId,
            position: state.player.position,
            cellKey: cellKeyForPosition(state.player.position),
            durationMs: timings.sparkleMs,
          });
        }
        break;
      }
      case "item_triggered": {
        const itemInstanceId = stringValue(data?.itemInstanceId);
        const trigger = stringValue(data?.trigger);

        if (itemInstanceId !== null && trigger !== null) {
          const positions = positionListValue(data?.cells);
          const resolvedPositions = positions.length > 0
            ? positions
            : [state.player.position];

          events.push({
            kind: "item_trigger",
            id: `${idPrefix}:item-trigger:${itemInstanceId}`,
            itemInstanceId,
            trigger,
            positions: resolvedPositions,
            cellKeys: resolvedPositions.map(cellKeyForPosition),
            durationMs: timings.sparkleMs,
          });
        }
        break;
      }
      case "door_opened": {
        const position = positionValue(data?.at);

        if (position !== null) {
          events.push({
            kind: "door_open",
            id: `${idPrefix}:door-open:${cellKeyForPosition(position)}`,
            position,
            cellKey: cellKeyForPosition(position),
            durationMs: timings.sparkleMs,
          });
        }
        break;
      }
      case "status_applied":
      case "status_refreshed": {
        const targetId = stringValue(data?.entityId);
        const status = stringValue(data?.status);

        if (targetId !== null && status !== null) {
          const position = actorPosition(targetId, previousActors, currentActors);

          if (position !== null) {
            events.push({
              kind: "status_burst",
              id: `${idPrefix}:status:${targetId}:${status}`,
              targetId,
              status,
              position,
              cellKey: cellKeyForPosition(position),
              color: statusColor([status]),
              durationMs: timings.sparkleMs,
            });
          }
        }
        break;
      }
    }
  });
};

const addAttackEvent = (
  events: StageAnimationEvent[],
  attackKeys: Set<string>,
  idPrefix: string,
  actorId: string | null,
  targetId: string | null,
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
  timings: StageAnimationTimings,
): void => {
  if (actorId === null || targetId === null) {
    return;
  }

  const from = actorPosition(actorId, previousActors, currentActors);
  const to = actorPosition(targetId, previousActors, currentActors);

  if (from === null || to === null) {
    return;
  }

  const key = `${actorId}->${targetId}:${cellKeyForPosition(from)}:${cellKeyForPosition(to)}`;
  if (attackKeys.has(key)) {
    return;
  }
  attackKeys.add(key);

  events.push({
    kind: "attack",
    id: `${idPrefix}:attack:${key}`,
    actorId,
    targetId,
    from,
    to,
    sourceCellKey: cellKeyForPosition(from),
    targetCellKey: cellKeyForPosition(to),
    durationMs: timings.attackMs,
  });
};

const addHpDeltaEvents = (
  events: StageAnimationEvent[],
  input: {
    readonly idPrefix: string;
    readonly targetId: string;
    readonly delta: number;
    readonly position: Position;
  },
  timings: StageAnimationTimings,
): void => {
  const cellKey = cellKeyForPosition(input.position);
  const amount = Math.abs(input.delta);
  const tone = input.delta < 0 ? "damage" : "heal";
  const signedText = input.delta > 0 ? `+${input.delta}` : `${input.delta}`;

  events.push({
    kind: "float_number",
    id: `${input.idPrefix}:float:${input.targetId}:${input.delta}`,
    targetId: input.targetId,
    amount,
    text: signedText,
    tone,
    position: input.position,
    cellKey,
    durationMs: timings.floatMs,
  });

  if (input.delta >= 0) {
    return;
  }

  events.push({
    kind: "hit",
    id: `${input.idPrefix}:hit:${input.targetId}`,
    targetId: input.targetId,
    damage: amount,
    position: input.position,
    cellKey,
    flashMs: timings.hitFlashMs,
    shakePx: shakeForDamage(amount, timings),
  });
};

const statusAurasForActors = (
  actors: ReadonlyMap<string, ActorSnapshot>,
): readonly StageStatusAura[] =>
  [...actors.values()]
    .filter((actor) => actor.statuses.length > 0)
    .map((actor) => ({
      targetId: actor.id,
      statuses: actor.statuses,
      position: actor.position,
      cellKey: cellKeyForPosition(actor.position),
      color: statusColor(actor.statuses),
    }))
    .sort((left, right) => left.targetId.localeCompare(right.targetId));

const actorPosition = (
  actorId: string,
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
): Position | null =>
  currentActors.get(actorId)?.position ??
  previousActors.get(actorId)?.position ??
  null;

const targetActorForPulseEvent = (event: RuntimeLogEvent): string | null => {
  const data = asRecord(event.data);

  switch (event.type) {
    case "attack_hit":
      return stringValue(data?.defenderId);
    case "status_tick":
      return stringValue(data?.entityId);
    case "effect_executed":
      return stringValue(data?.targetId);
    default:
      return null;
  }
};

const sortEvents = (
  events: readonly StageAnimationEvent[],
): readonly StageAnimationEvent[] =>
  [...events].sort((left, right) => left.id.localeCompare(right.id));

const shakeForDamage = (
  damage: number,
  timings: StageAnimationTimings,
): number =>
  timings.shakeScale === 0
    ? 0
    : Math.min(8, (1.5 + damage * 0.65) * timings.shakeScale);

const statusNames = (
  statuses: readonly { readonly status: string; readonly duration: number }[],
): readonly string[] =>
  statuses
    .filter((entry) => entry.duration > 0)
    .map((entry) => entry.status)
    .sort();

const eventId = (
  event: RuntimeLogEvent,
  kind: string,
  suffix: string,
): string =>
  `t${String(event.turn ?? "x")}:${kind}:${suffix}`;

const positionListValue = (value: unknown): readonly Position[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const position = positionValue(entry);

    return position === null ? [] : [position];
  });
};

const positionValue = (value: unknown): Position | null => {
  const record = asRecord(value);
  const x = numberValue(record?.x);
  const y = numberValue(record?.y);

  return x === null || y === null ? null : { x, y };
};

const asRecord = (value: unknown): RuntimeRecord | null =>
  value !== null && typeof value === "object"
    ? (value as RuntimeRecord)
    : null;

const numberValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringValue = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;
