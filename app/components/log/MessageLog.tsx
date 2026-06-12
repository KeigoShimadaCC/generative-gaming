"use client";

import { useMemo } from "react";

import type { GameState } from "@engine/state";

import styles from "./MessageLog.module.css";
import {
  DEFAULT_LOG_WINDOW_SIZE,
  createMessageLogViewModel,
  type LogGroupView,
  type LogLineView,
  type MessageLogViewModel,
} from "./model";

type MessageLogRegionProps = {
  readonly state: GameState | null;
  readonly historyOpen?: boolean;
  readonly windowSize?: number;
  readonly className?: string;
};

type MessageLogFrameProps = {
  readonly model: MessageLogViewModel | null;
  readonly historyOpen?: boolean;
};

export function MessageLogRegion({
  state,
  historyOpen = false,
  windowSize = DEFAULT_LOG_WINDOW_SIZE,
  className,
}: MessageLogRegionProps) {
  const model = useMemo(
    () =>
      state === null
        ? null
        : createMessageLogViewModel(state, windowSize),
    [state, windowSize],
  );

  return (
    <section
      className={[styles.region, className].filter(Boolean).join(" ")}
      aria-label="Message log"
    >
      <MessageLogFrame model={model} historyOpen={historyOpen} />
    </section>
  );
}

export function MessageLogFrame({
  model,
  historyOpen = false,
}: MessageLogFrameProps) {
  if (model === null) {
    return (
      <div className={styles.panel}>
        <div className={styles.meta}>
          <span>Log</span>
        </div>
        <div className={styles.empty}>No events</div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.meta}>
          <span>Log</span>
          <span className={styles.metaCount}>
            {model.historyLines.length} lines
          </span>
        </div>
        <MessageLogLines
          groups={model.windowGroups}
          emptyText="No events"
        />
      </div>
      {historyOpen ? <MessageHistoryOverlay model={model} /> : null}
    </>
  );
}

export function MessageHistoryOverlay({
  model,
}: {
  readonly model: MessageLogViewModel;
}) {
  return (
    <div
      className={styles.historyOverlay}
      data-history-open="true"
      aria-label="Full message history"
    >
      <div className={styles.historyPanel} role="dialog" aria-modal="false">
        <div className={styles.historyTitle}>Full history</div>
        <MessageLogLines
          groups={model.historyGroups}
          emptyText="No events"
          history
        />
      </div>
    </div>
  );
}

function MessageLogLines({
  groups,
  emptyText,
  history = false,
}: {
  readonly groups: readonly LogGroupView[];
  readonly emptyText: string;
  readonly history?: boolean;
}) {
  if (groups.length === 0) {
    return <div className={styles.empty}>{emptyText}</div>;
  }

  return (
    <div
      className={[
        styles.lines,
        history ? styles.historyLines : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="log"
      aria-live={history ? "off" : "polite"}
      aria-relevant="additions text"
      data-selectable="plain-text"
      data-history={history ? "true" : "false"}
    >
      {groups.map((group, groupIndex) => (
        <div
          className={styles.group}
          data-turn={group.turn}
          role="group"
          aria-label={`turn ${group.turn}`}
          key={`${group.turn}:${groupIndex}`}
        >
          <ol className={styles.lineList}>
            {group.lines.map((line) => (
              <MessageLogLine
                history={history}
                line={line}
                key={line.key}
              />
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function MessageLogLine({
  line,
  history,
}: {
  readonly line: LogLineView;
  readonly history: boolean;
}) {
  return (
    <li
      className={styles.line}
      data-log-line-index={line.index}
      data-history-line-index={history ? line.index : undefined}
      data-log-line={line.text}
    >
      {line.text}
    </li>
  );
}
