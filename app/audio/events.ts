import type { GameState, Position } from "@engine/state";

import type { GameAudioEvent, GameSfxKind } from "./types";

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
  readonly position: Position;
  readonly hp: number | null;
};

export const deriveGameAudioEvents = (
  previousState: GameState | null,
  state: GameState,
): readonly GameAudioEvent[] => {
  const events: GameAudioEvent[] = [];

  if (previousState === null) {
    return events;
  }

  const canDiff = canDiffStates(previousState, state);
  const sameRun = previousState.run.runId === state.run.runId;

  if (sameRun) {
    addDepthAndTerminalEvents(events, previousState, state);
  }

  if (!canDiff) {
    return dedupeEvents(events);
  }

  const logEvents = (state.log as readonly RuntimeLogEvent[]).slice(
    previousState.log.length,
  );
  const previousActors = actorSnapshots(previousState);
  const currentActors = actorSnapshots(state);

  addPlayerMoveEvent(events, previousState, state);
  addPickupFromFloorEvents(events, previousState, state);
  addLogDerivedEvents(events, previousActors, currentActors, logEvents);
  addHpDeltaEvents(events, previousActors, currentActors, logEvents);

  return dedupeEvents(events);
};

const canDiffStates = (
  previousState: GameState | null,
  state: GameState,
): previousState is GameState =>
  previousState !== null &&
  previousState.run.runId === state.run.runId &&
  previousState.floor.floorId === state.floor.floorId &&
  previousState.log.length <= state.log.length;

const addDepthAndTerminalEvents = (
  events: GameAudioEvent[],
  previousState: GameState,
  state: GameState,
): void => {
  if (state.run.depth > previousState.run.depth) {
    events.push({
      kind: "descend",
      id: `descend:${previousState.run.depth}->${state.run.depth}`,
    });
  }

  if (
    previousState.run.terminalStatus === "ACTIVE" &&
    state.run.terminalStatus !== "ACTIVE"
  ) {
    const kind: GameSfxKind =
      state.run.terminalStatus === "WIN" ? "win" : "lose";
    events.push({
      kind,
      id: `terminal:${state.run.terminalStatus}:t${state.run.turn}`,
    });
  }
};

const addPlayerMoveEvent = (
  events: GameAudioEvent[],
  previousState: GameState,
  state: GameState,
): void => {
  const from = previousState.player.position;
  const to = state.player.position;

  if (samePosition(from, to)) {
    return;
  }

  if (
    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) > 1
  ) {
    return;
  }

  events.push({
    kind: "move",
    id: `move:player:${from.x}:${from.y}->${to.x}:${to.y}`,
  });
};

const addPickupFromFloorEvents = (
  events: GameAudioEvent[],
  previousState: GameState,
  state: GameState,
): void => {
  const removedItems = Object.entries(previousState.entities).filter(
    ([id, entity]) =>
      entity.kind === "item" && state.entities[id] === undefined,
  );

  for (const [itemId] of removedItems) {
    events.push({
      kind: "pickup",
      id: `pickup:floor:${itemId}`,
    });
  }
};

const addLogDerivedEvents = (
  events: GameAudioEvent[],
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
  logEvents: readonly RuntimeLogEvent[],
): void => {
  const attackKeys = new Set<string>();

  logEvents.forEach((event, index) => {
    const data = asRecord(event.data);
    const idPrefix = eventId(event, String(event.type ?? "event"), String(index));

    switch (event.type) {
      case "attack_intent":
      case "attack_hit":
      case "attack_missed": {
        const actorId = stringValue(data?.actorId);
        const targetId =
          event.type === "attack_hit" || event.type === "attack_missed"
            ? stringValue(data?.defenderId)
            : stringValue(data?.targetId);
        addAttackEvent(events, attackKeys, idPrefix, actorId, targetId);
        break;
      }
      case "item_picked_up": {
        const itemId =
          stringValue(data?.entityId) ?? stringValue(data?.itemInstanceId);
        if (itemId !== null) {
          events.push({
            kind: "pickup",
            id: `${idPrefix}:pickup:${itemId}`,
          });
        }
        break;
      }
      default:
        break;
    }
  });
};

