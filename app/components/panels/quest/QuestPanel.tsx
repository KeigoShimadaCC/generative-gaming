import type { QuestLogEntry } from "@engine/quests";

import type { QuestView } from "../model";

type QuestPanelProps = {
  readonly view: QuestView;
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
};

export function QuestPanel({
  view,
  selectedIndex,
  onSelect,
}: QuestPanelProps) {
  const active = view.active;
  const completed = view.completed;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-3 text-left">
      <header>
        <h2 className="text-sm font-semibold normal-case tracking-normal text-gg-text">
          Quest Log
        </h2>
        <p className="text-xs normal-case tracking-normal text-gg-muted">
          {active.length} active · {completed.length} completed
        </p>
      </header>

      <div className="min-h-0 overflow-auto">
        <QuestSection
          entries={active}
          selectedIndex={selectedIndex}
          title="Active"
          onSelect={onSelect}
        />
        <QuestSection
          entries={completed}
          offset={active.length}
          selectedIndex={selectedIndex}
          title="Completed"
          onSelect={onSelect}
        />
      </div>

      <div className="border-t border-gg-border pt-2">
        <div className="flex flex-wrap gap-1" aria-label="Quest markers">
          {view.markers.length === 0 ? (
            <span className="text-xs normal-case tracking-normal text-gg-muted">
              No on-floor markers.
            </span>
          ) : (
            view.markers.map((marker) => (
              <span
                className="rounded border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-xs font-semibold normal-case tracking-normal text-amber-100"
                data-quest-marker={marker.questId}
                data-x={marker.x}
                data-y={marker.y}
                key={marker.id}
              >
                {marker.questId} {marker.x},{marker.y}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function QuestSection({
  title,
  entries,
  selectedIndex,
  offset = 0,
  onSelect,
}: {
  readonly title: string;
  readonly entries: readonly QuestLogEntry[];
  readonly selectedIndex: number;
  readonly offset?: number;
  readonly onSelect: (index: number) => void;
}) {
  return (
    <section className="mb-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gg-muted">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="text-xs normal-case tracking-normal text-gg-muted">none</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((entry, index) => {
            const actualIndex = offset + index;
            return (
              <li key={entry.questId}>
                <button
                  className={questClass(actualIndex === selectedIndex)}
                  data-quest-id={entry.questId}
                  type="button"
                  onClick={() => onSelect(actualIndex)}
                >
                  <span className="font-semibold text-gg-text">
                    {entry.status === "completed" ? "[x]" : "[ ]"} {entry.title}
                  </span>
                  <span className="text-gg-muted">{entry.objective.hint}</span>
                  {entry.objective.where === null ? null : (
                    <span className="text-gg-muted">{entry.objective.where}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const questClass = (selected: boolean): string =>
  [
    "grid w-full gap-1 rounded border px-2 py-1.5 text-left text-xs normal-case tracking-normal",
    selected ? "border-gg-accent bg-gg-accent/15" : "border-gg-border bg-black/15",
  ].join(" ");
