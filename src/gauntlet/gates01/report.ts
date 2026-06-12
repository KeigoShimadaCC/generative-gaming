/** Frozen contract surface for the repair loop (phase 36). */
export const GATE_REASON_CODES = [
  "G0_NO_JSON",
  "G0_INVALID_JSON",
  "G0_SCHEMA",
  "G1_PROTOCOL_VERSION",
  "G1_REF_INTEGRITY",
  "G1_CALLBACK_REF",
  "G1_PLACEMENT_HINT",
  "G1_ROSTER_BUDGET",
  "G1_ENEMY_STATS",
  "G1_ITEM_VALUE",
  "G1_TRAP_LETHALITY",
  "G1_ENTITY_CAP",
  "G1_TEXT_CAP",
  "G1_SIGNATURE",
] as const;

export type GateReasonCode = (typeof GATE_REASON_CODES)[number];

export type GateCheck = {
  readonly code: GateReasonCode;
  readonly pass: boolean;
  readonly detail: string;
};

export type GateReport = {
  readonly gate: 0 | 1;
  readonly pass: boolean;
  readonly checks: readonly GateCheck[];
};

export const passCheck = (
  code: GateReasonCode,
  detail: string,
): GateCheck => ({
  code,
  pass: true,
  detail,
});

export const failCheck = (
  code: GateReasonCode,
  detail: string,
): GateCheck => ({
  code,
  pass: false,
  detail,
});

export const buildGateReport = (
  gate: 0 | 1,
  checks: readonly GateCheck[],
): GateReport => ({
  gate,
  pass: checks.every((check) => check.pass),
  checks,
});

export const failedChecks = (report: GateReport): readonly GateCheck[] =>
  report.checks.filter((check) => !check.pass);

export const formatGateReport = (report: GateReport): string => {
  const header = `Gate ${report.gate}: ${report.pass ? "PASS" : "FAIL"}`;
  const lines = report.checks.map(
    (check) =>
      `  [${check.pass ? "ok" : "FAIL"}] ${check.code}: ${check.detail}`,
  );

  return [header, ...lines].join("\n");
};
