import { afterAll, describe, expect, it } from "vitest";

import type { NpcDefinition } from "../../schemas/entities/index.js";
import {
  DialogueTreeSchema,
  NpcDefinitionSchema,
} from "../../schemas/entities/npcs.js";
import { validNpcDefinitionFixture } from "../../schemas/fixtures/entities.js";
import {
  createFloorGeometrySlot,
  createTileGrid,
  type TileGrid,
} from "../map/index.js";
import {
  createInitialState,
  type GameState,
  type NpcEntityInstance,
  type Position,
} from "../state/index.js";
import { step, type TurnEvent } from "../turn/index.js";
import {
  getActiveConversation,
  hasDialogueFlag,
  isWorldPaused,
  openConversation,
  registerQuestOfferHook,
  resolveDialogueChoice,
  resolveEndConversation,
  stepWithDialoguePause,
  unregisterNpcDialogueHooks,
} from "./index.js";

afterAll(() => {
  unregisterNpcDialogueHooks();
});

describe("dialogue walker", () => {
  it("opens a conversation on the root node and walks choices", () => {
    let state = fixtureState();
    const opened = expectDialogue(openConversation(state, "npc#1"));

    expect(getActiveConversation(opened.state)).toEqual({
      npcId: "npc#1",
      nodeId: "root",
    });

    state = opened.state;
    const walked = expectDialogue(resolveDialogueChoice(state, "root-a"));

    expect(getActiveConversation(walked.state)?.nodeId).toBe("answer");
    expect(isWorldPaused(walked.state)).toBe(true);
  });

  it("ends a conversation from any node via end-conversation", () => {
    const state = expectDialogue(
      resolveDialogueChoice(
        expectDialogue(openConversation(fixtureState(), "npc#1")).state,
        "root-a",
      ),
    ).state;
    const ended = expectDialogue(resolveEndConversation(state));

    expect(getActiveConversation(ended.state)).toBeNull();
    expect(isWorldPaused(ended.state)).toBe(false);
    expect(ended.events[ended.events.length - 1]?.type).toBe("dialogue_ended");
  });

  it("applies flag, barter, and quest-offer consequences", () => {
    const npc = npcWithDialogue({
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          text: "Hello.",
          choices: [
            {
              id: "flag:greeted",
              label: "Flag",
              nextNodeId: "root",
              closesDialogue: false,
              questHookId: null,
            },
            {
              id: "barter",
              label: "Trade",
              nextNodeId: "root",
              closesDialogue: false,
              questHookId: null,
            },
            {
              id: "quest",
              label: "Quest",
              nextNodeId: null,
              closesDialogue: true,
              questHookId: "quest-1",
            },
            {
              id: "leave-a",
              label: "A",
              nextNodeId: null,
              closesDialogue: true,
              questHookId: null,
            },
            {
              id: "leave-b",
              label: "B",
              nextNodeId: null,
              closesDialogue: true,
              questHookId: null,
            },
          ],
        },
      ],
    });
    let state = withNpc(fixtureState(), npc);
    state = expectDialogue(openConversation(state, "npc#1")).state;
    state = expectDialogue(resolveDialogueChoice(state, "flag:greeted")).state;

    expect(hasDialogueFlag(state, "greeted")).toBe(true);

    state = expectDialogue(resolveDialogueChoice(state, "barter")).state;
    expect(
      (state.entities["npc#1"] as NpcEntityInstance).dialogueRuntime.barterOpen,
    ).toBe(true);

    state = expectDialogue(resolveEndConversation(state)).state;

    let hooked = false;
    const unregister = registerQuestOfferHook(({ state: hookState, questHookId }) => {
      hooked = true;
      expect(questHookId).toBe("quest-1");
      return hookState;
    });

    try {
      state = expectDialogue(openConversation(state, "npc#1")).state;
      expectDialogue(resolveDialogueChoice(state, "quest"));
      expect(hooked).toBe(true);
    } finally {
      unregister();
    }
  });

  it("keeps turn count unchanged across a five-choice conversation", () => {
    const npc = npcWithDialogue(deepWalkTree());
    let state = withNpc(fixtureState(), npc);
    const turnBefore = state.run.turn;

    state = expectDialogue(openConversation(state, "npc#1")).state;
    expect(state.run.turn).toBe(turnBefore);

    for (const choiceId of ["to-a", "to-b", "to-c", "back-b", "to-finish"]) {
      state = expectDialogue(resolveDialogueChoice(state, choiceId)).state;
      expect(state.run.turn).toBe(turnBefore);
    }

    expect(getActiveConversation(state)).toBeNull();
  });

  it("pauses the world during talk steps routed through the turn loop", () => {
    const state = withNpc(fixtureState(), npcWithDialogue(deepWalkTree()));
    const turnBefore = state.run.turn;
    const result = stepWithDialoguePause(state, {
      kind: "talk",
      npcId: "npc#1",
    });

    expect(result.state.run.turn).toBe(turnBefore);
    expect(isWorldPaused(result.state)).toBe(true);
  });

  it("registers the talk resolver with the turn registry", () => {
    const state = withNpc(fixtureState(), validNpcDefinitionFixture);
    const result = step(state, { kind: "talk", npcId: "npc#1" });

    expect(result.events[0]?.type).toBe("action_resolved");
    expect(getActiveConversation(result.state)?.nodeId).toBe("root");
  });
});

