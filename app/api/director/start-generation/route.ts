import { NextResponse } from "next/server";

import {
  jsonErrorResponse,
  readValidatedJson,
  START_GENERATION_BODY_MAX_BYTES,
  StartGenerationRequestSchema,
} from "../route-helpers";
import { getTransportHandlers } from "../transport-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readValidatedJson(request, StartGenerationRequestSchema, {
      maxBytes: START_GENERATION_BODY_MAX_BYTES,
    });
    const result = getTransportHandlers().startGeneration(body);
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
