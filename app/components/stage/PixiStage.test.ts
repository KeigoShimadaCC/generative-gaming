import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createFogMixGridFixtureState,
  createMidActionGridFixtureState,
  createPrecedenceFixtureState,
} from "@/components/grid/fixtures";
import { createGridViewModel } from "@/components/grid/model";

import { StageA11yMirror } from "./a11y-mirror";
import { createStageDrawList } from "./draw-list";

describe("PixiStage draw-list seam", () => {
  it("maps every grid cell to deterministic background rects", () => {
    const model = createGridViewModel(createFogMixGridFixtureState());
    const drawList = createStageDrawList(model);

    expect(drawList.width).toBe(5);
    expect(drawList.height).toBe(3);
    expect(drawList.rects.filter((rect) => rect.key.endsWith(":bg"))).toHaveLength(
      15,
    );
    expect(drawList.canvasWidth).toBe(
      drawList.padding * 2 +
        drawList.width * drawList.cellSize +
        (drawList.width - 1) * drawList.gap,
    );
  });

  it("adds entity overlay rects only for visible entity layers", () => {
    const model = createGridViewModel(createPrecedenceFixtureState());
    const drawList = createStageDrawList(model);
    const entityRects = drawList.rects.filter((rect) =>
      rect.key.endsWith(":entity"),
    );

    expect(entityRects).toHaveLength(5);
    expect(
      drawList.rects.find((rect) => rect.key === "0:0:entity")?.fillColor,
    ).toBe(0xffe680);
    expect(
      drawList.rects.find((rect) => rect.key === "1:0:entity")?.fillColor,
    ).toBe(0xff7474);
  });

  it("is a pure function of the view-model", () => {
    const model = createGridViewModel(createMidActionGridFixtureState());
    const first = createStageDrawList(model);
    const second = createStageDrawList(model);

    expect(second).toEqual(first);
  });
});

describe("PixiStage a11y mirror", () => {
  it("mirrors the DOM grid aria structure off-screen", () => {
    const model = createGridViewModel(createFogMixGridFixtureState());
    const markup = renderToStaticMarkup(
      createElement(StageA11yMirror, { model }),
    );

    expect(markup).toContain('role="grid"');
    expect(markup).toContain('aria-rowcount="3"');
    expect(markup).toContain('aria-colcount="5"');
    expect(markup.match(/role="gridcell"/g)?.length).toBe(15);
    expect(markup).toContain('aria-label="1,1 you"');
    expect(markup).toContain('data-testid="stage-a11y-mirror"');
  });
});
