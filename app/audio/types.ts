export type GameSfxKind =
  | "move"
  | "attack"
  | "hit"
  | "pickup"
  | "descend"
  | "win"
  | "lose";

export type GameAudioEvent = {
  readonly kind: GameSfxKind;
  readonly id: string;
};

export type DepthBand = "shallows" | "middle" | "lowest";
