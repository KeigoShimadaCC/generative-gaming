export const extractFirstJsonObject = (
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

      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
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
