import type { DirectorProviderSelection } from "../../config/index.js";
import type {
  FloorManifest,
  ManifestParseError,
} from "../../schemas/manifest.js";

export type DirectorProviderKind = DirectorProviderSelection;

export type ProviderFailureCode =
  | "timeout"
  | "process_error"
  | "parse_fail"
  | "validate_fail";

export type ProviderTokenUsage = {
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly totalTokens?: number | null;
};

export type ProviderUsage = {
  readonly latencyMs: number;
  readonly tokens?: ProviderTokenUsage | null;
};

export type ProviderError = {
  readonly code: ProviderFailureCode;
  readonly message: string;
  readonly details?: readonly string[];
};

export type ProviderSuccess = {
  readonly ok: true;
  readonly raw: string;
  readonly manifest: FloorManifest;
  readonly usage: ProviderUsage;
};

export type ProviderFailure = {
  readonly ok: false;
  readonly error: ProviderError;
  readonly raw?: string;
  readonly usage: ProviderUsage;
};

export type ProviderResult = ProviderSuccess | ProviderFailure;

export type JudgeVerdictLabel = "pass" | "fail" | "uncertain";

export type JudgeVerdict = {
  readonly verdict: JudgeVerdictLabel;
  readonly reason: string;
  readonly score: number | null;
};

export type JudgeSuccess = {
  readonly ok: true;
  readonly raw: string;
  readonly verdict: JudgeVerdict;
  readonly usage: ProviderUsage;
};

export type JudgeFailure = {
  readonly ok: false;
  readonly error: ProviderError;
  readonly raw?: string;
  readonly usage: ProviderUsage;
};

export type JudgeResult = JudgeSuccess | JudgeFailure;

export type GenerateManifestOptions = {
  readonly timeoutMs?: number;
};

export type JudgeOptions = {
  readonly timeoutMs?: number;
};

export interface DirectorProvider {
  generateManifest(
    prompt: string,
    options?: GenerateManifestOptions,
  ): Promise<ProviderResult>;

  judge(prompt: string, options?: JudgeOptions): Promise<JudgeResult>;
}

export type ProviderClock = () => number;

export const failure = (
  code: ProviderFailureCode,
  message: string,
  usage: ProviderUsage,
  raw?: string,
  details?: readonly string[],
): ProviderFailure => ({
  ok: false,
  error: {
    code,
    message,
    ...(details === undefined ? {} : { details }),
  },
  ...(raw === undefined ? {} : { raw }),
  usage,
});

export const manifestFailureCodeFor = (
  errors: readonly ManifestParseError[],
): ProviderFailureCode => {
  if (
    errors.length === 1 &&
    errors[0]?.path === "$" &&
    isJsonParseMessage(errors[0].message)
  ) {
    return "parse_fail";
  }

  return "validate_fail";
};

const isJsonParseMessage = (message: string): boolean =>
  message === "no JSON object found" ||
  message === "unterminated JSON object" ||
  message.startsWith("invalid JSON:");
