import { bounds, config } from "../../config/index.js";
import type {
  DepthBand,
  ItemDefinition,
  NpcDefinition,
  TrapDefinition,
} from "../entities/index.js";
import {
  validApproachMeleeBehaviorFixture,
  validCoinItemFixture,
  validFoodItemFixture,
  validNpcDefinitionFixture,
  validQuestDefinitionFixture,
  validTrapDefinitionFixture,
  validWeaponItemFixture,
  validArmorItemFixture,
} from "./entities.js";
import { PROTOCOL_VERSION } from "../protocol.js";
import type {
  FloorManifest,
  ManifestItemEntry,
  ManifestNpcEntry,
  ManifestPlacementHint,
  ManifestRosterEntry,
  ManifestTrapEntry,
} from "../manifest.js";

const noPlacementHint = null;

const nearEntranceHint = {
  roomIndex: null,
  distance: "near_entrance",
  spread: false,
} satisfies ManifestPlacementHint;

const farSpreadHint = {
  roomIndex: null,
  distance: "far_from_entrance",
  spread: true,
} satisfies ManifestPlacementHint;

const roomZeroHint = {
  roomIndex: 0,
  distance: null,
  spread: false,
} satisfies ManifestPlacementHint;

const makeEnemy = (
  id: string,
  name: string,
  glyph: string,
  band: DepthBand,
  placementHint: ManifestPlacementHint | null,
): ManifestRosterEntry => {
  const statBounds = bounds.enemyDesign.statBudgetsByBand[band];

  return {
    id,
    name,
    glyph,
    origin: "made",
    stats: {
      band,
      hp: statBounds.hp.min,
      attack: statBounds.attack.min,
      defense: statBounds.defense.min,
      xpYield: statBounds.xpYield.min,
    },
    behaviors: [validApproachMeleeBehaviorFixture],
    abilities: [],
    placementHint,
  };
};

const itemWithBand = (
  item: ItemDefinition,
  id: string,
  name: string,
  band: DepthBand,
  placementHint: ManifestPlacementHint | null,
): ManifestItemEntry => ({
  ...item,
  id,
  name,
  value: {
    band,
    coin: config.itemsEconomy.valueBandsCoin[band].min,
  },
  placementHint,
});

const trapWithHint = (
  trap: TrapDefinition,
  id: string,
  name: string,
  placementHint: ManifestPlacementHint | null,
): ManifestTrapEntry => ({
  ...trap,
  id,
  name,
  placementHint,
});

const npcWithHint = (
  npc: NpcDefinition,
  id: string,
  name: string,
  placementHint: ManifestPlacementHint | null,
): ManifestNpcEntry => ({
  ...npc,
  id,
  name,
  placementHint,
});

const shallowEnemy = makeEnemy(
  "shallow-moss-bit",
  "moss bit",
  "m",
  "shallows",
  nearEntranceHint,
);
const shallowGuard = makeEnemy(
  "shallow-silt-guard",
  "silt guard",
  "s",
  "shallows",
  farSpreadHint,
);
const middleEnemy = makeEnemy(
  "middle-candle-thief",
  "candle thief",
  "t",
  "middle",
  roomZeroHint,
);
const middleGuard = makeEnemy(
  "middle-iron-mute",
  "iron mute",
  "i",
  "middle",
  farSpreadHint,
);
const lowestEnemy = makeEnemy(
  "lowest-vault-watcher",
  "vault watcher",
  "v",
  "lowest",
  farSpreadHint,
);
const lowestGuard = makeEnemy(
  "lowest-ash-bound",
  "ash bound",
  "a",
  "lowest",
  noPlacementHint,
);

const shallowItems: ManifestItemEntry[] = [
  itemWithBand(
    validWeaponItemFixture,
    "shallow-rust-pick",
    "rust pick",
    "shallows",
    nearEntranceHint,
  ),
  itemWithBand(
    validArmorItemFixture,
    "shallow-patched-hide",
    "patched hide",
    "shallows",
    noPlacementHint,
  ),
  itemWithBand(
    validFoodItemFixture,
    "shallow-salt-crust",
    "salt crust",
    "shallows",
    farSpreadHint,
  ),
  itemWithBand(
    validCoinItemFixture,
    "shallow-dull-copper",
    "dull copper",
    "shallows",
    roomZeroHint,
  ),
];

