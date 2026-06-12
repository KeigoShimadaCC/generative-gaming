import type { InspectCard, DetailLine } from "../model";

type InspectPanelProps = {
  readonly card: InspectCard | null;
  readonly cursorActive: boolean;
  readonly source: "cursor" | "hover";
};

export function InspectPanel({
  card,
  cursorActive,
  source,
}: InspectPanelProps) {
  if (card === null) {
    return <PanelEmpty label="No game state" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded border border-gg-border bg-black/25 text-lg font-bold text-gg-text"
              aria-hidden="true"
            >
              {card.glyph}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold normal-case tracking-normal text-gg-text">
                {card.title}
              </h2>
              <p className="truncate text-xs normal-case tracking-normal text-gg-muted">
                {card.descriptor}
              </p>
            </div>
          </div>
        </div>
        <span
          className="shrink-0 rounded border border-gg-border px-2 py-1 text-[0.64rem] font-semibold uppercase tracking-wide text-gg-muted"
          data-inspect-source={source}
          data-cursor-active={cursorActive ? "true" : "false"}
        >
          {source}
        </span>
      </div>

      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs normal-case tracking-normal">
        <Detail label="Cell" value={`${card.position.x},${card.position.y}`} />
        {card.lines.map((line) => (
          <Detail key={`${line.label}:${line.value}`} {...line} />
        ))}
      </dl>

      {card.unknown.length > 0 ? (
        <div className="space-y-1 border-t border-gg-border pt-2">
          {card.unknown.map((line) => (
            <p
              className="text-xs font-semibold normal-case tracking-normal text-amber-200"
              key={line}
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto border-t border-gg-border pt-2">
        {card.witnessedFacts.length === 0 ? (
          <p className="text-xs normal-case tracking-normal text-gg-muted">
            No witnessed facts.
          </p>
        ) : (
          <ul className="space-y-1 text-xs normal-case tracking-normal text-gg-text">
            {card.witnessedFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: DetailLine) {
  return (
    <>
      <dt className="text-gg-muted">{label}</dt>
      <dd className="min-w-0 truncate text-gg-text">{value}</dd>
    </>
  );
}

function PanelEmpty({ label }: { readonly label: string }) {
  return (
    <div className="grid h-full place-items-center p-3 text-sm normal-case tracking-normal text-gg-muted">
      {label}
    </div>
  );
}
