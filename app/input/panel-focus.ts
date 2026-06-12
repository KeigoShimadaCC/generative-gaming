"use client";

export type PanelKeyPress = {
  readonly key: string;
  readonly repeat: boolean;
};

export type PanelKeyHandler = (press: PanelKeyPress) => boolean;

let activePanelKeyHandler: PanelKeyHandler | null = null;

export const registerPanelKeyHandler = (
  handler: PanelKeyHandler,
): (() => void) => {
  activePanelKeyHandler = handler;

  return () => {
    if (activePanelKeyHandler === handler) {
      activePanelKeyHandler = null;
    }
  };
};

export const routePanelKey = (press: PanelKeyPress): boolean =>
  activePanelKeyHandler?.(press) ?? false;
