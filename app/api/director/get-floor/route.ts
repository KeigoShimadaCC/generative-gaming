import { NextResponse } from "next/server";

import type { GetFloorRequest } from "../../../../src/director/orchestration/transport.js";
import { getTransportHandlers } from "../transport-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GetFloorRequest;
    const result = await getTransportHandlers().getFloor(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
