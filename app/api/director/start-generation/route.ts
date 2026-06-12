import { NextResponse } from "next/server";

import type { StartGenerationRequest } from "../../../../src/director/orchestration/transport.js";
import { getTransportHandlers } from "../transport-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StartGenerationRequest;
    const result = getTransportHandlers().startGeneration(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
