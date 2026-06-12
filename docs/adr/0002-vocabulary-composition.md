# ADR 0002: Vocabulary Composition

Context: The game needs to feel authored for a run without letting generated text invent arbitrary mechanics.

Decision: Give the Director composable vocabularies for effects, behaviors, triggers, items, enemies, NPCs, quests, and narration. The model chooses bounded verbs and parameters, while the engine owns execution, math, turn order, and terminal states.

Consequence: The content space becomes large without becoming unbounded. Some ideas are impossible until a vocabulary primitive exists, but every accepted manifest is something the engine already knows how to run and test.
