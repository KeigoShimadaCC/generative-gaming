import type { FloorContentProvider } from "../../engine/run/loop.js";
import { createFallbackFloorContentProvider } from "../fallback-provider.js";
import type { ContentRef } from "./types.js";

const FALLBACK_PROVIDER_IDS = new Set(["fallback:old-stock"]);

export const resolveContentProvider = (
  contentRef: ContentRef
): FloorContentProvider => {
  if (!FALLBACK_PROVIDER_IDS.has(contentRef.providerId)) {
    throw new Error(
      `unknown fallback content provider id: ${contentRef.providerId}`
    );
  }

  return createFallbackFloorContentProvider();
};
