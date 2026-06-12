import type {
  InspectCard,
  InventoryActionView,
  InventoryEntry,
  InventoryView,
} from "../model";

type InventoryPanelProps = {
  readonly view: InventoryView;
  readonly selectedEntry: InventoryEntry | null;
  readonly selectedEntryIndex: number;
  readonly selectedActionIndex: number;
  readonly actions: readonly InventoryActionView[];
  readonly card: InspectCard | null;
  readonly throwPrompt: boolean;
  readonly onSelectEntry: (index: number) => void;
  readonly onSelectAction: (index: number) => void;
  readonly onRunAction: (index: number) => void;
};

export function InventoryPanel({
  view,
  selectedEntry,
  selectedEntryIndex,
  selectedActionIndex,
  actions,
  card,
  throwPrompt,
  onSelectEntry,
  onSelectAction,
  onRunAction,
}: InventoryPanelProps) {
  const allEntries = [...view.slots, ...view.equipment];

  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-3 text-left"
      data-testid="inventory-panel"
    >
      <div>
        <h2 className="text-sm font-semibold normal-case tracking-normal text-gg-text">
          Inventory
        </h2>
        <p className="text-xs normal-case tracking-normal text-gg-muted">
          {filledSlots(view.slots)}/16 slots
        </p>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)] gap-3">
        <div className="min-h-0 overflow-auto">
          <div className="grid grid-cols-4 gap-1" aria-label="Inventory slots">
            {view.slots.map((entry) => {
              const index = allEntries.findIndex((candidate) => candidate.id === entry.id);
              return (
                <button
                  className={slotClass(index === selectedEntryIndex, entry.empty)}
                  data-inventory-slot={entry.index}
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectEntry(index)}
                >
                  <span className="text-[0.62rem] text-gg-muted">
                    {entry.index + 1}
                  </span>
                  <span className="truncate">{entry.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 space-y-1" aria-label="Equipment slots">
            {view.equipment.map((entry) => {
              const index = allEntries.findIndex((candidate) => candidate.id === entry.id);
              return (
                <button
                  className={equipmentClass(index === selectedEntryIndex)}
                  data-equipment-slot={entry.id}
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectEntry(index)}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        </div>

        <SelectionCard card={card} selectedEntry={selectedEntry} />
      </div>

      <div className="border-t border-gg-border pt-2">
        {throwPrompt ? (
          <div
            className="rounded border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-xs font-semibold normal-case tracking-normal text-amber-100"
            data-throw-direction-prompt="true"
          >
            Throw direction
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Inventory actions">
          {actions.length === 0 ? (
            <span className="text-xs normal-case tracking-normal text-gg-muted">
              No actions.
            </span>
          ) : (
            actions.map((action, index) => (
              <button
                className={actionClass(
                  index === selectedActionIndex,
                  action.enabled,
                )}
                data-action-id={action.id}
                data-disabled-reason={action.reason ?? ""}
                disabled={!action.enabled}
                key={action.id}
                type="button"
                title={action.reason ?? action.label}
                onClick={() => {
                  onSelectAction(index);
                  onRunAction(index);
                }}
              >
                {index + 1}. {action.label}
                {action.enabled ? null : (
                  <span className="ml-1 text-amber-200">({action.reason})</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SelectionCard({
  card,
  selectedEntry,
}: {
  readonly card: InspectCard | null;
  readonly selectedEntry: InventoryEntry | null;
}) {
  if (card === null || selectedEntry?.stack === null) {
    return (
      <div className="rounded border border-gg-border p-2 text-xs normal-case tracking-normal text-gg-muted">
        Empty slot
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-auto rounded border border-gg-border p-2 text-xs normal-case tracking-normal">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="grid h-7 w-7 place-items-center rounded bg-black/25 text-base font-bold text-gg-text"
          aria-hidden="true"
        >
          {card.glyph}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-gg-text">{card.title}</h3>
          <p className="truncate text-gg-muted">{card.descriptor}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
        {card.lines.map((line) => (
          <FragmentDetail key={`${line.label}:${line.value}`} {...line} />
        ))}
      </dl>
      {card.unknown.map((line) => (
        <p className="mt-1 font-semibold text-amber-200" key={line}>
          {line}
        </p>
      ))}
    </div>
  );
}

function FragmentDetail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <>
      <dt className="text-gg-muted">{label}</dt>
      <dd className="truncate text-gg-text">{value}</dd>
    </>
  );
}

const filledSlots = (slots: readonly InventoryEntry[]): number =>
  slots.filter((slot) => !slot.empty).length;

const slotClass = (selected: boolean, empty: boolean): string =>
  [
    "grid h-14 min-w-0 grid-rows-[auto_minmax(0,1fr)] rounded border px-1.5 py-1 text-left text-[0.68rem] normal-case tracking-normal",
    selected ? "border-gg-accent bg-gg-accent/15 text-gg-text" : "border-gg-border bg-black/15 text-gg-text",
    empty ? "text-gg-muted" : "",
  ]
    .filter(Boolean)
    .join(" ");

const equipmentClass = (selected: boolean): string =>
  [
    "block w-full truncate rounded border px-2 py-1 text-left text-xs normal-case tracking-normal",
    selected ? "border-gg-accent bg-gg-accent/15 text-gg-text" : "border-gg-border bg-black/15 text-gg-text",
  ].join(" ");

const actionClass = (selected: boolean, enabled: boolean): string =>
  [
    "rounded border px-2 py-1 text-xs font-semibold normal-case tracking-normal",
    selected ? "border-gg-accent bg-gg-accent/15" : "border-gg-border bg-black/15",
    enabled ? "text-gg-text" : "cursor-not-allowed text-gg-muted",
  ].join(" ");
