import { describe, expect, it } from "vitest";

import { bounds, config } from "../../config/index.js";
import {
  CANON_VERSION,
  HARD_CANON_BLOCK,
  WORLD_HARD_CANON_FINGERPRINT,
  buildPersonaBlock,
  buildTaskBlock,
  verifyCanonFingerprint,
} from "./blocks.js";
import {
  fingerprintText,
  readRepoWorldHardCanonSection,
} from "./world-sync.js";

describe("prompt blocks", () => {
  it("keeps HARD_CANON_BLOCK versioned and non-empty", () => {
    expect(HARD_CANON_BLOCK).toContain(CANON_VERSION);
    expect(HARD_CANON_BLOCK.length).toBeGreaterThan(400);
    expect(HARD_CANON_BLOCK).toContain("10. Nothing you generate");
  });

  it("syncs canon fingerprint with WORLD.md §10", () => {
    const section = readRepoWorldHardCanonSection();
    expect(fingerprintText(section)).toBe(WORLD_HARD_CANON_FINGERPRINT);
    expect(() => verifyCanonFingerprint(section)).not.toThrow();
  });

  it("provides distinct persona blocks per band", () => {
    expect(buildPersonaBlock("shallows")).toContain("indifferent");
    expect(buildPersonaBlock("middle")).toContain("interested");
    expect(buildPersonaBlock("lowest")).toContain("intimate");
  });

  it("injects band budgets and schema discipline into the task block", () => {
    const task = buildTaskBlock({
      band: "shallows",
      depth: 3,
      config,
      bounds,
      seed: "fixture-shallows-3",
      playerSummary: "Picks up every coin.",
    });

    expect(task).toContain(`spawn budget: ${config.enemyDesign.spawnBudgetPoints.shallows}`);
    expect(task).toContain("protocolVersion");
    expect(task).toContain("placementHint");
    expect(task).toContain("packHunter");
    expect(task).toContain("ambusher");
    expect(task).toContain("Use 2 roster entries by default");
    expect(task).toContain("copy these exact low-cost stats");
    expect(task).toContain("Use exactly 4 items by default");
    expect(task).toContain("Use traps:[] by default");
    expect(task).toContain("Use npcs:[] and quest:null by default");
    expect(task).toContain("RESPONSIVENESS TARGETS");
    expect(task).toContain("Hoarder-clear");
    expect(task).toContain("Pacifist-clear");
    expect(task).toContain("Speedrunner-clear");
    expect(task).toContain("Completionist-clear");
    expect(task).toContain("Chaos-clear");
    for (const kind of ["weapon", "armor", "food", "coin"]) {
      expect(task).toContain(`"kind": "${kind}"`);
    }
    expect(task).toContain("Do not emit charm, draught, note, throwable, tool, or key_item");
    expect(task).toContain('"onHit": null');
    expect(task).toContain('"onStruck": null');
    expect(task).toContain('"cursed": false');
    expect(task).toContain('"traps": []');
    expect(task).toContain("nutrition uses nutrition:{fullness}");
    expect(task).toContain("reveal uses reveal:{target}");
    expect(task).toContain("identify uses identify:{mode:");
    expect(task).toContain('apply_status uses applyStatus:{status,duration}');
    expect(task).toContain("never nutrition.amount");
    expect(task).toContain("Common mistakes to avoid");
    expect(task).toContain("ONLY the JSON manifest");
    expect(task).toContain(
      `narration line max chars: ${bounds.directorManifest.textCaps.narrationLineMaxChars}`,
    );
    expect(task).toContain("Picks up every coin.");
  });
});
