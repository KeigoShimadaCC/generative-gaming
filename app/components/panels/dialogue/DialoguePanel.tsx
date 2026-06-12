import type { DialogueOption, DialogueView } from "../model";

type DialoguePanelProps = {
  readonly view: DialogueView | null;
  readonly selectedIndex: number;
  readonly lastRefusal: string | null;
  readonly onSelect: (index: number) => void;
  readonly onRun: (index: number) => void;
};

export function DialoguePanel({
  view,
  selectedIndex,
  lastRefusal,
  onSelect,
  onRun,
}: DialoguePanelProps) {
  if (view === null) {
    return (
      <div className="grid h-full place-items-center p-3 text-sm normal-case tracking-normal text-gg-muted">
        No active conversation
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-3 text-left">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded border border-gg-border bg-black/25 text-lg font-bold text-gg-text"
              aria-hidden="true"
            >
              {view.glyph}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold normal-case tracking-normal text-gg-text">
                {view.npcName}
              </h2>
              <p className="truncate text-xs normal-case tracking-normal text-gg-muted">
                {view.npcId}
              </p>
            </div>
          </div>
        </div>
        <span
          className="rounded border border-emerald-300/40 bg-emerald-300/10 px-2 py-1 text-[0.64rem] font-semibold uppercase tracking-wide text-emerald-100"
          data-world-paused={view.paused ? "true" : "false"}
        >
          Paused
        </span>
      </header>

      <div className="min-h-0 overflow-auto">
        <p className="whitespace-pre-line text-sm normal-case leading-5 tracking-normal text-gg-text">
          {view.text}
        </p>

        {view.barterOpen ? (
          <div
            className="mt-3 rounded border border-gg-border bg-black/15 p-2 text-xs normal-case tracking-normal"
            data-barter-open="true"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-gg-text">Barter</span>
              <span className="text-gg-muted" data-player-coin={view.coin}>
                coin {view.coin}
              </span>
            </div>
            <OptionGroups options={view.options} />
          </div>
        ) : null}

        <div className="mt-3 space-y-1" aria-label="Dialogue options">
          {view.options.map((option, index) => (
            <button
              className={optionClass(index === selectedIndex, option)}
              data-dialogue-option={option.kind}
              data-disabled-reason={disabledReason(option) ?? ""}
              disabled={disabledReason(option) !== null}
              key={optionKey(option)}
              type="button"
              title={disabledReason(option) ?? option.label}
              onClick={() => {
                onSelect(index);
                onRun(index);
              }}
            >
              {index + 1}. {optionLabel(option)}
              {disabledReason(option) === null ? null : (
                <span className="ml-1 text-amber-200">
                  ({disabledReason(option)})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-5 border-t border-gg-border pt-2 text-xs normal-case tracking-normal">
        {lastRefusal === null ? (
          <span className="text-gg-muted">Conversation open.</span>
        ) : (
          <span className="font-semibold text-amber-200" data-barter-refusal>
            {lastRefusal}
          </span>
        )}
      </div>
    </div>
  );
}

function OptionGroups({ options }: { readonly options: readonly DialogueOption[] }) {
  const buy = options.filter((option) => option.kind === "buy");
  const sell = options.filter((option) => option.kind === "sell");

  return (
    <div className="grid gap-2">
      <BarterList title="Buy" options={buy} />
      <BarterList title="Sell" options={sell} />
    </div>
  );
}

function BarterList({
  title,
  options,
}: {
  readonly title: string;
  readonly options: readonly DialogueOption[];
}) {
  return (
    <div>
      <div className="mb-1 font-semibold text-gg-muted">{title}</div>
      {options.length === 0 ? (
        <div className="text-gg-muted">none</div>
      ) : (
        <ul className="space-y-0.5">
          {options.map((option) => (
            <li className="flex justify-between gap-2" key={optionKey(option)}>
              <span className="truncate">{optionLabel(option)}</span>
              <span className="shrink-0 text-gg-muted">
                {option.kind === "buy" || option.kind === "sell"
                  ? (option.price ?? "-")
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const disabledReason = (option: DialogueOption): string | null =>
  option.kind === "buy" || option.kind === "sell"
    ? option.disabledReason
    : null;

const optionLabel = (option: DialogueOption): string => {
  switch (option.kind) {
    case "reply":
      return option.label;
    case "buy":
      return `Buy ${option.label} (${option.price ?? "-"})`;
    case "sell":
      return `Sell ${option.label} (${option.price ?? "-"})`;
    case "exit":
      return option.label;
  }
};

const optionKey = (option: DialogueOption): string => {
  switch (option.kind) {
    case "reply":
      return `reply:${option.id}`;
    case "buy":
      return `buy:${option.definitionId}`;
    case "sell":
      return `sell:${option.itemInstanceId}`;
    case "exit":
      return "exit";
  }
};

const optionClass = (
  selected: boolean,
  option: DialogueOption,
): string =>
  [
    "block w-full rounded border px-2 py-1.5 text-left text-xs font-semibold normal-case tracking-normal",
    selected ? "border-gg-accent bg-gg-accent/15" : "border-gg-border bg-black/15",
    disabledReason(option) === null ? "text-gg-text" : "cursor-not-allowed text-gg-muted",
  ].join(" ");
