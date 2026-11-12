// People: add, edit and delete the people I want to keep in touch with.
import { useState } from "react";
import type { PersonDTO } from "../../../shared/api";
import { NUDGES, personSchema, RELATIONS, type PersonInput } from "../../../shared/schemas";
import { api, ApiError } from "../api";
import { TimeRanges } from "../components/TimeRanges";
import { ErrorNote, fieldError, Loading, Modal, useLoad, useToast } from "../components/ui";
import { allTimezones, RELATION_LABEL } from "../format";

const NUDGE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", none: "No heads-up" };

export const EMPTY_PERSON: PersonInput = {
  name: "",
  relation: "parent",
  phone: "",
  everyDays: 7,
  timezone: "Asia/Kolkata",
  available: [{ start: "09:00", end: "22:00" }],
  nudge: "whatsapp",
  notes: "",
  paused: false,
  allowAi: true,
};

function toInput(p: PersonDTO): PersonInput {
  const { id: _id, prioritized: _p, ...rest } = p;
  return rest;
}

export function PersonForm({
  initial,
  aiAvailable,
  onSave,
  onCancel,
}: {
  initial: PersonInput;
  aiAvailable: boolean;
  onSave: (p: PersonInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [p, setP] = useState<PersonInput>(initial);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof PersonInput>(key: K, value: PersonInput[K]) => setP((old) => ({ ...old, [key]: value }));
  const err = (path: string) => fieldError(errors, path);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Same rules as the server, for quick feedback. The server checks again anyway.
    const check = personSchema.safeParse(p);
    if (!check.success) {
      setErrors(check.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await onSave(check.data);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setFormError(error.message);
      } else setFormError("Could not save.");
      setSaving(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {formError ? <div className="banner danger" role="alert"><strong>{formError}</strong></div> : null}
      <label className="field">
        <span>Name</span>
        <input value={p.name} maxLength={60} aria-invalid={!!err("name")} onChange={(e) => set("name", e.target.value)} placeholder="Mom" />
        {err("name") ? <span className="error-text">{err("name")}</span> : null}
      </label>
      <div className="two">
        <label className="field">
          <span>Relation</span>
          <select value={p.relation} onChange={(e) => set("relation", e.target.value as PersonInput["relation"])}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {RELATION_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Call every … days</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            value={p.everyDays}
            aria-invalid={!!err("everyDays")}
            onChange={(e) => set("everyDays", Number(e.target.value))}
          />
          {err("everyDays") ? <span className="error-text">{err("everyDays")}</span> : null}
        </label>
      </div>
      <label className="field">
        <span>Phone (with country code)</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={p.phone}
          aria-invalid={!!err("phone")}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+91 98765 43210"
        />
        {err("phone") ? <span className="error-text">{err("phone")}</span> : null}
      </label>
      <label className="field">
        <span>Heads-up message</span>
        <select value={p.nudge} onChange={(e) => set("nudge", e.target.value as PersonInput["nudge"])}>
          {NUDGES.map((n) => (
            <option key={n} value={n}>
              {NUDGE_LABEL[n]}
            </option>
          ))}
        </select>
        <span className="hint">A one-tap button that opens WhatsApp or SMS with "Free for a quick call?" ready to send from your phone.</span>
      </label>
      <label className="field">
        <span>Their timezone</span>
        <input list="tz-list" value={p.timezone} aria-invalid={!!err("timezone")} onChange={(e) => set("timezone", e.target.value)} />
        <datalist id="tz-list">
          {allTimezones().map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        {err("timezone") ? <span className="error-text">{err("timezone")}</span> : null}
      </label>
      <fieldset>
        <legend>When they are free (their time)</legend>
        <TimeRanges value={p.available} onChange={(v) => set("available", v)} label="Free time" emptyText="Any time of day." />
        {err("available") ? <span className="error-text">{err("available")}</span> : null}
      </fieldset>
      <label className="field">
        <span>Notes about them (private)</span>
        <textarea value={p.notes} maxLength={1000} onChange={(e) => set("notes", e.target.value)} placeholder="Ask about her knee. Loves gardening." />
        <span className="hint">Saved encrypted. Used for talking points.</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={p.paused} onChange={(e) => set("paused", e.target.checked)} />
        Pause calls with this person
      </label>
      <label className="check">
        <input type="checkbox" checked={p.allowAi} onChange={(e) => set("allowAi", e.target.checked)} />
        Use AI for talking points {aiAvailable ? "" : "(AI is not set up on this server)"}
      </label>
      <div className="row">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function People({ aiAvailable }: { aiAvailable: boolean }) {
  const { data, error, loading, reload } = useLoad(api.people);
  const [editing, setEditing] = useState<PersonDTO | "new" | null>(null);
  const [deleting, setDeleting] = useState<PersonDTO | null>(null);
  const toast = useToast();

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  const people = data ?? [];

  if (editing) {
    return (
      <section aria-labelledby="person-form-title">
        <h1 id="person-form-title" className="page-title">
          {editing === "new" ? "Add someone" : `Edit ${editing.name}`}
        </h1>
        <PersonForm
          initial={editing === "new" ? EMPTY_PERSON : toInput(editing)}
          aiAvailable={aiAvailable}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === "new") await api.addPerson(input);
            else await api.updatePerson(editing.id, input);
            setEditing(null);
            toast.show("Saved.");
            reload();
          }}
        />
        {toast.node}
      </section>
    );
  }

  return (
    <section aria-labelledby="people-title">
      <div className="row between page-title">
        <h1 id="people-title">People</h1>
        <button type="button" className="btn primary" onClick={() => setEditing("new")}>
          + Add someone
        </button>
      </div>
      {people.length === 0 ? (
        <div className="card empty">
          <span className="big" aria-hidden="true">
            👨‍👩‍👧
          </span>
          Add the people you want to call — parents, siblings, close friends.
        </div>
      ) : (
        <ul className="list">
          {people.map((p) => (
            <li key={p.id}>
              <div className="row between">
                <div>
                  <div className="person-name">{p.name}</div>
                  <div className="muted small">
                    {RELATION_LABEL[p.relation]} · every {p.everyDays} day{p.everyDays === 1 ? "" : "s"}
                    {p.timezone !== "Asia/Kolkata" ? ` · ${p.timezone}` : ""}
                    {p.paused ? " · paused" : ""}
                  </div>
                </div>
                <div className="row">
                  <button type="button" className="btn small" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                  <button type="button" className="btn small ghost" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting ? (
        <Modal title={`Delete ${deleting.name}?`} onClose={() => setDeleting(null)}>
          <p>They won't get any more calls. Past calls stay in your history.</p>
          <div className="row">
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await api.deletePerson(deleting.id);
                setDeleting(null);
                toast.show("Deleted.");
                reload();
              }}
            >
              Delete
            </button>
            <button type="button" className="btn ghost" onClick={() => setDeleting(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
      {toast.node}
    </section>
  );
}
