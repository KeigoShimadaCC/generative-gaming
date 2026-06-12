import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DungeonDiary } from "@harness/diary";

import { DiaryLayer } from "./DiaryLayer";
import { DiaryPanel } from "./DiaryPanel";

describe("DiaryPanel", () => {
  it("renders the summary strip, floor recap, source markers, and learned note", () => {
    const markup = renderToStaticMarkup(
      createElement(DiaryPanel, { diary: fixtureDiary, variant: "final" }),
    );

    expect(markup).toContain("Outcome");
    expect(markup).toContain("defeat");
    expect(markup).toContain("Floor 1");
    expect(markup).toContain("You keep one hand on the stair.");
    expect(markup).toContain('data-entry-kind="narration"');
    expect(markup).toContain('data-source-count="1"');
    expect(markup).toContain("What the Deep keeps");
    expect(markup).toContain("What the dungeon learned:");
  });

  it("renders the paused Tab layer with diary and artifact tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(DiaryLayer, {
        diary: fixtureDiary,
        artifactModel: null,
        activeTab: "artifacts",
        onClose: () => undefined,
        onSelectTab: () => undefined,
      }),
    );

    expect(markup).toContain("The Deep&#x27;s manuscript");
    expect(markup).toContain('role="tab"');
    expect(markup).toContain("Diary");
    expect(markup).toContain("Artifacts");
    expect(markup).toContain("No generation artifacts recorded for this run.");
  });
});

const fixtureDiary: DungeonDiary = {
  runId: "run-diary-ui",
  seed: "diary-seed",
  mode: "final",
  summary: {
    outcome: "defeat",
    depth: 1,
    turns: 12,
    kills: 1,
    discoveries: 2,
  },
  floors: [
    {
      depth: 1,
      entries: [
        {
          id: "entry-1",
          depth: 1,
          turn: 1,
          kind: "narration",
          title: "The Deep opens the page",
          text: "You keep one hand on the stair.",
          sources: [
            {
              kind: "event",
              id: "event:1:deep_narration:1",
              eventType: "deep_narration",
              turn: 1,
              depth: 1,
            },
          ],
        },
      ],
    },
  ],
  learnedNote:
    "What the dungeon learned: the run ended in defeat on floor 1 after 12 turns.",
  sourceCount: 1,
};
