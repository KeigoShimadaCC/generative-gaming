import { afterAll, describe, expect, it } from "vitest";

import "../systems/movement.js";
import { resolveAttack } from "../systems/combat.js";
import {
  acceptQuest,
  configureQuestCatalog,
  deliverQuestItem,
  offerQuest,
  processQuestAfterPlayerAction,
  stepWithQuests,
  unregisterQuestHooks,
} from "./index.js";
import {
  carriedStack,
  constraintQuest,
  deliverQuest,
  enemy,
  escortQuest,
  fetchQuest,
  killQuest,
  npc,
  reachQuest,
  stateFromMap,
  testCatalog,
  withInventoryItem,
} from "./fixtures.js";
import type { EnemyDefinition } from "../../schemas/entities/index.js";
import {
  validEnemyDefinitionFixture,
  validKeyItemFixture,
} from "../../schemas/fixtures/entities.js";

afterAll(() => {
  unregisterQuestHooks();
});

describe("quest objectives", () => {
  it("completes fetch when the item is carried on the allowed floor", () => {
    configureQuestCatalog(testCatalog({ "key_item-1": validKeyItemFixture }));
    const definition = fetchQuest("key_item-1");
    const base = withInventoryItem(
      stateFromMap("quest-fetch", "@."),
      carriedStack("item#1", validKeyItemFixture),
    );
    const offered = offerQuest(base, definition, "npc#1");

    if ("illegal" in offered) {
      throw new Error(offered.reason);
    }

    const accepted = acceptQuest(offered.state, definition.id);

    if ("illegal" in accepted) {
      throw new Error(accepted.reason);
    }

    const result = stepWithQuests(accepted.state, { kind: "wait" });

    expect(result.state.quests.completedQuestIds).toContain(definition.id);
    expect(result.events.map((event) => event.type)).toContain("quest_completed");
  });

  it("completes kill when a tagged enemy dies", () => {
    configureQuestCatalog(testCatalog());
    const definition = killQuest("target-tag");
    const lowHpEnemy = {
      ...validEnemyDefinitionFixture,
      stats: {
        ...validEnemyDefinitionFixture.stats,
        hp: 1,
      },
      behaviors: [...validEnemyDefinitionFixture.behaviors],
    } as EnemyDefinition;
    const base = stateFromMap("quest-kill", "@.E", {
      entities: [
        enemy(
          "enemy#1",
          { x: 1, y: 0 },
          { definition: lowHpEnemy, questTargetTag: "target-tag" },
        ),
      ],
    });
    const accepted = acceptActiveQuest(base, definition);

    const attacked = resolveAttack(accepted, "player", "enemy#1");

    if ("illegal" in attacked) {
      throw new Error(attacked.reason);
    }

    expect(attacked.state.quests.completedQuestIds).toContain(definition.id);
  });

  it("completes reach when the player stands on stairs", () => {
    configureQuestCatalog(testCatalog());
    const definition = reachQuest("stairs");
    const accepted = acceptActiveQuest(stateFromMap("quest-reach", "@>"), definition);

    const result = stepWithQuests(accepted, { kind: "move", direction: "east" });

    expect(result.state.quests.completedQuestIds).toContain(definition.id);
  });

  it("completes deliver when the item is handed to the target keeper", () => {
    configureQuestCatalog(testCatalog({ "key_item-1": validKeyItemFixture }));
    const definition = deliverQuest("key_item-1", "npc-ward");
    const accepted = acceptActiveQuest(
      withInventoryItem(
        stateFromMap("quest-deliver", "@N", {
          entities: [npc("npc#1", { x: 1, y: 0 })],
        }),
        carriedStack("item#1", validKeyItemFixture),
      ),
      definition,
    );

    const delivered = deliverQuestItem(accepted, "npc#1", "key_item-1");

    if ("illegal" in delivered) {
      throw new Error(delivered.reason);
    }

    expect(delivered.state.quests.completedQuestIds).toContain(definition.id);
    expect(delivered.events.map((event) => event.type)).toContain(
      "quest_item_delivered",
    );
  });

  it("completes escort when the ward reaches the stairs without occupying the player tile", () => {
    configureQuestCatalog(testCatalog());
    const definition = escortQuest("npc-ward");
    const accepted = acceptActiveQuest(
      stateFromMap("quest-escort", "@...\n....\n..W.\n..>.", {
        entities: [npc("npc#1", { x: 2, y: 2 })],
      }),
      definition,
    );

    let state = accepted;
    const script: ReadonlyArray<
      { readonly kind: "wait" } | { readonly kind: "move"; readonly direction: "east" | "south" }
    > = [
      { kind: "move", direction: "east" },
      { kind: "move", direction: "east" },
      { kind: "move", direction: "south" },
      { kind: "move", direction: "south" },
      { kind: "move", direction: "south" },
      { kind: "wait" },
      { kind: "wait" },
      { kind: "wait" },
      { kind: "wait" },
      { kind: "wait" },
    ];

    for (let turn = 0; turn < 200; turn += 1) {
      const action = script[turn % script.length] ?? { kind: "wait" };
      const result = stepWithQuests(state, action);
      const ward = result.state.entities["npc#1"];

      if (ward?.kind === "npc") {
        expect(ward.position).not.toEqual(result.state.player.position);
      }

      state = result.state;

      if (state.quests.completedQuestIds.includes(definition.id)) {
        expect(ward?.position).toEqual({ x: 2, y: 3 });
        return;
      }
    }

    throw new Error("escort quest did not complete within 200 turns");
  });

  it("fails escort when the player descends without the ward", () => {
    configureQuestCatalog(testCatalog());
    const definition = escortQuest("npc-ward");
    const accepted = acceptActiveQuest(
      stateFromMap("quest-escort-fail", "@.W\n...\n..>", {
        entities: [npc("npc#1", { x: 1, y: 0 })],
      }),
      definition,
    );

    const descended = {
      ...accepted,
      run: {
        ...accepted.run,
        depth: accepted.run.depth + 1,
      },
    };

    const result = stepWithQuests(descended, { kind: "wait" });

    expect(result.state.quests.failedQuestIds).toContain(definition.id);
  });

  it("completes a no-damage constraint when leaving via stairs cleanly", () => {
    configureQuestCatalog(testCatalog());
    const definition = constraintQuest("take_no_damage");
    const accepted = acceptActiveQuest(stateFromMap("quest-constraint", "@>"), definition);

    const result = stepWithQuests(accepted, { kind: "move", direction: "east" });

    expect(result.state.quests.completedQuestIds).toContain(definition.id);
  });

  it("fails a no-damage constraint after the player is hit", () => {
    configureQuestCatalog(testCatalog());
    const definition = constraintQuest("take_no_damage");
    const accepted = acceptActiveQuest(
      stateFromMap("quest-constraint-fail", "E@>", {
        entities: [enemy("enemy#1", { x: 0, y: 0 })],
      }),
      definition,
    );

    const attacked = resolveAttack(accepted, "enemy#1", "player");

    if ("illegal" in attacked) {
      throw new Error(attacked.reason);
    }

    const marked = processQuestAfterPlayerAction(attacked.state, attacked.events).state;
    const stairs = stepWithQuests(marked, { kind: "move", direction: "east" });

    expect(stairs.state.quests.failedQuestIds).toContain(definition.id);
  });
});

const acceptActiveQuest = (
  state: ReturnType<typeof stateFromMap>,
  definition: ReturnType<typeof fetchQuest>,
) => {
  const offered = offerQuest(state, definition, "npc#1");

  if ("illegal" in offered) {
    throw new Error(offered.reason);
  }

  const accepted = acceptQuest(offered.state, definition.id);

  if ("illegal" in accepted) {
    throw new Error(accepted.reason);
  }

  return accepted.state;
};
