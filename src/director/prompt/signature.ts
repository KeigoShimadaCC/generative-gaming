import type { GameBounds, GameConfig } from "../../config/index.js";
import type { DepthBand } from "../../schemas/entities/index.js";

export type SignaturePromptPlan = {
  readonly ask: boolean;
  readonly relaxPercent: number;
  readonly budgets: SignatureBudgetPlan;
};

export type SignatureBudgetPlan = {
  readonly spawnBudget: SignatureBudgetValue;
  readonly maxEnemiesAlive: SignatureBudgetValue;
  readonly itemsPerFloorMax: SignatureBudgetValue;
  readonly trapsPerFloorMax: SignatureBudgetValue;
  readonly npcsPerFloorMax: SignatureBudgetValue;
};

export type SignatureBudgetValue = {
  readonly base: number;
  readonly prompt: number;
};

export type SignaturePromptPlanInput = {
  readonly band: DepthBand;
  readonly config: GameConfig;
  readonly bounds: GameBounds;
  readonly signatureUsedThisRun?: boolean;
};

export const buildSignaturePromptPlan = ({
  band,
  config,
  bounds,
  signatureUsedThisRun = false,
}: SignaturePromptPlanInput): SignaturePromptPlan => {
  const enabled = config.directorManifest.signatureMoment.enabled;
  const ask =
    enabled &&
    band === bounds.directorManifest.signatureMomentBand &&
    !signatureUsedThisRun;
  const relaxPercent = config.directorManifest.signatureMoment.budgetRelaxPercent;

  return {
    ask,
    relaxPercent,
    budgets: {
      spawnBudget: budgetValue(
        config.enemyDesign.spawnBudgetPoints[band],
        relaxPercent,
        ask,
      ),
      maxEnemiesAlive: budgetValue(
        bounds.enemyDesign.statBudgetsByBand[band].maxEnemiesAlivePerFloor,
        relaxPercent,
        ask,
      ),
      itemsPerFloorMax: budgetValue(
        config.itemsEconomy.itemsPerFloor.max,
        relaxPercent,
        ask,
      ),
      trapsPerFloorMax: budgetValue(
        bounds.trapsNpcsQuests.traps.perFloor.max,
        relaxPercent,
        ask,
      ),
      npcsPerFloorMax: budgetValue(
        bounds.trapsNpcsQuests.npcs.perFloor.max,
        relaxPercent,
        ask,
      ),
    },
  };
};

export const buildSignatureInstructionBlock = (
  plan: SignaturePromptPlan,
  playerSummary: string,
): string => {
  if (!plan.ask) {
    return [
      "SIGNATURE MOMENT",
      "Do not spend the run's signature moment on this floor. Set metadata.signature to false.",
    ].join("\n");
  }

  return [
    "SIGNATURE MOMENT ASK",
    `This is the run's one allowed signature moment. Set metadata.signature to true and spend the ${plan.relaxPercent}% relaxed budget shown above.`,
    "Author one bold, personal Made beat: a named Made entity, encounter, or quest hook that directly answers the player summary.",
    "Keep it fair, concrete, second-person, present-tense, and playable through the manifest schema; do not explain the beat outside JSON.",
    "Player summary to answer:",
    playerSummary,
  ].join("\n");
};

const budgetValue = (
  base: number,
  relaxPercent: number,
  relax: boolean,
): SignatureBudgetValue => ({
  base,
  prompt: relax ? Math.ceil(base * (100 + relaxPercent) / 100) : base,
});
