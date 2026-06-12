"use client";

import type { DungeonDiary } from "@harness/diary";

import { ArtifactViewer } from "@/components/artifacts/ArtifactViewer";
import type { ArtifactViewerModel } from "@/components/artifacts/model";

import { DiaryPanel } from "./DiaryPanel";
import styles from "./DiaryLayer.module.css";

export type DiaryLayerTab = "diary" | "artifacts";

type DiaryLayerProps = {
  readonly diary: DungeonDiary;
  readonly artifactModel: ArtifactViewerModel | null;
  readonly activeTab: DiaryLayerTab;
  readonly onSelectTab: (tab: DiaryLayerTab) => void;
  readonly onClose: () => void;
};

export function DiaryLayer({
  diary,
  artifactModel,
  activeTab,
  onSelectTab,
  onClose,
}: DiaryLayerProps) {
  return (
    <div
      className={styles.scrim}
      aria-label="Diary and artifacts layer"
      data-testid="diary-layer"
    >
      <section className={styles.layer} role="dialog" aria-modal="false">
        <header className={styles.header}>
          <div>
            <h2>The Deep's manuscript</h2>
            <p>
              Floor {diary.summary.depth} · turn {diary.summary.turns}
            </p>
          </div>
          <div className={styles.controls}>
            <div className={styles.tabs} role="tablist" aria-label="Second layer tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "diary"}
                data-selected={activeTab === "diary" ? "true" : "false"}
                data-testid="diary-tab"
                onClick={() => onSelectTab("diary")}
              >
                Diary
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "artifacts"}
                data-selected={activeTab === "artifacts" ? "true" : "false"}
                data-testid="artifacts-tab"
                onClick={() => onSelectTab("artifacts")}
              >
                Artifacts
              </button>
            </div>
            <button className={styles.close} type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className={styles.content}>
          {activeTab === "diary" ? (
            <DiaryPanel diary={diary} variant="partial" />
          ) : (
            <ArtifactViewer model={artifactModel} />
          )}
        </div>
      </section>
    </div>
  );
}
