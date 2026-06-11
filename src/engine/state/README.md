# Engine State

`GameState` is the canonical reducer target for engine systems. Reducers should be
pure functions of the form `(state, event) => state`: validate structured input,
compute the next state deterministically, append typed log events, and return a new
serializable state object.

Rules for later systems:

- Import entity definitions and vocab types from `src/schemas`; do not redefine
  content shapes in this package.
- Add reducer entry points beside their system, not inside serialization.
- Extend log events by declaration-merging `EngineLogEventDataByType` from
  `types.ts`; the serializer accepts the event envelope plus serializable data.
- Floor geometry stays opaque until PHASE-07A owns the concrete map payload.
