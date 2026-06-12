import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { keymapOverlayRows } from "@/input/keys";

import { KeymapOverlay } from "./KeymapOverlay";

describe("KeymapOverlay", () => {
  it("renders one page from the shared keymap table", () => {
    const markup = renderToStaticMarkup(
      createElement(KeymapOverlay, { open: true }),
    );
    const rows = keymapOverlayRows();

    expect(markup).toContain("Keymap");
    for (const row of rows) {
      expect(markup, row.id).toContain(row.keys);
      expect(markup, row.id).toContain(row.action);
    }

    console.info(`keymap overlay rows rendered from table: ${rows.length}`);
  });
});
