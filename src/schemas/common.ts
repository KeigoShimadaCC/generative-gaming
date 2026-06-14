import { z } from "zod";

export const boundedInt = (range: { readonly min: number; readonly max: number }) =>
  z.number().int().min(range.min).max(range.max);

export const boundedNumber = (range: {
  readonly min: number;
  readonly max: number;
}) => z.number().min(range.min).max(range.max);

export const nonEmptyString = z.string().min(1);

export const MAX_GLYPH_CHARS = 16;

export const glyphSchema = z.string().min(1).max(MAX_GLYPH_CHARS);

export const enforceActivePayload = (
  value: Record<string, unknown> & {
    readonly category?: string;
    readonly kind?: string;
  },
  ctx: z.RefinementCtx,
  payloadKeys: readonly string[],
  expectedKey: string,
): void => {
  const discriminator = value.kind ?? value.category ?? "value";

  for (const key of payloadKeys) {
    const payload = value[key];

    if (key === expectedKey && payload === null) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `payload for ${discriminator} is required`,
      });
    }

    if (key !== expectedKey && payload !== null) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `payload must be null when discriminator is ${discriminator}`,
      });
    }
  }
};
