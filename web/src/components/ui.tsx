// Small building blocks used across the screens.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../api";

/** Load data when the screen opens, and again when reload() is called.
 *  `load` must be a stable function (like api.today). */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false; // ignore answers that arrive after the screen closed
    load().then(
      (data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      },
      (err: unknown) => {
        if (!cancelled) setState((old) => ({ ...old, error: err instanceof ApiError ? err.message : "Something went wrong.", loading: false }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  const reload = useCallback(() => {
    setState((old) => ({ ...old, loading: true }));
    setVersion((v) => v + 1);
  }, []);
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), []);

  return { ...state, reload, setData };
}

export function Banner({ tone, title, children }: { tone: "ok" | "warn" | "info" | "danger"; title: string; children?: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role="status">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Loading() {
  return (
    <p className="muted" role="status">
      Loading…
    </p>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="banner danger" role="alert">
      <strong>{message}</strong>
      {onRetry ? (
        <p>
          <button type="button" className="btn small" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Short message at the bottom of the screen that disappears by itself. */
export function useToast() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 3000);
    return () => clearTimeout(t);
  }, [text]);
  const node = text ? (
    <div className="toast" role="status" aria-live="polite">
      {text}
    </div>
  ) : null;
  return { show: setText, node };
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function fieldError(fields: { path: string; message: string }[], path: string): string | undefined {
  return fields.find((f) => f.path === path || f.path.startsWith(`${path}.`))?.message;
}
