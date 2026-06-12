export type Gate3JudgeCalibrationFixture = {
  readonly id: string;
  readonly label: "on-tone" | "violation";
  readonly expected: {
    readonly onTone: boolean;
    readonly coherent: boolean;
    readonly specific: boolean;
  };
  readonly floorIntro: string;
  readonly observation: string;
  readonly names: readonly [string, string, string];
};

export const judgeCalibrationFixtures = [
  {
    id: "deep-voice-hoarder",
    label: "on-tone",
    expected: { onTone: true, coherent: true, specific: true },
    floorIntro: "You come to a room where every shelf has kept one empty place for you.",
    observation: "The Deep leaves one coin bright and the rest dull, knowing your hand.",
    names: ["made shelf-keeper", "dull coin hoard", "quiet latch"],
  },
  {
    id: "deep-voice-retreat",
    label: "on-tone",
    expected: { onTone: true, coherent: true, specific: true },
    floorIntro: "The passage narrows without blame, making a door out of your habit of leaving.",
    observation: "A made watcher steps aside when your breath turns toward retreat.",
    names: ["made watcher", "ashen turning key", "patient snare"],
  },
  {
    id: "deep-voice-social",
    label: "on-tone",
    expected: { onTone: true, coherent: true, specific: true },
    floorIntro: "A kept scrivener waits where your last unanswered greeting should have gone.",
    observation: "Ink dries in the shape of a question you have not yet refused.",
    names: ["kept scrivener", "made oath-bowl", "inkwise guard"],
  },
  {
    id: "deep-voice-close-call",
    label: "on-tone",
    expected: { onTone: true, coherent: true, specific: true },
    floorIntro: "The stair remembers how little blood was left and lowers its voice.",
    observation: "A made candle gutters before the blade can find you again.",
    names: ["made candle-bearer", "low red charm", "mercy hinge"],
  },
  {
    id: "deep-voice-explorer",
    label: "on-tone",
    expected: { onTone: true, coherent: true, specific: true },
    floorIntro: "Rooms fold open for the one who counts corners before doors.",
    observation: "The Deep hides no map, only a second question behind the first.",
    names: ["corner-counting made", "second-question key", "hollow survey bell"],
  },
  {
    id: "modern-tech",
    label: "violation",
    expected: { onTone: false, coherent: false, specific: false },
    floorIntro: "A smartphone buzzes on the altar and tells you to update the dungeon app.",
    observation: "The elevator dings in neon while the goblin checks email.",
    names: ["wifi goblin", "laser badge", "charging cable"],
  },
  {
    id: "first-person-ui",
    label: "violation",
    expected: { onTone: false, coherent: false, specific: false },
    floorIntro: "I think you should click the highlighted inventory button now.",
    observation: "My tutorial arrow points at the exit because this level is easy.",
    names: ["tutorial helper", "objective marker", "easy-mode door"],
  },
  {
    id: "generic-fantasy",
    label: "violation",
    expected: { onTone: false, coherent: true, specific: false },
    floorIntro: "A brave hero enters a mysterious dungeon full of monsters and treasure.",
    observation: "A skeleton attacks because dungeons usually have skeletons.",
    names: ["skeleton warrior", "treasure chest", "mysterious sword"],
  },
  {
    id: "incoherent-floor",
    label: "violation",
    expected: { onTone: true, coherent: false, specific: false },
    floorIntro: "You stand beneath the sea while desert bells burn in falling snow.",
    observation: "The locked door is already open, and the stair climbs downward twice.",
    names: ["waterless sailor", "burning snow key", "open locked door"],
  },
  {
    id: "not-specific",
    label: "violation",
    expected: { onTone: true, coherent: true, specific: false },
    floorIntro: "You enter a room of old stone and careful dark.",
    observation: "Something waits because something always waits below.",
    names: ["made guard", "old key", "stone snare"],
  },
] as const satisfies readonly Gate3JudgeCalibrationFixture[];
