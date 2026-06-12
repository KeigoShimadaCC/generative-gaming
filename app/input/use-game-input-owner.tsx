"use client";

import { useEffect, useRef } from "react";

import { useGameStore } from "@/store/game-store";

import {
  dispatchGameKey,
  type InputDispatchDeps,
} from "./dispatcher";
import { routePanelKey } from "./panel-focus";

const INPUT_LOCK_MS = 50;

export function GameInputOwner() {
  useGameInputOwner();
  return null;
}

export const useGameInputOwner = (): void => {
  const unlockTimer = useRef<number | null>(null);

  useEffect(() => {
    const unlock = (): void => {
      if (unlockTimer.current !== null) {
        window.clearTimeout(unlockTimer.current);
        unlockTimer.current = null;
      }

      useGameStore.getState().setInputLocked(false);
    };

    const lockInput = (): void => {
      useGameStore.getState().setInputLocked(true);
      if (unlockTimer.current !== null) {
        window.clearTimeout(unlockTimer.current);
      }

      unlockTimer.current = window.setTimeout(unlock, INPUT_LOCK_MS);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      if (routePanelKey({ key: event.key, repeat: event.repeat })) {
        event.preventDefault();
        return;
      }

      const store = useGameStore.getState();
      const deps: InputDispatchDeps = {
        dispatchAction: store.dispatchAction,
        patchUi: store.patchUi,
        appendInputFeedback: store.appendInputFeedback,
        lockInput,
      };
      const result = dispatchGameKey(
        {
          gameState: store.gameState,
          ui: store.ui,
        },
        deps,
        {
          key: event.key,
          repeat: event.repeat,
        },
      );

      if (result.preventDefault) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlock();
    };
  }, []);
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();

  return tagName === "input" || tagName === "textarea" || tagName === "select";
};
