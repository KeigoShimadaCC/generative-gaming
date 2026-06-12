import { chebyshevDistance } from "@engine/map";
import type { RunAction } from "@engine/run";
import type { EntityInstance, GameState } from "@engine/state";
import { checkActionLegality, type PlayerAction } from "@engine/turn";

import {
  resolveKeyBinding,
  type KeyBindingContext,
  type KeyIntent,
} from "./keys";
import { autoTravelStopFor } from "./travel";
import type {
  InputFeedbackActionKind,
  PendingConfirm,
  UiSlice,
} from "@/store/game-store";

export type GameKeyPress = {
  readonly key: string;
  readonly repeat?: boolean;
};

export type InputDispatchResult =
  | {
      readonly status: "ignored";
      readonly reason: string;
      readonly preventDefault: false;
    }
  | {
      readonly status: "handled";
      readonly intent: KeyIntent["kind"];
      readonly preventDefault: true;
    }
  | {
      readonly status: "action_dispatched";
      readonly action: RunAction;
      readonly preventDefault: true;
    }
  | {
      readonly status: "confirm_required";
      readonly confirm: PendingConfirm;
      readonly preventDefault: true;
    }
  | {
      readonly status: "travel_stopped";
      readonly reason: string;
      readonly preventDefault: true;
    }
  | {
      readonly status: "input_locked";
      readonly preventDefault: true;
    };

export type InputDispatchSnapshot = {
  readonly gameState: GameState | null;
  readonly ui: UiSlice;
};

export type InputDispatchDeps = {
  readonly dispatchAction: (action: RunAction) => void;
  readonly patchUi: (patch: Partial<UiSlice>) => void;
  readonly appendInputFeedback: (
    actionKind: InputFeedbackActionKind,
    reason: string,
  ) => void;
  readonly lockInput: () => void;
};

export const dispatchGameKey = (
  snapshot: InputDispatchSnapshot,
  deps: InputDispatchDeps,
  keyPress: GameKeyPress,
): InputDispatchResult => {
  const context = inputFocusContext(snapshot.ui);
  const binding = resolveKeyBinding(keyPress.key, context);

  if (binding === null) {
    return {
      status: "ignored",
      reason: `unbound key in ${context}`,
      preventDefault: false,
    };
  }

  const intent = binding.intent;

  if (
    snapshot.ui.inputLocked &&
    intent.kind === "run_action"
  ) {
    return { status: "input_locked", preventDefault: true };
  }

  switch (intent.kind) {
    case "run_action":
      return dispatchRunAction(snapshot, deps, intent.action, keyPress);
    case "set_context_mode":
      deps.patchUi({
        contextPanelMode:
          snapshot.ui.contextPanelMode === intent.mode ? "inspect" : intent.mode,
      });
      return {
        status: "handled",
        intent: intent.kind,
        preventDefault: true,
      };
    case "toggle_diary":
      deps.patchUi({
        diaryOpen: !snapshot.ui.diaryOpen,
        artifactOpen: false,
      });
      return {
        status: "handled",
        intent: intent.kind,
        preventDefault: true,
      };
    case "open_keymap":
      deps.patchUi({ keymapOpen: true });
      return {
        status: "handled",
        intent: intent.kind,
        preventDefault: true,
      };
    case "close_keymap":
      deps.patchUi({ keymapOpen: false });
      return {
        status: "handled",
        intent: intent.kind,
        preventDefault: true,
      };
    case "close_top":
      closeTop(snapshot, deps);
      return {
        status: "handled",
        intent: intent.kind,
        preventDefault: true,
      };
    case "confirm_yes":
      return confirmPending(snapshot, deps);
    case "confirm_no":
      cancelPendingConfirm(snapshot, deps);
      return {
        status: "handled",
        intent: intent.kind,
        preventDefault: true,
      };
  }
};

export const inputFocusContext = (ui: UiSlice): KeyBindingContext => {
  if (ui.keymapOpen) {
    return "overlay";
  }

  if (ui.diaryOpen || ui.artifactOpen) {
    return "paused-layer";
  }

  if (ui.pendingConfirm !== null) {
    return "confirm";
  }

  return "play";
};

