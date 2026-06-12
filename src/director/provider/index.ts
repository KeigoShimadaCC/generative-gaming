import { config as defaultConfig, type GameConfig } from "../../config/index.js";
import {
  AmbientDirectorProvider,
  type AmbientDirectorProviderOptions,
} from "./ambient.js";
import {
  MockDirectorProvider,
  type MockDirectorProviderOptions,
} from "./mock.js";
import {
  type DirectorProvider,
  type JudgeResult,
  type ProviderResult,
  failure,
} from "./types.js";

export * from "./ambient.js";
export * from "./mock.js";
export * from "./types.js";

export type CreateDirectorProviderOptions = {
  readonly config?: GameConfig;
  readonly mock?: MockDirectorProviderOptions;
  readonly ambient?: AmbientDirectorProviderOptions;
};

export const createDirectorProvider = (
  options: CreateDirectorProviderOptions = {},
): DirectorProvider => {
  const config = options.config ?? defaultConfig;

  switch (config.director.provider) {
    case "mock":
      return new MockDirectorProvider(options.mock);
    case "ambient":
      return new AmbientDirectorProvider(options.ambient);
    case "api-future":
      return new DeferredApiFutureDirectorProvider();
  }
};

class DeferredApiFutureDirectorProvider implements DirectorProvider {
  async generateManifest(): Promise<ProviderResult> {
    return failure(
      "process_error",
      "api-future provider is deferred until an API key exists",
      { latencyMs: 0, tokens: null },
    );
  }

  async judge(): Promise<JudgeResult> {
    return failure(
      "process_error",
      "api-future judge provider is deferred until an API key exists",
      { latencyMs: 0, tokens: null },
    );
  }
}
