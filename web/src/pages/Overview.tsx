// "Haven't called": everyone, most overdue first, with a "Prioritise next" button.
import type { OverdueBadge } from "../../../shared/api";
import { api } from "../api";
import { ErrorNote, Loading, useLoad, useToast } from "../components/ui";
import { daysAgo, RELATION_LABEL } from "../format";

const BADGE_TEXT: Record<OverdueBadge, string> = {
  "on-track": "On track",
  due: "Due",
  overdue: "Overdue",
  never: "Not yet",
};

export function Overview() {
  const { data, error, loading, reload } = useLoad(api.overview);
  const toast = useToast();

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  const rows = data ?? [];

  return (
    <section aria-labelledby="overview-title">
      <h1 id="overview-title" className="page-title">
        Haven't called
      </h1>
      <p className="muted">Most overdue first. "Overdue" means it has been 1.5× longer than you wanted.</p>
      {rows.length === 0 ? (
        <div className="card empty">Add people on the People tab first.</div>
      ) : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="row between">
                <div className="grow">
                  <div className="row">
                    <span className="person-name">{r.name}</span>
                    <span className={`badge ${r.badge}`}>{BADGE_TEXT[r.badge]}</span>
                  </div>
                  <div className="muted small">
                    {daysAgo(r.daysSince)} · wanted every {r.everyDays} day{r.everyDays === 1 ? "" : "s"} · {RELATION_LABEL[r.relation]}
                    {r.paused ? " · paused" : ""}
                  </div>
                </div>
                {r.prioritized ? (
                  <span className="badge never">Next up</span>
                ) : (
                  <button
                    type="button"
                    className="btn small"
                    disabled={r.paused}
                    onClick={async () => {
                      await api.prioritize(r.id);
                      toast.show(`${r.name} goes first in the next plan.`);
                      reload();
                    }}
                  >
                    Prioritise next
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {toast.node}
    </section>
  );
}
