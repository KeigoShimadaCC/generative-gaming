import { describe, expect, it } from "vitest";

import { bounds, config } from "./index.js";

const expectDeepFrozen = (value: unknown): void => {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);

    const objectValue = value as Record<PropertyKey, unknown>;
    for (const key of Reflect.ownKeys(objectValue)) {
      expectDeepFrozen(objectValue[key]);
    }
  }
};

describe("game config", () => {
  it("exposes every GAME_DESIGN section group represented by tunables and bounds", () => {
    for (const group of [
      "runStructure",
      "playerCharacter",
      "combatMath",
      "statusMagnitudes",
      "itemsEconomy",
      "enemyDesign",
      "trapsNpcsQuests",
      "difficultyGate",
      "gate3",
      "directorManifest"
    ]) {
      expect(config).toHaveProperty(group);
    }

    for (const group of [
      "runStructure",
      "playerCharacter",
      "statusVocabulary",
      "effectVocabulary",
      "itemsEconomy",
      "enemyDesign",
      "trapsNpcsQuests",
      "difficultyGate",
      "directorManifest",
      "gauntlet"
    ]) {
      expect(bounds).toHaveProperty(group);
    }
  });

  it("transcribes doc values verbatim", () => {
    expect(config.runStructure.depthFloors).toBe(12);
    expect(config.runStructure.perFloorSoftCapTurns).toBe(800);
    expect(config.runStructure.floorGeometry.shallows.grid.width).toBe(32);
    expect(config.runStructure.floorGeometry.middle.rooms.max).toBe(9);
    expect(config.playerCharacter.stats.hp.start).toBe(20);
    expect(config.playerCharacter.stats.fullness.decay.everyTurns).toBe(10);
    expect(config.playerCharacter.naturalRegen.everyTurns).toBe(6);
    expect(config.playerCharacter.xpToNextLevelFactor).toBe(8);
    expect(config.combatMath.hitChancePercent).toBe(95);
    expect(config.combatMath.varianceMultiplier.min).toBe(0.85);
    expect(config.statusMagnitudes.poisonHpPerTurn).toBe(-1);
    expect(config.statusMagnitudes.burnHpPerTurn).toBe(-2);
    expect(config.statusMagnitudes.regenHpPerTurn).toBe(2);
    expect(config.statusMagnitudes.shieldDefBonus).toBe(3);
    expect(config.statusMagnitudes.weakenAtkPenalty).toBe(-2);
    expect(config.itemsEconomy.valueBandsCoin.lowest.max).toBe(200);
    expect(config.itemsEconomy.merchantMultipliers.buy).toBe(0.5);
    expect(config.itemsEconomy.cursedRate).toBe(0.1);
    expect(config.enemyDesign.spawnBudgetPoints.middle).toBe(45);
    expect(config.trapsNpcsQuests.quests.maxPerRun).toBe(3);
    expect(config.difficultyGate.botEnsemble.policies).toHaveLength(3);
    expect(config.difficultyGate.botEnsemble.seedsPerPolicy).toBe(5);
    expect(config.difficultyGate.hpRetentionMode).toBe("advisory");
    expect(config.gate3.judge.enabled).toBe(false);
    expect(config.gate3.judge.mode).toBe("advisory");
    expect(config.gate3.judge.timeoutMs).toBe(60_000);
    expect(
      config.difficultyGate.thresholdsByBand.lowest.clearRateMinPercent
    ).toBe(70);
    expect(
      config.difficultyGate.thresholdsByBand.middle.medianHpRetentionPercent.min
    ).toBe(30);
    expect(config.directorManifest.signatureMoment.enabled).toBe(true);
    expect(config.directorManifest.signatureMoment.budgetRelaxPercent).toBe(25);

    expect(bounds.runStructure.perRunHardCapTurns).toBe(8000);
    expect(bounds.playerCharacter.overfedFullnessCap).toBe(200);
    expect(bounds.statusVocabulary.durationTurns.burn.max).toBe(5);
    expect(bounds.effectVocabulary.verbs.damage.amount.max).toBe(12);
    expect(bounds.effectVocabulary.triggers.procChancePercent.onHit.max).toBe(
      30
    );
    expect(bounds.itemsEconomy.weaponAtkBonus.max).toBe(6);
    expect(bounds.enemyDesign.statBudgetsByBand.middle.hp.max).toBe(30);
    expect(
      bounds.enemyDesign.behaviorVocabulary.parameters.packHunter.allyCountMin
    ).toBe(2);
    expect(bounds.trapsNpcsQuests.npcs.perFloor.max).toBe(2);
    expect(bounds.gauntlet.repairRetriesMax).toBe(2);
    expect(bounds.directorManifest.signatureMomentsPerRun).toBe(1);
    expect(bounds.directorManifest.textCaps.narrationLineMaxChars).toBe(160);
    expect(bounds.directorManifest.textCaps.nameMaxChars).toBe(40);
    expect(
      bounds.directorManifest.textCaps.descriptionDialogueLineMaxChars
    ).toBe(200);
  });

  it("deep-freezes config and hard bounds", () => {
    expectDeepFrozen(config);
    expectDeepFrozen(bounds);
  });
});
