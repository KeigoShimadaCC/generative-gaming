"use client";

import { useEffect, useMemo, useState } from "react";

import { useGameStore, type ContextPanelMode } from "@/store/game-store";
import { registerPanelKeyHandler } from "@/input/panel-focus";
import {
  buyFromMerchant,
  getCurrentDialogueNode,
  resolveDialogueChoice,
  resolveEndConversation,
  sellToMerchant,
} from "@engine/npc";
import type { RunAction } from "@engine/run";
import type { GameState, Position } from "@engine/state";

import { DialoguePanel } from "./dialogue/DialoguePanel";
import { InspectPanel } from "./inspect/InspectPanel";
import { InventoryPanel } from "./inventory/InventoryPanel";
import { QuestPanel } from "./quest/QuestPanel";
import {
  appendEventsToState,
  appendPanelRefusal,
  clampIndex,
  createBarterCatalog,
  createDialogueView,
  createInspectCard,
  createInventoryView,
  createItemStackInspectCard,
  createQuestView,
  directionForKey,
  executeInventoryOperation,
  firstEnabledActionIndex,
  gridBounds,
  inventoryActionsFor,
  inventoryEntryCount,
  isPanelModeToggleKey,
  menuNumber,
  movePosition,
  selectedInventoryEntry,
  type DialogueOption,
  type DialogueView,
  type InventoryActionView,
  type InventoryEntry,
} from "./model";

type ContextPanelFrameProps = {
  readonly state: GameState | null;
  readonly mode: ContextPanelMode;
  readonly hoverPosition: Position | null;
};

const panelClass =
  "min-h-0 overflow-hidden rounded border border-gg-border bg-gg-surface text-gg-muted";

