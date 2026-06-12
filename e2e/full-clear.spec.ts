import { expect, test } from "@playwright/test";

import {
  dumpStuckState,
  driveRunToWin,
  prepareFullClearDiagnostics,
  resolveCampaignSeed,
  seedToTitleNowMs
} from "./browser-bot";

const campaignSeed = resolveCampaignSeed();

test.describe("full-game browser-clear campaign", () => {
  test.beforeEach(async ({ page }) => {
    prepareFullClearDiagnostics(page);
    await page.addInitScript((nowMs) => {
      window.localStorage.clear();
      Date.now = () => nowMs;
    }, seedToTitleNowMs(campaignSeed));
  });

  test(`clears floors 1–12 to WIN for seed ${campaignSeed}`, async ({
    page
  }) => {
    const state = page.getByTestId("game-state");

    try {
      await page.goto(`/?seed=${encodeURIComponent(campaignSeed)}`);
      await expect(state).toHaveAttribute("data-screen", "title");
      await expect(page.getByTestId("title-seed")).toContainText(campaignSeed);

      await page.getByTestId("new-run-button").click();
      await expect(state).toHaveAttribute("data-screen", "playing");
      await expect(state).toHaveAttribute("data-depth", "1");
      await expect(state).toHaveAttribute("data-turn", "0");

      await driveRunToWin(page, { seed: campaignSeed });

      await expect(state).toHaveAttribute("data-screen", "summary");
      await expect(state).toHaveAttribute("data-terminal-status", "WIN");
      await expect(page.getByTestId("summary-screen")).toBeVisible();
      await expect(page.getByTestId("dungeon-diary")).toHaveAttribute(
        "data-diary-mode",
        "final"
      );

      await page.getByTestId("run-index-button").click();
      await expect(state).toHaveAttribute("data-screen", "run-index");
      await expect(page.getByTestId("run-index")).toBeVisible();
      await expect(page.getByTestId("run-index-entry")).toHaveCount(1);
      await expect(page.getByTestId("run-index-entry").first()).toHaveAttribute(
        "data-outcome",
        "victory"
      );
    } catch (error) {
      if (!isRunLostBotFailure(error)) {
        await dumpStuckState(
          page,
          `full-clear spec failure: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      throw error;
    }
  });
});

test.describe("determinism note", () => {
  test.skip(
    process.env.FULLCLEAR_DETERMINISM !== "1",
    "set FULLCLEAR_DETERMINISM=1 to run paired determinism check"
  );

  test("same seed reaches the same terminal turn twice", async ({
    browser
  }) => {
    const runOnce = async (): Promise<number> => {
      const context = await browser.newContext();
      const page = await context.newPage();
      prepareFullClearDiagnostics(page);
      await page.addInitScript((nowMs) => {
        Date.now = () => nowMs;
      }, seedToTitleNowMs(campaignSeed));

      const state = page.getByTestId("game-state");
      await page.goto(`/?seed=${encodeURIComponent(campaignSeed)}`);
      await page.getByTestId("new-run-button").click();
      await driveRunToWin(page, { seed: campaignSeed });
      const turns = Number.parseInt(
        (await state.getAttribute("data-turn")) ?? "-1",
        10
      );
      await context.close();
      return turns;
    };

    const first = await runOnce();
    const second = await runOnce();
    expect(second).toBe(first);
  });
});

function isRunLostBotFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "BotFailure" &&
    error.message === "run lost"
  );
}
