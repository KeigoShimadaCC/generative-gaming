# ADR 0005: Prefetch Fallback Latency

Context: Waiting at stairs is the highest-risk moment for a live Director demo.

Decision: Start generation ahead of the floor boundary, track ready/in-flight/none controller state, and cap stair wait. If the generated floor is late, invalid, or rejected, serve fallback content through the same transition presentation.

Consequence: Players keep momentum and never see a broken floor. Some successful generations can arrive too late and be discarded, so artifacts must record fallbacks and rejects clearly. The UI avoids promising whether a floor was generated until the evidence pane.
