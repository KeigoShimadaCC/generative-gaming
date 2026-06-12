import { bounds, config, type GameBounds, type GameConfig } from "../../config/index.js";
import { PROTOCOL_VERSION } from "../../schemas/protocol.js";
import type { DepthBand } from "../../schemas/entities/index.js";
import {
  validApproachMeleeBehaviorFixture,
  validArmorItemFixture,
  validCoinItemFixture,
  validWeaponItemFixture,
} from "../../schemas/fixtures/entities.js";
import { fingerprintText } from "./world-sync.js";
import type { ManifestItemEntry, ManifestPlacementHint } from "../../schemas/manifest.js";
import {
  buildSignatureInstructionBlock,
  buildSignaturePromptPlan,
  type SignatureBudgetValue,
  type SignaturePromptPlan,
} from "./signature.js";

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
  readonly signature?: SignaturePromptPlan;
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
    fixture: {
      id: "food-1",
      name: "food fixture",
      glyph: "%",
      kind: "food",
      value: { band: "shallows", coin: 5 },
      weapon: null,
      armor: null,
      charm: null,
      draught: null,
      note: null,
      throwable: null,
      food: {
        effect: {
          effects: [
            {
              kind: "nutrition",
              damage: null,
              heal: null,
              applyStatus: null,
              cureStatus: null,
              buffStat: null,
              nutrition: {
                fullness: bounds.effectVocabulary.verbs.nutrition.fullness.min,
              },
              teleportSelf: null,
              teleportTarget: null,
              blink: null,
              knockback: null,
              reveal: null,
              identify: null,
              enchant: null,
              summon: null,
              transform: null,
              dig: null,
            },
          ],
          trigger: {
            kind: "quaff",
            quaff: {},
            read: null,
            throwHit: null,
            equipPassive: null,
            onHit: null,
            onStruck: null,
            step: null,
            use: null,
          },
          targeting: {
            kind: "self",
            self: {},
            melee: null,
            bolt: null,
            burst: null,
            floor: null,
          },
        },
      },
      tool: null,
      keyItem: null,
      coin: null,
    },
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

const fieldShapeExampleForBand = (
  band: DepthBand,
  depth: number,
  seed: string,
  signature: boolean,
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
        id: "example-melee-a",
        name: "example melee a",
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
        id: "example-melee-b",
        name: "example melee b",
        glyph: "b",
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
        placementHint: {
          roomIndex: null,
          distance: "far_from_entrance" as const,
          spread: true,
        },
      },
    ],
    items: itemExamples.map((item) =>
      itemExampleForBand(item, band, valueBand.min),
    ),
    traps: [],
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
      originTags: { made: 2, old_stock: 0, kept: 0 },
      callbacks: ["first-room"],
      signature,
    },
  };
};

