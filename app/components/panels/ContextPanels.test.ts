import { describe, expect, it } from "vitest";

import {
  buyFromMerchant,
  countPlayerCoinValue,
  getCurrentDialogueNode,
  merchantSellPrice,
  openConversation,
  resolveDialogueChoice,
  resolveEndConversation,
} from "@engine/npc";
import {
  createFloorGeometrySlot,
  createTile,
  createTileGrid,
  Terrain,
} from "@engine/map";
import {
  createInitialState,
  type EnemyEntityInstance,
  type EntityId,
  type GameState,
  type GroundItemEntityInstance,
  type NpcEntityInstance,
  type PlayerItemStack,
  type Position,
  type QuestRuntime,
} from "@engine/state";
import type { TurnEvent } from "@engine/turn";
import {
  dispatchGameKey,
  type InputDispatchDeps,
} from "@/input/dispatcher";
import { defaultUi, type UiSlice } from "@/store/game-store";
import {
  registerPanelKeyHandler,
  routePanelKey,
} from "@/input/panel-focus";
import {
  appendEventsToState,
  createBarterCatalog,
  createDialogueView,
  createInspectCard,
  createInventoryView,
  createQuestView,
  inventoryActionsFor,
  questMarkersForState,
} from "./model";

type ItemDefinition = PlayerItemStack["definition"];
type NpcDefinition = NpcEntityInstance["definition"];
type QuestDefinition = QuestRuntime["definition"];

