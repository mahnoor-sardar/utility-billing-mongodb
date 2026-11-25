import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Info, X, Loader2, Zap, Droplets, Flame } from "lucide-react";

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((type, title, msg) => {
    const id = Math.random();
    setItems((l) => [...l, { id, type, title, msg }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), type === "error" ? 7000 : 4500);
  }, []);
  const Icon = { success: CheckCircle2, error: XCircle, info: Info };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => { const I = Icon[t.type]; return (
          <div key={t.id} className={"toast " + t.type}><I size={18} />
            <div><b>{t.title}</b>{t.msg && <p>{t.msg}</p>}</div>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}><X size={14} /></button>
          </div>); })}
      </div>
    </ToastCtx.Provider>
  );
}

export const Card = ({ title, subtitle, action, children, className = "" }) => (
  <section className={"card " + className}>
    {(title || action) && <header className="card-h"><div><h3>{title}</h3>{subtitle && <p className="muted">{subtitle}</p>}</div>{action}</header>}
    {children}
  </section>
);

export const Badge = ({ status }) => <span className={"badge b-" + status}>{status}</span>;

export const Spinner = ({ label = "Loading…" }) => <div className="loading"><Loader2 className="spin" size={18} /> {label}</div>;

export const Empty = ({ icon: I = Info, title, hint }) => (
  <div className="empty"><I size={28} /><b>{title}</b>{hint && <p>{hint}</p>}</div>
);

export function Field({ label, hint, error, children }) {
  return (<label className={"field" + (error ? " has-err" : "")}><span className="lbl">{label}</span>{children}
    {error ? <span className="err-txt">{error}</span> : hint && <span className="hint">{hint}</span>}</label>);
}

export function Button({ loading, children, variant = "primary", ...p }) {
  return <button className={"btn " + variant} disabled={loading || p.disabled} {...p}>{loading && <Loader2 className="spin" size={16} />}{children}</button>;
}

export function Confirm({ open, title, children, confirmText = "Confirm", danger, onCancel, onConfirm, loading }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3><div className="dialog-body">{children}</div>
        <div className="dialog-f"><Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm} autoFocus>{confirmText}</Button></div>
      </div>
    </div>
  );
}

export const UtilIcon = ({ type, size = 16 }) => {
  const I = { electricity: Zap, water: Droplets, gas: Flame }[type] || Zap;
  return <span className={"util u-" + type}><I size={size} /></span>;
};

export const Progress = ({ value, max }) => {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return <div className="progress" aria-label={`${pct.toFixed(0)}% paid`}><div style={{ width: pct + "%" }} /></div>;
};

export function Table({ cols, rows, empty = "No records" }) {
  if (!rows?.length) return <Empty title={empty} />;
  return (<div className="tablewrap"><table>
    <thead><tr>{cols.map((c) => <th key={c.k} className={c.num ? "num" : ""}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.k} className={c.num ? "num" : ""}>{c.render ? c.render(r) : r[c.k]}</td>)}</tr>)}</tbody>
  </table></div>);
}