export function ContextPanelFrame({
  state,
  mode,
  hoverPosition,
}: ContextPanelFrameProps) {
  const patchUi = useGameStore((store) => store.patchUi);
  const setGameState = useGameStore((store) => store.setGameState);
  const dispatchAction = useGameStore((store) => store.dispatchAction);
  const [inspectCursor, setInspectCursor] = useState<Position>(
    state?.player.position ?? { x: 0, y: 0 },
  );
  const [inspectCursorActive, setInspectCursorActive] = useState(false);
  const [inventoryIndex, setInventoryIndex] = useState(0);
  const [inventoryActionIndex, setInventoryActionIndex] = useState(0);
  const [throwItemId, setThrowItemId] = useState<string | null>(null);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [dialogueRefusal, setDialogueRefusal] = useState<string | null>(null);
  const [questIndex, setQuestIndex] = useState(0);

  useEffect(() => {
    if (state === null || inspectCursorActive) {
      return;
    }

    setInspectCursor(state.player.position);
  }, [inspectCursorActive, state]);

  useEffect(() => {
    if (state !== null && getCurrentDialogueNode(state) !== null && mode !== "dialogue") {
      patchUi({ contextPanelMode: "dialogue" });
    }
  }, [mode, patchUi, state]);

  const inspectCard = useMemo(() => {
    if (state === null) {
      return null;
    }

    return createInspectCard(state, hoverPosition ?? inspectCursor);
  }, [hoverPosition, inspectCursor, state]);

  const inventoryView = useMemo(
    () => (state === null ? null : createInventoryView(state)),
    [state],
  );
  const selectedEntry = useMemo(
    () =>
      inventoryView === null
        ? null
        : selectedInventoryEntry(inventoryView, inventoryIndex),
    [inventoryIndex, inventoryView],
  );
  const inventoryActions = useMemo(
    () =>
      state === null
        ? []
        : inventoryActionsFor(state, selectedEntry),
    [selectedEntry, state],
  );
  const selectedInventoryCard = useMemo(
    () =>
      state !== null && selectedEntry?.stack !== null && selectedEntry !== null
        ? createItemStackInspectCard(state, selectedEntry.stack)
        : null,
    [selectedEntry, state],
  );
  const dialogueView = useMemo(
    () => (state === null ? null : createDialogueView(state)),
    [state],
  );
  const questView = useMemo(
    () =>
      state === null
        ? { active: [], completed: [], failed: [], markers: [] }
        : createQuestView(state),
    [state],
  );

  useEffect(() => {
    setInventoryActionIndex(firstEnabledActionIndex(inventoryActions));
  }, [inventoryActions]);

  useEffect(() => {
    if (state === null || inventoryView === null) {
      return;
    }

    setInventoryIndex((current) =>
      clampIndex(current, inventoryEntryCount(inventoryView)),
    );
  }, [inventoryView, state]);

  useEffect(() => {
    if (dialogueView === null) {
      setDialogueIndex(0);
      setDialogueRefusal(null);
      return;
    }

    setDialogueIndex((current) =>
      clampIndex(current, dialogueView.options.length),
    );
  }, [dialogueView]);

  useEffect(() => {
    setQuestIndex((current) =>
      clampIndex(current, questView.active.length + questView.completed.length),
    );
  }, [questView]);

  useEffect(
    () =>
      registerPanelKeyHandler(({ key }) => {
        const store = useGameStore.getState();
        const currentState = store.gameState;
        const currentMode = store.ui.contextPanelMode;

        if (
          currentState === null ||
          store.ui.keymapOpen ||
          store.ui.diaryOpen ||
          store.ui.artifactOpen ||
          store.ui.pendingConfirm !== null
        ) {
          return false;
        }

        if (currentMode === "inspect") {
          return handleInspectKey(key, currentState);
        }

        if (isPanelModeToggleKey(key)) {
          setThrowItemId(null);
          return false;
        }

        switch (currentMode) {
          case "inventory":
            return handleInventoryKey(key, currentState);
          case "dialogue":
            return handleDialogueKey(key, currentState);
          case "quest":
            return handleQuestKey(key);
        }
      }),
    [
      dialogueIndex,
      inventoryActionIndex,
      inventoryIndex,
      questIndex,
      throwItemId,
    ],
  );

  const runInventoryAction = (index: number): void => {
    if (state === null || selectedEntry === null) {
      return;
    }

    const action = inventoryActions[index];
    if (action === undefined) {
      return;
    }

    applyInventoryAction(state, selectedEntry, action);
  };

  return (
    <section
      className={panelClass}
      aria-label="Context panel"
      data-panel-mode={mode}
      data-testid="context-panel"
    >
      {mode === "inspect" ? (
        <InspectPanel
          card={inspectCard}
          cursorActive={inspectCursorActive}
          source={hoverPosition === null ? "cursor" : "hover"}
        />
      ) : null}
      {mode === "inventory" && inventoryView !== null ? (
        <InventoryPanel
          actions={inventoryActions}
          card={selectedInventoryCard}
          onRunAction={runInventoryAction}
          onSelectAction={setInventoryActionIndex}
          onSelectEntry={setInventoryIndex}
          selectedActionIndex={inventoryActionIndex}
          selectedEntry={selectedEntry}
          selectedEntryIndex={inventoryIndex}
          throwPrompt={throwItemId !== null}
          view={inventoryView}
        />
      ) : null}
      {mode === "dialogue" ? (
        <DialoguePanel
          lastRefusal={dialogueRefusal}
          onRun={(index) => runDialogueOption(index)}
          onSelect={setDialogueIndex}
          selectedIndex={dialogueIndex}
          view={dialogueView}
        />
      ) : null}
      {mode === "quest" ? (
        <QuestPanel
          onSelect={setQuestIndex}
          selectedIndex={questIndex}
          view={questView}
        />
      ) : null}
    </section>
  );

  function handleInspectKey(key: string, currentState: GameState): boolean {
    if (key === "x" || key === "X") {
      setInspectCursorActive(true);
      return false;
    }

    if (key === "Escape") {
      const wasCursorActive = inspectCursorActive;
      setInspectCursorActive(false);
      return wasCursorActive;
    }

    if (!inspectCursorActive) {
      return false;
    }

    const direction = directionForKey(key);
    if (direction === null) {
      return false;
    }

    setInspectCursor((current) =>
      movePosition(current, direction, gridBounds(currentState)),
    );
    return true;
  }

  function handleInventoryKey(key: string, currentState: GameState): boolean {
    if (throwItemId !== null) {
      if (key === "Escape") {
        setThrowItemId(null);
        return true;
      }

      const direction = directionForKey(key);
      if (direction !== null) {
        dispatchAction({
          kind: "use_item",
          itemId: throwItemId,
          direction,
        });
        setThrowItemId(null);
        return true;
      }

      return true;
    }

    if (key === "Escape") {
      return false;
    }

    const view = createInventoryView(currentState);
    const count = inventoryEntryCount(view);
    const selected = selectedInventoryEntry(view, inventoryIndex);
    const actions = inventoryActionsFor(currentState, selected);
    const number = menuNumber(key);

    if (number !== null) {
      if (number < actions.length) {
        setInventoryActionIndex(number);
        if (selected !== null) {
          applyInventoryAction(currentState, selected, actions[number]!);
        }
      } else if (number < count) {
        setInventoryIndex(number);
      }
      return true;
    }

    switch (key) {
      case "ArrowUp":
        setInventoryIndex((current) => clampIndex(current - 1, count));
        return true;
      case "ArrowDown":
        setInventoryIndex((current) => clampIndex(current + 1, count));
        return true;
      case "ArrowLeft":
        setInventoryActionIndex((current) =>
          clampIndex(current - 1, actions.length),
        );
        return true;
      case "ArrowRight":
        setInventoryActionIndex((current) =>
          clampIndex(current + 1, actions.length),
        );
        return true;
      case "Enter":
        if (selected !== null && actions[inventoryActionIndex] !== undefined) {
          applyInventoryAction(
            currentState,
            selected,
            actions[inventoryActionIndex]!,
          );
        }
        return true;
      default:
        return true;
    }
  }

  function handleDialogueKey(key: string, currentState: GameState): boolean {
    if (key === "Escape") {
      endConversation(currentState);
      return true;
    }

    const view = createDialogueView(currentState);
    if (view === null) {
      patchUi({ contextPanelMode: "inspect" });
      return true;
    }

    const number = menuNumber(key);
    if (number !== null) {
      runDialogueOption(number, currentState, view);
      return true;
    }

    switch (key) {
      case "ArrowUp":
        setDialogueIndex((current) => clampIndex(current - 1, view.options.length));
        return true;
      case "ArrowDown":
        setDialogueIndex((current) => clampIndex(current + 1, view.options.length));
        return true;
      case "Enter":
        runDialogueOption(dialogueIndex, currentState, view);
        return true;
      default:
        return true;
    }
  }

  function handleQuestKey(key: string): boolean {
    if (key === "Escape") {
      return false;
    }

    const count = questView.active.length + questView.completed.length;
    const number = menuNumber(key);
    if (number !== null) {
      setQuestIndex(number);
      return true;
    }

    switch (key) {
      case "ArrowUp":
        setQuestIndex((current) => clampIndex(current - 1, count));
        return true;
      case "ArrowDown":
        setQuestIndex((current) => clampIndex(current + 1, count));
        return true;
      case "Enter":
        return true;
      default:
        return true;
    }
  }

  function applyInventoryAction(
    currentState: GameState,
    entry: InventoryEntry,
    action: InventoryActionView,
  ): void {
    const result = executeInventoryOperation(currentState, action, entry);

    if (result === "throw_prompt") {
      setThrowItemId(entry.stack?.itemInstanceId ?? null);
      return;
    }

    if ("kind" in result) {
      dispatchAction(result as RunAction);
      return;
    }

    if ("illegal" in result) {
      setGameState(appendPanelRefusal(currentState, result.reason));
      return;
    }

    setGameState(appendEventsToState(result.state, result.events));
  }

  function runDialogueOption(
    index: number,
    currentState: GameState | null = state,
    view: DialogueView | null = dialogueView,
  ): void {
    if (currentState === null || view === null) {
      return;
    }

    const option = view.options[index];
    if (option === undefined) {
      return;
    }

    setDialogueIndex(index);
    applyDialogueOption(currentState, option);
  }

  function applyDialogueOption(
    currentState: GameState,
    option: DialogueOption,
  ): void {
    switch (option.kind) {
      case "reply": {
        const resolved = resolveDialogueChoice(currentState, option.id);
        if ("illegal" in resolved) {
          setDialogueRefusal(resolved.reason);
          setGameState(appendPanelRefusal(currentState, resolved.reason));
          return;
        }

        const nextState = appendEventsToState(resolved.state, resolved.events);
        setGameState(nextState);
        setDialogueRefusal(null);
        if (getCurrentDialogueNode(nextState) === null) {
          patchUi({ contextPanelMode: "inspect" });
        }
        return;
      }
      case "buy":
        applyBarter(currentState, option);
        return;
      case "sell":
        applyBarter(currentState, option);
        return;
      case "exit":
        endConversation(currentState);
        return;
    }
  }

  function applyBarter(
    currentState: GameState,
    option: Extract<DialogueOption, { readonly kind: "buy" | "sell" }>,
  ): void {
    if (option.disabledReason !== null) {
      setDialogueRefusal(option.disabledReason);
      setGameState(appendPanelRefusal(currentState, option.disabledReason));
      return;
    }

    const catalogView = createBarterCatalog(currentState);
    const fallback = catalogView.coinDefinition ?? catalogView.resolve(option.kind === "buy" ? option.definitionId : "");

    if (fallback === null) {
      const reason = "No coin definition available.";
      setDialogueRefusal(reason);
      setGameState(appendPanelRefusal(currentState, reason));
      return;
    }

    const catalog = {
      resolve: catalogView.resolve,
      coinDefinition: fallback,
    };
    const result =
      option.kind === "buy"
        ? buyFromMerchant(currentState, catalog, option.definitionId)
        : sellToMerchant(currentState, catalog, option.itemInstanceId);

    if ("refused" in result) {
      setDialogueRefusal(result.message);
      setGameState(appendPanelRefusal(currentState, result.message));
      return;
    }

    setDialogueRefusal(null);
    setGameState(appendEventsToState(result.state, result.events));
  }

  function endConversation(currentState: GameState): void {
    const ended = resolveEndConversation(currentState);
    if ("illegal" in ended) {
      setDialogueRefusal(ended.reason);
      setGameState(appendPanelRefusal(currentState, ended.reason));
      return;
    }

    setGameState(appendEventsToState(ended.state, ended.events));
    patchUi({ contextPanelMode: "inspect" });
  }
}
