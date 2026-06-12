import {
  parseManifest,
  type ManifestParseError,
} from "../../schemas/manifest.js";
import {
  buildGateReport,
  failCheck,
  passCheck,
  type GateCheck,
  type GateReport,
} from "./report.js";

export const runGate0 = (raw: string): GateReport => {
  const result = parseManifest(raw);

  if (result.ok) {
    return buildGateReport(0, [
      passCheck("G0_SCHEMA", "manifest schema valid"),
    ]);
  }

  return buildGateReport(0, mapParseErrorsToChecks(result.errors));
};

const mapParseErrorsToChecks = (
  errors: readonly ManifestParseError[],
): GateCheck[] => {
  const codes = new Set(errors.map(classifyParseError));

  if (codes.size === 1) {
    const code = [...codes][0]!;
    return [failCheck(code, summarizeParseErrors(errors))];
  }

  return [...codes].map((code) =>
    failCheck(
      code,
      summarizeParseErrors(errors.filter((error) => classifyParseError(error) === code)),
    ),
  );
};

const classifyParseError = (
  error: ManifestParseError,
): "G0_NO_JSON" | "G0_INVALID_JSON" | "G0_SCHEMA" => {
  const message = error.message.toLowerCase();

  if (
    message === "no json object found" ||
    message === "unterminated json object"
  ) {
    return "G0_NO_JSON";
  }

  if (message.startsWith("invalid json")) {
    return "G0_INVALID_JSON";
  }

  return "G0_SCHEMA";
};

const summarizeParseErrors = (
  errors: readonly ManifestParseError[],
): string =>
  errors.map((error) => `${error.path}: ${error.message}`).join("; ");
