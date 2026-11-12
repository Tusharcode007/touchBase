// Today: today's call(s), the status of the day, Run now, and the big Pause switch.
import { useState } from "react";
import type { TodayCallDTO, TodayResponse } from "../../../shared/api";
import { api, ApiError } from "../api";
import { Banner, ErrorNote, Loading, Modal, Switch, useLoad, useToast } from "../components/ui";
import { dateLabel, timeOf } from "../format";

function StatusBanner({ today }: { today: TodayResponse }) {
  const s = today.settings;
  if (today.lastOutcome === "reconnect-google") {
    return (
      <Banner tone="danger" title="Please sign in with Google again">
        Google stopped accepting touchbase's access. <a href="/api/auth/google">Sign in again</a> to fix it.
      </Banner>
    );
  }
  switch (today.status) {
    case "paused":
      return (
        <Banner tone="warn" title="Paused">
          {s.pausedUntil ? `touchbase starts again on ${dateLabel(s.pausedUntil)}.` : "No calls will be added until you resume."}
        </Banner>
      );
    case "before-period":
      return <Banner tone="info" title="Not started yet">touchbase starts on {dateLabel(s.activeFrom)}. You can change this in Settings.</Banner>;
    case "after-period":
      return <Banner tone="info" title="Outside your active period">It ended on {dateLabel(s.activeTo)}. Extend it in Settings to keep going.</Banner>;
    case "inactive-day":
      return <Banner tone="info" title="Not an active day">You switched today off in Settings, so no call today.</Banner>;
  }
  if (!today.ranToday) return <Banner tone="info" title="Active">Today's plan runs after {today.runTime}. Or press "Run now".</Banner>;
  if (today.lastOutcome === "no-slot" && today.calls.length === 0) {
    return <Banner tone="warn" title="No free slot today">Your calendar is full during today's call windows. See you tomorrow!</Banner>;
  }
  if (today.lastOutcome === "no-people" && today.calls.length === 0) {
    return <Banner tone="info" title="Nobody to call yet">Add people on the People tab, then press "Run now".</Banner>;
  }
  if (today.calls.length === 0) {
    return <Banner tone="info" title="No call left today">Today's call was skipped or removed. A new one comes tomorrow.</Banner>;
  }
  if (today.calls.every((c) => c.status !== "scheduled")) {
    return <Banner tone="ok" title="All done for today">Nice work staying in touch!</Banner>;
  }
  return <Banner tone="ok" title="Active">touchbase planned today. Enjoy the call!</Banner>;
}

