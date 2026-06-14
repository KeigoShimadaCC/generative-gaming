import "../../engine/effects/core.js";
import "../../engine/effects/spatial.js";
import "../../engine/items/triggers.js";
import "../../engine/npc/dialogue.js";
import "../../engine/systems/combat.js";
import "../../engine/systems/inventory.js";
import "../../engine/systems/movement.js";
import "../../engine/systems/player.js";
import "../../engine/systems/status.js";

import { summarizeRun } from "../../engine/run/endings.js";
import {
  startRun,
  stepRun,
  type FloorContentProvider,
  type RunAction,
} from "../../engine/run/loop.js";
import type { RunEvent } from "../../engine/run/events.js";
import type {
  GameState,
  TerminalStatus,
} from "../../engine/state/index.js";
import {
  createTraceRecorder,
  terminalLineFromState,
  traceRunId,
  type TraceContentRef,
  type TraceTurnLine,
  type TraceWriter,
} from "../trace/recorder.js";
import {
  createBotStateView,
  createEmptyBotMemory,
  updateBotMemory,
} from "./view.js";
import type { BotMemory, BotPolicy, BotStateView } from "./types.js";
import { actionKey, fallbackAction, hasAction } from "./policies/helpers.js";

export type BotOutcome = {
  readonly terminal: TerminalStatus;
  readonly depth: number;
  readonly turns: number;
  readonly kills: number;
  readonly hpRetention: number;
  readonly itemUses: number;
  readonly maxTurnsHit: boolean;
};

export type BotTrace = {
  readonly path: string;
  readonly content: string;
  readonly turns: readonly TraceTurnLine<RunAction, RunEvent>[];
};

export type BotRunResult = {
  readonly policy: BotPolicy["name"];
  readonly seed: string;
  readonly outcome: BotOutcome;
  readonly trace: BotTrace;
  readonly state: GameState;
};

export type RunBotOptions = {
  readonly createdAt?: string;
  readonly modelId?: string;
  readonly contentRef?: TraceContentRef;
  readonly runId?: string;
  readonly writer?: TraceWriter;
  readonly stallLimit?: number;
};

type StallTracker = {
  readonly previousActionKey: string | null;
  readonly previousProgressKey: string | null;
  readonly repeatCount: number;
};

const DEFAULT_CREATED_AT = "2026-06-12T00:00:00.000Z";
const DEFAULT_CONTENT_REF = {
  providerId: "fallback:old-stock",
  packVersion: "0.0.0",
} as const satisfies TraceContentRef;
const DEFAULT_STALL_LIMIT = 4;

export const runBot = (
  policy: BotPolicy,
  seed: string,
  provider: FloorContentProvider,
  maxTurns: number,
  options: RunBotOptions = {},
): BotRunResult => {
  assertMaxTurns(maxTurns);
  const started = startRun(seed, provider);
  if (!started.ok) {
    throw new Error(`failed to start run: ${started.error.message}`);
  }

  let state = started.state;
  let memory: BotMemory = createEmptyBotMemory();
  let stall: StallTracker = {
    previousActionKey: null,
    previousProgressKey: null,
    repeatCount: 0,
  };
  const createdAt = options.createdAt ?? DEFAULT_CREATED_AT;
  const runId =
    options.runId ?? traceRunId(`${policy.name}-${seed}`, createdAt);
  const recorder = createTraceRecorder<RunAction, RunEvent>({
    seed,
    createdAt,
    modelId: options.modelId ?? policy.name,
    contentRef: options.contentRef ?? DEFAULT_CONTENT_REF,
    runId,
    ...(options.writer === undefined ? {} : { writer: options.writer }),
  });
  const turns: TraceTurnLine<RunAction, RunEvent>[] = [];
  let maxTurnsHit = false;

  while (state.run.terminalStatus === "ACTIVE" && turns.length < maxTurns) {
    const view = createBotStateView(state, {
      policyName: policy.name,
      memory,
    });
    memory = updateBotMemory(memory, view);
    const decided = legalizeDecision(view, policy.decide(view));
    const breaker = breakStall(view, decided, stall, options.stallLimit);
    const action = breaker.action;
    stall = breaker.stall;

    const stepped = stepRun(state, action, provider);
    if (!stepped.ok) {
      throw new Error(
        `step failed at turn ${state.run.turn} for ${policy.name}: ${stepped.error.message}`,
      );
    }

    state = stepped.state;
    turns.push(
      recorder.recordTurn(action, {
        state,
        events: stepped.events,
      }),
    );

    if (action.kind === "take_hoard" && actionWasIllegal(stepped.events)) {
      const aborted = stepRun(state, { kind: "abort" }, provider);
      if (!aborted.ok) {
        throw new Error(`abort after illegal Hoard action failed: ${aborted.error.message}`);
      }
      state = aborted.state;
      turns.push(
        recorder.recordTurn(
          { kind: "abort" },
          {
            state: aborted.state,
            events: aborted.events,
          },
        ),
      );
    }
  }

  if (state.run.terminalStatus === "ACTIVE") {
    maxTurnsHit = true;
    const stepped = stepRun(state, { kind: "abort" }, provider);
    if (!stepped.ok) {
      throw new Error(`abort failed after maxTurns: ${stepped.error.message}`);
    }

    state = stepped.state;
    turns.push(
      recorder.recordTurn(
        { kind: "abort" },
        {
          state: stepped.state,
          events: stepped.events,
        },
      ),
    );
  }

  const summary = summarizeRun(state);

  return {
    policy: policy.name,
    seed,
    outcome: {
      terminal: state.run.terminalStatus,
      depth: summary.depth,
      turns: summary.turns,
      kills: summary.kills,
      hpRetention:
        state.player.hp.max <= 0 ? 0 : state.player.hp.current / state.player.hp.max,
      itemUses: turns.filter((turn) => turn.action.kind === "use_item").length,
      maxTurnsHit,
    },
    trace: {
      path: recorder.path,
      content: traceContent(recorder.header, turns, state),
      turns,
    },
    state,
  };
};

