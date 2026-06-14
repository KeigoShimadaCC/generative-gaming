import { z } from "zod";

import type {
  GetFloorRequest,
  PollStatusRequest,
  StartGenerationRequest,
} from "./transport.js";

const nonEmptyString = z.string().min(1);
const jsonRecord = z.record(z.string(), z.unknown());

const TraceContentRefSchema = z.strictObject({
  providerId: nonEmptyString,
  packVersion: nonEmptyString,
});

const TraceHeaderSchema = z.strictObject({
  recordType: z.literal("header"),
  protocolVersion: nonEmptyString,
  engineVersion: nonEmptyString,
  modelId: nonEmptyString,
  contentRef: TraceContentRefSchema,
  seed: nonEmptyString,
  runId: nonEmptyString,
  createdAt: nonEmptyString,
});

const TraceActionSchema = z.object({
  kind: nonEmptyString,
}).catchall(z.unknown());

const TraceEventSchema = z.strictObject({
  turn: z.number().int(),
  type: nonEmptyString,
  data: jsonRecord,
});

const TraceTurnSchema = z.strictObject({
  turn: z.number().int(),
  action: TraceActionSchema,
  events: z.array(TraceEventSchema),
  stateHash: nonEmptyString,
});

const TraceTerminalSchema = z.strictObject({
  recordType: z.literal("terminal"),
  turn: z.number().int(),
  terminalStatus: z.union([
    z.literal("WIN"),
    z.literal("LOSS"),
    z.literal("ABORTED"),
  ]),
  stateHash: nonEmptyString,
});

const ParsedTraceSchema = z.strictObject({
  header: TraceHeaderSchema,
  turns: z.array(TraceTurnSchema),
  terminal: TraceTerminalSchema.nullish(),
});

export const START_GENERATION_BODY_MAX_BYTES = 256 * 1024;

export const StartGenerationRequestSchema: z.ZodType<StartGenerationRequest> =
  z.strictObject({
    runId: nonEmptyString,
    depth: z.number().int(),
    trace: ParsedTraceSchema,
  }) as unknown as z.ZodType<StartGenerationRequest>;

export const PollStatusRequestSchema: z.ZodType<PollStatusRequest> =
  z.strictObject({
    runId: nonEmptyString,
    depth: z.number().int().optional(),
  });

export const GetFloorRequestSchema: z.ZodType<GetFloorRequest> = z.strictObject({
  runId: nonEmptyString,
  depth: z.number().int(),
  seed: nonEmptyString,
});

export const TransportJsonRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("startGeneration"),
    body: StartGenerationRequestSchema,
  }),
  z.strictObject({
    action: z.literal("pollStatus"),
    body: PollStatusRequestSchema,
  }),
  z.strictObject({
    action: z.literal("getFloor"),
    body: GetFloorRequestSchema,
  }),
]);

export type TransportJsonRequest = z.infer<typeof TransportJsonRequestSchema>;
