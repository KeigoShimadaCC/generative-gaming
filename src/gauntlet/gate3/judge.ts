import { z } from "zod";

import {
  config as defaultConfig,
  type GameConfig,
  type Gate3JudgeMode,
} from "../../config/index.js";
import {
  type DirectorProvider,
  type JudgeResult,
  type JudgeVerdict,
  type ProviderError,
  type ProviderUsage,
} from "../../director/provider/index.js";
import type { FloorManifest } from "../../schemas/manifest.js";
import { registerGate3 } from "../repair.js";
import {
  collectGeneratedTextEntries,
  gate3HeuristicsContextFromUnknown,
  runGate3Heuristics,
  type Gate3Check,
  type Gate3HeuristicsContext,
  type Gate3Report,
} from "./heuristics.js";

export const GATE3_JUDGE_TAXONOMY = [
  "pass",
  "axis_fail",
  "provider_failure",
  "parse_fail",
  "validate_fail",
] as const;

export type Gate3JudgeTaxonomy = (typeof GATE3_JUDGE_TAXONOMY)[number];

export type Gate3JudgeVerdict = {
  readonly onTone: boolean;
  readonly coherent: boolean;
  readonly specific: boolean;
};

export type Gate3JudgeTextEntry = {
  readonly path: string;
  readonly kind: "name" | "narration";
  readonly text: string;
};

export type Gate3JudgeContext = Gate3HeuristicsContext & {
  readonly playerSummary?: string;
};

export type Gate3JudgeOptions = {
  readonly provider: DirectorProvider;
  readonly config?: GameConfig;
  readonly context?: Gate3JudgeContext;
};

export type Gate3JudgeSummary = {
  readonly status: Gate3JudgeTaxonomy;
  readonly mode: Gate3JudgeMode;
  readonly textEntryCount: number;
  readonly verdict?: Gate3JudgeVerdict;
  readonly providerVerdict?: JudgeVerdict;
  readonly providerError?: ProviderError;
  readonly parseError?: string;
  readonly usage?: ProviderUsage;
};

export type Gate3JudgedReport = Gate3Report & {
  readonly judge: Gate3JudgeSummary;
};

const Gate3JudgeVerdictSchema = z.strictObject({
  onTone: z.boolean(),
  coherent: z.boolean(),
  specific: z.boolean(),
});

export const runGate3WithJudge = async (
  manifest: FloorManifest,
  options: Gate3JudgeOptions,
): Promise<Gate3Report | Gate3JudgedReport> => {
  const gameConfig = options.config ?? defaultConfig;
  const heuristicReport = runGate3Heuristics(manifest, options.context);
  const judgeConfig = gameConfig.gate3.judge;

  if (!judgeConfig.enabled) {
    return heuristicReport;
  }

  const judge = await evaluateJudge(manifest, options.provider, {
    context: options.context,
    mode: judgeConfig.mode,
    timeoutMs: judgeConfig.timeoutMs,
  });
  const checks = [...heuristicReport.checks, judge.check];

  return {
    gate: 3,
    pass: checks.every((check) => check.pass || check.advisory === true),
    checks,
    judge: judge.summary,
  };
};

export const collectGate3JudgeText = (
  manifest: FloorManifest,
): readonly Gate3JudgeTextEntry[] =>
  collectGeneratedTextEntries(manifest)
    .filter(
      (
        entry,
      ): entry is ReturnType<typeof collectGeneratedTextEntries>[number] & {
        readonly kind: "name" | "narration";
      } => entry.kind === "narration" || entry.kind === "name",
    )
    .map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      text: entry.value,
    }));

export const buildGate3JudgePrompt = (
  manifest: FloorManifest,
  context: Gate3JudgeContext = {},
): string => {
  const entries = collectGate3JudgeText(manifest);
  const playerSummary =
    context.playerSummary?.trim() ?? "No player summary was supplied.";

  return [
    "Judge this floor text for The Deep's voice.",
    "Read only the extracted narration and named-entity text below; do not assume unseen manifest fields.",
    `Floor: depth ${manifest.depth}, ${manifest.band} band.`,
    "",
    "Return JSON for these three booleans only:",
    '{"onTone":true,"coherent":true,"specific":true}',
    "",
    "onTone: second-person, present-tense, fairy-tale-with-teeth, concrete, pre-industrial Deep voice.",
    "coherent: the narration and named entities feel like one playable floor without obvious contradiction.",
    "specific: the text responds to the supplied player summary rather than sounding generic.",
    "",
    "Player summary:",
    playerSummary,
    "",
    "Extracted floor text:",
    JSON.stringify(entries, null, 2),
  ].join("\n");
};

export const parseGate3JudgeVerdictJson = (
  raw: string,
):
  | { readonly ok: true; readonly verdict: Gate3JudgeVerdict }
  | {
      readonly ok: false;
      readonly status: Extract<Gate3JudgeTaxonomy, "parse_fail" | "validate_fail">;
      readonly message: string;
    } => {
  const extracted = extractFirstJsonObject(raw);
  if (!extracted.ok) {
    return { ok: false, status: "parse_fail", message: extracted.message };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted.json);
  } catch (error) {
    return {
      ok: false,
      status: "parse_fail",
      message:
        error instanceof Error ? `invalid JSON: ${error.message}` : "invalid JSON",
    };
  }

  const verdict = Gate3JudgeVerdictSchema.safeParse(parsed);
  if (!verdict.success) {
    return {
      ok: false,
      status: "validate_fail",
      message: verdict.error.issues
        .map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)
        .join("; "),
    };
  }

  return { ok: true, verdict: verdict.data };
};

