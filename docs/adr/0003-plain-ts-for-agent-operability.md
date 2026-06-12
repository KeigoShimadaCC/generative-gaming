# ADR 0003: Plain TypeScript For Agent Operability

Context: Codex, Cursor Agent, and human reviewers all need to inspect, patch, and test the system quickly.

Decision: Keep the engine, harness, Director pipeline, evals, and web client in strict TypeScript with small local modules. Avoid game engines, opaque editor assets, and runtime frameworks that hide state transitions outside code review.

Consequence: The project gives up engine-editor conveniences and high-end rendering for now. In exchange, agents can reason over the whole stack with text search, unit tests, deterministic traces, and ordinary diffs.
