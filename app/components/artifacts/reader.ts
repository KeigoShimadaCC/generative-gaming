import {
  listFloors,
  loadGenerationChain,
  readRunIndex,
  type ArtifactReadOptions,
} from "@harness/artifacts";

import { createArtifactViewerModel, type ArtifactViewerModel } from "./model";

export const loadArtifactViewerModel = (
  runId: string,
  options: ArtifactReadOptions = {},
): ArtifactViewerModel => {
  const index = readRunIndex(runId, options);
  const records = listFloors(runId, options).map((floor) =>
    loadGenerationChain(runId, floor.depth, options),
  );

  return createArtifactViewerModel({ index, records });
};
