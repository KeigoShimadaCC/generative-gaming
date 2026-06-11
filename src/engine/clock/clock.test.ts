import { describe, expect, it } from "vitest";

import { createClock } from "./index.js";

describe("createClock", () => {
  it("starts at turn 0 by default", () => {
    const clock = createClock();
    expect(clock.now()).toBe(0);
  });

  it("starts at a custom turn", () => {
    const clock = createClock(7);
    expect(clock.now()).toBe(7);
  });

  it("advances by 1 turn by default", () => {
    const clock = createClock();
    clock.advance();
    expect(clock.now()).toBe(1);
  });

  it("advances by a custom number of turns", () => {
    const clock = createClock(2);
    clock.advance(5);
    expect(clock.now()).toBe(7);
  });
});