describe("context panels", () => {
  it("keeps inspect card truthfulness: unknown item shows exactly the unknown and witnessed facts appear only after witnessing", () => {
    const draught = draughtDefinition("draught-1", "Truth Draught");
    const item = groundItem("item#1", { x: 1, y: 0 }, draught, false);
    const enemy = enemyAt("enemy#1", { x: 2, y: 0 });
    const state = withEntities(baseState("panel-truth"), [item, enemy]);

    const unknownCard = createInspectCard(state, item.position);
    expect(unknownCard.title).not.toBe(draught.name);
    expect(unknownCard.unknown).toEqual([
      "unidentified: name unknown",
      "unidentified: effect unknown",
    ]);
    expect(unknownCard.lines.map((line) => line.label)).not.toContain("Effect");

    const unwitnessedEnemyCard = createInspectCard(state, enemy.position);
    expect(unwitnessedEnemyCard.witnessedFacts).toEqual([]);

    const witnessed = appendEventsToState(state, [
      {
        turn: state.run.turn,
        type: "attack_hit",
        data: {
          actorId: enemy.id,
          defenderId: "player",
          attackerAttack: 6,
          defenderDefense: 1,
          baseDamage: 5,
          damage: 4,
          hitRoll: 10,
          hitChancePercent: 95,
          varianceMultiplier: 1,
          defenderHpBefore: 20,
          defenderHpAfter: 16,
        },
      } as GameState["log"][number],
    ] as readonly TurnEvent[]);
    const witnessedEnemyCard = createInspectCard(witnessed, enemy.position);
    expect(witnessedEnemyCard.witnessedFacts).toEqual([
      "witnessed: hits for 4-4",
    ]);

    const identified = {
      ...state,
      run: {
        ...state.run,
        itemKnowledge: {
          ...state.run.itemKnowledge,
          identifiedDefinitionIds: [draught.id],
        },
      },
      entities: {
        ...state.entities,
        [item.id]: {
          ...item,
          identified: true,
        },
      },
    };
    const knownCard = createInspectCard(identified, item.position);
    expect(knownCard.title).toBe(draught.name);
    expect(knownCard.unknown).toEqual([]);
    expect(knownCard.lines.map((line) => line.label)).toContain("Effect");
  });

  it("walks a fixture conversation by keyboard through barter while paused", () => {
    const food = foodDefinition("food-1", "Road Cake");
    const npc = npcAt("npc#1", { x: 2, y: 1 }, traderNpc(["food-1"]));
    let state = withInventory(
      withEntities(baseState("panel-dialogue"), [
        npc,
        groundItem("item#1", { x: 0, y: 0 }, food, true),
      ]),
      [coinStack(50)],
    );
    const turnBefore = state.run.turn;

    state = expectDialogue(openConversation(state, "npc#1"));
    let view = createDialogueView(state);
    expect(view?.paused).toBe(true);
    expect(view?.options[0]).toMatchObject({ kind: "reply", id: "barter" });

    state = appendEventsToState(
      expectDialogue(resolveDialogueChoice(state, "barter")),
      [],
    );
    expect(state.run.turn).toBe(turnBefore);
    view = createDialogueView(state);
    expect(view?.barterOpen).toBe(true);
    const buy = view?.options.find((option) => option.kind === "buy");
    expect(buy).toMatchObject({ kind: "buy", definitionId: "food-1" });

    const catalog = createBarterCatalog(state);
    if (catalog.coinDefinition === null) {
      throw new Error("fixture missing coin definition");
    }
    const price = merchantSellPrice(state, "npc#1", "food-1", food.value.coin);
    const bought = buyFromMerchant(
      state,
      {
        resolve: catalog.resolve,
        coinDefinition: catalog.coinDefinition,
      },
      "food-1",
    );
    if ("refused" in bought) {
      throw new Error(bought.message);
    }
    state = appendEventsToState(bought.state, bought.events);
    expect(countPlayerCoinValue(state)).toBe(50 - price);
    expect(state.player.inventory.some((slot) => slot?.definition.id === "food-1")).toBe(true);
    expect(state.run.turn).toBe(turnBefore);

    const poor = withInventory(
      withEntities(baseState("panel-dialogue-poor"), [
        npcAt("npc#1", { x: 2, y: 1 }, traderNpc(["food-1"])),
        groundItem("item#1", { x: 0, y: 0 }, food, true),
      ]),
      [coinStack(0)],
    );
    const poorOpen = expectDialogue(openConversation(poor, "npc#1"));
    const poorBarter = expectDialogue(resolveDialogueChoice(poorOpen, "barter"));
    const refused = buyFromMerchant(
      poorBarter,
      {
        resolve: createBarterCatalog(poorBarter).resolve,
        coinDefinition: coinDefinition(),
      },
      "food-1",
    );
    expect(refused).toMatchObject({
      refused: true,
      reason: "insufficient_coin",
      message: "You don't have enough coin.",
    });

    state = expectDialogue(resolveEndConversation(state));
    expect(getCurrentDialogueNode(state)).toBeNull();
  });

  it("projects quest marker positions for on-floor objectives", () => {
    const fetchItem = draughtDefinition("quest-draught", "Quest Draught");
    const quest = fetchQuest("quest-fetch", fetchItem.id);
    const state = withQuest(
      withEntities(baseState("panel-quest-marker"), [
        groundItem("item#1", { x: 2, y: 1 }, fetchItem, false),
      ]),
      quest,
    );

    const view = createQuestView(state);
    expect(view.active[0]?.objective.hint).toBe(`Find ${fetchItem.id}.`);
    expect(questMarkersForState(state)).toEqual([
      expect.objectContaining({
        questId: quest.id,
        x: 2,
        y: 1,
        label: "Quest item",
      }),
    ]);
  });

  it("routes panel focus keys without leaking to run movement", () => {
    const handledKeys: string[] = [];
    const unregister = registerPanelKeyHandler(({ key }) => {
      if (["ArrowDown", "1", "Enter"].includes(key)) {
        handledKeys.push(key);
        return true;
      }

      return false;
    });

    expect(routePanelKey({ key: "ArrowDown", repeat: false })).toBe(true);
    expect(routePanelKey({ key: "1", repeat: false })).toBe(true);
    expect(routePanelKey({ key: "g", repeat: false })).toBe(false);
    expect(handledKeys).toEqual(["ArrowDown", "1"]);
    unregister();
    expect(routePanelKey({ key: "Enter", repeat: false })).toBe(false);
  });

  it("reaches and closes every context panel mode per UX input model", () => {
    const harness = createInputHarness();

    expect(harness.press("i").status).toBe("handled");
    expect(harness.ui.contextPanelMode).toBe("inventory");
    expect(harness.press("Escape").status).toBe("handled");
    expect(harness.ui.contextPanelMode).toBe("inspect");

    expect(harness.press("q").status).toBe("handled");
    expect(harness.ui.contextPanelMode).toBe("quest");
    expect(harness.press("Escape").status).toBe("handled");
    expect(harness.ui.contextPanelMode).toBe("inspect");

    expect(harness.press("x").status).toBe("handled");
    expect(harness.ui.contextPanelMode).toBe("inspect");

    const inventory = createInventoryView(harness.state);
    const selected = inventory.slots.find((slot) => slot.stack !== null) ?? null;
    const actions = inventoryActionsFor(harness.state, selected);
    expect(actions.some((action) => !action.enabled && action.reason !== null)).toBe(
      true,
    );
  });
});