describe("dialogue schema bounds", () => {
  it("rejects a four-deep dialogue tree fixture", () => {
    const tree = {
      rootNodeId: "root",
      nodes: [
        dialogueNode("root", "a"),
        dialogueNode("a", "b"),
        dialogueNode("b", "c"),
        dialogueNode("c", null),
      ],
    };

    const parsed = DialogueTreeSchema.safeParse(tree);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.message.includes("depth"))).toBe(
      true,
    );
    expectFails(NpcDefinitionSchema, {
      ...validNpcDefinitionFixture,
      dialogue: tree,
    });
  });
});

const deepWalkTree = () => ({
  rootNodeId: "root",
  nodes: [
    {
      id: "root",
      text: "Root",
      choices: choicePair("to-a", "a", "to-finish", null, true),
    },
    {
      id: "a",
      text: "A",
      choices: choicePair("to-b", "b", "to-finish", null, true),
    },
    {
      id: "b",
      text: "B",
      choices: choicePair("to-c", "c", "to-finish", null, true),
    },
    {
      id: "c",
      text: "C",
      choices: choicePair("back-b", "b", "to-finish", null, true),
    },
  ],
});

const choicePair = (
  forwardId: string,
  forwardNext: string,
  altId: string,
  altNext: string | null,
  altClose: boolean,
) => [
  {
    id: forwardId,
    label: forwardId,
    nextNodeId: forwardNext,
    closesDialogue: false,
    questHookId: null,
  },
  {
    id: altId,
    label: altId,
    nextNodeId: altNext,
    closesDialogue: altClose,
    questHookId: null,
  },
];

const dialogueNode = (id: string, nextNodeId: string | null) => ({
  id,
  text: id,
  choices: [
    {
      id: `${id}-next`,
      label: "next",
      nextNodeId,
      closesDialogue: nextNodeId === null,
      questHookId: null,
    },
    {
      id: `${id}-stay`,
      label: "stay",
      nextNodeId: id,
      closesDialogue: false,
      questHookId: null,
    },
  ],
});

const npcWithDialogue = (
  dialogue: NpcDefinition["dialogue"],
): NpcDefinition => ({
  ...validNpcDefinitionFixture,
  dialogue,
});

const fixtureState = (): GameState =>
  withNpc(
    withGrid(createInitialState("npc-dialogue"), createTileGrid({ width: 3, height: 3 }), {
      x: 1,
      y: 1,
    }),
    validNpcDefinitionFixture,
  );

const withGrid = (
  state: GameState,
  grid: TileGrid,
  position: Position,
): GameState => ({
  ...state,
  floor: {
    ...state.floor,
    geometry: createFloorGeometrySlot(state.floor.geometry.refId, grid),
  },
  player: {
    ...state.player,
    position,
  },
});

const withNpc = (state: GameState, definition: NpcDefinition): GameState => ({
  ...state,
  entities: {
    "npc#1": {
      id: "npc#1",
      kind: "npc",
      definition,
      position: { x: 1, y: 0 },
      currentHP: null,
      statuses: [],
      behaviorRuntime: {},
      dialogueRuntime: {},
    },
  },
});

const expectDialogue = (
  result:
    | { readonly state: GameState; readonly events: readonly TurnEvent[] }
    | { readonly illegal: true; readonly reason: string },
) => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return result;
};

const expectFails = (schema: typeof NpcDefinitionSchema, value: unknown): void => {
  expect(schema.safeParse(value).success).toBe(false);
};
