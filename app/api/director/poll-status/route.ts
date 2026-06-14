import { NextResponse } from "next/server";

import {
  jsonErrorResponse,
  PollStatusRequestSchema,
  readValidatedJson,
} from "../route-helpers";
import { getTransportHandlers } from "../transport-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readValidatedJson(request, PollStatusRequestSchema);
    const result = getTransportHandlers().pollStatus(body);
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
