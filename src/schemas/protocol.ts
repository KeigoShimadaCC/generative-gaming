import packageJson from "../../package.json" with { type: "json" };

export const PROTOCOL_VERSION = "1.1.0" as const;

export const ENGINE_VERSION = packageJson.version;

export type ProtocolStamp = {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly engineVersion: string;
  readonly createdAt: string;
};

export const stamp = <T extends Record<string, unknown>>(
  object: T,
  createdAt: string,
): T & ProtocolStamp => ({
  ...object,
  protocolVersion: PROTOCOL_VERSION,
  engineVersion: ENGINE_VERSION,
  createdAt,
});
