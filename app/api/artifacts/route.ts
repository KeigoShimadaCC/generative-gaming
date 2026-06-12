import { NextResponse } from "next/server";

import { getArtifactReadOptions } from "../director/transport-server";
import { readArtifactsRoute } from "./route-core";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const result = readArtifactsRoute(request.url, getArtifactReadOptions());

  return NextResponse.json(result.payload, { status: result.status });
}
