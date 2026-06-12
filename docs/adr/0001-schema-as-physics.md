# ADR 0001: Schema As Physics

Context: The Director is allowed to invent content, but the engine must remain deterministic, finite, and offline playable.

Decision: Author schemas once and use them as the shared contract for structured output, validation, persistence, and tests. Director output is data only. It is parsed, validated, simulated, and then applied through deterministic engine code, or discarded.

Consequence: The schema boundary is slower to change than prompt text, but it keeps AI output from becoming an implicit rules engine. New creative affordances require explicit vocabulary or schema work, which makes safety review concrete.
