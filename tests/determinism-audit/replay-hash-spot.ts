import { readFileSync } from "node:fs";

import "../../src/engine/effects/core.js";
import "../../src/engine/effects/spatial.js";
import "../../src/engine/items/triggers.js";
import "../../src/engine/npc/dialogue.js";
import "../../src/engine/systems/combat.js";
import "../../src/engine/systems/inventory.js";
import "../../src/engine/systems/movement.js";
import "../../src/engine/systems/player.js";
import "../../src/engine/systems/status.js";
import "../../src/engine/systems/traps.js";

import { startRun, stepRun } from "../../src/engine/run/loop.js";
import { computeStateHash } from "../../src/harness/trace/hash.js";
import {
  parseTraceNdjson,
  resolveContentProvider,
} from "../../src/harness/replay/index.js";

const tracePath = process.argv[2];
if (tracePath === undefined) {
  throw new Error("usage: replay-hash-spot.ts <trace.ndjson>");
}

const trace = parseTraceNdjson(readFileSync(tracePath, "utf8"));
const provider = resolveContentProvider(trace.header.contentRef);
const started = startRun(trace.header.seed, provider);
if (!started.ok) {
  throw new Error(started.error.message);
}

let state = started.state;
for (const record of trace.turns) {
  const stepped = stepRun(state, record.action, provider);
  if (!stepped.ok) {
    throw new Error(stepped.error.message);
  }
  state = stepped.state;
}

process.stdout.write(
  `${JSON.stringify({
    tracePath,
    turns: state.run.turn,
    terminalStatus: state.run.terminalStatus,
    hash: computeStateHash(state),
  })}\n`,
);
