import { NextResponse } from "next/server";
import { z } from "zod";

export {
  GetFloorRequestSchema,
  PollStatusRequestSchema,
  START_GENERATION_BODY_MAX_BYTES,
  StartGenerationRequestSchema,
} from "../../../src/director/orchestration/transport-validation.js";

type ApiErrorCode =
  | "body_too_large"
  | "invalid_json"
  | "invalid_request"
  | "internal_error";

class ApiRouteError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const readLimitedText = async (
  request: Request,
  maxBytes?: number,
): Promise<string> => {
  if (request.body === null) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value === undefined) {
      continue;
    }

    totalBytes += value.byteLength;
    if (maxBytes !== undefined && totalBytes > maxBytes) {
      throw new ApiRouteError(413, "body_too_large");
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
};

export const readValidatedJson = async <T>(
  request: Request,
  schema: z.ZodType<T>,
  options: { readonly maxBytes?: number } = {},
): Promise<T> => {
  let raw: string;
  try {
    raw = await readLimitedText(request, options.maxBytes);
  } catch (error) {
    if (error instanceof ApiRouteError) {
      throw error;
    }
    throw new ApiRouteError(400, "invalid_json");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiRouteError(400, "invalid_json");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiRouteError(400, "invalid_request");
  }

  return result.data;
};

export const jsonErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof ApiRouteError) {
    return NextResponse.json(
      { error: error.code },
      { status: error.status },
    );
  }

  return NextResponse.json(
    { error: "internal_error" },
    { status: 500 },
  );
};
