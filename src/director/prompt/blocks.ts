import { bounds, config, type GameBounds, type GameConfig } from "../../config/index.js";
import { PROTOCOL_VERSION } from "../../schemas/protocol.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import {
  validAmbusherBehaviorFixture,
  validApproachMeleeBehaviorFixture,
  validArmorItemFixture,
  validCharmItemFixture,
  validCoinItemFixture,
  validDraughtItemFixture,
  validFoodItemFixture,
  validKeyItemFixture,
  validNoteItemFixture,
  validPackHunterBehaviorFixture,
  validThrowableItemFixture,
  validToolItemFixture,
  validTrapDefinitionFixture,
  validWeaponItemFixture,
} from "../../schemas/fixtures/entities.js";
import { fingerprintText } from "./world-sync.js";
import type { ManifestItemEntry, ManifestPlacementHint, ManifestTrapEntry } from "../../schemas/manifest.js";

export const CANON_VERSION = "world-10-v1" as const;

/** Fingerprint of WORLD.md §10 — sync test fails if WORLD changes without prompt review. */
export const WORLD_HARD_CANON_FINGERPRINT = "5f9151fb";

export const HARD_CANON_BLOCK = `HARD CANON (${CANON_VERSION}) — distilled from WORLD §10

1. The Deep is one living dungeon that composes itself around each delver and hoards their stories.
2. There is a bottom. Reaching it earns the right to take one thing back; leaving is allowed only then.
3. Everything below is Made (authored for you), Kept (a retained finished story), or Old Stock (mere ecology).
4. The Deep is fair: no lies in narration, no unwinnable cruelty, honest warnings before the worst.
5. The Deep remembers within runs and across runs, and shows it through callbacks and observation.
6. The narrator is the Deep: second person, present tense, fairy-tale-with-teeth, sparing and concrete.
7. Pre-industrial, quiet-magic world only. No modern technology, no real-world references, no fourth wall.
8. The Kept have wants and ends; the Made have purpose; the Old Stock have neither.
9. Personalization deepens with depth: indifferent Shallows, interested Middle, intimate Lowest.
10. Nothing you generate may contradict this canon. Where silent, stay small, concrete, and consistent.

Director discipline: you author one floor manifest between floors. The engine owns physics, combat, placement, RNG, and validation. You never mutate game state. Output is untrusted content that must parse as JSON and validate against strict schemas. Use closed vocabulary ids, bounded numbers, and finite dialogue. Do not explain yourself.`;

const PERSONA_BY_BAND: Record<DepthBand, string> = {
  shallows: `DIRECTOR PERSONA — Shallows (indifferent)

Mostly Old Stock and half-hearted Made. You are barely paying attention. Narration is sparse and cool. Teach the world gently through placement, not speeches. Personalization is light: a habit mirrored once, not a sermon.`,

  middle: `DIRECTOR PERSONA — Middle (interested)

You are paying attention now. The Made sharpen and personalize. Kept appear in numbers. Quests may reference the delver's actual conduct. The narrator speaks more often. This band may host the run's one signature moment — one bold, personal authored beat.`,

  lowest: `DIRECTOR PERSONA — Lowest (intimate)

Few entities, all of them about this delver. Callbacks converge. Speak plainly at last. Composed, patient, witnessed. Every placement should feel authored for this one descent.`,
};

export const buildPersonaBlock = (band: DepthBand): string =>
  PERSONA_BY_BAND[band];

export type TaskBlockInput = {
  readonly band: DepthBand;
  readonly depth: number;
  readonly config: GameConfig;
  readonly bounds: GameBounds;
  readonly seed: string;
  readonly playerSummary: string;
};

type ItemExampleSpec = {
  readonly fixture: Omit<ManifestItemEntry, "placementHint">;
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly placementHint: ManifestPlacementHint | null;
};

