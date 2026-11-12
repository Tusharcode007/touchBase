// Edit a list of "from – to" times, like 19:30 – 22:00. Used for call windows and
// for the other person's free hours.
import type { TimeRange } from "../../../shared/schemas";

export function TimeRanges({
  value,
  onChange,
  label,
  max = 3,
  emptyText,
}: {
  value: TimeRange[];
  onChange: (next: TimeRange[]) => void;
  label: string;
  max?: number;
  emptyText: string;
}) {
  const update = (i: number, part: keyof TimeRange, v: string) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, [part]: v } : r)));

  return (
    <div className="stack" role="group" aria-label={label}>
      {value.length === 0 ? <span className="hint">{emptyText}</span> : null}
      {value.map((r, i) => (
        <div className="range-row" key={i}>
          <input type="time" aria-label={`${label} ${i + 1} from`} value={r.start} onChange={(e) => update(i, "start", e.target.value)} />
          <span aria-hidden="true">–</span>
          <input type="time" aria-label={`${label} ${i + 1} to`} value={r.end} onChange={(e) => update(i, "end", e.target.value)} />
          <button
            type="button"
            className="btn ghost icon-btn"
            aria-label={`Remove ${label} ${i + 1}`}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      {value.length < max ? (
        <div>
          <button type="button" className="btn small" onClick={() => onChange([...value, { start: "19:00", end: "21:00" }])}>
            + Add time
          </button>
        </div>
      ) : null}
    </div>
  );
}