const middleItems: ManifestItemEntry[] = [
  itemWithBand(
    validWeaponItemFixture,
    "middle-glass-knife",
    "glass knife",
    "middle",
    farSpreadHint,
  ),
  itemWithBand(
    validArmorItemFixture,
    "middle-rivet-coat",
    "rivet coat",
    "middle",
    nearEntranceHint,
  ),
  itemWithBand(
    validFoodItemFixture,
    "middle-cold-loaf",
    "cold loaf",
    "middle",
    noPlacementHint,
  ),
  itemWithBand(
    validCoinItemFixture,
    "middle-bright-scrip",
    "bright scrip",
    "middle",
    roomZeroHint,
  ),
];

const lowestItems: ManifestItemEntry[] = [
  itemWithBand(
    validWeaponItemFixture,
    "lowest-hook-spear",
    "hook spear",
    "lowest",
    farSpreadHint,
  ),
  itemWithBand(
    validArmorItemFixture,
    "lowest-ward-mail",
    "ward mail",
    "lowest",
    noPlacementHint,
  ),
  itemWithBand(
    validFoodItemFixture,
    "lowest-black-bread",
    "black bread",
    "lowest",
    nearEntranceHint,
  ),
  itemWithBand(
    validCoinItemFixture,
    "lowest-sealed-mark",
    "sealed mark",
    "lowest",
    roomZeroHint,
  ),
];

export const validShallowsManifestFixture = {
  protocolVersion: PROTOCOL_VERSION,
  depth: 3,
  band: "shallows",
  params: {
    bandOrSize: "shallows",
    roomCountRange: { min: 4, max: 7 },
    flavor: "warren",
    seed: "fixture-shallows-3",
  },
  roster: [shallowEnemy, shallowGuard],
  items: shallowItems,
  traps: [
    trapWithHint(
      validTrapDefinitionFixture,
      "shallow-needle-sink",
      "needle sink",
      noPlacementHint,
    ),
  ],
  npcs: [],
  quest: null,
  narration: {
    floorIntro: "Wet stone gathers around careful steps.",
    observations: [
      {
        id: "shallow-obs-deadend",
        triggerTag: "dead-end",
        text: "A cold corner keeps the last footprint.",
      },
    ],
  },
  metadata: {
    originTags: { made: 2, old_stock: 0, kept: 0 },
    callbacks: ["dead-end"],
    signature: false,
  },
} satisfies FloorManifest;

export const validMiddleManifestFixture = {
  protocolVersion: PROTOCOL_VERSION,
  depth: 6,
  band: "middle",
  params: {
    bandOrSize: "middle",
    roomCountRange: { min: 5, max: 9 },
    flavor: "ring",
    seed: "fixture-middle-6",
  },
  roster: [middleEnemy, middleGuard],
  items: middleItems,
  traps: [
    trapWithHint(
      validTrapDefinitionFixture,
      "middle-silver-snare",
      "silver snare",
      farSpreadHint,
    ),
  ],
  npcs: [
    npcWithHint(
      validNpcDefinitionFixture,
      "middle-kept-scrivener",
      "kept scrivener",
      roomZeroHint,
    ),
  ],
  quest: validQuestDefinitionFixture,
  narration: {
    floorIntro: "The ring of rooms waits like it knows your name.",
    observations: [
      {
        id: "middle-obs-first-blood",
        triggerTag: "first-blood",
        text: "The candle thief smiles after the first wound.",
      },
      {
        id: "middle-obs-scrivener",
        triggerTag: "npc-met",
        text: "Ink dries before the kept one finishes speaking.",
      },
    ],
  },
  metadata: {
    originTags: { made: 2, old_stock: 0, kept: 1 },
    callbacks: ["first-blood", "npc-met"],
    signature: true,
  },
} satisfies FloorManifest;

export const validLowestManifestFixture = {
  protocolVersion: PROTOCOL_VERSION,
  depth: 11,
  band: "lowest",
  params: {
    bandOrSize: "lowest",
    roomCountRange: { min: 3, max: 6 },
    flavor: "sanctum",
    seed: "fixture-lowest-11",
  },
  roster: [lowestEnemy, lowestGuard],
  items: lowestItems,
  traps: [
    trapWithHint(
      validTrapDefinitionFixture,
      "lowest-crush-plate",
      "crush plate",
      nearEntranceHint,
    ),
    trapWithHint(
      validTrapDefinitionFixture,
      "lowest-ash-wire",
      "ash wire",
      farSpreadHint,
    ),
  ],
  npcs: [],
  quest: null,
  narration: {
    floorIntro: "The lowest dark keeps its doors almost closed.",
    observations: [
      {
        id: "lowest-obs-vault",
        triggerTag: "far-room",
        text: "Something beyond the vault counts your breath.",
      },
    ],
  },
  metadata: {
    originTags: { made: 2, old_stock: 0, kept: 0 },
    callbacks: ["far-room"],
    signature: false,
  },
} satisfies FloorManifest;

