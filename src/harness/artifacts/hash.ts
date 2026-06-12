import { createHash } from "node:crypto";

export const hashPrompt = (prompt: string): string =>
  createHash("sha256").update(prompt, "utf8").digest("hex");