const itemExamples = [
  {
    fixture: validWeaponItemFixture,
    id: "example-blade",
    name: "example blade",
    glyph: ")",
    placementHint: null,
  },
  {
    fixture: validArmorItemFixture,
    id: "example-mail",
    name: "example mail",
    glyph: "[",
    placementHint: null,
  },
  {
    fixture: validCharmItemFixture,
    id: "example-charm",
    name: "example charm",
    glyph: "*",
    placementHint: null,
  },
  {
    fixture: validDraughtItemFixture,
    id: "example-draught",
    name: "example draught",
    glyph: "!",
    placementHint: null,
  },
  {
    fixture: validNoteItemFixture,
    id: "example-note",
    name: "example note",
    glyph: "?",
    placementHint: null,
  },
  {
    fixture: validThrowableItemFixture,
    id: "example-stone",
    name: "example stone",
    glyph: "/",
    placementHint: null,
  },
  {
    fixture: validFoodItemFixture,
    id: "example-ration",
    name: "example ration",
    glyph: "%",
    placementHint: {
      roomIndex: null,
      distance: "near_entrance",
      spread: false,
    },
  },
  {
    fixture: validToolItemFixture,
    id: "example-tool",
    name: "example tool",
    glyph: ";",
    placementHint: null,
  },
  {
    fixture: { ...validKeyItemFixture, keyItem: { questHookId: null } },
    id: "example-key",
    name: "example key",
    glyph: "&",
    placementHint: null,
  },
  {
    fixture: validCoinItemFixture,
    id: "example-coin",
    name: "example coin",
    glyph: "$",
    placementHint: null,
  },
] as const satisfies readonly ItemExampleSpec[];

const itemExampleForBand = (
  spec: ItemExampleSpec,
  band: DepthBand,
  coin: number,
): ManifestItemEntry => ({
  ...spec.fixture,
  id: spec.id,
  name: spec.name,
  glyph: spec.glyph,
  value: { band, coin },
  placementHint: spec.placementHint,
});

const trapExample = (): ManifestTrapEntry => ({
  ...validTrapDefinitionFixture,
  id: "example-step-snare",
  name: "example step snare",
  placementHint: {
    roomIndex: null,
    distance: "far_from_entrance",
    spread: false,
  },
});

const fieldShapeExampleForBand = (
  band: DepthBand,
  depth: number,
  seed: string,
) => {
  const statBounds = bounds.enemyDesign.statBudgetsByBand[band];
  const geometry = config.runStructure.floorGeometry[band];
  const valueBand = config.itemsEconomy.valueBandsCoin[band];
  const flavors = geometry.layoutFlavors;
  const flavor = flavors[0] ?? "open";

  return {
    protocolVersion: PROTOCOL_VERSION,
    depth,
    band,
    params: {
      bandOrSize: band,
      roomCountRange: { min: geometry.rooms.min, max: geometry.rooms.max },
      flavor,
      seed,
    },
    roster: [
      {
        id: "example-melee",
        name: "example melee",
        glyph: "m",
        origin: "made" as const,
        stats: {
          band,
          hp: statBounds.hp.min,
          attack: statBounds.attack.min,
          defense: statBounds.defense.min,
          xpYield: statBounds.xpYield.min,
        },
        behaviors: [validApproachMeleeBehaviorFixture],
        abilities: [],
        placementHint: null,
      },
      {
        id: "example-ambusher",
        name: "example ambusher",
        glyph: "a",
        origin: "made" as const,
        stats: {
          band,
          hp: statBounds.hp.min + 1,
          attack: statBounds.attack.min,
          defense: statBounds.defense.min,
          xpYield: statBounds.xpYield.min,
        },
        behaviors: [validAmbusherBehaviorFixture],
        abilities: [],
        placementHint: {
          roomIndex: null,
          distance: "far_from_entrance" as const,
          spread: true,
        },
      },
      {
        id: "example-pack",
        name: "example pack",
        glyph: "p",
        origin: "made" as const,
        stats: {
          band,
          hp: statBounds.hp.min,
          attack: statBounds.attack.min,
          defense: statBounds.defense.min,
          xpYield: statBounds.xpYield.min,
        },
        behaviors: [validPackHunterBehaviorFixture],
        abilities: [],
        placementHint: null,
      },
    ],
    items: itemExamples.map((item) =>
      itemExampleForBand(item, band, valueBand.min),
    ),
    traps: [trapExample()],
    npcs: [],
    quest: null,
    narration: {
      floorIntro: "Stone holds a breath for your step.",
      observations: [
        {
          id: "example-obs",
          triggerTag: "first-room",
          text: "You pause where the floor narrows.",
        },
      ],
    },
    metadata: {
      originTags: { made: 3, old_stock: 0, kept: 0 },
      callbacks: ["first-room"],
      signature: band === bounds.directorManifest.signatureMomentBand,
    },
  };
};

