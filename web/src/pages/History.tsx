// History: past calls. Switch between Done and Skipped, and edit notes.
import { useState } from "react";
import type { CallDTO } from "../../../shared/api";
import { api, ApiError } from "../api";
import { ErrorNote, Loading, Modal, useLoad, useToast } from "../components/ui";
import { dateLabel } from "../format";

export function History({ timezone }: { timezone: string }) {
  const { data, error, loading, reload } = useLoad(api.calls);
  const [editing, setEditing] = useState<CallDTO | null>(null);
  const [notes, setNotes] = useState("");
  const toast = useToast();

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  const calls = data ?? [];

  const save = async (call: CallDTO, change: { status?: "done" | "skipped"; notes?: string }) => {
    try {
      await api.updateCall(call.id, change);
      toast.show("Saved.");
      reload();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : "Could not save.");
    }
  };

  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone }).format(new Date(iso));

  return (
    <section aria-labelledby="history-title">
      <h1 id="history-title" className="page-title">
        History
      </h1>
      {calls.length === 0 ? (
        <div className="card empty">Your calls will show up here.</div>
      ) : (
        <ul className="list">
          {calls.map((c) => (
            <li key={c.id}>
              <div className="row between">
                <div>
                  <span className="person-name">{c.personName}</span>{" "}
                  <span className="muted small">
                    {dateLabel(c.date)}, {time(c.start)}
                  </span>
                </div>
                <span className={`badge ${c.status}`}>{c.status === "scheduled" ? "Planned" : c.status === "done" ? "Done" : "Skipped"}</span>
              </div>
              {c.notes ? <p className="small top-gap">{c.notes}</p> : null}
              <div className="row top-gap">
                {c.status !== "done" ? (
                  <button type="button" className="btn small" onClick={() => save(c, { status: "done" })}>
                    Mark done
                  </button>
                ) : null}
                {c.status !== "skipped" ? (
                  <button type="button" className="btn small" onClick={() => save(c, { status: "skipped" })}>
                    Mark skipped
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => {
                    setNotes(c.notes);
                    setEditing(c);
                  }}
                >
                  {c.notes ? "Edit notes" : "Add notes"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <Modal title={`Notes: ${editing.personName}`} onClose={() => setEditing(null)}>
          <label className="field">
            <span>What did you talk about?</span>
            <textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="row top-gap">
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                await save(editing, { notes });
                setEditing(null);
              }}
            >
              Save notes
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
      {toast.node}
    </section>
  );
}
