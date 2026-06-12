import { describe, expect, it } from "vitest";

import {
  ARRIVAL_RITUAL_MS,
  READY_THEATER_MS,
  STAIRS_CAP_MS,
  createDescendingTransition,
  markTransitionFloorReady,
  shouldAutoEnterFloor,
  shouldResumePlay,
  startArrivalRitual,
  transitionPresentation,
  transitionPresentationForSource,
  type FloorControllerState,
} from "./model";

describe("floor transition UX", () => {
  it("projects ready, in-flight, and none controller states without exposing generation state as copy", () => {
    const states: readonly FloorControllerState[] = ["ready", "in_flight", "none"];

    const presentations = states.map((controllerState) =>
      transitionPresentation(
        createDescendingTransition({
          depth: 4,
          whisper: "The Deep closes one room and opens another.",
          controllerState,
          startedAtMs: 0,
        }),
        400,
      ),
    );

    expect(presentations[0]).toMatchObject({
      floorLabel: "Floor 4",
      shimmerVisible: false,
      awaitingFloor: false,
    });
    expect(presentations[1]).toMatchObject({
      floorLabel: "Floor 4",
      shimmerVisible: true,
      awaitingFloor: true,
    });
    expect(presentations[2]).toMatchObject({
      floorLabel: "Floor 4",
      shimmerVisible: false,
      awaitingFloor: true,
    });
    expect(
      presentations.every((presentation) =>
        !/generat|fallback|error|loading/i.test(presentation.whisper),
      ),
    ).toBe(true);
  });

  it("serves generated and fallback floors through identical presentation props", () => {
    expect(transitionPresentationForSource("generated")).toEqual(
      transitionPresentationForSource("fallback"),
    );
  });

  it("caps shimmer progress and allows interrupt only after the floor is ready", () => {
    const waiting = createDescendingTransition({
      depth: 2,
      whisper: "A lantern-breath thins below the stair.",
      controllerState: "in_flight",
      startedAtMs: 0,
    });

    expect(transitionPresentation(waiting, STAIRS_CAP_MS * 2)).toMatchObject({
      shimmerVisible: true,
      shimmerPercent: 100,
      skipEnabled: false,
    });

    const ready = markTransitionFloorReady(waiting, 1_100, "generated");
    expect(transitionPresentation(ready, 1_100).skipEnabled).toBe(true);
    expect(shouldAutoEnterFloor(ready, 1_100)).toBe(true);
  });

  it("keeps ready floors in pure theater for 1-2s unless skipped", () => {
    const ready = markTransitionFloorReady(
      createDescendingTransition({
        depth: 3,
        whisper: "Stone remembers the last warm footprint.",
        controllerState: "ready",
        startedAtMs: 0,
      }),
      50,
      "generated",
    );

    expect(shouldAutoEnterFloor(ready, READY_THEATER_MS - 1)).toBe(false);
    expect(shouldAutoEnterFloor(ready, READY_THEATER_MS)).toBe(true);
  });

  it("models the arrival ritual before play resumes", () => {
    const arrival = startArrivalRitual(
      markTransitionFloorReady(
        createDescendingTransition({
          depth: 5,
          whisper: "Quiet dust gathers where names are unwritten.",
          controllerState: "ready",
          startedAtMs: 0,
        }),
        100,
        "generated",
      ),
      1_000,
    );

    expect(transitionPresentation(arrival, 1_800)).toMatchObject({
      phase: "arrival",
      entrancePulse: true,
      arrivalProgress: 0.4,
    });
    expect(shouldResumePlay(arrival, 1_000 + ARRIVAL_RITUAL_MS - 1)).toBe(false);
    expect(shouldResumePlay(arrival, 1_000 + ARRIVAL_RITUAL_MS)).toBe(true);
  });
});
