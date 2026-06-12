import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ambientSpikeOutputExpectations } from "../../schemas/fixtures/manifest.js";
import { validManifestFixtures } from "../../schemas/fixtures/manifest.js";
import {
  gate0AdversarialFixtures,
  gate1AdversarialFixtures,
  gate1SignatureBandFixture,
  gateLegalValidManifestFixtures,
} from "./fixtures.js";
import { runGate0 } from "./gate0.js";
import { runGate1 } from "./gate1.js";
import {
  failedChecks,
  formatGateReport,
  GATE_REASON_CODES,
  type GateReasonCode,
} from "./report.js";

const repoRoot = new URL("../../../", import.meta.url);

const expectSingleFailure = (
  report: ReturnType<typeof runGate0> | ReturnType<typeof runGate1>,
  code: GateReasonCode,
): void => {
  expect(report.pass).toBe(false);
  const failures = failedChecks(report);
  expect(failures).toHaveLength(1);
  expect(failures[0]?.code).toBe(code);
};

describe("gate reason codes", () => {
  it("freezes the contract surface", () => {
    expect(GATE_REASON_CODES).toEqual([
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
    ]);
  });
});

describe("gate 0", () => {
  it("accepts valid band fixtures", () => {
    for (const fixture of validManifestFixtures) {
      const report = runGate0(JSON.stringify(fixture));
      expect(report.pass, fixture.band).toBe(true);
      expect(formatGateReport(report)).toMatchSnapshot();
    }
  });

  it.each(gate0AdversarialFixtures)(
    "rejects $label with $code",
    ({ code, raw }) => {
      expectSingleFailure(runGate0(raw!), code);
    },
  );
});

describe("gate 1", () => {
  it("accepts shallows and lowest phase-30 fixtures without ref normalization", () => {
    for (const fixture of validManifestFixtures) {
      if (fixture.band === "middle") {
        continue;
      }

      expect(runGate1(fixture).pass, fixture.band).toBe(true);
    }
  });

  it("accepts valid band fixtures after gate 0", () => {
    for (const fixture of gateLegalValidManifestFixtures) {
      const gate0 = runGate0(JSON.stringify(fixture));
      expect(gate0.pass, `${fixture.band} gate0`).toBe(true);

      const report = runGate1(fixture);
      expect(report.pass, fixture.band).toBe(true);
      expect(failedChecks(report)).toEqual([]);
      expect(formatGateReport(report)).toMatchSnapshot();
    }
  });

  it.each(gate1AdversarialFixtures)(
    "rejects $label with $code",
    ({ code, manifest, context }) => {
      expectSingleFailure(runGate1(manifest!, context), code);
    },
  );

  it("rejects signature outside the middle band with G1_SIGNATURE", () => {
    expectSingleFailure(
      runGate1(gate1SignatureBandFixture.manifest!),
      "G1_SIGNATURE",
    );
  });
});

describe("ambient spike outputs", () => {
  it("fail gate 0 with schema-coded reasons", () => {
    for (const expectation of ambientSpikeOutputExpectations) {
      const raw = readFileSync(new URL(expectation.path, repoRoot), "utf8");
      const report = runGate0(raw);

      expect(report.pass, expectation.id).toBe(false);
      expect(failedChecks(report).some((check) => check.code === "G0_SCHEMA"))
        .toBe(true);
    }
  });
});
