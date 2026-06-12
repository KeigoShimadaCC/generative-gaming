import { formatLogEvent } from "@engine/render";
import type { GameState } from "@engine/state";

export type LogLineView = {
  readonly index: number;
  readonly turn: number;
  readonly text: string;
  readonly key: string;
};

export type LogGroupView = {
  readonly turn: number;
  readonly lines: readonly LogLineView[];
};

export type MessageLogViewModel = {
  readonly windowSize: number;
  readonly windowLines: readonly LogLineView[];
  readonly windowGroups: readonly LogGroupView[];
  readonly historyLines: readonly LogLineView[];
  readonly historyGroups: readonly LogGroupView[];
  readonly hiddenLineCount: number;
};

export const DEFAULT_LOG_WINDOW_SIZE = 6;

export const createMessageLogViewModel = (
  state: GameState,
  windowSize = DEFAULT_LOG_WINDOW_SIZE,
): MessageLogViewModel => {
  const historyLines = formattedLines(state);
  const clampedWindowSize = Math.max(1, Math.floor(windowSize));
  const windowLines = historyLines.slice(-clampedWindowSize);

  return {
    windowSize: clampedWindowSize,
    windowLines,
    windowGroups: groupConsecutiveTurns(windowLines),
    historyLines,
    historyGroups: groupConsecutiveTurns(historyLines),
    hiddenLineCount: Math.max(0, historyLines.length - windowLines.length),
  };
};

const formattedLines = (state: GameState): readonly LogLineView[] =>
  state.log.flatMap((event, index) => {
    const text = formatLogEvent(event);

    if (text.length === 0) {
      return [];
    }

    return [
      {
        index,
        turn: event.turn,
        text,
        key: `${index}:${event.turn}:${event.type}`,
      },
    ];
  });

const groupConsecutiveTurns = (
  lines: readonly LogLineView[],
): readonly LogGroupView[] => {
  const groups: LogGroupView[] = [];

  for (const line of lines) {
    const previous = groups[groups.length - 1];

    if (previous !== undefined && previous.turn === line.turn) {
      groups[groups.length - 1] = {
        ...previous,
        lines: [...previous.lines, line],
      };
      continue;
    }

    groups.push({
      turn: line.turn,
      lines: [line],
    });
  }

  return groups;
};
