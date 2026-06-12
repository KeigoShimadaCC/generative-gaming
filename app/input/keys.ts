import type { RunAction } from "@engine/run";
import type { MoveDirection } from "@engine/turn";

import type { ContextPanelMode } from "@/store/game-store";

export type KeyBindingContext =
  | "play"
  | "confirm"
  | "overlay"
  | "paused-layer";

export type KeyIntent =
  | {
      readonly kind: "run_action";
      readonly action: RunAction;
    }
  | {
      readonly kind: "set_context_mode";
      readonly mode: ContextPanelMode;
    }
  | {
      readonly kind: "toggle_diary";
    }
  | {
      readonly kind: "open_keymap";
    }
  | {
      readonly kind: "close_keymap";
    }
  | {
      readonly kind: "close_top";
    }
  | {
      readonly kind: "request_abort";
    }
  | {
      readonly kind: "confirm_yes";
    }
  | {
      readonly kind: "confirm_no";
    };

export type KeymapBinding = {
  readonly id: string;
  readonly contexts: readonly KeyBindingContext[];
  readonly keys: readonly string[];
  readonly keyLabel: string;
  readonly helpGroup: "Movement" | "Actions" | "Panels" | "Universal";
  readonly helpAction: string;
  readonly intent: KeyIntent;
  readonly showInOverlay?: boolean;
};

export type KeymapOverlayRow = {
  readonly id: string;
  readonly group: KeymapBinding["helpGroup"];
  readonly action: string;
  readonly keys: string;
};

const runAction = (action: RunAction): KeyIntent => ({
  kind: "run_action",
  action,
});

const moveAction = (direction: MoveDirection): KeyIntent =>
  runAction({ kind: "move", direction });