const schemaDisciplineBlock = (): string => `MANIFEST SCHEMA DISCIPLINE

Root object MUST include protocolVersion "${PROTOCOL_VERSION}", depth, band, params, roster, items, traps, npcs, quest, narration, and metadata.
params requires bandOrSize, roomCountRange {min,max}, flavor, and a non-empty seed string.
Every roster/item/trap/npc entry MUST include placementHint (object with roomIndex, distance, spread) or null — never omit the field.
metadata requires originTags {made, old_stock, kept}, callbacks string array, and signature boolean.

Tagged vocabulary objects use nullable-payload style: include kind, include every payload field, set the active payload object on the matching field, and null on every inactive field.
Behavior examples that MUST include their parameter objects when active:
- pack_hunter → packHunter:{allyCount} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.packHunter.allyCountMin}-${bounds.enemyDesign.behaviorVocabulary.parameters.packHunter.allyCountMax})
- ambusher → ambusher:{wakeRadiusTiles} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.ambusherWakeRadiusTiles.min}-${bounds.enemyDesign.behaviorVocabulary.parameters.ambusherWakeRadiusTiles.max})
- territorial → territorial:{radiusTiles} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.territorialRadiusTiles.min}-${bounds.enemyDesign.behaviorVocabulary.parameters.territorialRadiusTiles.max})
- caster → caster:{cooldownTurns} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns.min}-${bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns.max})
Any effect bundle using trigger kind "use" MUST include use:{charges} within bounds.
Note items MUST use note:{effect:{...}} — never invent note.text or other free-form fields.
Common mistakes to avoid: do not omit protocolVersion, metadata, value, cursed, placementHint, inactive nullable payloads, behavior parameters, use.charges, or the full step trigger object; do not invent item proc or note.text fields — weapons use onHit, armor uses onStruck, and absent procs are null.`;

export const buildTaskBlock = (input: TaskBlockInput): string => {
  const { band, depth, config: gameConfig, bounds: gameBounds, seed, playerSummary } =
    input;
  const statBounds = gameBounds.enemyDesign.statBudgetsByBand[band];
  const geometry = gameConfig.runStructure.floorGeometry[band];
  const valueBand = gameConfig.itemsEconomy.valueBandsCoin[band];
  const textCaps = gameBounds.directorManifest.textCaps;
  const example = fieldShapeExampleForBand(band, depth, seed);

  return `FLOOR MANIFEST TASK

Generate a new floor manifest for depth ${depth} in the ${band} band.
Run seed: ${seed}

Band budgets (hard limits):
- spawn budget: ${gameConfig.enemyDesign.spawnBudgetPoints[band]} points
- max enemies alive per floor: ${statBounds.maxEnemiesAlivePerFloor}
- items per floor: ${gameConfig.itemsEconomy.itemsPerFloor.min}-${gameConfig.itemsEconomy.itemsPerFloor.max}
- traps per floor: ${gameBounds.trapsNpcsQuests.traps.perFloor.min}-${gameBounds.trapsNpcsQuests.traps.perFloor.max}
- npcs per floor: ${gameBounds.trapsNpcsQuests.npcs.perFloor.min}-${gameBounds.trapsNpcsQuests.npcs.perFloor.max}
- room count: ${geometry.rooms.min}-${geometry.rooms.max}
- allowed flavors: ${geometry.layoutFlavors.join(", ")}
- enemy stats hp ${statBounds.hp.min}-${statBounds.hp.max}, attack ${statBounds.attack.min}-${statBounds.attack.max}, defense ${statBounds.defense.min}-${statBounds.defense.max}, xpYield ${statBounds.xpYield.min}-${statBounds.xpYield.max}
- item value coin: ${valueBand.min}-${valueBand.max}
- narration line max chars: ${textCaps.narrationLineMaxChars}
- name max chars: ${textCaps.nameMaxChars}
- dialogue/description max chars: ${textCaps.descriptionDialogueLineMaxChars}
- signature floors: metadata.signature true only in ${gameBounds.directorManifest.signatureMomentBand} band (${gameBounds.directorManifest.signatureMomentsPerRun} per run)

${schemaDisciplineBlock()}

Field-shape example manifest (shows every item category and a full step trap; actual output must obey the item/trap budgets above):
${JSON.stringify(example, null, 2)}

Player summary (respond to this conduct in placement, narration, and quests):
${playerSummary}

Reply with ONLY the JSON manifest object. No prose, no markdown fences, no commentary.`;
};

export const verifyCanonFingerprint = (worldSection: string): void => {
  const fingerprint = fingerprintText(worldSection);
  if (fingerprint !== WORLD_HARD_CANON_FINGERPRINT) {
    throw new Error(
      `WORLD.md §10 changed (fingerprint ${fingerprint}, expected ${WORLD_HARD_CANON_FINGERPRINT}). Update HARD_CANON_BLOCK and WORLD_HARD_CANON_FINGERPRINT after deliberate review.`,
    );
  }
};
