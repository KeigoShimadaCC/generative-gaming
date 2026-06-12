import { expect, test, type Page } from "@playwright/test";

const FIXED_TITLE_NOW_MS = Number.parseInt("test", 36);

const PRE_DESCENT_KEYS = [
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "n",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
  "ArrowRight",
] as const;

const POST_PICKUP_KEYS = [
  "b",
  "ArrowDown",
  "ArrowDown",
  "ArrowDown",
  "b",
  "b",
] as const;

test("plays one deterministic mocked-director happy path", async ({ page }) => {
  await page.addInitScript((nowMs) => {
    Date.now = () => nowMs;
  }, FIXED_TITLE_NOW_MS);

  const state = page.getByTestId("game-state");

  await page.goto("/");
  await expect(state).toHaveAttribute("data-screen", "title");
  await expect(page.getByTestId("title-screen")).toBeVisible();
  await expect(page.getByTestId("title-seed")).toContainText("lantern-test");

  await page.getByTestId("new-run-button").click();
  await expect(state).toHaveAttribute("data-screen", "playing");
  await expect(state).toHaveAttribute("data-depth", "1");
  await expect(state).toHaveAttribute("data-turn", "0");
  await expect(page.getByTestId("game-grid")).toBeVisible();
  await expect(page.getByTestId("hud")).toBeVisible();
  await expect(page.getByTestId("message-log")).toBeVisible();

  let expectedTurn = 0;
  for (const key of PRE_DESCENT_KEYS) {
    expectedTurn += 1;
    await pressActionKey(page, expectedTurn, key);
  }

  expectedTurn += 1;
  await pressActionKey(page, expectedTurn, "g");

  await page.keyboard.press("i");
  await expect(state).toHaveAttribute("data-panel-mode", "inventory");
  await expect(page.getByTestId("inventory-panel")).toBeVisible();
  await page.keyboard.press("i");
  await expect(state).toHaveAttribute("data-panel-mode", "inspect");

  for (const key of POST_PICKUP_KEYS) {
    expectedTurn += 1;
    await pressActionKey(page, expectedTurn, key);
  }

  await expect(state).toHaveAttribute("data-turn", "19");
  await page.keyboard.press(">");
  const transition = page.getByTestId("transition-overlay");
  await expect(transition).toHaveAttribute("data-transition-phase", "descending");
  await expect(transition).toHaveAttribute("data-skip-enabled", "true");
  await page.keyboard.press("Space");

  await expect(state).toHaveAttribute("data-depth", "2");
  await expect(state).toHaveAttribute("data-turn", "20");
  await expect(state).toHaveAttribute("data-input-locked", "false");
  await expect(page.getByTestId("game-grid")).toBeVisible();
  await expect(page.getByTestId("hud")).toBeVisible();
  await expect(page.getByTestId("message-log")).toBeVisible();

  await page.keyboard.press("q");
  await expect(state).toHaveAttribute("data-panel-mode", "quest");
  await expect(page.getByTestId("quest-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(state).toHaveAttribute("data-panel-mode", "inspect");

  await page.keyboard.press("Tab");
  await expect(state).toHaveAttribute("data-diary-open", "true");
  await expect(page.getByTestId("diary-layer")).toBeVisible();
  await expect(page.getByTestId("dungeon-diary")).toHaveAttribute(
    "data-diary-mode",
    "partial",
  );
  await page.keyboard.press("Tab");
  await expect(state).toHaveAttribute("data-diary-open", "false");
  await expect(page.getByTestId("diary-layer")).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(page.locator('[data-confirm-prompt="true"]')).toContainText(
    "Abandon the run? y/n",
  );
  await expect(state).toHaveAttribute("data-screen", "playing");
  await page.keyboard.press("y");
  await expect(state).toHaveAttribute("data-screen", "summary");
  await expect(state).toHaveAttribute("data-terminal-status", "ABORTED");
  await expect(page.getByTestId("summary-screen")).toBeVisible();
  await expect(page.getByTestId("dungeon-diary")).toHaveAttribute(
    "data-diary-mode",
    "final",
  );

  await page.getByTestId("run-index-button").click();
  await expect(state).toHaveAttribute("data-screen", "run-index");
  await expect(page.getByTestId("run-index")).toBeVisible();
  await expect(page.getByTestId("run-index-entry")).toHaveCount(1);
  await expect(page.getByTestId("run-index-entry").first()).toHaveAttribute(
    "data-outcome",
    "abort",
  );
});

const pressActionKey = async (
  page: Page,
  expectedTurn: number,
  key: string,
): Promise<void> => {
  const state = page.getByTestId("game-state");

  await expect(state).toHaveAttribute("data-input-locked", "false");
  await page.keyboard.press(key);
  await expect(state).toHaveAttribute("data-turn", String(expectedTurn));
  await expect(state).toHaveAttribute("data-input-locked", "false");
};
