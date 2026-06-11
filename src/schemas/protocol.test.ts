import { describe, expect, it } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import {
  validCreatedAtFixture,
  validProtocolPayloadFixture,
} from "./fixtures/protocol.js";
import { ENGINE_VERSION, PROTOCOL_VERSION, stamp } from "./protocol.js";

describe("protocol stamping", () => {
  it("exposes the protocol and package engine versions", () => {
    expect(PROTOCOL_VERSION).toBe("1.1.0");
    expect(ENGINE_VERSION).toBe(packageJson.version);
  });

  it("stamps objects with injected time and no implicit clock access", () => {
    expect(stamp(validProtocolPayloadFixture, validCreatedAtFixture)).toEqual({
      ...validProtocolPayloadFixture,
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: packageJson.version,
      createdAt: validCreatedAtFixture,
    });
  });
});
