import { readFileSync } from "node:fs";

import "../../engine/systems/movement.js";
import { startRun, stepRun } from "../../engine/run/loop.js";
import { computeStateHash } from "../trace/hash.js";
import { parseTraceNdjson } from "./parse.js";
import { resolveContentProvider } from "./provider.js";
import type { DivergenceReport, ParsedTrace, VerifyResult } from "./types.js";

export const replayTrace = (
  trace: ParsedTrace
): VerifyResult | { readonly status: "unreadable"; readonly error: string } => {
  let provider;
  try {
    provider = resolveContentProvider(trace.header.contentRef);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "unreadable", error: message };
  }

  const started = startRun(trace.header.seed, provider);
  if (!started.ok) {
    return {
      status: "unreadable",
      error: `failed to start run: ${started.error.message}`
    };
  }

  let state = started.state;

  for (const record of trace.turns) {
    const stepped = stepRun(state, record.action, provider);
    if (!stepped.ok) {
      return {
        status: "unreadable",
        error: `step failed at turn ${record.turn}: ${stepped.error.message}`
      };
    }

    state = stepped.state;
    const actualHash = computeStateHash(state);

    // Trace turn numbers use the recorder's post-step state convention.
    if (state.run.turn !== record.turn) {
      return {
        status: "diverged",
        report: {
          firstDivergentTurn: record.turn,
          expectedHash: record.stateHash,
          actualHash
        }
      };
    }

    if (actualHash !== record.stateHash) {
      return {
        status: "diverged",
        report: {
          firstDivergentTurn: record.turn,
          expectedHash: record.stateHash,
          actualHash
        }
      };
    }
  }

  const terminal = trace.terminal ?? null;
  if (terminal === null) {
    return {
      status: "unreadable",
      error: "trace is missing terminal record"
    };
  }

  const terminalHash = computeStateHash(state);
  if (
    state.run.turn !== terminal.turn ||
    state.run.terminalStatus !== terminal.terminalStatus ||
    terminalHash !== terminal.stateHash
  ) {
    return {
      status: "diverged",
      report: {
        firstDivergentTurn: terminal.turn,
        expectedHash: terminal.stateHash,
        actualHash: terminalHash
      }
    };
  }

  return { status: "identical" };
};

export const verifyTraceContent = (content: string): VerifyResult => {
  let trace: ParsedTrace;
  try {
    trace = parseTraceNdjson(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "unreadable", error: message };
  }

  return replayTrace(trace);
};

export const verify = (tracePath: string): VerifyResult => {
  let content: string;
  try {
    content = readFileSync(tracePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "unreadable", error: message };
  }

  return verifyTraceContent(content);
};

export type { DivergenceReport, VerifyResult };
