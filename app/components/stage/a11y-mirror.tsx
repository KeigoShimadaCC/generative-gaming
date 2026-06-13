import type { GridCellView, GridViewModel } from "@/components/grid/model";

import styles from "./PixiStage.module.css";

type StageA11yMirrorProps = {
  readonly model: GridViewModel;
};

/**
 * Off-screen DOM grid kept in sync with the same view-model as the Pixi canvas.
 * Keyboard handlers and screen readers target this mirror while the canvas is visual.
 */
export function StageA11yMirror({ model }: StageA11yMirrorProps) {
  return (
    <div className={styles.a11yMirror} data-testid="stage-a11y-mirror">
      <div
        role="grid"
        aria-rowcount={model.height}
        aria-colcount={model.width}
        data-width={model.width}
        data-height={model.height}
      >
        {model.rows.map((row, rowIndex) => (
          <div role="row" aria-rowindex={rowIndex + 1} key={rowIndex}>
            {row.map((cell) => (
              <A11yCell cell={cell} key={cell.key} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function A11yCell({ cell }: { readonly cell: GridCellView }) {
  return (
    <div
      role="gridcell"
      aria-colindex={cell.x + 1}
      aria-label={`${cell.x},${cell.y} ${cell.label}`}
      data-x={cell.x}
      data-y={cell.y}
      data-layer={cell.layer}
      data-fog={cell.fog}
      data-label={cell.label}
    />
  );
}