const baseState = (seed: string): GameState => {
  const grid = createTileGrid({
    width: 4,
    height: 3,
    tiles: Array.from({ length: 12 }, () => createTile(Terrain.Floor)),
  });
  const state = createInitialState(seed);

  return {
    ...state,
    run: {
      ...state.run,
      turn: 7,
    },
    floor: {
      ...state.floor,
      geometry: createFloorGeometrySlot(state.floor.geometry.refId, grid),
    },
    player: {
      ...state.player,
      position: { x: 1, y: 1 },
    },
  };
};

const withEntities = (
  state: GameState,
  entities: readonly (GroundItemEntityInstance | EnemyEntityInstance | NpcEntityInstance)[],
): GameState => ({
  ...state,
  entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
});

const withInventory = (
  state: GameState,
  stacks: readonly PlayerItemStack[],
): GameState => ({
  ...state,
  player: {
    ...state.player,
    inventory: [
      ...stacks,
      ...Array.from({ length: 16 - stacks.length }, () => null),
    ],
  },
});

const withQuest = (state: GameState, definition: QuestDefinition): GameState => {
  const runtime: QuestRuntime = {
    definition,
    status: "active",
    progress: {
      acceptedAtDepth: state.run.depth,
      acceptedAtBand: state.run.band,
      trackedDepth: state.run.depth,
    },
  };

  return {
    ...state,
    quests: {
      quests: {
        [definition.id]: runtime,
      },
      activeQuestIds: [definition.id],
      completedQuestIds: [],
      failedQuestIds: [],
    },
  };
};

const groundItem = (
  id: EntityId,
  position: Position,
  definition: ItemDefinition,
  identified: boolean,
): GroundItemEntityInstance => ({
  id,
  kind: "item",
  definition,
  position,
  currentHP: null,
  quantity: 1,
  identified,
  statuses: [],
  behaviorRuntime: {},
});

const enemyAt = (
  id: EntityId,
  position: Position,
): EnemyEntityInstance => ({
  id,
  kind: "enemy",
  definition: enemyDefinition(),
  position,
  currentHP: enemyDefinition().stats.hp,
  statuses: [],
  behaviorRuntime: {},
});

const npcAt = (
  id: EntityId,
  position: Position,
  definition: NpcDefinition,
): NpcEntityInstance => ({
  id,
  kind: "npc",
  definition,
  position,
  currentHP: null,
  statuses: [],
  behaviorRuntime: {},
  dialogueRuntime: {},
});

const traderNpc = (stock: readonly string[]): NpcDefinition => ({
  id: "trader",
  name: "Fixture Trader",
  glyph: "T",
  origin: "kept",
  merchantInventoryItemIds: [...stock],
  questHook: null,
  dialogue: {
    rootNodeId: "root",
    nodes: [
      {
        id: "root",
        text: "Trade, then go.",
        choices: [
          {
            id: "barter",
            label: "Trade",
            nextNodeId: "shop",
            closesDialogue: false,
            questHookId: null,
          },
          {
            id: "leave",
            label: "Leave",
            nextNodeId: null,
            closesDialogue: true,
            questHookId: null,
          },
        ],
      },
      {
        id: "shop",
        text: "Coin on the board.",
        choices: [
          {
            id: "done",
            label: "Done",
            nextNodeId: null,
            closesDialogue: true,
            questHookId: null,
          },
        ],
      },
    ],
  },
});

