import { z } from "zod";

import { bounds } from "../../config/index.js";
import { boundedInt } from "../common.js";

export const STATUS_IDS = bounds.statusVocabulary.closedList;

export const StatusIdSchema = z.enum(STATUS_IDS);

export type StatusId = z.infer<typeof StatusIdSchema>;

export const STATUS_DURATION_BOUNDS = bounds.statusVocabulary.durationTurns;

export const statusDurationSchemaFor = (status: StatusId) =>
  boundedInt(STATUS_DURATION_BOUNDS[status]);

export const StatusApplicationSchema = z
  .strictObject({
    status: StatusIdSchema,
    duration: z.number().int(),
  })
  .superRefine((application, ctx) => {
    const durationBounds = STATUS_DURATION_BOUNDS[application.status];

    if (application.duration < durationBounds.min) {
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: `${application.status} duration must be at least ${durationBounds.min}`,
      });
    }

    if (application.duration > durationBounds.max) {
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: `${application.status} duration must be at most ${durationBounds.max}`,
      });
    }
  });

export const RuntimeStatusApplicationSchema = z
  .strictObject({
    status: StatusIdSchema,
    duration: z.number().int().nonnegative(),
  })
  .superRefine((application, ctx) => {
    const durationBounds = STATUS_DURATION_BOUNDS[application.status];

    if (application.duration > durationBounds.max) {
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: `${application.status} duration must be at most ${durationBounds.max}`,
      });
    }
  });

export type StatusApplication = z.infer<typeof StatusApplicationSchema>;