const addHpDeltaEvents = (
  events: GameAudioEvent[],
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
  logEvents: readonly RuntimeLogEvent[],
): void => {
  const loggedHitTargets = new Set<string>();

  for (const event of logEvents) {
    const data = asRecord(event.data);

    switch (event.type) {
      case "attack_hit": {
        const targetId = stringValue(data?.defenderId);
        const damage = numberValue(data?.damage);
        if (targetId !== null && damage !== null && damage > 0) {
          loggedHitTargets.add(targetId);
          events.push({
            kind: "hit",
            id: `${eventId(event, "hit", targetId)}:${damage}`,
          });
        }
        break;
      }
      case "status_tick": {
        const targetId = stringValue(data?.entityId);
        const hpDelta = numberValue(data?.hpDelta);
        if (
          targetId !== null &&
          hpDelta !== null &&
          hpDelta < 0 &&
          actorExists(targetId, previousActors, currentActors)
        ) {
          loggedHitTargets.add(targetId);
          events.push({
            kind: "hit",
            id: `${eventId(event, "status-tick", targetId)}:${hpDelta}`,
          });
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
          hpAfter < hpBefore &&
          actorExists(targetId, previousActors, currentActors)
        ) {
          loggedHitTargets.add(targetId);
          events.push({
            kind: "hit",
            id: `${eventId(event, "effect", targetId)}:${hpAfter - hpBefore}`,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  for (const [actorId, previous] of previousActors.entries()) {
    const current = currentActors.get(actorId);
    if (
      previous.hp === null ||
      current?.hp === null ||
      current === undefined ||
      loggedHitTargets.has(actorId) ||
      previous.hp <= current.hp
    ) {
      continue;
    }

    events.push({
      kind: "hit",
      id: `hp-delta:${actorId}:${previous.hp}->${current.hp}`,
    });
  }
};

const addAttackEvent = (
  events: GameAudioEvent[],
  attackKeys: Set<string>,
  idPrefix: string,
  actorId: string | null,
  targetId: string | null,
): void => {
  if (actorId === null || targetId === null) {
    return;
  }

  const key = `${actorId}->${targetId}`;
  if (attackKeys.has(key)) {
    return;
  }
  attackKeys.add(key);

  events.push({
    kind: "attack",
    id: `${idPrefix}:attack:${key}`,
  });
};

const actorSnapshots = (
  state: GameState,
): ReadonlyMap<string, ActorSnapshot> => {
  const actors = new Map<string, ActorSnapshot>();

  actors.set("player", {
    id: "player",
    position: state.player.position,
    hp: state.player.hp.current,
  });

  for (const entity of Object.values(state.entities)) {
    actors.set(entity.id, {
      id: entity.id,
      position: entity.position,
      hp: entity.currentHP,
    });
  }

  return actors;
};

const actorExists = (
  actorId: string,
  previousActors: ReadonlyMap<string, ActorSnapshot>,
  currentActors: ReadonlyMap<string, ActorSnapshot>,
): boolean =>
  previousActors.has(actorId) || currentActors.has(actorId);

const dedupeEvents = (
  events: readonly GameAudioEvent[],
): readonly GameAudioEvent[] => {
  const seen = new Set<string>();
  const unique: GameAudioEvent[] = [];

  for (const event of events) {
    if (seen.has(event.id)) {
      continue;
    }
    seen.add(event.id);
    unique.push(event);
  }

  return unique;
};

const eventId = (
  event: RuntimeLogEvent,
  kind: string,
  suffix: string,
): string => `t${String(event.turn ?? "x")}:${kind}:${suffix}`;

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