const schemaDisciplineBlock = (band: DepthBand): string => `MANIFEST SCHEMA DISCIPLINE

Root object MUST include protocolVersion "${PROTOCOL_VERSION}", depth, band, params, roster, items, traps, npcs, quest, narration, and metadata.
params requires bandOrSize, roomCountRange {min,max}, flavor, and a non-empty seed string.
Every roster/item/trap/npc entry MUST include placementHint (object with roomIndex, distance, spread) or null — never omit the field.
metadata requires originTags {made, old_stock, kept}, callbacks string array, and signature boolean.

Validity-first output recipe for this live pass:
- Use 2 roster entries by default, abilities:[] on every enemy. If the player summary is pacifist-clear (0% combat engagement with fights avoided or retreats), use exactly 1 roster entry so enemy density stays low.
- For every roster entry, copy these exact low-cost stats for the ${band} band: hp ${bounds.enemyDesign.statBudgetsByBand[band].hp.min}, attack ${bounds.enemyDesign.statBudgetsByBand[band].attack.min}, defense ${bounds.enemyDesign.statBudgetsByBand[band].defense.min}, xpYield ${bounds.enemyDesign.statBudgetsByBand[band].xpYield.min}. Do not choose larger in-range stats; Gate 1 prices stat increases and can reject the roster.
- Use behavior kind approach_melee unless the responsiveness target below explicitly asks for thief, keep_range, flee_low_hp, or patrol. Include the required payload object for every active behavior and null for inactive behavior payloads.
- Use exactly 4 items by default: one weapon, one armor, one food, and one coin. For hoarder-clear summaries, use 5-6 items if the item budget allows or make at least two emitted items kind "coin". Do not emit charm, draught, note, throwable, tool, or key_item unless a later prompt explicitly asks.
- Use traps:[] by default. Prefer behavior, placement, item, callback, NPC, and quest variation over traps for responsiveness; trap schema validity is easy to break.
- Use npcs:[] and quest:null by default. If the player summary is completionist-clear (NPC talks, quests accepted/completed, or broad exploration), include exactly 1 kept NPC and one linked quest using the NPC/quest safety notes below.
- Use metadata.callbacks as exactly the narration observation triggerTag values you emitted.

NPC/quest safety notes when completionist-clear:
- Quest objective kind "fetch" is safest: fetch.itemId MUST equal one emitted item id; all inactive objective payload fields MUST be null.
- Quest reward should have coin non-null or itemIds/identifyItemIds non-empty.
- NPC origin MUST be "kept"; dialogue needs rootNodeId, at least 2 nodes, 2 choices per node, and no dangling nextNodeId.
- Link the quest twice: npc.questHook.id equals quest.id, and one dialogue choice questHookId equals quest.id.

Tagged vocabulary objects use nullable-payload style: include kind, include every payload field, set the active payload object on the matching field, and null on every inactive field.
Behavior payloads that MUST include their parameter objects when active:
- approach_melee → approachMelee:{} (no parameters)
- keep_range → keepRange:{distanceTiles} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.keepRangeDistanceTiles.min}-${bounds.enemyDesign.behaviorVocabulary.parameters.keepRangeDistanceTiles.max})
- flee_low_hp → fleeLowHp:{thresholdPercent} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.fleeLowHpThresholdPercent.min}-${bounds.enemyDesign.behaviorVocabulary.parameters.fleeLowHpThresholdPercent.max})
- pack_hunter → packHunter:{allyCount} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.packHunter.allyCountMin}-${bounds.enemyDesign.behaviorVocabulary.parameters.packHunter.allyCountMax})
- ambusher → ambusher:{wakeRadiusTiles} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.ambusherWakeRadiusTiles.min}-${bounds.enemyDesign.behaviorVocabulary.parameters.ambusherWakeRadiusTiles.max})
- territorial → territorial:{radiusTiles} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.territorialRadiusTiles.min}-${bounds.enemyDesign.behaviorVocabulary.parameters.territorialRadiusTiles.max})
- guard → guard:{tetherId,tetherRadiusTiles} (avoid unless the tether exists)
- patrol, thief, bodyguard, mimic → active payload is {}
- caster → caster:{cooldownTurns} (range ${bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns.min}-${bounds.enemyDesign.behaviorVocabulary.parameters.casterCooldownTurns.max})

Effect payload spellings are strict:
- nutrition uses nutrition:{fullness} (range ${bounds.effectVocabulary.verbs.nutrition.fullness.min}-${bounds.effectVocabulary.verbs.nutrition.fullness.max}); never nutrition.amount.
- reveal uses reveal:{target} where target is one of: ${bounds.effectVocabulary.verbs.reveal.targetKinds.join(", ")}; never reveal.radiusTiles.
- identify uses identify:{mode:"category", carriedItemId:null, category:"weapon"} or identify:{mode:"carried_item", carriedItemId:"some-item-id", category:null}; never identify:{}.
- apply_status uses applyStatus:{status,duration}; status must be one of: ${bounds.statusVocabulary.closedList.join(", ")}; never "sleep", never "turns".
- traps, if ever used, require hidden:true and trigger kind "step"; for this task prefer traps:[].
Any effect bundle using trigger kind "use" MUST include use:{charges} within bounds.
Note items MUST use note:{effect:{...}} — never invent note.text or other free-form fields.
Common mistakes to avoid: do not omit protocolVersion, metadata, value, cursed, placementHint, inactive nullable payloads, behavior parameters, use.charges, or the full step trigger object; do not raise enemy stats above the exact recipe, write hidden:false, nutrition.amount, reveal.radiusTiles, identify:{}, status:"sleep", applyStatus.turns, item proc, or note.text fields — weapons use onHit, armor uses onStruck, and absent procs are null.`;

