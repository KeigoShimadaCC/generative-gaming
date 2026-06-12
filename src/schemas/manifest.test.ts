import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ambientSpikeOutputExpectations,
  malformedManifestFixtures,
  validManifestFixtures,
  validMiddleManifestFixture,
  validShallowsManifestFixture,
} from "./fixtures/manifest.js";
import { FloorManifestSchema, parseManifest } from "./manifest.js";

const repoRoot = new URL("../../", import.meta.url);

describe("floor manifest schema", () => {
  it("accepts one complete fixture per depth band", () => {
    for (const fixture of validManifestFixtures) {
      expect(FloorManifestSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it("rejects the malformed fixture set with useful paths", () => {
    expect(malformedManifestFixtures.length).toBeGreaterThanOrEqual(6);

    for (const fixture of malformedManifestFixtures) {
      const parsed = parseManifest(JSON.stringify(fixture.manifest));

      expect(parsed.ok, fixture.name).toBe(false);
      if (parsed.ok) {
        continue;
      }

      expect(renderErrors(parsed.errors), fixture.name).toContain(
        fixture.expectedPath,
      );
    }
  });

  it("parses pure JSON manifests", () => {
    const parsed = parseManifest(JSON.stringify(validShallowsManifestFixture));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.manifest.depth).toBe(3);
    expect(parsed.manifest.band).toBe("shallows");
  });

  it("strips fences and extracts the first JSON object", () => {
    const raw = [
      "manifest follows",
      "```json",
      JSON.stringify(validMiddleManifestFixture),
      "```",
      "ignored trailing text",
    ].join("\n");

    const parsed = parseManifest(raw);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.manifest.depth).toBe(6);
    expect(parsed.manifest.metadata.signature).toBe(true);
  });

  it("reports JSON extraction failures", () => {
    const parsed = parseManifest("no manifest here");

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.errors).toEqual([{ path: "$", message: "no JSON object found" }]);
  });
});

describe("ambient spike outputs", () => {
  it("documents the distance from Phase 29 host outputs to the Phase 30 envelope", () => {
    for (const expectation of ambientSpikeOutputExpectations) {
      const raw = readFileSync(new URL(expectation.path, repoRoot), "utf8");
      const parsed = parseManifest(raw);

      expect(parsed.ok, expectation.id).toBe(false);
      if (parsed.ok) {
        continue;
      }

      const rendered = renderErrors(parsed.errors);
      for (const expectedPath of expectation.expectedPathFragments) {
        expect(rendered, `${expectation.id} ${expectedPath}`).toContain(
          expectedPath,
        );
      }
    }
  });
});

const renderErrors = (
  errors: readonly { readonly path: string; readonly message: string }[],
): string => errors.map((error) => `${error.path}: ${error.message}`).join("\n");