const legalizeDecision = (
  view: BotStateView,
  action: RunAction,
): RunAction => {
  if (hasAction(view, action)) {
    return action;
  }

  return fallbackAction(view);
};

const breakStall = (
  view: BotStateView,
  action: RunAction,
  stall: StallTracker,
  stallLimit = DEFAULT_STALL_LIMIT,
): { readonly action: RunAction; readonly stall: StallTracker } => {
  const progressKey = progressSignature(view);
  const key = actionKey(action);
  const repeatCount =
    stall.previousActionKey === key && stall.previousProgressKey === progressKey
      ? stall.repeatCount + 1
      : 1;

  if (repeatCount < stallLimit) {
    return {
      action,
      stall: {
        previousActionKey: key,
        previousProgressKey: progressKey,
        repeatCount,
      },
    };
  }

  const alternative = forcedAlternative(view, key);
  const alternativeKey = actionKey(alternative);

  return {
    action: alternative,
    stall: {
      previousActionKey: alternativeKey,
      previousProgressKey: progressKey,
      repeatCount: 1,
    },
  };
};

const forcedAlternative = (
  view: BotStateView,
  repeatedActionKey: string,
): RunAction => {
  const candidates = [
    ...view.availableActions.filter((action) => action.kind === "take_hoard"),
    ...view.availableActions.filter((action) => action.kind === "descend"),
    ...view.availableActions.filter((action) => action.kind === "pickup"),
    ...view.availableActions.filter((action) => action.kind === "attack"),
    ...view.availableActions.filter((action) => action.kind === "move"),
    ...view.availableActions.filter((action) => action.kind === "wait"),
    ...view.availableActions.filter((action) => action.kind === "use_item"),
    ...view.availableActions.filter((action) => action.kind === "abort"),
  ].filter((candidate) => actionKey(candidate) !== repeatedActionKey);

  return candidates[0] ?? { kind: "abort" };
};

const progressSignature = (view: BotStateView): string =>
  JSON.stringify({
    depth: view.run.depth,
    terminal: view.run.terminalStatus,
    position: view.player.position,
    hp: view.player.hp.current,
    fullness: view.player.fullness.current,
    inventory: view.player.inventory.map((item) => [
      item.itemInstanceId,
      item.definitionId,
      item.quantity,
    ]),
    enemies: view.visible.enemies.map((enemy) => [
      enemy.id,
      enemy.position,
      enemy.hp.current,
    ]),
    features: view.visible.features.map((feature) => [
      feature.id,
      feature.position,
    ]),
  });

const traceContent = (
  header: Parameters<typeof JSON.stringify>[0],
  turns: readonly TraceTurnLine<RunAction, RunEvent>[],
  state: GameState,
): string =>
  [
    JSON.stringify(header),
    ...turns.map((turn) => JSON.stringify(turn)),
    ...terminalContentLine(state),
  ].join("\n") + "\n";

const terminalContentLine = (state: GameState): readonly string[] => {
  const terminal = terminalLineFromState(state);
  return terminal === null ? [] : [JSON.stringify(terminal)];
};

const assertMaxTurns = (maxTurns: number): void => {
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) {
    throw new RangeError("maxTurns must be a positive safe integer");
  }
};

const actionWasIllegal = (events: readonly RunEvent[]): boolean =>
  events.some(
    (event) =>
      (event.type === "run_action_illegal" || event.type === "action_illegal") &&
      "actionKind" in event.data,
  );
