import type { RunEvent } from "../../engine/run/events.js";
import type { RunAction } from "../../engine/run/loop.js";
import { PROTOCOL_VERSION } from "../../schemas/protocol.js";
import type {
  ContentRef,
  ParsedTrace,
  TraceHeader,
  TraceTurnRecord
} from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readString = (
  record: Record<string, unknown>,
  key: string,
  label: string
): string => {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
};

const readNumber = (
  record: Record<string, unknown>,
  key: string,
  label: string
): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label}.${key} must be an integer`);
  }
  return value;
};

const parseContentRef = (value: unknown): ContentRef => {
  if (!isRecord(value)) {
    throw new Error("header.contentRef must be an object");
  }

  return {
    providerId: readString(value, "providerId", "contentRef"),
    packVersion: readString(value, "packVersion", "contentRef")
  };
};

const parseHeader = (value: unknown, lineNumber: number): TraceHeader => {
  if (!isRecord(value)) {
    throw new Error(`line ${lineNumber}: trace header must be a JSON object`);
  }

  if ("turn" in value) {
    throw new Error(`line ${lineNumber}: trace header must not include turn`);
  }

  const recordType = readString(value, "recordType", "header");
  if (recordType !== "header") {
    throw new Error(`header.recordType must be "header"`);
  }

  const protocolVersion = readString(value, "protocolVersion", "header");
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`header.protocolVersion must be "${PROTOCOL_VERSION}"`);
  }

  return {
    recordType,
    protocolVersion,
    engineVersion: readString(value, "engineVersion", "header"),
    modelId: readString(value, "modelId", "header"),
    seed: readString(value, "seed", "header"),
    contentRef: parseContentRef(value.contentRef),
    runId: readString(value, "runId", "header"),
    createdAt: readString(value, "createdAt", "header")
  };
};

const parseAction = (value: unknown, lineNumber: number): RunAction => {
  if (!isRecord(value)) {
    throw new Error(`line ${lineNumber}: action must be a JSON object`);
  }

  const kind = value.kind;
  if (typeof kind !== "string" || kind.length === 0) {
    throw new Error(
      `line ${lineNumber}: action.kind must be a non-empty string`
    );
  }

  return value as RunAction;
};

const parseEvents = (
  value: unknown,
  lineNumber: number
): readonly RunEvent[] => {
  if (!Array.isArray(value)) {
    throw new Error(`line ${lineNumber}: events must be an array`);
  }

  return value as readonly RunEvent[];
};

const parseTurnRecord = (
  value: unknown,
  lineNumber: number
): TraceTurnRecord => {
  if (!isRecord(value)) {
    throw new Error(`line ${lineNumber}: trace turn must be a JSON object`);
  }

  if (!("turn" in value)) {
    throw new Error(`line ${lineNumber}: trace turn must include turn`);
  }

  return {
    turn: readNumber(value, "turn", "turn"),
    action: parseAction(value.action, lineNumber),
    events: parseEvents(value.events, lineNumber),
    stateHash: readString(value, "stateHash", "turn")
  };
};

export const parseTraceNdjson = (content: string): ParsedTrace => {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("trace is empty");
  }

  let header: TraceHeader;
  try {
    header = parseHeader(JSON.parse(lines[0] ?? "") as unknown, 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`line 1: ${message}`);
  }

  const turns: TraceTurnRecord[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index] ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`line ${lineNumber}: invalid JSON (${message})`);
    }

    turns.push(parseTurnRecord(parsed, lineNumber));
  }

  return { header, turns };
};
