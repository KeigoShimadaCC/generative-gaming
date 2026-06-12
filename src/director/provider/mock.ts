import { validShallowsManifestFixture } from "../../schemas/fixtures/manifest.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import {
  type DirectorProvider,
  type GenerateManifestOptions,
  type JudgeOptions,
  type JudgeResult,
  type JudgeVerdict,
  type ProviderFailureCode,
  type ProviderResult,
  type ProviderTokenUsage,
  type ProviderUsage,
  failure,
} from "./types.js";

export type MockDirectorProviderOptions = {
  readonly manifest?: FloorManifest;
  readonly raw?: string;
  readonly failureMode?: ProviderFailureCode | null;
  readonly judgeVerdict?: JudgeVerdict;
  readonly judgeRaw?: string;
  readonly judgeFailureMode?: ProviderFailureCode | null;
  readonly latencyMs?: number;
  readonly tokens?: ProviderTokenUsage | null;
};

const DEFAULT_JUDGE_VERDICT: JudgeVerdict = {
  verdict: "pass",
  reason: "mock verdict",
  score: 1,
};

export class MockDirectorProvider implements DirectorProvider {
  private readonly manifest: FloorManifest;
  private readonly raw: string;
  private readonly failureMode: ProviderFailureCode | null;
  private readonly judgeVerdict: JudgeVerdict;
  private readonly judgeRaw: string;
  private readonly judgeFailureMode: ProviderFailureCode | null;
  private readonly usage: ProviderUsage;

  constructor(options: MockDirectorProviderOptions = {}) {
    this.manifest = options.manifest ?? validShallowsManifestFixture;
    this.raw = options.raw ?? JSON.stringify(this.manifest);
    this.failureMode = options.failureMode ?? null;
    this.judgeVerdict = options.judgeVerdict ?? DEFAULT_JUDGE_VERDICT;
    this.judgeRaw = options.judgeRaw ?? JSON.stringify(this.judgeVerdict);
    this.judgeFailureMode = options.judgeFailureMode ?? null;
    this.usage = {
      latencyMs: options.latencyMs ?? 0,
      tokens: options.tokens ?? null,
    };
  }

  async generateManifest(
    prompt: string,
    options: GenerateManifestOptions = {},
  ): Promise<ProviderResult> {
    void prompt;
    void options;

    if (this.failureMode !== null) {
      return failure(
        this.failureMode,
        `mock ${this.failureMode}`,
        this.usage,
        this.raw,
      );
    }

    return {
      ok: true,
      raw: this.raw,
      manifest: this.manifest,
      usage: this.usage,
    };
  }

  async judge(prompt: string, options: JudgeOptions = {}): Promise<JudgeResult> {
    void prompt;
    void options;

    if (this.judgeFailureMode !== null) {
      return failure(
        this.judgeFailureMode,
        `mock judge ${this.judgeFailureMode}`,
        this.usage,
        this.judgeRaw,
      );
    }

    return {
      ok: true,
      raw: this.judgeRaw,
      verdict: this.judgeVerdict,
      usage: this.usage,
    };
  }
}

export const createMockDirectorProvider = (
  options: MockDirectorProviderOptions = {},
): MockDirectorProvider => new MockDirectorProvider(options);