export const validManifestFixtures = [
  validShallowsManifestFixture,
  validMiddleManifestFixture,
  validLowestManifestFixture,
] as const;

const overCapNarration = "x".repeat(
  bounds.directorManifest.textCaps.narrationLineMaxChars + 1,
);

export const malformedManifestFixtures = [
  {
    name: "wrong protocol version",
    manifest: {
      ...validShallowsManifestFixture,
      protocolVersion: "0.0.0",
    },
    expectedPath: "$.protocolVersion",
  },
  {
    name: "depth outside declared band",
    manifest: {
      ...validShallowsManifestFixture,
      depth: 8,
    },
    expectedPath: "$.depth",
  },
  {
    name: "params band mismatch",
    manifest: {
      ...validShallowsManifestFixture,
      params: {
        ...validShallowsManifestFixture.params,
        bandOrSize: "middle",
      },
    },
    expectedPath: "$.params.bandOrSize",
  },
  {
    name: "flavor not allowed for band",
    manifest: {
      ...validShallowsManifestFixture,
      params: {
        ...validShallowsManifestFixture.params,
        flavor: "sanctum",
      },
    },
    expectedPath: "$.params.flavor",
  },
  {
    name: "too few items",
    manifest: {
      ...validShallowsManifestFixture,
      items: validShallowsManifestFixture.items.slice(0, 3),
    },
    expectedPath: "$.items",
  },
  {
    name: "too many npcs",
    manifest: {
      ...validShallowsManifestFixture,
      npcs: [
        npcWithHint(validNpcDefinitionFixture, "npc-a", "kept a", noPlacementHint),
        npcWithHint(validNpcDefinitionFixture, "npc-b", "kept b", noPlacementHint),
        npcWithHint(validNpcDefinitionFixture, "npc-c", "kept c", noPlacementHint),
      ],
    },
    expectedPath: "$.npcs",
  },
  {
    name: "narration line over cap",
    manifest: {
      ...validShallowsManifestFixture,
      narration: {
        ...validShallowsManifestFixture.narration,
        floorIntro: overCapNarration,
      },
    },
    expectedPath: "$.narration.floorIntro",
  },
  {
    name: "invalid placement distance vocabulary",
    manifest: {
      ...validShallowsManifestFixture,
      roster: [
        {
          ...shallowEnemy,
          placementHint: {
            roomIndex: null,
            distance: "close_to_door",
            spread: false,
          },
        },
        shallowGuard,
      ],
    },
    expectedPath: "$.roster[0].placementHint.distance",
  },
] as const;

export const ambientSpikeOutputExpectations = [
  {
    id: "host-1",
    path: "runs/spikes/29-ambient-director/attempts/host-1-stdout.txt",
    // Old prompt emitted the pre-Phase-30 root shape, omitted placementHint on
    // entries, underfilled behavior/use payloads, and invented note.text.
    expectedPathFragments: [
      "$.protocolVersion",
      "$.metadata",
      "$.roster[0].placementHint",
      "$.roster[0].behaviors[0].packHunter.allyCount",
      "$.roster[2].behaviors[0].ambusher.wakeRadiusTiles",
      "$.roster[3].behaviors[0].caster.cooldownTurns",
      "$.items[2].food.effect.trigger.use.charges",
      "$.items[5].note.effect",
    ],
  },
  {
    id: "host-2",
    path: "runs/spikes/29-ambient-director/attempts/host-2-stdout.txt",
    // Same old root shape and missing hints; the remaining entity errors are
    // missing ambusher and territorial behavior payload parameters.
    expectedPathFragments: [
      "$.protocolVersion",
      "$.metadata",
      "$.roster[0].placementHint",
      "$.items[0].placementHint",
      "$.roster[1].behaviors[0].ambusher.wakeRadiusTiles",
      "$.roster[2].behaviors[0].territorial.radiusTiles",
    ],
  },
  {
    id: "host-3",
    path: "runs/spikes/29-ambient-director/attempts/host-3-stdout.txt",
    // Same old root shape and missing hints; ambusher, pack_hunter, and
    // territorial behaviors all need their bounded parameter objects filled in.
    expectedPathFragments: [
      "$.protocolVersion",
      "$.metadata",
      "$.roster[0].placementHint",
      "$.items[0].placementHint",
      "$.roster[0].behaviors[0].ambusher.wakeRadiusTiles",
      "$.roster[2].behaviors[0].packHunter.allyCount",
      "$.roster[3].behaviors[0].territorial.radiusTiles",
    ],
  },
] as const;
