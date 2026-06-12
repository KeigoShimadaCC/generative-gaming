import { describe, expect, it } from "vitest";

import { materialize } from "../apply/index.js";
import { formatLogEvent } from "../../engine/render/log.js";
import { runEvent } from "../../engine/run/events.js";
import type { EngineLogEvent } from "../../engine/state/index.js";
import { validShallowsManifestFixture } from "../../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import { evaluateNarrationBeats } from "./index.js";

describe("narration beat evaluation", () => {
  it("fires the floor intro once as a Deep-voice log line", () => {
    const state = stateFor(
      manifestWithNarration({
        floorIntro: "You take the stair the Deep leaves open.",
        observations: [],
      }),
    );
    const first = evaluateNarrationBeats(state, [floorEnteredEvent(state)]);
    const second = evaluateNarrationBeats(first.state, [floorEnteredEvent(state)]);

    expect(first.events).toHaveLength(1);
    expect(first.events[0]?.data).toMatchObject({
      beatId: "floor-intro",
      beatKind: "floor_intro",
      text: "You take the stair the Deep leaves open.",
    });
    expect(formatLogEvent(first.events[0]!)).toBe(
      "t0 Deep: You take the stair the Deep leaves open.",
    );
    expect(first.state.log).toContainEqual(first.events[0]);
    expect(second.events).toEqual([]);
  });

  it("fires first-sight observations from fixture reveal events", () => {
    const manifest = manifestWithNarration({
      floorIntro: "The first stair is quiet.",
      observations: [
        {
          id: "obs-first-enemy",
          triggerTag: "first-sight:enemy",
          text: "You see what was waiting without breathing.",
        },
      ],
    });
    const state = stateFor(manifest);
    const first = evaluateNarrationBeats(state, [
      {
        turn: 2,
        type: "mimic_revealed",
        data: { actorId: "enemy#1" },
      } as EngineLogEvent,
    ]);
    const second = evaluateNarrationBeats(first.state, [
      {
        turn: 3,
        type: "mimic_revealed",
        data: { actorId: "enemy#1" },
      } as EngineLogEvent,
    ]);

    expect(first.events.map((event) => event.data.beatId)).toEqual([
      "obs-first-enemy",
    ]);
    expect(second.events).toEqual([]);
  });

  it("fires flee, hoard, and quaff action-pattern observations", () => {
    const state = stateFor(
      manifestWithNarration({
        floorIntro: "Stone listens.",
        observations: [
          {
            id: "obs-flee",
            triggerTag: "flee",
            text: "You leave claw marks behind by running.",
          },
          {
            id: "obs-hoard",
            triggerTag: "hoard",
            text: "You gather small things like proof.",
          },
          {
            id: "obs-quaff",
            triggerTag: "quaff",
            text: "You drink before the dark can name it.",
          },
        ],
      }),
    );
    const result = evaluateNarrationBeats(state, [
      runEvent(1, "run_action_resolved", { actionKind: "move" }),
      runEvent(2, "run_action_resolved", { actionKind: "move" }),
      runEvent(3, "run_action_resolved", { actionKind: "move" }),
      itemPickedUpEvent(4, "item#1", "knife-1"),
      itemPickedUpEvent(5, "item#2", "coin-1"),
      itemTriggeredEvent(6, "quaff"),
    ]);

    expect(result.events.map((event) => event.data.beatId)).toEqual([
      "obs-flee",
      "obs-hoard",
      "obs-quaff",
    ]);
  });

  it("caps observation beats per floor and tracks fired beats once", () => {
    const state = stateFor(
      manifestWithNarration({
        floorIntro: "Stone listens.",
        observations: [
          observation("obs-1"),
          observation("obs-2"),
          observation("obs-3"),
          observation("obs-4"),
        ],
      } as FloorManifest["narration"]),
    );
    const events = [
      runEvent(1, "run_action_resolved", { actionKind: "move" }),
      runEvent(2, "run_action_resolved", { actionKind: "move" }),
      runEvent(3, "run_action_resolved", { actionKind: "move" }),
    ];
    const first = evaluateNarrationBeats(state, events);
    const second = evaluateNarrationBeats(first.state, events);

    expect(first.events.map((event) => event.data.beatId)).toEqual([
      "obs-1",
      "obs-2",
      "obs-3",
    ]);
    expect(second.events).toEqual([]);
  });
});

const stateFor = (manifest: FloorManifest) =>
  materialize(manifest, manifest.params.seed).floor.state;

const manifestWithNarration = (
  narration: FloorManifest["narration"],
): FloorManifest =>
  ({
    ...validShallowsManifestFixture,
    narration,
    metadata: {
      ...validShallowsManifestFixture.metadata,
      callbacks: narration.observations.map((beat) => beat.triggerTag),
    },
  }) as FloorManifest;

const floorEnteredEvent = (
  state: ReturnType<typeof stateFor>,
): EngineLogEvent =>
  runEvent(0, "run_floor_entered", {
    floorId: state.floor.floorId,
    depth: state.floor.depth,
    band: state.floor.band,
    seed: state.run.seed,
    rosterCost: 0,
    spawnBudget: 0,
    placementDeviationCount: 0,
    hoardFeatureId: null,
  });

const observation = (id: string) => ({
  id,
  triggerTag: "flee",
  text: `You count ${id} in the dark.`,
});

const itemPickedUpEvent = (
  turn: number,
  entityId: "item#1" | "item#2",
  definitionId: string,
): EngineLogEvent =>
  ({
    turn,
    type: "item_picked_up",
    data: {
      itemInstanceId: `${definitionId}#stack`,
      entityId,
      definitionId,
      quantity: 1,
      stacked: false,
    },
  }) as EngineLogEvent;

const itemTriggeredEvent = (
  turn: number,
  trigger: "quaff",
): EngineLogEvent =>
  ({
    turn,
    type: "item_triggered",
    data: {
      itemInstanceId: "draught#stack",
      definitionId: "draught-1",
      trigger,
      targetIds: ["player"],
      cells: [],
      whiffed: false,
    },
  }) as EngineLogEvent;