const coinStack = (coinValue: number): PlayerItemStack => ({
  itemInstanceId: "coin#1",
  definition: coinDefinition(),
  quantity: coinValue,
  identified: true,
});

const itemBase = (
  id: string,
  name: string,
  kind: ItemDefinition["kind"],
): Omit<ItemDefinition, "kind"> & { readonly kind: ItemDefinition["kind"] } =>
  ({
    id,
    name,
    glyph: "?",
    kind,
    value: {
      band: "shallows",
      coin: 5,
    },
    weapon: null,
    armor: null,
    charm: null,
    draught: null,
    note: null,
    throwable: null,
    food: null,
    tool: null,
    keyItem: null,
    coin: null,
  }) as ItemDefinition;

const draughtDefinition = (id: string, name: string): ItemDefinition =>
  ({
    ...itemBase(id, name, "draught"),
    glyph: "!",
    draught: {
      effect: effectBundle("quaff"),
    },
  }) as ItemDefinition;

const foodDefinition = (id: string, name: string): ItemDefinition =>
  ({
    ...itemBase(id, name, "food"),
    glyph: "%",
    food: {
      effect: effectBundle("use"),
    },
  }) as ItemDefinition;

const coinDefinition = (): ItemDefinition =>
  ({
    ...itemBase("coin", "coin", "coin"),
    glyph: "$",
    value: {
      band: "shallows",
      coin: 1,
    },
    coin: {},
  }) as ItemDefinition;

const effectBundle = (triggerKind: string): unknown => ({
  id: `bundle-${triggerKind}`,
  trigger: {
    kind: triggerKind,
  },
  targeting: {
    kind: "self",
  },
  effects: [
    {
      kind: "damage",
    },
  ],
});

const enemyDefinition = (): EnemyEntityInstance["definition"] =>
  ({
    id: "enemy-1",
    name: "Fixture Enemy",
    glyph: "e",
    origin: "made",
    stats: {
      band: "shallows",
      hp: 4,
      attack: 2,
      defense: 0,
      xpYield: 2,
    },
    behaviors: [],
    abilities: [],
  }) as EnemyEntityInstance["definition"];

const fetchQuest = (id: string, itemId: string): QuestDefinition => ({
  id,
  title: "Fetch test",
  objective: {
    kind: "fetch",
    fetch: {
      itemId,
      floorScope: "this_floor",
    },
    kill: null,
    reach: null,
    deliver: null,
    escort: null,
    constraint: null,
  },
  reward: {
    valueMultiplier: 1,
    coin: null,
    itemIds: [],
    identifyItemIds: [],
  },
});

const expectDialogue = (
  result:
    | ReturnType<typeof openConversation>
    | ReturnType<typeof resolveDialogueChoice>
    | ReturnType<typeof resolveEndConversation>,
): GameState => {
  if ("illegal" in result) {
    throw new Error(result.reason);
  }

  return appendEventsToState(result.state, result.events);
};

type InputHarness = {
  state: GameState;
  ui: UiSlice;
  readonly press: (key: string) => ReturnType<typeof dispatchGameKey>;
};

const createInputHarness = (): InputHarness => {
  const state = withInventory(baseState("panel-input"), [
    {
      itemInstanceId: "coin#1",
      definition: coinDefinition(),
      quantity: 1,
      identified: true,
    },
  ]);
  const harness: InputHarness = {
    state,
    ui: defaultUi,
    press: (key) =>
      dispatchGameKey(
        {
          gameState: harness.state,
          ui: harness.ui,
        },
        deps,
        { key },
      ),
  };
  const deps: InputDispatchDeps = {
    dispatchAction: () => undefined,
    patchUi: (patch) => {
      harness.ui = { ...harness.ui, ...patch };
    },
    appendInputFeedback: () => undefined,
    lockInput: () => undefined,
  };

  return harness;
};
