import { describe, expect, it } from "vitest";

import {
  ALL_LOG_EVENT_TYPES,
  dummyLogEvent,
  formatLogEvent,
} from "./log.js";

describe("formatLogEvent", () => {
  it("formats every log event type with non-empty text", () => {
    for (const type of ALL_LOG_EVENT_TYPES) {
      const line = formatLogEvent(dummyLogEvent(type, 3));

      expect(line.length).toBeGreaterThan(0);
      expect(line.startsWith("t3 ")).toBe(true);
    }
  });

  it("formats representative events tersely", () => {
    expect(formatLogEvent(dummyLogEvent("moved", 5))).toBe(
      "t5 player moved east (0,0)->(1,0)",
    );
    expect(formatLogEvent(dummyLogEvent("attack_hit", 5))).toBe(
      "t5 player hit enemy#1 for 3 (10->7)",
    );
    expect(formatLogEvent(dummyLogEvent("bumped_wall", 2))).toBe(
      "t2 player bumped east: wall",
    );
  });
});