export const dangerousConfirmForAction = (
  state: GameState,
  action: RunAction,
): PendingConfirm | null => {
  if (action.kind !== "descend" || !isPlayerAction(action)) {
    return null;
  }

  const legality = checkActionLegality(state, action);
  if (legality.status === "illegal") {
    return null;
  }

  const adjacentEnemy = adjacentEnemies(state)[0];
  if (adjacentEnemy === undefined) {
    return null;
  }

  return {
    action,
    prompt: `Enemy ${adjacentEnemy.id} is adjacent. Descend anyway? y/n`,
  };
};

const dispatchRunAction = (
  snapshot: InputDispatchSnapshot,
  deps: InputDispatchDeps,
  action: RunAction,
  keyPress: GameKeyPress,
): InputDispatchResult => {
  if (snapshot.gameState === null) {
    return {
      status: "ignored",
      reason: "game state not ready",
      preventDefault: false,
    };
  }

  if (keyPress.repeat === true && action.kind !== "move") {
    return {
      status: "ignored",
      reason: "non-move key repeat ignored",
      preventDefault: false,
    };
  }

  if (keyPress.repeat === true && action.kind === "move") {
    const stop = autoTravelStopFor(snapshot.gameState);
    if (stop !== null) {
      deps.appendInputFeedback("move", stop.message);
      return {
        status: "travel_stopped",
        reason: stop.reason,
        preventDefault: true,
      };
    }
  }

  const confirm = dangerousConfirmForAction(snapshot.gameState, action);
  if (confirm !== null) {
    deps.patchUi({ pendingConfirm: confirm });
    return {
      status: "confirm_required",
      confirm,
      preventDefault: true,
    };
  }

  deps.dispatchAction(action);
  deps.lockInput();

  return {
    status: "action_dispatched",
    action,
    preventDefault: true,
  };
};

const confirmPending = (
  snapshot: InputDispatchSnapshot,
  deps: InputDispatchDeps,
): InputDispatchResult => {
  const pending = snapshot.ui.pendingConfirm;
  if (pending === null) {
    return {
      status: "ignored",
      reason: "no pending confirm",
      preventDefault: false,
    };
  }

  deps.patchUi({ pendingConfirm: null });
  deps.dispatchAction(pending.action);
  deps.lockInput();

  return {
    status: "action_dispatched",
    action: pending.action,
    preventDefault: true,
  };
};

const closeTop = (
  snapshot: InputDispatchSnapshot,
  deps: InputDispatchDeps,
): void => {
  if (snapshot.ui.keymapOpen) {
    deps.patchUi({ keymapOpen: false });
    return;
  }

  if (snapshot.ui.pendingConfirm !== null) {
    cancelPendingConfirm(snapshot, deps);
    return;
  }

  if (snapshot.ui.diaryOpen || snapshot.ui.artifactOpen) {
    deps.patchUi({ diaryOpen: false, artifactOpen: false });
    return;
  }

  if (snapshot.ui.contextPanelMode !== "inspect") {
    deps.patchUi({ contextPanelMode: "inspect" });
  }
};

const cancelPendingConfirm = (
  snapshot: InputDispatchSnapshot,
  deps: InputDispatchDeps,
): void => {
  const pending = snapshot.ui.pendingConfirm;
  deps.patchUi({ pendingConfirm: null });

  if (pending !== null && isInputFeedbackActionKind(pending.action.kind)) {
    deps.appendInputFeedback(pending.action.kind, "Cancelled.");
  }
};

const adjacentEnemies = (state: GameState): readonly EntityInstance[] =>
  Object.values(state.entities)
    .filter((entity) => entity.kind === "enemy")
    .filter(
      (entity) =>
        chebyshevDistance(state.player.position, entity.position) <= 1,
    )
    .sort((left, right) => left.id.localeCompare(right.id));

const isPlayerAction = (action: RunAction): action is PlayerAction =>
  action.kind !== "take_hoard";

const isInputFeedbackActionKind = (
  kind: RunAction["kind"],
): kind is InputFeedbackActionKind => kind !== "take_hoard";