function CallCard({ call, timezone, onChanged }: { call: TodayCallDTO; timezone: string; onChanged: (msg: string) => void }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(call.notes);
  const [busy, setBusy] = useState(false);

  const update = async (change: { status?: "done" | "skipped"; notes?: string }, msg: string) => {
    setBusy(true);
    try {
      await api.updateCall(call.id, change);
      onChanged(msg);
    } catch (err) {
      onChanged(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card call-card" aria-label={`Call ${call.personName}`}>
      <div className="row between">
        <div className="when">{timeOf(call.start, timezone)}</div>
        <span className={`badge ${call.status}`}>{call.status === "scheduled" ? "Planned" : call.status === "done" ? "Done" : "Skipped"}</span>
      </div>
      <div className="who">📞 Call {call.personName}</div>
      {call.notes ? <p className="muted small">Notes: {call.notes}</p> : null}
      <div className="call-actions">
        {call.links ? (
          <a className="btn primary" href={call.links.call}>
            Call
          </a>
        ) : null}
        {call.links?.whatsapp ? (
          <a className="btn" href={call.links.whatsapp} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        ) : call.links?.sms ? (
          <a className="btn" href={call.links.sms}>
            SMS
          </a>
        ) : null}
        <button type="button" className="btn" disabled={busy || call.status === "done"} onClick={() => update({ status: "done" }, "Marked as done. Nice!")}>
          Done
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || call.status === "skipped"}
          onClick={() => update({ status: "skipped" }, "Skipped. It's off your calendar.")}
        >
          Skipped
        </button>
      </div>
      <div className="top-gap">
        <button type="button" className="btn small" onClick={() => setNotesOpen(true)}>
          {call.notes ? "Edit notes" : "Add notes"}
        </button>
      </div>
      {notesOpen ? (
        <Modal title={`Notes for ${call.personName}`} onClose={() => setNotesOpen(false)}>
          <label className="field">
            <span>What did you talk about?</span>
            <textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
            <span className="hint">touchbase shows this before your next call with {call.personName}.</span>
          </label>
          <div className="row top-gap">
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                await update({ notes }, "Notes saved.");
                setNotesOpen(false);
              }}
            >
              Save notes
            </button>
            <button type="button" className="btn ghost" onClick={() => setNotesOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
    </article>
  );
}

export function PauseDialog({ hasUpcoming, onClose, onDone }: { hasUpcoming: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const [until, setUntil] = useState("");
  const [removeToday, setRemoveToday] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Pause touchbase?" onClose={onClose}>
      <p className="muted">No new calls will be added while paused.</p>
      <label className="field">
        <span>Start again on (optional)</span>
        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        <span className="hint">Leave empty to pause until you resume yourself.</span>
      </label>
      {hasUpcoming ? (
        <label className="check top-gap">
          <input type="checkbox" checked={removeToday} onChange={(e) => setRemoveToday(e.target.checked)} />
          Also remove today's call from my calendar
        </label>
      ) : null}
      <div className="row top-gap">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await api.pause({ paused: true, pausedUntil: until || null, removeTodayCall: hasUpcoming && removeToday });
              onDone(res.removed > 0 ? "Paused, and today's call was removed." : "Paused.");
            } catch (err) {
              onDone(err instanceof ApiError ? err.message : "Could not pause.");
            }
          }}
        >
          Pause
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function Today() {
  const { data, error, loading, reload } = useLoad(api.today);
  const toast = useToast();
  // When the pause dialog is open, remember whether today's call is still ahead of us.
  const [pauseOpen, setPauseOpen] = useState<{ hasUpcoming: boolean } | null>(null);
  const [running, setRunning] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const paused = data.status === "paused";
  const done = (msg: string) => {
    toast.show(msg);
    void reload();
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await api.runNow();
      const msg =
        r.created > 0
          ? "Added a call for today."
          : r.status !== "active"
            ? "touchbase is off today (see the banner)."
            : r.outcome === "limit-reached"
              ? "Today's calls are already planned."
              : r.outcome === "no-slot"
                ? "No free slot today."
                : r.outcome === "no-people"
                  ? "Add people first."
                  : r.outcome === "reconnect-google"
                    ? "Please sign in with Google again."
                    : "Nothing to change.";
      done(msg);
    } catch (err) {
      done(err instanceof ApiError ? err.message : "Could not run.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="today-title">
      <div className="row between page-title">
        <h1 id="today-title">Today</h1>
        <span className="muted">{dateLabel(data.date)}</span>
      </div>

      <StatusBanner today={data} />

      <div className="card pause-switch">
        <div>
          <strong>{paused ? "touchbase is paused" : "touchbase is on"}</strong>
          <div className="hint">{paused ? "Turn it on to get daily calls again." : "Turn it off to pause the daily calls."}</div>
        </div>
        <Switch
          checked={!paused}
          label="touchbase on"
          onChange={async (on) => {
            if (!on) {
              const now = Date.now();
              setPauseOpen({ hasUpcoming: data.calls.some((c) => c.status === "scheduled" && Date.parse(c.start) > now) });
              return;
            }
            try {
              await api.pause({ paused: false, pausedUntil: null, removeTodayCall: false });
              done("Welcome back! touchbase is on.");
            } catch (err) {
              done(err instanceof ApiError ? err.message : "Could not resume.");
            }
          }}
        />
      </div>

      <div className="top-gap stack">
        {data.calls.length === 0 ? (
          <div className="card empty">
            <span className="big" aria-hidden="true">
              🌙
            </span>
            No call planned for today yet.
          </div>
        ) : (
          data.calls.map((c) => <CallCard key={c.id} call={c} timezone={data.settings.timezone} onChanged={done} />)
        )}
        <button type="button" className="btn block" onClick={runNow} disabled={running}>
          {running ? "Planning…" : "Run now"}
        </button>
        <p className="hint">"Run now" plans today right away. It still follows all your rules, like calls per day.</p>
      </div>

      {pauseOpen ? (
        <PauseDialog
          hasUpcoming={pauseOpen.hasUpcoming}
          onClose={() => setPauseOpen(null)}
          onDone={(msg) => {
            setPauseOpen(null);
            done(msg);
          }}
        />
      ) : null}
      {toast.node}
    </section>
  );
}
