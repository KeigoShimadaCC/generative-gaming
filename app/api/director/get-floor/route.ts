import { NextResponse } from "next/server";

import {
  GetFloorRequestSchema,
  jsonErrorResponse,
  readValidatedJson,
} from "../route-helpers";
import { getTransportHandlers } from "../transport-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readValidatedJson(request, GetFloorRequestSchema);
    const result = await getTransportHandlers().getFloor(body);
    return NextResponse.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
