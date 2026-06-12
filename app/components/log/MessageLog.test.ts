import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  dummyLogEvent,
  formatLogEvent,
} from "@engine/render";
import { createInitialState, type GameState } from "@engine/state";

import { MessageLogFrame } from "./MessageLog";
import {
  createMessageLogViewModel,
  type MessageLogViewModel,
} from "./model";

describe("MessageLog", () => {
  it("renders the rolling last-six window in engine event order and grouped by turn", () => {
    const events = [
      dummyLogEvent("moved", 1),
      dummyLogEvent("attack_hit", 1),
      dummyLogEvent("xp_gained", 1),
      dummyLogEvent("bumped_wall", 2),
      dummyLogEvent("status_tick", 2),
      dummyLogEvent("level_up", 2),
      dummyLogEvent("terminal_state", 3),
    ];
    const model = createMessageLogViewModel(stateWithLog(events));

    expect(model.windowLines.map((line) => line.text)).toEqual(
      events.slice(1).map(formatLogEvent),
    );
    expect(model.windowGroups.map((group) => group.turn)).toEqual([1, 2, 3]);
    expect(model.windowGroups.map((group) => group.lines.length)).toEqual([
      2,
      3,
      1,
    ]);
    expect(renderLog(model)).toContain('data-turn="2"');
  });

  it("uses the engine formatter output verbatim for every rendered line", () => {
    const events = [
      dummyLogEvent("run_floor_entered", 4),
      dummyLogEvent("run_boredom", 5),
      dummyLogEvent("run_reinforcement_spawned", 5),
      dummyLogEvent("deep_narration", 5),
    ];
    const model = createMessageLogViewModel(stateWithLog(events));
    const expected = events.map(formatLogEvent);

    expect(model.windowLines.map((line) => line.text)).toEqual(expected);
    for (const line of expected) {
      expect(renderLog(model)).toContain(line);
    }
  });

  it("keeps the full history overlay complete while the main log stays windowed", () => {
    const events = [
      dummyLogEvent("state_created", 0),
      dummyLogEvent("moved", 1),
      dummyLogEvent("attack_intent", 1),
      dummyLogEvent("attack_hit", 1),
      dummyLogEvent("entity_died", 1),
      dummyLogEvent("xp_gained", 1),
      dummyLogEvent("level_up", 1),
      dummyLogEvent("terminal_state", 2),
    ];
    const model = createMessageLogViewModel(stateWithLog(events));
    const markup = renderLog(model, true);

    expect(model.windowLines).toHaveLength(6);
    expect(model.historyLines.map((line) => line.text)).toEqual(
      events.map(formatLogEvent),
    );
    expect(historyLineCount(markup)).toBe(events.length);
    expect(markup).toContain(formatLogEvent(events[0]!));
    expect(markup).toContain(formatLogEvent(events[events.length - 1]!));
  });
});

const renderLog = (
  model: MessageLogViewModel,
  historyOpen = false,
): string =>
  renderToStaticMarkup(createElement(MessageLogFrame, { model, historyOpen }));

const stateWithLog = (
  log: readonly GameState["log"][number][],
): GameState => ({
  ...createInitialState("message-log-fixture"),
  run: {
    ...createInitialState("message-log-fixture").run,
    turn: log[log.length - 1]?.turn ?? 0,
  },
  log,
});

const historyLineCount = (markup: string): number =>
  markup.match(/data-history-line-index=/g)?.length ?? 0;
