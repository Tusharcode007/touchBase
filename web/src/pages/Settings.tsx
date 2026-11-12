// Settings: when touchbase works, call windows, calendars, AI, and the danger zone.
import { useState } from "react";
import { settingsSchema, WEEKDAYS, type Settings as SettingsT, type Weekday } from "../../../shared/schemas";
import type { CalendarInfo } from "../../../shared/api";
import { api, ApiError } from "../api";
import { TimeRanges } from "../components/TimeRanges";
import { ErrorNote, fieldError, Loading, Modal, useLoad, useToast } from "../components/ui";
import { addDays, addMonths, allTimezones, dateLabel, todayIso, WEEKDAY_LABEL } from "../format";
import { PauseDialog } from "./Today";

const REMINDER_OPTIONS = [5, 10, 15, 30, 60, 120];

function Chips<T extends string | number>({
  options,
  isOn,
  onToggle,
  label,
  render,
}: {
  options: readonly T[];
  isOn: (o: T) => boolean;
  onToggle: (o: T) => void;
  label: string;
  render: (o: T) => string;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o)} type="button" className="chip" aria-pressed={isOn(o)} onClick={() => onToggle(o)}>
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export function SettingsForm({
  initial,
  calendars,
  aiAvailable,
  onSave,
  onPauseChanged,
}: {
  initial: SettingsT;
  calendars: CalendarInfo[] | null;
  aiAvailable: boolean;
  onSave: (s: SettingsT) => Promise<void>;
  onPauseChanged: () => void;
}) {
  const [s, setS] = useState<SettingsT>(initial);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const set = <K extends keyof SettingsT>(key: K, value: SettingsT[K]) => setS((old) => ({ ...old, [key]: value }));
  const err = (path: string) => fieldError(errors, path);

  // "Extend" counts from the later of: the current end date, or today.
  const extendFrom = () => {
    const today = todayIso(s.timezone);
    return s.activeTo > today ? s.activeTo : today;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = settingsSchema.safeParse(s);
    if (!check.success) {
      setErrors(check.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await onSave(check.data);
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {errors.length > 0 ? (
        <div className="banner danger" role="alert">
          <strong>Please fix the highlighted fields.</strong>
        </div>
      ) : null}

      <fieldset>
        <legend>When touchbase works</legend>
        <div className="stack">
          <div>
            <div className="legend">Active period</div>
            <div className="hint">touchbase only plans calls between these dates (for example, just for the summer).</div>
            <div className="two top-gap">
              <label className="field">
                <span>From</span>
                <input type="date" value={s.activeFrom} onChange={(e) => set("activeFrom", e.target.value)} />
              </label>
              <label className="field">
                <span>To</span>
                <input type="date" value={s.activeTo} aria-invalid={!!err("activeTo")} onChange={(e) => set("activeTo", e.target.value)} />
              </label>
            </div>
            {err("activeTo") ? <span className="error-text">{err("activeTo")}</span> : null}
            <div className="row top-gap">
              <button type="button" className="btn small" onClick={() => set("activeTo", addDays(extendFrom(), 7))}>
                Extend +1 week
              </button>
              <button type="button" className="btn small" onClick={() => set("activeTo", addMonths(extendFrom(), 1))}>
                Extend +1 month
              </button>
            </div>
          </div>

          <div>
            <div className="legend">Active days</div>
            <Chips<Weekday>
              label="Active days"
              options={WEEKDAYS}
              isOn={(d) => s.activeDays.includes(d)}
              onToggle={(d) =>
                set("activeDays", s.activeDays.includes(d) ? s.activeDays.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || s.activeDays.includes(x)))
              }
              render={(d) => WEEKDAY_LABEL[d] ?? d}
            />
          </div>

          <label className="field">
            <span>Morning run time</span>
            <input type="time" min="05:00" max="12:00" value={s.runTime} aria-invalid={!!err("runTime")} onChange={(e) => set("runTime", e.target.value)} />
            <span className="hint">Every morning after this time, touchbase reads your calendar and adds today's call.</span>
            {err("runTime") ? <span className="error-text">{err("runTime")}</span> : null}
          </label>

          <div className="row between">
            <div>
              <div className="legend">Pause</div>
              <div className="hint">
                {s.paused ? (s.pausedUntil ? `Paused until ${dateLabel(s.pausedUntil)}.` : "Paused until you resume.") : "Running."}
              </div>
            </div>
            {s.paused ? (
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  await api.pause({ paused: false, pausedUntil: null, removeTodayCall: false });
                  onPauseChanged();
                }}
              >
                Resume
              </button>
            ) : (
              <button type="button" className="btn small" onClick={() => setPauseOpen(true)}>
                Pause…
              </button>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Calls</legend>
        <div className="stack">
          <div>
            <div className="legend">Call length</div>
            <Chips
              label="Call length"
              options={[10, 15, 20] as const}
              isOn={(m) => s.callMinutes === m}
              onToggle={(m) => set("callMinutes", m)}
              render={(m) => `${m} min`}
            />
          </div>
          <div>
            <div className="legend">Calls per day</div>
            <Chips label="Calls per day" options={[1, 2, 3] as const} isOn={(n) => s.callsPerDay === n} onToggle={(n) => set("callsPerDay", n)} render={(n) => String(n)} />
          </div>
          <label className="field">
            <span>Gap around other events (minutes)</span>
            <input type="number" min={0} max={60} value={s.bufferMinutes} aria-invalid={!!err("bufferMinutes")} onChange={(e) => set("bufferMinutes", Number(e.target.value))} />
            {err("bufferMinutes") ? <span className="error-text">{err("bufferMinutes")}</span> : null}
          </label>
          <div>
            <div className="legend">Reminders before the call (up to 3)</div>
            <Chips
              label="Reminders"
              options={REMINDER_OPTIONS}
              isOn={(m) => s.reminderMinutes.includes(m)}
              onToggle={(m) =>
                set(
                  "reminderMinutes",
                  s.reminderMinutes.includes(m) ? s.reminderMinutes.filter((x) => x !== m) : [...s.reminderMinutes, m].sort((a, b) => b - a).slice(0, 3),
                )
              }
              render={(m) => (m >= 60 ? `${m / 60} h` : `${m} min`)}
            />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Call windows (your time)</legend>
        <p className="hint">The times you're happy to take a call. touchbase picks the first free slot inside them.</p>
        <div className="row">
          <button
            type="button"
            className="btn small"
            onClick={() => set("windows", { ...s.windows, tue: s.windows.mon, wed: s.windows.mon, thu: s.windows.mon, fri: s.windows.mon })}
          >
            Copy Monday to Tue–Fri
          </button>
        </div>
        {WEEKDAYS.map((d) => (
          <div className="day-row" key={d}>
            <strong>{WEEKDAY_LABEL[d]}</strong>
            <TimeRanges
              label={`${WEEKDAY_LABEL[d]} window`}
              value={s.windows[d]}
              onChange={(v) => set("windows", { ...s.windows, [d]: v })}
              emptyText="No calls on this day."
            />
            {err(`windows.${d}`) ? <span className="error-text">{err(`windows.${d}`)}</span> : null}
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>Calendars and timezone</legend>
        <div className="stack">
          <label className="field">
            <span>My timezone</span>
            <input list="my-tz-list" value={s.timezone} aria-invalid={!!err("timezone")} onChange={(e) => set("timezone", e.target.value)} />
            <datalist id="my-tz-list">
              {allTimezones().map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
            {err("timezone") ? <span className="error-text">{err("timezone")}</span> : null}
          </label>
          {calendars ? (
            <>
              <div>
                <div className="legend">Check these calendars for busy time</div>
                {calendars.map((c) => (
                  <label className="check" key={c.id}>
                    <input
                      type="checkbox"
                      checked={s.checkCalendarIds.includes(c.id) || (c.primary && s.checkCalendarIds.includes("primary"))}
                      onChange={(e) => {
                        const id = c.primary ? "primary" : c.id;
                        const others = s.checkCalendarIds.filter((x) => x !== id && x !== c.id);
                        set("checkCalendarIds", e.target.checked ? [...others, id] : others);
                      }}
                    />
                    {c.name}
                    {c.primary ? " (main)" : ""}
                  </label>
                ))}
                {err("checkCalendarIds") ? <span className="error-text">Pick at least one calendar.</span> : null}
              </div>
              <label className="field">
                <span>Add calls to</span>
                <select value={s.targetCalendarId} onChange={(e) => set("targetCalendarId", e.target.value)}>
                  {calendars
                    .filter((c) => c.canWrite)
                    .map((c) => (
                      <option key={c.id} value={c.primary ? "primary" : c.id}>
                        {c.name}
                        {c.primary ? " (main)" : ""}
                      </option>
                    ))}
                </select>
              </label>
            </>
          ) : (
            <p className="hint">Could not load your calendars right now. Your main calendar is used.</p>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Talking points</legend>
        <label className="check">
          <input type="checkbox" checked={s.aiEnabled} onChange={(e) => set("aiEnabled", e.target.checked)} />
          Use AI to write talking points from my notes
        </label>
        <p className="hint">
          {aiAvailable
            ? "Only the first name, the relation and your notes are sent. Never phone numbers."
            : "AI isn't set up on this server (no API key), so built-in talking points are used."}
        </p>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      {pauseOpen ? (
        <PauseDialog
          hasUpcoming
          onClose={() => setPauseOpen(false)}
          onDone={() => {
            setPauseOpen(false);
            onPauseChanged();
          }}
        />
      ) : null}
    </form>
  );
}

function DangerZone({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <fieldset className="top-gap">
      <legend>Danger zone</legend>
      <p className="hint">Removes today's upcoming call, revokes touchbase's Google access, and deletes all your data. This can't be undone.</p>
      <button type="button" className="btn danger" onClick={() => setOpen(true)}>
        Disconnect Google & delete all my data
      </button>
      {open ? (
        <Modal title="Delete everything?" onClose={() => setOpen(false)}>
          <p>Type DELETE to confirm.</p>
          <input aria-label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <div className="row top-gap">
            <button
              type="button"
              className="btn danger"
              disabled={typed !== "DELETE" || busy}
              onClick={async () => {
                setBusy(true);
                await api.deleteAccount();
                onDeleted();
              }}
            >
              Delete everything
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
    </fieldset>
  );
}

export function Settings({ aiAvailable, onSignedOut }: { aiAvailable: boolean; onSignedOut: () => void }) {
  const settings = useLoad(api.settings);
  const calendars = useLoad(api.calendars);
  const toast = useToast();

  if (settings.loading && !settings.data) return <Loading />;
  if (settings.error && !settings.data) return <ErrorNote message={settings.error} onRetry={settings.reload} />;
  if (!settings.data) return null;

  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title" className="page-title">
        Settings
      </h1>
      <SettingsForm
        // A new key rebuilds the form whenever fresh settings arrive (e.g. after pausing).
        key={JSON.stringify(settings.data)}
        initial={settings.data}
        calendars={calendars.data}
        aiAvailable={aiAvailable}
        onSave={async (s) => {
          const saved = await api.saveSettings(s);
          settings.setData(saved);
          toast.show("Settings saved.");
        }}
        onPauseChanged={() => {
          settings.reload();
          toast.show("Done.");
        }}
      />
      <DangerZone onDeleted={onSignedOut} />
      {toast.node}
    </section>
  );
}