export const gate3JudgeContextFromUnknown = (
  value: unknown,
): Gate3JudgeContext => {
  const context = gate3HeuristicsContextFromUnknown(value);
  if (!isRecord(value)) {
    return context;
  }

  return {
    ...context,
    ...(typeof value.playerSummary === "string"
      ? { playerSummary: value.playerSummary }
      : {}),
  };
};

export const installGate3Judge = (): void => {
  registerGate3((manifest, ctx) =>
    runGate3WithJudge(manifest, {
      provider: ctx.provider,
      context: gate3JudgeContextFromUnknown(ctx.gate3),
    }),
  );
};

installGate3Judge();

const evaluateJudge = async (
  manifest: FloorManifest,
  provider: DirectorProvider,
  options: {
    readonly context?: Gate3JudgeContext;
    readonly mode: Gate3JudgeMode;
    readonly timeoutMs: number;
  },
): Promise<{
  readonly check: Gate3Check;
  readonly summary: Gate3JudgeSummary;
}> => {
  const textEntryCount = collectGate3JudgeText(manifest).length;
  let result: JudgeResult;

  try {
    result = await provider.judge(buildGate3JudgePrompt(manifest, options.context), {
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    const providerError: ProviderError = {
      code: "process_error",
      message: error instanceof Error ? error.message : String(error),
    };

    return judgeFailureCheck({
      mode: options.mode,
      textEntryCount,
      status: "provider_failure",
      detail: `judge provider process_error: ${providerError.message}`,
      providerError,
    });
  }

  if (!result.ok) {
    return judgeFailureCheck({
      mode: options.mode,
      textEntryCount,
      status: "provider_failure",
      detail: `judge provider ${result.error.code}: ${result.error.message}`,
      providerError: result.error,
      usage: result.usage,
    });
  }

  const parsedFromRaw = parseGate3JudgeVerdictJson(result.raw);
  const parsed = parsedFromRaw.ok
    ? parsedFromRaw
    : parseGate3JudgeVerdictJson(result.verdict.reason);

  if (!parsed.ok) {
    return judgeFailureCheck({
      mode: options.mode,
      textEntryCount,
      status: parsed.status,
      detail: `judge verdict ${parsed.status}: ${parsed.message}`,
      providerVerdict: result.verdict,
      parseError: parsed.message,
      usage: result.usage,
    });
  }

  const failedAxes = Object.entries(parsed.verdict)
    .filter(([, pass]) => !pass)
    .map(([axis]) => axis);
  const status: Gate3JudgeTaxonomy =
    failedAxes.length === 0 ? "pass" : "axis_fail";
  const pass = failedAxes.length === 0;

  return {
    check: {
      code: "G3_JUDGE",
      pass,
      detail: pass
        ? "judge verdict onTone=true coherent=true specific=true"
        : `judge rejected ${failedAxes.join(", ")}: ${JSON.stringify(parsed.verdict)}`,
      ...(options.mode === "advisory" ? { advisory: true as const } : {}),
    },
    summary: {
      status,
      mode: options.mode,
      textEntryCount,
      verdict: parsed.verdict,
      providerVerdict: result.verdict,
      usage: result.usage,
    },
  };
};

const judgeFailureCheck = ({
  mode,
  textEntryCount,
  status,
  detail,
  providerError,
  providerVerdict,
  parseError,
  usage,
}: {
  readonly mode: Gate3JudgeMode;
  readonly textEntryCount: number;
  readonly status: Extract<
    Gate3JudgeTaxonomy,
    "provider_failure" | "parse_fail" | "validate_fail"
  >;
  readonly detail: string;
  readonly providerError?: ProviderError;
  readonly providerVerdict?: Gate3JudgeSummary["providerVerdict"];
  readonly parseError?: string;
  readonly usage?: ProviderUsage;
}): { readonly check: Gate3Check; readonly summary: Gate3JudgeSummary } => ({
  check: {
    code: "G3_JUDGE",
    pass: false,
    detail,
    ...(mode === "advisory" ? { advisory: true as const } : {}),
  },
  summary: {
    status,
    mode,
    textEntryCount,
    ...(providerError === undefined ? {} : { providerError }),
    ...(providerVerdict === undefined ? {} : { providerVerdict }),
    ...(parseError === undefined ? {} : { parseError }),
    ...(usage === undefined ? {} : { usage }),
  },
});

const extractFirstJsonObject = (
  raw: string,
):
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly message: string } => {
  const text = stripMarkdownFence(raw);
  const start = text.indexOf("{");
  if (start === -1) {
    return { ok: false, message: "no JSON object found" };
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { ok: true, json: text.slice(start, index + 1) };
      }
    }
  }

  return { ok: false, message: "unterminated JSON object" };
};

const stripMarkdownFence = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/);
  return fenced?.[1]?.trim() ?? trimmed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