export const KEYMAP_BINDINGS: readonly KeymapBinding[] = [
  {
    id: "move-north",
    contexts: ["play"],
    keys: ["ArrowUp", "w", "W", "k", "K"],
    keyLabel: "Up / W / K",
    helpGroup: "Movement",
    helpAction: "Move north",
    intent: moveAction("north"),
  },
  {
    id: "move-south",
    contexts: ["play"],
    keys: ["ArrowDown", "s", "S", "j", "J"],
    keyLabel: "Down / S / J",
    helpGroup: "Movement",
    helpAction: "Move south",
    intent: moveAction("south"),
  },
  {
    id: "move-west",
    contexts: ["play"],
    keys: ["ArrowLeft", "a", "A", "h", "H"],
    keyLabel: "Left / A / H",
    helpGroup: "Movement",
    helpAction: "Move west",
    intent: moveAction("west"),
  },
  {
    id: "move-east",
    contexts: ["play"],
    keys: ["ArrowRight", "d", "D", "l", "L"],
    keyLabel: "Right / D / L",
    helpGroup: "Movement",
    helpAction: "Move east",
    intent: moveAction("east"),
  },
  {
    id: "move-northwest",
    contexts: ["play"],
    keys: ["y", "Y"],
    keyLabel: "Y",
    helpGroup: "Movement",
    helpAction: "Move northwest",
    intent: moveAction("northwest"),
  },
  {
    id: "move-northeast",
    contexts: ["play"],
    keys: ["u", "U"],
    keyLabel: "U",
    helpGroup: "Movement",
    helpAction: "Move northeast",
    intent: moveAction("northeast"),
  },
  {
    id: "move-southwest",
    contexts: ["play"],
    keys: ["b", "B"],
    keyLabel: "B",
    helpGroup: "Movement",
    helpAction: "Move southwest",
    intent: moveAction("southwest"),
  },
  {
    id: "move-southeast",
    contexts: ["play"],
    keys: ["n", "N"],
    keyLabel: "N",
    helpGroup: "Movement",
    helpAction: "Move southeast",
    intent: moveAction("southeast"),
  },
  {
    id: "pickup",
    contexts: ["play"],
    keys: ["g", "G"],
    keyLabel: "G",
    helpGroup: "Actions",
    helpAction: "Pick up",
    intent: runAction({ kind: "pickup" }),
  },
  {
    id: "wait",
    contexts: ["play"],
    keys: ["."],
    keyLabel: ".",
    helpGroup: "Actions",
    helpAction: "Wait",
    intent: runAction({ kind: "wait" }),
  },
  {
    id: "descend",
    contexts: ["play"],
    keys: [">"],
    keyLabel: ">",
    helpGroup: "Actions",
    helpAction: "Descend",
    intent: runAction({ kind: "descend" }),
  },
  {
    id: "inventory",
    contexts: ["play"],
    keys: ["i", "I"],
    keyLabel: "I",
    helpGroup: "Panels",
    helpAction: "Inventory",
    intent: { kind: "set_context_mode", mode: "inventory" },
  },
  {
    id: "quest-log",
    contexts: ["play"],
    keys: ["q", "Q"],
    keyLabel: "Q",
    helpGroup: "Panels",
    helpAction: "Quest log",
    intent: { kind: "set_context_mode", mode: "quest" },
  },
  {
    id: "inspect",
    contexts: ["play"],
    keys: ["x", "X"],
    keyLabel: "X",
    helpGroup: "Panels",
    helpAction: "Inspect",
    intent: { kind: "set_context_mode", mode: "inspect" },
  },
  {
    id: "diary-artifacts",
    contexts: ["play", "paused-layer"],
    keys: ["Tab"],
    keyLabel: "Tab",
    helpGroup: "Panels",
    helpAction: "Diary / artifacts",
    intent: { kind: "toggle_diary" },
  },
  {
    id: "open-keymap",
    contexts: ["play"],
    keys: ["?"],
    keyLabel: "?",
    helpGroup: "Universal",
    helpAction: "Keymap",
    intent: { kind: "open_keymap" },
  },
  {
    id: "abandon-run",
    contexts: ["play"],
    keys: ["Escape"],
    keyLabel: "Esc",
    helpGroup: "Universal",
    helpAction: "Abandon run",
    intent: { kind: "request_abort" },
  },
  {
    id: "close-keymap-escape",
    contexts: ["overlay"],
    keys: ["Escape"],
    keyLabel: "Esc",
    helpGroup: "Universal",
    helpAction: "Close keymap",
    intent: { kind: "close_keymap" },
  },
  {
    id: "close-keymap-question",
    contexts: ["overlay"],
    keys: ["?"],
    keyLabel: "?",
    helpGroup: "Universal",
    helpAction: "Close keymap",
    intent: { kind: "close_keymap" },
    showInOverlay: false,
  },
  {
    id: "confirm-enter",
    contexts: ["confirm"],
    keys: ["Enter"],
    keyLabel: "Enter",
    helpGroup: "Universal",
    helpAction: "Confirm",
    intent: { kind: "confirm_yes" },
  },
  {
    id: "confirm-y",
    contexts: ["confirm"],
    keys: ["y", "Y"],
    keyLabel: "Y",
    helpGroup: "Universal",
    helpAction: "Confirm prompt yes",
    intent: { kind: "confirm_yes" },
  },
  {
    id: "cancel-escape",
    contexts: ["confirm", "paused-layer"],
    keys: ["Escape"],
    keyLabel: "Esc",
    helpGroup: "Universal",
    helpAction: "Cancel / close top",
    intent: { kind: "close_top" },
  },
  {
    id: "confirm-n",
    contexts: ["confirm"],
    keys: ["n", "N"],
    keyLabel: "N",
    helpGroup: "Universal",
    helpAction: "Confirm prompt no",
    intent: { kind: "confirm_no" },
  },
];

export const normalizeKeyboardKey = (key: string): string =>
  key === "\u001b" ? "Escape" : key;

export const resolveKeyBinding = (
  key: string,
  context: KeyBindingContext,
): KeymapBinding | null => {
  const normalized = normalizeKeyboardKey(key);

  return (
    KEYMAP_BINDINGS.find(
      (binding) =>
        binding.contexts.includes(context) &&
        binding.keys.includes(normalized),
    ) ?? null
  );
};

export const keymapOverlayRows = (): readonly KeymapOverlayRow[] =>
  KEYMAP_BINDINGS.filter((binding) => binding.showInOverlay !== false).map(
    (binding) => ({
      id: binding.id,
      group: binding.helpGroup,
      action: binding.helpAction,
      keys: binding.keyLabel,
    }),
  );

export const keymapOverlayGroups = (): readonly KeymapBinding["helpGroup"][] => [
  "Movement",
  "Actions",
  "Panels",
  "Universal",
];
