"use client";

import type { DungeonDiary, DiaryEntryKind } from "@harness/diary";

import styles from "./DiaryPanel.module.css";

type DiaryPanelProps = {
  readonly diary: DungeonDiary;
  readonly variant: "partial" | "final";
};

export function DiaryPanel({ diary, variant }: DiaryPanelProps) {
  return (
    <section
      className={[styles.panel, variant === "final" ? styles.final : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="Dungeon diary"
      data-diary-mode={diary.mode}
      data-testid="dungeon-diary"
    >
      <SummaryStrip diary={diary} />

      <div className={styles.body}>
        <div className={styles.manuscript}>
          {diary.floors.map((floor) => (
            <section className={styles.floor} key={floor.depth}>
              <h3>Floor {floor.depth}</h3>
              {floor.entries.length === 0 ? (
                <p className={styles.blank}>The page waits.</p>
              ) : (
                <ol>
                  {floor.entries.map((entry) => (
                    <li
                      className={[
                        styles.entry,
                        styles[kindClass(entry.kind)],
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-entry-kind={entry.kind}
                      data-source-count={entry.sources.length}
                      key={entry.id}
                    >
                      <div>
                        <span>{entry.title}</span>
                        <time>t{entry.turn}</time>
                      </div>
                      <p>{entry.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>

        <aside className={styles.learnedNote} aria-label="What the dungeon learned">
          <h3>What the Deep keeps</h3>
          <p>{diary.learnedNote}</p>
        </aside>
      </div>
    </section>
  );
}

function SummaryStrip({ diary }: { readonly diary: DungeonDiary }) {
  return (
    <div className={styles.summaryStrip}>
      <Summary label="Outcome" value={diary.summary.outcome} />
      <Summary label="Depth" value={String(diary.summary.depth)} />
      <Summary label="Turns" value={String(diary.summary.turns)} />
      <Summary label="Kills" value={String(diary.summary.kills)} />
      <Summary label="Found" value={String(diary.summary.discoveries)} />
    </div>
  );
}

function Summary({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const kindClass = (kind: DiaryEntryKind): keyof typeof styles => {
  switch (kind) {
    case "callback":
      return "callback";
    case "close_call":
      return "closeCall";
    case "discovery":
      return "discovery";
    case "floor":
      return "floorEntry";
    case "kill":
      return "kill";
    case "narration":
      return "narration";
    case "quest":
      return "quest";
  }
};