const responsivenessTargetBlock = `RESPONSIVENESS TARGETS

Apply only the target whose numeric trace facts clearly match; do not blend every persona into every floor.

- Hoarder-clear: pickups exceed uses or hoarding signal is 2.00+. Add inventory pressure: 5-6 items if allowed or at least 2 coin items, optionally one thief behavior enemy, and narration must name one authored item while mentioning pack/cache/hoard/carry.
- Pacifist-clear: combat engagement is 0% with fights avoided or retreats. Use a route-friendly ring/open floor with room span at least 3, no near-entrance enemy, far/spread placements, exactly 1 keep_range or flee_low_hp enemy, and narration must name that threat while saying the player can avoid/slip past/retreat without striking.
- Speedrunner-clear: pickups are 0-2 and exploration is about 14% or lower. Use a compact room range with max 6 and span 0-2, place at least 2 useful items near_entrance, include an observation triggerTag/callback such as "stairs-short-route" or "exit-direct-route", and narration must mention stairs/exit plus short/direct/near routing.
- Completionist-clear: NPC talks, accepted/completed quests, or broad exploration are present. Include the safe kept NPC plus linked fetch quest, at least 2 narration observations with callbacks "npc-talk" and "quest-map", and narration must name the NPC or quest.
- Chaos-clear: both fights picked and fights avoided, 2+ item-use categories, or close call plus quest refusal. Keep traps empty for safety, but vary within valid fields: use 3+ behavior kinds across the roster, 3+ item kinds, mixed near/far placements, and 2+ callbacks/observations tied to the mixed engagement.

If no target clearly matches, keep the default validity-first recipe.`;

export const buildTaskBlock = (input: TaskBlockInput): string => {
  const { band, depth, config: gameConfig, bounds: gameBounds, seed, playerSummary } =
    input;
  const statBounds = gameBounds.enemyDesign.statBudgetsByBand[band];
  const geometry = gameConfig.runStructure.floorGeometry[band];
  const valueBand = gameConfig.itemsEconomy.valueBandsCoin[band];
  const textCaps = gameBounds.directorManifest.textCaps;
  const signature =
    input.signature ??
    buildSignaturePromptPlan({
      band,
      config: gameConfig,
      bounds: gameBounds,
    });
  const example = fieldShapeExampleForBand(band, depth, seed, signature.ask);

  return `FLOOR MANIFEST TASK

Generate a new floor manifest for depth ${depth} in the ${band} band.
Run seed: ${seed}

Band budgets (hard limits):
- spawn budget: ${formatBudget(signature.budgets.spawnBudget, " points", signature)}
- max enemies alive per floor: ${formatBudget(signature.budgets.maxEnemiesAlive, "", signature)}
- items per floor: ${gameConfig.itemsEconomy.itemsPerFloor.min}-${formatBudget(signature.budgets.itemsPerFloorMax, "", signature)}
- traps per floor: ${gameBounds.trapsNpcsQuests.traps.perFloor.min}-${formatBudget(signature.budgets.trapsPerFloorMax, "", signature)}
- npcs per floor: ${gameBounds.trapsNpcsQuests.npcs.perFloor.min}-${formatBudget(signature.budgets.npcsPerFloorMax, "", signature)}
- room count: ${geometry.rooms.min}-${geometry.rooms.max}
- allowed flavors: ${geometry.layoutFlavors.join(", ")}
- enemy stats hp ${statBounds.hp.min}-${statBounds.hp.max}, attack ${statBounds.attack.min}-${statBounds.attack.max}, defense ${statBounds.defense.min}-${statBounds.defense.max}, xpYield ${statBounds.xpYield.min}-${statBounds.xpYield.max}
- item value coin: ${valueBand.min}-${valueBand.max}
- narration line max chars: ${textCaps.narrationLineMaxChars}
- name max chars: ${textCaps.nameMaxChars}
- dialogue/description max chars: ${textCaps.descriptionDialogueLineMaxChars}
- signature floors: metadata.signature true only in ${gameBounds.directorManifest.signatureMomentBand} band (${gameBounds.directorManifest.signatureMomentsPerRun} per run)

${buildSignatureInstructionBlock(signature, playerSummary)}

${schemaDisciplineBlock(band)}

${responsivenessTargetBlock}

Safe field-shape example manifest (copy this structural pattern; change names/text/ids, keep the same counts and nullable-payload discipline):
${JSON.stringify(example, null, 2)}

Player summary (respond to this conduct in placement, narration, and quests):
${playerSummary}

Reply with ONLY the JSON manifest object. No prose, no markdown fences, no commentary.`;
};

const formatBudget = (
  value: SignatureBudgetValue,
  suffix: string,
  signature: SignaturePromptPlan,
): string =>
  value.prompt === value.base
    ? `${value.base}${suffix}`
    : `${value.prompt}${suffix} (signature relaxed from ${value.base}${suffix} by ${signature.relaxPercent}%)`;

export const verifyCanonFingerprint = (worldSection: string): void => {
  const fingerprint = fingerprintText(worldSection);
  if (fingerprint !== WORLD_HARD_CANON_FINGERPRINT) {
    throw new Error(
      `WORLD.md §10 changed (fingerprint ${fingerprint}, expected ${WORLD_HARD_CANON_FINGERPRINT}). Update HARD_CANON_BLOCK and WORLD_HARD_CANON_FINGERPRINT after deliberate review.`,
    );
  }
};
