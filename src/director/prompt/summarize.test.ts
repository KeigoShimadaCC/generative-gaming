import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTraceNdjson } from "../../harness/replay/parse.js";
import type { ParsedTrace, TraceTurnRecord } from "../../harness/replay/types.js";
import { summarizeTrace } from "./summarize.js";

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const miniTrace = (turns: TraceTurnRecord[]): ParsedTrace => ({
  header: {
    recordType: "header",
    protocolVersion: "1.2.0",
    engineVersion: "0.0.0",
    modelId: "test",
    contentRef: { providerId: "test", packVersion: "0.0.0" },
    seed: "mini",
    createdAt: "2026-06-12T00:00:00.000Z",
    runId: "mini",
  },
  turns,
});

describe("trace summarizer", () => {
  it("extracts known facts from a hand-built aggressive mini-trace", () => {
    const trace = miniTrace([
      {
        turn: 1,
        action: { kind: "attack", targetId: "enemy#1" },
        events: [
          {
            turn: 0,
            type: "attack_hit",
            data: {
              actorId: "player",
              defenderId: "enemy#1",
              attackerAttack: 2,
              defenderDefense: 0,
              baseDamage: 2,
              damage: 2,
              hitRoll: 50,
              hitChancePercent: 95,
              varianceMultiplier: 1,
              defenderHpBefore: 4,
              defenderHpAfter: 0,
            },
          },
          {
            turn: 0,
            type: "entity_died",
            data: {
              entityId: "enemy#1",
              kind: "enemy",
              position: { x: 1, y: 1 },
              xpYield: 2,
            },
          },
        ],
        stateHash: "abc",
      },
      {
        turn: 2,
        action: { kind: "move", direction: "north" },
        events: [
          {
            turn: 1,
            type: "moved",
            data: {
              actorId: "player",
              from: { x: 1, y: 1 },
              to: { x: 1, y: 0 },
              direction: "north",
            },
          },
          { turn: 1, type: "actor_turn", data: { actorId: "enemy#2" } },
        ],
        stateHash: "def",
      },
    ] as TraceTurnRecord[]);

    const summary = summarizeTrace(trace);
    expect(summary.facts.fightsPicked).toBe(1);
    expect(summary.facts.killsByEnemyType["enemy#1"]).toBe(1);
    expect(summary.facts.fightsAvoided).toBe(1);
    expect(summary.facts.cellsVisited).toBe(1);
    expect(summary.textBlock).toContain("Combat:");
  });

  it("extracts hoarding and pickup facts from a cautious mini-trace", () => {
    const trace = miniTrace([
      {
        turn: 1,
        action: { kind: "pickup" },
        events: [
          {
            turn: 0,
            type: "item_picked_up",
            data: {
              definitionId: "oldstock-hardtack",
              itemInstanceId: "item#1",
              entityId: "item#1",
              quantity: 1,
              stacked: false,
            },
          },
        ],
        stateHash: "abc",
      },
      {
        turn: 2,
        action: { kind: "pickup" },
        events: [
          {
            turn: 1,
            type: "item_picked_up",
            data: {
              definitionId: "oldstock-coin",
              itemInstanceId: "item#2",
              entityId: "item#2",
              quantity: 1,
              stacked: false,
            },
          },
        ],
        stateHash: "def",
      },
      {
        turn: 3,
        action: { kind: "move", direction: "west" },
        events: [
          {
            turn: 2,
            type: "moved",
            data: {
              actorId: "player",
              from: { x: 2, y: 2 },
              to: { x: 1, y: 2 },
              direction: "west",
            },
          },
        ],
        stateHash: "ghi",
      },
    ] as TraceTurnRecord[]);

    const summary = summarizeTrace(trace);
    expect(summary.facts.itemPickups).toBe(2);
    expect(summary.facts.itemUses).toBe(0);
    expect(summary.facts.hoardingSignal).toBe(2);
    expect(summary.facts.fightsPicked).toBe(0);
  });

  it("separates aggressive and cautious bot fixture traces", () => {
    const aggressive = parseTraceNdjson(
      readFileSync(fixturePath("aggressive-phase24-bot-1.ndjson"), "utf8"),
    );
    const cautious = parseTraceNdjson(
      readFileSync(fixturePath("cautious-phase24-bot-1.ndjson"), "utf8"),
    );

    const aggressiveSummary = summarizeTrace(aggressive);
    const cautiousSummary = summarizeTrace(cautious);

    expect(aggressiveSummary.textBlock).not.toEqual(cautiousSummary.textBlock);
    expect(cautiousSummary.facts.itemPickups).toBeGreaterThan(
      aggressiveSummary.facts.itemPickups,
    );
    expect(cautiousSummary.facts.hoardingSignal).toBeGreaterThan(
      aggressiveSummary.facts.hoardingSignal,
    );
    expect(cautiousSummary.facts.cellsVisited).toBeGreaterThan(
      aggressiveSummary.facts.cellsVisited,
    );
  });

  it("caps the summary text block near 150 words", () => {
    const cautious = parseTraceNdjson(
      readFileSync(fixturePath("cautious-phase24-bot-1.ndjson"), "utf8"),
    );
    const words = cautiousSummaryWords(summarizeTrace(cautious).textBlock);
    expect(words.length).toBeLessThanOrEqual(150);
  });
});

const cautiousSummaryWords = (text: string): readonly string[] =>
  text.replace(/…$/, "").trim().split(/\s+/);
